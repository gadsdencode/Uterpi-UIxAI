import { db } from "./db";
import { messageEmbeddings, messages, conversations, conversationEmbeddings } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";

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
 */
export class VectorService {
  private defaultEmbeddingModel = 'text-embedding-ada-002';
  private defaultDimensions = 1536;

  /**
   * Generate embedding for text using available providers
   */
  async generateEmbedding(text: string, preferredProvider: 'lmstudio' | 'openai' = 'lmstudio'): Promise<EmbeddingResult> {
    // Clean and prepare text
    const cleanText = this.cleanTextForEmbedding(text);

    // Do not use LMStudio for embeddings. Prefer OpenAI if available; otherwise local fallback.
    try {
      if (process.env.VITE_OPENAI_API_KEY) {
        return await this.generateOpenAIEmbedding(cleanText);
      }
      throw new Error('OpenAI API key not configured');
    } catch (error) {
      console.warn('⚠️ Remote embedding attempt failed:', error);

      // Final fallback: keyless local embedding that never throws
      console.warn('⚠️ Remote embedding unavailable, using local keyless embedding fallback');
      return this.generateLocalHashEmbedding(cleanText, 384);
    }
  }

  /**
   * Generate embedding using LM Studio
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

  /**
   * Generate embedding using OpenAI
   */
  private async generateOpenAIEmbedding(text: string): Promise<EmbeddingResult> {
    const apiKey = process.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log(`🔤 Generating OpenAI embedding for text: ${text.substring(0, 100)}...`);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.defaultEmbeddingModel,
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI embedding failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Invalid embedding response from OpenAI');
    }

    const embedding = data.data[0].embedding;
    
    return {
      embedding,
      model: data.model || this.defaultEmbeddingModel,
      dimensions: embedding.length
    };
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
          AND json_array_length((me.embedding)::json) = ${dims}
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
          AND json_array_length((ce.summary_embedding)::json) = ${dims}
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
}

// Export singleton instance
export const vectorService = new VectorService();
