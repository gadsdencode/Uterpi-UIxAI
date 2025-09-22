import { eq, and, gte, desc, sql, asc } from "drizzle-orm";
import { db } from "./db";
import {
  workflowTracking,
  aiCoachInsights,
  workflowPatterns,
  aiCoachConversations,
  userActivity,
  users,
  type User
} from "@shared/schema";

// =============================================================================
// AI COACH SERVICE
// =============================================================================

export interface WorkflowCommand {
  command: string;
  timestamp: string;
  modelUsed?: string;
  duration?: number;
  success?: boolean;
}

export interface ModelSwitchPattern {
  fromModel: string;
  toModel: string;
  reason?: string;
  timestamp: string;
}

export interface WorkflowAnalysis {
  workflowType: string;
  efficiencyScore: number;
  bottlenecks: string[];
  optimizations: string[];
  modelRecommendations: {
    currentModel: string;
    recommendedModel: string;
    reason: string;
    expectedImprovement: number;
  }[];
  timeAnalysis: {
    totalTime: number;
    activeTime: number;
    idleTime: number;
    averageStepTime: number;
  };
  complexityAssessment: {
    level: 'simple' | 'moderate' | 'complex' | 'expert';
    factors: string[];
  };
}

export interface CoachInsight {
  type: 'workflow_optimization' | 'model_recommendation' | 'efficiency_tip' | 'pattern_recognition' | 'strategic_advice';
  category: 'strategic' | 'tactical' | 'operational';
  title: string;
  description: string;
  recommendations: {
    action: string;
    expectedImprovement: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  context?: any;
}

export class AICoachService {
  private azureAIEndpoint: string;
  private azureAIKey: string;

  constructor() {
    this.azureAIEndpoint = process.env.AZURE_AI_ENDPOINT || '';
    this.azureAIKey = process.env.AZURE_AI_KEY || '';
  }

  /**
   * Track workflow activity
   */
  async trackWorkflowActivity(
    userId: number,
    sessionId: string,
    activityType: string,
    activityData: any
  ): Promise<void> {
    try {
      // Get or create active workflow
      let workflow = await this.getActiveWorkflow(userId, sessionId);
      
      if (!workflow) {
        workflow = await this.createWorkflow(userId, sessionId, activityType);
      }

      // Update workflow based on activity type
      await this.updateWorkflowWithActivity(workflow.id, activityType, activityData);

      // Check if we should analyze the workflow
      if (await this.shouldAnalyzeWorkflow(workflow.id)) {
        await this.analyzeWorkflow(workflow.id);
      }

    } catch (error) {
      console.error('Error tracking workflow activity:', error);
    }
  }

  /**
   * Get active workflow for user session
   */
  private async getActiveWorkflow(userId: number, sessionId: string) {
    const result = await db
      .select()
      .from(workflowTracking)
      .where(
        and(
          eq(workflowTracking.userId, userId),
          eq(workflowTracking.sessionId, sessionId),
          eq(workflowTracking.status, 'active')
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Create new workflow
   */
  private async createWorkflow(userId: number, sessionId: string, initialActivity: string) {
    const workflowType = this.determineWorkflowType(initialActivity);
    
    const [workflow] = await db
      .insert(workflowTracking)
      .values({
        userId,
        sessionId,
        workflowType,
        workflowName: `${workflowType} workflow`,
        commandSequence: [],
        modelSwitchPatterns: [],
      })
      .returning();

    return workflow;
  }

  /**
   * Determine workflow type from activity
   */
  private determineWorkflowType(activity: string): string {
    if (activity.includes('code') || activity.includes('debug')) return 'coding';
    if (activity.includes('analyze') || activity.includes('review')) return 'analysis';
    if (activity.includes('write') || activity.includes('document')) return 'writing';
    if (activity.includes('research') || activity.includes('search')) return 'research';
    if (activity.includes('refactor')) return 'refactoring';
    return 'general';
  }

  /**
   * Update workflow with new activity
   */
  private async updateWorkflowWithActivity(
    workflowId: number,
    activityType: string,
    activityData: any
  ): Promise<void> {
    const workflow = await db
      .select()
      .from(workflowTracking)
      .where(eq(workflowTracking.id, workflowId))
      .limit(1);

    if (!workflow[0]) return;

    const currentWorkflow = workflow[0];
    const commandSequence = (currentWorkflow.commandSequence as WorkflowCommand[]) || [];
    const modelSwitchPatterns = (currentWorkflow.modelSwitchPatterns as ModelSwitchPattern[]) || [];

    // Add command to sequence
    if (activityType === 'command' || activityType === 'chat_message') {
      commandSequence.push({
        command: activityData.command || activityType,
        timestamp: new Date().toISOString(),
        modelUsed: activityData.model,
        duration: activityData.duration,
        success: activityData.success !== false,
      });
    }

    // Track model switches
    if (activityType === 'model_switch') {
      modelSwitchPatterns.push({
        fromModel: activityData.fromModel,
        toModel: activityData.toModel,
        reason: activityData.reason,
        timestamp: new Date().toISOString(),
      });
    }

    // Update workflow
    await db
      .update(workflowTracking)
      .set({
        commandSequence,
        modelSwitchPatterns,
        totalSteps: commandSequence.length,
        updatedAt: new Date(),
      })
      .where(eq(workflowTracking.id, workflowId));
  }

  /**
   * Check if workflow should be analyzed
   */
  private async shouldAnalyzeWorkflow(workflowId: number): Promise<boolean> {
    const workflow = await db
      .select()
      .from(workflowTracking)
      .where(eq(workflowTracking.id, workflowId))
      .limit(1);

    if (!workflow[0]) return false;

    const wf = workflow[0];
    const commandCount = ((wf.commandSequence as WorkflowCommand[]) || []).length;
    
    // Analyze every 5 commands or if 5 minutes have passed
    const timeSinceLastAnalysis = wf.lastAnalyzedAt 
      ? Date.now() - wf.lastAnalyzedAt.getTime()
      : Infinity;

    return commandCount % 5 === 0 || timeSinceLastAnalysis > 5 * 60 * 1000;
  }

  /**
   * Analyze workflow and generate insights
   */
  async analyzeWorkflow(workflowId: number): Promise<WorkflowAnalysis | null> {
    try {
      const workflow = await db
        .select()
        .from(workflowTracking)
        .where(eq(workflowTracking.id, workflowId))
        .limit(1);

      if (!workflow[0]) return null;

      const wf = workflow[0];
      const analysis = await this.performWorkflowAnalysis(wf);

      // Store analysis
      await db
        .update(workflowTracking)
        .set({
          coachAnalysis: analysis,
          lastAnalyzedAt: new Date(),
          efficiencyScore: analysis.efficiencyScore,
          complexityLevel: analysis.complexityAssessment.level,
        })
        .where(eq(workflowTracking.id, workflowId));

      // Generate and store insights
      const insights = await this.generateInsights(wf.userId, analysis, wf);
      await this.storeInsights(wf.userId, workflowId, insights);

      return analysis;
    } catch (error) {
      console.error('Error analyzing workflow:', error);
      return null;
    }
  }

  /**
   * Perform deep workflow analysis
   */
  private async performWorkflowAnalysis(workflow: any): Promise<WorkflowAnalysis> {
    const commands = (workflow.commandSequence as WorkflowCommand[]) || [];
    const modelSwitches = (workflow.modelSwitchPatterns as ModelSwitchPattern[]) || [];

    // Calculate time metrics
    const timeAnalysis = this.analyzeTimeMetrics(commands);
    
    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(commands);
    
    // Generate optimizations
    const optimizations = this.generateOptimizations(commands, modelSwitches);
    
    // Model recommendations
    const modelRecommendations = this.analyzeModelUsage(commands, modelSwitches);
    
    // Complexity assessment
    const complexityAssessment = this.assessComplexity(commands, workflow.workflowType);
    
    // Calculate efficiency score
    const efficiencyScore = this.calculateEfficiencyScore(
      timeAnalysis,
      bottlenecks.length,
      commands.filter(c => c.success !== false).length / commands.length
    );

    return {
      workflowType: workflow.workflowType || 'general',
      efficiencyScore,
      bottlenecks,
      optimizations,
      modelRecommendations,
      timeAnalysis,
      complexityAssessment,
    };
  }

  /**
   * Analyze time metrics
   */
  private analyzeTimeMetrics(commands: WorkflowCommand[]): WorkflowAnalysis['timeAnalysis'] {
    if (commands.length === 0) {
      return {
        totalTime: 0,
        activeTime: 0,
        idleTime: 0,
        averageStepTime: 0,
      };
    }

    const timestamps = commands.map(c => new Date(c.timestamp).getTime());
    const totalTime = timestamps[timestamps.length - 1] - timestamps[0];
    
    const activeTime = commands.reduce((sum, c) => sum + (c.duration || 0), 0);
    const idleTime = totalTime - activeTime;
    const averageStepTime = activeTime / commands.length;

    return {
      totalTime: Math.round(totalTime / 1000), // Convert to seconds
      activeTime: Math.round(activeTime / 1000),
      idleTime: Math.round(idleTime / 1000),
      averageStepTime: Math.round(averageStepTime / 1000),
    };
  }

  /**
   * Identify workflow bottlenecks
   */
  private identifyBottlenecks(commands: WorkflowCommand[]): string[] {
    const bottlenecks: string[] = [];
    
    // Find commands that took unusually long
    const avgDuration = commands.reduce((sum, c) => sum + (c.duration || 0), 0) / commands.length;
    const slowCommands = commands.filter(c => (c.duration || 0) > avgDuration * 2);
    
    if (slowCommands.length > 0) {
      bottlenecks.push(`${slowCommands.length} commands took longer than average`);
    }

    // Find repeated failed commands
    const failedCommands = commands.filter(c => c.success === false);
    if (failedCommands.length > 2) {
      bottlenecks.push(`${failedCommands.length} commands failed, indicating potential issues`);
    }

    // Find repetitive patterns that might indicate confusion
    const commandCounts: Record<string, number> = {};
    commands.forEach(c => {
      commandCounts[c.command] = (commandCounts[c.command] || 0) + 1;
    });
    
    const repetitiveCommands = Object.entries(commandCounts)
      .filter(([_, count]) => count > 3)
      .map(([cmd, count]) => `"${cmd}" repeated ${count} times`);
    
    if (repetitiveCommands.length > 0) {
      bottlenecks.push(...repetitiveCommands);
    }

    return bottlenecks;
  }

  /**
   * Generate workflow optimizations
   */
  private generateOptimizations(
    commands: WorkflowCommand[],
    modelSwitches: ModelSwitchPattern[]
  ): string[] {
    const optimizations: string[] = [];

    // Check for excessive model switching
    if (modelSwitches.length > 3) {
      optimizations.push('Consider sticking with one model for consistency');
    }

    // Check for command patterns that could be batched
    const consecutiveSimilar = this.findConsecutiveSimilarCommands(commands);
    if (consecutiveSimilar > 2) {
      optimizations.push('Batch similar operations together for efficiency');
    }

    // Check for inefficient command sequences
    if (this.hasIneffcientPatterns(commands)) {
      optimizations.push('Reorder your workflow steps for better efficiency');
    }

    return optimizations;
  }

  /**
   * Analyze model usage and generate recommendations
   */
  private analyzeModelUsage(
    commands: WorkflowCommand[],
    modelSwitches: ModelSwitchPattern[]
  ): WorkflowAnalysis['modelRecommendations'] {
    const recommendations: WorkflowAnalysis['modelRecommendations'] = [];
    
    // Count model usage
    const modelUsage: Record<string, number> = {};
    commands.forEach(c => {
      if (c.modelUsed) {
        modelUsage[c.modelUsed] = (modelUsage[c.modelUsed] || 0) + 1;
      }
    });

    // Analyze model effectiveness
    const modelPerformance: Record<string, { success: number; total: number }> = {};
    commands.forEach(c => {
      if (c.modelUsed) {
        if (!modelPerformance[c.modelUsed]) {
          modelPerformance[c.modelUsed] = { success: 0, total: 0 };
        }
        modelPerformance[c.modelUsed].total++;
        if (c.success !== false) {
          modelPerformance[c.modelUsed].success++;
        }
      }
    });

    // Generate recommendations based on performance
    Object.entries(modelPerformance).forEach(([model, perf]) => {
      const successRate = perf.success / perf.total;
      if (successRate < 0.7) {
        recommendations.push({
          currentModel: model,
          recommendedModel: this.getRecommendedModel(model, commands),
          reason: `Low success rate (${Math.round(successRate * 100)}%) with current model`,
          expectedImprovement: 30,
        });
      }
    });

    return recommendations;
  }

  /**
   * Assess workflow complexity
   */
  private assessComplexity(
    commands: WorkflowCommand[],
    workflowType: string
  ): WorkflowAnalysis['complexityAssessment'] {
    const factors: string[] = [];
    let complexityScore = 0;

    // Factor 1: Number of steps
    if (commands.length > 20) {
      factors.push('High number of steps');
      complexityScore += 3;
    } else if (commands.length > 10) {
      factors.push('Moderate number of steps');
      complexityScore += 2;
    } else {
      complexityScore += 1;
    }

    // Factor 2: Variety of commands
    const uniqueCommands = new Set(commands.map(c => c.command)).size;
    if (uniqueCommands > 10) {
      factors.push('High command variety');
      complexityScore += 3;
    } else if (uniqueCommands > 5) {
      factors.push('Moderate command variety');
      complexityScore += 2;
    } else {
      complexityScore += 1;
    }

    // Factor 3: Workflow type complexity
    if (['debugging', 'refactoring', 'analysis'].includes(workflowType)) {
      factors.push(`Complex workflow type: ${workflowType}`);
      complexityScore += 2;
    }

    // Determine level
    let level: 'simple' | 'moderate' | 'complex' | 'expert';
    if (complexityScore >= 7) level = 'expert';
    else if (complexityScore >= 5) level = 'complex';
    else if (complexityScore >= 3) level = 'moderate';
    else level = 'simple';

    return { level, factors };
  }

  /**
   * Calculate efficiency score
   */
  private calculateEfficiencyScore(
    timeAnalysis: WorkflowAnalysis['timeAnalysis'],
    bottleneckCount: number,
    successRate: number
  ): number {
    let score = 100;

    // Penalize for idle time
    const idleRatio = timeAnalysis.idleTime / (timeAnalysis.totalTime || 1);
    score -= Math.min(30, idleRatio * 100);

    // Penalize for bottlenecks
    score -= bottleneckCount * 5;

    // Factor in success rate
    score *= successRate;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Helper: Find consecutive similar commands
   */
  private findConsecutiveSimilarCommands(commands: WorkflowCommand[]): number {
    let maxConsecutive = 0;
    let currentConsecutive = 1;

    for (let i = 1; i < commands.length; i++) {
      if (commands[i].command === commands[i - 1].command) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }

    return maxConsecutive;
  }

  /**
   * Helper: Check for inefficient patterns
   */
  private hasIneffcientPatterns(commands: WorkflowCommand[]): boolean {
    // Check for back-and-forth patterns
    for (let i = 2; i < commands.length; i++) {
      if (commands[i].command === commands[i - 2].command &&
          commands[i].command !== commands[i - 1].command) {
        return true;
      }
    }
    return false;
  }

  /**
   * Helper: Get recommended model based on task
   */
  private getRecommendedModel(currentModel: string, commands: WorkflowCommand[]): string {
    // Analyze command types to recommend best model
    const hasCode = commands.some(c => 
      c.command.includes('code') || 
      c.command.includes('debug') || 
      c.command.includes('refactor')
    );
    
    const hasAnalysis = commands.some(c => 
      c.command.includes('analyze') || 
      c.command.includes('review')
    );

    if (hasCode) return 'gpt-4o'; // Best for coding
    if (hasAnalysis) return 'claude-3-opus'; // Best for analysis
    return 'gpt-4o-mini'; // Good general purpose
  }

  /**
   * Generate insights from workflow analysis [[memory:3578529]]
   */
  async generateInsights(
    userId: number,
    analysis: WorkflowAnalysis,
    workflow: any
  ): Promise<CoachInsight[]> {
    const insights: CoachInsight[] = [];

    // Strategic insights based on workflow patterns
    if (analysis.efficiencyScore < 60) {
      insights.push({
        type: 'workflow_optimization',
        category: 'strategic',
        title: '🎯 Workflow Optimization Opportunity',
        description: `Your workflow efficiency is at ${analysis.efficiencyScore}%. I've identified specific improvements that could save you ${Math.round(analysis.timeAnalysis.idleTime / 60)} minutes.`,
        recommendations: [
          {
            action: 'Batch similar operations together',
            expectedImprovement: '30% time reduction',
            difficulty: 'easy',
          },
          {
            action: 'Use keyboard shortcuts for frequent actions',
            expectedImprovement: '15% speed increase',
            difficulty: 'easy',
          },
        ],
        priority: 'high',
      });
    }

    // Model recommendations
    if (analysis.modelRecommendations.length > 0) {
      const bestRec = analysis.modelRecommendations[0];
      insights.push({
        type: 'model_recommendation',
        category: 'tactical',
        title: '🤖 Model Optimization Detected',
        description: `Switching to ${bestRec.recommendedModel} for ${workflow.workflowType} tasks could improve your results by ${bestRec.expectedImprovement}%. ${bestRec.reason}`,
        recommendations: [
          {
            action: `Switch to ${bestRec.recommendedModel}`,
            expectedImprovement: `${bestRec.expectedImprovement}% better results`,
            difficulty: 'easy',
          },
        ],
        priority: 'medium',
      });
    }

    // Bottleneck insights
    if (analysis.bottlenecks.length > 0) {
      insights.push({
        type: 'efficiency_tip',
        category: 'operational',
        title: '⚡ Performance Bottlenecks Detected',
        description: `I've identified ${analysis.bottlenecks.length} bottlenecks in your workflow: ${analysis.bottlenecks[0]}`,
        recommendations: analysis.bottlenecks.slice(0, 2).map(b => ({
          action: `Address: ${b}`,
          expectedImprovement: '20% faster completion',
          difficulty: 'medium',
        })),
        priority: 'medium',
      });
    }

    // Complexity-based insights
    if (analysis.complexityAssessment.level === 'expert') {
      insights.push({
        type: 'strategic_advice',
        category: 'strategic',
        title: '🧠 Complex Project Detected',
        description: 'This project has grown in complexity. Consider breaking it into smaller, manageable modules or creating a structured approach.',
        recommendations: [
          {
            action: 'Create a project roadmap',
            expectedImprovement: 'Better organization and clarity',
            difficulty: 'medium',
          },
          {
            action: 'Set up automated testing',
            expectedImprovement: 'Catch issues earlier',
            difficulty: 'hard',
          },
        ],
        priority: 'high',
      });
    }

    // Pattern recognition insights
    const patterns = await this.identifyUserPatterns(userId);
    if (patterns.length > 0) {
      const pattern = patterns[0];
      insights.push({
        type: 'pattern_recognition',
        category: 'strategic',
        title: '📊 Pattern Detected in Your Workflow',
        description: `You frequently ${pattern.patternName}. I can help automate this for you.`,
        recommendations: [
          {
            action: 'Create a custom workflow template',
            expectedImprovement: '50% faster for repetitive tasks',
            difficulty: 'easy',
          },
        ],
        priority: 'low',
      });
    }

    // Use Azure AI for deeper insights if available
    if (this.azureAIEndpoint && this.azureAIKey) {
      const aiInsights = await this.getAzureAIInsights(analysis, workflow);
      insights.push(...aiInsights);
    }

    return insights;
  }

  /**
   * Get insights from Azure AI [[memory:3578529]]
   */
  private async getAzureAIInsights(
    analysis: WorkflowAnalysis,
    workflow: any
  ): Promise<CoachInsight[]> {
    try {
      const prompt = `
        Analyze this workflow and provide strategic, high-level insights:
        
        Workflow Type: ${workflow.workflowType}
        Efficiency Score: ${analysis.efficiencyScore}
        Complexity: ${analysis.complexityAssessment.level}
        Bottlenecks: ${analysis.bottlenecks.join(', ')}
        Time Analysis: Total ${analysis.timeAnalysis.totalTime}s, Active ${analysis.timeAnalysis.activeTime}s
        
        Provide 2-3 strategic insights that would help the user work more effectively.
        Focus on workflow-level improvements, not just technical fixes.
        
        Return as JSON array of insights with structure:
        {
          "type": "strategic_advice",
          "category": "strategic",
          "title": "insight title",
          "description": "detailed description with specific metrics",
          "recommendations": [
            {
              "action": "specific action",
              "expectedImprovement": "measurable improvement",
              "difficulty": "easy|medium|hard"
            }
          ],
          "priority": "low|medium|high"
        }
      `;

      const response = await fetch(`${this.azureAIEndpoint}/openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.azureAIKey,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are an AI Coach that provides strategic, workflow-level advice to developers. Focus on high-level improvements and productivity gains.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 800,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        console.error('Azure AI request failed:', response.statusText);
        return [];
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) return [];

      // Parse JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const insights = JSON.parse(jsonMatch[0]);
        return insights.filter((i: any) => i.type && i.title && i.description);
      }

      return [];
    } catch (error) {
      console.error('Error getting Azure AI insights:', error);
      return [];
    }
  }

  /**
   * Identify user patterns
   */
  private async identifyUserPatterns(userId: number): Promise<any[]> {
    const patterns = await db
      .select()
      .from(workflowPatterns)
      .where(eq(workflowPatterns.userId, userId))
      .orderBy(desc(workflowPatterns.frequency))
      .limit(5);

    return patterns;
  }

  /**
   * Store insights in database
   */
  private async storeInsights(
    userId: number,
    workflowId: number,
    insights: CoachInsight[]
  ): Promise<void> {
    for (const insight of insights) {
      await db.insert(aiCoachInsights).values({
        userId,
        workflowId,
        insightType: insight.type,
        insightCategory: insight.category,
        title: insight.title,
        description: insight.description,
        recommendations: insight.recommendations,
        expectedImpact: insight.priority === 'urgent' ? 'high' : 
                       insight.priority === 'high' ? 'high' :
                       insight.priority === 'medium' ? 'medium' : 'low',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expire in 7 days
      });
    }
  }

  /**
   * Get pending insights for user
   */
  async getPendingInsights(userId: number, limit: number = 5): Promise<any[]> {
    const insights = await db
      .select()
      .from(aiCoachInsights)
      .where(
        and(
          eq(aiCoachInsights.userId, userId),
          eq(aiCoachInsights.wasShown, false),
          gte(aiCoachInsights.expiresAt, new Date())
        )
      )
      .orderBy(
        desc(aiCoachInsights.expectedImpact),
        desc(aiCoachInsights.generatedAt)
      )
      .limit(limit);

    return insights;
  }

  /**
   * Mark insight as shown
   */
  async markInsightShown(insightId: number): Promise<void> {
    await db
      .update(aiCoachInsights)
      .set({
        wasShown: true,
        shownAt: new Date(),
      })
      .where(eq(aiCoachInsights.id, insightId));
  }

  /**
   * Record user feedback on insight
   */
  async recordInsightFeedback(
    insightId: number,
    feedback: 'positive' | 'negative' | 'neutral',
    details?: string
  ): Promise<void> {
    await db
      .update(aiCoachInsights)
      .set({
        userFeedback: feedback,
        feedbackDetails: details,
        wasActedUpon: feedback === 'positive',
        actedAt: feedback === 'positive' ? new Date() : undefined,
      })
      .where(eq(aiCoachInsights.id, insightId));
  }

  /**
   * Complete workflow
   */
  async completeWorkflow(workflowId: number): Promise<void> {
    const now = new Date();
    
    await db
      .update(workflowTracking)
      .set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(workflowTracking.id, workflowId));
  }

  /**
   * Get workflow statistics for user
   */
  async getUserWorkflowStats(userId: number): Promise<any> {
    const workflows = await db
      .select()
      .from(workflowTracking)
      .where(eq(workflowTracking.userId, userId))
      .orderBy(desc(workflowTracking.createdAt))
      .limit(50);

    const stats = {
      totalWorkflows: workflows.length,
      completedWorkflows: workflows.filter(w => w.status === 'completed').length,
      averageEfficiency: Math.round(
        workflows.reduce((sum, w) => sum + (w.efficiencyScore || 0), 0) / workflows.length
      ),
      mostCommonType: this.getMostCommonWorkflowType(workflows),
      totalTimeSpent: workflows.reduce((sum, w) => sum + (w.totalDuration || 0), 0),
      improvementTrend: this.calculateImprovementTrend(workflows),
    };

    return stats;
  }

  /**
   * Helper: Get most common workflow type
   */
  private getMostCommonWorkflowType(workflows: any[]): string {
    const typeCounts: Record<string, number> = {};
    
    workflows.forEach(w => {
      if (w.workflowType) {
        typeCounts[w.workflowType] = (typeCounts[w.workflowType] || 0) + 1;
      }
    });

    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'general';
  }

  /**
   * Helper: Calculate improvement trend
   */
  private calculateImprovementTrend(workflows: any[]): 'improving' | 'stable' | 'declining' {
    if (workflows.length < 5) return 'stable';

    const recent = workflows.slice(0, 5);
    const older = workflows.slice(5, 10);

    const recentAvg = recent.reduce((sum, w) => sum + (w.efficiencyScore || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, w) => sum + (w.efficiencyScore || 0), 0) / older.length;

    if (recentAvg > olderAvg + 5) return 'improving';
    if (recentAvg < olderAvg - 5) return 'declining';
    return 'stable';
  }
}

// Create singleton instance
export const aiCoachService = new AICoachService();
