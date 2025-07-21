import { pgTable, text, serial, integer, boolean, timestamp, date, varchar, json, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Session table for express-session with connect-pg-simple
// Matching the exact structure created by connect-pg-simple
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(), // JSON session data
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").unique(), // Make username optional for OAuth
  password: text("password"), // Optional for OAuth users
  firstName: text("first_name"),
  lastName: text("last_name"),
  googleId: text("google_id").unique(),
  avatar: text("avatar"),
  age: integer("age"),
  dateOfBirth: date("date_of_birth", { mode: "date" }),
  bio: text("bio"),
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  
  // Subscription-related fields
  stripeCustomerId: text("stripe_customer_id").unique(),
  subscriptionStatus: text("subscription_status").default("free"), // free, active, past_due, canceled, etc.
  subscriptionTier: text("subscription_tier").default("free"), // free, basic, premium, etc.
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  
  // Access override fields for admin control
  accessOverride: boolean("access_override").default(false),
  overrideReason: text("override_reason"),
  overrideGrantedBy: integer("override_granted_by"), // Admin user ID who granted override
  overrideGrantedAt: timestamp("override_granted_at"),
  overrideExpiresAt: timestamp("override_expires_at"), // Optional expiration for temporary overrides
  
  // Password reset fields
  resetToken: text("reset_token").unique(),
  resetTokenExpiry: timestamp("reset_token_expiry"),
});

// Subscription plans table
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g., "Basic", "Premium"
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // Monthly price in dollars
  interval: text("interval").notNull().default("month"), // month, year
  features: json("features").$type<string[]>(), // Array of feature descriptions
  stripePriceId: text("stripe_price_id").notNull().unique(),
  stripeProductId: text("stripe_product_id").notNull(),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0), // For display ordering
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  planId: integer("plan_id").references(() => subscriptionPlans.id),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  status: text("status").notNull(), // active, past_due, canceled, etc.
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  canceledAt: timestamp("canceled_at"),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// File system tables for real file integration
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(), // File size in bytes
  content: text("content"), // Store file content as base64 encoded text
  encoding: text("encoding"), // File encoding (e.g., utf-8, base64)
  
  // File metadata
  description: text("description"),
  tags: json("tags").$type<string[]>().default([]), // Array of tags for categorization
  
  // File organization
  folder: text("folder").default("/"), // Virtual folder path
  isPublic: boolean("is_public").default(false),
  
  // AI Analysis results
  aiAnalysis: json("ai_analysis"), // Store Azure AI analysis results
  analysisStatus: text("analysis_status").default("pending"), // pending, analyzing, completed, failed
  
  // File status
  status: text("status").default("active"), // active, archived, deleted
  
  // Version control
  currentVersion: integer("current_version").default(1),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow(),
  analyzedAt: timestamp("analyzed_at"),
});

// File versions for version control
export const fileVersions = pgTable("file_versions", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => files.id).notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(), // Store as base64 encoded text
  size: integer("size").notNull(),
  
  // Version metadata
  changeDescription: text("change_description"),
  changeType: text("change_type").default("update"), // create, update, restore
  
  // AI analysis for this version
  aiAnalysis: json("ai_analysis"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
});

// File permissions for sharing and collaboration
export const filePermissions = pgTable("file_permissions", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => files.id).notNull(),
  userId: integer("user_id").references(() => users.id), // null for public permissions
  
  // Permission levels
  permission: text("permission").notNull(), // read, write, admin, owner
  
  // Share settings
  sharedBy: integer("shared_by").references(() => users.id).notNull(),
  shareToken: text("share_token").unique(), // For public sharing
  shareExpiry: timestamp("share_expires_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// File interaction logs for analytics and AI insights
export const fileInteractions = pgTable("file_interactions", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => files.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  
  // Interaction details
  interactionType: text("interaction_type").notNull(), // view, edit, analyze, download, share
  details: json("details"), // Additional interaction metadata
  
  // AI context
  aiContext: json("ai_context"), // Context about AI analysis or suggestions
  
  // Performance metrics
  duration: integer("duration"), // Duration in milliseconds
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schema for creating a user with email/password
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  age: z.number().int().min(13, "Must be at least 13 years old").max(120, "Invalid age").optional(),
  dateOfBirth: z.string().optional(), // Will be converted to Date
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
}).pick({
  email: true,
  password: true,
  username: true,
  firstName: true,
  lastName: true,
  age: true,
  dateOfBirth: true,
  bio: true,
});

// Schema for user registration with email/password
export const registerUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
});

// Schema for user login
export const loginUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Schema for forgot password request
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// Schema for password reset
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Schema for user profile updates
export const updateProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  age: z.number().int().min(13, "Must be at least 13 years old").max(120, "Invalid age").optional(),
  dateOfBirth: z.string().optional().refine((date) => {
    if (!date) return true;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime()) && parsed <= new Date();
  }, "Invalid date of birth"),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
});

// Schema for OAuth user creation
export const oauthUserSchema = z.object({
  email: z.string().email(),
  googleId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().url().optional(),
  emailVerified: z.boolean().default(true), // OAuth emails are typically verified
});

// Public user schema (without sensitive data)
export const publicUserSchema = createSelectSchema(users).omit({
  password: true,
  googleId: true,
});

// Subscription plan schemas
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans, {
  name: z.string().min(1, "Plan name is required"),
  price: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, "Price must be a valid number"),
  interval: z.enum(["month", "year"]),
  features: z.array(z.string()).optional(),
  stripePriceId: z.string().min(1, "Stripe price ID is required"),
  stripeProductId: z.string().min(1, "Stripe product ID is required"),
});

export const subscriptionPlanSchema = createSelectSchema(subscriptionPlans);

// Subscription schemas
export const insertSubscriptionSchema = createInsertSchema(subscriptions, {
  userId: z.number().int().positive(),
  status: z.enum(["active", "past_due", "canceled", "incomplete", "incomplete_expired", "trialing", "unpaid"]),
});

export const subscriptionSchema = createSelectSchema(subscriptions);

// Registration with subscription schema
export const registerWithSubscriptionSchema = z.object({
  // User fields
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  
  // Subscription fields
  planId: z.number().int().positive().optional(), // Optional for free plan
  paymentMethodId: z.string().optional(), // Required for paid plans
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type ForgotPassword = z.infer<typeof forgotPasswordSchema>;
export type ResetPassword = z.infer<typeof resetPasswordSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type OAuthUser = z.infer<typeof oauthUserSchema>;
export type User = typeof users.$inferSelect;
export type PublicUser = z.infer<typeof publicUserSchema>;

// New subscription types
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type RegisterWithSubscription = z.infer<typeof registerWithSubscriptionSchema>;

// File system schemas
export const insertFileSchema = createInsertSchema(files, {
  name: z.string().min(1, "File name is required").max(255, "File name too long"),
  originalName: z.string().min(1, "Original file name is required"),
  mimeType: z.string().min(1, "MIME type is required"),
  size: z.number().int().min(1, "File size must be positive"),
  folder: z.string().default("/"),
  description: z.string().max(1000, "Description too long").optional(),
  tags: z.array(z.string()).optional(),
}).pick({
  name: true,
  originalName: true,
  mimeType: true,
  size: true,
  folder: true,
  description: true,
  tags: true,
});

export const fileSchema = createSelectSchema(files);

export const updateFileSchema = z.object({
  name: z.string().min(1, "File name is required").max(255, "File name too long").optional(),
  description: z.string().max(1000, "Description too long").optional(),
  tags: z.array(z.string()).optional(),
  folder: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const filePermissionSchema = createInsertSchema(filePermissions, {
  permission: z.enum(["read", "write", "admin", "owner"]),
}).pick({
  permission: true,
});

export const shareFileSchema = z.object({
  userId: z.number().int().positive().optional(),
  permission: z.enum(["read", "write"]),
  shareExpiry: z.string().optional(), // ISO date string
});

// File interaction schema
export const fileInteractionSchema = createInsertSchema(fileInteractions, {
  interactionType: z.enum(["view", "edit", "analyze", "download", "share", "delete", "restore"]),
}).pick({
  interactionType: true,
  details: true,
});

// New file system types
export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type UpdateFile = z.infer<typeof updateFileSchema>;
export type FileVersion = typeof fileVersions.$inferSelect;
export type FilePermission = typeof filePermissions.$inferSelect;
export type ShareFile = z.infer<typeof shareFileSchema>;
export type FileInteraction = typeof fileInteractions.$inferSelect;
export type InsertFileInteraction = z.infer<typeof fileInteractionSchema>;
