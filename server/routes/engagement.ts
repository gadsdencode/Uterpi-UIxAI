// Engagement Routes
// Handles user activity tracking, email preferences, and analytics

import { Router } from "express";
import { requireAuth } from "../auth";
import { engagementController } from "../controllers";

const router = Router();

// =============================================================================
// ENGAGEMENT ROUTES
// =============================================================================

// Track user activity
router.post("/api/engagement/track", requireAuth, (req, res) => 
  engagementController.trackActivity(req, res));

// Get engagement stats
router.get("/api/engagement/stats", requireAuth, (req, res) => 
  engagementController.getStats(req, res));

// Email preferences
router.get("/api/engagement/email-preferences", requireAuth, (req, res) => 
  engagementController.getEmailPreferences(req, res));

router.put("/api/engagement/email-preferences", requireAuth, (req, res) => 
  engagementController.updateEmailPreferences(req, res));

// Unsubscribe from emails (public - uses token)
router.post("/api/engagement/unsubscribe", (req, res) => 
  engagementController.unsubscribe(req, res));

// Email tracking pixels (public)
router.get("/api/engagement/track-open", (req, res) => 
  engagementController.trackOpen(req, res));

router.get("/api/engagement/track-click", (req, res) => 
  engagementController.trackClick(req, res));

// Send email
router.post("/api/engagement/send-email", requireAuth, (req, res) => 
  engagementController.sendEmail(req, res));

export default router;
