// server/services/vector-queues.ts
// BullMQ queue definitions for vector processing jobs
// Provides persistent, Redis-backed queues with priority and retry support

import { Queue, QueueEvents, JobsOptions } from 'bullmq';
import { getRedisUrl, isRedisConnectionAvailable } from './redis-connection';

// ============================================================================
// QUEUE NAMES
// ============================================================================

export const QUEUE_NAMES = {
  MESSAGES: 'vector:messages',
  CONVERSATIONS: 'vector:conversations',
  FILES: 'vector:files',
} as const;

// ============================================================================
// JOB DATA INTERFACES (matching existing VectorizationJob types)
// ============================================================================

export interface MessageJobData {
  messageId: number;
  conversationId: number;
}

export interface ConversationJobData {
  conversationId: number;
}

export interface FileJobData {
  fileId: number;
  userId: number;
}

// ============================================================================
// PRIORITY MAPPING
// ============================================================================

/**
 * Priority levels for jobs (lower number = higher priority)
 * BullMQ processes lower priority numbers first
 */
export const PRIORITY = {
  HIGH: 1,
  NORMAL: 5,
  LOW: 10,
} as const;

export type PriorityLevel = 'high' | 'normal' | 'low';

export function getPriorityValue(level: PriorityLevel): number {
  switch (level) {
    case 'high': return PRIORITY.HIGH;
    case 'normal': return PRIORITY.NORMAL;
    case 'low': return PRIORITY.LOW;
    default: return PRIORITY.NORMAL;
  }
}

// ============================================================================
// DEFAULT JOB OPTIONS
// ============================================================================

/**
 * Default job options with retry and backoff configuration
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 30000, // 30 seconds initial delay
  },
  removeOnComplete: {
    count: 1000, // Keep last 1000 completed jobs for debugging
    age: 24 * 3600, // Remove completed jobs older than 24 hours
  },
  removeOnFail: {
    count: 5000, // Keep last 5000 failed jobs for investigation
    age: 7 * 24 * 3600, // Remove failed jobs older than 7 days
  },
};

// ============================================================================
// QUEUE INSTANCES (Lazy initialization)
// ============================================================================

let messageQueue: Queue<MessageJobData> | null = null;
let conversationQueue: Queue<ConversationJobData> | null = null;
let fileQueue: Queue<FileJobData> | null = null;

// Queue events for monitoring
let messageQueueEvents: QueueEvents | null = null;
let conversationQueueEvents: QueueEvents | null = null;
let fileQueueEvents: QueueEvents | null = null;

/**
 * Get the message vectorization queue
 */
export function getMessageQueue(): Queue<MessageJobData> | null {
  if (messageQueue) return messageQueue;
  
  const redisUrl = getRedisUrl();
  if (!redisUrl) return null;

  messageQueue = new Queue<MessageJobData>(QUEUE_NAMES.MESSAGES, {
    connection: { url: redisUrl },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  console.log(`[VectorQueues] ✅ Message queue initialized: ${QUEUE_NAMES.MESSAGES}`);
  return messageQueue;
}

/**
 * Get the conversation summary queue
 */
export function getConversationQueue(): Queue<ConversationJobData> | null {
  if (conversationQueue) return conversationQueue;
  
  const redisUrl = getRedisUrl();
  if (!redisUrl) return null;

  conversationQueue = new Queue<ConversationJobData>(QUEUE_NAMES.CONVERSATIONS, {
    connection: { url: redisUrl },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  console.log(`[VectorQueues] ✅ Conversation queue initialized: ${QUEUE_NAMES.CONVERSATIONS}`);
  return conversationQueue;
}

/**
 * Get the file vectorization queue
 */
export function getFileQueue(): Queue<FileJobData> | null {
  if (fileQueue) return fileQueue;
  
  const redisUrl = getRedisUrl();
  if (!redisUrl) return null;

  fileQueue = new Queue<FileJobData>(QUEUE_NAMES.FILES, {
    connection: { url: redisUrl },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  console.log(`[VectorQueues] ✅ File queue initialized: ${QUEUE_NAMES.FILES}`);
  return fileQueue;
}

// ============================================================================
// QUEUE STATUS
// ============================================================================

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

/**
 * Get job counts for a specific queue
 */
async function getQueueCounts(queue: Queue | null): Promise<QueueCounts> {
  if (!queue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  }

  try {
    const counts = await queue.getJobCounts();
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  } catch (error) {
    console.warn('[VectorQueues] Failed to get queue counts:', error);
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  }
}

/**
 * Get status of all vector queues
 */
export async function getAllQueueStatus(): Promise<{
  isRedisAvailable: boolean;
  messages: QueueCounts;
  conversations: QueueCounts;
  files: QueueCounts;
  totalPending: number;
}> {
  const [messages, conversations, files] = await Promise.all([
    getQueueCounts(messageQueue),
    getQueueCounts(conversationQueue),
    getQueueCounts(fileQueue),
  ]);

  const totalPending = 
    messages.waiting + messages.active + messages.delayed +
    conversations.waiting + conversations.active + conversations.delayed +
    files.waiting + files.active + files.delayed;

  return {
    isRedisAvailable: isRedisConnectionAvailable(),
    messages,
    conversations,
    files,
    totalPending,
  };
}

// ============================================================================
// QUEUE EVENTS (Optional monitoring)
// ============================================================================

/**
 * Initialize queue events for monitoring completed/failed jobs
 */
export function initializeQueueEvents(): void {
  const redisUrl = getRedisUrl();
  if (!redisUrl) return;

  try {
    messageQueueEvents = new QueueEvents(QUEUE_NAMES.MESSAGES, {
      connection: { url: redisUrl },
    });

    messageQueueEvents.on('completed', ({ jobId }) => {
      console.log(`[VectorQueues] ✅ Message job ${jobId} completed`);
    });

    messageQueueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`[VectorQueues] ❌ Message job ${jobId} failed: ${failedReason}`);
    });

    conversationQueueEvents = new QueueEvents(QUEUE_NAMES.CONVERSATIONS, {
      connection: { url: redisUrl },
    });

    fileQueueEvents = new QueueEvents(QUEUE_NAMES.FILES, {
      connection: { url: redisUrl },
    });

    console.log('[VectorQueues] ✅ Queue events initialized for monitoring');
  } catch (error) {
    console.warn('[VectorQueues] Failed to initialize queue events:', error);
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Close all queue connections gracefully
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (messageQueue) {
    closePromises.push(messageQueue.close().catch(e => console.warn('Error closing message queue:', e)));
  }
  if (conversationQueue) {
    closePromises.push(conversationQueue.close().catch(e => console.warn('Error closing conversation queue:', e)));
  }
  if (fileQueue) {
    closePromises.push(fileQueue.close().catch(e => console.warn('Error closing file queue:', e)));
  }
  if (messageQueueEvents) {
    closePromises.push(messageQueueEvents.close().catch(e => console.warn('Error closing message queue events:', e)));
  }
  if (conversationQueueEvents) {
    closePromises.push(conversationQueueEvents.close().catch(e => console.warn('Error closing conversation queue events:', e)));
  }
  if (fileQueueEvents) {
    closePromises.push(fileQueueEvents.close().catch(e => console.warn('Error closing file queue events:', e)));
  }

  await Promise.all(closePromises);

  // Reset references
  messageQueue = null;
  conversationQueue = null;
  fileQueue = null;
  messageQueueEvents = null;
  conversationQueueEvents = null;
  fileQueueEvents = null;

  console.log('[VectorQueues] 🧹 All queues closed');
}

/**
 * Check if queues are available (Redis connected and queues initialized)
 */
export function areQueuesAvailable(): boolean {
  return messageQueue !== null && conversationQueue !== null && fileQueue !== null;
}
