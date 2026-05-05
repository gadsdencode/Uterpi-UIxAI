// SMS Routes
// Handles SMS preferences, verification, and messaging

import { Router } from "express";
import { requireAuth } from "../auth";
import { smsController } from "../controllers";
import { requireMinimumCredits, requireTeamRole } from "../subscription-middleware";
import { rawBodyParser } from "../webhooks";

const router = Router();

// =============================================================================
// SMS ROUTES
// =============================================================================

// Get SMS preferences
router.get("/api/sms/preferences", requireAuth, (req, res) => 
  smsController.getPreferences(req, res));

// Update SMS preferences
router.post("/api/sms/preferences", requireAuth, (req, res) => 
  smsController.updatePreferences(req, res));

// Phone verification
router.post("/api/sms/verify-phone", requireAuth, (req, res) => 
  smsController.verifyPhone(req, res));

router.post("/api/sms/confirm-verification", requireAuth, (req, res) => 
  smsController.confirmVerification(req, res));

// Send SMS (requires minimum credits)
router.post("/api/sms/send", requireAuth, requireMinimumCredits(10), (req, res) => 
  smsController.sendSms(req as any, res));

// SMS history
router.get("/api/sms/history", requireAuth, (req, res) => 
  smsController.getHistory(req, res));

// SMS templates
router.get("/api/sms/templates", requireAuth, (req, res) => 
  smsController.getTemplates(req, res));

router.post("/api/sms/templates", requireAuth, requireTeamRole(['owner', 'admin']), (req, res) => 
  smsController.createTemplate(req, res));

// SMS webhook (uses raw body parser for signature verification)
router.post("/api/sms/webhook/status", rawBodyParser, (req, res) => 
  smsController.webhookStatus(req, res));

export default router;
