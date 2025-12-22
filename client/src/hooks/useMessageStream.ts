// useMessageStream.ts - Message streaming and AI response management hook
// Extracts streaming/messaging functionality from useChat following SRP

import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, LLMModel } from '../types';
import { useAIProvider, AIProvider } from './useAIProvider';
import { useIntelligentToast } from './useIntelligentToast';
import { useAICoach } from './useAICoach';
import { SYSTEM_MESSAGE_PRESETS } from './useAzureAI';
import { User } from './useAuth';
import { toast } from 'sonner';
import { handleError } from '../lib/error-handler';

export interface UseMessageStreamOptions {
  /** User object for auth context */
  user: User | null;
  /** Enable streaming mode (default: true) */
  enableStreaming?: boolean;
  /** System preset for AI messages */
  systemPreset?: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom';
  /** Custom system message content */
  customSystemMessage?: string;
  /** Chat options for AI provider */
  chatOptions?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  };
  /** Callback on successful message send */
  onMessageSent?: (userMessage: Message, aiMessage: Message) => void;
  /** Callback on message error */
  onMessageError?: (error: Error, userMessage: Message) => void;
  /** Callback for credit limit errors */
  onCreditLimitError?: (errorData: any) => void;
}

export interface UseMessageStreamReturn {
  // State
  isLoading: boolean;
  isTyping: boolean;
  isGeneratingResponse: boolean;
  responseBuffer: string;
  error: string | null;
  
  // AI Provider state
  currentProvider: AIProvider;
  currentModel: string | null;
  selectedLLMModel: LLMModel | null;
  modelCapabilities: any;
  isLoadingCapabilities: boolean;
  
  // Streaming toggle
  enableStreaming: boolean;
  setEnableStreaming: (val: boolean) => void;
  
  // System message
  selectedSystemPreset: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom';
  customSystemMessage: string;
  handleSystemPresetChange: (preset: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom', message?: string) => void;
  getCurrentSystemMessage: () => string;
  
  // Actions
  sendMessage: (messages: Message[], newContent: string, attachments?: string[], attachedFileIds?: number[]) => Promise<{
    userMessage: Message;
    aiMessage: Message;
  } | null>;
  clearError: () => void;
  
  // AI Provider actions
  updateModel: (model: LLMModel) => void;
  getAvailableModels: () => LLMModel[];
  refreshCapabilities: () => Promise<void>;
  checkProvider: (provider: AIProvider) => void;
  
  // Intelligent toast actions
  analyzeConversation: any;
  trackAction: (action: string, data?: any) => void;
  showOptimizationTip: (message: string, action?: () => void) => void;
  showPerformanceAlert: (message: string, level: 'low' | 'medium' | 'high') => void;
}

export const useMessageStream = (options: UseMessageStreamOptions): UseMessageStreamReturn => {
  const {
    user,
    enableStreaming: initialEnableStreaming = true,
    systemPreset: initialSystemPreset = 'DEFAULT',
    customSystemMessage: initialCustomSystemMessage = '',
    chatOptions = {
      maxTokens: 2048,
      temperature: 0.8,
      topP: 0.1
    },
    onMessageSent,
    onMessageError,
    onCreditLimitError
  } = options;

  // Core streaming state
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [responseBuffer, setResponseBuffer] = useState('');
  
  // System message state
  const [selectedSystemPreset, setSelectedSystemPreset] = useState<keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom'>(initialSystemPreset);
  const [customSystemMessage, setCustomSystemMessage] = useState<string>(initialCustomSystemMessage);
  
  // Streaming toggle
  const [enableStreaming, setEnableStreaming] = useState(initialEnableStreaming);
  
  // Get current system message
  const getCurrentSystemMessage = useCallback(() => {
    if (selectedSystemPreset === 'custom') {
      return customSystemMessage || SYSTEM_MESSAGE_PRESETS.DEFAULT;
    }
    return SYSTEM_MESSAGE_PRESETS[selectedSystemPreset];
  }, [selectedSystemPreset, customSystemMessage]);

  // AI Provider hook
  const {
    sendMessage: providerSendMessage,
    sendStreamingMessage,
    isLoading,
    error,
    clearError,
    currentModel,
    updateModel,
    selectedLLMModel,
    modelCapabilities,
    isLoadingCapabilities,
    refreshCapabilities,
    getAvailableModels,
    currentProvider
  } = useAIProvider({
    enableStreaming,
    systemMessage: getCurrentSystemMessage(),
    chatOptions,
    userContext: { user }
  });

  // AI Service ref for intelligent toasts
  const aiServiceRef = useRef<any>(null);

  // Initialize AI service for intelligent toasts
  useEffect(() => {
    const getAIService = async () => {
      try {
        switch (currentProvider) {
          case 'gemini': {
            const apiKey = localStorage.getItem('gemini-api-key');
            if (apiKey) {
              const { GeminiService } = await import('../lib/gemini');
              aiServiceRef.current = new GeminiService({ 
                apiKey, 
                modelName: 'gemini-1.5-flash'
              });
              return;
            }
            break;
          }
          case 'openai': {
            const apiKey = localStorage.getItem('openai-api-key');
            if (apiKey) {
              const { OpenAIService } = await import('../lib/openAI');
              aiServiceRef.current = new OpenAIService({ 
                apiKey, 
                modelName: 'gpt-4o-mini'
              });
              return;
            }
            break;
          }
          case 'lmstudio': {
            const baseUrl = localStorage.getItem('lmstudio-base-url') || 'http://localhost:1234/v1';
            const { LMStudioService } = await import('../lib/lmstudio');
            aiServiceRef.current = new LMStudioService({ 
              apiKey: 'not-needed',
              baseUrl, 
              modelName: selectedLLMModel?.id || 'nomadic-icdu-v8' 
            });
            return;
          }
        }
        aiServiceRef.current = null;
      } catch (err) {
        console.warn('Failed to initialize AI service for toasts:', err);
        aiServiceRef.current = null;
      }
    };
    getAIService();
  }, [currentProvider, selectedLLMModel]);

  // AI Coach integration
  const {
    trackCommand: coachTrackCommand,
    trackModelSwitch: coachTrackModelSwitch,
    analyzeConversation: coachAnalyzeConversation,
  } = useAICoach({ 
    enabled: true, 
    autoFetch: true,
    pollingInterval: 60000 
  });

  // Track previous model for detecting model switches
  const previousModelRef = useRef<string | null>(null);

  // Track model switches for AI Coach
  useEffect(() => {
    if (selectedLLMModel?.id && previousModelRef.current && previousModelRef.current !== selectedLLMModel.id) {
      console.log('🔄 Model switch detected:', previousModelRef.current, '->', selectedLLMModel.id);
      coachTrackModelSwitch(
        previousModelRef.current,
        selectedLLMModel.id,
        'User initiated model switch'
      );
    }
    previousModelRef.current = selectedLLMModel?.id || null;
  }, [selectedLLMModel?.id, coachTrackModelSwitch]);

  // Placeholder for chat state - will be passed by parent
  const [isChatActiveInternal, setIsChatActiveInternal] = useState(false);

  // Intelligent toast system
  const {
    analyzeConversation,
    trackAction,
    showOptimizationTip,
    showPerformanceAlert
  } = useIntelligentToast({
    enabled: !!aiServiceRef.current,
    aiService: aiServiceRef.current,
    toastFunction: (title: string, toastOptions?: any) => {
      toast(title, toastOptions);
    },
    onModelSwitch: (modelId: string) => {
      const availableModels = getAvailableModels();
      const targetModel = availableModels.find((m: any) => m.id === modelId);
      if (targetModel) {
        updateModel(targetModel);
      }
    },
    onNewChat: () => {
      // This will be handled by parent hook
      console.log('📝 New chat requested from intelligent toast');
    }
  });

  // Handle system preset change
  const handleSystemPresetChange = useCallback((preset: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom', message?: string) => {
    setSelectedSystemPreset(preset);
    if (preset === 'custom' && message !== undefined) {
      setCustomSystemMessage(message);
    }
    trackAction('system_message_change');
  }, [trackAction]);

  // Stub for checkProvider - service status monitoring should be separate
  const checkProvider = useCallback((provider: AIProvider) => {
    console.log('🔍 Check provider requested:', provider);
  }, []);

  // Send message with streaming or non-streaming mode
  const sendMessage = useCallback(async (
    messages: Message[],
    newContent: string,
    attachments?: string[],
    attachedFileIds?: number[]
  ): Promise<{ userMessage: Message; aiMessage: Message } | null> => {
    if (!newContent.trim() && (!attachments || attachments.length === 0)) {
      console.log('❌ sendMessage - No content, returning');
      return null;
    }
    
    if (isLoading) {
      console.log('❌ sendMessage - Already loading, returning');
      return null;
    }

    console.log('✅ sendMessage - Proceeding with message send');
    setIsChatActiveInternal(true);
    const startTime = Date.now();
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: newContent,
      role: 'user',
      timestamp: new Date(),
      attachments: attachments && attachments.length > 0 ? [...attachments] : undefined,
      metadata: attachedFileIds && attachedFileIds.length ? { attachedFileIds } : undefined
    };

    const updatedMessages = [...messages, userMessage];
    
    console.log('📝 Adding user message:', userMessage);
    setIsTyping(true);
    clearError();

    try {
      let aiResponse: string;
      const aiMessageId = (Date.now() + 1).toString();

      if (enableStreaming) {
        console.log('📤 Using STREAMING mode with provider:', currentProvider);
        
        setIsGeneratingResponse(true);
        setResponseBuffer('');

        let accumulatedResponse = '';
        await sendStreamingMessage(updatedMessages, (chunk: string) => {
          accumulatedResponse += chunk;
          setResponseBuffer(accumulatedResponse);
        });

        setIsGeneratingResponse(false);
        aiResponse = accumulatedResponse;
      } else {
        console.log('📤 Sending message to AI provider:', currentProvider);
        setIsGeneratingResponse(true);
        
        const response = await providerSendMessage(updatedMessages);
        console.log('📥 Received response:', response ? `${response.substring(0, 100)}...` : 'EMPTY/UNDEFINED');
        
        setIsGeneratingResponse(false);
        
        if (!response) {
          console.error('❌ Empty response received from AI provider');
          throw new Error('No response received from AI provider');
        }
        
        aiResponse = response;
      }

      const aiMessage: Message = {
        id: aiMessageId,
        content: aiResponse,
        role: 'assistant',
        timestamp: new Date(),
      };

      const responseTime = Date.now() - startTime;
      const estimatedTokens = newContent.length * 1.3;
      
      console.log(`📊 Message sent. Total messages: ${updatedMessages.length}, Response time: ${responseTime}ms`);
      
      // Track with AI Coach
      try {
        coachTrackCommand(
          'chat_message',
          selectedLLMModel?.id,
          true
        );
        
        if (selectedLLMModel) {
          coachAnalyzeConversation(
            updatedMessages,
            selectedLLMModel,
            responseTime,
            estimatedTokens
          );
        }
      } catch (coachError) {
        console.warn('⚠️ AI Coach tracking failed (non-critical):', coachError);
      }
      
      // Analyze conversation for intelligent toasts
      if (updatedMessages.length >= 2 && selectedLLMModel) {
        setTimeout(() => {
          try {
            analyzeConversation(updatedMessages, selectedLLMModel, responseTime, estimatedTokens, isChatActiveInternal)
              .catch((analyzeError: any) => {
                console.error('⚠️ analyzeConversation failed (non-critical):', analyzeError);
              });
          } catch (analyzeError) {
            console.error('⚠️ analyzeConversation error (non-critical):', analyzeError);
          }
        }, 2000);
      }

      // Callback for parent
      if (onMessageSent) {
        onMessageSent(userMessage, aiMessage);
      }

      setResponseBuffer('');
      return { userMessage, aiMessage };

    } catch (err) {
      trackAction('error_occurred');
      
      // Track failed command with AI Coach
      try {
        coachTrackCommand(
          'chat_message',
          selectedLLMModel?.id,
          false
        );
      } catch (coachError) {
        console.warn('⚠️ AI Coach error tracking failed (non-critical):', coachError);
      }
      
      handleError(err as Error, {
        operation: 'send_message',
        component: 'useMessageStream',
        userId: user?.id?.toString(),
        timestamp: new Date()
      });
      
      // Handle credit limit errors
      if (err instanceof Error && err.message.includes('Subscription error:')) {
        try {
          const errorData = JSON.parse(err.message.replace('Subscription error: ', ''));
          
          if (errorData.code === 'MESSAGE_LIMIT_EXCEEDED' || 
              errorData.code === 'INSUFFICIENT_CREDITS' || 
              errorData.code === 'NO_CREDITS_AVAILABLE') {
            
            if (onCreditLimitError) {
              onCreditLimitError(errorData);
            }
            return null;
          }
        } catch (parseError) {
          console.error('Failed to parse credit limit error:', parseError);
        }
      }
      
      // Callback for parent
      if (onMessageError) {
        onMessageError(err as Error, userMessage);
      }
      
      return null;
    } finally {
      setIsTyping(false);
      setIsGeneratingResponse(false);
      setResponseBuffer('');
      setTimeout(() => setIsChatActiveInternal(false), 1000);
    }
  }, [
    isLoading, enableStreaming, currentProvider, providerSendMessage,
    sendStreamingMessage, clearError, selectedLLMModel, analyzeConversation,
    trackAction, user, coachTrackCommand, coachAnalyzeConversation,
    onMessageSent, onMessageError, onCreditLimitError, isChatActiveInternal
  ]);

  return {
    // State
    isLoading,
    isTyping,
    isGeneratingResponse,
    responseBuffer,
    error,
    
    // AI Provider state
    currentProvider,
    currentModel,
    selectedLLMModel,
    modelCapabilities,
    isLoadingCapabilities,
    
    // Streaming toggle
    enableStreaming,
    setEnableStreaming,
    
    // System message
    selectedSystemPreset,
    customSystemMessage,
    handleSystemPresetChange,
    getCurrentSystemMessage,
    
    // Actions
    sendMessage,
    clearError,
    
    // AI Provider actions
    updateModel,
    getAvailableModels,
    refreshCapabilities,
    checkProvider,
    
    // Intelligent toast actions
    analyzeConversation,
    trackAction,
    showOptimizationTip,
    showPerformanceAlert
  };
};

