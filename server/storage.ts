import { users, type User, type InsertUser, type RegisterUser, type OAuthUser, type UpdateProfile } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "./db";
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
      };
      
      const result = await db.insert(users).values(newUser).returning();
      return result[0];
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
      };
      
      const result = await db.insert(users).values(newUser).returning();
      return result[0];
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
      const result = await db
        .update(users)
        .set({ ...profileData, updatedAt: new Date() } as any)
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
      subscriptionStatus: null,
      subscriptionTier: null,
      subscriptionEndsAt: null,
      overrideExpiresAt: null,
      accessOverride: null,
      overrideReason: null,
      overrideGrantedBy: null,
      overrideGrantedAt: null,
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
      subscriptionStatus: null,
      subscriptionTier: null,
      subscriptionEndsAt: null,
      overrideExpiresAt: null,
      accessOverride: null,
      overrideReason: null,
      overrideGrantedBy: null,
      overrideGrantedAt: null,
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

    const updatedUser = { ...user, ...profileData, updatedAt: new Date() } as any;
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
}

// Always use database storage since Replit has PostgreSQL configured
export const storage = new DatabaseStorage();
