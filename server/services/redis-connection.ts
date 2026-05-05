// server/services/redis-connection.ts
// Shared Redis connection factory for BullMQ queues and workers
// Reuses REDIS_URL environment variable, gracefully degrades when unavailable

import Redis, { type RedisOptions } from 'ioredis';

// Connection state tracking
let sharedConnection: Redis | null = null;
let isRedisAvailable = false;
let connectionAttempted = false;

/**
 * Redis connection options optimized for BullMQ
 * See: https://docs.bullmq.io/guide/connections
 */
const REDIS_OPTIONS: Partial<RedisOptions> = {
  // BullMQ requires maxRetriesPerRequest: null for workers
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  connectTimeout: 10000,
  retryStrategy: (times: number) => {
    // Exponential backoff with max 10 seconds
    const delay = Math.min(times * 500, 10000);
    console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
};

/**
 * Get or create the shared Redis connection for BullMQ
 * Returns null if Redis is not configured or unavailable
 */
export async function getRedisConnection(): Promise<Redis | null> {
  if (connectionAttempted && sharedConnection) {
    return sharedConnection;
  }

  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.log('[Redis] No REDIS_URL configured, BullMQ queues will use in-memory fallback');
    connectionAttempted = true;
    isRedisAvailable = false;
    return null;
  }

  if (connectionAttempted && !isRedisAvailable) {
    // Already tried and failed, don't retry immediately
    return null;
  }

  connectionAttempted = true;

  try {
    sharedConnection = new Redis(redisUrl, REDIS_OPTIONS);

    // Set up event handlers
    sharedConnection.on('connect', () => {
      console.log('[Redis] ✅ Connected to Redis for BullMQ');
      isRedisAvailable = true;
    });

    sharedConnection.on('error', (error) => {
      console.warn('[Redis] ⚠️ Redis error:', error.message);
      isRedisAvailable = false;
    });

    sharedConnection.on('close', () => {
      console.log('[Redis] Connection closed');
      isRedisAvailable = false;
    });

    sharedConnection.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    // Test the connection
    await sharedConnection.ping();
    isRedisAvailable = true;
    console.log('[Redis] ✅ Redis connection ready for BullMQ queues');
    
    return sharedConnection;
  } catch (error) {
    console.warn('[Redis] ⚠️ Failed to connect to Redis:', 
      error instanceof Error ? error.message : 'Unknown error');
    isRedisAvailable = false;
    
    // Clean up failed connection
    if (sharedConnection) {
      try {
        await sharedConnection.quit();
      } catch {
        // Ignore cleanup errors
      }
      sharedConnection = null;
    }
    
    return null;
  }
}

/**
 * Create a new Redis connection for BullMQ workers
 * Workers need their own connections due to blocking operations
 * Returns null if Redis is not configured
 */
export function createWorkerConnection(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    return null;
  }

  const connection = new Redis(redisUrl, REDIS_OPTIONS);
  
  connection.on('error', (error) => {
    console.warn('[Redis Worker] ⚠️ Connection error:', error.message);
  });

  return connection;
}

/**
 * Check if Redis is currently available
 */
export function isRedisConnectionAvailable(): boolean {
  return isRedisAvailable && sharedConnection !== null;
}

/**
 * Get the Redis URL (for BullMQ Queue/Worker constructors that accept URL directly)
 */
export function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL;
}

/**
 * Gracefully close the shared Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    try {
      await sharedConnection.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      console.warn('[Redis] Error closing connection:', error);
    }
    sharedConnection = null;
    isRedisAvailable = false;
  }
}

/**
 * Reset connection state (for testing or manual reconnection)
 */
export function resetConnectionState(): void {
  connectionAttempted = false;
  isRedisAvailable = false;
}
