import { db } from "./db";
import { conversations, messages } from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';

export interface ConversationData {
  id: number;
  userId: number;
  sessionId: string;
  title?: string;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
  isStarred?: boolean;
}

export interface MessageData {
  id: number;
  conversationId: number;
  content: string;
  role: 'user' | 'assistant' | 'system';
  messageIndex: number;
  attachments?: string[];
  metadata?: {
    code?: string;
    currentBalance?: number;
    messagesUsed?: number;
    monthlyAllowance?: number;
    isFreemium?: boolean;
    creditsRequired?: number;
    isTeamPooled?: boolean;
    purchaseUrl?: string;
    upgradeUrl?: string;
    message?: string;
    model?: string;
    provider?: string;
    tokensUsed?: number;
  };
  createdAt: Date;
}

export interface CreateConversationInput {
  userId: number;
  provider: string;
  model: string;
  sessionId?: string;
  title?: string;
}

export interface CreateMessageInput {
  conversationId: number;
  content: string;
  role: 'user' | 'assistant' | 'system';
  attachments?: string[];
  metadata?: MessageData['metadata'];
}

/**
 * Service for managing conversations and messages
 */
export class ConversationService {
  
  /**
   * Create a new conversation
   */
  async createConversation(input: CreateConversationInput): Promise<ConversationData> {
    try {
      const sessionId = input.sessionId || uuidv4();
      
      const result = await db.insert(conversations).values({
        userId: input.userId,
        sessionId,
        title: input.title,
        provider: input.provider,
        model: input.model
      }).returning();

      const conversation = result[0];
      
      console.log(`✅ Created conversation ${conversation.id} for user ${input.userId} (${input.provider}/${input.model})`);
      
      return {
        id: conversation.id,
        userId: conversation.userId,
        sessionId: conversation.sessionId,
        title: conversation.title || undefined,
        provider: conversation.provider,
        model: conversation.model,
        createdAt: conversation.createdAt!,
        updatedAt: conversation.updatedAt!,
        archivedAt: conversation.archivedAt || undefined,
        isStarred: conversation.isStarred || false
      };
    } catch (error) {
      console.error('❌ Error creating conversation:', error);
      throw new Error(`Failed to create conversation: ${error}`);
    }
  }

  /**
   * Get or create conversation for a user session
   */
  async getOrCreateConversation(
    userId: number, 
    provider: string, 
    model: string, 
    sessionId?: string
  ): Promise<ConversationData> {
    try {
      // If sessionId provided, try to find existing conversation
      if (sessionId) {
        const existing = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.userId, userId),
            eq(conversations.sessionId, sessionId)
          ))
          .limit(1);

        if (existing.length > 0) {
          const conv = existing[0];
          console.log(`♻️ Found existing conversation ${conv.id} for session ${sessionId}`);
          
          return {
            id: conv.id,
            userId: conv.userId,
            sessionId: conv.sessionId,
            title: conv.title || undefined,
            provider: conv.provider,
            model: conv.model,
            createdAt: conv.createdAt!,
            updatedAt: conv.updatedAt!,
            archivedAt: conv.archivedAt || undefined,
            isStarred: conv.isStarred || false
          };
        }
      }

      // Create new conversation
      return await this.createConversation({
        userId,
        provider,
        model,
        sessionId
      });
    } catch (error) {
      console.error('❌ Error getting or creating conversation:', error);
      throw error;
    }
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(input: CreateMessageInput): Promise<MessageData> {
    try {
      // Get the next message index for this conversation
      const lastMessage = await db
        .select({ messageIndex: messages.messageIndex })
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(desc(messages.messageIndex))
        .limit(1);

      const nextIndex = lastMessage.length > 0 ? lastMessage[0].messageIndex + 1 : 1;

      const result = await db.insert(messages).values({
        conversationId: input.conversationId,
        content: input.content,
        role: input.role,
        messageIndex: nextIndex,
        attachments: input.attachments || undefined,
        metadata: input.metadata || undefined
      }).returning();

      const message = result[0];
      
      // Update conversation timestamp
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      console.log(`✅ Added ${input.role} message ${message.id} to conversation ${input.conversationId} (index: ${nextIndex})`);
      
      return {
        id: message.id,
        conversationId: message.conversationId,
        content: message.content,
        role: message.role as 'user' | 'assistant' | 'system',
        messageIndex: message.messageIndex,
        attachments: message.attachments || undefined,
        metadata: message.metadata || undefined,
        createdAt: message.createdAt!
      };
    } catch (error) {
      console.error('❌ Error adding message:', error);
      throw new Error(`Failed to add message: ${error}`);
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: number): Promise<ConversationData | null> {
    try {
      const result = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const conv = result[0];
      return {
        id: conv.id,
        userId: conv.userId,
        sessionId: conv.sessionId,
        title: conv.title || undefined,
        provider: conv.provider,
        model: conv.model,
        createdAt: conv.createdAt!,
        updatedAt: conv.updatedAt!,
        archivedAt: conv.archivedAt || undefined,
        isStarred: conv.isStarred || false
      };
    } catch (error) {
      console.error(`❌ Error getting conversation ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(conversationId: number): Promise<MessageData[]> {
    try {
      const result = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.messageIndex);

      return result.map(msg => ({
        id: msg.id,
        conversationId: msg.conversationId,
        content: msg.content,
        role: msg.role as 'user' | 'assistant' | 'system',
        messageIndex: msg.messageIndex,
        attachments: msg.attachments || undefined,
        metadata: msg.metadata || undefined,
        createdAt: msg.createdAt!
      }));
    } catch (error) {
      console.error(`❌ Error getting messages for conversation ${conversationId}:`, error);
      return [];
    }
  }

  /**
   * Get recent conversations for a user
   */
  async getUserConversations(userId: number, limit: number = 20): Promise<ConversationData[]> {
    try {
      const result = await db
        .select()
        .from(conversations)
        .where(and(
          eq(conversations.userId, userId),
          isNull(conversations.archivedAt)
        ))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit);

      return result.map(conv => ({
        id: conv.id,
        userId: conv.userId,
        sessionId: conv.sessionId,
        title: conv.title || undefined,
        provider: conv.provider,
        model: conv.model,
        createdAt: conv.createdAt!,
        updatedAt: conv.updatedAt!,
        archivedAt: conv.archivedAt || undefined,
        isStarred: conv.isStarred || false
      }));
    } catch (error) {
      console.error(`❌ Error getting conversations for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(conversationId: number, title: string): Promise<void> {
    try {
      await db
        .update(conversations)
        .set({ 
          title,
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversationId));

      console.log(`✅ Updated title for conversation ${conversationId}: ${title}`);
    } catch (error) {
      console.error(`❌ Error updating conversation title:`, error);
      throw error;
    }
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: number): Promise<void> {
    try {
      await db
        .update(conversations)
        .set({ 
          archivedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversationId));

      console.log(`✅ Archived conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Error archiving conversation:`, error);
      throw error;
    }
  }

  /**
   * Unarchive a conversation
   */
  async unarchiveConversation(conversationId: number): Promise<void> {
    try {
      await db
        .update(conversations)
        .set({ 
          archivedAt: null,
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversationId));

      console.log(`✅ Unarchived conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Error unarchiving conversation:`, error);
      throw error;
    }
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: number): Promise<void> {
    try {
      // First delete all messages in the conversation
      await db
        .delete(messages)
        .where(eq(messages.conversationId, conversationId));

      // Then delete the conversation
      await db
        .delete(conversations)
        .where(eq(conversations.id, conversationId));

      console.log(`✅ Deleted conversation ${conversationId} and all its messages`);
    } catch (error) {
      console.error(`❌ Error deleting conversation:`, error);
      throw error;
    }
  }

  /**
   * Star or unstar a conversation
   */
  async starConversation(conversationId: number, isStarred: boolean): Promise<void> {
    try {
      await db
        .update(conversations)
        .set({ 
          isStarred: isStarred,
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversationId));

      console.log(`✅ ${isStarred ? 'Starred' : 'Unstarred'} conversation ${conversationId}`);
    } catch (error) {
      console.error(`❌ Error starring conversation:`, error);
      throw error;
    }
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId: number): Promise<MessageData | null> {
    try {
      const result = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const msg = result[0];
      return {
        id: msg.id,
        conversationId: msg.conversationId,
        content: msg.content,
        role: msg.role as 'user' | 'assistant' | 'system',
        messageIndex: msg.messageIndex,
        attachments: msg.attachments || undefined,
        metadata: msg.metadata || undefined,
        createdAt: msg.createdAt!
      };
    } catch (error) {
      console.error(`❌ Error getting message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Search conversations by title, provider, model, or message content
   */
  async searchConversations(
    userId: number, 
    searchQuery: string, 
    filters: {
      provider?: string;
      isStarred?: boolean;
      isArchived?: boolean;
      dateRange?: 'today' | 'week' | 'month' | 'all';
    } = {},
    limit: number = 50
  ): Promise<ConversationData[]> {
    try {
      let query = db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId));

      // Apply filters
      if (filters.provider && filters.provider !== 'all') {
        query = query.where(and(eq(conversations.userId, userId), eq(conversations.provider, filters.provider)));
      }

      if (filters.isStarred !== undefined) {
        query = query.where(and(eq(conversations.userId, userId), eq(conversations.isStarred, filters.isStarred)));
      }

      if (filters.isArchived !== undefined) {
        if (filters.isArchived) {
          query = query.where(and(eq(conversations.userId, userId), isNull(conversations.archivedAt).not()));
        } else {
          query = query.where(and(eq(conversations.userId, userId), isNull(conversations.archivedAt)));
        }
      }

      // Date range filter
      if (filters.dateRange && filters.dateRange !== 'all') {
        const now = new Date();
        let dateThreshold: Date;
        
        switch (filters.dateRange) {
          case 'today':
            dateThreshold = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            dateThreshold = new Date(0);
        }
        
        query = query.where(and(eq(conversations.userId, userId), gte(conversations.updatedAt, dateThreshold)));
      }

      // Search in conversation title, provider, and model
      if (searchQuery && searchQuery.trim().length > 0) {
        const searchTerm = `%${searchQuery.toLowerCase()}%`;
        query = query.where(and(
          eq(conversations.userId, userId),
          // Note: This is a simplified search. For better performance, consider using full-text search
          // or implementing a more sophisticated search with message content
        ));
      }

      const result = await query
        .orderBy(desc(conversations.updatedAt))
        .limit(limit);

      return result.map(conv => ({
        id: conv.id,
        userId: conv.userId,
        sessionId: conv.sessionId,
        title: conv.title || undefined,
        provider: conv.provider,
        model: conv.model,
        createdAt: conv.createdAt!,
        updatedAt: conv.updatedAt!,
        archivedAt: conv.archivedAt || undefined,
        isStarred: conv.isStarred || false
      }));
    } catch (error) {
      console.error(`❌ Error searching conversations for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Generate conversation title from first few messages
   */
  async generateConversationTitle(conversationId: number): Promise<string> {
    try {
      const firstMessages = await db
        .select({ content: messages.content, role: messages.role })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.messageIndex)
        .limit(3);

      if (firstMessages.length === 0) {
        return "New Conversation";
      }

      // Find the first user message
      const firstUserMessage = firstMessages.find(msg => msg.role === 'user');
      if (!firstUserMessage) {
        return "New Conversation";
      }

      // Create a title from the first user message (first 50 characters)
      let title = firstUserMessage.content.trim();
      if (title.length > 50) {
        title = title.substring(0, 47) + "...";
      }

      // Update the conversation with the generated title
      await this.updateConversationTitle(conversationId, title);

      return title;
    } catch (error) {
      console.error(`❌ Error generating conversation title for ${conversationId}:`, error);
      return "New Conversation";
    }
  }
}

// Export singleton instance
export const conversationService = new ConversationService();
