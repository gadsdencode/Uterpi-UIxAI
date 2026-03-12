// server/services/embedding-worker-pool.ts
// Manages a pool of worker threads for non-blocking vector embedding generation
// Uses Piscina for efficient worker thread pooling

import Piscina from 'piscina';
import { cpus } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Embedding task input for worker
 */
export interface EmbeddingTask {
  text: string;
  modelId?: string;
  taskId?: string;
}

/**
 * Embedding result from worker
 */
export interface EmbeddingWorkerResult {
  success: boolean;
  embedding?: number[];
  model?: string;
  dimensions?: number;
  error?: string;
  taskId?: string;
  processingTimeMs?: number;
}

/**
 * Worker pool statistics for monitoring
 */
export interface WorkerPoolStats {
  completed: number;
  failed: number;
  queued: number;
  running: number;
  availableWorkers: number;
  totalWorkers: number;
  averageProcessingTimeMs: number;
  isRunning: boolean;
}

/**
 * EmbeddingWorkerPool - Manages worker threads for CPU-intensive embedding operations
 * 
 * Key features:
 * - Non-blocking: Embedding generation runs in separate threads
 * - Thread pooling: Reuses workers for efficiency
 * - Auto-scaling: Configurable pool size based on CPU cores
 * - Graceful shutdown: Waits for pending tasks to complete
 */
export class EmbeddingWorkerPool {
  private pool: Piscina | null = null;
  private isInitialized = false;
  private stats = {
    completed: 0,
    failed: 0,
    totalProcessingTimeMs: 0
  };

  // Configuration
  private readonly minThreads: number;
  private readonly maxThreads: number;
  private readonly idleTimeout: number;

  constructor(options: {
    minThreads?: number;
    maxThreads?: number;
    idleTimeout?: number;
  } = {}) {
    const numCPUs = cpus().length;
    
    // Default to using half the CPU cores for embedding, minimum 1, maximum 4
    // This leaves resources for the main Express thread and other operations
    this.minThreads = options.minThreads ?? 1;
    this.maxThreads = options.maxThreads ?? Math.min(Math.max(Math.floor(numCPUs / 2), 1), 4);
    this.idleTimeout = options.idleTimeout ?? 60000; // 60 seconds idle timeout

    console.log(`[EmbeddingWorkerPool] 📊 Config: min=${this.minThreads}, max=${this.maxThreads} threads (${numCPUs} CPUs available)`);
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[EmbeddingWorkerPool] Already initialized');
      return;
    }

    try {
      // Resolve worker path - in production, use compiled JS; in dev, use TS via tsx
      const workerPath = this.resolveWorkerPath();
      const isProduction = process.env.NODE_ENV === 'production';
      
      console.log(`[EmbeddingWorkerPool] 🚀 Initializing worker pool with: ${workerPath}`);

      const piscinaOptions: any = {
        filename: workerPath,
        minThreads: this.minThreads,
        maxThreads: this.maxThreads,
        idleTimeout: this.idleTimeout,
        // Resource limits per worker
        resourceLimits: {
          maxOldGenerationSizeMb: 512, // 512MB heap limit per worker
          maxYoungGenerationSizeMb: 128
        }
      };

      // In development, use tsx to run TypeScript workers
      if (!isProduction) {
        piscinaOptions.execArgv = [
          '--import', 'tsx'
        ];
      }

      this.pool = new Piscina(piscinaOptions);

      // Warm up the pool by running a simple test task
      await this.warmUp();

      this.isInitialized = true;
      console.log('[EmbeddingWorkerPool] ✅ Worker pool initialized successfully');

    } catch (error) {
      console.error('[EmbeddingWorkerPool] ❌ Failed to initialize worker pool:', error);
      throw error;
    }
  }

  /**
   * Resolve the worker file path for both development and production
   */
  private resolveWorkerPath(): string {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // In production, the code is bundled into dist/index.js
      // Worker is compiled separately to dist/workers/embedding-worker.js
      // __dirname from bundled code will be the dist/ directory
      return path.resolve(__dirname, 'workers/embedding-worker.js');
    } else {
      // In development, use tsx to run TS directly
      // __dirname is server/services/, so go up to server/ then into workers/
      // Piscina supports execArgv to use tsx
      return path.resolve(__dirname, '../workers/embedding-worker.ts');
    }
  }

  /**
   * Warm up the worker pool by loading the model in at least one worker
   */
  private async warmUp(): Promise<void> {
    if (!this.pool) return;

    console.log('[EmbeddingWorkerPool] 🔥 Warming up worker pool...');
    
    try {
      const warmUpTask: EmbeddingTask = {
        text: 'Worker warm-up initialization test.',
        taskId: 'warmup'
      };

      const result = await this.pool.run(warmUpTask, { name: 'default' });
      
      if (result?.success) {
        console.log(`[EmbeddingWorkerPool] ✅ Warm-up complete (${result.processingTimeMs}ms)`);
      } else {
        console.warn('[EmbeddingWorkerPool] ⚠️ Warm-up completed with fallback:', result?.model);
      }
    } catch (error) {
      console.warn('[EmbeddingWorkerPool] ⚠️ Warm-up failed, workers will initialize on first use:', error);
    }
  }

  /**
   * Generate embedding for text using worker pool
   * Non-blocking - returns a Promise that resolves when worker completes
   */
  async generateEmbedding(text: string, taskId?: string): Promise<EmbeddingWorkerResult> {
    if (!this.isInitialized || !this.pool) {
      // Auto-initialize if needed
      await this.initialize();
    }

    if (!this.pool) {
      return {
        success: false,
        error: 'Worker pool not available',
        taskId
      };
    }

    const task: EmbeddingTask = {
      text,
      taskId
    };

    try {
      const result = await this.pool.run(task) as EmbeddingWorkerResult;
      
      // Update stats
      if (result.success) {
        this.stats.completed++;
        this.stats.totalProcessingTimeMs += result.processingTimeMs || 0;
      } else {
        this.stats.failed++;
      }

      return result;

    } catch (error) {
      this.stats.failed++;
      console.error('[EmbeddingWorkerPool] ❌ Worker task failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown worker error',
        taskId
      };
    }
  }

  /**
   * Generate embeddings for multiple texts in parallel
   * Distributes work across available workers
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<EmbeddingWorkerResult[]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Run all embedding tasks in parallel
    const promises = texts.map((text, index) => 
      this.generateEmbedding(text, `batch-${index}`)
    );

    return Promise.all(promises);
  }

  /**
   * Get current pool statistics for monitoring
   */
  getStats(): WorkerPoolStats {
    const avgTime = this.stats.completed > 0 
      ? this.stats.totalProcessingTimeMs / this.stats.completed 
      : 0;

    // Piscina provides these properties:
    // - queueSize: number of tasks waiting in queue
    // - threads: Worker[] array of active worker threads
    // - completed: total completed tasks (lifetime)
    // - utilization: pool utilization (0-1)
    const queuedTasks = this.pool?.queueSize ?? 0;
    const activeThreads = this.pool?.threads?.length ?? 0;
    
    // Running tasks = threads that are busy (utilization-based estimate)
    const utilization = this.pool?.utilization ?? 0;
    const runningTasks = Math.round(activeThreads * utilization);

    return {
      completed: this.stats.completed,
      failed: this.stats.failed,
      queued: queuedTasks,
      running: runningTasks,
      availableWorkers: Math.max(0, activeThreads - runningTasks),
      totalWorkers: this.maxThreads,
      averageProcessingTimeMs: Math.round(avgTime),
      isRunning: this.isInitialized && this.pool !== null
    };
  }

  /**
   * Check if pool is healthy and ready
   */
  isReady(): boolean {
    return this.isInitialized && this.pool !== null;
  }

  /**
   * Graceful shutdown - waits for pending tasks to complete
   */
  async shutdown(): Promise<void> {
    if (!this.pool) {
      console.log('[EmbeddingWorkerPool] No pool to shutdown');
      return;
    }

    console.log('[EmbeddingWorkerPool] 🛑 Shutting down worker pool...');
    
    try {
      // Wait for pending tasks with timeout
      const shutdownPromise = this.pool.destroy();
      const timeoutPromise = new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error('Shutdown timeout')), 30000)
      );

      await Promise.race([shutdownPromise, timeoutPromise]);
      
      this.pool = null;
      this.isInitialized = false;
      
      console.log(`[EmbeddingWorkerPool] ✅ Shutdown complete. Stats: ${this.stats.completed} completed, ${this.stats.failed} failed`);
      
    } catch (error) {
      console.error('[EmbeddingWorkerPool] ⚠️ Shutdown error:', error);
      // Force cleanup
      this.pool = null;
      this.isInitialized = false;
    }
  }

  /**
   * Reset statistics (for testing/monitoring)
   */
  resetStats(): void {
    this.stats = {
      completed: 0,
      failed: 0,
      totalProcessingTimeMs: 0
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

// Create singleton instance with sensible defaults
export const embeddingWorkerPool = new EmbeddingWorkerPool({
  minThreads: 1,
  maxThreads: Math.min(Math.max(Math.floor(cpus().length / 2), 1), 4),
  idleTimeout: 60000
});

// Auto-initialize on import (lazy - actual init happens on first use)
// This allows the main thread to continue without blocking
let initPromise: Promise<void> | null = null;

export function initializeWorkerPool(): Promise<void> {
  if (!initPromise) {
    initPromise = embeddingWorkerPool.initialize().catch(error => {
      console.error('[EmbeddingWorkerPool] Auto-initialization failed:', error);
      initPromise = null; // Allow retry
      throw error;
    });
  }
  return initPromise;
}

// Types are already exported via interface declarations above

