// server/workers/vector-queue-worker.ts
// BullMQ workers for processing vector embedding jobs
// Handles message, conversation, and file vectorization in background

import { Worker, Job } from 'bullmq';
import { 
  QUEUE_NAMES, 
  MessageJobData, 
  ConversationJobData, 
  FileJobData 
} from '../services/vector-queues';
import { getRedisUrl } from '../services/redis-connection';
import { vectorService } from '../vector-service';
import { conversationService } from '../conversation-service';
import { isVectorizationEnabled } from '../vector-flags';
import { db } from '../db';
import { files } from '@shared/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// WORKER STATE
// ============================================================================

let messageWorker: Worker<MessageJobData> | null = null;
let conversationWorker: Worker<ConversationJobData> | null = null;
let fileWorker: Worker<FileJobData> | null = null;

let isWorkersRunning = false;

// ============================================================================
// JOB PROCESSORS
// ============================================================================

/**
 * Process a message vectorization job
 */
async function processMessageJob(job: Job<MessageJobData>): Promise<void> {
  const { messageId, conversationId } = job.data;
  
  if (!isVectorizationEnabled()) {
    console.log(`[VectorWorker] Vectorization disabled, skipping message ${messageId}`);
    return;
  }

  console.log(`[VectorWorker] 🔤 Processing message ${messageId} (job ${job.id}, attempt ${job.attemptsMade + 1})`);

  // Get the message
  const message = await conversationService.getMessage(messageId);
  if (!message) {
    throw new Error(`Message ${messageId} not found`);
  }

  // Generate embedding
  const embeddingResult = await vectorService.generateEmbedding(message.content);
  
  if (!embeddingResult || !embeddingResult.embedding || embeddingResult.embedding.length === 0) {
    console.warn(`[VectorWorker] ⚠️ No embedding generated for message ${messageId}, skipping`);
    return;
  }

  // Store embedding
  await vectorService.storeMessageEmbedding(messageId, embeddingResult);

  console.log(`[VectorWorker] ✅ Message ${messageId} vectorized (${embeddingResult.dimensions}D)`);
}

/**
 * Process a conversation summary vectorization job
 */
async function processConversationJob(job: Job<ConversationJobData>): Promise<void> {
  const { conversationId } = job.data;

  if (!isVectorizationEnabled()) {
    console.log(`[VectorWorker] Vectorization disabled, skipping conversation ${conversationId}`);
    return;
  }

  console.log(`[VectorWorker] 📝 Processing conversation ${conversationId} (job ${job.id}, attempt ${job.attemptsMade + 1})`);

  // Generate conversation summary
  const summary = await vectorService.generateConversationSummary(conversationId);

  // Generate embedding for summary
  const embeddingResult = await vectorService.generateEmbedding(summary);

  if (!embeddingResult || !embeddingResult.embedding || embeddingResult.embedding.length === 0) {
    console.warn(`[VectorWorker] ⚠️ No embedding generated for conversation ${conversationId}, skipping`);
    return;
  }

  // Store conversation embedding
  await vectorService.storeConversationEmbedding(conversationId, summary, embeddingResult);

  console.log(`[VectorWorker] ✅ Conversation ${conversationId} summary vectorized`);
}

/**
 * Process a file vectorization job
 */
async function processFileJob(job: Job<FileJobData>): Promise<void> {
  const { fileId, userId } = job.data;

  if (!isVectorizationEnabled()) {
    console.log(`[VectorWorker] Vectorization disabled, skipping file ${fileId}`);
    return;
  }

  console.log(`[VectorWorker] 📁 Processing file ${fileId} (job ${job.id}, attempt ${job.attemptsMade + 1})`);

  // Fetch file to ensure it belongs to user and has content
  const result = await db.select().from(files).where(eq(files.id, fileId));
  const file = result[0];

  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }

  if (!file.content) {
    console.log(`[VectorWorker] ℹ️ File ${fileId} has no content, skipping`);
    return;
  }

  // Determine text to embed based on encoding and mime type
  let textForEmbedding = '';
  const encoding = String(file.encoding || 'utf-8').toLowerCase();

  try {
    if (encoding === 'utf-8' || encoding === 'utf8') {
      // Already stored as UTF-8 text
      textForEmbedding = String(file.content || '');
    } else {
      // Binary content - attempt extraction for supported types
      textForEmbedding = await vectorService.extractTextForFileRecord(file);
    }
  } catch (e) {
    console.warn(`[VectorWorker] ⚠️ Failed to extract text for file ${fileId}:`, e);
    textForEmbedding = '';
  }

  if (!textForEmbedding || !textForEmbedding.trim()) {
    console.log(`[VectorWorker] ℹ️ No extractable text for file ${fileId}, skipping`);
    return;
  }

  // Clear previous embeddings and re-index
  await vectorService.clearFileEmbeddings(fileId);
  const storedChunks = await vectorService.indexFileContent(fileId, textForEmbedding);

  console.log(`[VectorWorker] ✅ File ${fileId} indexed with ${storedChunks} chunks`);
}

// ============================================================================
// WORKER LIFECYCLE
// ============================================================================

/**
 * Initialize and start all vector processing workers
 * Workers will process jobs from Redis queues concurrently
 */
export async function startVectorWorkers(): Promise<boolean> {
  if (isWorkersRunning) {
    console.log('[VectorWorker] Workers already running');
    return true;
  }

  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    console.log('[VectorWorker] No Redis URL configured, workers not started');
    return false;
  }

  if (!isVectorizationEnabled()) {
    console.log('[VectorWorker] Vectorization disabled, workers not started');
    return false;
  }

  try {
    const connectionConfig = { url: redisUrl };

    // Message worker - moderate concurrency for API-bound work
    messageWorker = new Worker<MessageJobData>(
      QUEUE_NAMES.MESSAGES,
      processMessageJob,
      {
        connection: connectionConfig,
        concurrency: 3,
        limiter: {
          max: 10,
          duration: 1000, // Max 10 jobs per second
        },
      }
    );

    messageWorker.on('completed', (job) => {
      console.log(`[VectorWorker] Message job ${job.id} completed`);
    });

    messageWorker.on('failed', (job, err) => {
      console.error(`[VectorWorker] Message job ${job?.id} failed:`, err.message);
    });

    // Conversation worker - lower concurrency (heavier processing)
    conversationWorker = new Worker<ConversationJobData>(
      QUEUE_NAMES.CONVERSATIONS,
      processConversationJob,
      {
        connection: connectionConfig,
        concurrency: 2,
        limiter: {
          max: 5,
          duration: 1000,
        },
      }
    );

    conversationWorker.on('completed', (job) => {
      console.log(`[VectorWorker] Conversation job ${job.id} completed`);
    });

    conversationWorker.on('failed', (job, err) => {
      console.error(`[VectorWorker] Conversation job ${job?.id} failed:`, err.message);
    });

    // File worker - low concurrency (most resource-intensive)
    fileWorker = new Worker<FileJobData>(
      QUEUE_NAMES.FILES,
      processFileJob,
      {
        connection: connectionConfig,
        concurrency: 1,
        limiter: {
          max: 2,
          duration: 1000,
        },
      }
    );

    fileWorker.on('completed', (job) => {
      console.log(`[VectorWorker] File job ${job.id} completed`);
    });

    fileWorker.on('failed', (job, err) => {
      console.error(`[VectorWorker] File job ${job?.id} failed:`, err.message);
    });

    isWorkersRunning = true;
    console.log('[VectorWorker] ✅ All vector workers started');
    console.log(`  - Message worker: concurrency=3`);
    console.log(`  - Conversation worker: concurrency=2`);
    console.log(`  - File worker: concurrency=1`);

    return true;
  } catch (error) {
    console.error('[VectorWorker] ❌ Failed to start workers:', error);
    await stopVectorWorkers();
    return false;
  }
}

/**
 * Stop all workers gracefully
 * Waits for current jobs to complete before closing
 */
export async function stopVectorWorkers(): Promise<void> {
  if (!isWorkersRunning) {
    return;
  }

  console.log('[VectorWorker] 🛑 Stopping vector workers...');

  const closePromises: Promise<void>[] = [];

  if (messageWorker) {
    closePromises.push(
      messageWorker.close().catch(e => console.warn('Error closing message worker:', e))
    );
  }

  if (conversationWorker) {
    closePromises.push(
      conversationWorker.close().catch(e => console.warn('Error closing conversation worker:', e))
    );
  }

  if (fileWorker) {
    closePromises.push(
      fileWorker.close().catch(e => console.warn('Error closing file worker:', e))
    );
  }

  await Promise.all(closePromises);

  // Reset references
  messageWorker = null;
  conversationWorker = null;
  fileWorker = null;
  isWorkersRunning = false;

  console.log('[VectorWorker] ✅ All vector workers stopped');
}

/**
 * Check if workers are currently running
 */
export function areWorkersRunning(): boolean {
  return isWorkersRunning;
}

/**
 * Get worker statistics
 */
export function getWorkerStats(): {
  isRunning: boolean;
  messageWorker: { running: boolean };
  conversationWorker: { running: boolean };
  fileWorker: { running: boolean };
} {
  return {
    isRunning: isWorkersRunning,
    messageWorker: { running: messageWorker !== null && !messageWorker.closing },
    conversationWorker: { running: conversationWorker !== null && !conversationWorker.closing },
    fileWorker: { running: fileWorker !== null && !fileWorker.closing },
  };
}
