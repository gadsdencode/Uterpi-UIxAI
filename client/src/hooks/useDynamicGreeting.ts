import { useState, useEffect, useCallback } from 'react';
import { GreetingService, GreetingContext, GreetingOptions } from '../lib/greetingService';
import { User } from './useAuth';
import { useAI } from './useAI';

export interface UseDynamicGreetingOptions {
  enableAI: boolean;
  fallbackToTemplate: boolean;
  includeSuggestions: boolean;
  maxLength: number;
  refreshOnUserChange: boolean;
}

export interface UseDynamicGreetingReturn {
  greeting: string;
  isLoading: boolean;
  error: string | null;
  refreshGreeting: () => Promise<void>;
  isAIGenerated: boolean;
}

const defaultOptions: UseDynamicGreetingOptions = {
  enableAI: true,
  fallbackToTemplate: true,
  includeSuggestions: true,
  maxLength: 150,
  refreshOnUserChange: true
};

/**
 * Hook for generating dynamic, AI-powered greeting messages
 */
export function useDynamicGreeting(
  user: User | null | undefined,
  options: Partial<UseDynamicGreetingOptions> = {}
): UseDynamicGreetingReturn {
  const [greeting, setGreeting] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAIGenerated, setIsAIGenerated] = useState<boolean>(false);

  const mergedOptions = { ...defaultOptions, ...options };
  const { aiService } = useAI(user as any);

  // Get greeting service instance
  const greetingService = GreetingService.getInstance();

  /**
   * Generate a new greeting
   */
  const generateGreeting = useCallback(async () => {
    if (!user && !mergedOptions.fallbackToTemplate) {
      setGreeting('');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Set AI service if available
      if (aiService) {
        greetingService.setAIService(aiService);
      }

      // Build context
      const context = greetingService.buildContext(user);
      
      // Generate greeting
      const newGreeting = await greetingService.generateGreeting(context, {
        useAI: mergedOptions.enableAI && !!aiService,
        fallbackToTemplate: mergedOptions.fallbackToTemplate,
        includeSuggestions: mergedOptions.includeSuggestions,
        maxLength: mergedOptions.maxLength
      });

      setGreeting(newGreeting);
      setIsAIGenerated(mergedOptions.enableAI && !!aiService);
      
    } catch (err) {
      console.error('Error generating greeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate greeting');
      
      // Fallback to simple greeting
      const fallbackGreeting = user 
        ? `Hello ${user.firstName || user.username || 'there'}! What would you like to work on today?`
        : "Hello! I'm Uterpi's AI. What would you like to accomplish today?";
      
      setGreeting(fallbackGreeting);
      setIsAIGenerated(false);
    } finally {
      setIsLoading(false);
    }
  }, [user, aiService, mergedOptions, greetingService]);

  /**
   * Refresh greeting manually
   */
  const refreshGreeting = useCallback(async () => {
    await generateGreeting();
  }, [generateGreeting]);

  // Generate greeting on mount and when user changes
  useEffect(() => {
    generateGreeting();
  }, [generateGreeting]);

  // Refresh when user changes if enabled
  useEffect(() => {
    if (mergedOptions.refreshOnUserChange) {
      generateGreeting();
    }
  }, [user?.id, user?.firstName, user?.username, mergedOptions.refreshOnUserChange, generateGreeting]);

  return {
    greeting,
    isLoading,
    error,
    refreshGreeting,
    isAIGenerated
  };
}

/**
 * Hook for generating contextual greetings based on conversation state
 */
export function useContextualGreeting(
  user: User | null | undefined,
  conversationHistory: any[] = [],
  options: Partial<UseDynamicGreetingOptions> = {}
): UseDynamicGreetingReturn {
  const [greeting, setGreeting] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAIGenerated, setIsAIGenerated] = useState<boolean>(false);

  const mergedOptions = { ...defaultOptions, ...options };
  const { aiService } = useAI(user as any);
  const greetingService = GreetingService.getInstance();

  /**
   * Generate contextual greeting based on conversation history
   */
  const generateContextualGreeting = useCallback(async () => {
    if (!user && !mergedOptions.fallbackToTemplate) {
      setGreeting('');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (aiService) {
        greetingService.setAIService(aiService);
      }

      // Build enhanced context with conversation history
      const context = greetingService.buildContext(user, {
        conversationHistory: conversationHistory.slice(-5), // Last 5 messages
        hasPreviousConversation: conversationHistory.length > 0,
        lastMessageTime: conversationHistory.length > 0 
          ? conversationHistory[conversationHistory.length - 1]?.timestamp 
          : undefined
      });

      const newGreeting = await greetingService.generateGreeting(context, {
        useAI: mergedOptions.enableAI && !!aiService,
        fallbackToTemplate: mergedOptions.fallbackToTemplate,
        includeSuggestions: mergedOptions.includeSuggestions,
        maxLength: mergedOptions.maxLength
      });

      setGreeting(newGreeting);
      setIsAIGenerated(mergedOptions.enableAI && !!aiService);
      
    } catch (err) {
      console.error('Error generating contextual greeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate greeting');
      
      // Contextual fallback
      const hasHistory = conversationHistory.length > 0;
      const fallbackGreeting = hasHistory
        ? `Welcome back! Ready to continue where we left off?`
        : user 
          ? `Hello ${user.firstName || user.username || 'there'}! What would you like to work on today?`
          : "Hello! I'm Uterpi's AI. What would you like to accomplish today?";
      
      setGreeting(fallbackGreeting);
      setIsAIGenerated(false);
    } finally {
      setIsLoading(false);
    }
  }, [user, aiService, conversationHistory, mergedOptions, greetingService]);

  const refreshGreeting = useCallback(async () => {
    await generateContextualGreeting();
  }, [generateContextualGreeting]);

  useEffect(() => {
    generateContextualGreeting();
  }, [generateContextualGreeting]);

  return {
    greeting,
    isLoading,
    error,
    refreshGreeting,
    isAIGenerated
  };
}
