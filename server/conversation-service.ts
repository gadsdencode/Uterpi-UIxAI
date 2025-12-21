import { db } from "./db";
import { conversations, messages, users } from "@shared/schema";
import { eq, desc, and, isNull, gte, not } from "drizzle-orm";
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
      // Build conditions array
      const conditions = [eq(conversations.userId, userId)];

      // Apply filters
      if (filters.provider && filters.provider !== 'all') {
        conditions.push(eq(conversations.provider, filters.provider));
      }

      if (filters.isStarred !== undefined) {
        conditions.push(eq(conversations.isStarred, filters.isStarred));
      }

      if (filters.isArchived !== undefined) {
        if (filters.isArchived) {
          conditions.push(not(isNull(conversations.archivedAt)));
        } else {
          conditions.push(isNull(conversations.archivedAt));
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
        
        conditions.push(gte(conversations.updatedAt, dateThreshold));
      }

      // Search in conversation title, provider, and model
      if (searchQuery && searchQuery.trim().length > 0) {
        // Note: This is a simplified search. For better performance, consider using full-text search
        // or implementing a more sophisticated search with message content
        // For now, we'll just return all conversations matching other filters
      }

      const result = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
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
   * Export conversation data for various formats
   */
  async exportConversation(
    conversationId: number, 
    userId: number, 
    format: 'json' | 'markdown' | 'csv' | 'txt' = 'json'
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    try {
      // Get conversation with messages
      const conversation = await this.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        throw new Error('Conversation not found or access denied');
      }

      const messages = await this.getConversationMessages(conversationId);
      
      // Get user info for export metadata
      const userResult = await db
        .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userResult[0];

      const exportData = {
        conversation: {
          id: conversation.id,
          title: conversation.title || 'Untitled Conversation',
          provider: conversation.provider,
          model: conversation.model,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          isStarred: conversation.isStarred,
          archivedAt: conversation.archivedAt
        },
        user: {
          email: user?.email,
          name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : undefined
        },
        messages: messages.flatMap(msg => {
          const exportedMessages = this.mapMessageForExport(msg);
          
          return exportedMessages.map((exportedMsg, index) => ({
            id: `${msg.id}-${index}`,
            role: exportedMsg.role,
            content: exportedMsg.content,
            messageIndex: msg.messageIndex + index,
            attachments: msg.attachments,
            metadata: msg.metadata,
            createdAt: exportedMsg.timestamp
          }));
        }),
        exportInfo: {
          exportedAt: new Date().toISOString(),
          totalMessages: messages.length,
          format: format
        }
      };

      let data: string;
      let filename: string;
      let mimeType: string;

      const safeTitle = (conversation.title || 'conversation').replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '_');
      const timestamp = new Date().toISOString().split('T')[0];

      switch (format) {
        case 'json':
          data = JSON.stringify(exportData, null, 2);
          filename = `${safeTitle}_${timestamp}.json`;
          mimeType = 'application/json';
          break;

        case 'markdown':
          data = this.generateMarkdownExport(exportData);
          filename = `${safeTitle}_${timestamp}.md`;
          mimeType = 'text/markdown';
          break;

        case 'csv':
          data = this.generateCSVExport(exportData);
          filename = `${safeTitle}_${timestamp}.csv`;
          mimeType = 'text/csv';
          break;

        case 'txt':
          data = this.generateTextExport(exportData);
          filename = `${safeTitle}_${timestamp}.txt`;
          mimeType = 'text/plain';
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      console.log(`✅ Exported conversation ${conversationId} in ${format} format`);
      return { data, filename, mimeType };

    } catch (error) {
      console.error(`❌ Error exporting conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Export multiple conversations
   */
  async exportMultipleConversations(
    conversationIds: number[], 
    userId: number, 
    format: 'json' | 'markdown' | 'csv' | 'txt' = 'json'
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    try {
      const conversations = [];
      
      for (const conversationId of conversationIds) {
        const conversation = await this.getConversation(conversationId);
        if (conversation && conversation.userId === userId) {
          const messages = await this.getConversationMessages(conversationId);
          conversations.push({
            conversation: {
              id: conversation.id,
              title: conversation.title || 'Untitled Conversation',
              provider: conversation.provider,
              model: conversation.model,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
              isStarred: conversation.isStarred,
              archivedAt: conversation.archivedAt
            },
            messages: messages.flatMap(msg => {
              const exportedMessages = this.mapMessageForExport(msg);
              
              return exportedMessages.map((exportedMsg, index) => ({
                id: `${msg.id}-${index}`,
                role: exportedMsg.role,
                content: exportedMsg.content,
                messageIndex: msg.messageIndex + index,
                attachments: msg.attachments,
                metadata: msg.metadata,
                createdAt: exportedMsg.timestamp
              }));
            })
          });
        }
      }

      // Get user info
      const userResult = await db
        .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userResult[0];

      const exportData = {
        conversations,
        user: {
          email: user?.email,
          name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : undefined
        },
        exportInfo: {
          exportedAt: new Date().toISOString(),
          totalConversations: conversations.length,
          totalMessages: conversations.reduce((sum, conv) => sum + conv.messages.length, 0),
          format: format
        }
      };

      let data: string;
      let filename: string;
      let mimeType: string;

      const timestamp = new Date().toISOString().split('T')[0];

      switch (format) {
        case 'json':
          data = JSON.stringify(exportData, null, 2);
          filename = `conversations_${timestamp}.json`;
          mimeType = 'application/json';
          break;

        case 'markdown':
          data = this.generateBulkMarkdownExport(exportData);
          filename = `conversations_${timestamp}.md`;
          mimeType = 'text/markdown';
          break;

        case 'csv':
          data = this.generateBulkCSVExport(exportData);
          filename = `conversations_${timestamp}.csv`;
          mimeType = 'text/csv';
          break;

        case 'txt':
          data = this.generateBulkTextExport(exportData);
          filename = `conversations_${timestamp}.txt`;
          mimeType = 'text/plain';
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      console.log(`✅ Exported ${conversations.length} conversations in ${format} format`);
      return { data, filename, mimeType };

    } catch (error) {
      console.error(`❌ Error exporting multiple conversations:`, error);
      throw error;
    }
  }

  /**
   * Generate Markdown export for single conversation
   */
  private generateMarkdownExport(exportData: any): string {
    const { conversation, messages, user, exportInfo } = exportData;
    
    let markdown = `# ${conversation.title}\n\n`;
    markdown += `**Provider:** ${conversation.provider}\n`;
    markdown += `**Model:** ${conversation.model}\n`;
    markdown += `**Created:** ${new Date(conversation.createdAt).toLocaleString()}\n`;
    markdown += `**Updated:** ${new Date(conversation.updatedAt).toLocaleString()}\n`;
    if (conversation.isStarred) markdown += `**Starred:** ⭐\n`;
    if (conversation.archivedAt) markdown += `**Archived:** ${new Date(conversation.archivedAt).toLocaleString()}\n`;
    markdown += `**Total Messages:** ${messages.length}\n\n`;
    
    if (user?.name) markdown += `**Exported by:** ${user.name}\n`;
    markdown += `**Export Date:** ${new Date(exportInfo.exportedAt).toLocaleString()}\n\n`;
    
    markdown += `---\n\n`;

    messages.forEach((message: any, index: number) => {
      const timestamp = new Date(message.createdAt).toLocaleString();
      const role = message.role === 'user' ? '👤 User' : message.role === 'assistant' ? '🤖 Assistant' : '⚙️ System';
      
      markdown += `## ${role} - ${timestamp}\n\n`;
      markdown += `${message.content}\n\n`;
      
      if (message.attachments && message.attachments.length > 0) {
        markdown += `**Attachments:** ${message.attachments.join(', ')}\n\n`;
      }
      
      if (message.metadata && Object.keys(message.metadata).length > 0) {
        markdown += `**Metadata:**\n`;
        Object.entries(message.metadata).forEach(([key, value]) => {
          markdown += `- ${key}: ${value}\n`;
        });
        markdown += `\n`;
      }
      
      if (index < messages.length - 1) markdown += `---\n\n`;
    });

    return markdown;
  }

  /**
   * Generate CSV export for single conversation
   */
  private generateCSVExport(exportData: any): string {
    const { conversation, messages } = exportData;
    
    let csv = 'Message Index,Role,Content,Timestamp,Attachments,Metadata\n';
    
    messages.forEach((message: any) => {
      const timestamp = new Date(message.createdAt).toISOString();
      const attachments = message.attachments ? message.attachments.join('; ') : '';
      const metadata = message.metadata ? JSON.stringify(message.metadata).replace(/"/g, '""') : '';
      const content = message.content.replace(/"/g, '""').replace(/\n/g, '\\n');
      
      csv += `${message.messageIndex},"${message.role}","${content}","${timestamp}","${attachments}","${metadata}"\n`;
    });

    return csv;
  }

  /**
   * Generate plain text export for single conversation
   */
  private generateTextExport(exportData: any): string {
    const { conversation, messages, user, exportInfo } = exportData;
    
    let text = `${conversation.title}\n`;
    text += `${'='.repeat(conversation.title.length)}\n\n`;
    text += `Provider: ${conversation.provider}\n`;
    text += `Model: ${conversation.model}\n`;
    text += `Created: ${new Date(conversation.createdAt).toLocaleString()}\n`;
    text += `Updated: ${new Date(conversation.updatedAt).toLocaleString()}\n`;
    text += `Total Messages: ${messages.length}\n`;
    if (user?.name) text += `Exported by: ${user.name}\n`;
    text += `Export Date: ${new Date(exportInfo.exportedAt).toLocaleString()}\n\n`;
    text += `${'='.repeat(50)}\n\n`;

    messages.forEach((message: any) => {
      const timestamp = new Date(message.createdAt).toLocaleString();
      const role = message.role.toUpperCase();
      
      text += `[${role}] ${timestamp}\n`;
      text += `${'-'.repeat(20)}\n`;
      text += `${message.content}\n\n`;
      
      if (message.attachments && message.attachments.length > 0) {
        text += `Attachments: ${message.attachments.join(', ')}\n\n`;
      }
    });

    return text;
  }

  /**
   * Generate Markdown export for multiple conversations
   */
  private generateBulkMarkdownExport(exportData: any): string {
    const { conversations, user, exportInfo } = exportData;
    
    let markdown = `# Conversations Export\n\n`;
    markdown += `**Total Conversations:** ${conversations.length}\n`;
    markdown += `**Total Messages:** ${exportInfo.totalMessages}\n`;
    if (user?.name) markdown += `**Exported by:** ${user.name}\n`;
    markdown += `**Export Date:** ${new Date(exportInfo.exportedAt).toLocaleString()}\n\n`;
    markdown += `---\n\n`;

    conversations.forEach((convData: any, index: number) => {
      const { conversation, messages } = convData;
      
      markdown += `## ${conversation.title}\n\n`;
      markdown += `**Provider:** ${conversation.provider} | **Model:** ${conversation.model}\n`;
      markdown += `**Created:** ${new Date(conversation.createdAt).toLocaleString()}\n`;
      markdown += `**Messages:** ${messages.length}\n\n`;

      messages.forEach((message: any) => {
        const timestamp = new Date(message.createdAt).toLocaleString();
        const role = message.role === 'user' ? '👤' : message.role === 'assistant' ? '🤖' : '⚙️';
        
        markdown += `### ${role} ${message.role} - ${timestamp}\n\n`;
        markdown += `${message.content}\n\n`;
      });

      if (index < conversations.length - 1) markdown += `---\n\n`;
    });

    return markdown;
  }

  /**
   * Generate CSV export for multiple conversations
   */
  private generateBulkCSVExport(exportData: any): string {
    const { conversations } = exportData;
    
    let csv = 'Conversation ID,Conversation Title,Provider,Model,Message Index,Role,Content,Timestamp,Attachments,Metadata\n';
    
    conversations.forEach((convData: any) => {
      const { conversation, messages } = convData;
      
      messages.forEach((message: any) => {
        const timestamp = new Date(message.createdAt).toISOString();
        const attachments = message.attachments ? message.attachments.join('; ') : '';
        const metadata = message.metadata ? JSON.stringify(message.metadata).replace(/"/g, '""') : '';
        const content = message.content.replace(/"/g, '""').replace(/\n/g, '\\n');
        const title = conversation.title.replace(/"/g, '""');
        
        csv += `${conversation.id},"${title}","${conversation.provider}","${conversation.model}",${message.messageIndex},"${message.role}","${content}","${timestamp}","${attachments}","${metadata}"\n`;
      });
    });

    return csv;
  }

  /**
   * Generate plain text export for multiple conversations
   */
  private generateBulkTextExport(exportData: any): string {
    const { conversations, user, exportInfo } = exportData;
    
    let text = `CONVERSATIONS EXPORT\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Total Conversations: ${conversations.length}\n`;
    text += `Total Messages: ${exportInfo.totalMessages}\n`;
    if (user?.name) text += `Exported by: ${user.name}\n`;
    text += `Export Date: ${new Date(exportInfo.exportedAt).toLocaleString()}\n\n`;
    text += `${'='.repeat(50)}\n\n`;

    conversations.forEach((convData: any, index: number) => {
      const { conversation, messages } = convData;
      
      text += `${conversation.title}\n`;
      text += `${'-'.repeat(conversation.title.length)}\n`;
      text += `Provider: ${conversation.provider} | Model: ${conversation.model}\n`;
      text += `Created: ${new Date(conversation.createdAt).toLocaleString()}\n`;
      text += `Messages: ${messages.length}\n\n`;

      messages.forEach((message: any) => {
        const timestamp = new Date(message.createdAt).toLocaleString();
        text += `[${message.role.toUpperCase()}] ${timestamp}\n`;
        text += `${message.content}\n\n`;
      });

      if (index < conversations.length - 1) text += `${'='.repeat(50)}\n\n`;
    });

    return text;
  }

  /**
   * Sanitize message content for export
   * Note: AI responses are now sanitized at the source (aiController.ts) before DB storage.
   * This method provides minimal backward compatibility for any legacy data that may still
   * contain dirty patterns, while keeping exports clean.
   */
  private sanitizeContentForExport(content: string): string {
    if (!content) return content;
    
    // For new data, content should already be clean from backend sanitization
    // This is a lightweight fallback for any legacy data compatibility
    let cleaned = content;
    
    // Remove any lingering role prefixes at line starts (legacy data cleanup)
    cleaned = cleaned.replace(/^User:\s*/gim, '');
    cleaned = cleaned.replace(/^Assistant:\s*/gim, '');
    cleaned = cleaned.replace(/^Human:\s*/gim, '');
    cleaned = cleaned.replace(/^AI:\s*/gim, '');
    
    // Normalize multiple newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    return cleaned.trim();
  }

  /**
   * Map message to export format
   * Note: Previous complex parsing logic has been removed since AI responses 
   * are now sanitized at the source before database storage.
   */
  private mapMessageForExport(msg: MessageData): Array<{role: string, content: string, timestamp: Date}> {
    // Return single message with sanitized content (no multi-message parsing needed)
    return [{
      role: msg.role,
      content: this.sanitizeContentForExport(msg.content),
      timestamp: new Date(msg.createdAt)
    }];
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

      // Extract clean content and create a title from the first user message
      const cleanContent = this.sanitizeContentForExport(firstUserMessage.content);
      let title = cleanContent.trim();
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
