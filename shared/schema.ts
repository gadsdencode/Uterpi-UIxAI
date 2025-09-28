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
  
  // Account deletion (soft-delete)
  deletedAt: timestamp("deleted_at"),
  
  // Subscription-related fields
  stripeCustomerId: text("stripe_customer_id").unique(),
  subscriptionStatus: text("subscription_status").default("freemium"), // freemium, active, past_due, canceled, etc.
  subscriptionTier: text("subscription_tier").default("freemium"), // freemium, pro, team, enterprise, etc.
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  
  // AI Credits fields
  ai_credits_balance: integer("ai_credits_balance").default(0),
  ai_credits_used_this_month: integer("ai_credits_used_this_month").default(0),
  credits_reset_at: timestamp("credits_reset_at"),
  
  // Message allowance fields (for freemium)
  messages_used_this_month: integer("messages_used_this_month").default(0),
  messages_reset_at: timestamp("messages_reset_at"),
  
  // Team fields
  teamId: integer("team_id"), // Will add foreign key reference after teams table is defined
  teamRole: text("team_role"), // 'owner', 'admin', 'member'
  
  // Grandfathering fields
  is_grandfathered: boolean("is_grandfathered").default(false),
  grandfathered_from_tier: text("grandfathered_from_tier"),
  grandfathered_at: timestamp("grandfathered_at"),
  
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
  teamId: integer("team_id").references(() => teams.id), // Team association for subscription
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
  metadata: json("metadata"), // For storing additional info like grandfathered status
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

// Vector embeddings for file chunks
export const fileEmbeddings = pgTable("file_embeddings", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => files.id).notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: text("embedding").notNull(), // Stored as JSON array string
  embeddingModel: text("embedding_model").notNull(),
  embeddingDimensions: integer("embedding_dimensions").notNull(),
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

// Engagement system schemas
export const updateEmailPreferencesSchema = z.object({
  welcomeEmails: z.boolean().optional(),
  reengagementEmails: z.boolean().optional(),
  featureUpdates: z.boolean().optional(),
  productTips: z.boolean().optional(),
  usageInsights: z.boolean().optional(),
  communityHighlights: z.boolean().optional(),
  emailFrequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  timezone: z.string().optional(),
  preferredContactTime: z.enum(["morning", "afternoon", "evening"]).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  description: z.string().optional(),
  campaignType: z.enum(["welcome", "reengagement", "feature_update", "product_tips", "usage_insights", "community"]),
  emailTemplate: z.string().min(1, "Email template is required"),
  targetSegment: z.enum(["all", "new", "active", "at_risk", "dormant"]).default("all"),
  sendAfterDays: z.number().int().min(0).optional(),
  triggerEvent: z.string().optional(),
});

export const unsubscribeSchema = z.object({
  token: z.string().min(1, "Unsubscribe token is required"),
  reason: z.string().optional(),
});

// Engagement system types
export type UserEngagement = typeof userEngagement.$inferSelect;
export type EmailPreferences = typeof emailPreferences.$inferSelect;
export type UpdateEmailPreferences = z.infer<typeof updateEmailPreferencesSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
export type EmailSendLog = typeof emailSendLog.$inferSelect;
export type UserActivity = typeof userActivity.$inferSelect;
export type UnsubscribeRequest = z.infer<typeof unsubscribeSchema>;

// =============================================================================
// USER ENGAGEMENT SYSTEM
// =============================================================================

// User engagement tracking table
export const userEngagement = pgTable("user_engagement", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  
  // Login and session tracking
  lastLoginAt: timestamp("last_login_at"),
  totalLogins: integer("total_logins").default(0),
  totalSessions: integer("total_sessions").default(0),
  totalTimeSpent: integer("total_time_spent").default(0), // in minutes
  
  // Feature usage tracking
  filesUploaded: integer("files_uploaded").default(0),
  filesAnalyzed: integer("files_analyzed").default(0),
  chatMessagesCount: integer("chat_messages_count").default(0),
  aiInteractions: integer("ai_interactions").default(0),
  
  // Engagement scoring
  engagementScore: integer("engagement_score").default(0), // 0-100
  userSegment: text("user_segment").default("new"), // new, active, at_risk, dormant
  
  // Preferences and timezone
  timezone: text("timezone").default("UTC"),
  preferredContactTime: text("preferred_contact_time").default("morning"), // morning, afternoon, evening
  
  // Tracking metadata
  firstSessionAt: timestamp("first_session_at").defaultNow(),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email preferences table
export const emailPreferences = pgTable("email_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  
  // Email subscription preferences
  welcomeEmails: boolean("welcome_emails").default(true),
  reengagementEmails: boolean("reengagement_emails").default(true),
  featureUpdates: boolean("feature_updates").default(true),
  productTips: boolean("product_tips").default(true),
  usageInsights: boolean("usage_insights").default(true),
  communityHighlights: boolean("community_highlights").default(false),
  
  // Frequency preferences
  emailFrequency: text("email_frequency").default("weekly"), // daily, weekly, monthly
  
  // Unsubscribe management
  isUnsubscribed: boolean("is_unsubscribed").default(false),
  unsubscribeToken: text("unsubscribe_token").unique(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  unsubscribeReason: text("unsubscribe_reason"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email campaigns table
export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  
  // Campaign details
  name: text("name").notNull(),
  description: text("description"),
  campaignType: text("campaign_type").notNull(), // welcome, reengagement, feature_update, etc.
  emailTemplate: text("email_template").notNull(),
  
  // Targeting
  targetSegment: text("target_segment").default("all"), // all, new, active, at_risk, dormant
  targetConditions: json("target_conditions"), // JSON for complex targeting rules
  
  // Scheduling
  isActive: boolean("is_active").default(true),
  scheduledAt: timestamp("scheduled_at"),
  sendAfterDays: integer("send_after_days"), // Send X days after a trigger event
  triggerEvent: text("trigger_event"), // signup, last_login, feature_usage, etc.
  
  // Analytics
  totalSent: integer("total_sent").default(0),
  totalDelivered: integer("total_delivered").default(0),
  totalOpened: integer("total_opened").default(0),
  totalClicked: integer("total_clicked").default(0),
  totalUnsubscribed: integer("total_unsubscribed").default(0),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

// Email send log table
export const emailSendLog = pgTable("email_send_log", {
  id: serial("id").primaryKey(),
  
  // References
  userId: integer("user_id").references(() => users.id).notNull(),
  campaignId: integer("campaign_id").references(() => emailCampaigns.id),
  
  // Email details
  emailType: text("email_type").notNull(), // welcome, reengagement, feature_update, etc.
  emailSubject: text("email_subject").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  
  // Delivery tracking
  status: text("status").default("sent"), // sent, delivered, opened, clicked, bounced, failed
  resendMessageId: text("resend_message_id"), // Resend's message ID for tracking
  
  // Engagement tracking
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  bouncedAt: timestamp("bounced_at"),
  
  // Tracking tokens
  openTrackingToken: text("open_tracking_token").unique(),
  clickTrackingToken: text("click_tracking_token").unique(),
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
});

// User activity tracking for real-time engagement
export const userActivity = pgTable("user_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  
  // Activity details
  activityType: text("activity_type").notNull(), // login, logout, file_upload, chat_message, etc.
  activityData: json("activity_data"), // Additional context data
  
  // Session tracking
  sessionId: text("session_id"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  
  // Timing
  duration: integer("duration"), // Duration in seconds for activities that have duration
  timestamp: timestamp("timestamp").defaultNow(),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
});

// =============================================================================
// AI COACH WORKFLOW TRACKING SYSTEM
// =============================================================================

// Workflow tracking table for AI Coach analysis
export const workflowTracking = pgTable("workflow_tracking", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull(),
  
  // Workflow identification
  workflowType: text("workflow_type"), // coding, debugging, analysis, writing, research, etc.
  workflowName: text("workflow_name"), // User-friendly name for the workflow
  
  // Workflow state
  status: text("status").default("active"), // active, completed, abandoned
  
  // Workflow metrics
  totalSteps: integer("total_steps").default(0),
  completedSteps: integer("completed_steps").default(0),
  
  // Command and model usage patterns
  commandSequence: json("command_sequence").$type<Array<{
    command: string;
    timestamp: string;
    modelUsed?: string;
    duration?: number;
    success?: boolean;
  }>>(),
  
  modelSwitchPatterns: json("model_switch_patterns").$type<Array<{
    fromModel: string;
    toModel: string;
    reason?: string;
    timestamp: string;
  }>>(),
  
  // Time tracking
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  totalDuration: integer("total_duration"), // in seconds
  activeTime: integer("active_time"), // actual working time in seconds
  
  // Efficiency metrics
  efficiencyScore: integer("efficiency_score"), // 0-100
  complexityLevel: text("complexity_level"), // simple, moderate, complex, expert
  
  // AI Coach analysis
  coachAnalysis: json("coach_analysis"), // Stored AI Coach insights
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI Coach insights table
export const aiCoachInsights = pgTable("ai_coach_insights", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  workflowId: integer("workflow_id").references(() => workflowTracking.id),
  
  // Insight details
  insightType: text("insight_type").notNull(), // workflow_optimization, model_recommendation, efficiency_tip, etc.
  insightCategory: text("insight_category").notNull(), // strategic, tactical, operational
  
  title: text("title").notNull(),
  description: text("description").notNull(),
  
  // Actionable recommendations
  recommendations: json("recommendations").$type<Array<{
    action: string;
    expectedImprovement: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>>(),
  
  // Context and triggers
  triggerContext: json("trigger_context"), // What triggered this insight
  applicableScenarios: json("applicable_scenarios").$type<string[]>(),
  
  // User interaction
  wasShown: boolean("was_shown").default(false),
  wasActedUpon: boolean("was_acted_upon").default(false),
  userFeedback: text("user_feedback"), // positive, negative, neutral
  feedbackDetails: text("feedback_details"),
  
  // Impact tracking
  expectedImpact: text("expected_impact"), // high, medium, low
  actualImpact: text("actual_impact"),
  impactMetrics: json("impact_metrics"),
  
  // Timing
  generatedAt: timestamp("generated_at").defaultNow(),
  shownAt: timestamp("shown_at"),
  actedAt: timestamp("acted_at"),
  expiresAt: timestamp("expires_at"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workflow patterns table for learning user behaviors
export const workflowPatterns = pgTable("workflow_patterns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  
  // Pattern identification
  patternName: text("pattern_name").notNull(),
  patternType: text("pattern_type").notNull(), // task_sequence, model_preference, time_of_day, etc.
  
  // Pattern data
  patternData: json("pattern_data").notNull(),
  frequency: integer("frequency").default(1),
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0.00-1.00
  
  // Learning metrics
  firstObservedAt: timestamp("first_observed_at").defaultNow(),
  lastObservedAt: timestamp("last_observed_at").defaultNow(),
  observationCount: integer("observation_count").default(1),
  
  // Pattern effectiveness
  successRate: decimal("success_rate", { precision: 3, scale: 2 }), // 0.00-1.00
  averageTimeToComplete: integer("avg_time_to_complete"), // in seconds
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI Coach conversations table for contextual coaching
export const aiCoachConversations = pgTable("ai_coach_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  
  // Conversation context
  conversationContext: text("conversation_context").notNull(), // workflow_help, optimization_advice, etc.
  
  // Messages
  messages: json("messages").$type<Array<{
    role: 'user' | 'coach';
    content: string;
    timestamp: string;
  }>>().notNull(),
  
  // Outcomes
  resolutionStatus: text("resolution_status"), // resolved, ongoing, abandoned
  userSatisfaction: integer("user_satisfaction"), // 1-5 rating
  
  // Metadata
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// =============================================================================
// CHAT VECTORIZATION SYSTEM
// =============================================================================

// Chat conversations storage
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull(),
  title: text("title"),
  provider: text("provider").notNull(), // 'uterpi', 'openai', 'gemini', 'azure', 'lmstudio'
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
  isStarred: boolean("is_starred").default(false),
});

// Individual messages within conversations
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'user', 'assistant', 'system'
  messageIndex: integer("message_index").notNull(), // Order within conversation
  attachments: json("attachments").$type<string[]>(), // File attachments
  metadata: json("metadata").$type<{
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
  }>(), // Additional message metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Vector embeddings for semantic search
export const messageEmbeddings = pgTable("message_embeddings", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id).notNull(),
  embedding: text("embedding").notNull(), // Stored as JSON array string
  embeddingModel: text("embedding_model").notNull(), // Model used for embedding
  embeddingDimensions: integer("embedding_dimensions").notNull(), // Vector dimensions
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversation context vectors (aggregated summaries)
export const conversationEmbeddings = pgTable("conversation_embeddings", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  summaryEmbedding: text("summary_embedding").notNull(), // Stored as JSON array string
  embeddingModel: text("embedding_model").notNull(),
  embeddingDimensions: integer("embedding_dimensions").notNull(),
  summary: text("summary"), // Text summary of conversation
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// NEW MULTI-TIER SUBSCRIPTION TABLES
// =============================================================================

// Teams table for Team and Enterprise plans
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id").references(() => users.id).notNull(),
  subscriptionTier: text("subscription_tier").notNull(), // 'team', 'enterprise'
  
  // Team limits and usage
  maxMembers: integer("max_members").notNull().default(3),
  currentMembers: integer("current_members").default(1),
  pooledAiCredits: integer("pooled_ai_credits").default(0),
  pooledCreditsUsedThisMonth: integer("pooled_credits_used_this_month").default(0),
  
  // Team features
  sharedWorkspacesCount: integer("shared_workspaces_count").default(0),
  maxWorkspaces: integer("max_workspaces").default(10),
  customPersonasCount: integer("custom_personas_count").default(0),
  
  // Enterprise features
  ssoEnabled: boolean("sso_enabled").default(false),
  auditLogsEnabled: boolean("audit_logs_enabled").default(false),
  dataResidencyRegion: text("data_residency_region"),
  dedicatedAccountManager: text("dedicated_account_manager"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI credits transactions table for tracking usage
export const aiCreditsTransactions = pgTable("ai_credits_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  teamId: integer("team_id").references(() => teams.id),
  
  // Transaction details
  transactionType: text("transaction_type").notNull(), // 'usage', 'purchase', 'monthly_reset', 'bonus', 'refund'
  amount: integer("amount").notNull(), // Positive for credits added, negative for credits used
  balanceAfter: integer("balance_after").notNull(),
  
  // Usage details (for 'usage' type)
  operationType: text("operation_type"), // 'chat', 'codebase_analysis', 'app_generation', 'code_review', 'advanced_model'
  modelUsed: text("model_used"),
  tokensConsumed: integer("tokens_consumed"),
  
  // Purchase details (for 'purchase' type)
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  purchaseAmountCents: integer("purchase_amount_cents"),
  
  // Metadata
  description: text("description"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Feature flags table for tier-based feature access
export const subscriptionFeatures = pgTable("subscription_features", {
  id: serial("id").primaryKey(),
  tierName: text("tier_name").notNull().unique(), // 'free', 'pro', 'team', 'enterprise'
  
  // Core features
  unlimitedChat: boolean("unlimited_chat").default(false),
  monthlyMessageAllowance: integer("monthly_message_allowance").default(0), // For freemium tier
  aiProvidersAccess: json("ai_providers_access").$type<string[]>(), // Array of allowed AI provider names
  
  // AI Credits
  monthlyAiCredits: integer("monthly_ai_credits").default(0),
  creditsRollover: boolean("credits_rollover").default(false),
  creditsPurchaseEnabled: boolean("credits_purchase_enabled").default(true),
  
  // Project limits
  maxProjects: integer("max_projects").default(1),
  fullCodebaseContext: boolean("full_codebase_context").default(false),
  
  // Integrations
  gitIntegration: boolean("git_integration").default(false),
  
  // AI Features
  aiCodeReviewsPerMonth: integer("ai_code_reviews_per_month").default(0),
  
  // Team features
  teamFeaturesEnabled: boolean("team_features_enabled").default(false),
  sharedWorkspaces: boolean("shared_workspaces").default(false),
  teamPersonas: boolean("team_personas").default(false),
  
  // Security & Compliance
  ssoEnabled: boolean("sso_enabled").default(false),
  auditLogs: boolean("audit_logs").default(false),
  dataResidency: boolean("data_residency").default(false),
  
  // Support
  supportLevel: text("support_level").default("email"), // 'email', 'priority_email', 'dedicated'
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// DISTRIBUTED RATE LIMITING TABLE
// =============================================================================

// Stores per-key, per-route request counts within a fixed window
// A unique index on (key, route, window_start) is created via migration
export const rateLimits = pgTable("rate_limits", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  route: text("route").notNull(),
  windowStart: timestamp("window_start", { precision: 6 }).notNull(),
  windowEnd: timestamp("window_end", { precision: 6 }).notNull(),
  windowMs: integer("window_ms").notNull(),
  count: integer("count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});