// Project Controller - Handles project (workspace) management routes
// CRUD operations for user projects with scoped chats and files

import type { Request, Response } from "express";
import { storage } from "../storage";
import { insertProjectSchema, updateProjectSchema } from "@shared/schema";

/**
 * Project Controller - Handles all project-related routes
 */
export class ProjectController {

  /**
   * Create a new project
   * POST /api/projects
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Validate request body
      const validationResult = insertProjectSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
        return;
      }

      const project = await storage.createProject(user.id, validationResult.data);

      res.status(201).json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          instructions: project.instructions,
          isDefault: project.isDefault,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      });
    } catch (error: any) {
      console.error("Error creating project:", error);
      res.status(500).json({ 
        error: "Failed to create project",
        message: error.message 
      });
    }
  }

  /**
   * List all projects for the current user
   * GET /api/projects
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const projects = await storage.getUserProjects(user.id);

      res.json({
        success: true,
        projects: projects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          instructions: p.instructions,
          isDefault: p.isDefault,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        }))
      });
    } catch (error: any) {
      console.error("Error listing projects:", error);
      res.status(500).json({ 
        error: "Failed to list projects",
        message: error.message 
      });
    }
  }

  /**
   * Get a specific project by ID
   * GET /api/projects/:id
   */
  async get(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      const project = await storage.getProject(projectId);
      
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      // Verify ownership
      if (project.userId !== user.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          instructions: project.instructions,
          isDefault: project.isDefault,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      });
    } catch (error: any) {
      console.error("Error getting project:", error);
      res.status(500).json({ 
        error: "Failed to get project",
        message: error.message 
      });
    }
  }

  /**
   * Update a project
   * PATCH /api/projects/:id
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      // Verify ownership first
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      if (existingProject.userId !== user.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // Validate request body
      const validationResult = updateProjectSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
        return;
      }

      const project = await storage.updateProject(projectId, validationResult.data);

      if (!project) {
        res.status(500).json({ error: "Failed to update project" });
        return;
      }

      res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          instructions: project.instructions,
          isDefault: project.isDefault,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      });
    } catch (error: any) {
      console.error("Error updating project:", error);
      res.status(500).json({ 
        error: "Failed to update project",
        message: error.message 
      });
    }
  }

  /**
   * Delete a project
   * DELETE /api/projects/:id
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      // Verify ownership first
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      if (existingProject.userId !== user.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      await storage.deleteProject(projectId);

      res.json({
        success: true,
        message: "Project deleted successfully"
      });
    } catch (error: any) {
      console.error("Error deleting project:", error);
      res.status(500).json({ 
        error: "Failed to delete project",
        message: error.message 
      });
    }
  }

  /**
   * Get the user's current default/active project
   * GET /api/projects/active
   */
  async getActive(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const project = await storage.getDefaultProject(user.id);

      res.json({
        success: true,
        project: project ? {
          id: project.id,
          name: project.name,
          description: project.description,
          instructions: project.instructions,
          isDefault: project.isDefault,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        } : null
      });
    } catch (error: any) {
      console.error("Error getting active project:", error);
      res.status(500).json({ 
        error: "Failed to get active project",
        message: error.message 
      });
    }
  }

  /**
   * Clear the active project (set to General/No Project)
   * DELETE /api/projects/active
   */
  async clearActive(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Unset any default project for this user
      await storage.clearDefaultProject(user.id);

      res.json({
        success: true,
        message: "Active project cleared"
      });
    } catch (error: any) {
      console.error("Error clearing active project:", error);
      res.status(500).json({ 
        error: "Failed to clear active project",
        message: error.message 
      });
    }
  }

  /**
   * Set a project as the default
   * POST /api/projects/:id/set-default
   */
  async setDefault(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      if (!user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        res.status(400).json({ error: "Invalid project ID" });
        return;
      }

      // Verify ownership first
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      if (existingProject.userId !== user.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const project = await storage.setDefaultProject(user.id, projectId);

      if (!project) {
        res.status(500).json({ error: "Failed to set default project" });
        return;
      }

      res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          instructions: project.instructions,
          isDefault: project.isDefault,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      });
    } catch (error: any) {
      console.error("Error setting default project:", error);
      res.status(500).json({ 
        error: "Failed to set default project",
        message: error.message 
      });
    }
  }
}

// Export singleton instance
export const projectController = new ProjectController();

