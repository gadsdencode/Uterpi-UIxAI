// AI Routes
// Handles LM Studio, Azure, and universal AI chat endpoints

import { Router } from "express";
import { requireAuth } from "../auth";
import { aiController } from "../controllers";
import { 
  checkFreemiumLimit, 
  requireDynamicCredits,
  estimateRequiredCredits
} from "../subscription-middleware";
import { isVectorizationEnabled } from "../vector-flags";

const router = Router();

// =============================================================================
// LM STUDIO / UTERPI PROXY ROUTES
// =============================================================================

router.post("/lmstudio/v1/chat/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
  const { messages, model } = req.body;
  const hasAttachments = messages?.some((msg: any) => msg.attachments?.length > 0);
  return estimateRequiredCredits(messages || [], false, hasAttachments, model || '');
}, 'chat'), (req, res) => aiController.lmStudioChatCompletions(req, res));

router.post("/lmstudio/v1/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
  const { prompt, model } = req.body;
  return estimateRequiredCredits([{ content: prompt || '' }], false, false, model || '');
}, 'completion'), (req, res) => aiController.lmStudioCompletions(req, res));

router.post("/lmstudio/v1/embeddings", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
  const { input } = req.body;
  const inputText = Array.isArray(input) ? input.join(' ') : (input || '');
  return Math.max(1, Math.ceil(estimateRequiredCredits([{ content: inputText }], false, false, '') * 0.5));
}, 'embedding'), (req, res) => aiController.lmStudioEmbeddings(req, res));

router.get("/lmstudio/v1/models", (req, res) => aiController.lmStudioModels(req, res));

// =============================================================================
// UNIVERSAL AI CHAT ROUTES
// =============================================================================

router.post("/ai/v1/chat/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
  const body: any = req.body || {};
  const raw = body.original_messages || body.messages;
  const enableContext = body.enableContext ?? true;
  const model = body.model;
  const hasAttachments = raw?.some((msg: any) => msg.attachments?.length > 0);
  const effectiveEnableContext = isVectorizationEnabled() ? enableContext : false;
  return estimateRequiredCredits(raw || [], effectiveEnableContext, hasAttachments, model || '');
}, 'chat'), (req, res) => aiController.chatCompletions(req as any, res));

router.post("/azure/v1/chat/completions", requireAuth, checkFreemiumLimit(), requireDynamicCredits((req) => {
  const body: any = req.body || {};
  const raw = body.original_messages || body.messages;
  const model = body.model;
  const hasAttachments = raw?.some((msg: any) => msg.attachments?.length > 0);
  return estimateRequiredCredits(raw || [], false, hasAttachments, model || '');
}, 'chat'), (req, res) => aiController.chatCompletions(req as any, res));

// =============================================================================
// AI METRICS AND GENERATION ROUTES
// =============================================================================

router.get("/api/ai/metrics", requireAuth, (req, res) => 
  aiController.getMetrics(req, res));

router.post("/api/ai/generate-templates", requireAuth, checkFreemiumLimit(), requireDynamicCredits(() => {
  return 5; // Fixed cost for template generation
}, 'chat'), (req, res) => aiController.generateTemplates(req as any, res));

router.post("/api/ai/generate-suggestions", requireAuth, checkFreemiumLimit(), requireDynamicCredits(() => {
  return 5;
}, 'chat'), (req, res) => aiController.generateSuggestions(req as any, res));

router.post("/api/ai/generate-page", requireAuth, checkFreemiumLimit(), requireDynamicCredits(() => {
  return 20; // Higher cost for page generation
}, 'chat'), (req, res) => aiController.generatePage(req as any, res));

export default router;
