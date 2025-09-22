import { useState, useEffect, useCallback, useRef } from 'react';
import { Message, LLMModel } from '../types';
import { useToast } from './use-toast';

export interface CoachInsight {
  id: number;
  insightType: string;
  insightCategory: 'strategic' | 'tactical' | 'operational';
  title: string;
  description: string;
  recommendations?: {
    action: string;
    expectedImprovement: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
  expectedImpact: 'high' | 'medium' | 'low';
  wasShown: boolean;
  wasActedUpon: boolean;
}

export interface WorkflowStats {
  totalWorkflows: number;
  completedWorkflows: number;
  averageEfficiency: number;
  mostCommonType: string;
  totalTimeSpent: number;
  improvementTrend: 'improving' | 'stable' | 'declining';
}

interface UseAICoachOptions {
  enabled?: boolean;
  autoFetch?: boolean;
  pollingInterval?: number;
}

export const useAICoach = (options: UseAICoachOptions = {}) => {
  const { enabled = true, autoFetch = true, pollingInterval = 60000 } = options;
  const { toast } = useToast();
  
  const [insights, setInsights] = useState<CoachInsight[]>([]);
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const pollingIntervalRef = useRef<NodeJS.Timeout>();
  const lastCommandRef = useRef<string>('');
  const commandStartTimeRef = useRef<number>(0);
  const currentModelRef = useRef<string>('');

  // Fetch pending insights from backend
  const fetchInsights = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/coach/insights?limit=5', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      
      const data = await response.json();
      setInsights(data.insights || []);
      
      // Show new high-priority insights immediately
      const newHighPriorityInsights = data.insights?.filter(
        (i: CoachInsight) => 
          !i.wasShown && 
          i.expectedImpact === 'high'
      ) || [];
      
      for (const insight of newHighPriorityInsights) {
        showCoachInsight(insight);
      }
      
    } catch (err) {
      console.error('Error fetching AI Coach insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch insights');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  // Fetch workflow statistics
  const fetchWorkflowStats = useCallback(async () => {
    if (!enabled) return;
    
    try {
      const response = await fetch('/api/coach/workflow-stats', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch workflow stats');
      }
      
      const data = await response.json();
      setWorkflowStats(data.stats);
    } catch (err) {
      console.error('Error fetching workflow stats:', err);
    }
  }, [enabled]);

  // Show coach insight as a toast with actions
  const showCoachInsight = useCallback((insight: CoachInsight) => {
    const icon = insight.insightCategory === 'strategic' ? '🎯' :
                 insight.insightCategory === 'tactical' ? '⚡' : '💡';
    
    toast({
      title: `${icon} ${insight.title}`,
      description: insight.description,
      duration: 10000,
      action: insight.recommendations?.[0] ? {
        label: insight.recommendations[0].action,
        onClick: () => applyRecommendation(insight, 0),
      } : undefined,
    });
    
    // Mark as shown
    markInsightShown(insight.id);
  }, [toast]);

  // Mark insight as shown
  const markInsightShown = useCallback(async (insightId: number) => {
    try {
      await fetch(`/api/coach/insights/${insightId}/shown`, {
        method: 'POST',
        credentials: 'include',
      });
      
      // Update local state
      setInsights(prev => 
        prev.map(i => i.id === insightId ? { ...i, wasShown: true } : i)
      );
    } catch (err) {
      console.error('Error marking insight as shown:', err);
    }
  }, []);

  // Record feedback on insight
  const recordFeedback = useCallback(async (
    insightId: number,
    feedback: 'positive' | 'negative' | 'neutral',
    details?: string
  ) => {
    try {
      await fetch(`/api/coach/insights/${insightId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ feedback, details }),
      });
      
      // Update local state
      setInsights(prev =>
        prev.map(i => i.id === insightId ? { ...i, wasActedUpon: feedback === 'positive' } : i)
      );
    } catch (err) {
      console.error('Error recording feedback:', err);
    }
  }, []);

  // Apply a recommendation
  const applyRecommendation = useCallback(async (insight: CoachInsight, recommendationIndex: number) => {
    const recommendation = insight.recommendations?.[recommendationIndex];
    if (!recommendation) return;
    
    // Record positive feedback
    await recordFeedback(insight.id, 'positive', `Applied: ${recommendation.action}`);
    
    // Show success message
    toast({
      title: '✅ Recommendation Applied',
      description: `Expected improvement: ${recommendation.expectedImprovement}`,
      duration: 5000,
    });
  }, [recordFeedback, toast]);

  // Track command execution
  const trackCommand = useCallback(async (
    command: string,
    model?: string,
    success: boolean = true
  ) => {
    if (!enabled) return;
    
    const duration = commandStartTimeRef.current 
      ? Date.now() - commandStartTimeRef.current 
      : undefined;
    
    try {
      await fetch('/api/coach/track-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          command,
          model: model || currentModelRef.current,
          duration,
          success,
        }),
      });
    } catch (err) {
      console.error('Error tracking command:', err);
    }
    
    lastCommandRef.current = command;
    commandStartTimeRef.current = Date.now();
  }, [enabled]);

  // Track model switch
  const trackModelSwitch = useCallback(async (
    fromModel: string,
    toModel: string,
    reason?: string
  ) => {
    if (!enabled) return;
    
    try {
      await fetch('/api/coach/track-model-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fromModel,
          toModel,
          reason,
        }),
      });
    } catch (err) {
      console.error('Error tracking model switch:', err);
    }
    
    currentModelRef.current = toModel;
  }, [enabled]);

  // Analyze conversation for workflow patterns
  const analyzeConversation = useCallback(async (
    messages: Message[],
    currentModel: LLMModel,
    responseTime?: number,
    tokenUsage?: number
  ) => {
    if (!enabled || messages.length < 3) return;
    
    // Extract workflow context from messages
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
    
    if (lastUserMessage) {
      // Determine command type from message content
      let commandType = 'chat_message';
      if (lastUserMessage.content.toLowerCase().includes('debug')) {
        commandType = 'debug';
      } else if (lastUserMessage.content.toLowerCase().includes('refactor')) {
        commandType = 'refactor';
      } else if (lastUserMessage.content.toLowerCase().includes('analyze')) {
        commandType = 'analyze';
      } else if (lastUserMessage.content.toLowerCase().includes('write')) {
        commandType = 'write';
      }
      
      // Track the command
      await trackCommand(
        commandType,
        currentModel.id,
        !!lastAssistantMessage
      );
    }
    
    // Check for insights periodically
    if (messages.length % 5 === 0) {
      await fetchInsights();
    }
  }, [enabled, trackCommand, fetchInsights]);

  // Start polling for insights
  useEffect(() => {
    if (enabled && autoFetch) {
      // Initial fetch
      fetchInsights();
      fetchWorkflowStats();
      
      // Set up polling
      pollingIntervalRef.current = setInterval(() => {
        fetchInsights();
      }, pollingInterval);
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [enabled, autoFetch, pollingInterval, fetchInsights, fetchWorkflowStats]);

  // Get strategic advice based on current context
  const getStrategicAdvice = useCallback(async (context: string): Promise<string> => {
    if (!enabled) return '';
    
    try {
      // This would call a specific endpoint for strategic advice
      // For now, return based on local insights
      const strategicInsights = insights.filter(i => i.insightCategory === 'strategic');
      if (strategicInsights.length > 0) {
        return strategicInsights[0].description;
      }
      
      return 'Continue with your current approach. The AI Coach is learning your patterns.';
    } catch (err) {
      console.error('Error getting strategic advice:', err);
      return '';
    }
  }, [enabled, insights]);

  // Show workflow optimization tip
  const showOptimizationTip = useCallback((tip: string, action?: () => void) => {
    if (!enabled) return;
    
    toast({
      title: '🚀 Workflow Optimization',
      description: tip,
      duration: 8000,
      action: action ? {
        label: 'Apply',
        onClick: action,
      } : undefined,
    });
  }, [enabled, toast]);

  return {
    // Data
    insights,
    workflowStats,
    isLoading,
    error,
    
    // Actions
    fetchInsights,
    fetchWorkflowStats,
    trackCommand,
    trackModelSwitch,
    analyzeConversation,
    recordFeedback,
    applyRecommendation,
    showCoachInsight,
    getStrategicAdvice,
    showOptimizationTip,
    
    // State
    isEnabled: enabled,
  };
};
