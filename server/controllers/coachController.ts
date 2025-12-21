// Coach Controller - Handles AI coach routes
// Insights, workflow stats, command tracking, model switching

import type { Request, Response } from "express";
import { aiCoachService } from "../ai-coach";

/**
 * Coach Controller - Handles all AI coach-related routes
 */
export class CoachController {

  /**
   * Get coach insights for user
   */
  async getInsights(req: Request, res: Response): Promise<void> {
    try {
      const insights = await aiCoachService.getPendingInsights(req.user!.id);
      
      res.json({
        success: true,
        insights
      });
    } catch (error) {
      console.error("Get insights error:", error);
      res.status(500).json({ error: "Failed to get insights" });
    }
  }

  /**
   * Mark insight as shown
   */
  async markInsightShown(req: Request, res: Response): Promise<void> {
    try {
      const insightId = parseInt(req.params.id);
      await aiCoachService.markInsightShown(insightId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Mark insight shown error:", error);
      res.status(500).json({ error: "Failed to mark insight as shown" });
    }
  }

  /**
   * Submit insight feedback
   */
  async submitFeedback(req: Request, res: Response): Promise<void> {
    try {
      const insightId = parseInt(req.params.id);
      const { isHelpful, action } = req.body;
      
      await aiCoachService.recordInsightFeedback(insightId, isHelpful, action);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Submit feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  }

  /**
   * Get workflow stats
   */
  async getWorkflowStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await aiCoachService.getUserWorkflowStats(req.user!.id);
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error("Get workflow stats error:", error);
      res.status(500).json({ error: "Failed to get workflow stats" });
    }
  }

  /**
   * Track command usage
   */
  async trackCommand(req: Request, res: Response): Promise<void> {
    try {
      const { command, model, tokensUsed, responseTime, isSuccess } = req.body;
      
      if (!command || !model) {
        res.status(400).json({ error: "Command and model are required" });
        return;
      }

      const sessionId = req.sessionID;
      
      await aiCoachService.trackWorkflowActivity(
        req.user!.id,
        sessionId,
        'command_usage',
        {
          command,
          model,
          tokensUsed,
          responseTime,
          isSuccess,
          timestamp: new Date().toISOString(),
        }
      );
      
      res.json({ success: true });
    } catch (error) {
      console.error("Track command error:", error);
      res.status(500).json({ error: "Failed to track command" });
    }
  }

  /**
   * Track model switch
   */
  async trackModelSwitch(req: Request, res: Response): Promise<void> {
    try {
      const { fromModel, toModel, reason } = req.body;
      
      if (!fromModel || !toModel) {
        res.status(400).json({ error: "fromModel and toModel are required" });
        return;
      }

      const sessionId = req.sessionID;
      
      await aiCoachService.trackWorkflowActivity(
        req.user!.id,
        sessionId,
        'model_switch',
        {
          fromModel,
          toModel,
          reason,
          timestamp: new Date().toISOString(),
        }
      );
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error tracking model switch:', error);
      res.status(500).json({ error: "Failed to track model switch" });
    }
  }
}

// Export singleton instance
export const coachController = new CoachController();

