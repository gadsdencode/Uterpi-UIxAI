// AI Metrics Service - Request Tracking and Analytics
// Tracks AI service usage, performance, and error rates

import type { AIServiceMetrics, EndpointStats } from "../types/ai";

/**
 * AI Metrics Service - Tracks AI request performance and statistics
 */
export class AIMetricsService {
  private metrics: AIServiceMetrics;

  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      totalResponseTime: 0,
      avgResponseTime: 0,
      endpointStats: new Map(),
      errorTypes: new Map()
    };
  }

  /**
   * Track an AI service request
   */
  trackRequest(endpoint: string, success: boolean, responseTime: number, error?: string): void {
    this.metrics.totalRequests++;
    this.metrics.totalResponseTime += responseTime;
    this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.totalRequests;
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      if (error) {
        const errorCount = this.metrics.errorTypes.get(error) || 0;
        this.metrics.errorTypes.set(error, errorCount + 1);
      }
    }
    
    // Track endpoint-specific stats
    const endpointStat = this.metrics.endpointStats.get(endpoint) || {
      requests: 0,
      successes: 0,
      failures: 0,
      avgResponseTime: 0
    };
    
    endpointStat.requests++;
    endpointStat.avgResponseTime = ((endpointStat.avgResponseTime * (endpointStat.requests - 1)) + responseTime) / endpointStat.requests;
    
    if (success) {
      endpointStat.successes++;
    } else {
      endpointStat.failures++;
    }
    
    this.metrics.endpointStats.set(endpoint, endpointStat);
    
    // Log periodic summaries
    if (this.metrics.totalRequests % 10 === 0) {
      this.logSummary();
    }
  }

  /**
   * Track a cache hit
   */
  trackCacheHit(): void {
    this.metrics.cacheHits++;
  }

  /**
   * Log a metrics summary
   */
  private logSummary(): void {
    console.log("📊 AI Service Metrics Summary:", {
      totalRequests: this.metrics.totalRequests,
      successRate: `${((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(1)}%`,
      avgResponseTime: `${this.metrics.avgResponseTime.toFixed(0)}ms`,
      cacheHitRate: `${((this.metrics.cacheHits / this.metrics.totalRequests) * 100).toFixed(1)}%`,
      topEndpoints: Array.from(this.metrics.endpointStats.entries())
        .sort(([,a], [,b]) => b.requests - a.requests)
        .slice(0, 3)
        .map(([endpoint, stats]) => `${endpoint}: ${stats.requests} reqs`)
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): AIServiceMetrics {
    return this.metrics;
  }

  /**
   * Get metrics summary for API response
   */
  getMetricsSummary(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    cacheHits: number;
    avgResponseTime: number;
    successRate: string;
    cacheHitRate: string;
    topEndpoints: Array<{ endpoint: string; stats: EndpointStats }>;
    topErrors: Array<{ error: string; count: number }>;
  } {
    const totalRequests = this.metrics.totalRequests || 1; // Avoid division by zero

    return {
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      cacheHits: this.metrics.cacheHits,
      avgResponseTime: Math.round(this.metrics.avgResponseTime),
      successRate: `${((this.metrics.successfulRequests / totalRequests) * 100).toFixed(1)}%`,
      cacheHitRate: `${((this.metrics.cacheHits / totalRequests) * 100).toFixed(1)}%`,
      topEndpoints: Array.from(this.metrics.endpointStats.entries())
        .sort(([,a], [,b]) => b.requests - a.requests)
        .slice(0, 5)
        .map(([endpoint, stats]) => ({ endpoint, stats })),
      topErrors: Array.from(this.metrics.errorTypes.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([error, count]) => ({ error, count }))
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      totalResponseTime: 0,
      avgResponseTime: 0,
      endpointStats: new Map(),
      errorTypes: new Map()
    };
  }
}

// Export singleton instance
export const aiMetricsService = new AIMetricsService();

// Export functions for backwards compatibility
export function trackAIRequest(endpoint: string, success: boolean, responseTime: number, error?: string): void {
  aiMetricsService.trackRequest(endpoint, success, responseTime, error);
}

export function trackCacheHit(): void {
  aiMetricsService.trackCacheHit();
}

