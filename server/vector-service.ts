import { db } from "./db";
import { isVectorizationEnabled } from "./vector-flags";
import { messageEmbeddings, messages, conversations, conversationEmbeddings, fileEmbeddings, files } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { embeddingWorkerPool, initializeWorkerPool, type EmbeddingWorkerResult } from "./services/embedding-worker-pool";

export interface SimilarMessage {
  id: number;
  content: string;
  role: string;
  conversationId: number;
  similarity: number;
  createdAt: Date;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

export interface SimilarConversation {
  id: number;
  title: string;
  summary: string;
  similarity: number;
  createdAt: Date;
}

/**
 * Vector service for generating embeddings and performing semantic search
 * Supports multiple embedding providers with LM Studio as primary choice
 * 
 * IMPORTANT: Embedding generation now runs in a separate Worker Thread pool
 * to avoid blocking the Express event loop during CPU-intensive operations.
 */
export class VectorService {
  private defaultEmbeddingModel = 'text-embedding-ada-002';
  private defaultDimensions = 1536;
  private workerPoolInitialized = false;

  /**
   * Initialize the worker pool for embedding generation
   * Called automatically on first embedding request
   */
  private async ensureWorkerPoolReady(): Promise<void> {
    if (this.workerPoolInitialized) return;
    
    try {
      await initializeWorkerPool();
      this.workerPoolInitialized = true;
      console.log('🧵 [VectorService] Worker pool ready for non-blocking embeddings');
    } catch (error) {
      console.warn('⚠️ [VectorService] Worker pool initialization failed, will use fallback:', error);
    }
  }

  /**
   * Generate embedding for text using Worker Thread pool (non-blocking)
   * Falls back to main thread hash-based embedding if worker pool unavailable
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    // Short-circuit when vectors are disabled
    if (!isVectorizationEnabled()) {
      return {
        embedding: [],
        model: 'vectors-disabled',
        dimensions: 0,
      };
    }

    // Clean and prepare text
    const cleanText = this.cleanTextForEmbedding(text);
    
    if (!cleanText) {
      return {
        embedding: [],
        model: 'empty-text',
        dimensions: 0,
      };
    }

    // PRIMARY PATH: Use Worker Thread pool for non-blocking embedding generation
    try {
      await this.ensureWorkerPoolReady();
      
      if (embeddingWorkerPool.isReady()) {
        const workerResult = await embeddingWorkerPool.generateEmbedding(cleanText);
        
        if (workerResult.success && workerResult.embedding) {
          console.log(`🧵 [VectorService] Worker embedding complete: ${workerResult.dimensions}D (${workerResult.processingTimeMs}ms)`);
          return {
            embedding: workerResult.embedding,
            model: workerResult.model || 'worker-transformers-js',
            dimensions: workerResult.dimensions || workerResult.embedding.length
          };
        }
        
        // Worker returned but with failure - use its error info
        console.warn(`⚠️ [VectorService] Worker embedding failed: ${workerResult.error}`);
      }
    } catch (error) {
      console.warn('⚠️ [VectorService] Worker pool error, falling back:', error);
    }

    // FALLBACK PATH: Main thread hash-based embedding (lightweight, non-blocking)
    console.log('🔄 [VectorService] Using main thread hash fallback');
    return this.generateLocalHashEmbedding(cleanText, 384);
  }

  /**
   * Generate embedding using Worker Thread pool with batch support
   * More efficient for multiple texts
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (!isVectorizationEnabled() || !texts.length) {
      return texts.map(() => ({
        embedding: [],
        model: 'vectors-disabled',
        dimensions: 0
      }));
    }

    await this.ensureWorkerPoolReady();

    if (embeddingWorkerPool.isReady()) {
      const cleanTexts = texts.map(t => this.cleanTextForEmbedding(t));
      const results = await embeddingWorkerPool.generateEmbeddingsBatch(cleanTexts);
      
      return results.map((r, i) => {
        if (r.success && r.embedding) {
          return {
            embedding: r.embedding,
            model: r.model || 'worker-transformers-js',
            dimensions: r.dimensions || r.embedding.length
          };
        }
        // Fallback for failed items
        return this.generateLocalHashEmbedding(cleanTexts[i], 384);
      });
    }

    // Fallback: generate sequentially on main thread
    return Promise.all(texts.map(t => this.generateEmbedding(t)));
  }

  /**
   * Get worker pool statistics for monitoring
   */
  getWorkerPoolStats() {
    return embeddingWorkerPool.getStats();
  }

  /**
   * Generate embedding using LM Studio (API-based, non-blocking I/O)
   * Reserved for future use when external embedding API is preferred
   */
  private async generateLMStudioEmbedding(text: string): Promise<EmbeddingResult> {
    const lmBase = this.getLMStudioBaseUrl();
    const targetUrl = `${lmBase}/v1/embeddings`;
    const proxyAuth = process.env.LMSTUDIO_API_KEY ? `Bearer ${process.env.LMSTUDIO_API_KEY}` : "Bearer lm-studio";

    console.log(`🔤 Generating LM Studio embedding for text: ${text.substring(0, 100)}...`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': proxyAuth
      },
      body: JSON.stringify({
        model: this.defaultEmbeddingModel,
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio embedding failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid embedding response from LM Studio');
    }

    const embedding = data.data[0].embedding;
    
    return {
      embedding,
      model: data.model || this.defaultEmbeddingModel,
      dimensions: embedding.length
    };
  }

  // NOTE: Transformers.js embedding generation has been moved to Worker Thread pool
  // See: server/workers/embedding-worker.ts
  // See: server/services/embedding-worker-pool.ts
  // This ensures CPU-intensive embedding operations don't block the Express event loop

  /**
   * Extract UTF-8 text from a file record for embedding.
   * Handles text/* directly, and decodes + extracts from common binaries like PDF/DOCX.
   */
  public async extractTextForFileRecord(file: any): Promise<string> {
    try {
      const mime = String(file.mimeType || '').toLowerCase();
      const encoding = String(file.encoding || 'utf-8').toLowerCase();
      const contentStr: string = String(file.content || '');

      // If it's already a text file stored as UTF-8, return directly
      if (!encoding || encoding === 'utf-8' || encoding === 'utf8') {
        // Some text files may be extremely large; clean before embedding
        return this.cleanTextForEmbedding(contentStr);
      }

      // Binary content expected to be base64-encoded
      const buffer = Buffer.from(contentStr, 'base64');

      // PDF
      if (mime === 'application/pdf') {
        try {
          const pdfModule = await import('pdf-parse');
          const pdfParse = (pdfModule as any).default || (pdfModule as any);
          const data = await pdfParse(buffer);
          return this.cleanTextForEmbedding(String(data.text || ''));
        } catch (e) {
          console.warn('⚠️ PDF text extraction failed:', e);
          return '';
        }
      }

      // DOCX (Word)
      if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mime.endsWith('+docx')
      ) {
        try {
          const mammothModule = await import('mammoth');
          const mammoth = (mammothModule as any).default || (mammothModule as any);
          const result = await mammoth.extractRawText({ buffer });
          return this.cleanTextForEmbedding(String(result.value || ''));
        } catch (e) {
          console.warn('⚠️ DOCX text extraction failed:', e);
          return '';
        }
      }

      // Legacy .doc is not supported by mammoth; skip gracefully
      if (mime === 'application/msword') {
        console.warn('ℹ️ Skipping legacy .doc extraction (unsupported).');
        return '';
      }

      // Fallback: unhandled binary type
      return '';
    } catch (error) {
      console.warn('⚠️ extractTextForFileRecord failed:', error);
      return '';
    }
  }

  /**
   * Generate a keyless local embedding using a hashing trick over tokens.
   * Deterministic, lightweight, and avoids external dependencies.
   */
  private generateLocalHashEmbedding(text: string, dimensions: number = 384): EmbeddingResult {
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
        hash = Math.imul(hash, 0x01000193) >>> 0; // 32-bit overflow
      }
      return hash >>> 0;
    };

    for (const token of tokens) {
      const h = fnv1a(token);
      const idx = h % dimensions;
      // Signed contribution via second bit to reduce collisions bias
      const sign = ((h >>> 1) & 1) === 1 ? 1 : -1;
      vector[idx] += sign;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < dimensions; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dimensions; i++) vector[i] = vector[i] / norm;

    return {
      embedding: vector,
      model: 'local-hash-embedding-v1',
      dimensions,
    };
  }

  /**
   * Store message embedding in database
   */
  async storeMessageEmbedding(messageId: number, embeddingResult: EmbeddingResult): Promise<void> {
    if (!isVectorizationEnabled()) {
      return; // no-op when disabled
    }
    try {
      await db.insert(messageEmbeddings).values({
        messageId,
        embedding: JSON.stringify(embeddingResult.embedding),
        embeddingModel: embeddingResult.model,
        embeddingDimensions: embeddingResult.dimensions
      });

      console.log(`✅ Stored embedding for message ${messageId} (${embeddingResult.dimensions}D, model: ${embeddingResult.model})`);
    } catch (error) {
      console.error(`❌ Failed to store embedding for message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Store conversation summary embedding
   */
  async storeConversationEmbedding(conversationId: number, summary: string, embeddingResult: EmbeddingResult): Promise<void> {
    if (!isVectorizationEnabled()) {
      return; // no-op when disabled
    }
    try {
      // Check if embedding already exists
      const existing = await db
        .select()
        .from(conversationEmbeddings)
        .where(eq(conversationEmbeddings.conversationId, conversationId))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(conversationEmbeddings)
          .set({
            summaryEmbedding: JSON.stringify(embeddingResult.embedding),
            embeddingModel: embeddingResult.model,
            embeddingDimensions: embeddingResult.dimensions,
            summary,
            updatedAt: new Date()
          })
          .where(eq(conversationEmbeddings.conversationId, conversationId));
      } else {
        // Insert new
        await db.insert(conversationEmbeddings).values({
          conversationId,
          summaryEmbedding: JSON.stringify(embeddingResult.embedding),
          embeddingModel: embeddingResult.model,
          embeddingDimensions: embeddingResult.dimensions,
          summary
        });
      }

      console.log(`✅ Stored conversation embedding for conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Failed to store conversation embedding for ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Find similar messages using cosine similarity
   */
  async findSimilarMessages(
    queryEmbedding: number[], 
    userId: number, 
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<SimilarMessage[]> {
    if (!isVectorizationEnabled()) {
      return [];
    }
    try {
      const queryEmbeddingStr = JSON.stringify(queryEmbedding);
      const dims = queryEmbedding.length;
      
      // Use raw SQL for vector similarity search
      const result = await db.execute(sql`
        SELECT 
          m.id,
          m.content,
          m.role,
          m.conversation_id,
          m.created_at,
          (1 - (me.embedding::vector <=> ${queryEmbeddingStr}::vector)) as similarity
        FROM message_embeddings me
        JOIN messages m ON me.message_id = m.id
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.user_id = ${userId}
          AND (1 - (me.embedding::vector <=> ${queryEmbeddingStr}::vector)) > ${threshold}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `);

      return result.rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        role: row.role,
        conversationId: row.conversation_id,
        similarity: parseFloat(row.similarity),
        createdAt: new Date(row.created_at)
      }));
    } catch (error) {
      console.error('❌ Error finding similar messages:', error);
      // Return empty array if similarity search fails
      return [];
    }
  }

  /**
   * Find similar conversations using summary embeddings
   */
  async findSimilarConversations(
    queryEmbedding: number[], 
    userId: number, 
    limit: number = 3,
    threshold: number = 0.7
  ): Promise<SimilarConversation[]> {
    if (!isVectorizationEnabled()) {
      return [];
    }
    try {
      const queryEmbeddingStr = JSON.stringify(queryEmbedding);
      const dims = queryEmbedding.length;
      
      const result = await db.execute(sql`
        SELECT 
          c.id,
          c.title,
          '' AS summary,
          c.created_at,
          (1 - (ce.summary_embedding::vector <=> ${queryEmbeddingStr}::vector)) as similarity
        FROM conversation_embeddings ce
        JOIN conversations c ON ce.conversation_id = c.id
        WHERE c.user_id = ${userId}
          AND c.archived_at IS NULL
          AND (1 - (ce.summary_embedding::vector <=> ${queryEmbeddingStr}::vector)) > ${threshold}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `);

      return result.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        similarity: parseFloat(row.similarity),
        createdAt: new Date(row.created_at)
      }));
    } catch (error) {
      console.error('❌ Error finding similar conversations:', error);
      return [];
    }
  }

  /**
   * Generate conversation summary from messages
   */
  async generateConversationSummary(conversationId: number): Promise<string> {
    try {
      // Get all messages in conversation
      const conversationMessages = await db
        .select({
          content: messages.content,
          role: messages.role
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.messageIndex);

      if (conversationMessages.length === 0) {
        return "Empty conversation";
      }

      // Create a summary from the conversation
      const messageTexts = conversationMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      // For now, create a simple summary. In the future, this could use AI summarization
      const summary = messageTexts.length > 500 
        ? messageTexts.substring(0, 500) + "..." 
        : messageTexts;

      return summary;
    } catch (error) {
      console.error(`❌ Error generating conversation summary for ${conversationId}:`, error);
      return "Failed to generate summary";
    }
  }

  /**
   * Clean text for embedding generation
   */
  private cleanTextForEmbedding(text: string): string {
    // Remove excessive whitespace and normalize
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000); // Limit text length for embedding
  }

  /**
   * Get LM Studio base URL (copied from routes.ts)
   */
  private getLMStudioBaseUrl(): string {
    const lmBaseRaw = process.env.LMSTUDIO_BASE_URL;
    const isProduction = process.env.NODE_ENV === "production";

    if (!lmBaseRaw) {
      return isProduction ? "https://lmstudio.uterpi.com" : "http://localhost:1234";
    }

    // Sanitize the URL
    let sanitized = lmBaseRaw.trim();
    if (sanitized.endsWith('/')) {
      sanitized = sanitized.slice(0, -1);
    }
    if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
      sanitized = isProduction ? `https://${sanitized}` : `http://${sanitized}`;
    }

    return sanitized;
  }

  /**
   * Split text into overlapping chunks for embedding
   */
  public splitTextIntoChunks(text: string, chunkSize: number = 1000, overlap: number = 200): { index: number; text: string }[] {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const chunks: { index: number; text: string }[] = [];
    let start = 0;
    let index = 0;
    while (start < clean.length) {
      const end = Math.min(start + chunkSize, clean.length);
      const chunk = clean.substring(start, end);
      chunks.push({ index, text: chunk });
      if (end === clean.length) break;
      start = Math.max(0, end - overlap);
      index++;
    }
    return chunks;
  }

  /**
   * Store embeddings for a file's textual content (chunked)
   */
  async indexFileContent(fileId: number, content: string): Promise<number> {
    if (!isVectorizationEnabled()) {
      return 0;
    }
    try {
      const chunks = this.splitTextIntoChunks(content);
      let stored = 0;
      for (const { index, text } of chunks) {
        const embeddingResult = await this.generateEmbedding(text).catch(() => null as any);
        if (!embeddingResult || !embeddingResult.embedding) continue;
        await db.insert(fileEmbeddings).values({
          fileId,
          chunkIndex: index,
          chunkText: text,
          embedding: JSON.stringify(embeddingResult.embedding),
          embeddingModel: embeddingResult.model,
          embeddingDimensions: embeddingResult.dimensions
        });
        stored++;
      }
      return stored;
    } catch (error) {
      console.error('❌ Failed to index file content:', error);
      return 0;
    }
  }

  /**
   * Remove existing embeddings for a file
   */
  async clearFileEmbeddings(fileId: number): Promise<void> {
    try {
      await db.execute(sql`DELETE FROM file_embeddings WHERE file_id = ${fileId}`);
    } catch (error) {
      console.error('❌ Failed to clear file embeddings:', error);
    }
  }

  /**
   * Find top-k relevant file chunks for a user by semantic similarity
   */
  async findRelevantFileChunks(queryEmbedding: number[], userId: number, limit: number = 8, threshold: number = 0.7): Promise<Array<{ fileId: number; chunkIndex: number; text: string; similarity: number; name: string; mimeType: string }>> {
    if (!isVectorizationEnabled()) {
      return [];
    }
    try {
      const queryEmbeddingStr = JSON.stringify(queryEmbedding);
      const result = await db.execute(sql`
        SELECT fe.file_id, fe.chunk_index, fe.chunk_text, (1 - (fe.embedding::vector <=> ${queryEmbeddingStr}::vector)) as similarity, f.name, f.mime_type
        FROM file_embeddings fe
        JOIN files f ON fe.file_id = f.id
        WHERE f.user_id = ${userId}
          AND f.status = 'active'
          AND (1 - (fe.embedding::vector <=> ${queryEmbeddingStr}::vector)) > ${threshold}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `);
      return result.rows.map((row: any) => ({
        fileId: row.file_id,
        chunkIndex: row.chunk_index,
        text: row.chunk_text,
        similarity: parseFloat(row.similarity),
        name: row.name,
        mimeType: row.mime_type
      }));
    } catch (error) {
      console.error('❌ Error finding relevant file chunks:', error);
      return [];
    }
  }

  /**
   * Find relevant file chunks restricted to a set of fileIds
   */
  async findRelevantFileChunksForFiles(
    queryEmbedding: number[],
    userId: number,
    fileIds: number[],
    limit: number = 12,
    threshold: number = 0.0
  ): Promise<Array<{ fileId: number; chunkIndex: number; text: string; similarity: number; name: string; mimeType: string }>> {
    if (!isVectorizationEnabled()) {
      return [];
    }
    try {
      const cleanIds = (fileIds || []).filter((id) => Number.isFinite(id));
      if (cleanIds.length === 0) return [];
      const queryEmbeddingStr = JSON.stringify(queryEmbedding);
      const result = await db.execute(sql`
        SELECT fe.file_id, fe.chunk_index, fe.chunk_text,
               (1 - (fe.embedding::vector <=> ${queryEmbeddingStr}::vector)) as similarity,
               f.name, f.mime_type
        FROM file_embeddings fe
        JOIN files f ON fe.file_id = f.id
        WHERE f.user_id = ${userId}
          AND f.status = 'active'
          AND fe.file_id = ANY(${cleanIds}::int[])
          AND (1 - (fe.embedding::vector <=> ${queryEmbeddingStr}::vector)) >= ${threshold}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `);
      return result.rows.map((row: any) => ({
        fileId: row.file_id,
        chunkIndex: row.chunk_index,
        text: row.chunk_text,
        similarity: parseFloat(row.similarity),
        name: row.name,
        mimeType: row.mime_type
      }));
    } catch (error) {
      console.error('❌ Error finding relevant chunks for files:', error);
      return [];
    }
  }
}

// Export singleton instance
export const vectorService = new VectorService();
