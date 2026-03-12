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
  const isChatActiveRef = useRef<boolean>(false);

  const aiCoach = useAICoach({
    enabled: enabled && !!aiService,
    autoFetch: true,
    pollingInterval: 60000,
  });

  useEffect(() => {
    if (enabled && aiService && !serviceRef.current) {
      serviceRef.current = new IntelligentToastService(
        aiService,
        toastFunction,
        onModelSwitch,
        onNewChat,
        {
          maxToastsPerMinute: 2,
          getLatestContext: () => ({ isChatActive: isChatActiveRef.current }),
          getExternalInsights: () => aiCoach?.insights ?? null,
        }
      );
    }
  }, [enabled, aiService, toastFunction, onModelSwitch, onNewChat, aiCoach]);

  const analyzeConversation = useCallback(async (
    messages: Message[],
    currentModel: LLMModel,
    responseTime?: number,
    tokenUsage?: number,
    isChatActive?: boolean
  ) => {
    if (!serviceRef.current || !enabled || !aiService) return;
    if (isChatActive) return;

    isChatActiveRef.current = !!isChatActive;

    const now = Date.now();
    if (now - lastAnalysisTimeRef.current < 45000) return;

    lastAnalysisTimeRef.current = now;

    await Promise.all([
      serviceRef.current.analyzeAndRecommend(messages, currentModel, responseTime, tokenUsage),
      aiCoach.analyzeConversation(messages, currentModel, responseTime, tokenUsage),
    ]);
  }, [enabled, aiService, aiCoach]);

  const trackAction = useCallback((action: string, data?: any) => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.trackAction(action, data);

    if (action === 'model_switch' && data?.fromModel && data?.toModel) {
      aiCoach.trackModelSwitch(data.fromModel, data.toModel, data.reason);
    } else if (action === 'command' || action === 'chat_message') {
      aiCoach.trackCommand(action, data?.model, data?.success);
    }
  }, [enabled, aiCoach]);

  const getInsights = useCallback(() => {
    if (!serviceRef.current || !enabled) return null;
    return serviceRef.current.getPerformanceInsights();
  }, [enabled]);

  const resetSession = useCallback(() => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.resetSession();
  }, [enabled]);

  const clearRecommendationCache = useCallback(() => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.clearRecommendationCache();
  }, [enabled]);

  const forceClearRecommendation = useCallback((recommendationId: string) => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.forceClearRecommendation(recommendationId);
  }, [enabled]);

  const forceClearInsightCaches = useCallback(() => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.forceClearInsightCaches();
  }, [enabled]);

  const testShowRecommendation = useCallback((title: string, description: string, category: 'insight' | 'suggestion' | 'alert' = 'insight') => {
    if (!serviceRef.current || !enabled) return;
    serviceRef.current.testShowRecommendation(title, description, category);
  }, [enabled]);

  const getRecommendationCacheStatus = useCallback(() => {
    if (!serviceRef.current || !enabled) return null;
    return serviceRef.current.getRecommendationCacheStatus();
  }, [enabled]);

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
    isEnabled: enabled && !!serviceRef.current,
    aiCoach: {
      insights: aiCoach.insights,
      workflowStats: aiCoach.workflowStats,
      getStrategicAdvice: aiCoach.getStrategicAdvice,
      recordFeedback: aiCoach.recordFeedback,
      applyRecommendation: aiCoach.applyRecommendation,
    },
  };
};
