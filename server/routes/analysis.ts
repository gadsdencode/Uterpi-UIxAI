// Analysis Routes
// Handles code analysis, UI cloning, and model capabilities

import { Router } from "express";
import { requireActiveSubscription } from "../subscription-middleware";
import { analysisController } from "../controllers";

const router = Router();

// =============================================================================
// ANALYSIS ROUTES
// =============================================================================

// Get model capabilities (public)
router.get("/api/model/capabilities/:modelId", (req, res) => 
  analysisController.getModelCapabilities(req, res));

// Clone UI (Pro feature)
router.post("/api/clone-ui/analyze", requireActiveSubscription({
  requiredTier: 'pro'
}), (req, res) => analysisController.cloneUI(req as any, res));

// Create page (Pro feature)
router.post("/api/create-page/generate", requireActiveSubscription({
  requiredTier: 'pro'
}), (req, res) => analysisController.createPage(req as any, res));

// Get page templates (public)
router.get("/api/create-page/templates", (req, res) => 
  analysisController.getTemplates(req, res));

// Improve code (Pro feature)
router.post("/api/improve/analyze", requireActiveSubscription({
  requiredTier: 'pro'
}), (req, res) => analysisController.improveCode(req as any, res));

// Analyze performance (Pro feature)
router.post("/api/analyze/performance", requireActiveSubscription({
  requiredTier: 'pro'
}), (req, res) => analysisController.analyzePerformance(req as any, res));

// Analyze design patterns (Pro feature)
router.post("/api/analyze/design-patterns", requireActiveSubscription({
  requiredTier: 'pro'
}), (req, res) => analysisController.analyzeDesignPatterns(req as any, res));

export default router;
