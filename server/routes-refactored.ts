// Refactored Routes - Slim router using controllers
// All business logic moved to controllers and services

import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { requireAuth, requireGuest } from "./auth";
import passport from "./auth";
import multer from 'multer';

// Import controllers
import {
  aiController,
  authController,
  conversationController,
  fileController,
  subscriptionController,
  userController,
  smsController,
  coachController,
  engagementController,
  analysisController
} from "./controllers";

// Import middleware
import { 
  requireActiveSubscription, 
  checkFreemiumLimit, 
  requireDynamicCredits, 
  requireMinimumCredits,
  requireTeamRole,
  estimateRequiredCredits
} from "./subscription-middleware";

import { handleStripeWebhook, rawBodyParser } from "./webhooks";
import { isVectorizationEnabled } from "./vector-flags";

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const mt = file.mimetype || '';
    const ok = mt.startsWith('image/') ||
               mt.startsWith('text/') ||
               mt === 'application/json' ||
               mt === 'application/pdf' ||
               mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    cb(null, ok);
  }
});

// Define custom request interface for file uploads
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * Register all routes with the Express app
 */
export async function registerRoutes(app: Express): Promise<Server> {

  // =============================================================================
  // LM STUDIO / UTERPI PROXY ROUTES
  // =============================================================================
  
  app.post("/lmstudio/v1/chat/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    const { messages, model } = req.body;
    const hasAttachments = messages?.some((msg: any) => msg.attachments?.length > 0);
    return estimateRequiredCredits(messages || [], false, hasAttachments, model || '');
  }, 'chat'), (req, res) => aiController.lmStudioChatCompletions(req, res));

  app.post("/lmstudio/v1/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    const { prompt, model } = req.body;
    return estimateRequiredCredits([{ content: prompt || '' }], false, false, model || '');
  }, 'completion'), (req, res) => aiController.lmStudioCompletions(req, res));

  app.post("/lmstudio/v1/embeddings", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    const { input } = req.body;
    const inputText = Array.isArray(input) ? input.join(' ') : (input || '');
    return Math.max(1, Math.ceil(estimateRequiredCredits([{ content: inputText }], false, false, '') * 0.5));
  }, 'embedding'), (req, res) => aiController.lmStudioEmbeddings(req, res));

  app.get("/lmstudio/v1/models", (req, res) => aiController.lmStudioModels(req, res));

  // =============================================================================
  // VECTORIZATION ROUTES
  // =============================================================================

  app.post("/api/test/vectorization", requireAuth, (req, res) => 
    conversationController.testVectorization(req, res));

  app.get("/api/vectorization/status", requireAuth, (req, res) => 
    conversationController.getVectorizationStatus(req, res));

  // =============================================================================
  // CONVERSATION ROUTES
  // =============================================================================

  app.get("/api/conversations", requireAuth, (req, res) => 
    conversationController.getConversations(req, res));

  app.get("/api/conversations/:id/messages", requireAuth, (req, res) => 
    conversationController.getMessages(req, res));

  app.patch("/api/conversations/:id/title", requireAuth, (req, res) => 
    conversationController.updateTitle(req, res));

  app.patch("/api/conversations/:id/archive", requireAuth, (req, res) => 
    conversationController.archive(req, res));

  app.patch("/api/conversations/:id/unarchive", requireAuth, (req, res) => 
    conversationController.unarchive(req, res));

  app.delete("/api/conversations/:id", requireAuth, (req, res) => 
    conversationController.delete(req, res));

  app.patch("/api/conversations/:id/star", requireAuth, (req, res) => 
    conversationController.star(req, res));

  app.get("/api/conversations/:id/export", requireAuth, (req, res) => 
    conversationController.exportConversation(req, res));

  app.post("/api/conversations/export/bulk", requireAuth, (req, res) => 
    conversationController.exportBulk(req, res));

  // =============================================================================
  // UNIVERSAL AI CHAT ROUTES
  // =============================================================================

  app.post("/ai/v1/chat/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    const body: any = req.body || {};
    const raw = body.original_messages || body.messages;
    const enableContext = body.enableContext ?? true;
    const model = body.model;
    const hasAttachments = raw?.some((msg: any) => msg.attachments?.length > 0);
    const effectiveEnableContext = isVectorizationEnabled() ? enableContext : false;
    return estimateRequiredCredits(raw || [], effectiveEnableContext, hasAttachments, model || '');
  }, 'chat'), (req, res) => aiController.chatCompletions(req as any, res));

  app.post("/azure/v1/chat/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    const body: any = req.body || {};
    const raw = body.original_messages || body.messages;
    const model = body.model;
    const hasAttachments = raw?.some((msg: any) => msg.attachments?.length > 0);
    return estimateRequiredCredits(raw || [], false, hasAttachments, model || '');
  }, 'chat'), (req, res) => aiController.chatCompletions(req as any, res));

  // =============================================================================
  // AUTH ROUTES
  // =============================================================================

  app.post("/api/auth/register", requireGuest, (req, res) => 
    authController.register(req, res));

  app.post("/api/auth/login", requireGuest, (req, res, next) => 
    authController.login(req, res, next));

  app.post("/api/auth/logout", requireAuth, (req, res) => 
    authController.logout(req, res));

  app.get("/api/auth/me", requireAuth, (req, res) => 
    authController.getCurrentUser(req, res));

  app.get("/api/auth/status", (req, res) => 
    authController.getAuthStatus(req, res));

  app.get("/api/auth/google", (req, res, next) => 
    authController.googleAuth(req, res, next));

  app.get("/api/auth/google/callback", (req, res, next) => 
    authController.googleCallback(req, res, next));

  app.post("/api/auth/forgot-password", requireGuest, (req, res) => 
    authController.forgotPassword(req, res));

  app.post("/api/auth/reset-password", requireGuest, (req, res) => 
    authController.resetPassword(req, res));

  app.delete("/api/account", requireAuth, (req, res) => 
    authController.deleteAccount(req, res));

  // =============================================================================
  // ENGAGEMENT ROUTES
  // =============================================================================

  app.post("/api/engagement/track", requireAuth, (req, res) => 
    engagementController.trackActivity(req, res));

  app.get("/api/engagement/stats", requireAuth, (req, res) => 
    engagementController.getStats(req, res));

  app.get("/api/engagement/email-preferences", requireAuth, (req, res) => 
    engagementController.getEmailPreferences(req, res));

  app.put("/api/engagement/email-preferences", requireAuth, (req, res) => 
    engagementController.updateEmailPreferences(req, res));

  app.post("/api/engagement/unsubscribe", (req, res) => 
    engagementController.unsubscribe(req, res));

  app.get("/api/engagement/track-open", (req, res) => 
    engagementController.trackOpen(req, res));

  app.get("/api/engagement/track-click", (req, res) => 
    engagementController.trackClick(req, res));

  app.post("/api/engagement/send-email", requireAuth, (req, res) => 
    engagementController.sendEmail(req, res));

  // =============================================================================
  // COACH ROUTES
  // =============================================================================

  app.get("/api/coach/insights", requireAuth, (req, res) => 
    coachController.getInsights(req, res));

  app.post("/api/coach/insights/:id/shown", requireAuth, (req, res) => 
    coachController.markInsightShown(req, res));

  app.post("/api/coach/insights/:id/feedback", requireAuth, (req, res) => 
    coachController.submitFeedback(req, res));

  app.get("/api/coach/workflow-stats", requireAuth, (req, res) => 
    coachController.getWorkflowStats(req, res));

  app.post("/api/coach/track-command", requireAuth, (req, res) => 
    coachController.trackCommand(req, res));

  app.post("/api/coach/track-model-switch", requireAuth, (req, res) => 
    coachController.trackModelSwitch(req, res));

  // =============================================================================
  // USER PROFILE ROUTES
  // =============================================================================

  app.get("/api/user/profile", requireAuth, (req, res) => 
    userController.getProfile(req, res));

  app.put("/api/user/profile", requireAuth, (req, res) => 
    userController.updateProfile(req, res));

  // =============================================================================
  // SMS ROUTES
  // =============================================================================

  app.get("/api/sms/preferences", requireAuth, (req, res) => 
    smsController.getPreferences(req, res));

  app.post("/api/sms/preferences", requireAuth, (req, res) => 
    smsController.updatePreferences(req, res));

  app.post("/api/sms/verify-phone", requireAuth, (req, res) => 
    smsController.verifyPhone(req, res));

  app.post("/api/sms/confirm-verification", requireAuth, (req, res) => 
    smsController.confirmVerification(req, res));

  app.post("/api/sms/send", requireAuth, requireMinimumCredits(10), (req, res) => 
    smsController.sendSms(req as any, res));

  app.get("/api/sms/history", requireAuth, (req, res) => 
    smsController.getHistory(req, res));

  app.get("/api/sms/templates", requireAuth, (req, res) => 
    smsController.getTemplates(req, res));

  app.post("/api/sms/templates", requireAuth, requireTeamRole(['owner', 'admin']), (req, res) => 
    smsController.createTemplate(req, res));

  app.post("/api/sms/webhook/status", rawBodyParser, (req, res) => 
    smsController.webhookStatus(req, res));

  // =============================================================================
  // SUBSCRIPTION ROUTES
  // =============================================================================

  app.get("/api/subscription/plans", (req, res) => 
    subscriptionController.getPlans(req, res));

  app.get("/api/subscription/status", requireAuth, (req, res) => 
    subscriptionController.getStatus(req, res));

  app.get("/api/subscription/details", requireAuth, (req, res) => 
    subscriptionController.getDetails(req, res));

  app.get("/api/credits/balance", requireAuth, (req, res) => 
    subscriptionController.getCreditsBalance(req, res));

  app.post("/api/subscription/setup-intent", requireAuth, (req, res) => 
    subscriptionController.createSetupIntent(req, res));

  app.post("/api/subscription/create", requireAuth, (req, res) => 
    subscriptionController.create(req, res));

  app.post("/api/subscription/cancel", requireAuth, (req, res) => 
    subscriptionController.cancel(req, res));

  app.post("/api/subscription/reactivate", requireAuth, (req, res) => 
    subscriptionController.reactivate(req, res));

  app.post("/api/subscription/billing-portal", requireAuth, (req, res) => 
    subscriptionController.billingPortal(req, res));

  app.post("/api/checkout/subscription", requireAuth, (req, res) => 
    subscriptionController.checkoutSubscription(req, res));

  app.post("/api/checkout/credits", requireAuth, (req, res) => 
    subscriptionController.checkoutCredits(req, res));

  app.get("/api/checkout/session/:sessionId", requireAuth, (req, res) => 
    subscriptionController.getCheckoutSession(req, res));

  // =============================================================================
  // AI METRICS AND GENERATION ROUTES
  // =============================================================================

  app.get("/api/ai/metrics", requireAuth, (req, res) => 
    aiController.getMetrics(req, res));

  app.post("/api/ai/generate-templates", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    return 5; // Fixed cost for template generation
  }, 'chat'), (req, res) => aiController.generateTemplates(req as any, res));

  app.post("/api/ai/generate-suggestions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    return 5;
  }, 'chat'), (req, res) => aiController.generateSuggestions(req as any, res));

  app.post("/api/ai/generate-page", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
    return 20; // Higher cost for page generation
  }, 'chat'), (req, res) => aiController.generatePage(req as any, res));

  // =============================================================================
  // ANALYSIS ROUTES
  // =============================================================================

  app.get("/api/model/capabilities/:modelId", (req, res) => 
    analysisController.getModelCapabilities(req, res));

  app.post("/api/clone-ui/analyze", requireActiveSubscription({
    requiredTier: 'pro'
  }), (req, res) => analysisController.cloneUI(req as any, res));

  app.post("/api/create-page/generate", requireActiveSubscription({
    requiredTier: 'pro'
  }), (req, res) => analysisController.createPage(req as any, res));

  app.get("/api/create-page/templates", (req, res) => 
    analysisController.getTemplates(req, res));

  app.post("/api/improve/analyze", requireActiveSubscription({
    requiredTier: 'pro'
  }), (req, res) => analysisController.improveCode(req as any, res));

  app.post("/api/analyze/performance", requireActiveSubscription({
    requiredTier: 'pro'
  }), (req, res) => analysisController.analyzePerformance(req as any, res));

  app.post("/api/analyze/design-patterns", requireActiveSubscription({
    requiredTier: 'pro'
  }), (req, res) => analysisController.analyzeDesignPatterns(req as any, res));

  // =============================================================================
  // FILE MANAGEMENT ROUTES
  // =============================================================================

  app.post("/api/files/upload", requireAuth, upload.single('file'), (req, res) => 
    fileController.upload(req as MulterRequest, res));

  app.post("/api/files/:fileId/reindex", requireAuth, (req, res) => 
    fileController.reindex(req, res));

  app.get("/api/files/folders", requireAuth, (req, res) => 
    fileController.getFolders(req, res));

  app.get("/api/files/:fileId", requireAuth, (req, res) => 
    fileController.getFile(req, res));

  app.get("/api/files/:fileId/download", requireAuth, (req, res) => 
    fileController.download(req, res));

  app.put("/api/files/:fileId", requireAuth, (req, res) => 
    fileController.update(req, res));

  app.delete("/api/files/:fileId", requireAuth, (req, res) => 
    fileController.delete(req, res));

  app.get("/api/files", requireAuth, (req, res) => 
    fileController.list(req, res));

  app.post("/api/files/:fileId/analyze", requireActiveSubscription({
    requiredTier: 'pro'
  }), (req, res) => fileController.analyze(req, res));

  app.get("/api/files/:fileId/versions", requireAuth, (req, res) => 
    fileController.getVersions(req, res));

  app.post("/api/files/:fileId/versions/:versionId/restore", requireAuth, (req, res) => 
    fileController.restoreVersion(req, res));

  app.post("/api/files/:fileId/share", requireAuth, (req, res) => 
    fileController.share(req, res));

  app.get("/api/files/:fileId/permissions", requireAuth, (req, res) => 
    fileController.getPermissions(req, res));

  app.get("/api/files/:fileId/analytics", requireAuth, (req, res) => 
    fileController.getAnalytics(req, res));

  app.post("/api/files/bulk/delete", requireAuth, (req, res) => 
    fileController.bulkDelete(req, res));

  // =============================================================================
  // CREATE HTTP SERVER
  // =============================================================================

  const httpServer = createServer(app);
  return httpServer;
}

// Re-export services for backwards compatibility
export { createAIClient, createAzureAIClient, extractAzureAIError, parseAzureAIJSON } from "./services/aiService";

