import { vectorService, SimilarMessage, SimilarConversation } from "./vector-service";
import { conversationService } from "./conversation-service";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface EnhancedContext {
  similarMessages: SimilarMessage[];
  similarConversations: SimilarConversation[];
  contextualSystemMessage: string;
  enhancedMessages: ChatMessage[];
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
  async enhanceMessagesWithContext(
    messages: ChatMessage[], 
    userId: number,
    options: Partial<ContextEnhancementOptions> = {}
  ): Promise<EnhancedContext> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      // Get the current user message (last message in conversation)
      const currentUserMessage = this.findLastUserMessage(messages);
      if (!currentUserMessage) {
        console.log('⚠️ No user message found for context enhancement');
        return this.createBasicContext(messages);
      }

      console.log(`🔍 Enhancing context for user ${userId} with message: "${currentUserMessage.content.substring(0, 100)}..."`);

      // Generate embedding for current message
      const embeddingResult = await vectorService.generateEmbedding(currentUserMessage.content);
      
      // Find similar content
      const [similarMessages, similarConversations] = await Promise.all([
        opts.includeMessageContext 
          ? vectorService.findSimilarMessages(embeddingResult.embedding, userId, opts.maxSimilarMessages, opts.similarityThreshold)
          : Promise.resolve([]),
        opts.includeConversationContext 
          ? vectorService.findSimilarConversations(embeddingResult.embedding, userId, opts.maxSimilarConversations, opts.similarityThreshold)
          : Promise.resolve([])
      ]);

      console.log(`📊 Found ${similarMessages.length} similar messages and ${similarConversations.length} similar conversations`);

      // Create enhanced system message
      const contextualSystemMessage = await this.createContextualSystemMessage(
        similarMessages, 
        similarConversations, 
        opts.maxContextLength
      );

      // Create enhanced message list
      const enhancedMessages = this.createEnhancedMessages(messages, contextualSystemMessage);

      return {
        similarMessages,
        similarConversations,
        contextualSystemMessage,
        enhancedMessages
      };

    } catch (error) {
      console.error('❌ Error enhancing messages with context:', error);
      // Return basic context if enhancement fails
      return this.createBasicContext(messages);
    }
  }

  /**
   * Create contextual system message with relevant past conversations
   */
  private async createContextualSystemMessage(
    similarMessages: SimilarMessage[],
    similarConversations: SimilarConversation[],
    maxLength: number
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

    // Add usage guidelines
    contextParts.push(
      "\n--- CONTEXT USAGE GUIDELINES ---",
      "- Reference past conversations when they provide helpful context",
      "- Don't repeat information unless it adds value",
      "- Maintain conversation flow naturally",
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
      ]
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
