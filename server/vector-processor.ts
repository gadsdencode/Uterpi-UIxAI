import { vectorService } from "./vector-service";
import { conversationService, MessageData } from "./conversation-service";

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

/**
 * Background processor for vectorizing messages and conversation summaries
 * Handles asynchronous embedding generation to avoid blocking chat responses
 */
export class VectorProcessor {
  private messageQueue: VectorizationJob[] = [];
  private conversationQueue: ConversationSummaryJob[] = [];
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly processingIntervalMs = 5000; // Process every 5 seconds
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 30000; // 30 seconds between retries

  constructor() {
    this.startProcessing();
  }

  /**
   * Start the background processing loop
   */
  private startProcessing(): void {
    if (this.processingInterval) {
      return; // Already started
    }

    console.log('🔄 Starting vector processor background loop');
    this.processingInterval = setInterval(() => {
      this.processQueues();
    }, this.processingIntervalMs);

    // Also process immediately
    this.processQueues();
  }

  /**
   * Stop the background processing loop
   */
  public stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('⏹️ Stopped vector processor background loop');
    }
  }

  /**
   * Queue message for vectorization
   */
  async queueMessageVectorization(
    messageId: number, 
    conversationId: number, 
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<void> {
    const job: VectorizationJob = {
      id: `msg_${messageId}_${Date.now()}`,
      messageId,
      conversationId,
      priority,
      retryCount: 0,
      maxRetries: this.maxRetries,
      createdAt: new Date()
    };

    this.messageQueue.push(job);
    console.log(`📥 Queued message ${messageId} for vectorization (priority: ${priority}, queue size: ${this.messageQueue.length})`);

    // Process immediately if high priority
    if (priority === 'high' && !this.isProcessing) {
      this.processQueues();
    }
  }

  /**
   * Queue multiple messages for vectorization
   */
  async queueMultipleMessages(messageIds: number[], conversationId: number): Promise<void> {
    for (const messageId of messageIds) {
      await this.queueMessageVectorization(messageId, conversationId, 'normal');
    }
  }

  /**
   * Queue conversation summary for vectorization
   */
  async queueConversationSummary(conversationId: number, priority: 'high' | 'normal' | 'low' = 'low'): Promise<void> {
    // Check if already queued
    const existing = this.conversationQueue.find(job => job.conversationId === conversationId);
    if (existing) {
      console.log(`⏭️ Conversation ${conversationId} already queued for summary vectorization`);
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

    this.conversationQueue.push(job);
    console.log(`📥 Queued conversation ${conversationId} for summary vectorization (priority: ${priority})`);
  }

  /**
   * Process both message and conversation queues
   */
  private async processQueues(): Promise<void> {
    if (this.isProcessing) {
      return; // Already processing
    }

    this.isProcessing = true;

    try {
      // Process high priority items first
      await this.processMessageQueue('high');
      await this.processConversationQueue('high');
      
      // Then normal priority
      await this.processMessageQueue('normal');
      await this.processConversationQueue('normal');
      
      // Finally low priority
      await this.processMessageQueue('low');
      await this.processConversationQueue('low');

    } catch (error) {
      console.error('❌ Error in vector processor queue processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process message vectorization queue
   */
  private async processMessageQueue(priority: 'high' | 'normal' | 'low'): Promise<void> {
    const jobs = this.messageQueue.filter(job => 
      job.priority === priority && 
      (!job.scheduledAt || job.scheduledAt <= new Date())
    );

    if (jobs.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${jobs.length} ${priority} priority message vectorization jobs`);

    for (const job of jobs) {
      try {
        await this.processMessageVectorization(job);
        
        // Remove completed job from queue
        this.messageQueue = this.messageQueue.filter(j => j.id !== job.id);
        
      } catch (error) {
        console.error(`❌ Message vectorization failed for job ${job.id}:`, error);
        
        // Handle retry logic
        if (job.retryCount < job.maxRetries) {
          job.retryCount++;
          job.scheduledAt = new Date(Date.now() + this.retryDelayMs * job.retryCount);
          console.log(`🔄 Scheduled retry ${job.retryCount}/${job.maxRetries} for job ${job.id} at ${job.scheduledAt}`);
        } else {
          console.error(`❌ Max retries exceeded for message vectorization job ${job.id}, removing from queue`);
          this.messageQueue = this.messageQueue.filter(j => j.id !== job.id);
        }
      }

      // Small delay between jobs to avoid overwhelming the system
      await this.sleep(100);
    }
  }

  /**
   * Process conversation summary vectorization queue
   */
  private async processConversationQueue(priority: 'high' | 'normal' | 'low'): Promise<void> {
    const jobs = this.conversationQueue.filter(job => job.priority === priority);

    if (jobs.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${jobs.length} ${priority} priority conversation summary jobs`);

    for (const job of jobs) {
      try {
        await this.processConversationSummaryVectorization(job);
        
        // Remove completed job from queue
        this.conversationQueue = this.conversationQueue.filter(j => j.id !== job.id);
        
      } catch (error) {
        console.error(`❌ Conversation summary vectorization failed for job ${job.id}:`, error);
        
        // Handle retry logic
        if (job.retryCount < job.maxRetries) {
          job.retryCount++;
          console.log(`🔄 Retry ${job.retryCount}/${job.maxRetries} for conversation summary job ${job.id}`);
        } else {
          console.error(`❌ Max retries exceeded for conversation summary job ${job.id}, removing from queue`);
          this.conversationQueue = this.conversationQueue.filter(j => j.id !== job.id);
        }
      }

      // Small delay between jobs
      await this.sleep(200);
    }
  }

  /**
   * Process individual message vectorization
   */
  private async processMessageVectorization(job: VectorizationJob): Promise<void> {
    console.log(`🔤 Processing message vectorization for message ${job.messageId}`);
    
    // Get the message
    const message = await conversationService.getMessage(job.messageId);
    if (!message) {
      throw new Error(`Message ${job.messageId} not found`);
    }

    // Generate embedding
    const embeddingResult = await vectorService.generateEmbedding(message.content);
    
    // Store embedding
    await vectorService.storeMessageEmbedding(job.messageId, embeddingResult);
    
    console.log(`✅ Completed vectorization for message ${job.messageId}`);
  }

  /**
   * Process conversation summary vectorization
   */
  private async processConversationSummaryVectorization(job: ConversationSummaryJob): Promise<void> {
    console.log(`📝 Processing conversation summary vectorization for conversation ${job.conversationId}`);
    
    // Generate conversation summary
    const summary = await vectorService.generateConversationSummary(job.conversationId);
    
    // Generate embedding for summary
    const embeddingResult = await vectorService.generateEmbedding(summary);
    
    // Store conversation embedding
    await vectorService.storeConversationEmbedding(job.conversationId, summary, embeddingResult);
    
    console.log(`✅ Completed conversation summary vectorization for conversation ${job.conversationId}`);
  }

  /**
   * Get queue status for monitoring
   */
  public getQueueStatus(): {
    messageQueue: number;
    conversationQueue: number;
    isProcessing: boolean;
    totalPending: number;
  } {
    return {
      messageQueue: this.messageQueue.length,
      conversationQueue: this.conversationQueue.length,
      isProcessing: this.isProcessing,
      totalPending: this.messageQueue.length + this.conversationQueue.length
    };
  }

  /**
   * Clear all queues (for testing/maintenance)
   */
  public clearQueues(): void {
    this.messageQueue = [];
    this.conversationQueue = [];
    console.log('🧹 Cleared all vector processor queues');
  }

  /**
   * Process pending jobs immediately (manual trigger)
   */
  public async processPendingJobs(): Promise<void> {
    if (this.isProcessing) {
      console.log('⏳ Vector processor is already processing, skipping manual trigger');
      return;
    }

    console.log('🚀 Manually triggering vector processor');
    await this.processQueues();
  }

  /**
   * Utility function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down vector processor...');
    
    this.stopProcessing();
    
    // Wait for current processing to complete
    while (this.isProcessing) {
      await this.sleep(100);
    }
    
    console.log(`📊 Vector processor shutdown complete. Remaining jobs: ${this.messageQueue.length + this.conversationQueue.length}`);
  }
}

// Export singleton instance
export const vectorProcessor = new VectorProcessor();
