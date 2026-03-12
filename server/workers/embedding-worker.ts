// server/workers/embedding-worker.ts
// Worker thread for CPU-intensive vector embedding generation
// Runs Transformers.js in isolation to prevent blocking the Express event loop
//
// ARCHITECTURE NOTES:
// - This worker runs in a separate thread managed by Piscina
// - Each worker has its own isolated V8 instance and heap
// - Transformers.js model is loaded once per worker and cached
// - Workers are pooled and reused for multiple embedding requests
// - This prevents CPU-intensive operations from blocking the Express event loop

/**
 * Embedding generation task input
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

// ============================================================================
// Transformers.js Pipeline (Lazy-loaded singleton per worker thread)
// ============================================================================

let extractorPromise: Promise<any> | null = null;
let modelId = 'Xenova/all-MiniLM-L6-v2';

/**
 * Initialize and cache the Transformers.js feature extraction pipeline
 */
async function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      console.log(`[EmbeddingWorker] 🚀 Loading Transformers.js model: ${modelId}`);
      const startTime = Date.now();

      const { pipeline, env } = await import('@xenova/transformers');

      // Configure environment
      if (process.env.TRANSFORMERS_CACHE_DIR) {
        // @ts-ignore - env types may not include cacheDir
        env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR;
      }
      // @ts-ignore
      env.allowLocalModels = true;
      if (process.env.TRANSFORMERS_LOCAL_DIR) {
        // @ts-ignore
        env.localModelPath = process.env.TRANSFORMERS_LOCAL_DIR;
      }

      const effectiveModelId = process.env.EMBEDDING_MODEL_ID || modelId;
      modelId = effectiveModelId;

      const extractor = await pipeline('feature-extraction', effectiveModelId);
      const loadTime = Date.now() - startTime;
      console.log(`[EmbeddingWorker] ✅ Model loaded in ${loadTime}ms`);
      
      return extractor;
    })();
  }
  return extractorPromise;
}

/**
 * Generate embedding for text using Transformers.js
 */
async function generateEmbedding(text: string): Promise<EmbeddingWorkerResult> {
  const startTime = Date.now();

  try {
    // Clean and prepare text
    const cleanText = text
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000); // Limit text length

    if (!cleanText) {
      return {
        success: false,
        error: 'Empty text after cleaning',
        processingTimeMs: Date.now() - startTime
      };
    }

    const extractor = await getExtractor();
    const output = await extractor(cleanText, { pooling: 'mean', normalize: true });

    // Extract embedding vector
    const vec: number[] = Array.isArray(output)
      ? (output as number[])
      : Array.from((output?.data as Float32Array) || []);

    if (!vec || vec.length === 0) {
      throw new Error('Empty embedding from Transformers.js');
    }

    return {
      success: true,
      embedding: vec,
      model: `transformers-js/${modelId}`,
      dimensions: vec.length,
      processingTimeMs: Date.now() - startTime
    };

  } catch (error) {
    console.error('[EmbeddingWorker] ❌ Embedding generation failed:', error);
    
    // Fallback to local hash embedding
    const fallbackResult = generateLocalHashEmbedding(text, 384);
    return {
      ...fallbackResult,
      processingTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Generate a keyless local embedding using a hashing trick
 * Fallback when Transformers.js fails
 */
function generateLocalHashEmbedding(text: string, dimensions: number = 384): EmbeddingWorkerResult {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const vector = new Array<number>(dimensions).fill(0);

  // FNV-1a hash for token hashing
  const fnv1a = (str: string): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  };

  for (const token of tokens) {
    const h = fnv1a(token);
    const idx = h % dimensions;
    const sign = ((h >>> 1) & 1) === 1 ? 1 : -1;
    vector[idx] += sign;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimensions; i++) vector[i] = vector[i] / norm;

  return {
    success: true,
    embedding: vector,
    model: 'local-hash-embedding-v1',
    dimensions
  };
}

// ============================================================================
// Piscina Worker Entry Point
// ============================================================================

/**
 * Main worker function called by Piscina
 * Receives task and returns embedding result
 */
export default async function processEmbeddingTask(task: EmbeddingTask): Promise<EmbeddingWorkerResult> {
  const { text, taskId } = task;

  if (!text || typeof text !== 'string') {
    return {
      success: false,
      error: 'Invalid task: text is required',
      taskId
    };
  }

  const result = await generateEmbedding(text);
  return {
    ...result,
    taskId
  };
}

// For direct execution/testing (ESM-compatible)
// Run with: npx tsx server/workers/embedding-worker.ts
const isDirectRun = process.argv[1]?.includes('embedding-worker');
if (isDirectRun && typeof window === 'undefined') {
  const testText = 'This is a test sentence for embedding generation.';
  generateEmbedding(testText).then(result => {
    console.log('Test result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

