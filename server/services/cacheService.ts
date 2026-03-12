// Redis Cache Service
// Provides caching layer for subscription details and other frequently accessed data
// Gracefully degrades to no-cache mode if Redis is unavailable

import Redis from 'ioredis';

// Cache key prefixes for different data types
export const CACHE_KEYS = {
  SUBSCRIPTION_DETAILS: 'subscription:user:',
  SUBSCRIPTION_ACCESS: 'subscription:access:',
  USER_FEATURES: 'user:features:',
} as const;

// Default TTL values in seconds
export const CACHE_TTL = {
  SUBSCRIPTION_DETAILS: 60, // 60 seconds for subscription details
  SUBSCRIPTION_ACCESS: 30, // 30 seconds for access checks
  USER_FEATURES: 120, // 2 minutes for feature flags
} as const;

// Redis client instance
let redisClient: Redis | null = null;
let isRedisAvailable = false;
let connectionAttempted = false;

/**
 * Initialize Redis connection
 * Falls back gracefully if Redis is not available
 */
async function initializeRedis(): Promise<void> {
  if (connectionAttempted) return;
  connectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.log('[CacheService] No REDIS_URL configured, running without cache');
    isRedisAvailable = false;
    return;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 5000,
      lazyConnect: true,
      retryStrategy: (times) => {
        // Exponential backoff with max 3 seconds
        return Math.min(times * 100, 3000);
      },
    });

    // Set up event handlers
    redisClient.on('connect', () => {
      console.log('[CacheService] ✅ Redis connected');
      isRedisAvailable = true;
    });

    redisClient.on('error', (error) => {
      console.warn('[CacheService] ⚠️ Redis error:', error.message);
      isRedisAvailable = false;
    });

    redisClient.on('close', () => {
      console.log('[CacheService] Redis connection closed');
      isRedisAvailable = false;
    });

    redisClient.on('reconnecting', () => {
      console.log('[CacheService] Redis reconnecting...');
    });

    // Attempt connection
    await redisClient.connect();
    
    // Test the connection
    await redisClient.ping();
    isRedisAvailable = true;
    console.log('[CacheService] ✅ Redis cache initialized successfully');
  } catch (error) {
    console.warn('[CacheService] ⚠️ Redis unavailable, running without cache:', 
      error instanceof Error ? error.message : 'Unknown error');
    isRedisAvailable = false;
    
    // Clean up failed connection
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch {
        // Ignore cleanup errors
      }
      redisClient = null;
    }
  }
}

/**
 * Cache Service Interface
 */
export interface CacheServiceInterface {
  /** Initialize the cache service */
  initialize(): Promise<void>;
  
  /** Check if cache is available */
  isAvailable(): boolean;
  
  /** Get a value from cache */
  get<T>(key: string): Promise<T | null>;
  
  /** Set a value in cache with TTL */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean>;
  
  /** Delete a specific key */
  delete(key: string): Promise<boolean>;
  
  /** Delete all keys matching a pattern */
  deletePattern(pattern: string): Promise<number>;
  
  /** Get remaining TTL for a key */
  getTTL(key: string): Promise<number>;
  
  /** Invalidate subscription cache for a user */
  invalidateSubscription(userId: number): Promise<void>;
  
  /** Invalidate all subscription caches */
  invalidateAllSubscriptions(): Promise<void>;
}

/**
 * Redis Cache Service Implementation
 */
export const cacheService: CacheServiceInterface = {
  /**
   * Initialize the cache service
   */
  async initialize(): Promise<void> {
    await initializeRedis();
  },

  /**
   * Check if cache is currently available
   */
  isAvailable(): boolean {
    return isRedisAvailable && redisClient !== null;
  },

  /**
   * Get a value from cache
   * Returns null if key doesn't exist or cache is unavailable
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable() || !redisClient) {
      return null;
    }

    try {
      const value = await redisClient.get(key);
      if (value === null) {
        return null;
      }

      const parsed = JSON.parse(value) as T;
      console.log(`[CacheService] 📦 Cache HIT: ${key}`);
      return parsed;
    } catch (error) {
      console.warn(`[CacheService] Get error for ${key}:`, 
        error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  },

  /**
   * Set a value in cache with optional TTL
   * Default TTL is 60 seconds
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 60): Promise<boolean> {
    if (!this.isAvailable() || !redisClient) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await redisClient.setex(key, ttlSeconds, serialized);
      console.log(`[CacheService] 💾 Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      console.warn(`[CacheService] Set error for ${key}:`, 
        error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  },

  /**
   * Delete a specific key from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isAvailable() || !redisClient) {
      return false;
    }

    try {
      const result = await redisClient.del(key);
      if (result > 0) {
        console.log(`[CacheService] 🗑️ Cache DELETE: ${key}`);
      }
      return result > 0;
    } catch (error) {
      console.warn(`[CacheService] Delete error for ${key}:`, 
        error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  },

  /**
   * Delete all keys matching a pattern
   * Pattern example: "subscription:user:*"
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isAvailable() || !redisClient) {
      return 0;
    }

    try {
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await redisClient.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await redisClient.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      if (deletedCount > 0) {
        console.log(`[CacheService] 🗑️ Cache DELETE PATTERN: ${pattern} (${deletedCount} keys)`);
      }
      return deletedCount;
    } catch (error) {
      console.warn(`[CacheService] DeletePattern error for ${pattern}:`, 
        error instanceof Error ? error.message : 'Unknown error');
      return 0;
    }
  },

  /**
   * Get remaining TTL for a key in seconds
   * Returns -2 if key doesn't exist, -1 if no TTL
   */
  async getTTL(key: string): Promise<number> {
    if (!this.isAvailable() || !redisClient) {
      return -2;
    }

    try {
      return await redisClient.ttl(key);
    } catch (error) {
      console.warn(`[CacheService] TTL error for ${key}:`, 
        error instanceof Error ? error.message : 'Unknown error');
      return -2;
    }
  },

  /**
   * Invalidate all subscription-related caches for a specific user
   * Called when subscription status, credits, or tier changes
   */
  async invalidateSubscription(userId: number): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const keysToDelete = [
      `${CACHE_KEYS.SUBSCRIPTION_DETAILS}${userId}`,
      `${CACHE_KEYS.SUBSCRIPTION_ACCESS}${userId}`,
      `${CACHE_KEYS.USER_FEATURES}${userId}`,
    ];

    for (const key of keysToDelete) {
      await this.delete(key);
    }

    console.log(`[CacheService] 🔄 Invalidated subscription cache for user ${userId}`);
  },

  /**
   * Invalidate all subscription caches (e.g., after monthly reset)
   */
  async invalidateAllSubscriptions(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    await this.deletePattern(`${CACHE_KEYS.SUBSCRIPTION_DETAILS}*`);
    await this.deletePattern(`${CACHE_KEYS.SUBSCRIPTION_ACCESS}*`);
    await this.deletePattern(`${CACHE_KEYS.USER_FEATURES}*`);

    console.log('[CacheService] 🔄 Invalidated all subscription caches');
  },
};

/**
 * Helper function to get subscription cache key
 */
export function getSubscriptionCacheKey(userId: number): string {
  return `${CACHE_KEYS.SUBSCRIPTION_DETAILS}${userId}`;
}

/**
 * Helper function to get access cache key  
 */
export function getAccessCacheKey(userId: number): string {
  return `${CACHE_KEYS.SUBSCRIPTION_ACCESS}${userId}`;
}

// Auto-initialize on import (non-blocking)
initializeRedis().catch((error) => {
  console.warn('[CacheService] Auto-initialization failed:', error);
});

