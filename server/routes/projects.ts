// Project Routes
// Handles workspace/project management

import { Router } from "express";
import { requireAuth } from "../auth";
import { projectController } from "../controllers";

const router = Router();

// =============================================================================
// PROJECT (WORKSPACE) ROUTES
// =============================================================================

// Create project
router.post("/api/projects", requireAuth, (req, res) => 
  projectController.create(req, res));

// List projects
router.get("/api/projects", requireAuth, (req, res) => 
  projectController.list(req, res));

// Active project management (MUST be before :id routes to avoid "active" being captured as ID)
router.get("/api/projects/active", requireAuth, (req, res) => 
  projectController.getActive(req, res));

router.delete("/api/projects/active", requireAuth, (req, res) => 
  projectController.clearActive(req, res));

// Specific project routes (after /active to avoid route conflicts)
router.get("/api/projects/:id", requireAuth, (req, res) => 
  projectController.get(req, res));

router.patch("/api/projects/:id", requireAuth, (req, res) => 
  projectController.update(req, res));

router.delete("/api/projects/:id", requireAuth, (req, res) => 
  projectController.delete(req, res));

// Set default project
router.post("/api/projects/:id/set-default", requireAuth, (req, res) => 
  projectController.setDefault(req, res));

export default router;
