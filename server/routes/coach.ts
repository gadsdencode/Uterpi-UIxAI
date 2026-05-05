// Coach Routes
// Handles AI coaching insights and workflow tracking

import { Router } from "express";
import { requireAuth } from "../auth";
import { coachController } from "../controllers";

const router = Router();

// =============================================================================
// COACH ROUTES
// =============================================================================

// Get coaching insights
router.get("/api/coach/insights", requireAuth, (req, res) => 
  coachController.getInsights(req, res));

// Mark insight as shown
router.post("/api/coach/insights/:id/shown", requireAuth, (req, res) => 
  coachController.markInsightShown(req, res));

// Submit feedback on insight
router.post("/api/coach/insights/:id/feedback", requireAuth, (req, res) => 
  coachController.submitFeedback(req, res));

// Get workflow stats
router.get("/api/coach/workflow-stats", requireAuth, (req, res) => 
  coachController.getWorkflowStats(req, res));

// Track command usage
router.post("/api/coach/track-command", requireAuth, (req, res) => 
  coachController.trackCommand(req, res));

// Track model switch
router.post("/api/coach/track-model-switch", requireAuth, (req, res) => 
  coachController.trackModelSwitch(req, res));

// Generate insights manually
router.post("/api/coach/generate-insights", requireAuth, (req, res) => 
  coachController.generateInsights(req, res));

export default router;
