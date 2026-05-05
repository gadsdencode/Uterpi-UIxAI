// server/vector-processor.ts
// Background processor for vectorizing messages and conversation summaries
// Now uses Redis/BullMQ for persistence with in-memory fallback

import { vectorService } from "./vector-service";
import { db } from "./db";
import { files } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isVectorizationEnabled } from "./vector-flags";
import { conversationService, MessageData } from "./conversation-service";

// BullMQ imports
import {
  getMessageQueue,
  getConversationQueue,
  getFileQueue,
  getPriorityValue,
  getAllQueueStatus,
  areQueuesAvailable,
  closeAllQueues,
  type MessageJobData,
  type ConversationJobData,
  type FileJobData,
  type PriorityLevel,
} from "./services/vector-queues";
import {
  startVectorWorkers,
  stopVectorWorkers,
  areWorkersRunning,
  getWorkerStats,
} from "./workers/vector-queue-worker";
import { getRedisConnection, isRedisConnectionAvailable } from "./services/redis-connection";

// ============================================================================
// LEGACY JOB INTERFACES (kept for API compatibility)
// ============================================================================

export interface VectorizationJob {
  id: string;
  messageId: number;
  conversationId: number;
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  scheduledAt?: Date;
}

export interface ConversationSummaryJob {
  id: string;
  conversationId: number;
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
}

// ============================================================================
// VECTOR PROCESSOR CLASS
// ============================================================================

/**
 * Background processor for vectorizing messages and conversation summaries
 * 
 * ARCHITECTURE:
 * - Primary: Redis/BullMQ persistent queues with dedicated workers
 * - Fallback: In-memory arrays with setInterval processing (when Redis unavailable)
 * 
 * This prevents data loss on restart and enables horizontal scaling.
 */
export class VectorProcessor {
  // In-memory fallback queues (used when Redis is unavailable)
  private fallbackMessageQueue: VectorizationJob[] = [];
  private fallbackConversationQueue: ConversationSummaryJob[] = [];
  private fallbackFileQueue: Array<{ id: string; fileId: number; userId: number; retryCount: number; maxRetries: number; createdAt: Date }> = [];
  
  // State tracking
  private isProcessingFallback = false;
  private fallbackProcessingInterval: NodeJS.Timeout | null = null;
  private readonly processingIntervalMs = 5000;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 30000;
  
  // Mode tracking
  private useRedis = false;
  private initialized = false;

  constructor() {
    // Initialization is deferred to allow async Redis setup
    if (isVectorizationEnabled()) {
      this.initialize();
    } else {
      console.log('⏸️ Vector processor disabled by feature flag');
    }
  }

  /**
   * Initialize the processor - attempt Redis connection, fallback to in-memory
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // Attempt Redis connection
      const redis = await getRedisConnection();
      
      if (redis && isRedisConnectionAvailable()) {
        // Redis available - use BullMQ
        this.useRedis = true;
        
        // Initialize queues (they'll be created on first use)
        getMessageQueue();
        getConversationQueue();
        getFileQueue();
        
        // Start workers
        await startVectorWorkers();
        
        console.log('🔄 Vector processor initialized with Redis/BullMQ');
      } else {
        // Fall back to in-memory processing
        this.useRedis = false;
        this.startFallbackProcessing();
        console.log('🔄 Vector processor initialized with in-memory fallback (Redis unavailable)');
      }
    } catch (error) {
      console.error('❌ Vector processor initialization error:', error);
      this.useRedis = false;
      this.startFallbackProcessing();
    }
  }

  /**
   * Start in-memory fallback processing loop
   */
  private startFallbackProcessing(): void {
    if (this.fallbackProcessingInterval) {
      return;
    }

    console.log('🔄 Starting fallback vector processor (in-memory)');
    this.fallbackProcessingInterval = setInterval(() => {
      this.processFallbackQueues();
    }, this.processingIntervalMs);

    // Process immediately
    this.processFallbackQueues();
  }

  /**
   * Stop fallback processing loop
   */
  private stopFallbackProcessing(): void {
    if (this.fallbackProcessingInterval) {
      clearInterval(this.fallbackProcessingInterval);
      this.fallbackProcessingInterval = null;
    }
  }

  /**
   * Queue message for vectorization
   */
  async queueMessageVectorization(
    messageId: number, 
    conversationId: number, 
    priority: PriorityLevel = 'normal'
  ): Promise<void> {
    if (!isVectorizationEnabled()) {
      return;
    }

    if (this.useRedis && areQueuesAvailable()) {
      // Use BullMQ queue
      const queue = getMessageQueue();
      if (queue) {
        const jobData: MessageJobData = { messageId, conversationId };
        await queue.add(
          `msg_${messageId}`,
          jobData,
          { priority: getPriorityValue(priority) }
        );
        console.log(`📥 [BullMQ] Queued message ${messageId} for vectorization (priority: ${priority})`);
        return;
      }
    }

    // Fallback to in-memory
    const job: VectorizationJob = {
      id: `msg_${messageId}_${Date.now()}`,
      messageId,
      conversationId,
      priority,
      retryCount: 0,
      maxRetries: this.maxRetries,
      createdAt: new Date()
    };

    this.fallbackMessageQueue.push(job);
    console.log(`📥 [Fallback] Queued message ${messageId} for vectorization (queue size: ${this.fallbackMessageQueue.length})`);

    if (priority === 'high' && !this.isProcessingFallback) {
      this.processFallbackQueues();
    }
  }

  /**
   * Queue multiple messages for vectorization
   */
  async queueMultipleMessages(messageIds: number[], conversationId: number): Promise<void> {
    if (!isVectorizationEnabled()) {
      return;
    }
    for (const messageId of messageIds) {
      await this.queueMessageVectorization(messageId, conversationId, 'normal');
    }
  }

  /**
   * Queue conversation summary for vectorization
   */
  async queueConversationSummary(conversationId: number, priority: PriorityLevel = 'low'): Promise<void> {
    if (!isVectorizationEnabled()) {
      return;
    }

    if (this.useRedis && areQueuesAvailable()) {
      // Use BullMQ queue
      const queue = getConversationQueue();
      if (queue) {
        const jobData: ConversationJobData = { conversationId };
        
        // Check for duplicate using job ID
        const existingJobs = await queue.getJobs(['waiting', 'active', 'delayed']);
        const isDuplicate = existingJobs.some(job => job.data.conversationId === conversationId);
        
        if (isDuplicate) {
          console.log(`⏭️ [BullMQ] Conversation ${conversationId} already queued`);
          return;
        }
        
        await queue.add(
          `conv_${conversationId}`,
          jobData,
          { priority: getPriorityValue(priority) }
        );
        console.log(`📥 [BullMQ] Queued conversation ${conversationId} for summary vectorization (priority: ${priority})`);
        return;
      }
    }

    // Fallback to in-memory
    const existing = this.fallbackConversationQueue.find(job => job.conversationId === conversationId);
    if (existing) {
      console.log(`⏭️ [Fallback] Conversation ${conversationId} already queued`);
      return;
    }

    const job: ConversationSummaryJob = {
      id: `conv_${conversationId}_${Date.now()}`,
      conversationId,
      priority,
      retryCount: 0,
      maxRetries: this.maxRetries,
      createdAt: new Date()
    };

    this.fallbackConversationQueue.push(job);
    console.log(`📥 [Fallback] Queued conversation ${conversationId} for summary vectorization (priority: ${priority})`);
  }

  /**
   * Queue file for vectorization (chunk embeddings)
   */
  async queueFileVectorization(fileId: number, userId: number): Promise<void> {
    if (!isVectorizationEnabled()) {
      return;
    }

    if (this.useRedis && areQueuesAvailable()) {
      // Use BullMQ queue
      const queue = getFileQueue();
      if (queue) {
        const jobData: FileJobData = { fileId, userId };
        await queue.add(
          `file_${fileId}`,
          jobData,
          { priority: getPriorityValue('normal') }
        );
        console.log(`📥 [BullMQ] Queued file ${fileId} for vectorization`);
        return;
      }
    }

    // Fallback to in-memory
    const job = { 
      id: `file_${fileId}_${Date.now()}`, 
      fileId, 
      userId, 
      retryCount: 0, 
      maxRetries: this.maxRetries, 
      createdAt: new Date() 
    };
    this.fallbackFileQueue.push(job);
    console.log(`📥 [Fallback] Queued file ${fileId} for vectorization (queue size: ${this.fallbackFileQueue.length})`);
  }

  /**
   * Get queue status for monitoring
   */
  public async getQueueStatus(): Promise<{
    messageQueue: number;
    conversationQueue: number;
    fileQueue: number;
    isProcessing: boolean;
    totalPending: number;
    mode: 'redis' | 'fallback' | 'disabled';
    redisStatus?: {
      messages: { waiting: number; active: number; failed: number };
      conversations: { waiting: number; active: number; failed: number };
      files: { waiting: number; active: number; failed: number };
    };
  }> {
    if (!isVectorizationEnabled()) {
      return {
        messageQueue: 0,
        conversationQueue: 0,
        fileQueue: 0,
        isProcessing: false,
        totalPending: 0,
        mode: 'disabled'
      };
    }

    if (this.useRedis && areQueuesAvailable()) {
      // Get BullMQ queue status
      const status = await getAllQueueStatus();
      
      return {
        messageQueue: status.messages.waiting + status.messages.active + status.messages.delayed,
        conversationQueue: status.conversations.waiting + status.conversations.active + status.conversations.delayed,
        fileQueue: status.files.waiting + status.files.active + status.files.delayed,
        isProcessing: areWorkersRunning(),
        totalPending: status.totalPending,
        mode: 'redis',
        redisStatus: {
          messages: { 
            waiting: status.messages.waiting, 
            active: status.messages.active, 
            failed: status.messages.failed 
          },
          conversations: { 
            waiting: status.conversations.waiting, 
            active: status.conversations.active, 
            failed: status.conversations.failed 
          },
          files: { 
            waiting: status.files.waiting, 
            active: status.files.active, 
            failed: status.files.failed 
          },
        }
      };
    }

    // Fallback queue status
    return {
      messageQueue: this.fallbackMessageQueue.length,
      conversationQueue: this.fallbackConversationQueue.length,
      fileQueue: this.fallbackFileQueue.length,
      isProcessing: this.isProcessingFallback,
      totalPending: this.fallbackMessageQueue.length + this.fallbackConversationQueue.length + this.fallbackFileQueue.length,
      mode: 'fallback'
    };
  }

  /**
   * Clear all queues (for testing/maintenance)
   */
  public async clearQueues(): Promise<void> {
    if (!isVectorizationEnabled()) {
      return;
    }

    if (this.useRedis && areQueuesAvailable()) {
      // Clear BullMQ queues
      const messageQueue = getMessageQueue();
      const conversationQueue = getConversationQueue();
      const fileQueue = getFileQueue();

      if (messageQueue) await messageQueue.obliterate({ force: true });
      if (conversationQueue) await conversationQueue.obliterate({ force: true });
      if (fileQueue) await fileQueue.obliterate({ force: true });

      console.log('🧹 [BullMQ] Cleared all vector processor queues');
    }

    // Also clear fallback queues
    this.fallbackMessageQueue = [];
    this.fallbackConversationQueue = [];
    this.fallbackFileQueue = [];
    console.log('🧹 Cleared all vector processor queues');
  }

  /**
   * Process pending jobs immediately (manual trigger)
   */
  public async processPendingJobs(): Promise<void> {
    if (!isVectorizationEnabled()) {
      return;
    }

    if (this.useRedis) {
      // BullMQ workers process automatically - nothing to do
      console.log('🚀 [BullMQ] Workers are processing jobs automatically');
      return;
    }

    if (this.isProcessingFallback) {
      console.log('⏳ Fallback processor is already running');
      return;
    }

    console.log('🚀 Manually triggering fallback processor');
    await this.processFallbackQueues();
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down vector processor...');

    // Stop fallback processing
    this.stopFallbackProcessing();

    // Wait for fallback processing to complete
    while (this.isProcessingFallback) {
      await this.sleep(100);
    }

    if (this.useRedis) {
      // Stop BullMQ workers
      await stopVectorWorkers();
      
      // Close queues
      await closeAllQueues();
    }

    const remainingJobs = this.fallbackMessageQueue.length + 
                          this.fallbackConversationQueue.length + 
                          this.fallbackFileQueue.length;

    console.log(`📊 Vector processor shutdown complete. Remaining fallback jobs: ${remainingJobs}`);
  }

  // ============================================================================
  // FALLBACK PROCESSING (when Redis is unavailable)
  // ============================================================================

  /**
   * Process fallback queues (in-memory)
   */
  private async processFallbackQueues(): Promise<void> {
    if (this.isProcessingFallback) {
      return;
    }

    this.isProcessingFallback = true;

    try {
      // Process by priority: high, normal, low
      for (const priority of ['high', 'normal', 'low'] as const) {
        await this.processFallbackMessageQueue(priority);
        await this.processFallbackConversationQueue(priority);
      }
      await this.processFallbackFileQueue();
    } catch (error) {
      console.error('❌ Error in fallback queue processing:', error);
    } finally {
      this.isProcessingFallback = false;
    }
  }

  private async processFallbackMessageQueue(priority: PriorityLevel): Promise<void> {
    const jobs = this.fallbackMessageQueue.filter(job => 
      job.priority === priority && 
      (!job.scheduledAt || job.scheduledAt <= new Date())
    );

    if (jobs.length === 0) return;

    for (const job of jobs) {
      try {
        await this.processMessageVectorization(job);
        this.fallbackMessageQueue = this.fallbackMessageQueue.filter(j => j.id !== job.id);
      } catch (error) {
        console.error(`❌ [Fallback] Message vectorization failed for job ${job.id}:`, error);
        
        if (job.retryCount < job.maxRetries) {
          job.retryCount++;
          job.scheduledAt = new Date(Date.now() + this.retryDelayMs * job.retryCount);
        } else {
          this.fallbackMessageQueue = this.fallbackMessageQueue.filter(j => j.id !== job.id);
        }
      }
      await this.sleep(100);
    }
  }

  private async processFallbackConversationQueue(priority: PriorityLevel): Promise<void> {
    const jobs = this.fallbackConversationQueue.filter(job => job.priority === priority);

    if (jobs.length === 0) return;

    for (const job of jobs) {
      try {
        await this.processConversationSummaryVectorization(job);
        this.fallbackConversationQueue = this.fallbackConversationQueue.filter(j => j.id !== job.id);
      } catch (error) {
        console.error(`❌ [Fallback] Conversation summary failed for job ${job.id}:`, error);
        
        if (job.retryCount < job.maxRetries) {
          job.retryCount++;
        } else {
          this.fallbackConversationQueue = this.fallbackConversationQueue.filter(j => j.id !== job.id);
        }
      }
      await this.sleep(200);
    }
  }

  private async processFallbackFileQueue(): Promise<void> {
    if (this.fallbackFileQueue.length === 0) return;

    const jobs = [...this.fallbackFileQueue];
    
    for (const job of jobs) {
      try {
        await this.processSingleFileVectorization(job.fileId, job.userId);
        this.fallbackFileQueue = this.fallbackFileQueue.filter(j => j.id !== job.id);
      } catch (error) {
        console.error(`❌ [Fallback] File vectorization failed for file ${job.fileId}:`, error);
        
        if (job.retryCount < job.maxRetries) {
          job.retryCount++;
        } else {
          this.fallbackFileQueue = this.fallbackFileQueue.filter(j => j.id !== job.id);
        }
      }
      await this.sleep(100);
    }
  }

  // ============================================================================
  // PROCESSING LOGIC (shared between BullMQ workers and fallback)
  // ============================================================================

  private async processMessageVectorization(job: VectorizationJob): Promise<void> {
    console.log(`🔤 [Fallback] Processing message vectorization for message ${job.messageId}`);
    
    const message = await conversationService.getMessage(job.messageId);
    if (!message) {
      throw new Error(`Message ${job.messageId} not found`);
    }

    const embeddingResult = await vectorService.generateEmbedding(message.content).catch((e) => {
      console.warn('⚠️ Message embedding generation failed:', e?.message || e);
      return null as any;
    });

    if (!embeddingResult || !embeddingResult.embedding) {
      return;
    }
    
    await vectorService.storeMessageEmbedding(job.messageId, embeddingResult);
    console.log(`✅ [Fallback] Completed vectorization for message ${job.messageId}`);
  }

  private async processConversationSummaryVectorization(job: ConversationSummaryJob): Promise<void> {
    console.log(`📝 [Fallback] Processing conversation summary for conversation ${job.conversationId}`);
    
    const summary = await vectorService.generateConversationSummary(job.conversationId);
    
    const embeddingResult = await vectorService.generateEmbedding(summary).catch((e) => {
      console.warn('⚠️ Summary embedding generation failed:', e?.message || e);
      return null as any;
    });

    if (!embeddingResult || !embeddingResult.embedding) {
      return;
    }
    
    await vectorService.storeConversationEmbedding(job.conversationId, summary, embeddingResult);
    console.log(`✅ [Fallback] Completed conversation summary vectorization for conversation ${job.conversationId}`);
  }

  private async processSingleFileVectorization(fileId: number, userId: number): Promise<void> {
    console.log(`📁 [Fallback] Processing file vectorization for file ${fileId}`);

    const result = await db.select().from(files).where(eq(files.id, fileId));
    const file = result[0];
    if (!file) throw new Error('File not found');
    if (!file.content) {
      console.log(`ℹ️ File ${fileId} has no content, skipping`);
      return;
    }

    let textForEmbedding = '';
    const encoding = String(file.encoding || 'utf-8').toLowerCase();

    try {
      if (encoding === 'utf-8' || encoding === 'utf8') {
        textForEmbedding = String(file.content || '');
      } else {
        textForEmbedding = await vectorService.extractTextForFileRecord(file);
      }
    } catch (e) {
      console.warn(`⚠️ Failed to extract text for file ${fileId}:`, e);
      textForEmbedding = '';
    }

    if (!textForEmbedding || !textForEmbedding.trim()) {
      console.log(`ℹ️ No extractable text for file ${fileId}. Skipping.`);
      return;
    }

    await vectorService.clearFileEmbeddings(fileId);
    const stored = await vectorService.indexFileContent(fileId, textForEmbedding);
    console.log(`✅ [Fallback] Indexed ${stored} chunks for file ${fileId}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const vectorProcessor = new VectorProcessor();
