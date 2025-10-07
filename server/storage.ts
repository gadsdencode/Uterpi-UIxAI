import { 
  users, 
  type User, 
  type InsertUser, 
  type RegisterUser, 
  type OAuthUser, 
  type UpdateProfile,
  smsNotifications,
  smsPreferences,
  smsTemplates,
  type SmsNotification,
  type InsertSmsNotification,
  type SmsPreferences,
  type UpdateSmsPreferences,
  type SmsTemplate,
  type InsertSmsTemplate
} from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { engagementService } from "./engagement";
import dotenv from "dotenv";
import { Profile } from "passport";
dotenv.config();

export interface IStorage {
  // User CRUD operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  
  // Authentication methods
  createUser(user: RegisterUser): Promise<User>;
  createOAuthUser(user: OAuthUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  updateUserProfile(id: number, profileData: UpdateProfile): Promise<User | undefined>;
  verifyPassword(email: string, password: string): Promise<User | null>;
  
  // OAuth linking
  linkGoogleAccount(userId: number, googleId: string): Promise<User | undefined>;
  
  // Password reset methods
  generatePasswordResetToken(email: string): Promise<string | null>;
  validatePasswordResetToken(token: string): Promise<User | null>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;
  clearPasswordResetToken(userId: number): Promise<void>;
  
  // SMS notification methods
  getSmsNotification(id: number): Promise<SmsNotification | undefined>;
  getSmsNotificationsByUser(userId: number, limit?: number): Promise<SmsNotification[]>;
  createSmsNotification(notification: InsertSmsNotification): Promise<SmsNotification>;
  updateSmsNotification(id: number, updates: Partial<SmsNotification>): Promise<SmsNotification | undefined>;
  
  // SMS preferences methods
  getSmsPreferences(userId: number): Promise<SmsPreferences | undefined>;
  createSmsPreferences(prefs: Partial<SmsPreferences>): Promise<SmsPreferences>;
  updateSmsPreferences(userId: number, updates: UpdateSmsPreferences): Promise<SmsPreferences | undefined>;
  
  // SMS template methods
  getSmsTemplate(id: number): Promise<SmsTemplate | undefined>;
  getSmsTemplateByName(name: string): Promise<SmsTemplate | undefined>;
  getAllSmsTemplates(): Promise<SmsTemplate[]>;
  createSmsTemplate(template: InsertSmsTemplate): Promise<SmsTemplate>;
  updateSmsTemplate(id: number, updates: Partial<SmsTemplate>): Promise<SmsTemplate | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id));
      return result[0];
    } catch (error) {
      console.error("Error getting user by ID:", error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.email, email));
      return result[0];
    } catch (error) {
      console.error("Error getting user by email:", error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      if (!username) return undefined;
      const result = await db.select().from(users).where(eq(users.username, username));
      return result[0];
    } catch (error) {
      console.error("Error getting user by username:", error);
      return undefined;
    }
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.googleId, googleId));
      return result[0];
    } catch (error) {
      console.error("Error getting user by Google ID:", error);
      return undefined;
    }
  }

  async createUser(userData: RegisterUser): Promise<User> {
    try {
      // Hash the password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
      
      // Check if user with email already exists
      const existingUser = await this.getUserByEmail(userData.email);
      if (existingUser) {
        throw new Error("User with this email already exists");
      }
      
      // Check if username is provided and already exists
      if (userData.username) {
        const existingUsername = await this.getUserByUsername(userData.username);
        if (existingUsername) {
          throw new Error("Username already exists");
        }
      }
      
      const newUser = {
        email: userData.email,
        password: hashedPassword,
        username: userData.username || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        emailVerified: false,
        age: null,
        dateOfBirth: null,
        bio: null,
        // New team and credits fields with defaults
        teamId: null,
        teamRole: null,
        ai_credits_balance: 0,
        ai_credits_used_this_month: 0,
        credits_reset_at: new Date(),
        messages_used_this_month: 0,
        messages_reset_at: new Date(),
        is_grandfathered: false,
        grandfathered_from_tier: null,
        grandfathered_at: null,
        // Set default subscription tier to freemium
        subscription_tier: 'freemium',
        subscription_status: 'freemium',
        deletedAt: null,
      };
      
      const result = await db.insert(users).values(newUser).returning();
      const user = result[0];
      
      // Initialize engagement tracking for new user
      if (user) {
        await engagementService.initializeUserEngagement(user.id);
      }
      
      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async createOAuthUser(userData: OAuthUser): Promise<User> {
    try {
      // Check if user with email already exists
      const existingUser = await this.getUserByEmail(userData.email);
      if (existingUser) {
        // If user exists but doesn't have this OAuth provider linked, link it
        if (userData.googleId && !existingUser.googleId) {
          const updated = await this.linkGoogleAccount(existingUser.id, userData.googleId);
          if (updated) return updated;
        }
        return existingUser;
      }
      
      // Check if OAuth ID already exists
      if (userData.googleId) {
        const existingOAuth = await this.getUserByGoogleId(userData.googleId);
        if (existingOAuth) {
          return existingOAuth;
        }
      }
      
      const newUser = {
        email: userData.email,
        googleId: userData.googleId || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        avatar: userData.avatar || null,
        emailVerified: userData.emailVerified ?? true,
        password: null, // OAuth users don't have passwords initially
        age: null,
        dateOfBirth: null,
        bio: null,
        // New team and credits fields with defaults
        teamId: null,
        teamRole: null,
        ai_credits_balance: 0,
        ai_credits_used_this_month: 0,
        credits_reset_at: new Date(),
        messages_used_this_month: 0,
        messages_reset_at: new Date(),
        is_grandfathered: false,
        grandfathered_from_tier: null,
        grandfathered_at: null,
        deletedAt: null,
      };
      
      const result = await db.insert(users).values(newUser).returning();
      const user = result[0];
      
      // Initialize engagement tracking for new user
      if (user) {
        await engagementService.initializeUserEngagement(user.id);
      }
      
      return user;
    } catch (error) {
      console.error("Error creating OAuth user:", error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    try {
      const result = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating user:", error);
      return undefined;
    }
  }

  async updateUserProfile(id: number, profileData: UpdateProfile): Promise<User | undefined> {
    try {
      // Convert dateOfBirth string to Date object if provided
      const updateData: any = { ...profileData, updatedAt: new Date() };
      
      if (profileData.dateOfBirth) {
        updateData.dateOfBirth = new Date(profileData.dateOfBirth);
      }
      
      const result = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating user profile:", error);
      return undefined;
    }
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user || !user.password) {
        return null;
      }
      
      const isValid = await bcrypt.compare(password, user.password);
      return isValid ? user : null;
    } catch (error) {
      console.error("Error verifying password:", error);
      return null;
    }
  }

  async linkGoogleAccount(userId: number, googleId: string): Promise<User | undefined> {
    try {
      const result = await db
        .update(users)
        .set({ googleId, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error linking Google account:", error);
      return undefined;
    }
  }

  async generatePasswordResetToken(email: string): Promise<string | null> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        return null; // User doesn't exist
      }

      // Generate a secure random token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Set expiry to 1 hour from now
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Update user with reset token
      await db
        .update(users)
        .set({ 
          resetToken,
          resetTokenExpiry,
          updatedAt: new Date()
        })
        .where(eq(users.id, user.id));

      return resetToken;
    } catch (error) {
      console.error("Error generating password reset token:", error);
      return null;
    }
  }

  async validatePasswordResetToken(token: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.resetToken, token));
      
      const user = result[0];
      if (!user || !user.resetTokenExpiry) {
        return null; // Token doesn't exist
      }

      // Check if token has expired
      if (new Date() > user.resetTokenExpiry) {
        // Clear expired token
        await this.clearPasswordResetToken(user.id);
        return null;
      }

      return user;
    } catch (error) {
      console.error("Error validating password reset token:", error);
      return null;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      const user = await this.validatePasswordResetToken(token);
      if (!user) {
        return false; // Invalid or expired token
      }

      // Hash the new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password and clear reset token
      await db
        .update(users)
        .set({
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, user.id));

      return true;
    } catch (error) {
      console.error("Error resetting password:", error);
      return false;
    }
  }

  async clearPasswordResetToken(userId: number): Promise<void> {
    try {
      await db
        .update(users)
        .set({
          resetToken: null,
          resetTokenExpiry: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("Error clearing password reset token:", error);
      // Don't throw, as this is a cleanup operation
    }
  }

  // SMS notification methods
  async getSmsNotification(id: number): Promise<SmsNotification | undefined> {
    try {
      const result = await db.select().from(smsNotifications).where(eq(smsNotifications.id, id));
      return result[0];
    } catch (error) {
      console.error("Error getting SMS notification:", error);
      return undefined;
    }
  }

  async getSmsNotificationsByUser(userId: number, limit = 50): Promise<SmsNotification[]> {
    try {
      const result = await db.select()
        .from(smsNotifications)
        .where(eq(smsNotifications.userId, userId))
        .orderBy(smsNotifications.createdAt)
        .limit(limit);
      return result;
    } catch (error) {
      console.error("Error getting SMS notifications by user:", error);
      return [];
    }
  }

  async createSmsNotification(notification: InsertSmsNotification): Promise<SmsNotification> {
    try {
      const result = await db.insert(smsNotifications).values(notification).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating SMS notification:", error);
      throw error;
    }
  }

  async updateSmsNotification(id: number, updates: Partial<SmsNotification>): Promise<SmsNotification | undefined> {
    try {
      const result = await db.update(smsNotifications)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(smsNotifications.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating SMS notification:", error);
      return undefined;
    }
  }

  // SMS preferences methods
  async getSmsPreferences(userId: number): Promise<SmsPreferences | undefined> {
    try {
      const result = await db.select().from(smsPreferences).where(eq(smsPreferences.userId, userId));
      return result[0];
    } catch (error) {
      console.error("Error getting SMS preferences:", error);
      return undefined;
    }
  }

  async createSmsPreferences(prefs: Partial<SmsPreferences>): Promise<SmsPreferences> {
    try {
      const { id, createdAt, updatedAt, ...insertableData } = prefs as any;
      const result = await db.insert(smsPreferences).values(insertableData).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating SMS preferences:", error);
      throw error;
    }
  }

  async updateSmsPreferences(userId: number, updates: UpdateSmsPreferences): Promise<SmsPreferences | undefined> {
    try {
      const existing = await this.getSmsPreferences(userId);
      
      if (existing) {
        const result = await db.update(smsPreferences)
          .set({
            ...updates,
            updatedAt: new Date()
          })
          .where(eq(smsPreferences.userId, userId))
          .returning();
        return result[0];
      } else {
        // Create preferences if they don't exist
        const result = await db.insert(smsPreferences)
          .values({
            userId,
            ...updates
          })
          .returning();
        return result[0];
      }
    } catch (error) {
      console.error("Error updating SMS preferences:", error);
      return undefined;
    }
  }

  // SMS template methods
  async getSmsTemplate(id: number): Promise<SmsTemplate | undefined> {
    try {
      const result = await db.select().from(smsTemplates).where(eq(smsTemplates.id, id));
      return result[0];
    } catch (error) {
      console.error("Error getting SMS template:", error);
      return undefined;
    }
  }

  async getSmsTemplateByName(name: string): Promise<SmsTemplate | undefined> {
    try {
      const result = await db.select().from(smsTemplates).where(eq(smsTemplates.name, name));
      return result[0];
    } catch (error) {
      console.error("Error getting SMS template by name:", error);
      return undefined;
    }
  }

  async getAllSmsTemplates(): Promise<SmsTemplate[]> {
    try {
      const result = await db.select()
        .from(smsTemplates)
        .where(eq(smsTemplates.isActive, true))
        .orderBy(smsTemplates.name);
      return result;
    } catch (error) {
      console.error("Error getting all SMS templates:", error);
      return [];
    }
  }

  async createSmsTemplate(template: InsertSmsTemplate): Promise<SmsTemplate> {
    try {
      const result = await db.insert(smsTemplates).values(template).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating SMS template:", error);
      throw error;
    }
  }

  async updateSmsTemplate(id: number, updates: Partial<SmsTemplate>): Promise<SmsTemplate | undefined> {
    try {
      const result = await db.update(smsTemplates)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(smsTemplates.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating SMS template:", error);
      return undefined;
    }
  }
}

// Keep memory storage for development/testing purposes (fallback)
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.currentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.googleId === googleId,
    );
  }

  async createUser(userData: RegisterUser): Promise<User> {
    // Check if user already exists
    const existing = await this.getUserByEmail(userData.email);
    if (existing) {
      throw new Error("User with this email already exists");
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
    
    const id = this.currentId++;
    const user: User = {
      id,
      email: userData.email,
      password: hashedPassword,
      username: userData.username || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      emailVerified: false,
      googleId: null,
      avatar: null,
      age: null,
      dateOfBirth: null,
      bio: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      stripeCustomerId: null,
      subscriptionStatus: 'freemium',
      subscriptionTier: 'freemium',
      subscriptionEndsAt: null,
      overrideExpiresAt: null,
      accessOverride: null,
      overrideReason: null,
      overrideGrantedBy: null,
      overrideGrantedAt: null,
      resetToken: null,
      resetTokenExpiry: null,
      // New team and credits fields
      deletedAt: null,
      ai_credits_balance: 0,
      ai_credits_used_this_month: 0,
      credits_reset_at: new Date(),
      messages_used_this_month: 0,
      messages_reset_at: new Date(),
      teamId: null,
      teamRole: null,
      is_grandfathered: false,
      grandfathered_from_tier: null,
      grandfathered_at: null,
    };
    
    this.users.set(id, user);
    return user;
  }

  async createOAuthUser(userData: OAuthUser): Promise<User> {
    const existing = await this.getUserByEmail(userData.email);
    if (existing) return existing;

    const id = this.currentId++;
    const user: User = {
      id,
      email: userData.email,
      password: null,
      username: null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      emailVerified: userData.emailVerified ?? true,
      googleId: userData.googleId || null,
      avatar: userData.avatar || null,
      age: null,
      dateOfBirth: null,
      bio: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      stripeCustomerId: null,
      subscriptionStatus: 'freemium',
      subscriptionTier: 'freemium',
      subscriptionEndsAt: null,
      overrideExpiresAt: null,
      accessOverride: null,
      overrideReason: null,
      overrideGrantedBy: null,
      overrideGrantedAt: null,
      resetToken: null,
      resetTokenExpiry: null,
      // New team and credits fields
      deletedAt: null,
      ai_credits_balance: 0,
      ai_credits_used_this_month: 0,
      credits_reset_at: new Date(),
      messages_used_this_month: 0,
      messages_reset_at: new Date(),
      teamId: null,
      teamRole: null,
      is_grandfathered: false,
      grandfathered_from_tier: null,
      grandfathered_at: null,
    };
    
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserProfile(id: number, profileData: UpdateProfile): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    // Convert dateOfBirth string to Date object if provided
    const updateData: any = { ...profileData, updatedAt: new Date() };
    
    if (profileData.dateOfBirth) {
      updateData.dateOfBirth = new Date(profileData.dateOfBirth);
    }

    const updatedUser = { ...user, ...updateData } as any;
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.password) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async linkGoogleAccount(userId: number, googleId: string): Promise<User | undefined> {
    return this.updateUser(userId, { googleId });
  }

  async generatePasswordResetToken(email: string): Promise<string | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;

    // Generate a simple token for memory storage
    const crypto = await import('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const updatedUser = { 
      ...user, 
      resetToken, 
      resetTokenExpiry, 
      updatedAt: new Date() 
    };
    this.users.set(user.id, updatedUser);
    return resetToken;
  }

  async validatePasswordResetToken(token: string): Promise<User | null> {
    const userArray = Array.from(this.users.values());
    for (const user of userArray) {
      if (user.resetToken === token && user.resetTokenExpiry) {
        if (new Date() > user.resetTokenExpiry) {
          // Clear expired token
          await this.clearPasswordResetToken(user.id);
          return null;
        }
        return user;
      }
    }
    return null;
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const user = await this.validatePasswordResetToken(token);
    if (!user) return false;

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const updatedUser = {
      ...user,
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
      updatedAt: new Date()
    };
    this.users.set(user.id, updatedUser);
    return true;
  }

  async clearPasswordResetToken(userId: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const updatedUser = {
        ...user,
        resetToken: null,
        resetTokenExpiry: null,
        updatedAt: new Date()
      };
      this.users.set(userId, updatedUser);
    }
  }

  // SMS notification methods - stub implementations for MemStorage
  async getSmsNotification(id: number): Promise<SmsNotification | undefined> {
    // MemStorage doesn't support SMS notifications
    return undefined;
  }

  async getSmsNotificationsByUser(userId: number, limit?: number): Promise<SmsNotification[]> {
    // MemStorage doesn't support SMS notifications
    return [];
  }

  async createSmsNotification(notification: InsertSmsNotification): Promise<SmsNotification> {
    // MemStorage doesn't support SMS notifications - throw error
    throw new Error("SMS notifications not supported in memory storage");
  }

  async updateSmsNotification(id: number, updates: Partial<SmsNotification>): Promise<SmsNotification | undefined> {
    // MemStorage doesn't support SMS notifications
    return undefined;
  }

  // SMS preferences methods - stub implementations for MemStorage
  async getSmsPreferences(userId: number): Promise<SmsPreferences | undefined> {
    // MemStorage doesn't support SMS preferences
    return undefined;
  }

  async createSmsPreferences(prefs: Partial<SmsPreferences>): Promise<SmsPreferences> {
    // MemStorage doesn't support SMS preferences - throw error
    throw new Error("SMS preferences not supported in memory storage");
  }

  async updateSmsPreferences(userId: number, updates: UpdateSmsPreferences): Promise<SmsPreferences | undefined> {
    // MemStorage doesn't support SMS preferences
    return undefined;
  }

  // SMS template methods - stub implementations for MemStorage
  async getSmsTemplate(id: number): Promise<SmsTemplate | undefined> {
    // MemStorage doesn't support SMS templates
    return undefined;
  }

  async getSmsTemplateByName(name: string): Promise<SmsTemplate | undefined> {
    // MemStorage doesn't support SMS templates
    return undefined;
  }

  async getAllSmsTemplates(): Promise<SmsTemplate[]> {
    // MemStorage doesn't support SMS templates
    return [];
  }

  async createSmsTemplate(template: InsertSmsTemplate): Promise<SmsTemplate> {
    // MemStorage doesn't support SMS templates - throw error
    throw new Error("SMS templates not supported in memory storage");
  }

  async updateSmsTemplate(id: number, updates: Partial<SmsTemplate>): Promise<SmsTemplate | undefined> {
    // MemStorage doesn't support SMS templates
    return undefined;
  }
}

// Always use database storage since Replit has PostgreSQL configured
export const storage = new DatabaseStorage();
