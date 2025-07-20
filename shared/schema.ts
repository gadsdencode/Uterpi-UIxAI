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
  username: text("username").unique(), // Make username optional for OAuth users
  password: text("password"), // Optional for OAuth-only users
  emailVerified: boolean("email_verified").default(false),
  
  // OAuth fields
  googleId: text("google_id").unique(),
  
  // Profile information
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatar: text("avatar"), // URL to profile picture
  age: integer("age"),
  dateOfBirth: date("date_of_birth"),
  bio: text("bio"),
  
  // Subscription fields
  stripeCustomerId: text("stripe_customer_id").unique(),
  subscriptionStatus: text("subscription_status").default("free"), // free, active, past_due, canceled, etc.
  subscriptionTier: text("subscription_tier").default("free"), // free, basic, premium, etc.
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
