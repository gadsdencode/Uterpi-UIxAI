import { useEffect, useRef, useCallback } from 'react';
import { IntelligentToastService } from '../lib/intelligentToastService';
import { AzureAIService } from '../lib/azureAI';
import { Message, LLMModel } from '../types';
import { useAICoach } from './useAICoach';

interface UseIntelligentToastOptions {
  enabled?: boolean;
  aiService?: AzureAIService | null;
  toastFunction?: (title: string, options?: {
    description?: string;
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  }) => void;
  onModelSwitch?: (modelId: string) => void;
  onNewChat?: () => void;
}

export const useIntelligentToast = (options: UseIntelligentToastOptions) => {
  const { enabled = true, aiService, toastFunction, onModelSwitch, onNewChat } = options;
  const serviceRef = useRef<IntelligentToastService | null>(null);
  const lastAnalysisTimeRef = useRef<number>(0);
  
  // Integrate AI Coach for strategic insights
  const aiCoach = useAICoach({
    enabled: enabled && !!aiService,
    autoFetch: true,
    pollingInterval: 30000, // Check for new insights every 30 seconds
  });

  // Initialize/reinitialize intelligent toast service when AI service becomes available
  useEffect(() => {
    if (enabled && aiService && !serviceRef.current) {
      serviceRef.current = new IntelligentToastService(aiService, toastFunction, onModelSwitch, onNewChat);
    }
  }, [enabled, aiService, toastFunction, onModelSwitch, onNewChat]);

  // Analyze conversation with AI Coach integration
  const analyzeConversation = useCallback(async (
    messages: Message[],
    currentModel: LLMModel,
    responseTime?: number,
    tokenUsage?: number,
    isChatActive?: boolean
  ) => {
    if (!serviceRef.current || !enabled || !aiService) {
      console.log('⚠️ IntelligentToast analysis skipped - service not ready');
      return;
    }

    // Skip analysis if chat is currently active to prevent interference
    if (isChatActive) {
      console.log('⏸️ IntelligentToast analysis deferred - chat is active');
      return;
    }

    const now = Date.now();
    // Reduce minimum time between analyses to 15 seconds for better responsiveness
    if (now - lastAnalysisTimeRef.current < 15000) {
      console.log('⚠️ IntelligentToast analysis skipped - too frequent');
      return;
    }

    lastAnalysisTimeRef.current = now;
    console.log('🔍 Starting intelligent conversation analysis...');
    
    // Run both traditional analysis and AI Coach analysis in parallel
    await Promise.all([
      serviceRef.current.analyzeAndRecommend(messages, currentModel, responseTime, tokenUsage),
      aiCoach.analyzeConversation(messages, currentModel, responseTime, tokenUsage)
    ]);
  }, [enabled, aiService, aiCoach]);

  // Track user actions with AI Coach integration
  const trackAction = useCallback((action: string, data?: any) => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.trackAction(action, data);
    
    // Also track with AI Coach for workflow analysis
    if (action === 'model_switch' && data?.fromModel && data?.toModel) {
      aiCoach.trackModelSwitch(data.fromModel, data.toModel, data.reason);
    } else if (action === 'command' || action === 'chat_message') {
      aiCoach.trackCommand(action, data?.model, data?.success);
    }
  }, [enabled, aiCoach]);

  // Get performance insights
  const getInsights = useCallback(() => {
    if (!serviceRef.current || !enabled) return null;
    return serviceRef.current.getPerformanceInsights();
  }, [enabled]);

  // Reset session data
  const resetSession = useCallback(() => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.resetSession();
  }, [enabled]);

  // Clear recommendation cache (for testing)
  const clearRecommendationCache = useCallback(() => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.clearRecommendationCache();
  }, [enabled]);

  // Force clear cache for specific recommendation (for testing)
  const forceClearRecommendation = useCallback((recommendationId: string) => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.forceClearRecommendation(recommendationId);
  }, [enabled]);

  // Force clear all insight caches (for testing)
  const forceClearInsightCaches = useCallback(() => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.forceClearInsightCaches();
  }, [enabled]);

  // Test show recommendation (for debugging)
  const testShowRecommendation = useCallback((title: string, description: string, category: 'insight' | 'suggestion' | 'alert' = 'insight') => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.testShowRecommendation(title, description, category);
  }, [enabled]);

  // Get recommendation cache status (for debugging)
  const getRecommendationCacheStatus = useCallback(() => {
    if (!serviceRef.current || !enabled) return null;
    return serviceRef.current.getRecommendationCacheStatus();
  }, [enabled]);

  // Show immediate optimization tip with AI Coach enhancement
  const showOptimizationTip = useCallback((tip: string, action?: () => void) => {
    if (!enabled) return;
    
    // Use AI Coach's optimization tip if available
    if (aiCoach.showOptimizationTip) {
      aiCoach.showOptimizationTip(tip, action);
    } else if (toastFunction) {
      toastFunction("🚀 Optimization Tip", {
        description: tip,
        duration: 8000,
        action: action ? {
          label: "Apply",
          onClick: action
        } : undefined
      });
    }
  }, [enabled, toastFunction, aiCoach]);

  // Show performance alert
  const showPerformanceAlert = useCallback((message: string, severity: 'low' | 'medium' | 'high' = 'medium') => {
    if (!enabled) return;

    const icons = { low: '💡', medium: '⚡', high: '⚠️' };
    const durations = { low: 6000, medium: 8000, high: 10000 };

    if (toastFunction) {
      toastFunction(`${icons[severity]} Performance Alert`, {
        description: message,
        duration: durations[severity]
      });
    }
  }, [enabled, toastFunction]);

  return {
    analyzeConversation,
    trackAction,
    getInsights,
    resetSession,
    clearRecommendationCache,
    forceClearRecommendation,
    forceClearInsightCaches,
    testShowRecommendation,
    getRecommendationCacheStatus,
    showOptimizationTip,
    showPerformanceAlert,
    isEnabled: enabled && !!serviceRef.current,
    // AI Coach specific methods
    aiCoach: {
      insights: aiCoach.insights,
      workflowStats: aiCoach.workflowStats,
      getStrategicAdvice: aiCoach.getStrategicAdvice,
      recordFeedback: aiCoach.recordFeedback,
      applyRecommendation: aiCoach.applyRecommendation,
    }
  };
}; 