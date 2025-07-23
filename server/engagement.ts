import { eq, and, gte, desc, sql } from "drizzle-orm";
import { db } from "./db";
import { 
  users, userEngagement, emailPreferences, emailCampaigns, 
  emailSendLog, userActivity, type UserEngagement, type EmailPreferences,
  type EmailSendLog, type UserActivity as UserActivityType
} from "@shared/schema";
import { 
  sendWelcomeEmail, sendReengagementEmail, sendFeatureDiscoveryEmail,
  sendUsageInsightsEmail, sendProductTipsEmail, type EngagementEmailOptions
} from "./email";

// =============================================================================
// ENGAGEMENT TRACKING SERVICE
// =============================================================================

export class EngagementService {
  
  /**
   * Initialize engagement tracking for a new user
   */
  async initializeUserEngagement(userId: number): Promise<void> {
    try {
      await this.ensureUserEngagementExists(userId);

      // Send welcome email after a short delay (only for truly new users)
      setTimeout(async () => {
        await this.sendWelcomeEmail(userId);
      }, 2000);

    } catch (error) {
      console.error('Error initializing user engagement:', error);
    }
  }

  /**
   * Ensure user engagement records exist (safe for existing users)
   */
  async ensureUserEngagementExists(userId: number): Promise<void> {
    try {
      // Check if engagement record exists
      const existingEngagement = await db
        .select()
        .from(userEngagement)
        .where(eq(userEngagement.userId, userId))
        .limit(1);

      // Create engagement record if it doesn't exist
      if (existingEngagement.length === 0) {
        await db.insert(userEngagement).values({
          userId,
          firstSessionAt: new Date(),
          lastActivityAt: new Date(),
        });
      }

      // Check if email preferences exist
      const existingPreferences = await db
        .select()
        .from(emailPreferences)
        .where(eq(emailPreferences.userId, userId))
        .limit(1);

      // Create default email preferences if they don't exist
      if (existingPreferences.length === 0) {
        const unsubscribeToken = await this.generateUnsubscribeToken();
        await db.insert(emailPreferences).values({
          userId,
          unsubscribeToken,
        });
      }

    } catch (error) {
      console.error('Error ensuring user engagement exists:', error);
      throw error;
    }
  }

  /**
   * Track user activity
   */
  async trackActivity(
    userId: number, 
    activityType: string, 
    activityData?: Record<string, any>,
    sessionId?: string,
    userAgent?: string,
    ipAddress?: string,
    duration?: number
  ): Promise<void> {
    try {
      // Record the activity
      await db.insert(userActivity).values({
        userId,
        activityType,
        activityData,
        sessionId,
        userAgent,
        ipAddress,
        duration,
      });

      // Update engagement metrics
      await this.updateEngagementMetrics(userId, activityType, activityData);

    } catch (error) {
      console.error('Error tracking activity:', error);
    }
  }

  /**
   * Update user engagement metrics
   */
  private async updateEngagementMetrics(
    userId: number, 
    activityType: string, 
    activityData?: Record<string, any>
  ): Promise<void> {
    try {
      const updates: Partial<UserEngagement> = {
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      };

             // Update metrics based on activity type
       // Note: We'll use direct updates with SQL to increment values
       const sqlUpdates: Record<string, any> = {
         lastActivityAt: new Date(),
         updatedAt: new Date(),
       };

       switch (activityType) {
         case 'login':
           sqlUpdates.lastLoginAt = new Date();
           sqlUpdates.totalLogins = sql`${userEngagement.totalLogins} + 1`;
           break;
         case 'session_start':
           sqlUpdates.totalSessions = sql`${userEngagement.totalSessions} + 1`;
           break;
         case 'file_upload':
           sqlUpdates.filesUploaded = sql`${userEngagement.filesUploaded} + 1`;
           break;
         case 'file_analyze':
           sqlUpdates.filesAnalyzed = sql`${userEngagement.filesAnalyzed} + 1`;
           break;
         case 'chat_message':
           sqlUpdates.chatMessagesCount = sql`${userEngagement.chatMessagesCount} + 1`;
           sqlUpdates.aiInteractions = sql`${userEngagement.aiInteractions} + 1`;
           break;
         case 'session_end':
           if (activityData?.duration) {
             sqlUpdates.totalTimeSpent = sql`${userEngagement.totalTimeSpent} + ${activityData.duration}`;
           }
           break;
       }

             await db
         .update(userEngagement)
         .set(sqlUpdates)
         .where(eq(userEngagement.userId, userId));

      // Update engagement score and segment
      await this.calculateEngagementScore(userId);

    } catch (error) {
      console.error('Error updating engagement metrics:', error);
    }
  }

  /**
   * Calculate and update user engagement score
   */
  private async calculateEngagementScore(userId: number): Promise<void> {
    try {
      const engagement = await db
        .select()
        .from(userEngagement)
        .where(eq(userEngagement.userId, userId))
        .limit(1);

      if (!engagement.length) return;

      const user = engagement[0];
      const now = new Date();
      const daysSinceFirst = Math.floor((now.getTime() - user.firstSessionAt!.getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceLastActivity = user.lastActivityAt 
        ? Math.floor((now.getTime() - user.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Calculate engagement score (0-100)
      let score = 0;
      
      // Login frequency (25 points max)
      const loginFrequency = daysSinceFirst > 0 ? (user.totalLogins || 0) / daysSinceFirst : 0;
      score += Math.min(25, loginFrequency * 5);
      
      // Feature usage (25 points max)
      const featureUsage = (user.filesAnalyzed || 0) + (user.chatMessagesCount || 0) / 10;
      score += Math.min(25, featureUsage);
      
      // Recency (25 points max)
      if (daysSinceLastActivity === 0) score += 25;
      else if (daysSinceLastActivity <= 1) score += 20;
      else if (daysSinceLastActivity <= 3) score += 15;
      else if (daysSinceLastActivity <= 7) score += 10;
      else if (daysSinceLastActivity <= 14) score += 5;
      
      // Time spent (25 points max)
      const avgTimePerSession = (user.totalSessions || 0) > 0 
        ? (user.totalTimeSpent || 0) / (user.totalSessions || 1) 
        : 0;
      score += Math.min(25, avgTimePerSession / 2);

      // Determine user segment
      let segment = 'new';
      if (daysSinceFirst > 30) {
        if (score >= 70) segment = 'active';
        else if (score >= 40) segment = 'at_risk';
        else segment = 'dormant';
      } else if (daysSinceFirst > 7) {
        segment = score >= 50 ? 'active' : 'at_risk';
      }

      // Update engagement score and segment
      await db
        .update(userEngagement)
        .set({
          engagementScore: Math.round(score),
          userSegment: segment,
          updatedAt: new Date(),
        })
        .where(eq(userEngagement.userId, userId));

    } catch (error) {
      console.error('Error calculating engagement score:', error);
    }
  }

  /**
   * Get user engagement data
   */
  async getUserEngagement(userId: number): Promise<UserEngagement | null> {
    try {
      const result = await db
        .select()
        .from(userEngagement)
        .where(eq(userEngagement.userId, userId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error getting user engagement:', error);
      return null;
    }
  }

  /**
   * Get user activity history
   */
  async getUserActivity(userId: number, limit: number = 50): Promise<UserActivityType[]> {
    try {
      return await db
        .select()
        .from(userActivity)
        .where(eq(userActivity.userId, userId))
        .orderBy(desc(userActivity.timestamp))
        .limit(limit);
    } catch (error) {
      console.error('Error getting user activity:', error);
      return [];
    }
  }

  // =============================================================================
  // EMAIL PREFERENCE MANAGEMENT
  // =============================================================================

  /**
   * Get user email preferences
   */
  async getEmailPreferences(userId: number): Promise<EmailPreferences | null> {
    try {
      const result = await db
        .select()
        .from(emailPreferences)
        .where(eq(emailPreferences.userId, userId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error getting email preferences:', error);
      return null;
    }
  }

  /**
   * Update user email preferences
   */
  async updateEmailPreferences(
    userId: number, 
    preferences: Partial<EmailPreferences>
  ): Promise<boolean> {
    try {
      await db
        .update(emailPreferences)
        .set({
          ...preferences,
          updatedAt: new Date(),
        })
        .where(eq(emailPreferences.userId, userId));

      return true;
    } catch (error) {
      console.error('Error updating email preferences:', error);
      return false;
    }
  }

  /**
   * Unsubscribe user from emails
   */
  async unsubscribeUser(token: string, reason?: string): Promise<boolean> {
    try {
      const result = await db
        .update(emailPreferences)
        .set({
          isUnsubscribed: true,
          unsubscribedAt: new Date(),
          unsubscribeReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(emailPreferences.unsubscribeToken, token))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Error unsubscribing user:', error);
      return false;
    }
  }

  /**
   * Generate unsubscribe token
   */
  private async generateUnsubscribeToken(): Promise<string> {
    const crypto = await import('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  // =============================================================================
  // EMAIL CAMPAIGN MANAGEMENT
  // =============================================================================

  /**
   * Send welcome email to new user
   */
     async sendWelcomeEmail(userId: number): Promise<boolean> {
     try {
       const user = await this.getUserForEmail(userId);
       if (!user || !user.preferences?.welcomeEmails || user.preferences?.isUnsubscribed) {
         return false;
       }

       const trackingTokens = await this.generateTrackingTokens();
       
       await sendWelcomeEmail({
         to: user.email,
         name: user.firstName || user.username || '',
         unsubscribeToken: user.preferences?.unsubscribeToken || undefined,
         trackingPixel: trackingTokens.openToken,
       });

      await this.logEmailSent(userId, 'welcome', 'Welcome to Uterpi! Let\'s get you started 🚀', trackingTokens);
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }
  }

  /**
   * Send re-engagement email to inactive users
   */
  async sendReengagementEmail(userId: number): Promise<boolean> {
    try {
      const user = await this.getUserForEmail(userId);
      if (!user || !user.preferences?.reengagementEmails || user.preferences?.isUnsubscribed) {
        return false;
      }

      const engagement = await this.getUserEngagement(userId);
      if (!engagement) return false;

      const daysSinceLastLogin = engagement.lastLoginAt 
        ? Math.floor((Date.now() - engagement.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
        : 30;

      const trackingTokens = await this.generateTrackingTokens();
      
      await sendReengagementEmail({
        to: user.email,
        name: user.firstName || user.username || '',
        unsubscribeToken: user.preferences?.unsubscribeToken || undefined,
        trackingPixel: trackingTokens.openToken,
        personalData: {
          daysSinceLastLogin,
          totalSessions: engagement.totalSessions,
          filesAnalyzed: engagement.filesAnalyzed,
          chatMessages: engagement.chatMessagesCount,
        },
      });

      await this.logEmailSent(userId, 'reengagement', `We miss you! Your NomadAI assistant is waiting ⏰`, trackingTokens);
      return true;
    } catch (error) {
      console.error('Error sending reengagement email:', error);
      return false;
    }
  }

  /**
   * Send feature discovery email
   */
  async sendFeatureDiscoveryEmail(userId: number): Promise<boolean> {
    try {
      const user = await this.getUserForEmail(userId);
      if (!user || !user.preferences?.featureUpdates || user.preferences?.isUnsubscribed) {
        return false;
      }

      const unusedFeatures = await this.getUnusedFeatures(userId);
      if (unusedFeatures.length === 0) return false;

      const trackingTokens = await this.generateTrackingTokens();
      
      await sendFeatureDiscoveryEmail({
        to: user.email,
        name: user.firstName || user.username || '',
        unsubscribeToken: user.preferences?.unsubscribeToken || undefined,
        trackingPixel: trackingTokens.openToken,
        personalData: { unusedFeatures },
      });

      await this.logEmailSent(userId, 'feature_discovery', 'Discover hidden NomadAI features! 🔍', trackingTokens);
      return true;
    } catch (error) {
      console.error('Error sending feature discovery email:', error);
      return false;
    }
  }

  /**
   * Send usage insights email (weekly/monthly)
   */
  async sendUsageInsightsEmail(userId: number, period: 'week' | 'month' = 'week'): Promise<boolean> {
    try {
      const user = await this.getUserForEmail(userId);
      if (!user || !user.preferences?.usageInsights || user.preferences?.isUnsubscribed) {
        return false;
      }

      const stats = await this.getUserStats(userId, period);
      if (!stats) return false;

      const trackingTokens = await this.generateTrackingTokens();
      
      await sendUsageInsightsEmail({
        to: user.email,
        name: user.firstName || user.username || '',
        unsubscribeToken: user.preferences?.unsubscribeToken || undefined,
        trackingPixel: trackingTokens.openToken,
        personalData: { period, stats },
      });

      await this.logEmailSent(userId, 'usage_insights', `Your ${period}ly NomadAI insights are here! 📊`, trackingTokens);
      return true;
    } catch (error) {
      console.error('Error sending usage insights email:', error);
      return false;
    }
  }

  /**
   * Send product tips email
   */
  async sendProductTipsEmail(userId: number, tipCategory: string = 'general'): Promise<boolean> {
    try {
      const user = await this.getUserForEmail(userId);
      if (!user || !user.preferences?.productTips || user.preferences?.isUnsubscribed) {
        return false;
      }

      const trackingTokens = await this.generateTrackingTokens();
      
      await sendProductTipsEmail({
        to: user.email,
        name: user.firstName || user.username || '',
        unsubscribeToken: user.preferences?.unsubscribeToken || undefined,
        trackingPixel: trackingTokens.openToken,
        personalData: { tipCategory },
      });

      await this.logEmailSent(userId, 'product_tips', 'Here are your AI productivity tips! 💡', trackingTokens);
      return true;
    } catch (error) {
      console.error('Error sending product tips email:', error);
      return false;
    }
  }

  // =============================================================================
  // AUTOMATED CAMPAIGNS
  // =============================================================================

  /**
   * Run daily engagement campaigns
   */
  async runDailyCampaigns(): Promise<void> {
    console.log('Running daily engagement campaigns...');
    
    try {
      // Send welcome emails to users who registered 2 hours ago
      await this.sendWelcomeEmailsToNewUsers();
      
      // Send re-engagement emails to users inactive for 7+ days
      await this.sendReengagementEmails();
      
      // Send feature discovery emails to users who haven't used key features
      await this.sendFeatureDiscoveryEmails();
      
      console.log('Daily engagement campaigns completed');
    } catch (error) {
      console.error('Error running daily campaigns:', error);
    }
  }

  /**
   * Run weekly engagement campaigns
   */
  async runWeeklyCampaigns(): Promise<void> {
    console.log('Running weekly engagement campaigns...');
    
    try {
      // Send weekly usage insights
      await this.sendWeeklyUsageInsights();
      
      // Send product tips
      await this.sendWeeklyProductTips();
      
      console.log('Weekly engagement campaigns completed');
    } catch (error) {
      console.error('Error running weekly campaigns:', error);
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async getUserForEmail(userId: number) {
    try {
      const result = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          preferences: emailPreferences,
        })
        .from(users)
        .leftJoin(emailPreferences, eq(users.id, emailPreferences.userId))
        .where(eq(users.id, userId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error getting user for email:', error);
      return null;
    }
  }

  private async generateTrackingTokens() {
    const crypto = await import('crypto');
    return {
      openToken: crypto.randomBytes(16).toString('hex'),
      clickToken: crypto.randomBytes(16).toString('hex'),
    };
  }

  private async logEmailSent(
    userId: number, 
    emailType: string, 
    subject: string, 
    trackingTokens: { openToken: string; clickToken: string },
    campaignId?: number
  ) {
    try {
      const user = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user.length) return;

      await db.insert(emailSendLog).values({
        userId,
        campaignId,
        emailType,
        emailSubject: subject,
        recipientEmail: user[0].email,
        openTrackingToken: trackingTokens.openToken,
        clickTrackingToken: trackingTokens.clickToken,
      });
    } catch (error) {
      console.error('Error logging email sent:', error);
    }
  }

  private async getUnusedFeatures(userId: number): Promise<string[]> {
    try {
      const engagement = await this.getUserEngagement(userId);
      if (!engagement) return [];

      const unusedFeatures = [];
      
      if ((engagement.filesUploaded || 0) === 0) {
        unusedFeatures.push('File Analysis');
      }
      
      if ((engagement.chatMessagesCount || 0) < 5) {
        unusedFeatures.push('Advanced Chat Features');
      }

      // Check for model selection usage (this would need tracking)
      unusedFeatures.push('Model Selection');

      return unusedFeatures;
    } catch (error) {
      console.error('Error getting unused features:', error);
      return [];
    }
  }

  private async getUserStats(userId: number, period: 'week' | 'month') {
    try {
      const daysBack = period === 'week' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const activities = await db
        .select()
        .from(userActivity)
        .where(
          and(
            eq(userActivity.userId, userId),
            gte(userActivity.timestamp, startDate)
          )
        );

      const sessionCount = activities.filter(a => a.activityType === 'session_start').length;
      const messageCount = activities.filter(a => a.activityType === 'chat_message').length;
      const filesAnalyzed = activities.filter(a => a.activityType === 'file_analyze').length;
      const totalDuration = activities
        .filter(a => a.activityType === 'session_end')
        .reduce((sum, a) => sum + (a.duration || 0), 0);

      // Find most active day
      const dailyActivities: Record<string, number> = {};
      activities.forEach(activity => {
        const day = activity.timestamp?.toISOString().split('T')[0] || '';
        dailyActivities[day] = (dailyActivities[day] || 0) + 1;
      });

      const mostActiveDay = Object.entries(dailyActivities)
        .sort(([,a], [,b]) => b - a)[0];

      const achievements = [];
      if (sessionCount >= 5) achievements.push('Consistent user - 5+ sessions');
      if (messageCount >= 50) achievements.push('Chat master - 50+ messages');
      if (filesAnalyzed >= 3) achievements.push('File analyzer - 3+ files');

      return {
        sessions: sessionCount,
        messages: messageCount,
        filesAnalyzed,
        timeSpent: Math.round(totalDuration / 60), // Convert to minutes
        mostActiveDay: mostActiveDay ? new Date(mostActiveDay[0]).toLocaleDateString('en-US', { weekday: 'long' }) : 'Wednesday',
        mostActiveDayCount: mostActiveDay ? mostActiveDay[1] : 0,
        achievements,
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return null;
    }
  }

  private async sendWelcomeEmailsToNewUsers(): Promise<void> {
    // Implementation for sending welcome emails to new users
    // This would query for users who registered 2 hours ago and don't have welcome emails sent
  }

  private async sendReengagementEmails(): Promise<void> {
    // Implementation for sending re-engagement emails
    // This would query for users who haven't logged in for 7+ days
  }

  private async sendFeatureDiscoveryEmails(): Promise<void> {
    // Implementation for sending feature discovery emails
    // This would identify users who haven't used key features
  }

  private async sendWeeklyUsageInsights(): Promise<void> {
    // Implementation for sending weekly usage insights
    // This would send to all active users who have opted in
  }

  private async sendWeeklyProductTips(): Promise<void> {
    // Implementation for sending weekly product tips
    // This would send different tips based on user behavior
  }
}

// Create singleton instance
export const engagementService = new EngagementService(); 