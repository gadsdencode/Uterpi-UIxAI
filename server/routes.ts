import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth, requireGuest } from "./auth";
import passport from "./auth";
import { registerUserSchema, loginUserSchema, forgotPasswordSchema, resetPasswordSchema, publicUserSchema, updateProfileSchema, updateEmailPreferencesSchema, unsubscribeSchema, subscriptionPlans, subscriptions, users, files } from "@shared/schema";
import { engagementService } from "./engagement";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
import { createStripeCustomer, createSetupIntent, createSubscription, cancelSubscription, reactivateSubscription, createBillingPortalSession, syncSubscriptionFromStripe } from "./stripe";
import { requireActiveSubscription, enhanceWithSubscription } from "./subscription-middleware";
import { handleStripeWebhook, rawBodyParser } from "./webhooks";
import { fileStorage } from "./file-storage";
import multer from 'multer';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import dotenv from "dotenv";
dotenv.config();

// Define custom request interface for file uploads
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Azure AI Configuration
interface AzureAIConfig {
  endpoint: string;
  apiKey: string;
  modelName: string;
  maxRetries?: number;
  retryDelay?: number;
  cacheEnabled?: boolean;
}

// Simple in-memory cache for AI responses
const aiResponseCache = new Map<string, { response: any; timestamp: number; ttl: number }>();

// AI service analytics and monitoring
interface AIServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  totalResponseTime: number;
  avgResponseTime: number;
  endpointStats: Map<string, {
    requests: number;
    successes: number;
    failures: number;
    avgResponseTime: number;
  }>;
  errorTypes: Map<string, number>;
}

const aiMetrics: AIServiceMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  cacheHits: 0,
  totalResponseTime: 0,
  avgResponseTime: 0,
  endpointStats: new Map(),
  errorTypes: new Map()
};

// Track AI service usage
function trackAIRequest(endpoint: string, success: boolean, responseTime: number, error?: string): void {
  aiMetrics.totalRequests++;
  aiMetrics.totalResponseTime += responseTime;
  aiMetrics.avgResponseTime = aiMetrics.totalResponseTime / aiMetrics.totalRequests;
  
  if (success) {
    aiMetrics.successfulRequests++;
  } else {
    aiMetrics.failedRequests++;
    if (error) {
      const errorCount = aiMetrics.errorTypes.get(error) || 0;
      aiMetrics.errorTypes.set(error, errorCount + 1);
    }
  }
  
  // Track endpoint-specific stats
  const endpointStat = aiMetrics.endpointStats.get(endpoint) || {
    requests: 0,
    successes: 0,
    failures: 0,
    avgResponseTime: 0
  };
  
  endpointStat.requests++;
  endpointStat.avgResponseTime = ((endpointStat.avgResponseTime * (endpointStat.requests - 1)) + responseTime) / endpointStat.requests;
  
  if (success) {
    endpointStat.successes++;
  } else {
    endpointStat.failures++;
  }
  
  aiMetrics.endpointStats.set(endpoint, endpointStat);
  
  // Log periodic summaries
  if (aiMetrics.totalRequests % 10 === 0) {
    console.log("📊 AI Service Metrics Summary:", {
      totalRequests: aiMetrics.totalRequests,
      successRate: `${((aiMetrics.successfulRequests / aiMetrics.totalRequests) * 100).toFixed(1)}%`,
      avgResponseTime: `${aiMetrics.avgResponseTime.toFixed(0)}ms`,
      cacheHitRate: `${((aiMetrics.cacheHits / aiMetrics.totalRequests) * 100).toFixed(1)}%`,
      topEndpoints: Array.from(aiMetrics.endpointStats.entries())
        .sort(([,a], [,b]) => b.requests - a.requests)
        .slice(0, 3)
        .map(([endpoint, stats]) => `${endpoint}: ${stats.requests} reqs`)
    });
  }
}

// Track cache hits
function trackCacheHit(): void {
  aiMetrics.cacheHits++;
}

// Robust JSON parser for Azure AI responses
// Enhanced error extraction with detailed logging
function extractAzureAIError(error: any): string {
  if (!error) return "Unknown Azure AI error";
  
  // Log full error for debugging
  console.error("Full Azure AI error details:", JSON.stringify(error, null, 2));
  
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  if (error.error?.message) return error.error.message;
  if (error.details) return Array.isArray(error.details) ? error.details.join(', ') : error.details;
  if (error.code) return `Azure AI Error ${error.code}: ${error.message || 'Unknown error'}`;
  
  return "Unexpected Azure AI error format";
}

// Enhanced JSON parsing with better error recovery
export function parseAzureAIJSON(content: string): any {
  if (!content || typeof content !== 'string') {
    console.warn("Invalid content for JSON parsing:", typeof content);
    return null;
  }

  try {
    // Remove any markdown code block markers
    const cleanContent = content.replace(/```(?:json)?\n?/g, '').trim();
    
    // Try direct parsing first
    return JSON.parse(cleanContent);
  } catch (error) {
    console.warn("Direct JSON parsing failed, attempting recovery...");
    
    try {
      // Look for JSON-like structure in the content
      const cleanContent = content.replace(/```(?:json)?\n?/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (recoveryError) {
      console.warn("JSON recovery failed:", recoveryError);
    }
    
    try {
      // Try to extract and fix common JSON issues
      const cleanContent = content.replace(/```(?:json)?\n?/g, '').trim();
      let fixedContent = cleanContent
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Add quotes to unquoted keys
        .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single quotes with double quotes
        .replace(/,\s*}/g, '}') // Remove trailing commas
        .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
      
      return JSON.parse(fixedContent);
    } catch (fixError) {
      console.error("All JSON parsing attempts failed:", fixError);
      return null;
    }
  }
}

// Exponential backoff retry logic
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        console.error(`Operation failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, extractAzureAIError(error));
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Cache management functions
function getCacheKey(prompt: string, model: string, params: any): string {
  return btoa(JSON.stringify({ prompt: prompt.substring(0, 200), model, params }));
}

function getCachedResponse(cacheKey: string): any | null {
  const cached = aiResponseCache.get(cacheKey);
  if (!cached) return null;
  
  const now = Date.now();
  if (now > cached.timestamp + cached.ttl) {
    aiResponseCache.delete(cacheKey);
    return null;
  }
  
  trackCacheHit();
  console.log("📄 Using cached AI response");
  return cached.response;
}

function setCachedResponse(cacheKey: string, response: any, ttlMinutes: number = 30): void {
  const ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
  aiResponseCache.set(cacheKey, {
    response,
    timestamp: Date.now(),
    ttl
  });
  
  // Clean up old cache entries periodically
  if (aiResponseCache.size > 100) {
    const now = Date.now();
    aiResponseCache.forEach((value, key) => {
      if (now > value.timestamp + value.ttl) {
        aiResponseCache.delete(key);
      }
    });
  }
}

// Initialize Azure AI client
export function createAzureAIClient(): { client: any; config: AzureAIConfig } {
  const endpoint = process.env.VITE_AZURE_AI_ENDPOINT;
  const apiKey = process.env.VITE_AZURE_AI_API_KEY;
  const modelName = process.env.VITE_AZURE_AI_MODEL_NAME || "ministral-3b";

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure AI configuration missing. Please set VITE_AZURE_AI_ENDPOINT and VITE_AZURE_AI_API_KEY environment variables."
    );
  }

  const config: AzureAIConfig = { 
    endpoint, 
    apiKey, 
    modelName,
    maxRetries: 3,
    retryDelay: 1000,
    cacheEnabled: true
  };
  
  const client = ModelClient(endpoint, new AzureKeyCredential(apiKey));
  
  console.log(`🚀 Azure AI client initialized with model: ${modelName}`);
  
  return { client, config };
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept images and documents
    if (file.mimetype.startsWith('image/') || 
        file.mimetype === 'application/pdf' ||
        file.mimetype.includes('text/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // LM Studio proxy (OpenAI-compatible)
  app.post("/lmstudio/v1/chat/completions", async (req, res) => {
    try {
      const sanitizeBaseUrl = (raw: string): string => {
        let base = (raw || "").trim();
        // Fix accidental duplicate port patterns like :1234:1234
        base = base.replace(/:(\d+):(\d+)/, ":$1");
        // Remove any trailing slash
        base = base.replace(/\/$/, "");
        // Strip accidental API path suffixes
        base = base.replace(/\/(v1|openai|api)(\/.*)?$/i, "");
        // Ensure protocol
        if (!/^https?:\/\//i.test(base)) {
          base = `http://${base}`;
        }
        // Validate URL
        try {
          // eslint-disable-next-line no-new
          new URL(base);
        } catch {
          throw new Error(`Invalid LMSTUDIO_BASE_URL provided: ${raw}`);
        }
        return base;
      };

      const lmBaseRaw = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234";
      const lmBase = sanitizeBaseUrl(lmBaseRaw);
      const targetUrl = `${lmBase}/v1/chat/completions`;
      const incomingAuth = req.get("authorization");
      const proxyAuth = incomingAuth || (process.env.LMSTUDIO_API_KEY ? `Bearer ${process.env.LMSTUDIO_API_KEY}` : "Bearer lm-studio");

      console.log(`[LMStudio Proxy] POST -> ${targetUrl}`);

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": proxyAuth,
          // Hint upstream for SSE; some tunnels need explicit accept
          "Accept": "text/event-stream, application/json"
        } as any,
        body: JSON.stringify(req.body),
      });

      const contentType = response.headers.get("content-type") || "";
      const isEventStream = contentType.includes("text/event-stream");

      if (isEventStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = (response as any).body?.getReader?.();
        if (!reader) {
          res.status(502).end("Upstream stream missing");
          return;
        }

        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
          }
        } finally {
          res.end();
        }
        return;
      }

      // Non-streaming: forward status and body
      const text = await response.text();
      console.log(`[LMStudio Proxy] Response ${response.status} ${contentType}`);
      res.status(response.status);
      if (contentType.includes("application/json")) {
        res.type("application/json").send(text);
      } else {
        res.send(text);
      }
    } catch (err: any) {
      console.error("LM Studio proxy error:", err?.stack || err);
      res.status(502).json({ error: "LM Studio proxy failed", message: err?.message || String(err) });
    }
  });

  // Simple passthrough to check upstream reachability and list models
  app.get("/lmstudio/v1/models", async (_req, res) => {
    try {
      const sanitizeBaseUrl = (raw: string): string => {
        let base = (raw || "").trim();
        base = base.replace(/:(\d+):(\d+)/, ":$1");
        base = base.replace(/\/$/, "");
        base = base.replace(/\/(v1|openai|api)(\/.*)?$/i, "");
        if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
        // eslint-disable-next-line no-new
        new URL(base);
        return base;
      };
      const lmBaseRaw = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234";
      const lmBase = sanitizeBaseUrl(lmBaseRaw);
      const targetUrl = `${lmBase}/v1/models`;
      console.log(`[LMStudio Proxy] GET -> ${targetUrl}`);
      const response = await fetch(targetUrl, { headers: { "Content-Type": "application/json" } as any });
      const text = await response.text();
      res.status(response.status).type(response.headers.get("content-type") || "application/json").send(text);
    } catch (err: any) {
      console.error("LM Studio models proxy error:", err?.stack || err);
      res.status(502).json({ error: "LM Studio proxy failed", message: err?.message || String(err) });
    }
  });
  
  // =============================================================================
  // AUTHENTICATION ROUTES
  // =============================================================================
  
  // User registration
  app.post("/api/auth/register", requireGuest, async (req, res) => {
    try {
      const validatedData = registerUserSchema.parse(req.body);
      const user = await storage.createUser(validatedData);
      
      // Automatically log in the user after registration
      req.login(user as any, (err) => {
        if (err) {
          console.error("Login after registration failed:", err);
          return res.status(500).json({ error: "Registration successful but login failed" });
        }
        
        // Return public user data
        const publicUser = publicUserSchema.parse(user);
        res.status(201).json({ 
          success: true, 
          message: "User registered successfully",
          user: publicUser 
        });
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.message?.includes("already exists")) {
        res.status(409).json({ error: error.message });
      } else if (error.issues) {
        // Zod validation error
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  // User login
  app.post("/api/auth/login", requireGuest, (req, res, next) => {
    try {
      const validatedData = loginUserSchema.parse(req.body);
      
      passport.authenticate("local", (err: any, user: any, info: any) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        
        if (!user) {
          return res.status(401).json({ 
            error: info?.message || "Invalid email or password" 
          });
        }
        
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("Session creation failed:", loginErr);
            return res.status(500).json({ error: "Login failed" });
          }
          
          res.json({ 
            success: true, 
            message: "Login successful",
            user: user
          });
        });
      })(req, res, next);
    } catch (error: any) {
      if (error.issues) {
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(400).json({ error: "Invalid login data" });
      }
    }
  });

  // User logout
  app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error("Session destruction failed:", sessionErr);
          return res.status(500).json({ error: "Logout failed" });
        }
        
        res.json({ success: true, message: "Logout successful" });
      });
    });
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ 
      success: true, 
      user: req.user 
    });
  });

  // Check authentication status
  app.get("/api/auth/status", (req, res) => {
    res.json({ 
      authenticated: req.isAuthenticated(),
      user: req.isAuthenticated() ? req.user : null
    });
  });

  // Google OAuth routes
  app.get("/api/auth/google", 
    passport.authenticate("google", { 
      scope: ["profile", "email"] 
    })
  );

  app.get("/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login?error=oauth_failed" }),
    (req, res) => {
      // Successful authentication, redirect to frontend
      res.redirect("/?auth=success");
    }
  );

  // Password reset routes
  app.post("/api/auth/forgot-password", requireGuest, async (req, res) => {
    try {
      const validatedData = forgotPasswordSchema.parse(req.body);
      const { email } = validatedData;

      // Generate reset token
      const resetToken = await storage.generatePasswordResetToken(email);
      
      if (!resetToken) {
        // For security reasons, we don't reveal if the email exists or not
        // Always return success even if email doesn't exist
        return res.json({ 
          success: true, 
          message: "If an account with that email exists, a password reset link has been sent." 
        });
      }

      // Get user info for email personalization
      const user = await storage.getUserByEmail(email);
      const displayName = user?.firstName || user?.username || '';

      // Send password reset email
      const { sendPasswordResetEmail } = await import('./email');
      await sendPasswordResetEmail({
        to: email,
        name: displayName,
        resetToken
      });

      res.json({ 
        success: true, 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      if (error.issues) {
        // Zod validation error
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(500).json({ error: "Failed to process password reset request" });
      }
    }
  });

  // =============================================================================
  // ACCOUNT DELETION (IMMEDIATE) - cancels Stripe at period end
  // =============================================================================
  app.delete("/api/account", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;

      // Fetch user subscriptions to cancel at period end
      const activeSubs = await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));

      // Cancel each subscription at period end (Stripe + local mirror)
      for (const sub of activeSubs) {
        if (sub.stripeSubscriptionId) {
          try {
            await cancelSubscription(sub.stripeSubscriptionId, true);
          } catch (e) {
            console.error("Stripe cancel at period end failed", e);
          }
        }

        // Mirror cancel_at_period_end locally
        await db
          .update(subscriptions)
          .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));
      }

      // Soft-delete user files
      try {
        const userFiles = await db
          .select()
          .from(files)
          .where(eq(files.userId, userId));

        for (const f of userFiles) {
          await db
            .update(files)
            .set({ status: "deleted", updatedAt: new Date() })
            .where(eq(files.id, f.id));
        }
      } catch (e) {
        console.error("Soft-deleting user files failed", e);
      }

      // Mark user as deleted (soft-delete)
      await db
        .update(users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Destroy session
      req.logout(() => {
        req.session.destroy(() => {
          res.json({ success: true, message: "Your account has been deleted. This cannot be undone." });
        });
      });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  app.post("/api/auth/reset-password", requireGuest, async (req, res) => {
    try {
      const validatedData = resetPasswordSchema.parse(req.body);
      const { token, password } = validatedData;

      // Validate token and reset password
      const success = await storage.resetPassword(token, password);
      
      if (!success) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      // Get user info to send confirmation email
      const user = await storage.validatePasswordResetToken(token);
      if (user) {
        try {
          const { sendPasswordResetConfirmationEmail } = await import('./email');
          await sendPasswordResetConfirmationEmail(
            user.email, 
            user.firstName || user.username || ''
          );
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
          // Don't fail the password reset if confirmation email fails
        }
      }

      res.json({ 
        success: true, 
        message: "Password has been reset successfully. You can now log in with your new password." 
      });
    } catch (error: any) {
      console.error("Reset password error:", error);
      if (error.issues) {
        // Zod validation error
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(500).json({ error: "Failed to reset password" });
      }
    }
  });

  // =============================================================================
  // ENGAGEMENT SYSTEM ROUTES
  // =============================================================================

  // Track user activity
  app.post("/api/engagement/track", requireAuth, async (req, res) => {
    try {
      const { activityType, activityData, duration } = req.body;
      
      if (!activityType) {
        return res.status(400).json({ error: "Activity type is required" });
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
  });

  // Get user engagement data
  app.get("/api/engagement/stats", requireAuth, async (req, res) => {
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
  });

  // Get email preferences
  app.get("/api/engagement/email-preferences", requireAuth, async (req, res) => {
    try {
      let preferences = await engagementService.getEmailPreferences(req.user!.id);
      
      // If preferences don't exist for existing user, initialize them
      if (!preferences) {
        console.log(`Initializing engagement for existing user: ${req.user!.id}`);
        await engagementService.initializeUserEngagement(req.user!.id);
        
        // Try to get preferences again after initialization
        preferences = await engagementService.getEmailPreferences(req.user!.id);
        
        if (!preferences) {
          return res.status(500).json({ error: "Failed to initialize email preferences" });
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
  });

  // Update email preferences
  app.put("/api/engagement/email-preferences", requireAuth, async (req, res) => {
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
  });

  // Unsubscribe from emails (public endpoint)
  app.post("/api/engagement/unsubscribe", async (req, res) => {
    try {
      const validatedData = unsubscribeSchema.parse(req.body);
      
      const success = await engagementService.unsubscribeUser(validatedData.token, validatedData.reason);
      
      if (success) {
        res.json({ success: true, message: "Successfully unsubscribed from emails" });
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
        res.status(500).json({ error: "Failed to unsubscribe" });
      }
    }
  });

  // Email tracking endpoints
  app.get("/api/engagement/track-open", async (req, res) => {
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
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.send(pixel);
    } catch (error) {
      console.error("Track email open error:", error);
      res.status(200).send(); // Always return success for tracking
    }
  });

  app.get("/api/engagement/track-click", async (req, res) => {
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
      res.redirect('/'); // Always redirect somewhere
    }
  });

  // Manual email triggers (for testing/admin)
  app.post("/api/engagement/send-email", requireAuth, async (req, res) => {
    try {
      const { emailType, ...options } = req.body;
      
      let success = false;
      switch (emailType) {
        case 'welcome':
          success = await engagementService.sendWelcomeEmail(req.user!.id);
          break;
        case 'reengagement':
          success = await engagementService.sendReengagementEmail(req.user!.id);
          break;
        case 'feature_discovery':
          success = await engagementService.sendFeatureDiscoveryEmail(req.user!.id);
          break;
        case 'usage_insights':
          success = await engagementService.sendUsageInsightsEmail(req.user!.id, options.period);
          break;
        case 'product_tips':
          success = await engagementService.sendProductTipsEmail(req.user!.id, options.category);
          break;
        default:
          return res.status(400).json({ error: "Invalid email type" });
      }

      if (success) {
        res.json({ success: true, message: "Email sent successfully" });
      } else {
        res.status(400).json({ error: "Email could not be sent (user preferences or eligibility)" });
      }
    } catch (error) {
      console.error("Send email error:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // =============================================================================
  // USER PROFILE ROUTES
  // =============================================================================
  
  // Get user profile
  app.get("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Return public user data (excluding password and sensitive info)
      const profile = {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        age: user.age,
        dateOfBirth: user.dateOfBirth,
        bio: user.bio,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      
      res.json({ 
        success: true, 
        profile 
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // Update user profile
  app.put("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const validatedData = updateProfileSchema.parse(req.body);
      
      // Check if username is being updated and if it's already taken
      if (validatedData.username && validatedData.username !== req.user!.username) {
        const existingUser = await storage.getUserByUsername(validatedData.username);
        if (existingUser && existingUser.id !== req.user!.id) {
          return res.status(409).json({ error: "Username already taken" });
        }
      }

      const updatedUser = await storage.updateUserProfile(req.user!.id, validatedData);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Return public user data
      const profile = {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        avatar: updatedUser.avatar,
        age: updatedUser.age,
        dateOfBirth: updatedUser.dateOfBirth,
        bio: updatedUser.bio,
        emailVerified: updatedUser.emailVerified,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };

      res.json({ 
        success: true, 
        message: "Profile updated successfully",
        profile 
      });
    } catch (error: any) {
      console.error("Update profile error:", error);
      if (error.issues) {
        // Zod validation error
        res.status(400).json({ 
          error: "Validation failed", 
          details: error.issues 
        });
      } else {
        res.status(500).json({ error: "Failed to update profile" });
      }
    }
  });

  // =============================================================================
  // SUBSCRIPTION ROUTES
  // =============================================================================
  
  // Get available subscription plans
  app.get("/api/subscription/plans", async (req, res) => {
    try {
      const plans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .orderBy(subscriptionPlans.sortOrder);
      
      res.json({ 
        success: true, 
        plans 
      });
    } catch (error) {
      console.error("Get subscription plans error:", error);
      res.status(500).json({ error: "Failed to get subscription plans" });
    }
  });

  // Get user's subscription status
  app.get("/api/subscription/status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get user's current subscription
      const subscription = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, req.user!.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      const subscriptionData = subscription[0] || null;
      let planData = null;

      if (subscriptionData?.planId) {
        const plan = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, subscriptionData.planId))
          .limit(1);
        planData = plan[0] || null;
      }

      res.json({
        success: true,
        subscription: {
          status: user.subscriptionStatus || 'free',
          tier: user.subscriptionTier || 'free',
          endsAt: user.subscriptionEndsAt,
          plan: planData,
          details: subscriptionData,
        }
      });
    } catch (error) {
      console.error("Get subscription status error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // Create setup intent for payment method collection
  app.post("/api/subscription/setup-intent", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await createStripeCustomer({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { userId: user.id.toString() }
        });
        
        customerId = customer.id;
        
        // Update user with Stripe customer ID
        await db.update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, user.id));
      }

      const setupIntent = await createSetupIntent(customerId);

      res.json({
        success: true,
        clientSecret: setupIntent.client_secret,
        customerId
      });
    } catch (error) {
      console.error("Create setup intent error:", error);
      res.status(500).json({ error: "Failed to create setup intent" });
    }
  });

  // Create subscription
  app.post("/api/subscription/create", requireAuth, async (req, res) => {
    try {
      const { planId, paymentMethodId } = req.body;
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get the subscription plan
      const plan = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);

      if (!plan[0]) {
        return res.status(404).json({ error: "Subscription plan not found" });
      }

      const planData = plan[0];

      // For free plans, just update user status
      if (planData.price === '0.00') {
        await db.update(users)
          .set({
            subscriptionStatus: 'active',
            subscriptionTier: planData.name.toLowerCase(),
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id));

        return res.json({
          success: true,
          message: "Free plan activated successfully"
        });
      }

      // For paid plans, require payment method
      if (!paymentMethodId) {
        return res.status(400).json({ error: "Payment method is required for paid plans" });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if doesn't exist
      if (!customerId) {
        const customer = await createStripeCustomer({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { userId: user.id.toString() }
        });
        
        customerId = customer.id;
        
        // Update user with Stripe customer ID
        await db.update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, user.id));
      }

      // Create subscription in Stripe
      const subscription = await createSubscription({
        customerId,
        priceId: planData.stripePriceId,
        paymentMethodId
      });

      // Sync subscription data to database
      await syncSubscriptionFromStripe(subscription.id, user.id);

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          clientSecret: (typeof subscription.latest_invoice === 'object' && subscription.latest_invoice) 
            ? (subscription.latest_invoice as any)?.payment_intent?.client_secret 
            : undefined
        }
      });
    } catch (error) {
      console.error("Create subscription error:", error);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  });

  // Cancel subscription
  app.post("/api/subscription/cancel", requireAuth, async (req, res) => {
    try {
      const { immediate = false } = req.body;
      
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get user's active subscription
      const subscription = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, req.user!.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (!subscription[0]?.stripeSubscriptionId) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      const canceledSubscription = await cancelSubscription(
        subscription[0].stripeSubscriptionId,
        !immediate
      );

      // Sync updated subscription data
      await syncSubscriptionFromStripe(canceledSubscription.id, user.id);

      res.json({
        success: true,
        message: immediate ? "Subscription canceled immediately" : "Subscription will cancel at period end"
      });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // Reactivate subscription
  app.post("/api/subscription/reactivate", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get user's subscription
      const subscription = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, req.user!.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (!subscription[0]?.stripeSubscriptionId) {
        return res.status(404).json({ error: "No subscription found" });
      }

      const reactivatedSubscription = await reactivateSubscription(
        subscription[0].stripeSubscriptionId
      );

      // Sync updated subscription data
      await syncSubscriptionFromStripe(reactivatedSubscription.id, user.id);

      res.json({
        success: true,
        message: "Subscription reactivated successfully"
      });
    } catch (error) {
      console.error("Reactivate subscription error:", error);
      res.status(500).json({ error: "Failed to reactivate subscription" });
    }
  });

  // Create billing portal session
  app.post("/api/subscription/billing-portal", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user?.stripeCustomerId) {
        return res.status(404).json({ error: "No Stripe customer found" });
      }

      const session = await createBillingPortalSession(
        user.stripeCustomerId,
        `${req.protocol}://${req.get('host')}/dashboard`
      );

      res.json({
        success: true,
        url: session.url
      });
    } catch (error) {
      console.error("Create billing portal session error:", error);
      res.status(500).json({ error: "Failed to create billing portal session" });
    }
  });

  // =============================================================================
  // STRIPE WEBHOOK ROUTES
  // =============================================================================
  
  // Stripe webhooks for subscription events
  app.post("/api/webhooks/stripe", rawBodyParser(), handleStripeWebhook);

  // =============================================================================
  // AI-POWERED FEATURE ROUTES (SUBSCRIPTION PROTECTED)
  // =============================================================================
  
  // AI Service metrics and monitoring endpoint
  app.get("/api/ai/metrics", requireAuth, async (req, res) => {
    try {
      const metrics = {
        overview: {
          totalRequests: aiMetrics.totalRequests,
          successfulRequests: aiMetrics.successfulRequests,
          failedRequests: aiMetrics.failedRequests,
          successRate: aiMetrics.totalRequests > 0 ? 
            ((aiMetrics.successfulRequests / aiMetrics.totalRequests) * 100).toFixed(1) + '%' : '0%',
          avgResponseTime: Math.round(aiMetrics.avgResponseTime) + 'ms',
          cacheHits: aiMetrics.cacheHits,
          cacheHitRate: aiMetrics.totalRequests > 0 ? 
            ((aiMetrics.cacheHits / aiMetrics.totalRequests) * 100).toFixed(1) + '%' : '0%'
        },
        endpoints: Array.from(aiMetrics.endpointStats.entries()).map(([endpoint, stats]) => ({
          endpoint,
          requests: stats.requests,
          successes: stats.successes,
          failures: stats.failures,
          successRate: stats.requests > 0 ? ((stats.successes / stats.requests) * 100).toFixed(1) + '%' : '0%',
          avgResponseTime: Math.round(stats.avgResponseTime) + 'ms'
        })).sort((a, b) => b.requests - a.requests),
        errors: Array.from(aiMetrics.errorTypes.entries()).map(([error, count]) => ({
          error,
          count,
          percentage: aiMetrics.failedRequests > 0 ? ((count / aiMetrics.failedRequests) * 100).toFixed(1) + '%' : '0%'
        })).sort((a, b) => b.count - a.count),
        cache: {
          size: aiResponseCache.size,
          entries: aiResponseCache.size
        },
        timestamp: new Date().toISOString()
      };
      
      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      console.error("AI metrics error:", error);
      res.status(500).json({ error: "Failed to retrieve AI service metrics" });
    }
  });

  // Model capabilities checking endpoint - now returns optimized configurations
  app.get("/api/model/capabilities/:modelId", async (req, res) => {
    try {
      const { modelId } = req.params;
      
      // Return the enhanced model configuration information
      // This provides much more detailed and accurate information than API testing
      res.json({
        success: true,
        modelId,
        message: "Model capabilities determined from configuration system",
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false,
          supportsSystemMessages: true,
          supportsJSONMode: false,
          supportsFunctionCalling: false,
          supportsStreaming: true,
          supportsStop: true,
          supportsLogitBias: false,
          supportsFrequencyPenalty: false,
          supportsPresencePenalty: false
        },
        optimizationNote: "Model parameters are now automatically optimized based on model-specific configurations in the frontend."
      });
    } catch (error) {
      console.error("Model capabilities check error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to check model capabilities",
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false,
          supportsSystemMessages: true,
          supportsJSONMode: false,
          supportsFunctionCalling: false,
          supportsStreaming: true,
          supportsStop: true,
          supportsLogitBias: false,
          supportsFrequencyPenalty: false,
          supportsPresencePenalty: false
        }
      });
    }
  });

  // Enhanced Clone UI endpoints (requires subscription)
  app.post("/api/clone-ui/analyze", requireActiveSubscription({
    customMessage: "AI-powered UI analysis requires a paid subscription"
  }), upload.single('image'), async (req: MulterRequest, res) => {
    const startTime = Date.now();
    try {
      if (!req.file) {
        trackAIRequest('/api/clone-ui/analyze', false, Date.now() - startTime, 'No image file provided');
        return res.status(400).json({ error: "No image file provided" });
      }

      console.log("🖼️ Starting enhanced UI clone analysis...");
      const { client, config } = createAzureAIClient();
      
      // Convert image to base64 for Azure AI Vision
      const imageBase64 = req.file.buffer.toString('base64');
      const imageMimeType = req.file.mimetype;

      // Enhanced AI prompt for better UI analysis
      const analysisPrompt = `You are an expert UI/UX designer and frontend developer. Analyze this web design image with precision and detail.

**ANALYSIS REQUIREMENTS:**

1. **Component Identification**: Identify ALL visible UI components with specific descriptions
2. **Layout Analysis**: Describe the layout system (grid, flexbox, absolute positioning)
3. **Color Extraction**: Extract the EXACT color palette with hex codes from the design
4. **Typography Assessment**: Identify font styles, sizes, and hierarchies
5. **Complexity Estimation**: Assess implementation difficulty based on components and interactions

**RESPONSE FORMAT:**
You MUST respond with ONLY valid JSON in this exact structure. No markdown, no explanations, just the JSON:

{
  "components": [
    {
      "type": "specific_component_name",
      "description": "detailed description with position and purpose",
      "complexity": "simple|moderate|complex"
    }
  ],
  "layout": {
    "system": "grid|flexbox|absolute|hybrid",
    "structure": "detailed layout description",
    "responsive": "mobile-first|desktop-first|adaptive"
  },
  "colorPalette": {
    "primary": "#hex_code",
    "secondary": "#hex_code",
    "accent": "#hex_code",
    "background": "#hex_code",
    "text": "#hex_code",
    "additional": ["#hex1", "#hex2"]
  },
  "typography": {
    "primary": "font family and weight",
    "secondary": "secondary font details",
    "sizes": ["heading sizes", "body sizes"]
  },
  "estimatedComplexity": "low|medium|high",
  "implementationNotes": [
    "specific technical considerations",
    "required dependencies or libraries",
    "potential challenges"
  ]
}`;

      // Use enhanced retry logic for vision analysis
      const response = await retryWithBackoff(async () => {
        return await client.path("/chat/completions").post({
          body: {
            messages: [
              {
                role: "system",
                content: "You are an expert UI/UX designer and frontend developer specializing in React/TypeScript. Provide detailed, accurate, and actionable analysis of web interfaces. Always respond with valid JSON only."
              },
              {
                role: "user",
                content: [
                  { type: "text", text: analysisPrompt },
                  { 
                    type: "image_url", 
                    image_url: { 
                      url: `data:${imageMimeType};base64,${imageBase64}` 
                    } 
                  }
                ]
              }
            ],
            max_tokens: 3072,
            temperature: 0.2,
            model: config.modelName,
            stream: false,
            response_format: { type: "json_object" }
          },
        });
      }, config.maxRetries, config.retryDelay);

      if (response.status !== "200") {
        const errorDetail = extractAzureAIError(response.body?.error || response.body);
        throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
      }

      const aiResponse = response.body.choices[0]?.message?.content || "";
      console.log("🎯 UI Analysis AI Response received, length:", aiResponse.length);
      
      // Parse AI response with robust JSON parsing
      const analysisResult = parseAzureAIJSON(aiResponse);
      
      if (!analysisResult) {
        console.warn("❌ Failed to parse AI analysis, using intelligent fallback");
        throw new Error("Invalid analysis response from Azure AI");
      }

      console.log("✅ UI Analysis successful:", {
        componentsFound: analysisResult.components?.length || 0,
        layoutSystem: analysisResult.layout?.system || 'unknown',
        complexity: analysisResult.estimatedComplexity || 'unknown'
      });

      // Generate code based on AI analysis with caching
      const cacheKey = getCacheKey(
        `ui-code-gen-${JSON.stringify(analysisResult)}`,
        config.modelName,
        { temperature: 0.2 }
      );
      
      let generatedCode = config.cacheEnabled ? getCachedResponse(cacheKey) : null;
      
      if (!generatedCode) {
        generatedCode = await generateUICodeWithAI(client, config, analysisResult);
        if (config.cacheEnabled && generatedCode) {
          setCachedResponse(cacheKey, generatedCode, 60); // Cache for 1 hour
        }
      }

      const responseTime = Date.now() - startTime;
      trackAIRequest('/api/clone-ui/analyze', true, responseTime);
      
      console.log("✅ UI clone analysis completed successfully in", responseTime + 'ms');
      
      res.json({
        success: true,
        analysis: analysisResult,
        generatedCode,
        metadata: {
          model: config.modelName,
          cached: !!getCachedResponse(cacheKey),
          responseTime: responseTime + 'ms',
          analysisTime: Date.now()
        }
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMsg = extractAzureAIError(error);
      trackAIRequest('/api/clone-ui/analyze', false, responseTime, errorMsg);
      
      console.error("❌ Clone UI analysis error:", errorMsg);
      
      // Provide more detailed error information while keeping it safe for client
      let errorMessage = "Failed to analyze image with Azure AI";
      if (error instanceof Error) {
        errorMessage = error.message.includes('Azure AI API error') 
          ? error.message 
          : `Analysis failed: ${error.message}`;
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: "Please check that your image is a valid UI/web design screenshot",
        responseTime: responseTime + 'ms'
      });
    }
  });

  // Enhanced Create Page endpoints (requires subscription)
  app.post("/api/create-page/generate", requireActiveSubscription({
    customMessage: "AI-powered page generation requires a paid subscription"
  }), async (req, res) => {
    try {
      const { template, requirements, style } = req.body;
      
      if (!template || !requirements) {
        return res.status(400).json({ 
          error: "Missing required parameters: template and requirements are required" 
        });
      }
      
      console.log("🏗️ Starting enhanced page generation:", { template, style });
      
      const { client, config } = createAzureAIClient();
      
      // Use caching for page generation
      const cacheKey = getCacheKey(
        `page-gen-${template}-${requirements}-${style}`,
        config.modelName,
        { temperature: 0.3 }
      );
      
      let cachedResult = config.cacheEnabled ? getCachedResponse(cacheKey) : null;
      if (cachedResult) {
        console.log("📄 Using cached page generation result");
        return res.json({
          success: true,
          ...cachedResult,
          metadata: {
            model: config.modelName,
            cached: true,
            generationTime: Date.now()
          }
        });
      }
      
      // Use Azure AI to generate page structure and components
      const pageResult = await generatePageWithAI(client, config, template, requirements, style);
      const files = await generatePageFilesWithAI(client, config, pageResult);

      const result = {
        page: pageResult,
        files
      };
      
      // Cache the successful result
      if (config.cacheEnabled) {
        setCachedResponse(cacheKey, result, 90); // Cache for 1.5 hours
      }

      console.log("✅ Page generation successful:", {
        template,
        componentsGenerated: pageResult.components?.length || 0,
        filesGenerated: files.length
      });

      res.json({
        success: true,
        ...result,
        metadata: {
          model: config.modelName,
          cached: false,
          generationTime: Date.now()
        }
      });
    } catch (error) {
      console.error("❌ Create page error:", extractAzureAIError(error));
      res.status(500).json({ 
        error: "Failed to generate page with Azure AI",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/create-page/templates", async (req, res) => {
    res.json({
      templates: [
        { id: "landing", name: "Landing Page", description: "Modern landing page with hero and features" },
        { id: "dashboard", name: "Dashboard", description: "Admin dashboard with charts and tables" },
        { id: "portfolio", name: "Portfolio", description: "Personal portfolio with projects showcase" },
        { id: "blog", name: "Blog", description: "Blog layout with articles and sidebar" },
        { id: "ecommerce", name: "E-commerce", description: "Product catalog with shopping cart" }
      ]
    });
  });

  // Improve functionality endpoints (requires subscription)
  app.post("/api/improve/analyze", requireActiveSubscription({
    customMessage: "AI-powered code analysis requires a paid subscription"
  }), upload.single('codeFile'), async (req: MulterRequest, res) => {
    try {
      const { code, component } = req.body;
      let codeToAnalyze = code;

      if (req.file) {
        codeToAnalyze = req.file.buffer.toString('utf-8');
      }

      if (!codeToAnalyze || codeToAnalyze.trim().length === 0) {
        return res.status(400).json({ error: "No code provided for analysis" });
      }

      const { client, config } = createAzureAIClient();
      
      // Use Azure AI to analyze and improve the code
      const result = await analyzeAndImproveCodeWithAI(client, config, codeToAnalyze);

      res.json({
        success: true,
        improvements: result.improvements,
        optimizedCode: result.optimizedCode
      });
    } catch (error) {
      console.error("Improve code error:", error);
      res.status(500).json({ error: "Failed to analyze code with Azure AI" });
    }
  });

  // Analyze functionality endpoints (requires subscription)
  app.post("/api/analyze/performance", requireActiveSubscription({
    customMessage: "AI-powered performance analysis requires a paid subscription"
  }), async (req, res) => {
    try {
      const { projectPath, metrics } = req.body;

      const uterpiEndpoint = process.env.VITE_UTERPI_ENDPOINT_URL;
      const uterpiToken = process.env.VITE_UTERPI_API_TOKEN;

      if (!uterpiEndpoint || !uterpiToken) {
        return res.status(500).json({
          error: "Uterpi API not configured. Set VITE_UTERPI_ENDPOINT_URL and VITE_UTERPI_API_TOKEN."
        });
      }

      const raw = await analyzePerformanceWithUterpi(
        {
          endpointUrl: uterpiEndpoint,
          apiToken: uterpiToken,
          cacheEnabled: true,
          maxRetries: 3,
          retryDelay: 1000
        },
        projectPath,
        metrics || []
      );

      const analysis = mapUterpiPerformanceToModalShape(raw);
      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error("Performance analysis error:", error);
      res.status(500).json({ error: "Failed to analyze performance with Uterpi" });
    }
  });

  app.post("/api/analyze/design-patterns", requireActiveSubscription({
    customMessage: "AI-powered design pattern analysis requires a paid subscription"
  }), async (req, res) => {
    try {
      const { codebase } = req.body;
      const { client, config } = createAzureAIClient();
      
      // Use Azure AI to analyze design patterns
      const patterns = await analyzeDesignPatternsWithAI(client, config, codebase);

      res.json({
        success: true,
        patterns
      });
    } catch (error) {
      console.error("Design pattern analysis error:", error);
      res.status(500).json({ error: "Failed to analyze design patterns with Azure AI" });
    }
  });

  // File Management System Routes
  
  // Upload file endpoint
  app.post("/api/files/upload", requireAuth, upload.single('file'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { folder, description, tags } = req.body;
      const user = req.user as any;
      
      // Parse tags if provided as string
      let parsedTags: string[] = [];
      if (tags) {
        try {
          parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        } catch {
          parsedTags = typeof tags === 'string' ? [tags] : tags;
        }
      }

      const fileData = {
        name: req.file.originalname,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        content: req.file.buffer,
        size: req.file.size,
        folder: folder || '/',
        description: description || null,
        tags: parsedTags,
      };

      const uploadedFile = await fileStorage.uploadFile(user.id, fileData);
      
      res.json({
        success: true,
        file: {
          id: uploadedFile.id,
          name: uploadedFile.name,
          originalName: uploadedFile.originalName,
          mimeType: uploadedFile.mimeType,
          size: uploadedFile.size,
          folder: uploadedFile.folder,
          description: uploadedFile.description,
          tags: uploadedFile.tags,
          createdAt: uploadedFile.createdAt,
          analysisStatus: uploadedFile.analysisStatus,
          aiAnalysis: uploadedFile.aiAnalysis,
          analyzedAt: uploadedFile.analyzedAt
        }
      });
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Helper function to validate fileId
  const validateFileId = (fileIdParam: string): number => {
    const fileId = parseInt(fileIdParam);
    if (isNaN(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }
    return fileId;
  };

  // File folders/organization endpoints (MUST be before :fileId route)
  app.get("/api/files/folders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Get unique folders for the user
      const result = await db
        .selectDistinct({ folder: files.folder })
        .from(files)
        .where(
          and(
            eq(files.userId, user.id),
            eq(files.status, 'active')
          )
        )
        .orderBy(files.folder);

      const folders = result.map(r => r.folder).filter(Boolean);
      
      res.json({
        success: true,
        folders
      });
    } catch (error) {
      console.error("Get folders error:", error);
      res.status(500).json({ error: "Failed to get folders" });
    }
  });

  // Get file details
  app.get("/api/files/:fileId", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;
      
      const file = await fileStorage.getFile(fileId, user.id);
      if (!file) {
        return res.status(404).json({ error: "File not found or access denied" });
      }

      // Return file metadata without content
      res.json({
        success: true,
        file: {
          id: file.id,
          name: file.name,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          folder: file.folder,
          description: file.description,
          tags: file.tags,
          isPublic: file.isPublic,
          analysisStatus: file.analysisStatus,
          aiAnalysis: file.aiAnalysis,
          currentVersion: file.currentVersion,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          lastAccessedAt: file.lastAccessedAt,
          analyzedAt: file.analyzedAt
        }
      });
    } catch (error) {
      console.error("Get file error:", error);
      if (error instanceof Error && error.message === 'Invalid file ID') {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      res.status(500).json({ error: "Failed to get file" });
    }
  });

  // Download file content
  app.get("/api/files/:fileId/download", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;
      
      const file = await fileStorage.getFile(fileId, user.id);
      if (!file) {
        return res.status(404).json({ error: "File not found or access denied" });
      }

      const fileContent = await fileStorage.getFileContent(fileId, user.id);
      if (!fileContent) {
        return res.status(404).json({ error: "File content not found" });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', fileContent.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      
      // Handle different encodings
      if (file.encoding === 'base64' && !fileContent.mimeType.startsWith('text/')) {
        const buffer = Buffer.from(fileContent.content, 'base64');
        res.send(buffer);
      } else {
        res.send(fileContent.content);
      }
    } catch (error) {
      console.error("Download file error:", error);
      if (error instanceof Error && error.message === 'Invalid file ID') {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  // Update file metadata
  app.put("/api/files/:fileId", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;
      const { name, description, tags, folder, isPublic } = req.body;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (tags !== undefined) updates.tags = tags;
      if (folder !== undefined) updates.folder = folder;
      if (isPublic !== undefined) updates.isPublic = isPublic;

      const updatedFile = await fileStorage.updateFile(fileId, user.id, updates);
      if (!updatedFile) {
        return res.status(404).json({ error: "File not found or access denied" });
      }

      res.json({
        success: true,
        file: {
          id: updatedFile.id,
          name: updatedFile.name,
          description: updatedFile.description,
          tags: updatedFile.tags,
          folder: updatedFile.folder,
          isPublic: updatedFile.isPublic,
          analysisStatus: updatedFile.analysisStatus,
          aiAnalysis: updatedFile.aiAnalysis,
          analyzedAt: updatedFile.analyzedAt,
          updatedAt: updatedFile.updatedAt
        }
      });
    } catch (error) {
      console.error("Update file error:", error);
      if (error instanceof Error && error.message === 'Invalid file ID') {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      res.status(500).json({ error: "Failed to update file" });
    }
  });

  // Delete file
  app.delete("/api/files/:fileId", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const success = await fileStorage.deleteFile(fileId, user.id);
      if (!success) {
        return res.status(404).json({ error: "File not found or access denied" });
      }

      res.json({
        success: true,
        message: "File deleted successfully"
      });
    } catch (error) {
      console.error("Delete file error:", error);
      if (error instanceof Error && error.message === 'Invalid file ID') {
        return res.status(400).json({ error: "Invalid file ID" });
      }
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // List user files
  app.get("/api/files", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { 
        folder, 
        search, 
        tags, 
        mimeType, 
        limit = 50, 
        offset = 0 
      } = req.query;

      const options: any = {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      if (folder) options.folder = folder as string;
      if (search) options.search = search as string;
      if (mimeType) options.mimeType = mimeType as string;
      if (tags) {
        try {
          options.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        } catch {
          options.tags = [tags];
        }
      }

      const result = await fileStorage.listUserFiles(user.id, options);
      
      res.json({
        success: true,
        files: result.files.map(file => ({
          id: file.id,
          name: file.name,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          folder: file.folder,
          description: file.description,
          tags: file.tags,
          isPublic: file.isPublic,
          analysisStatus: file.analysisStatus,
          aiAnalysis: file.aiAnalysis,
          analyzedAt: file.analyzedAt,
          currentVersion: file.currentVersion,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          lastAccessedAt: file.lastAccessedAt
        })),
        total: result.total,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          hasMore: result.total > options.offset + options.limit
        }
      });
    } catch (error) {
      console.error("List files error:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  // AI Analysis endpoint (requires subscription)
  app.post("/api/files/:fileId/analyze", requireActiveSubscription({
    customMessage: "AI-powered file analysis requires a paid subscription"
  }), async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const analysis = await fileStorage.analyzeFileWithAI(fileId, user.id);
      
      res.json({
        success: true,
        analysis
      });
         } catch (error) {
       console.error("File analysis error:", error);
       res.status(500).json({ 
         error: error instanceof Error ? error.message : "Failed to analyze file with Azure AI" 
       });
     }
  });

  // File version endpoints
  app.get("/api/files/:fileId/versions", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const versions = await fileStorage.getFileVersions(fileId, user.id);
      
      res.json({
        success: true,
        versions: versions.map(version => ({
          id: version.id,
          versionNumber: version.versionNumber,
          size: version.size,
          changeDescription: version.changeDescription,
          changeType: version.changeType,
          createdAt: version.createdAt,
          createdBy: version.createdBy
        }))
      });
    } catch (error) {
      console.error("Get file versions error:", error);
      res.status(500).json({ error: "Failed to get file versions" });
    }
  });

  app.post("/api/files/:fileId/versions/:versionId/restore", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const versionId = parseInt(req.params.versionId);
      const user = req.user as any;

      const restoredFile = await fileStorage.restoreFileVersion(fileId, versionId, user.id);
      if (!restoredFile) {
        return res.status(404).json({ error: "File or version not found, or access denied" });
      }

      res.json({
        success: true,
        message: "File version restored successfully",
        currentVersion: restoredFile.currentVersion
      });
    } catch (error) {
      console.error("Restore file version error:", error);
      res.status(500).json({ error: "Failed to restore file version" });
    }
  });

  // File sharing endpoints
  app.post("/api/files/:fileId/share", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;
      const { userId, permission, shareExpiry } = req.body;

      if (!permission || !['read', 'write'].includes(permission)) {
        return res.status(400).json({ error: "Invalid permission. Must be 'read' or 'write'" });
      }

      const shareData = {
        userId: userId || null,
        permission,
        shareExpiry: shareExpiry || null
      };

      const sharedPermission = await fileStorage.shareFile(fileId, user.id, shareData);
      
      res.json({
        success: true,
        shareToken: sharedPermission.shareToken,
        permission: sharedPermission.permission,
        shareExpiry: sharedPermission.shareExpiry
      });
         } catch (error) {
       console.error("Share file error:", error);
       res.status(500).json({ 
         error: error instanceof Error ? error.message : "Failed to share file" 
       });
     }
  });

  app.get("/api/files/:fileId/permissions", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const permissions = await fileStorage.getFilePermissions(fileId, user.id);
      
      res.json({
        success: true,
        permissions: permissions.map(perm => ({
          id: perm.id,
          userId: perm.userId,
          permission: perm.permission,
          shareToken: perm.shareToken,
          shareExpiry: perm.shareExpiry,
          createdAt: perm.createdAt
        }))
      });
    } catch (error) {
      console.error("Get file permissions error:", error);
      res.status(500).json({ error: "Failed to get file permissions" });
    }
  });

  // File analytics endpoint
  app.get("/api/files/:fileId/analytics", requireAuth, async (req, res) => {
    try {
      const fileId = validateFileId(req.params.fileId);
      const user = req.user as any;

      const analytics = await fileStorage.getFileAnalytics(fileId, user.id);
      if (!analytics) {
        return res.status(404).json({ error: "File not found or access denied" });
      }

      res.json({
        success: true,
        analytics
      });
    } catch (error) {
      console.error("Get file analytics error:", error);
      res.status(500).json({ error: "Failed to get file analytics" });
    }
  });

  // Bulk file operations
  app.post("/api/files/bulk/delete", requireAuth, async (req, res) => {
    try {
      const { fileIds } = req.body;
      const user = req.user as any;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: "Invalid file IDs array" });
      }

      const results = await Promise.allSettled(
        fileIds.map(id => fileStorage.deleteFile(parseInt(id), user.id))
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.length - successful;

      res.json({
        success: true,
        deleted: successful,
        failed,
        message: `Successfully deleted ${successful} files${failed > 0 ? `, ${failed} failed` : ''}`
      });
    } catch (error) {
      console.error("Bulk delete error:", error);
      res.status(500).json({ error: "Failed to delete files" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Enhanced UI code generation with Azure AI
async function generateUICodeWithAI(client: any, config: AzureAIConfig, analysis: any): Promise<string> {
  try {
    console.log("🚀 Starting enhanced UI code generation...");
    
    // Enhanced code generation prompt
    const codePrompt = `Generate a production-ready React TypeScript component based on this detailed UI analysis.

**UI ANALYSIS:**
${JSON.stringify(analysis, null, 2)}

**GENERATION REQUIREMENTS:**

1. **Component Structure**:
   - Main functional component with proper TypeScript interfaces
   - Modular sub-components for complex sections
   - Props interface for reusability

2. **Styling Implementation**:
   - Use Tailwind CSS classes exclusively
   - Implement the exact color palette provided
   - Responsive design (mobile-first approach)
   - Modern spacing and typography

3. **Code Quality**:
   - Follow React best practices and hooks patterns
   - Include proper TypeScript types and interfaces
   - Add meaningful prop types and default values
   - Use semantic HTML elements

4. **Accessibility**:
   - Include ARIA labels and roles
   - Proper heading hierarchy (h1, h2, h3...)
   - Alt text for images and meaningful link text
   - Keyboard navigation support

5. **Modern Features**:
   - Use React 18+ patterns
   - Implement proper state management if needed
   - Include loading states and error boundaries where applicable
   - Add hover effects and smooth transitions

**OUTPUT REQUIREMENTS:**
- Provide ONLY the complete React component code
- No markdown formatting, explanations, or comments outside the code
- Ensure the component is immediately usable
- Include all necessary imports at the top

**COMPONENT NAME:** GeneratedUIComponent`;

    const response = await retryWithBackoff(async () => {
      return await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are a senior React/TypeScript developer specializing in creating production-ready components. Generate clean, accessible, and modern code that follows industry best practices. Focus on code quality, performance, and maintainability."
            },
            {
              role: "user",
              content: codePrompt
            }
          ],
          max_tokens: 4096,
          temperature: 0.1,
          model: config.modelName,
          stream: false,
        },
      });
    }, config.maxRetries, config.retryDelay);

    if (response.status !== "200") {
      const errorDetail = extractAzureAIError(response.body?.error || response.body);
      throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
    }

    const generatedCode = response.body.choices[0]?.message?.content;
    
         if (!generatedCode || generatedCode.trim().length < 100) {
       console.warn("⚠️ Generated code seems too short, using enhanced fallback");
       return generateFallbackUICode(analysis);
     }

     console.log("✅ UI code generation successful, length:", generatedCode.length);
     return generatedCode;
     
   } catch (error) {
     console.error("❌ AI code generation error:", extractAzureAIError(error));
     return generateFallbackUICode(analysis);
   }
}

// Fallback function for when AI generation fails
function generateFallbackUICode(analysis: any): string {
  return `
import React from 'react';

const GeneratedComponent: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white p-4">
        <nav className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Your Logo</h1>
          <div className="hidden md:flex space-x-6">
            <a href="#" className="hover:text-violet-400">Home</a>
            <a href="#" className="hover:text-violet-400">About</a>
            <a href="#" className="hover:text-violet-400">Contact</a>
          </div>
        </nav>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-12">
        <section className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Welcome to Your Site</h2>
          <p className="text-xl text-gray-600 mb-8">Generated from your design</p>
          <button className="bg-violet-600 text-white px-8 py-3 rounded-lg hover:bg-violet-700">
            Get Started
          </button>
        </section>
        
        <section className="grid md:grid-cols-3 gap-8">
          ${analysis.components.map((comp: any, i: number) => `
          <div key={${i}} className="p-6 bg-white rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2">${comp.type}</h3>
            <p className="text-gray-600">${comp.description}</p>
          </div>
          `).join('')}
        </section>
      </main>
    </div>
  );
};

export default GeneratedComponent;
  `.trim();
}

// Enhanced Azure AI-powered page generation
async function generatePageWithAI(client: any, config: AzureAIConfig, template: string, requirements: string, style: string): Promise<any> {
  try {
    console.log("🏗️ Starting enhanced page structure generation...");
    
    const pagePrompt = `Design a comprehensive ${template} page structure with modern web architecture principles.

**PROJECT SPECIFICATIONS:**
- Template Type: ${template}
- Requirements: ${requirements}
- Style Theme: ${style}
- Target Framework: React TypeScript with Tailwind CSS

**DESIGN REQUIREMENTS:**

1. **Component Architecture**:
   - Modular, reusable component structure
   - Proper component hierarchy and organization
   - TypeScript interfaces for all props
   - Accessibility-first design patterns

2. **Modern Web Principles**:
   - Mobile-first responsive design
   - Performance optimization considerations
   - SEO-friendly structure
   - Progressive enhancement approach

3. **User Experience**:
   - Intuitive navigation and information architecture
   - Clear visual hierarchy and content flow
   - Interactive elements and micro-interactions
   - Loading states and error handling

4. **Technical Implementation**:
   - Modern React patterns (hooks, context, suspense)
   - Code splitting and lazy loading opportunities
   - State management strategy
   - API integration points

**RESPONSE FORMAT:**
Respond with ONLY valid JSON in this exact structure:

{
  "projectMetadata": {
    "template": "${template}",
    "complexity": "low|medium|high",
    "estimatedDevTime": "estimated development time",
    "recommendedFeatures": ["feature suggestions based on requirements"]
  },
  "pageStructure": {
    "layout": "grid|flexbox|hybrid",
    "sections": [
      {
        "name": "section name",
        "type": "header|hero|content|sidebar|footer|etc",
        "purpose": "section purpose and content",
        "priority": "high|medium|low"
      }
    ]
  },
  "components": [
    {
      "name": "ComponentName",
      "type": "functional|class",
      "purpose": "component responsibility",
      "props": [
        {
          "name": "prop name",
          "type": "TypeScript type",
          "required": true/false,
          "description": "prop description"
        }
      ],
      "dependencies": ["required dependencies"],
      "complexity": "simple|moderate|complex"
    }
  ],
  "designSystem": {
    "colorPalette": {
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex",
      "neutral": "#hex",
      "background": "#hex",
      "text": "#hex",
      "error": "#hex",
      "success": "#hex",
      "warning": "#hex"
    },
    "typography": {
      "headings": "font family and scales",
      "body": "body text specifications",
      "special": "accent typography"
    },
    "spacing": {
      "scale": "spacing scale (4px, 8px, 16px, etc.)",
      "containerMaxWidth": "max container width",
      "sectionPadding": "section padding specifications"
    },
    "borderRadius": "border radius scale",
    "shadows": "shadow system",
    "animations": "transition and animation specifications"
  },
  "routes": [
    "route paths as simple strings (e.g. '/', '/about', '/contact')"
  ],
  "stateManagement": {
    "strategy": "context|redux|zustand|local",
    "globalState": ["global state requirements"],
    "localState": ["component-specific state needs"]
  },
  "integrations": {
    "apis": ["required API integrations"],
    "thirdParty": ["third-party service integrations"],
    "authentication": "auth strategy if needed"
  }
}`;

    const response = await retryWithBackoff(async () => {
      return await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are a senior web architect and full-stack developer specializing in modern React applications. Design comprehensive, production-ready page structures with careful attention to scalability, maintainability, and user experience. Focus on practical, implementable solutions."
            },
            {
              role: "user",
              content: pagePrompt
            }
          ],
          max_tokens: 3072,
          temperature: 0.3,
          model: config.modelName,
          stream: false,
          response_format: { type: "json_object" }
        },
      });
    }, config.maxRetries, config.retryDelay);

    if (response.status !== "200") {
      const errorDetail = extractAzureAIError(response.body?.error || response.body);
      throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
    }

    const aiResponse = response.body.choices[0]?.message?.content || "";
    console.log("🎯 Page generation AI response received, length:", aiResponse.length);
    
    const parsed = parseAzureAIJSON(aiResponse);
    if (parsed && parsed.components) {
      console.log("✅ Page structure generation successful:", {
        componentsCount: parsed.components.length,
        sectionsCount: parsed.pageStructure?.sections?.length || 0,
        complexity: parsed.projectMetadata?.complexity
      });
      return parsed;
    }

    console.warn("⚠️ Failed to parse AI page generation, using fallback");
    return generateFallbackPageStructure(template, style);
    
  } catch (error) {
    console.error("❌ AI page generation error:", extractAzureAIError(error));
    return generateFallbackPageStructure(template, style);
  }
}

async function generatePageFilesWithAI(client: any, config: AzureAIConfig, pageResult: any): Promise<any[]> {
  // Declare safePageResult outside try block for proper scope
  let safePageResult: any;
  
  try {
    console.log("📁 Starting enhanced file generation...");
    
    // Comprehensive safety check and normalization for pageResult
    if (!pageResult || typeof pageResult !== 'object') {
      console.warn("⚠️ Invalid pageResult provided, using fallback structure");
      pageResult = {};
    }
    
    // Ensure all required properties exist with safe defaults
    safePageResult = {
      template: "landing",
      components: [],
      designSystem: {
        colorPalette: {
          primary: "#6366f1",
          secondary: "#1e293b",
          accent: "#f59e0b",
          neutral: "#6b7280",
          background: "#ffffff",
          text: "#111827"
        },
        theme: "modern",
        typography: {
          headings: "Inter, system-ui, sans-serif",
          body: "Inter, system-ui, sans-serif"
        }
      },
      routes: [],
      projectMetadata: {
        template: "landing"
      },
      ...pageResult // Override with actual data if available
    };
    
    // Safely merge design system data
    if (pageResult?.designSystem) {
      safePageResult.designSystem = {
        ...safePageResult.designSystem,
        ...pageResult.designSystem
      };
    }
    
    // Handle legacy styles property
    if (pageResult?.styles && !pageResult?.designSystem) {
      safePageResult.designSystem = {
        ...safePageResult.designSystem,
        ...pageResult.styles
      };
    }
    
    // Ensure color palette is properly structured
    if (pageResult?.designSystem?.colorPalette) {
      safePageResult.designSystem.colorPalette = {
        ...safePageResult.designSystem.colorPalette,
        ...pageResult.designSystem.colorPalette
      };
    } else if (pageResult?.styles?.colors) {
      safePageResult.designSystem.colorPalette = {
        ...safePageResult.designSystem.colorPalette,
        ...pageResult.styles.colors
      };
    }
    
    console.log("🔍 Debug pageResult structure:", {
      hasPageResult: !!pageResult,
      hasDesignSystem: !!pageResult?.designSystem,
      hasStyles: !!pageResult?.styles,
      pageResultKeys: pageResult ? Object.keys(pageResult) : [],
      safeStructureKeys: Object.keys(safePageResult)
    });
    
    const files = [];
    
    // Extract design system information with guaranteed safety
    const designSystem = safePageResult.designSystem;
    const colorPalette = designSystem.colorPalette;
    const theme = designSystem.theme || "modern";
    const template = safePageResult.projectMetadata?.template || safePageResult.template || "landing";
    const typography = designSystem.typography || {
      headings: "Inter, system-ui, sans-serif",
      body: "Inter, system-ui, sans-serif"
    };
    
    console.log("🎨 Using design system:", {
      hasDesignSystem: !!pageResult?.designSystem,
      hasStyles: !!pageResult?.styles,
      designSystemKeys: designSystem ? Object.keys(designSystem) : [],
      colorKeys: colorPalette ? Object.keys(colorPalette) : [],
      theme,
      template
    });
    
    // Generate main App component with enhanced prompting
    const componentsList = safePageResult.components && Array.isArray(safePageResult.components) 
      ? safePageResult.components.map((c: any) => (c && c.name) || 'Component').join(', ')
      : 'Header, Hero, Features, Footer';
      
    const appPrompt = `Generate a production-ready React TypeScript App component for a ${template} page.

**PROJECT SPECIFICATIONS:**
Template: ${template}
Components: ${componentsList}
Style Theme: ${theme}
Color Palette: ${JSON.stringify(colorPalette, null, 2)}

**DESIGN SYSTEM:**
${JSON.stringify(designSystem, null, 2)}

**GENERATION REQUIREMENTS:**
1. Complete React TypeScript functional component
2. Use Tailwind CSS classes with the specified color palette
3. Include all specified components in a logical layout
4. Implement responsive design (mobile-first)
5. Add proper TypeScript interfaces for all props
6. Include proper accessibility attributes
7. Use semantic HTML elements
8. Export as default

**CRITICAL: REACT RENDERING RULES:**
- NEVER render objects directly as React children
- Only render: strings, numbers, JSX elements, or arrays of these
- If you need to display route data, extract strings/properties first
- Example: {route.path} NOT {route}
- Example: {routes.map(r => <a key={r} href={r}>{r}</a>)} NOT {routes.map(r => r)}

**OUTPUT FORMAT:**
Provide ONLY the complete React component code with imports. No explanations or markdown.`;

    const appResponse = await retryWithBackoff(async () => {
      return await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are a senior React/TypeScript developer specializing in creating production-ready, accessible components. Generate clean, modern code using Tailwind CSS and React best practices."
            },
            {
              role: "user",
              content: appPrompt
            }
          ],
          max_tokens: 4096,
          temperature: 0.2,
          model: config.modelName,
          stream: false,
        },
      });
    }, config.maxRetries, config.retryDelay);

    if (appResponse.status === "200") {
      const appCode = appResponse.body.choices[0]?.message?.content || "";
      if (appCode.trim()) {
        files.push({
          name: "App.tsx",
          content: appCode,
          type: "component"
        });
        console.log("✅ Generated App.tsx component");
      }
    }

    // Generate individual components with enhanced prompting
    const componentsToGenerate = (safePageResult.components && Array.isArray(safePageResult.components)) 
      ? safePageResult.components.slice(0, 3) 
      : [];
      
    for (const component of componentsToGenerate) {
      // Ensure component is a valid object
      const safeComponent = component || {};
      
      try {
        const componentProps = safeComponent.props || [];
        const propsDescription = Array.isArray(componentProps) ? 
          componentProps.map(p => typeof p === 'string' ? p : `${p?.name || 'prop'}: ${p?.type || 'any'}`).join(', ') : 
          'Standard React props';
          
        const componentPrompt = `Generate a React TypeScript ${safeComponent.name || 'Component'} component.

**COMPONENT SPECIFICATIONS:**
Name: ${safeComponent.name || 'Component'}
Purpose: ${safeComponent.purpose || 'UI component'}
Props: ${propsDescription}
Complexity: ${safeComponent.complexity || 'simple'}

**DESIGN SYSTEM:**
Style Theme: ${theme}
Color Palette: ${JSON.stringify(colorPalette, null, 2)}
Typography: ${JSON.stringify(typography, null, 2)}

**REQUIREMENTS:**
1. Functional React TypeScript component
2. Proper TypeScript interface for props
3. Use Tailwind CSS with provided color palette
4. Responsive and accessible design
5. Clean, maintainable code structure
6. Export as default

**CRITICAL: REACT RENDERING RULES:**
- NEVER render objects directly as React children
- Only render: strings, numbers, JSX elements, or arrays of these
- If using data objects, extract specific properties first
- Example: {item.name} NOT {item}

Provide ONLY the complete component code. No explanations.`;

        const componentResponse = await retryWithBackoff(async () => {
          return await client.path("/chat/completions").post({
            body: {
              messages: [
                {
                  role: "system",
                  content: "You are an expert React developer. Create reusable, accessible, and well-structured components using modern React patterns and Tailwind CSS."
                },
                {
                  role: "user",
                  content: componentPrompt
                }
              ],
              max_tokens: 2048,
              temperature: 0.2,
              model: config.modelName,
              stream: false,
            },
          });
        }, config.maxRetries, config.retryDelay);

        if (componentResponse.status === "200") {
          const componentCode = componentResponse.body.choices?.[0]?.message?.content || "";
          if (componentCode.trim()) {
            files.push({
              name: `${safeComponent.name || 'Component'}.tsx`,
              content: componentCode,
              type: "component"
            });
            console.log(`✅ Generated ${safeComponent.name || 'Component'}.tsx component`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to generate component ${safeComponent.name || 'Unknown'}:`, extractAzureAIError(error));
      }
    }

    // Add configuration files with proper error handling
    try {
      files.push(
        {
          name: "tailwind.config.js",
          content: generateTailwindConfig(colorPalette),
          type: "config"
        },
        {
          name: "routes.ts", 
          content: generateRoutesFile(safePageResult.routes || []),
          type: "config"
        }
      );
      console.log("✅ Generated configuration files");
    } catch (error) {
      console.warn("⚠️ Failed to generate config files:", error);
    }

    console.log(`✅ File generation completed. Generated ${files.length} files.`);
    return files;
    
  } catch (error) {
    console.error("❌ AI file generation error:", extractAzureAIError(error));
    return generateFallbackPageFiles(safePageResult);
  }
}

// Enhanced fallback functions
function generateFallbackPageStructure(template: string, style: string): any {
  const timestamp = Date.now();
  return {
    projectMetadata: {
      template: template || "landing",
      complexity: "medium",
      estimatedDevTime: "2-3 days",
      recommendedFeatures: ["Responsive design", "SEO optimization", "Performance monitoring"]
    },
    pageStructure: {
      layout: "flexbox",
      sections: [
        { name: "Header", type: "header", purpose: "Site navigation and branding", priority: "high" },
        { name: "Hero", type: "hero", purpose: "Main value proposition and call-to-action", priority: "high" },
        { name: "Features", type: "content", purpose: "Showcase key features and benefits", priority: "medium" },
        { name: "Footer", type: "footer", purpose: "Secondary navigation and contact info", priority: "low" }
      ]
    },
    components: [
      { 
        name: "Header", 
        type: "functional",
        purpose: "Site navigation and branding",
        props: [
          { name: "title", type: "string", required: true, description: "Site title" },
          { name: "navigation", type: "NavItem[]", required: true, description: "Navigation menu items" }
        ],
        dependencies: ["React", "Tailwind CSS"],
        complexity: "simple"
      },
      { 
        name: "Hero", 
        type: "functional",
        purpose: "Main landing section with call-to-action",
        props: [
          { name: "title", type: "string", required: true, description: "Main heading" },
          { name: "subtitle", type: "string", required: false, description: "Supporting text" },
          { name: "cta", type: "CTAButton", required: true, description: "Call-to-action button" }
        ],
        dependencies: ["React", "Tailwind CSS"],
        complexity: "simple"
      },
      { 
        name: "Features", 
        type: "functional",
        purpose: "Feature showcase grid",
        props: [
          { name: "items", type: "FeatureItem[]", required: true, description: "List of features" },
          { name: "layout", type: "grid|list", required: false, description: "Layout style" }
        ],
        dependencies: ["React", "Tailwind CSS"],
        complexity: "moderate"
      },
      { 
        name: "Footer", 
        type: "functional",
        purpose: "Site footer with links and information",
        props: [
          { name: "links", type: "FooterLink[]", required: true, description: "Footer navigation links" },
          { name: "copyright", type: "string", required: true, description: "Copyright notice" }
        ],
        dependencies: ["React", "Tailwind CSS"],
        complexity: "simple"
      }
    ],
    designSystem: {
      colorPalette: {
        primary: "#6366f1",
        secondary: "#1e293b",
        accent: "#f59e0b",
        neutral: "#6b7280",
        background: "#ffffff",
        text: "#111827",
        error: "#ef4444",
        success: "#10b981",
        warning: "#f59e0b"
      },
      typography: {
        headings: "Inter, system-ui, sans-serif",
        body: "Inter, system-ui, sans-serif",
        special: "Inter, system-ui, sans-serif"
      },
      spacing: {
        scale: "4px, 8px, 16px, 24px, 32px, 48px, 64px",
        containerMaxWidth: "1200px",
        sectionPadding: "4rem 1rem"
      },
      borderRadius: "0.5rem",
      shadows: "0 1px 3px rgba(0, 0, 0, 0.1)",
      animations: "transition-all duration-300 ease-in-out"
    },
    routes: getDefaultRoutes(template),
    stateManagement: {
      strategy: "context",
      globalState: ["theme", "user", "navigation"],
      localState: ["form state", "modal visibility", "loading states"]
    },
    integrations: {
      apis: ["REST API for content", "Analytics tracking"],
      thirdParty: ["Google Analytics", "Email service"],
      authentication: "JWT-based authentication"
    },
    _fallback: true,
    _timestamp: timestamp
  };
}

function generateFallbackPageFiles(pageResult: any): any[] {
  console.log("🔄 Using fallback page files generation");
  
  // Extract colors with fallbacks
  const colors = pageResult.designSystem?.colorPalette || 
                pageResult.styles?.colors || 
                {
                  primary: "#6366f1",
                  secondary: "#1e293b",
                  accent: "#f59e0b"
                };
  
  const routes = pageResult.routes || [];
  
  return [
    { 
      name: "App.tsx", 
      content: `import React from 'react';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-bold">Your Application</h1>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        <section className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Welcome</h2>
          <p className="text-xl text-gray-600 mb-8">
            Your generated application is ready to be customized.
          </p>
          <button className="bg-violet-600 text-white px-8 py-3 rounded-lg hover:bg-violet-700 transition-colors">
            Get Started
          </button>
        </section>
      </main>
      
      <footer className="bg-gray-100 p-8 mt-16">
        <div className="max-w-6xl mx-auto text-center text-gray-600">
          <p>&copy; 2024 Your Application. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;`, 
      type: "component" 
    },
    { 
      name: "Header.tsx", 
      content: `import React from 'react';

interface HeaderProps {
  title?: string;
  navigation?: Array<{ label: string; href: string }>;
}

const Header: React.FC<HeaderProps> = ({ 
  title = "Your App", 
  navigation = [] 
}) => {
  return (
    <header className="bg-slate-900 text-white p-4">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold">{title}</h1>
        <nav className="hidden md:flex space-x-6">
          {navigation.map((item, index) => (
            <a 
              key={index} 
              href={item.href} 
              className="hover:text-violet-400 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;`, 
      type: "component" 
    },
    { 
      name: "tailwind.config.js", 
      content: generateTailwindConfig(colors), 
      type: "config" 
    },
    { 
      name: "routes.ts", 
      content: generateRoutesFile(routes), 
      type: "config" 
    }
  ];
}

function getDefaultRoutes(template: string): string[] {
  const routes = {
    landing: ["/", "/about", "/contact"],
    dashboard: ["/dashboard", "/analytics", "/settings"],
    portfolio: ["/", "/projects", "/about", "/contact"],
    blog: ["/", "/posts", "/categories", "/about"],
    ecommerce: ["/", "/products", "/cart", "/checkout"]
  };
  
  return routes[template as keyof typeof routes] || ["/"];
}

function generateTailwindConfig(colors: any): string {
  return `module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "${colors.primary}",
        secondary: "${colors.secondary}",
        accent: "${colors.accent}"
      }
    }
  },
  plugins: []
};`;
}

function generateRoutesFile(routes: string[]): string {
  return `export const routes = ${JSON.stringify(routes, null, 2)};
  
export default routes;`;
}

// Enhanced Azure AI-powered performance analysis
async function analyzePerformanceWithAI(client: any, config: AzureAIConfig, projectPath: string, metrics: string[]): Promise<any> {
  try {
    console.log("🚀 Starting enhanced performance analysis...");
    
    const performancePrompt = `Conduct a comprehensive performance analysis of a React/TypeScript project.

**PROJECT CONTEXT:**
- Project Path: ${projectPath}
- Requested Metrics: ${metrics.join(', ')}
- Analysis Type: Full-stack performance evaluation

**ANALYSIS REQUIREMENTS:**

1. **Frontend Performance Metrics**:
   - Initial page load time and Time to Interactive (TTI)
   - Bundle size analysis and code splitting effectiveness
   - Render performance and React component optimization
   - Memory usage patterns and potential leaks
   - Network request optimization and caching strategies

2. **React-Specific Analysis**:
   - Component re-render frequency and causes
   - State management efficiency
   - Hook usage patterns and optimization opportunities
   - Virtual DOM performance considerations
   - Concurrent features utilization

3. **Build and Bundle Analysis**:
   - Webpack/Vite bundle analysis
   - Tree-shaking effectiveness
   - Code splitting strategy evaluation
   - Asset optimization (images, fonts, etc.)
   - Third-party library impact

4. **Runtime Performance**:
   - JavaScript execution time
   - Paint and layout performance
   - Memory consumption patterns
   - User interaction responsiveness
   - Progressive loading strategies

**RESPONSE FORMAT:**
Respond with ONLY valid JSON in this exact structure:

{
  "performanceMetrics": {
    "loadTime": {
      "value": "realistic load time in seconds (0.5-8.0)",
      "grade": "A|B|C|D|F",
      "benchmark": "comparison to industry standards"
    },
    "bundleSize": {
      "main": "main bundle size in KB",
      "chunks": "number and size of chunks",
      "total": "total bundle size in KB",
      "grade": "A|B|C|D|F"
    },
    "renderPerformance": {
      "firstPaint": "time to first paint in ms",
      "firstContentfulPaint": "time to FCP in ms",
      "largestContentfulPaint": "time to LCP in ms",
      "cumulativeLayoutShift": "CLS score 0-1",
      "grade": "A|B|C|D|F"
    },
    "memoryUsage": {
      "initialHeap": "initial memory usage in MB",
      "peakHeap": "peak memory usage in MB",
      "memoryLeaks": "potential leak indicators",
      "grade": "A|B|C|D|F"
    }
  },
  "optimizationSuggestions": [
    {
      "category": "loading|rendering|memory|bundle|network",
      "priority": "critical|high|medium|low",
      "issue": "specific performance issue identified",
      "solution": "detailed solution with implementation steps",
      "expectedImprovement": "quantified expected improvement",
      "effort": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "codeQualityMetrics": {
    "codeSmells": "number of code smells (0-15)",
    "duplicateCode": "percentage of duplicate code",
    "complexity": "cyclomatic complexity score",
    "maintainability": "maintainability index (0-100)"
  },
  "securityAssessment": {
    "vulnerabilities": "number of security issues (0-10)",
    "riskLevel": "low|medium|high|critical",
    "recommendations": ["security improvement suggestions"]
  },
  "overallScore": {
    "performance": "overall performance score (0-100)",
    "grade": "A|B|C|D|F",
    "summary": "concise summary of current state",
    "priorityActions": ["top 3 priority improvements"]
  }
}`;

    // Use caching for performance analysis
    const cacheKey = getCacheKey(
      `perf-analysis-${projectPath}-${metrics.join(',')}`,
      config.modelName,
      { temperature: 0.2 }
    );
    
    let cachedResult = config.cacheEnabled ? getCachedResponse(cacheKey) : null;
    if (cachedResult) {
      console.log("📄 Using cached performance analysis result");
      return cachedResult;
    }

    const response = await retryWithBackoff(async () => {
      return await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are a senior performance engineer and React optimization specialist with expertise in modern web applications. Provide comprehensive, data-driven performance analysis with specific, actionable recommendations that deliver measurable improvements."
            },
            {
              role: "user",
              content: performancePrompt
            }
          ],
          max_tokens: 3072,
          temperature: 0.2,
          model: config.modelName,
          stream: false,
          response_format: { type: "json_object" }
        },
      });
    }, config.maxRetries, config.retryDelay);

    if (response.status !== "200") {
      const errorDetail = extractAzureAIError(response.body?.error || response.body);
      throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
    }

    const aiResponse = response.body.choices[0]?.message?.content || "";
    console.log("🎯 Performance analysis AI response received, length:", aiResponse.length);
    
    const parsed = parseAzureAIJSON(aiResponse);
    if (parsed && parsed.performanceMetrics) {
      // Cache the successful result
      if (config.cacheEnabled) {
        setCachedResponse(cacheKey, parsed, 180); // Cache for 3 hours
      }
      
      console.log("✅ Performance analysis successful:", {
        overallScore: parsed.overallScore?.performance || 'unknown',
        grade: parsed.overallScore?.grade || 'unknown',
        suggestionsCount: parsed.optimizationSuggestions?.length || 0
      });
      
      return parsed;
    }

    console.warn("⚠️ Failed to parse AI performance analysis, using fallback");
    return generateFallbackPerformanceAnalysis();
    
  } catch (error) {
    console.error("❌ AI performance analysis error:", extractAzureAIError(error));
    return generateFallbackPerformanceAnalysis();
  }
}

// Uterpi-backed performance analysis using Hugging Face-style Inference Endpoint
type UterpiConfig = {
  endpointUrl: string;
  apiToken: string;
  cacheEnabled?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  modelName?: string;
};

async function analyzePerformanceWithUterpi(config: UterpiConfig, projectPath: string, metrics: string[]): Promise<any> {
  try {
    console.log("🚀 Starting enhanced performance analysis (Uterpi)...");

    const performancePrompt = `Conduct a comprehensive performance analysis of a React/TypeScript project.

**PROJECT CONTEXT:**
- Project Path: ${projectPath}
- Requested Metrics: ${metrics.join(', ')}
- Analysis Type: Full-stack performance evaluation

**ANALYSIS REQUIREMENTS:**

1. **Frontend Performance Metrics**:
   - Initial page load time and Time to Interactive (TTI)
   - Bundle size analysis and code splitting effectiveness
   - Render performance and React component optimization
   - Memory usage patterns and potential leaks
   - Network request optimization and caching strategies

2. **React-Specific Analysis**:
   - Component re-render frequency and causes
   - State management efficiency
   - Hook usage patterns and optimization opportunities
   - Virtual DOM performance considerations
   - Concurrent features utilization

3. **Build and Bundle Analysis**:
   - Webpack/Vite bundle analysis
   - Tree-shaking effectiveness
   - Code splitting strategy evaluation
   - Asset optimization (images, fonts, etc.)
   - Third-party library impact

4. **Runtime Performance**:
   - JavaScript execution time
   - Paint and layout performance
   - Memory consumption patterns
   - User interaction responsiveness
   - Progressive loading strategies

**RESPONSE FORMAT:**
Respond with ONLY valid JSON in this exact structure:

{
  "performanceMetrics": {
    "loadTime": {
      "value": "realistic load time in seconds (0.5-8.0)",
      "grade": "A|B|C|D|F",
      "benchmark": "comparison to industry standards"
    },
    "bundleSize": {
      "main": "main bundle size in KB",
      "chunks": "number and size of chunks",
      "total": "total bundle size in KB",
      "grade": "A|B|C|D|F"
    },
    "renderPerformance": {
      "firstPaint": "time to first paint in ms",
      "firstContentfulPaint": "time to FCP in ms",
      "largestContentfulPaint": "time to LCP in ms",
      "cumulativeLayoutShift": "CLS score 0-1",
      "grade": "A|B|C|D|F"
    },
    "memoryUsage": {
      "initialHeap": "initial memory usage in MB",
      "peakHeap": "peak memory usage in MB",
      "memoryLeaks": "potential leak indicators",
      "grade": "A|B|C|D|F"
    }
  },
  "optimizationSuggestions": [
    {
      "category": "loading|rendering|memory|bundle|network",
      "priority": "critical|high|medium|low",
      "issue": "specific performance issue identified",
      "solution": "detailed solution with implementation steps",
      "expectedImprovement": "quantified expected improvement",
      "effort": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "codeQualityMetrics": {
    "codeSmells": "number of code smells (0-15)",
    "duplicateCode": "percentage of duplicate code",
    "complexity": "cyclomatic complexity score",
    "maintainability": "maintainability index (0-100)"
  },
  "securityAssessment": {
    "vulnerabilities": "number of security issues (0-10)",
    "riskLevel": "low|medium|high|critical",
    "recommendations": ["security improvement suggestions"]
  },
  "overallScore": {
    "performance": "overall performance score (0-100)",
    "grade": "A|B|C|D|F",
    "summary": "concise summary of current state",
    "priorityActions": ["top 3 priority improvements"]
  }
}`;

    const cacheKey = getCacheKey(
      `perf-analysis-${projectPath}-${metrics.join(',')}`,
      config.modelName || 'uterpi-endpoint',
      { temperature: 0.2 }
    );

    let cachedResult = config.cacheEnabled ? getCachedResponse(cacheKey) : null;
    if (cachedResult) {
      console.log("📄 Using cached performance analysis result (Uterpi)");
      return cachedResult;
    }

    const maxRetries = config.maxRetries ?? 3;
    const retryDelay = config.retryDelay ?? 1000;

    const response = await retryWithBackoff(async () => {
      const r = await fetch(config.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiToken}`
        },
        body: JSON.stringify({
          inputs: performancePrompt,
          parameters: {
            max_new_tokens: 2048,
            temperature: 0.2,
            top_p: 0.9,
            return_full_text: false
          }
        })
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        throw new Error(`Uterpi endpoint error (${r.status}): ${errText}`);
      }
      return r;
    }, maxRetries, retryDelay);

    let aiResponseText = "";
    try {
      const data: any = await response.json();
      if (Array.isArray(data)) {
        aiResponseText = data[0]?.generated_text || data[0]?.summary_text || "";
      } else if (data && typeof data === 'object') {
        aiResponseText = data.generated_text || data?.choices?.[0]?.message?.content || "";
      }
      if (typeof data === 'string' && !aiResponseText) {
        aiResponseText = data;
      }
    } catch (e) {
      console.warn("Failed to parse Uterpi JSON response, attempting text fallback");
      aiResponseText = await response.text();
    }

    console.log("🎯 Performance analysis response (Uterpi) received, length:", aiResponseText?.length || 0);

    const parsed = parseAzureAIJSON(aiResponseText);
    if (parsed && parsed.performanceMetrics) {
      if (config.cacheEnabled) {
        setCachedResponse(cacheKey, parsed, 180);
      }
      console.log("✅ Performance analysis (Uterpi) successful:", {
        overallScore: parsed.overallScore?.performance || 'unknown',
        grade: parsed.overallScore?.grade || 'unknown',
        suggestionsCount: parsed.optimizationSuggestions?.length || 0
      });
      return parsed;
    }

    console.warn("⚠️ Failed to parse Uterpi performance analysis, using fallback");
    return generateFallbackPerformanceAnalysis();

  } catch (error) {
    console.error("❌ Uterpi performance analysis error:", error);
    return generateFallbackPerformanceAnalysis();
  }
}

// Map Uterpi JSON to AnalyzeModal expected shape
function mapUterpiPerformanceToModalShape(uterpiJson: any): {
  performance: { loadTime: number; bundleSize: number; renderTime: number };
  suggestions: string[];
  codeSmells: number;
  securityIssues: number;
} {
  // Defaults to avoid client crashes on missing fields
  const defaults = {
    performance: { loadTime: 2.1, bundleSize: 570, renderTime: 1850 },
    suggestions: [
      "Enable code splitting for large routes",
      "Optimize repeated renders with memoization",
      "Audit dependencies for bundle impact"
    ],
    codeSmells: 3,
    securityIssues: 1
  };

  if (!uterpiJson || typeof uterpiJson !== 'object') return defaults;

  const pm = uterpiJson.performanceMetrics || {};
  const render = pm.renderPerformance || {};
  const bundle = pm.bundleSize || {};

  const loadTimeNum = Number(pm.loadTime?.value ?? 2.1);
  const bundleTotalNum = Number(bundle.total ?? 570);
  const renderTimeNum = Number(render.largestContentfulPaint ?? 1850);

  const suggestions: string[] = Array.isArray(uterpiJson.optimizationSuggestions)
    ? uterpiJson.optimizationSuggestions.map((s: any) => s?.solution || s?.issue).filter(Boolean)
    : defaults.suggestions;

  const codeSmells = Number(uterpiJson.codeQualityMetrics?.codeSmells ?? defaults.codeSmells);
  const securityIssues = Number(uterpiJson.securityAssessment?.vulnerabilities ?? defaults.securityIssues);

  return {
    performance: {
      loadTime: isFinite(loadTimeNum) ? loadTimeNum : defaults.performance.loadTime,
      bundleSize: isFinite(bundleTotalNum) ? bundleTotalNum : defaults.performance.bundleSize,
      renderTime: isFinite(renderTimeNum) ? renderTimeNum : defaults.performance.renderTime,
    },
    suggestions: suggestions.length ? suggestions : defaults.suggestions,
    codeSmells: isFinite(codeSmells) ? codeSmells : defaults.codeSmells,
    securityIssues: isFinite(securityIssues) ? securityIssues : defaults.securityIssues
  };
}

// Azure AI-powered design pattern analysis
async function analyzeDesignPatternsWithAI(client: any, config: AzureAIConfig, codebase: string): Promise<any> {
  try {
    const patternsPrompt = `Analyze a React/TypeScript codebase for design patterns and anti-patterns.

Codebase Context: ${codebase}

Please respond in JSON format with this structure:
{
  "detected": [
    {
      "name": "PatternName",
      "usage": "percentage%",
      "recommendation": "assessment and recommendation"
    }
  ],
  "antiPatterns": [
    {
      "name": "AntiPatternName",
      "instances": number,
      "severity": "low|medium|high"
    }
  ]
}

Focus on common React patterns like:
- Component Composition
- State Management (Context, Redux, Zustand)
- Error Boundaries
- Custom Hooks
- Render Props
- Higher-Order Components

And anti-patterns like:
- Prop Drilling
- Large Components
- Direct DOM Manipulation
- Memory Leaks
- Performance Issues`;

    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: "You are an expert React architect and design pattern specialist. Analyze codebases for architectural patterns and provide insightful recommendations."
          },
          {
            role: "user",
            content: patternsPrompt
          }
        ],
        max_tokens: 2048,
        temperature: 0.3,
        model: config.modelName,
        stream: false,
      },
    });

    if (response.status !== "200") {
      throw new Error(`Azure AI API error: ${response.body?.error || 'Unknown error'}`);
    }

    const aiResponse = response.body.choices[0]?.message?.content || "";
    
    const parsed = parseAzureAIJSON(aiResponse);
    if (parsed) {
      return parsed;
    }

    // Fallback
    return generateFallbackPatternAnalysis();
  } catch (error) {
    console.error("AI pattern analysis error:", error);
    return generateFallbackPatternAnalysis();
  }
}

// Enhanced fallback functions with intelligent context awareness
function generateFallbackPerformanceAnalysis(): any {
  const timestamp = Date.now();
  return {
    performanceMetrics: {
      loadTime: {
        value: "2.1",
        grade: "C",
        benchmark: "Above average for modern React applications"
      },
      bundleSize: {
        main: "285",
        chunks: "3 chunks averaging 95KB each",
        total: "570",
        grade: "B"
      },
      renderPerformance: {
        firstPaint: "820",
        firstContentfulPaint: "1240",
        largestContentfulPaint: "1850",
        cumulativeLayoutShift: "0.12",
        grade: "B"
      },
      memoryUsage: {
        initialHeap: "12",
        peakHeap: "28",
        memoryLeaks: "None detected",
        grade: "A"
      }
    },
    optimizationSuggestions: [
      {
        category: "loading",
        priority: "high",
        issue: "Large initial bundle size affecting load time",
        solution: "Implement code splitting with React.lazy() and dynamic imports for routes",
        expectedImprovement: "30-40% reduction in initial load time",
        effort: "medium",
        impact: "high"
      },
      {
        category: "rendering",
        priority: "medium",
        issue: "Unnecessary re-renders in component tree",
        solution: "Add React.memo() to expensive components and optimize useCallback/useMemo usage",
        expectedImprovement: "15-25% improvement in render performance",
        effort: "low",
        impact: "medium"
      },
      {
        category: "bundle",
        priority: "medium",
        issue: "Unused code and dependencies in bundle",
        solution: "Enable tree-shaking optimization and audit dependency usage",
        expectedImprovement: "20-30% bundle size reduction",
        effort: "medium",
        impact: "medium"
      }
    ],
    codeQualityMetrics: {
      codeSmells: "3",
      duplicateCode: "8%",
      complexity: "6.2",
      maintainability: "78"
    },
    securityAssessment: {
      vulnerabilities: "1",
      riskLevel: "low",
      recommendations: ["Update dependencies with known vulnerabilities", "Implement input validation for user-generated content"]
    },
    overallScore: {
      performance: "75",
      grade: "B",
      summary: "Good performance with room for optimization in bundle size and render efficiency",
      priorityActions: ["Implement code splitting", "Optimize component re-renders", "Audit and reduce bundle size"]
    },
    _fallback: true,
    _timestamp: timestamp
  };
}

function generateFallbackPatternAnalysis(): any {
  return {
    detected: [
      { name: "Component Composition", usage: "85%", recommendation: "Good usage of composition over inheritance" },
      { name: "Custom Hooks", usage: "70%", recommendation: "Well implemented for logic reuse" },
      { name: "State Management", usage: "60%", recommendation: "Consider upgrading to more robust solution for complex state" },
      { name: "Error Boundaries", usage: "40%", recommendation: "Add more error boundaries for better error handling" }
    ],
    antiPatterns: [
      { name: "Prop Drilling", instances: 3, severity: "medium" },
      { name: "Large Components", instances: 2, severity: "low" },
      { name: "Inline Styles", instances: 1, severity: "low" }
    ]
  };
}

// Enhanced Azure AI-powered code analysis and improvement
async function analyzeAndImproveCodeWithAI(client: any, config: AzureAIConfig, code: string): Promise<any> {
  try {
    console.log("🔍 Starting enhanced code analysis...");
    
    const analysisPrompt = `Perform a comprehensive analysis of this React/TypeScript code and provide detailed improvement suggestions.

**CODE TO ANALYZE:**
\`\`\`typescript
${code}
\`\`\`

**ANALYSIS FRAMEWORK:**

1. **Performance Analysis**:
   - Unnecessary re-renders and optimization opportunities
   - Bundle size and tree-shaking considerations
   - Memory leaks and performance bottlenecks
   - React optimization patterns (memo, useMemo, useCallback)

2. **Code Quality Assessment**:
   - TypeScript usage and type safety
   - Component structure and organization
   - Error handling and boundary conditions
   - Code readability and maintainability

3. **Security Review**:
   - Input validation and sanitization
   - XSS and injection vulnerabilities
   - Authentication and authorization patterns
   - Data exposure and privacy concerns

4. **Accessibility Audit**:
   - ARIA attributes and roles
   - Keyboard navigation support
   - Screen reader compatibility
   - Color contrast and visual accessibility

5. **Modern React Patterns**:
   - Hook usage and custom hooks
   - Context and state management
   - Concurrent features and Suspense
   - Error boundaries and fallbacks

**RESPONSE FORMAT:**
Respond with ONLY valid JSON in this exact structure:

{
  "analysisMetadata": {
    "codeLength": ${code.length},
    "complexity": "low|medium|high",
    "overallScore": "score from 1-10",
    "primaryLanguage": "typescript|javascript"
  },
  "improvements": [
    {
      "category": "performance|security|accessibility|maintainability|modernization",
      "type": "specific improvement type",
      "description": "Clear description of the issue",
      "severity": "low|medium|high|critical",
      "line": "line number or range",
      "currentCode": "problematic code snippet",
      "suggestedFix": "improved code snippet",
      "reasoning": "why this improvement is important",
      "impact": "expected impact of the change"
    }
  ],
  "optimizedCode": "Complete improved version of the code with all fixes applied",
  "summary": {
    "totalIssues": "number of issues found",
    "criticalIssues": "number of critical issues",
    "estimatedImprovement": "percentage improvement expected",
    "keyBenefits": ["list of main benefits from improvements"]
  }
}`;

    // Use caching for code analysis
    const cacheKey = getCacheKey(
      `code-analysis-${code.substring(0, 500)}`,
      config.modelName,
      { temperature: 0.1 }
    );
    
    let cachedResult = config.cacheEnabled ? getCachedResponse(cacheKey) : null;
    if (cachedResult) {
      console.log("📄 Using cached code analysis result");
      return cachedResult;
    }

    const response = await retryWithBackoff(async () => {
      return await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are a senior software architect and code reviewer specializing in React/TypeScript. Provide comprehensive, actionable code analysis with specific improvements. Focus on practical, implementable suggestions that deliver measurable benefits."
            },
            {
              role: "user",
              content: analysisPrompt
            }
          ],
          max_tokens: 4096,
          temperature: 0.1,
          model: config.modelName,
          stream: false,
          response_format: { type: "json_object" }
        },
      });
    }, config.maxRetries, config.retryDelay);

    if (response.status !== "200") {
      const errorDetail = extractAzureAIError(response.body?.error || response.body);
      throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
    }

    const aiResponse = response.body.choices[0]?.message?.content || "";
    console.log("🎯 Code analysis AI response received, length:", aiResponse.length);
    
    const parsed = parseAzureAIJSON(aiResponse);
    if (parsed && parsed.improvements) {
      const result = {
        improvements: parsed.improvements || [],
        optimizedCode: parsed.optimizedCode || code,
        analysisMetadata: parsed.analysisMetadata || {},
        summary: parsed.summary || {}
      };
      
      // Cache the successful result
      if (config.cacheEnabled) {
        setCachedResponse(cacheKey, result, 120); // Cache for 2 hours
      }
      
      console.log("✅ Code analysis successful:", {
        issuesFound: result.improvements.length,
        complexity: result.analysisMetadata.complexity,
        score: result.analysisMetadata.overallScore
      });
      
      return result;
    }

    console.warn("⚠️ Failed to parse AI code analysis, using fallback");
    return generateFallbackCodeAnalysis(code);
    
  } catch (error) {
    console.error("❌ AI code analysis error:", extractAzureAIError(error));
    return generateFallbackCodeAnalysis(code);
  }
}

function generateFallbackCodeAnalysis(code: string): any {
  return {
    improvements: [
      {
        type: "performance",
        description: "Consider using React.memo for expensive components",
        severity: "medium",
        line: 1,
        suggestion: "Wrap component with React.memo to prevent unnecessary re-renders"
      },
      {
        type: "accessibility",
        description: "Ensure proper ARIA labels and semantic HTML",
        severity: "high",
        line: 1,
        suggestion: "Add descriptive alt attributes and ARIA labels where needed"
      },
      {
        type: "security",
        description: "Validate and sanitize user inputs",
        severity: "high",
        line: 1,
        suggestion: "Use proper input validation and sanitization techniques"
      }
    ],
    optimizedCode: code // Return original code if AI optimization fails
  };
}
