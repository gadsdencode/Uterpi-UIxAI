// Subscription Routes
// Handles subscription plans, billing, credits, and checkout

import { Router } from "express";
import { requireAuth } from "../auth";
import { subscriptionController } from "../controllers";

const router = Router();

// =============================================================================
// SUBSCRIPTION ROUTES
// =============================================================================

// Get available plans (public)
router.get("/api/subscription/plans", (req, res) => 
  subscriptionController.getPlans(req, res));

// Get subscription status
router.get("/api/subscription/status", requireAuth, (req, res) => 
  subscriptionController.getStatus(req, res));

// Get subscription details
router.get("/api/subscription/details", requireAuth, (req, res) => 
  subscriptionController.getDetails(req, res));

// Get credits balance
router.get("/api/credits/balance", requireAuth, (req, res) => 
  subscriptionController.getCreditsBalance(req, res));

// Create setup intent for payment methods
router.post("/api/subscription/setup-intent", requireAuth, (req, res) => 
  subscriptionController.createSetupIntent(req, res));

// Create subscription
router.post("/api/subscription/create", requireAuth, (req, res) => 
  subscriptionController.create(req, res));

// Cancel subscription
router.post("/api/subscription/cancel", requireAuth, (req, res) => 
  subscriptionController.cancel(req, res));

// Reactivate subscription
router.post("/api/subscription/reactivate", requireAuth, (req, res) => 
  subscriptionController.reactivate(req, res));

// Access billing portal
router.post("/api/subscription/billing-portal", requireAuth, (req, res) => 
  subscriptionController.billingPortal(req, res));

// =============================================================================
// CHECKOUT ROUTES
// =============================================================================

// Checkout for subscription
router.post("/api/checkout/subscription", requireAuth, (req, res) => 
  subscriptionController.checkoutSubscription(req, res));

// Checkout for credits
router.post("/api/checkout/credits", requireAuth, (req, res) => 
  subscriptionController.checkoutCredits(req, res));

// Get checkout session status
router.get("/api/checkout/session/:sessionId", requireAuth, (req, res) => 
  subscriptionController.getCheckoutSession(req, res));

export default router;
