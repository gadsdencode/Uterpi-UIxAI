// Conversation Controller - Handles conversation routes
// CRUD operations, search, export, archive, star

import type { Request, Response } from "express";
import { conversationService } from "../conversation-service";
import { vectorProcessor } from "../vector-processor";

/**
 * Conversation Controller - Handles all conversation-related routes
 */
export class ConversationController {

  /**
   * Get user conversations
   */
  async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;
      const provider = req.query.provider as string;
      const isStarred = req.query.isStarred === 'true';
      const isArchived = req.query.isArchived === 'true';
      const dateRange = req.query.dateRange as 'today' | 'week' | 'month' | 'all' || 'all';
      
      let conversations;
      
      if (search || provider !== 'all' || isStarred || isArchived || dateRange !== 'all') {
        // Use search with filters
        conversations = await conversationService.searchConversations(
          userId,
          search || '',
          {
            provider: provider !== 'all' ? provider : undefined,
            isStarred: isStarred || undefined,
            isArchived: isArchived || undefined,
            dateRange
          },
          limit
        );
      } else {
        // Use regular get conversations
        conversations = await conversationService.getUserConversations(userId, limit);
      }
      
      res.json({
        success: true,
        conversations,
        count: conversations.length
      });
    } catch (error) {
      console.error('❌ Error getting user conversations:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Get conversation messages
   */
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = parseInt(req.params.id);
      const messages = await conversationService.getConversationMessages(conversationId);
      
      res.json({
        success: true,
        messages,
        count: messages.length
      });
    } catch (error) {
      console.error('❌ Error getting conversation messages:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Update conversation title
   */
  async updateTitle(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = parseInt(req.params.id);
      const { title } = req.body;
      const userId = req.user!.id;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: "Title is required and must be a non-empty string"
        });
        return;
      }

      // Verify conversation belongs to user
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        res.status(404).json({
          success: false,
          error: "Conversation not found"
        });
        return;
      }

      await conversationService.updateConversationTitle(conversationId, title.trim());
      
      res.json({
        success: true,
        message: "Conversation title updated successfully"
      });
    } catch (error) {
      console.error('❌ Error updating conversation title:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Archive conversation
   */
  async archive(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Verify conversation belongs to user
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        res.status(404).json({
          success: false,
          error: "Conversation not found"
        });
        return;
      }

      await conversationService.archiveConversation(conversationId);
      
      res.json({
        success: true,
        message: "Conversation archived successfully"
      });
    } catch (error) {
      console.error('❌ Error archiving conversation:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Unarchive conversation
   */
  async unarchive(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Verify conversation belongs to user
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        res.status(404).json({
          success: false,
          error: "Conversation not found"
        });
        return;
      }

      await conversationService.unarchiveConversation(conversationId);
      
      res.json({
        success: true,
        message: "Conversation unarchived successfully"
      });
    } catch (error) {
      console.error('❌ Error unarchiving conversation:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Delete conversation
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Verify conversation belongs to user
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        res.status(404).json({
          success: false,
          error: "Conversation not found"
        });
        return;
      }

      await conversationService.deleteConversation(conversationId);
      
      res.json({
        success: true,
        message: "Conversation deleted successfully"
      });
    } catch (error) {
      console.error('❌ Error deleting conversation:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Star/unstar conversation
   */
  async star(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = parseInt(req.params.id);
      const { isStarred } = req.body;
      const userId = req.user!.id;

      // Verify conversation belongs to user
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || conversation.userId !== userId) {
        res.status(404).json({
          success: false,
          error: "Conversation not found"
        });
        return;
      }

      await conversationService.starConversation(conversationId, isStarred);
      
      res.json({
        success: true,
        message: isStarred ? "Conversation starred successfully" : "Conversation unstarred successfully"
      });
    } catch (error) {
      console.error('❌ Error starring conversation:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Export single conversation
   */
  async exportConversation(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = parseInt(req.params.id);
      const format = (req.query.format as string) || 'json';
      const userId = req.user!.id;

      // Validate format
      if (!['json', 'markdown', 'csv', 'txt'].includes(format)) {
        res.status(400).json({
          success: false,
          error: "Invalid export format. Supported formats: json, markdown, csv, txt"
        });
        return;
      }

      const exportResult = await conversationService.exportConversation(
        conversationId, 
        userId, 
        format as 'json' | 'markdown' | 'csv' | 'txt'
      );

      // Set headers for file download
      res.setHeader('Content-Type', exportResult.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(exportResult.data, 'utf8'));

      res.send(exportResult.data);
    } catch (error) {
      console.error('❌ Error exporting conversation:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Export multiple conversations
   */
  async exportBulk(req: Request, res: Response): Promise<void> {
    try {
      const { conversationIds, format = 'json' } = req.body;
      const userId = req.user!.id;

      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "conversationIds must be a non-empty array"
        });
        return;
      }

      // Validate format
      if (!['json', 'markdown', 'csv', 'txt'].includes(format)) {
        res.status(400).json({
          success: false,
          error: "Invalid export format. Supported formats: json, markdown, csv, txt"
        });
        return;
      }

      // Limit bulk export to prevent abuse
      if (conversationIds.length > 50) {
        res.status(400).json({
          success: false,
          error: "Cannot export more than 50 conversations at once"
        });
        return;
      }

      const exportResult = await conversationService.exportMultipleConversations(
        conversationIds, 
        userId, 
        format as 'json' | 'markdown' | 'csv' | 'txt'
      );

      // Set headers for file download
      res.setHeader('Content-Type', exportResult.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(exportResult.data, 'utf8'));

      res.send(exportResult.data);
    } catch (error) {
      console.error('❌ Error exporting multiple conversations:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }

  /**
   * Test vectorization system
   */
  async testVectorization(req: Request, res: Response): Promise<void> {
    try {
      const { testVectorizationSystem } = await import('../test-vectorization');
      console.log('🧪 Running vectorization system tests...');
      
      const results = await testVectorizationSystem();
      const totalTests = results.length;
      const passedTests = results.filter((r: any) => r.success).length;
      
      res.json({
        success: true,
        summary: {
          totalTests,
          passedTests,
          failedTests: totalTests - passedTests,
          successRate: ((passedTests / totalTests) * 100).toFixed(1) + '%'
        },
        results,
        systemReady: passedTests >= totalTests * 0.8
      });
    } catch (error) {
      console.error('❌ Vectorization test failed:', error);
      res.status(500).json({
        success: false,
        error: error?.toString(),
        message: 'Vectorization system test failed'
      });
    }
  }

  /**
   * Get vectorization queue status
   */
  async getVectorizationStatus(req: Request, res: Response): Promise<void> {
    try {
      const queueStatus = vectorProcessor.getQueueStatus();
      
      res.json({
        success: true,
        queueStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error getting vectorization status:', error);
      res.status(500).json({
        success: false,
        error: error?.toString()
      });
    }
  }
}

// Export singleton instance
export const conversationController = new ConversationController();

