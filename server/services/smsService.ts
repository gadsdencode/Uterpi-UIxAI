import twilio from 'twilio';
import { db } from '../db';
import { smsNotifications, smsPreferences, smsTemplates } from '@shared/schema';
import { eq, and, gt, sql } from 'drizzle-orm';
import type { 
  SmsNotification, 
  InsertSmsNotification, 
  SmsPreferences,
  SmsTemplate 
} from '@shared/schema';

// Twilio credentials fetching from the Replit Connector
let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export class SmsService {
  
  // Send SMS notification
  async sendSms(data: {
    recipientPhone: string;
    message: string;
    notificationType: string;
    userId?: number;
    priority?: string;
    templateId?: string;
    templateVariables?: any;
    scheduledFor?: Date;
    metadata?: any;
  }): Promise<SmsNotification> {
    try {
      // Check if user has SMS enabled and not opted out
      if (data.userId) {
        const preferences = await this.getUserSmsPreferences(data.userId);
        
        if (!preferences?.enableSms || preferences.isOptedOut) {
          throw new Error('SMS notifications are disabled for this user');
        }
        
        // Check daily limit
        if (preferences.messagesReceivedToday >= preferences.dailyLimit) {
          throw new Error('Daily SMS limit reached');
        }
        
        // Check quiet hours
        if (this.isQuietHours(preferences)) {
          // Schedule for later if in quiet hours
          const endTime = this.getQuietHoursEnd(preferences);
          data.scheduledFor = endTime;
        }
      }
      
      // Process template if provided
      let finalMessage = data.message;
      if (data.templateId) {
        finalMessage = await this.processTemplate(data.templateId, data.templateVariables);
      }
      
      // Insert notification record
      const [notification] = await db.insert(smsNotifications).values({
        userId: data.userId || null,
        recipientPhone: data.recipientPhone,
        recipientName: data.metadata?.recipientName,
        message: finalMessage,
        notificationType: data.notificationType,
        priority: data.priority || 'normal',
        templateId: data.templateId,
        templateVariables: data.templateVariables,
        scheduledFor: data.scheduledFor,
        metadata: data.metadata,
        twilioStatus: 'pending',
      }).returning();
      
      // If scheduled for later, don't send now
      if (data.scheduledFor && data.scheduledFor > new Date()) {
        return notification;
      }
      
      // Send SMS via Twilio
      const result = await this.sendViaTwilio(notification);
      
      // Update notification with Twilio response
      const [updated] = await db.update(smsNotifications)
        .set({
          twilioMessageSid: result.sid,
          twilioStatus: result.status,
          twilioPrice: result.price ? result.price.toString() : null,
          twilioUnit: result.priceUnit,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(smsNotifications.id, notification.id))
        .returning();
      
      // Update user's daily message count
      if (data.userId) {
        await this.incrementDailyMessageCount(data.userId);
      }
      
      return updated;
      
    } catch (error: any) {
      // Log error to notification record
      if (data.userId) {
        await db.insert(smsNotifications).values({
          userId: data.userId,
          recipientPhone: data.recipientPhone,
          message: data.message,
          notificationType: data.notificationType,
          twilioStatus: 'failed',
          twilioErrorMessage: error.message,
          failedAt: new Date(),
        });
      }
      
      throw error;
    }
  }
  
  // Send SMS via Twilio
  private async sendViaTwilio(notification: SmsNotification): Promise<any> {
    const client = await getTwilioClient();
    const fromPhoneNumber = await getTwilioFromPhoneNumber();
    
    const message = await client.messages.create({
      body: notification.message,
      from: fromPhoneNumber,
      to: notification.recipientPhone,
    });
    
    return message;
  }
  
  // Process SMS template
  private async processTemplate(templateId: string, variables?: Record<string, string>): Promise<string> {
    const [template] = await db.select()
      .from(smsTemplates)
      .where(and(
        eq(smsTemplates.name, templateId),
        eq(smsTemplates.isActive, true)
      ))
      .limit(1);
    
    if (!template) {
      throw new Error('Template not found');
    }
    
    let message = template.messageTemplate;
    
    // Replace variables in template
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });
    }
    
    // Update usage count
    await db.update(smsTemplates)
      .set({
        usageCount: sql`${smsTemplates.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(smsTemplates.id, template.id));
    
    return message;
  }
  
  // Get user SMS preferences
  async getUserSmsPreferences(userId: number): Promise<SmsPreferences | null> {
    const [preferences] = await db.select()
      .from(smsPreferences)
      .where(eq(smsPreferences.userId, userId))
      .limit(1);
    
    return preferences || null;
  }
  
  // Update user SMS preferences
  async updateUserSmsPreferences(userId: number, data: Partial<SmsPreferences>): Promise<SmsPreferences> {
    const existing = await this.getUserSmsPreferences(userId);
    
    if (existing) {
      const [updated] = await db.update(smsPreferences)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(smsPreferences.userId, userId))
        .returning();
      
      return updated;
    } else {
      const [created] = await db.insert(smsPreferences)
        .values({
          userId,
          ...data,
        })
        .returning();
      
      return created;
    }
  }
  
  // Send verification code
  async sendVerificationCode(phoneNumber: string, userId: number): Promise<void> {
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with expiry (10 minutes)
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    
    await this.updateUserSmsPreferences(userId, {
      phoneNumber,
      verificationCode: code,
      verificationCodeExpiry: expiry,
      phoneVerified: false,
    });
    
    // Send verification SMS
    await this.sendSms({
      recipientPhone: phoneNumber,
      message: `Your verification code is: ${code}. This code will expire in 10 minutes.`,
      notificationType: 'verification',
      userId,
      priority: 'high',
    });
  }
  
  // Verify phone number
  async verifyPhoneNumber(userId: number, phoneNumber: string, code: string): Promise<boolean> {
    const preferences = await this.getUserSmsPreferences(userId);
    
    if (!preferences) {
      throw new Error('No verification in progress');
    }
    
    if (preferences.phoneNumber !== phoneNumber) {
      throw new Error('Phone number mismatch');
    }
    
    if (!preferences.verificationCode || !preferences.verificationCodeExpiry) {
      throw new Error('No verification code found');
    }
    
    if (preferences.verificationCodeExpiry < new Date()) {
      throw new Error('Verification code expired');
    }
    
    if (preferences.verificationCode !== code) {
      throw new Error('Invalid verification code');
    }
    
    // Update preferences to mark as verified
    await this.updateUserSmsPreferences(userId, {
      phoneVerified: true,
      verificationCode: null,
      verificationCodeExpiry: null,
      enableSms: true,
    });
    
    return true;
  }
  
  // Check if current time is within quiet hours
  private isQuietHours(preferences: SmsPreferences): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }
    
    const now = new Date();
    const [startHour, startMinute] = preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMinute] = preferences.quietHoursEnd.split(':').map(Number);
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    // Handle case where quiet hours span midnight
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }
  
  // Get end of quiet hours
  private getQuietHoursEnd(preferences: SmsPreferences): Date {
    if (!preferences.quietHoursEnd) {
      return new Date();
    }
    
    const [endHour, endMinute] = preferences.quietHoursEnd.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(endHour, endMinute, 0, 0);
    
    // If end time is in the past, add a day
    if (endTime <= new Date()) {
      endTime.setDate(endTime.getDate() + 1);
    }
    
    return endTime;
  }
  
  // Increment daily message count
  private async incrementDailyMessageCount(userId: number): Promise<void> {
    const preferences = await this.getUserSmsPreferences(userId);
    
    if (!preferences) {
      return;
    }
    
    // Reset count if it's a new day
    const now = new Date();
    const resetAt = preferences.dailyLimitResetAt;
    
    let newCount = preferences.messagesReceivedToday + 1;
    let newResetAt = resetAt;
    
    if (!resetAt || resetAt < now) {
      newCount = 1;
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      newResetAt = tomorrow;
    }
    
    await db.update(smsPreferences)
      .set({
        messagesReceivedToday: newCount,
        dailyLimitResetAt: newResetAt,
        updatedAt: new Date(),
      })
      .where(eq(smsPreferences.userId, userId));
  }
  
  // Get SMS notification history
  async getNotificationHistory(userId: number, limit = 50): Promise<SmsNotification[]> {
    const notifications = await db.select()
      .from(smsNotifications)
      .where(eq(smsNotifications.userId, userId))
      .orderBy(sql`${smsNotifications.createdAt} DESC`)
      .limit(limit);
    
    return notifications;
  }
  
  // Get scheduled notifications
  async getScheduledNotifications(): Promise<SmsNotification[]> {
    const notifications = await db.select()
      .from(smsNotifications)
      .where(and(
        eq(smsNotifications.twilioStatus, 'pending'),
        gt(smsNotifications.scheduledFor, new Date())
      ))
      .orderBy(smsNotifications.scheduledFor);
    
    return notifications;
  }
  
  // Process scheduled notifications (to be called by a cron job)
  async processScheduledNotifications(): Promise<void> {
    const notifications = await db.select()
      .from(smsNotifications)
      .where(and(
        eq(smsNotifications.twilioStatus, 'pending'),
        sql`${smsNotifications.scheduledFor} <= ${new Date()}`
      ))
      .limit(10); // Process in batches
    
    for (const notification of notifications) {
      try {
        const result = await this.sendViaTwilio(notification);
        
        await db.update(smsNotifications)
          .set({
            twilioMessageSid: result.sid,
            twilioStatus: result.status,
            twilioPrice: result.price ? result.price.toString() : null,
            twilioUnit: result.priceUnit,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(smsNotifications.id, notification.id));
          
        if (notification.userId) {
          await this.incrementDailyMessageCount(notification.userId);
        }
      } catch (error: any) {
        await db.update(smsNotifications)
          .set({
            twilioStatus: 'failed',
            twilioErrorMessage: error.message,
            failedAt: new Date(),
            retryCount: sql`${smsNotifications.retryCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(smsNotifications.id, notification.id));
      }
    }
  }
  
  // Handle Twilio webhook updates
  async handleTwilioWebhook(data: {
    MessageSid: string;
    MessageStatus: string;
    ErrorCode?: string;
    ErrorMessage?: string;
  }): Promise<void> {
    await db.update(smsNotifications)
      .set({
        twilioStatus: data.MessageStatus,
        twilioErrorCode: data.ErrorCode || null,
        twilioErrorMessage: data.ErrorMessage || null,
        deliveredAt: data.MessageStatus === 'delivered' ? new Date() : null,
        failedAt: data.MessageStatus === 'failed' || data.MessageStatus === 'undelivered' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(smsNotifications.twilioMessageSid, data.MessageSid));
  }
  
  // Create SMS template
  async createTemplate(data: {
    name: string;
    description?: string;
    notificationType: string;
    messageTemplate: string;
    requiredVariables?: string[];
    createdBy?: number;
  }): Promise<SmsTemplate> {
    const [template] = await db.insert(smsTemplates)
      .values(data)
      .returning();
    
    return template;
  }
  
  // Get all templates
  async getTemplates(): Promise<SmsTemplate[]> {
    const templates = await db.select()
      .from(smsTemplates)
      .where(eq(smsTemplates.isActive, true))
      .orderBy(smsTemplates.name);
    
    return templates;
  }
}

// Export singleton instance
export const smsService = new SmsService();