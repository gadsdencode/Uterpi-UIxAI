// Auth Routes
// Handles user authentication, registration, and account management

import { Router } from "express";
import { requireAuth, requireGuest } from "../auth";
import { authController } from "../controllers";

const router = Router();

// =============================================================================
// AUTH ROUTES
// =============================================================================

// Registration
router.post("/api/auth/register", requireGuest, (req, res) => 
  authController.register(req, res));

// Login
router.post("/api/auth/login", requireGuest, (req, res, next) => 
  authController.login(req, res, next));

// Logout
router.post("/api/auth/logout", requireAuth, (req, res) => 
  authController.logout(req, res));

// Get current user
router.get("/api/auth/me", requireAuth, (req, res) => 
  authController.getCurrentUser(req, res));

// Auth status check
router.get("/api/auth/status", (req, res) => 
  authController.getAuthStatus(req, res));

// Google OAuth
router.get("/api/auth/google", (req, res, next) => 
  authController.googleAuth(req, res, next));

router.get("/api/auth/google/callback", (req, res, next) => 
  authController.googleCallback(req, res, next));

// Password recovery
router.post("/api/auth/forgot-password", requireGuest, (req, res) => 
  authController.forgotPassword(req, res));

router.post("/api/auth/reset-password", requireGuest, (req, res) => 
  authController.resetPassword(req, res));

// Account deletion
router.delete("/api/account", requireAuth, (req, res) => 
  authController.deleteAccount(req, res));

export default router;
