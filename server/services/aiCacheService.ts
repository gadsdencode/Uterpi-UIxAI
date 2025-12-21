// AI Cache Service - Response Caching
// Provides in-memory caching for AI responses to reduce API calls and improve latency

import type { AICacheEntry } from "../types/ai";
import { aiMetricsService } from "./aiMetricsService";

/**
 * AI Cache Service - Caches AI responses with TTL
 */
export class AICacheService {
  private cache: Map<string, AICacheEntry>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Generate cache key from prompt, model, and params
   */
  getCacheKey(prompt: string, model: string, params: any): string {
    try {
      return btoa(JSON.stringify({ 
        prompt: prompt.substring(0, 200), 
        model, 
        params 
      }));
    } catch (error) {
      // Fallback for non-ASCII characters
      return Buffer.from(JSON.stringify({ 
        prompt: prompt.substring(0, 200), 
        model, 
        params 
      })).toString('base64');
    }
  }

  /**
   * Get cached response if available and not expired
   */
  get(cacheKey: string): any | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;
    
    const now = Date.now();
    if (now > cached.timestamp + cached.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    // Track cache hit in metrics
    aiMetricsService.trackCacheHit();
    console.log("📄 Using cached AI response");
    return cached.response;
  }

  /**
   * Store response in cache with TTL
   */
  set(cacheKey: string, response: any, ttlMinutes: number = 30): void {
    const ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
    this.cache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      ttl
    });
    
    // Clean up old cache entries if cache is too large
    if (this.cache.size > this.maxSize) {
      this.cleanup();
    }
  }

  /**
   * Delete a specific cache entry
   */
  delete(cacheKey: string): boolean {
    return this.cache.delete(cacheKey);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired cache entries
   */
  cleanup(): void {
    const now = Date.now();
    this.cache.forEach((value, key) => {
      if (now > value.timestamp + value.ttl) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Check if cache has a valid entry
   */
  has(cacheKey: string): boolean {
    const cached = this.cache.get(cacheKey);
    if (!cached) return false;
    
    const now = Date.now();
    if (now > cached.timestamp + cached.ttl) {
      this.cache.delete(cacheKey);
      return false;
    }
    
    return true;
  }
}

// Export singleton instance
export const aiCacheService = new AICacheService();

// Export functions for backwards compatibility
export function getCacheKey(prompt: string, model: string, params: any): string {
  return aiCacheService.getCacheKey(prompt, model, params);
}

export function getCachedResponse(cacheKey: string): any | null {
  return aiCacheService.get(cacheKey);
}

export function setCachedResponse(cacheKey: string, response: any, ttlMinutes: number = 30): void {
  aiCacheService.set(cacheKey, response, ttlMinutes);
}

