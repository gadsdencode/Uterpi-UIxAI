// Engagement Controller - Handles engagement tracking routes
// Activity tracking, stats, email preferences

import type { Request, Response } from "express";
import { engagementService } from "../engagement";
import { updateEmailPreferencesSchema, unsubscribeSchema } from "@shared/schema";

/**
 * Engagement Controller - Handles all engagement-related routes
 */
export class EngagementController {

  /**
   * Track user activity
   */
  async trackActivity(req: Request, res: Response): Promise<void> {
    try {
      const { activityType, activityData, duration } = req.body;
      
      if (!activityType) {
        res.status(400).json({ error: "Activity type is required" });
        return;
      }

      const sessionId = req.sessionID;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.connection.remoteAddress;

      await engagementService.trackActivity(
        req.user!.id,
        activityType,
        activityData,
        sessionId,
        userAgent,
        ipAddress,
        duration
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Track activity error:", error);
      res.status(500).json({ error: "Failed to track activity" });
    }
  }

  /**
   * Get user engagement stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      let engagement = await engagementService.getUserEngagement(req.user!.id);
      
      // If engagement doesn't exist for existing user, initialize it
      if (!engagement) {
        console.log(`Initializing engagement for existing user stats: ${req.user!.id}`);
        await engagementService.ensureUserEngagementExists(req.user!.id);
        engagement = await engagementService.getUserEngagement(req.user!.id);
      }

      const activity = await engagementService.getUserActivity(req.user!.id, 20);

      res.json({
        success: true,
        data: {
          engagement,
          recentActivity: activity,
        }
      });
    } catch (error) {
      console.error("Get engagement stats error:", error);
      res.status(500).json({ error: "Failed to get engagement stats" });
    }
  }

  /**
   * Get email preferences
   */
  async getEmailPreferences(req: Request, res: Response): Promise<void> {
    try {
      let preferences = await engagementService.getEmailPreferences(req.user!.id);
      
      // If preferences don't exist for existing user, initialize them
      if (!preferences) {
        console.log(`Initializing engagement for existing user: ${req.user!.id}`);
        await engagementService.initializeUserEngagement(req.user!.id);
        
        // Try to get preferences again after initialization
        preferences = await engagementService.getEmailPreferences(req.user!.id);
        
        if (!preferences) {
          res.status(500).json({ error: "Failed to initialize email preferences" });
          return;
        }
      }

      // Return preferences without sensitive tokens
      const { unsubscribeToken, ...safePreferences } = preferences;
      res.json({
        success: true,
        preferences: safePreferences
      });
    } catch (error) {
      console.error("Get email preferences error:", error);
      res.status(500).json({ error: "Failed to get email preferences" });
    }
  }

  /**
   * Update email preferences
   */
  async updateEmailPreferences(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = updateEmailPreferencesSchema.parse(req.body);
      
      const success = await engagementService.updateEmailPreferences(req.user!.id, validatedData);
      
      if (success) {
        res.json({ success: true, message: "Email preferences updated" });
      } else {
        res.status(500).json({ error: "Failed to update email preferences" });
      }
    } catch (error: any) {
      console.error("Update email preferences error:", error);
      if (error.issues) {
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(500).json({ error: "Failed to update email preferences" });
      }
    }
  }

  /**
   * Unsubscribe from emails (public endpoint)
   */
  async unsubscribe(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = unsubscribeSchema.parse(req.body);
      
      const success = await engagementService.unsubscribeUser(validatedData.token, validatedData.reason);
      
      if (success) {
        res.json({ 
          success: true, 
          message: "Successfully unsubscribed from emails" 
        });
      } else {
        res.status(400).json({ error: "Invalid unsubscribe token" });
      }
    } catch (error: any) {
      console.error("Unsubscribe error:", error);
      if (error.issues) {
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(500).json({ error: "Failed to process unsubscribe request" });
      }
    }
  }

  /**
   * Track email open
   */
  async trackOpen(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.query;
      
      if (token && typeof token === 'string') {
        // Track email open in database
        // This would update the emailSendLog table
        console.log('Email opened:', token);
      }

      // Return 1x1 transparent pixel
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set({
        'Content-Type': 'image/gif',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      });
      res.send(pixel);
    } catch (error) {
      console.error("Track email open error:", error);
      // Still return pixel on error
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.setHeader('Content-Type', 'image/gif');
      res.send(pixel);
    }
  }

  /**
   * Track email click
   */
  async trackClick(req: Request, res: Response): Promise<void> {
    try {
      const { token, url } = req.query;
      
      if (token && typeof token === 'string') {
        // Track email click in database
        console.log('Email link clicked:', token);
      }

      // Redirect to the intended URL
      if (url && typeof url === 'string') {
        res.redirect(url);
      } else {
        res.redirect('/');
      }
    } catch (error) {
      console.error("Track email click error:", error);
      // Redirect to homepage on error
      res.redirect('/');
    }
  }

  /**
   * Send email (admin endpoint for testing)
   */
  async sendEmail(req: Request, res: Response): Promise<void> {
    try {
      const { emailType } = req.body;
      const userId = (req as any).user!.id;
      
      let success = false;
      switch (emailType) {
        case 'welcome':
          success = await engagementService.sendWelcomeEmail(userId);
          break;
        case 'reengagement':
          success = await engagementService.sendReengagementEmail(userId);
          break;
        case 'feature_discovery':
          success = await engagementService.sendFeatureDiscoveryEmail(userId);
          break;
        case 'usage_insights':
          success = await engagementService.sendUsageInsightsEmail(userId);
          break;
        case 'product_tips':
          success = await engagementService.sendProductTipsEmail(userId);
          break;
        default:
          res.status(400).json({ 
            error: "Invalid email type",
            validTypes: ['welcome', 'reengagement', 'feature_discovery', 'usage_insights', 'product_tips']
          });
          return;
      }

      res.json({ 
        success, 
        message: success ? `${emailType} email sent successfully` : 'Failed to send email'
      });
    } catch (error: any) {
      console.error("Send email error:", error);
      res.status(500).json({ 
        error: "Failed to send email",
        details: error.message 
      });
    }
  }
}

// Export singleton instance
export const engagementController = new EngagementController();

