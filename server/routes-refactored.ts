// Refactored Routes - Router aggregator
// All domain-specific routes are now in modular router files

import type { Express } from "express";
import { createServer, type Server } from "http";

// Import all domain routers
import {
  authRouter,
  aiRouter,
  fileRouter,
  conversationRouter,
  subscriptionRouter,
  projectRouter,
  userRouter,
  engagementRouter,
  coachRouter,
  smsRouter,
  analysisRouter
} from "./routes";

// Re-export upload temp directory for backward compatibility
export { UPLOAD_TEMP_DIR } from "./middleware/upload";

/**
 * Register all routes with the Express app
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // =============================================================================
  // MOUNT ALL DOMAIN ROUTERS
  // =============================================================================

  // Authentication routes (/api/auth/*, /api/account)
  app.use(authRouter);

  // AI routes (/lmstudio/v1/*, /ai/v1/*, /azure/v1/*, /api/ai/*)
  app.use(aiRouter);

  // File management routes (/api/files/*)
  app.use(fileRouter);

  // Conversation routes (/api/conversations/*, /api/vectorization/*, /api/test/vectorization)
  app.use(conversationRouter);

  // Subscription routes (/api/subscription/*, /api/credits/*, /api/checkout/*)
  app.use(subscriptionRouter);

  // Project routes (/api/projects/*)
  app.use(projectRouter);

  // User profile routes (/api/user/*)
  app.use(userRouter);

  // Engagement routes (/api/engagement/*)
  app.use(engagementRouter);

  // AI Coach routes (/api/coach/*)
  app.use(coachRouter);

  // SMS routes (/api/sms/*)
  app.use(smsRouter);

  // Analysis routes (/api/model/*, /api/clone-ui/*, /api/create-page/*, /api/improve/*, /api/analyze/*)
  app.use(analysisRouter);

  // =============================================================================
  // CREATE HTTP SERVER
  // =============================================================================

  const httpServer = createServer(app);
  return httpServer;
}

// Re-export services for backwards compatibility
export { createAIClient, createAzureAIClient, extractAzureAIError, parseAzureAIJSON } from "./services/aiService";
