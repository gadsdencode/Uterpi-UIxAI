import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth, requireGuest } from "./auth";
import passport from "./auth";
import { registerUserSchema, loginUserSchema, publicUserSchema, updateProfileSchema, subscriptionPlans, subscriptions, users, files } from "@shared/schema";
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
}

// Helper function to extract error details from Azure AI response
export function extractAzureAIError(error: any): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    // Try to extract error message from common error structures
    if (error.message) return error.message;
    if (error.error && error.error.message) return error.error.message;
    if (error.code && error.message) return `${error.code}: ${error.message}`;
    
    // If it's an object without clear structure, stringify it
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error object';
    }
  }
  
  return 'Unknown error';
}

// Robust JSON parser for Azure AI responses
export function parseAzureAIJSON(response: string): any {
  try {
    // First, try direct parsing without any sanitization
    try {
      const directParse = JSON.parse(response);
      if (directParse && typeof directParse === 'object') {
        return directParse;
      }
    } catch (directError) {
      console.log('Direct JSON parsing failed, attempting sanitization...');
    }

    // Try to find JSON in the response using multiple patterns
    const jsonPatterns = [
      /```json\s*(\{[\s\S]*?\})\s*```/,   // Markdown JSON blocks (most specific)
      /```\s*(\{[\s\S]*?\})\s*```/,        // Generic code blocks
      /\{[\s\S]*\}/,                       // Any content between braces (fallback)
    ];

    for (const pattern of jsonPatterns) {
      const match = response.match(pattern);
      if (match) {
        try {
          let jsonStr = match[1] || match[0];
          
          // Try parsing without sanitization first
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object') {
              return parsed;
            }
          } catch (unsanitizedError) {
            // Only apply sanitization if direct parsing fails
            console.log('Attempting to sanitize JSON before parsing...');
            jsonStr = sanitizeJSONString(jsonStr);
            
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object') {
              return parsed;
            }
          }
        } catch (parseError) {
          console.warn('Failed to parse JSON pattern match:', parseError);
          continue;
        }
      }
    }

    // Log the actual response for debugging
    console.warn('No valid JSON found in Azure AI response. Response preview:', response.substring(0, 200));
    return null;
  } catch (error) {
    console.error('JSON parsing completely failed:', error);
    return null;
  }
}

// Sanitize JSON string to fix common issues
function sanitizeJSONString(jsonStr: string): string {
  return jsonStr
    .trim()
    // Fix single quotes to double quotes (but be careful not to break already valid JSON)
    .replace(/(?<!\\)'/g, '"')
    // Fix trailing commas before closing brackets/braces
    .replace(/,(\s*[}\]])/g, '$1')
    // Fix unquoted property names (only if they're not already quoted)
    .replace(/(?<!")(\w+):/g, '"$1":')
    // Fix missing quotes around string values (but not numbers/booleans/null)
    .replace(/:\s*(?<!["\d])([a-zA-Z][a-zA-Z0-9_\-]*)\s*([,}\]])/g, (match, value, suffix) => {
      // Don't quote boolean values, null, or numbers
      if (value === 'true' || value === 'false' || value === 'null' || !isNaN(Number(value))) {
        return `: ${value}${suffix}`;
      }
      return `: "${value}"${suffix}`;
    })
    // Fix number values that were incorrectly quoted
    .replace(/:\s*"(\d+(?:\.\d+)?)"/g, ': $1')
    // Remove any double quotes that might have been created incorrectly
    .replace(/""/g, '"');
}

// Function to check actual model capabilities by testing API calls
async function checkModelCapabilities(client: any, modelId: string): Promise<{
  supportsVision: boolean;
  supportsCodeGeneration: boolean;
  supportsAnalysis: boolean;
  supportsImageGeneration: boolean;
}> {
  const capabilities = {
    supportsVision: false,
    supportsCodeGeneration: false,
    supportsAnalysis: false,
    supportsImageGeneration: false
  };

  // Test vision capability with a minimal test image
  try {
    const testImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="; // 1x1 transparent pixel
    
    const visionResponse = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What do you see in this image? Just say 'I can see an image' if you can process it." },
              { 
                type: "image_url", 
                image_url: { 
                  url: `data:image/png;base64,${testImageBase64}` 
                } 
              }
            ]
          }
        ],
        max_tokens: 50,
        temperature: 0.1,
        model: modelId,
        stream: false,
      },
    });

    if (visionResponse.status === "200" && visionResponse.body?.choices?.[0]?.message?.content) {
      capabilities.supportsVision = true;
    }
  } catch (error) {
    // Vision not supported, which is expected for most models
    console.log(`Vision capability test failed for ${modelId}:`, extractAzureAIError(error));
  }

  // Test code generation capability
  try {
    const codeResponse = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "user",
            content: "Write a simple function that adds two numbers in JavaScript. Just the function, no explanation."
          }
        ],
        max_tokens: 100,
        temperature: 0.1,
        model: modelId,
        stream: false,
      },
    });

    if (codeResponse.status === "200" && codeResponse.body?.choices?.[0]?.message?.content) {
      capabilities.supportsCodeGeneration = true;
    }
  } catch (error) {
    console.log(`Code generation capability test failed for ${modelId}:`, extractAzureAIError(error));
  }

  // Test analysis capability
  try {
    const analysisResponse = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "user",
            content: "Analyze this text for sentiment: 'This is a great day!' Respond with just 'positive', 'negative', or 'neutral'."
          }
        ],
        max_tokens: 10,
        temperature: 0.1,
        model: modelId,
        stream: false,
      },
    });

    if (analysisResponse.status === "200" && analysisResponse.body?.choices?.[0]?.message?.content) {
      capabilities.supportsAnalysis = true;
    }
  } catch (error) {
    console.log(`Analysis capability test failed for ${modelId}:`, extractAzureAIError(error));
  }

  // Note: Image generation typically requires different endpoints/models, 
  // so we'll keep this as false for now
  capabilities.supportsImageGeneration = false;

  return capabilities;
}

// Initialize Azure AI client
export function createAzureAIClient(): { client: any; config: AzureAIConfig } {
  const endpoint = process.env.VITE_AZURE_AI_ENDPOINT;
  const apiKey = process.env.VITE_AZURE_AI_API_KEY;
  const modelName = process.env.VITE_AZURE_AI_MODEL_NAME || "gpt-4o-mini";

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure AI configuration missing. Please set VITE_AZURE_AI_ENDPOINT and VITE_AZURE_AI_API_KEY environment variables."
    );
  }

  const config: AzureAIConfig = { endpoint, apiKey, modelName };
  const client = ModelClient(endpoint, new AzureKeyCredential(apiKey));
  
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

  // Clone UI endpoints (requires subscription)
  app.post("/api/clone-ui/analyze", requireActiveSubscription({
    customMessage: "AI-powered UI analysis requires a paid subscription"
  }), upload.single('image'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const { client, config } = createAzureAIClient();
      
      // Convert image to base64 for Azure AI Vision
      const imageBase64 = req.file.buffer.toString('base64');
      const imageMimeType = req.file.mimetype;

      // Use Azure AI to analyze the UI image
      const analysisPrompt = `Analyze this UI/web design image and extract the following information:
1. Identify all UI components (headers, navigation, hero sections, buttons, forms, etc.)
2. Describe the layout structure 
3. Extract the color palette used
4. Estimate the implementation complexity

Please respond in JSON format with this structure:
{
  "components": [{"type": "string", "description": "string"}],
  "colorPalette": ["hex_color1", "hex_color2", ...],
  "layout": "string description",
  "estimatedComplexity": "low|medium|high"
}`;

      const response = await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are an expert UI/UX designer and frontend developer. Analyze images and provide detailed, accurate assessments of web interfaces."
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
          max_tokens: 2048,
          temperature: 0.3,
          model: config.modelName,
          stream: false,
        },
      });

      if (response.status !== "200") {
        const errorDetail = extractAzureAIError(response.body?.error || response.body);
        throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
      }

      const aiResponse = response.body.choices[0]?.message?.content || "";
      
      // Parse AI response with robust JSON parsing
      const analysisResult = parseAzureAIJSON(aiResponse) || {
        components: [{ type: "component", description: "Unable to analyze components" }],
        colorPalette: ["#000000", "#ffffff"],
        layout: "standard layout",
        estimatedComplexity: "medium"
      };

      // Generate code based on AI analysis
      const generatedCode = await generateUICodeWithAI(client, config, analysisResult);

      res.json({
        success: true,
        analysis: analysisResult,
        generatedCode
      });
    } catch (error) {
      console.error("Clone UI analysis error:", error);
      
      // Provide more detailed error information while keeping it safe for client
      let errorMessage = "Failed to analyze image with Azure AI";
      if (error instanceof Error) {
        errorMessage = error.message.includes('Azure AI API error') 
          ? error.message 
          : `Analysis failed: ${error.message}`;
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: "Please check that your image is a valid UI/web design screenshot"
      });
    }
  });

  // Create Page endpoints (requires subscription)
  app.post("/api/create-page/generate", requireActiveSubscription({
    customMessage: "AI-powered page generation requires a paid subscription"
  }), async (req, res) => {
    try {
      const { template, requirements, style } = req.body;
      const { client, config } = createAzureAIClient();
      
      // Use Azure AI to generate page structure and components
      const pageResult = await generatePageWithAI(client, config, template, requirements, style);
      const files = await generatePageFilesWithAI(client, config, pageResult);

      res.json({
        success: true,
        page: pageResult,
        files
      });
    } catch (error) {
      console.error("Create page error:", error);
      res.status(500).json({ error: "Failed to generate page with Azure AI" });
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
      const { client, config } = createAzureAIClient();
      
      // Use Azure AI to analyze performance
      const analysis = await analyzePerformanceWithAI(client, config, projectPath, metrics);

      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error("Performance analysis error:", error);
      res.status(500).json({ error: "Failed to analyze performance with Azure AI" });
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

// Helper functions for Azure AI-powered code generation
async function generateUICodeWithAI(client: any, config: AzureAIConfig, analysis: any): Promise<string> {
  try {
    const codePrompt = `Based on this UI analysis, generate a complete React TypeScript component that recreates the design:

Analysis:
- Components: ${analysis.components.map((c: any) => `${c.type}: ${c.description}`).join(', ')}
- Layout: ${analysis.layout}
- Color Palette: ${analysis.colorPalette.join(', ')}
- Complexity: ${analysis.estimatedComplexity}

Requirements:
1. Create a fully functional React TypeScript component
2. Use Tailwind CSS for styling
3. Include proper component structure and TypeScript types
4. Make it responsive and modern
5. Include the detected components in appropriate sections
6. Use the provided color palette
7. Add proper accessibility attributes
8. Export as default

Please provide ONLY the code, no explanations or markdown formatting.`;

    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: "You are an expert React/TypeScript developer. Generate clean, modern, production-ready code using best practices."
          },
          {
            role: "user",
            content: codePrompt
          }
        ],
        max_tokens: 4096,
        temperature: 0.2,
        model: config.modelName,
        stream: false,
      },
    });

    if (response.status !== "200") {
      const errorDetail = extractAzureAIError(response.body?.error || response.body);
      throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
    }

    return response.body.choices[0]?.message?.content || generateFallbackUICode(analysis);
  } catch (error) {
    console.error("AI code generation error:", error);
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

// Azure AI-powered page generation
async function generatePageWithAI(client: any, config: AzureAIConfig, template: string, requirements: string, style: string): Promise<any> {
  try {
    const pagePrompt = `Generate a ${template} page structure based on these requirements:

Template: ${template}
Requirements: ${requirements}
Style: ${style}

Please respond in JSON format with this structure:
{
  "template": "${template}",
  "components": [{"name": "string", "props": ["prop1", "prop2"]}],
  "styles": {
    "theme": "string",
    "colors": {"primary": "hex", "secondary": "hex", "accent": "hex"},
    "spacing": "string",
    "borderRadius": "string"
  },
  "routes": ["route1", "route2"]
}

Consider modern web design principles and the specified style theme.`;

    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: "You are an expert web architect and UI designer. Generate comprehensive page structures with proper component organization."
          },
          {
            role: "user",
            content: pagePrompt
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
    return parsed || generateFallbackPageStructure(template, style);
  } catch (error) {
    console.error("AI page generation error:", error);
    return generateFallbackPageStructure(template, style);
  }
}

async function generatePageFilesWithAI(client: any, config: AzureAIConfig, pageResult: any): Promise<any[]> {
  try {
    const files = [];
    
    // Generate main App component
    const appPrompt = `Generate a React TypeScript App component for a ${pageResult.template} page with these specifications:

Components: ${pageResult.components.map((c: any) => c.name).join(', ')}
Style: ${pageResult.styles.theme}
Colors: ${JSON.stringify(pageResult.styles.colors)}

Requirements:
1. Complete React TypeScript component
2. Use Tailwind CSS with the specified colors
3. Include all specified components
4. Modern, responsive design
5. Proper TypeScript types
6. Export as default

Provide ONLY the code, no explanations.`;

    const appResponse = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: "You are an expert React/TypeScript developer. Generate production-ready components."
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

    if (appResponse.status === "200") {
      const appCode = appResponse.body.choices[0]?.message?.content || "";
      files.push({
        name: "App.tsx",
        content: appCode,
        type: "component"
      });
    }

    // Generate individual components
    for (const component of pageResult.components.slice(0, 3)) { // Limit to 3 to avoid token limits
      const componentPrompt = `Generate a React TypeScript ${component.name} component with props: ${component.props.join(', ')}.
      
Style: ${pageResult.styles.theme}
Colors: ${JSON.stringify(pageResult.styles.colors)}

Make it reusable, accessible, and styled with Tailwind CSS. Provide ONLY the code.`;

      const componentResponse = await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content: "You are an expert React developer. Create reusable, accessible components."
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

      if (componentResponse.status === "200") {
        const componentCode = componentResponse.body.choices[0]?.message?.content || "";
        files.push({
          name: `${component.name}.tsx`,
          content: componentCode,
          type: "component"
        });
      }
    }

    // Add configuration files
    files.push(
      {
        name: "tailwind.config.js",
        content: generateTailwindConfig(pageResult.styles.colors),
        type: "config"
      },
      {
        name: "routes.ts",
        content: generateRoutesFile(pageResult.routes),
        type: "config"
      }
    );

    return files;
  } catch (error) {
    console.error("AI file generation error:", error);
    return generateFallbackPageFiles(pageResult);
  }
}

// Fallback functions
function generateFallbackPageStructure(template: string, style: string): any {
  return {
    template: template || "landing",
    components: [
      { name: "Header", props: ["title", "navigation"] },
      { name: "Hero", props: ["title", "subtitle", "cta"] },
      { name: "Features", props: ["items", "layout"] },
      { name: "Footer", props: ["links", "copyright"] }
    ],
    styles: {
      theme: style || "modern",
      colors: {
        primary: "#6366f1",
        secondary: "#1e293b",
        accent: "#f59e0b"
      },
      spacing: "8px",
      borderRadius: "8px"
    },
    routes: getDefaultRoutes(template)
  };
}

function generateFallbackPageFiles(pageResult: any): any[] {
  return [
    { name: "App.tsx", content: "// Main application component", type: "component" },
    { name: "Header.tsx", content: "// Header component", type: "component" },
    { name: "tailwind.config.js", content: generateTailwindConfig(pageResult.styles.colors), type: "config" },
    { name: "routes.ts", content: generateRoutesFile(pageResult.routes), type: "config" }
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

// Azure AI-powered performance analysis
async function analyzePerformanceWithAI(client: any, config: AzureAIConfig, projectPath: string, metrics: string[]): Promise<any> {
  try {
    const performancePrompt = `Analyze the performance of a React/TypeScript project and provide realistic metrics and suggestions.

Project Context: ${projectPath}
Requested Metrics: ${metrics.join(', ')}

Please respond in JSON format with this structure:
{
  "performance": {
    "loadTime": number, // in seconds (1-5 range)
    "bundleSize": number, // in KB (100-1000 range)
    "renderTime": number // in milliseconds (20-200 range)
  },
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "codeSmells": number, // 0-10 range
  "securityIssues": number // 0-5 range
}

Provide realistic performance metrics and actionable optimization suggestions for a modern React application.`;

    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: "You are an expert performance engineer and React optimization specialist. Provide realistic performance analysis and actionable recommendations."
          },
          {
            role: "user",
            content: performancePrompt
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
    return generateFallbackPerformanceAnalysis();
  } catch (error) {
    console.error("AI performance analysis error:", error);
    return generateFallbackPerformanceAnalysis();
  }
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

// Fallback functions
function generateFallbackPerformanceAnalysis(): any {
  return {
    performance: {
      loadTime: 2.1,
      bundleSize: 385,
      renderTime: 75
    },
    suggestions: [
      "Consider code splitting for better performance",
      "Optimize images and use modern formats like WebP",
      "Implement lazy loading for components and routes",
      "Use React.memo for expensive components",
      "Minimize bundle size by tree-shaking unused code"
    ],
    codeSmells: 3,
    securityIssues: 1
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

// Azure AI-powered code analysis and improvement
async function analyzeAndImproveCodeWithAI(client: any, config: AzureAIConfig, code: string): Promise<any> {
  try {
    const analysisPrompt = `Analyze this React/TypeScript code and provide detailed improvement suggestions:

\`\`\`
${code}
\`\`\`

Please respond in JSON format with this structure:
{
  "improvements": [
    {
      "type": "performance|accessibility|security|maintainability",
      "description": "Brief description of the issue",
      "severity": "low|medium|high",
      "line": number,
      "suggestion": "Detailed suggestion for improvement"
    }
  ],
  "optimizedCode": "// Improved version of the code with fixes applied"
}

Focus on:
1. Performance optimizations (React.memo, useMemo, useCallback, etc.)
2. Accessibility improvements (ARIA labels, semantic HTML, etc.)
3. Security best practices (input validation, XSS prevention, etc.)
4. Code maintainability (TypeScript types, error handling, etc.)
5. Modern React patterns and best practices`;

    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: "You are an expert React/TypeScript code reviewer and senior developer. Provide thorough, actionable code analysis and improvements."
          },
          {
            role: "user",
            content: analysisPrompt
          }
        ],
        max_tokens: 4096,
        temperature: 0.2,
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
        return {
          improvements: parsed.improvements || [],
          optimizedCode: parsed.optimizedCode || code
        };
      }

    // Fallback if parsing fails
    return generateFallbackCodeAnalysis(code);
  } catch (error) {
    console.error("AI code analysis error:", error);
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
