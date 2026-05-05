// User Routes
// Handles user profile management

import { Router } from "express";
import { requireAuth } from "../auth";
import { userController } from "../controllers";

const router = Router();

// =============================================================================
// USER PROFILE ROUTES
// =============================================================================

// Get user profile
router.get("/api/user/profile", requireAuth, (req, res) => 
  userController.getProfile(req, res));

// Update user profile
router.put("/api/user/profile", requireAuth, (req, res) => 
  userController.updateProfile(req, res));

export default router;
