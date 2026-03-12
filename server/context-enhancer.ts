import { vectorService, SimilarMessage, SimilarConversation } from "./vector-service";
import { isVectorizationEnabled } from "./vector-flags";
import { conversationService } from "./conversation-service";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: string[];
  metadata?: any;
}

export interface EnhancedContext {
  similarMessages: SimilarMessage[];
  similarConversations: SimilarConversation[];
  contextualSystemMessage: string;
  enhancedMessages: ChatMessage[];
  fileSnippets: Array<{ fileId: number; fileName: string; mimeType: string; similarity: number; snippet: string }>
}

export interface ContextEnhancementOptions {
  maxSimilarMessages: number;
  maxSimilarConversations: number;
  similarityThreshold: number;
  includeConversationContext: boolean;
  includeMessageContext: boolean;
  maxContextLength: number;
}

/**
 * Service for enhancing chat messages with contextual information from past conversations
 * Provides AI with relevant conversation history for more coherent and personalized responses
 */
export class ContextEnhancer {
  private defaultOptions: ContextEnhancementOptions = {
    maxSimilarMessages: 3,
    maxSimilarConversations: 2,
    similarityThreshold: 0.75,
    includeConversationContext: true,
    includeMessageContext: true,
    maxContextLength: 2000
  };

  /**
   * Enhance messages with contextual information from past conversations
   */
  /**
   * Enhance messages with context from similar messages, conversations, and file chunks
   * @param projectId - Optional project ID to scope the context search
   */
  async enhanceMessagesWithContext(
    messages: ChatMessage[], 
    userId: number,
    options: Partial<ContextEnhancementOptions> = {},
    projectId?: number | null
  ): Promise<EnhancedContext> {
    const opts = { ...this.defaultOptions, ...options };
    
    // Early exit: return basic context when vectors are disabled
    if (!isVectorizationEnabled()) {
      return this.createBasicContext(messages);
    }

    try {
      // Get the current user message (last message in conversation)
      const currentUserMessage = this.findLastUserMessage(messages);
      if (!currentUserMessage) {
        console.log('⚠️ No user message found for context enhancement');
        return this.createBasicContext(messages);
      }

      console.log(`🔍 Enhancing context for user ${userId} with message: "${currentUserMessage.content.substring(0, 100)}..."`);

      // Generate embedding for current message (never throw; service has internal fallback)
      const embeddingResult = await vectorService.generateEmbedding(currentUserMessage.content).catch((e) => {
        console.warn('⚠️ Embedding generation failed, proceeding with basic context. Reason:', e?.message || e);
        return null as any;
      });
      if (!embeddingResult || !embeddingResult.embedding) {
        return this.createBasicContext(messages);
      }
      
      // Find similar content with attached file priority
      const attachedIds: number[] | undefined = Array.isArray((currentUserMessage as any)?.metadata?.attachedFileIds)
        ? (currentUserMessage as any).metadata.attachedFileIds
        : undefined;

      // Find relevant file chunks, scoped by projectId if provided
      let relevantFileChunks = [] as Array<{ fileId: number; chunkIndex: number; text: string; similarity: number; name: string; mimeType: string }>;
      if (attachedIds && attachedIds.length > 0) {
        // Prioritize chunks from attached files (no similarity threshold to surface most relevant portions)
        const attachedChunks = await vectorService.findRelevantFileChunksForFiles(
          embeddingResult.embedding,
          userId,
          attachedIds,
          12,
          0.0,
          projectId
        );
        relevantFileChunks = attachedChunks;

        // Supplement with general relevant chunks (also scoped by projectId)
        const supplemental = await vectorService.findRelevantFileChunks(embeddingResult.embedding, userId, 8, 0.7, projectId);
        const seen = new Set(attachedChunks.map(c => `${c.fileId}:${c.chunkIndex}`));
        for (const c of supplemental) {
          const key = `${c.fileId}:${c.chunkIndex}`;
          if (!seen.has(key)) relevantFileChunks.push(c);
        }
      } else {
        relevantFileChunks = await vectorService.findRelevantFileChunks(embeddingResult.embedding, userId, 8, 0.7, projectId);
      }

      // Find similar messages and conversations in parallel, scoped by projectId if provided
      const [similarMessages, similarConversations] = await Promise.all([
        opts.includeMessageContext 
          ? vectorService.findSimilarMessages(embeddingResult.embedding, userId, opts.maxSimilarMessages, opts.similarityThreshold, projectId)
          : Promise.resolve([]),
        opts.includeConversationContext 
          ? vectorService.findSimilarConversations(embeddingResult.embedding, userId, opts.maxSimilarConversations, opts.similarityThreshold, projectId)
          : Promise.resolve([])
      ]);

      console.log(`📊 Found ${similarMessages.length} similar messages and ${similarConversations.length} similar conversations`);

      // Create enhanced system message
      const contextualSystemMessage = await this.createContextualSystemMessage(
        similarMessages, 
        similarConversations, 
        opts.maxContextLength,
        (relevantFileChunks || []).map(fc => ({
          fileId: fc.fileId,
          fileName: fc.name,
          mimeType: fc.mimeType,
          similarity: fc.similarity,
          snippet: (fc.text || '').substring(0, 400)
        }))
      );

      // Create enhanced message list
      const enhancedMessages = this.createEnhancedMessages(messages, contextualSystemMessage);

      return {
        similarMessages,
        similarConversations,
        contextualSystemMessage,
        enhancedMessages,
        fileSnippets: (relevantFileChunks || []).map(fc => ({
          fileId: fc.fileId,
          fileName: fc.name,
          mimeType: fc.mimeType,
          similarity: fc.similarity,
          snippet: (fc.text || '').substring(0, 400)
        }))
      };

    } catch (error) {
      console.error('❌ Error enhancing messages with context:', error);
      // Return basic context if enhancement fails
      return this.createBasicContext(messages);
    }
  }

  /**
   * Create contextual system message with relevant past conversations
   * 
   * IMPORTANT: This content is placed STRICTLY in the system role message, NOT in user messages.
   * This prevents context headers like "--- RELEVANT PAST CONVERSATIONS ---" from appearing
   * in the visible chat UI. The separation between system instructions and user conversation
   * is critical for preventing context leaks.
   */
  private async createContextualSystemMessage(
    similarMessages: SimilarMessage[],
    similarConversations: SimilarConversation[],
    maxLength: number,
    fileSnippets: Array<{ fileName: string; mimeType: string; similarity: number; snippet: string }> = []
  ): Promise<string> {
    let contextParts: string[] = [];

    // Base system message
    contextParts.push(
      "You are an AI assistant with access to the user's conversation history.",
      "Use this context to provide more personalized, coherent, and helpful responses.",
      "Reference past conversations naturally when relevant, but don't overwhelm the user with too much history."
    );

    // Add similar conversations context
    if (similarConversations.length > 0) {
      contextParts.push("\n--- RELEVANT PAST CONVERSATIONS ---");
      
      for (const conv of similarConversations) {
        const contextSnippet = `
[${this.formatDate(conv.createdAt)}] ${conv.title || 'Untitled Conversation'}
Summary: ${conv.summary.substring(0, 300)}${conv.summary.length > 300 ? '...' : ''}
Similarity: ${(conv.similarity * 100).toFixed(1)}%`;
        
        contextParts.push(contextSnippet);
      }
    }

    // Add similar messages context
    if (similarMessages.length > 0) {
      contextParts.push("\n--- RELEVANT PAST MESSAGES ---");
      
      for (const msg of similarMessages) {
        const contextSnippet = `
[${this.formatDate(msg.createdAt)}] ${msg.role}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}
Similarity: ${(msg.similarity * 100).toFixed(1)}%`;
        
        contextParts.push(contextSnippet);
      }
    }

    // Add relevant files context
    if (fileSnippets.length > 0) {
      contextParts.push("\n--- RELEVANT FILE EXCERPTS ---");
      for (const fs of fileSnippets) {
        const entry = `\n[${(fs.similarity * 100).toFixed(1)}%] ${fs.fileName} (${fs.mimeType})\n${fs.snippet}${fs.snippet.length >= 400 ? '...' : ''}`;
        contextParts.push(entry);
      }
    }

    // Add usage guidelines
    contextParts.push(
      "\n--- CONTEXT USAGE GUIDELINES ---",
      "- Reference past conversations when they provide helpful context",
      "- Don't repeat information unless it adds value",
      "- Maintain conversation flow naturally",
      "- Use the provided file excerpts to ground your answer; quote relevant parts",
      "- Do not assume access to the entire file beyond these excerpts",
      "- If no relevant context exists, respond normally"
    );

    let fullContext = contextParts.join('\n');

    // Truncate if too long
    if (fullContext.length > maxLength) {
      fullContext = fullContext.substring(0, maxLength - 3) + '...';
      console.log(`✂️ Truncated context from ${contextParts.join('\n').length} to ${fullContext.length} characters`);
    }

    return fullContext;
  }

  /**
   * Create enhanced message list with contextual system message
   */
  private createEnhancedMessages(messages: ChatMessage[], contextualSystemMessage: string): ChatMessage[] {
    // Filter out any existing system messages
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
    
    // Add our enhanced system message at the beginning
    return [
      { role: 'system', content: contextualSystemMessage },
      ...nonSystemMessages
    ];
  }

  /**
   * Find the last user message in the conversation
   */
  private findLastUserMessage(messages: ChatMessage[]): ChatMessage | null {
    // Look for the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i];
      }
    }
    return null;
  }

  /**
   * Create basic context when enhancement fails or is disabled
   */
  private createBasicContext(messages: ChatMessage[]): EnhancedContext {
    const basicSystemMessage = "You are a helpful AI assistant. Provide clear, accurate, and helpful responses.";
    
    return {
      similarMessages: [],
      similarConversations: [],
      contextualSystemMessage: basicSystemMessage,
      enhancedMessages: [
        { role: 'system', content: basicSystemMessage },
        ...messages.filter(msg => msg.role !== 'system')
      ],
      fileSnippets: []
    };
  }

  /**
   * Format date for context display
   */
  private formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      return `${Math.floor(diffDays / 7)} weeks ago`;
    } else {
      return `${Math.floor(diffDays / 30)} months ago`;
    }
  }

  /**
   * Get context enhancement settings for different use cases
   */
  static getPresetOptions(preset: 'minimal' | 'standard' | 'comprehensive'): ContextEnhancementOptions {
    switch (preset) {
      case 'minimal':
        return {
          maxSimilarMessages: 1,
          maxSimilarConversations: 1,
          similarityThreshold: 0.85,
          includeConversationContext: true,
          includeMessageContext: false,
          maxContextLength: 800
        };
      
      case 'comprehensive':
        return {
          maxSimilarMessages: 5,
          maxSimilarConversations: 3,
          similarityThreshold: 0.65,
          includeConversationContext: true,
          includeMessageContext: true,
          maxContextLength: 3000
        };
      
      case 'standard':
      default:
        return {
          maxSimilarMessages: 3,
          maxSimilarConversations: 2,
          similarityThreshold: 0.75,
          includeConversationContext: true,
          includeMessageContext: true,
          maxContextLength: 2000
        };
    }
  }

  /**
   * Analyze context quality for monitoring/debugging
   */
  async analyzeContextQuality(enhancedContext: EnhancedContext): Promise<{
    hasRelevantContext: boolean;
    averageSimilarity: number;
    contextLength: number;
    messageCount: number;
    conversationCount: number;
  }> {
    const allSimilarities = [
      ...enhancedContext.similarMessages.map(m => m.similarity),
      ...enhancedContext.similarConversations.map(c => c.similarity)
    ];

    const averageSimilarity = allSimilarities.length > 0 
      ? allSimilarities.reduce((sum, sim) => sum + sim, 0) / allSimilarities.length 
      : 0;

    return {
      hasRelevantContext: allSimilarities.length > 0 && averageSimilarity > 0.7,
      averageSimilarity,
      contextLength: enhancedContext.contextualSystemMessage.length,
      messageCount: enhancedContext.similarMessages.length,
      conversationCount: enhancedContext.similarConversations.length
    };
  }
}

// Export singleton instance
export const contextEnhancer = new ContextEnhancer();
