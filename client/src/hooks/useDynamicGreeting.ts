import { useState, useEffect, useCallback, useRef } from 'react';
import { GreetingService, GreetingContext, GreetingOptions } from '../lib/greetingService';
import { User } from './useAuth';
import { useAIProvider } from './useAIProvider';

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
  
  // Track if we've already generated a greeting to prevent rapid changes
  const hasGeneratedGreeting = useRef<boolean>(false);
  const lastUserKey = useRef<string>('');
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isGenerating = useRef<boolean>(false);

  const mergedOptions = { ...defaultOptions, ...options };
  
  // Use AI provider for greeting generation
  const { sendMessage, isLoading: aiLoading } = useAIProvider({
    enableStreaming: false,
    systemMessage: "You are Uterpi, a friendly AI assistant. Generate warm, personalized greeting messages.",
    chatOptions: {
      maxTokens: 150,
      temperature: 0.8,
      topP: 0.1
    },
    userContext: { user }
  });

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

    // Create a unique key for the current user state
    const currentUserKey = `${user?.id || 'no-user'}-${user?.firstName || ''}-${user?.username || ''}-${user?.bio || ''}-${user?.age || ''}-${user?.dateOfBirth || ''}`;
    
    // If we've already generated a greeting for this user state, don't regenerate
    if (hasGeneratedGreeting.current && lastUserKey.current === currentUserKey) {
      return;
    }

    // If we're already generating, don't start another generation
    if (isGenerating.current) {
      return;
    }

    isGenerating.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Build context
      const context = greetingService.buildContext(user);
      
      // Generate greeting
      const newGreeting = await greetingService.generateGreeting(context, {
        useAI: mergedOptions.enableAI && !!sendMessage,
        fallbackToTemplate: mergedOptions.fallbackToTemplate,
        includeSuggestions: mergedOptions.includeSuggestions,
        maxLength: mergedOptions.maxLength
      }, sendMessage);

      setGreeting(newGreeting);
      setIsAIGenerated(mergedOptions.enableAI && !!sendMessage);
      
      // Mark as generated and store the user key
      hasGeneratedGreeting.current = true;
      lastUserKey.current = currentUserKey;
      
    } catch (err) {
      console.error('Error generating greeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate greeting');
      
      // Fallback to simple greeting
      const fallbackGreeting = user 
        ? `Hello ${user.firstName || user.username || 'there'}! What would you like to work on today?`
        : "Hello! I'm Uterpi's AI. What would you like to accomplish today?";
      
      setGreeting(fallbackGreeting);
      setIsAIGenerated(false);
      
      // Mark as generated even for fallback
      hasGeneratedGreeting.current = true;
      lastUserKey.current = currentUserKey;
    } finally {
      isGenerating.current = false;
      setIsLoading(false);
    }
  }, [user?.id, user?.firstName, user?.username, user?.bio, user?.age, user?.dateOfBirth, sendMessage, mergedOptions.enableAI, mergedOptions.fallbackToTemplate, mergedOptions.includeSuggestions, mergedOptions.maxLength]);

  /**
   * Refresh greeting manually
   */
  const refreshGreeting = useCallback(async () => {
    // Reset tracking to allow regeneration
    hasGeneratedGreeting.current = false;
    lastUserKey.current = '';
    isGenerating.current = false;
    await generateGreeting();
  }, [generateGreeting]);

  // Generate greeting on mount and when user changes with debounce
  useEffect(() => {
    // Clear any existing timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    // Debounce the greeting generation to prevent rapid changes
    debounceTimeout.current = setTimeout(() => {
      generateGreeting();
    }, 300); // 300ms debounce
    
    // Cleanup timeout on unmount
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [user?.id, user?.firstName, user?.username, user?.bio, user?.age, user?.dateOfBirth, mergedOptions.enableAI, mergedOptions.fallbackToTemplate, mergedOptions.includeSuggestions, mergedOptions.maxLength]);

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
  
  // Use AI provider for greeting generation
  const { sendMessage, isLoading: aiLoading } = useAIProvider({
    enableStreaming: false,
    systemMessage: "You are Uterpi, a friendly AI assistant. Generate warm, personalized greeting messages.",
    chatOptions: {
      maxTokens: 150,
      temperature: 0.8,
      topP: 0.1
    },
    userContext: { user }
  });
  
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
      // Build enhanced context with conversation history
      const context = greetingService.buildContext(user, {
        conversationHistory: conversationHistory.slice(-5), // Last 5 messages
        hasPreviousConversation: conversationHistory.length > 0,
        lastMessageTime: conversationHistory.length > 0 
          ? conversationHistory[conversationHistory.length - 1]?.timestamp 
          : undefined
      });

      const newGreeting = await greetingService.generateGreeting(context, {
        useAI: mergedOptions.enableAI && !!sendMessage,
        fallbackToTemplate: mergedOptions.fallbackToTemplate,
        includeSuggestions: mergedOptions.includeSuggestions,
        maxLength: mergedOptions.maxLength
      }, sendMessage);

      setGreeting(newGreeting);
      setIsAIGenerated(mergedOptions.enableAI && !!sendMessage);
      
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
  }, [user?.id, user?.firstName, user?.username, user?.bio, user?.age, user?.dateOfBirth, sendMessage, conversationHistory.length, mergedOptions.enableAI, mergedOptions.fallbackToTemplate, mergedOptions.includeSuggestions, mergedOptions.maxLength]);

  const refreshGreeting = useCallback(async () => {
    await generateContextualGreeting();
  }, [generateContextualGreeting]);

  useEffect(() => {
    generateContextualGreeting();
  }, [user?.id, user?.firstName, user?.username, user?.bio, user?.age, user?.dateOfBirth, conversationHistory.length, mergedOptions.enableAI, mergedOptions.fallbackToTemplate, mergedOptions.includeSuggestions, mergedOptions.maxLength]);

  return {
    greeting,
    isLoading,
    error,
    refreshGreeting,
    isAIGenerated
  };
}
