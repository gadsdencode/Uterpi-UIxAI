// SMS Controller - Handles SMS notification routes
// Preferences, verification, sending, history, templates

import type { Request, Response } from "express";
import { smsService } from "../services/smsService";
import { trackAIUsage } from "../stripe-consolidated";
import { 
  updateSmsPreferencesSchema,
  verifyPhoneSchema,
  confirmPhoneVerificationSchema,
  sendSmsSchema
} from "@shared/schema";
import { createError } from "../error-handler";
import type { AuthenticatedRequest } from "../types/ai";

/**
 * SMS Controller - Handles all SMS-related routes
 */
export class SmsController {

  /**
   * Get SMS preferences
   */
  async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }
      
      const preferences = await smsService.getUserSmsPreferences(req.user.id);
      
      res.json({
        success: true,
        preferences: preferences || {
          enableSms: false,
          phoneNumber: null,
          phoneVerified: false,
          alertNotifications: true,
          reminderNotifications: true,
          promotionalNotifications: false,
          quietHoursStart: null,
          quietHoursEnd: null,
          timezone: 'UTC',
          dailyLimit: 10,
        }
      });
    } catch (error: any) {
      console.error("Get SMS preferences error:", error);
      throw createError.database("Failed to get SMS preferences", error);
    }
  }

  /**
   * Update SMS preferences
   */
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }
      
      const validatedData = updateSmsPreferencesSchema.parse(req.body);
      const preferences = await smsService.updateUserSmsPreferences(req.user.id, validatedData);
      
      res.json({
        success: true,
        message: "SMS preferences updated successfully",
        preferences
      });
    } catch (error: any) {
      console.error("Update SMS preferences error:", error);
      
      if (error.issues) {
        throw createError.validation("Invalid preferences data", error.issues);
      } else {
        throw createError.database("Failed to update SMS preferences", error);
      }
    }
  }

  /**
   * Send verification code
   */
  async verifyPhone(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }
      
      const validatedData = verifyPhoneSchema.parse(req.body);
      await smsService.sendVerificationCode(validatedData.phoneNumber, req.user.id);
      
      res.json({
        success: true,
        message: "Verification code sent successfully"
      });
    } catch (error: any) {
      console.error("Send verification code error:", error);
      
      if (error.issues) {
        throw createError.validation("Invalid phone number", error.issues);
      } else if (error.message?.includes('Twilio')) {
        res.status(503).json({ error: "SMS service temporarily unavailable" });
        return;
      } else {
        throw createError.database("Failed to send verification code", error);
      }
    }
  }

  /**
   * Confirm phone verification
   */
  async confirmVerification(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }
      
      const validatedData = confirmPhoneVerificationSchema.parse(req.body);
      const verified = await smsService.verifyPhoneNumber(
        req.user.id,
        validatedData.phoneNumber,
        validatedData.verificationCode
      );
      
      if (verified) {
        res.json({
          success: true,
          message: "Phone number verified successfully"
        });
      } else {
        throw createError.validation("Invalid verification code");
      }
    } catch (error: any) {
      console.error("Confirm verification error:", error);
      
      if (error.issues) {
        throw createError.validation("Invalid verification data", error.issues);
      } else if (error.message?.includes('expired')) {
        throw createError.validation("Verification code has expired");
      } else if (error.message?.includes('Invalid')) {
        throw createError.validation(error.message);
      } else {
        throw createError.database("Failed to verify phone number", error);
      }
    }
  }

  /**
   * Send SMS notification
   */
  async sendSms(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }
      
      const validatedData = sendSmsSchema.parse(req.body);
      
      // Convert scheduledFor string to Date if provided
      const smsData = {
        ...validatedData,
        userId: req.user.id,
        scheduledFor: validatedData.scheduledFor ? new Date(validatedData.scheduledFor) : undefined,
      };
      
      const notification = await smsService.sendSms(smsData);
      
      // Track SMS usage in AI credits
      if (req.user?.creditsPending) {
        await trackAIUsage({
          userId: req.user.id,
          operationType: 'chat',
          modelUsed: 'sms_service',
          tokensConsumed: 10,
        });
      }
      
      res.json({
        success: true,
        message: "SMS sent successfully",
        notification: {
          id: notification.id,
          status: notification.twilioStatus,
          sentAt: notification.sentAt,
        }
      });
    } catch (error: any) {
      console.error("Send SMS error:", error);
      
      if (error.issues) {
        throw createError.validation("Invalid SMS data", error.issues);
      } else if (error.message?.includes('disabled')) {
        res.status(403).json({ error: error.message });
        return;
      } else if (error.message?.includes('limit')) {
        res.status(429).json({ error: error.message });
        return;
      } else if (error.message?.includes('Twilio')) {
        res.status(503).json({ error: "SMS service temporarily unavailable" });
        return;
      } else {
        throw createError.database("Failed to send SMS", error);
      }
    }
  }

  /**
   * Get SMS notification history
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }
      
      const limit = parseInt(req.query.limit as string) || 50;
      const notifications = await smsService.getNotificationHistory(req.user.id, limit);
      
      res.json({
        success: true,
        notifications
      });
    } catch (error: any) {
      console.error("Get SMS history error:", error);
      throw createError.database("Failed to get SMS history", error);
    }
  }

  /**
   * Get SMS templates
   */
  async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const templates = await smsService.getTemplates();
      
      res.json({
        success: true,
        templates
      });
    } catch (error: any) {
      console.error("Get SMS templates error:", error);
      throw createError.database("Failed to get SMS templates", error);
    }
  }

  /**
   * Create SMS template
   */
  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        throw createError.authentication('User authentication required');
      }
      
      const template = await smsService.createTemplate({
        ...req.body,
        createdBy: req.user.id,
      });
      
      res.json({
        success: true,
        message: "Template created successfully",
        template
      });
    } catch (error: any) {
      console.error("Create SMS template error:", error);
      
      if (error.issues) {
        throw createError.validation("Invalid template data", error.issues);
      } else {
        throw createError.database("Failed to create template", error);
      }
    }
  }

  /**
   * Handle Twilio webhook
   */
  async webhookStatus(req: Request, res: Response): Promise<void> {
    try {
      await smsService.handleTwilioWebhook(req.body);
      res.status(200).send('OK');
    } catch (error: any) {
      console.error("Twilio webhook error:", error);
      // Always return 200 to Twilio to prevent retries
      res.status(200).send('OK');
    }
  }
}

// Export singleton instance
export const smsController = new SmsController();

