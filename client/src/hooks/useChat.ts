// useChat.ts - Composed chat hook orchestrating smaller specialized hooks
// Refactored from monolithic hook to follow Single Responsibility Principle (SRP)
// Composes: useSpeechInput, useCreditManager, useMessageStream, useConversation

import { useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '../types';
import { SYSTEM_MESSAGE_PRESETS } from './useAzureAI';
import { useServiceStatus } from './useServiceStatus';
import { User } from './useAuth';
import { toast } from 'sonner';
import { AIProvider } from './useAIProvider';

// Import composed hooks
import { useSpeechInput } from './useSpeechInput';
import { useCreditManager } from './useCreditManager';
import { useMessageStream } from './useMessageStream';
import { useConversation } from './useConversation';

export interface UseChatOptions {
  user: User | null;
  enableStreaming?: boolean;
  systemPreset?: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom';
  customSystemMessage?: string;
  projectId?: number | null;
  onSystemPresetChange?: (preset: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom', message?: string) => void;
}

export interface UseChatReturn {
  // State
  messages: Message[];
  input: string;
  isLoading: boolean;
  isTyping: boolean;
  isGeneratingResponse: boolean;
  attachments: string[];
  attachedFileIds: number[];
  currentConversationId: number | null;
  currentConversationTitle: string | null;
  isLoadingConversation: boolean;
  isChatActive: boolean;
  responseBuffer: string;
  error: string | null;
  isUserTyping: boolean;
  
  // Speech state
  isListening: boolean;
  isSpeaking: boolean;
  speakingMessageId: string | null;
  speechAvailable: boolean;
  isHTTPS: boolean;
  microphonePermission: PermissionState | 'unsupported';
  speechError: string | null;
  transcript: string;
  interimTranscript: string;
  
  // Voice input state (decoupled from keyboard input)
  voiceTranscript: string;
  isVoiceInputPending: boolean;
  confirmVoiceInput: () => void;
  discardVoiceInput: () => void;
  
  // Greeting state
  greeting: string;
  greetingLoading: boolean;
  isAIGenerated: boolean;
  
  // Credit state
  creditBalance: number | null;
  isFreemium: boolean;
  messagesRemaining: number | null;
  
  // AI Provider state
  currentProvider: AIProvider;
  currentModel: string | null;
  selectedLLMModel: any;
  modelCapabilities: any;
  isLoadingCapabilities: boolean;
  
  // Service status
  serviceStatus: any;
  getServiceStatus: (provider: AIProvider) => any;
  
  // Latest sources from AI response
  latestSources: Array<{ fileId: number; name: string; mimeType: string; similarity: number; snippet: string }>;
  
  // Actions
  setInput: (val: string) => void;
  handleManualInput: (val: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  handleSend: () => Promise<void>;
  startNewConversation: () => void;
  loadConversation: (id: number, title?: string) => Promise<Message[]>;
  handleVoiceInput: () => Promise<void>;
  handleSpeak: (id: string, text: string) => Promise<void>;
  addAttachment: (file: string, fileId?: number) => void;
  removeAttachment: (index: number) => void;
  clearTranscript: () => void;
  clearError: () => void;
  fetchCreditStatus: () => Promise<void>;
  
  // AI Provider actions
  updateModel: (model: any) => void;
  getAvailableModels: () => any[];
  refreshCapabilities: () => Promise<void>;
  checkProvider: (provider: AIProvider) => void;
  
  // Intelligent toast actions
  analyzeConversation: any;
  trackAction: (action: string, data?: any) => void;
  showOptimizationTip: (message: string, action?: () => void) => void;
  showPerformanceAlert: (message: string, level: 'low' | 'medium' | 'high') => void;
  
  // System message
  selectedSystemPreset: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom';
  customSystemMessage: string;
  handleSystemPresetChange: (preset: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom', message?: string) => void;
  getCurrentSystemMessage: () => string;
  
  // Enable streaming toggle
  enableStreaming: boolean;
  setEnableStreaming: (val: boolean) => void;
}

export const useChat = (options: UseChatOptions): UseChatReturn => {
  const { 
    user, 
    enableStreaming: initialEnableStreaming = true,
    systemPreset: initialSystemPreset = 'DEFAULT',
    customSystemMessage: initialCustomSystemMessage = '',
    projectId
  } = options;
  
  // =========================================================================
  // LOCAL STATE (input, not extracted to composed hooks)
  // =========================================================================
  const [input, setInput] = useState('');
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  
  // User typing timeout ref - managed here since it needs access to input value
  const userTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // =========================================================================
  // COMPOSED HOOKS
  // =========================================================================
  
  // Conversation management (messages, loading, greeting, attachments)
  const conversation = useConversation({
    user,
    enableAIGreeting: true,
    includeSuggestions: true,
    maxGreetingLength: 150
  });

  // Credit/subscription management
  const credits = useCreditManager({
    user,
    enableRealTimeUpdates: true,
    fetchOnMount: true
  });

  // Speech/voice input management
  const speechInput = useSpeechInput({
    autoConfirm: true,
    autoConfirmDelay: 500,
    onVoiceInputConfirmed: (transcript) => {
      // Append voice transcript to existing input
      setInput(prev => {
        const newInput = prev.trim() ? `${prev.trim()} ${transcript}` : transcript;
        return newInput;
      });
    }
  });

  // Message streaming/sending management
  const messageStream = useMessageStream({
    user,
    enableStreaming: initialEnableStreaming,
    systemPreset: initialSystemPreset,
    customSystemMessage: initialCustomSystemMessage,
    projectId,
    chatOptions: {
      maxTokens: 2048,
      temperature: 0.8,
      topP: 0.1
    },
    onMessageSent: (userMessage, aiMessage) => {
      // Add AI message to conversation
      conversation.addMessage(aiMessage);
      
      // Auto-speak if enabled
      if (speechInput.speechAvailable && !speechInput.isSpeaking && aiMessage.content) {
        const autoSpeak = localStorage.getItem('auto-speak-responses');
        if (autoSpeak === 'true') {
          speechInput.handleSpeak(aiMessage.id, aiMessage.content);
        }
      }
    },
    onMessageError: (error, userMessage) => {
      // Add error message to conversation
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error: ${error.message}. Please check your configuration and try again.`,
        role: 'assistant',
        timestamp: new Date(),
      };
      conversation.addMessage(errorMessage);
    },
    onCreditLimitError: (errorData) => {
      // Add credit limit message
      const creditLimitMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: '',
        role: 'assistant',
        timestamp: new Date(),
        isCreditLimit: true,
        metadata: errorData,
      };
      conversation.addMessage(creditLimitMessage);
    }
  });

  // Service status monitoring
  const {
    serviceStatus,
    startMonitoring,
    stopMonitoring,
    checkProvider,
    getServiceStatus
  } = useServiceStatus({
    checkInterval: 120000,
    maxConsecutiveFailures: 3,
    timeoutMs: 10000
  });

  // Start monitoring when component mounts
  useEffect(() => {
    const providers: AIProvider[] = ['lmstudio', 'azure', 'openai', 'gemini', 'huggingface', 'uterpi'];
    startMonitoring(providers);
    
    return () => {
      stopMonitoring();
    };
  }, [startMonitoring, stopMonitoring]);

  // =========================================================================
  // INPUT HANDLERS
  // =========================================================================
  
  // Handle manual input from keyboard - coordinates with speech input
  // This function includes the original timeout logic that checks if input has content
  const handleManualInput = useCallback((val: string) => {
    // Set the user typing lock
    speechInput.setUserTyping(true);
    
    // Clear any existing timeout
    if (userTypingTimeoutRef.current) {
      clearTimeout(userTypingTimeoutRef.current);
    }
    
    // Reset the lock after user stops typing for 3 seconds
    // This allows transcript to resume if user pauses but keeps voice input active
    userTypingTimeoutRef.current = setTimeout(() => {
      // Only reset if input hasn't been cleared (submitted or manually deleted)
      if (val.trim()) {
        console.log('🎤 User typing lock timeout - keeping lock since input has content');
        // Keep the lock active as long as there's manual content
      } else {
        console.log('🎤 User typing lock reset - input is empty');
        speechInput.resetUserTypingLock();
      }
    }, 3000);
    
    // Update the input value
    setInput(val);
    
    console.log('⌨️ Manual input detected - transcript sync paused');
  }, [speechInput]);

  // =========================================================================
  // CONVERSATION ACTIONS
  // =========================================================================
  
  // Start new conversation - clears all state
  const startNewConversation = useCallback(() => {
    conversation.startNewConversation();
    setInput('');
    speechInput.clearTranscript();
    speechInput.resetUserTypingLock();
    messageStream.clearError();
    
    // Clear user typing timeout
    if (userTypingTimeoutRef.current) {
      clearTimeout(userTypingTimeoutRef.current);
      userTypingTimeoutRef.current = null;
    }
    
    console.log('🆕 Started new conversation');
  }, [conversation, speechInput, messageStream]);

  // =========================================================================
  // MESSAGE SENDING
  // =========================================================================
  
  // Handle send - orchestrates message sending through composed hooks
  const handleSend = useCallback(async () => {
    console.log('🚀 handleSend called with input:', input.trim());
    
    if (!input.trim() && conversation.attachments.length === 0) {
      console.log('❌ handleSend - No input, returning');
      return;
    }
    if (messageStream.isLoading) {
      console.log('❌ handleSend - Already loading, returning');
      return;
    }

    console.log('✅ handleSend - Proceeding with message send');
    setIsSubmittingMessage(true);
    conversation.setIsChatActive(true);
    
    // Create user message and add to conversation
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: 'user',
      timestamp: new Date(),
      attachments: conversation.attachments.length > 0 ? [...conversation.attachments] : undefined,
      metadata: conversation.attachedFileIds.length ? { attachedFileIds: conversation.attachedFileIds } : undefined
    };

    // Add user message to conversation immediately
    conversation.addMessage(userMessage);
    
    // Clear input state
    const currentInput = input;
    const currentAttachments = [...conversation.attachments];
    const currentAttachedFileIds = [...conversation.attachedFileIds];
    
    setInput('');
    conversation.clearAttachments();
    speechInput.clearTranscript();
    speechInput.resetUserTypingLock();
    
    // Clear user typing timeout
    if (userTypingTimeoutRef.current) {
      clearTimeout(userTypingTimeoutRef.current);
      userTypingTimeoutRef.current = null;
    }
    
    // Stop listening if active
    if (speechInput.isListening) {
      console.log('🎤 Stopping speech recognition after message send');
      speechInput.handleVoiceInput().catch(error => {
        console.warn('Failed to stop listening after message send:', error);
      });
    }

    try {
      // Send message through message stream hook (which handles streaming, AI response, etc.)
      const result = await messageStream.sendMessage(
        conversation.messages, // Current messages (before adding user message)
        currentInput,
        currentAttachments,
        currentAttachedFileIds
      );
      
      if (result) {
        // AI message is added via onMessageSent callback
        console.log('📊 Message exchange completed');
      }
    } finally {
      setIsSubmittingMessage(false);
      setTimeout(() => conversation.setIsChatActive(false), 1000);
    }
  }, [input, conversation, messageStream, speechInput]);

  // =========================================================================
  // CLEANUP
  // =========================================================================
  
  // Clean up user typing timeout on unmount
  useEffect(() => {
    return () => {
      if (userTypingTimeoutRef.current) {
        clearTimeout(userTypingTimeoutRef.current);
      }
    };
  }, []);

  // =========================================================================
  // RETURN COMPOSED STATE AND ACTIONS
  // =========================================================================
  
  return {
    // State
    messages: conversation.messages,
    input,
    isLoading: messageStream.isLoading,
    isTyping: messageStream.isTyping,
    isGeneratingResponse: messageStream.isGeneratingResponse,
    attachments: conversation.attachments,
    attachedFileIds: conversation.attachedFileIds,
    currentConversationId: conversation.currentConversationId,
    currentConversationTitle: conversation.currentConversationTitle,
    isLoadingConversation: conversation.isLoadingConversation,
    isChatActive: conversation.isChatActive,
    responseBuffer: messageStream.responseBuffer,
    error: messageStream.error,
    isUserTyping: speechInput.isUserTyping,
    
    // Speech state
    isListening: speechInput.isListening,
    isSpeaking: speechInput.isSpeaking,
    speakingMessageId: speechInput.speakingMessageId,
    speechAvailable: speechInput.speechAvailable,
    isHTTPS: speechInput.isHTTPS,
    microphonePermission: speechInput.microphonePermission,
    speechError: speechInput.speechError,
    transcript: speechInput.transcript,
    interimTranscript: speechInput.interimTranscript,
    
    // Voice input state
    voiceTranscript: speechInput.voiceTranscript,
    isVoiceInputPending: speechInput.isVoiceInputPending,
    confirmVoiceInput: speechInput.confirmVoiceInput,
    discardVoiceInput: speechInput.discardVoiceInput,
    
    // Greeting state
    greeting: conversation.greeting,
    greetingLoading: conversation.greetingLoading,
    isAIGenerated: conversation.isAIGenerated,
    
    // Credit state
    creditBalance: credits.creditBalance,
    isFreemium: credits.isFreemium,
    messagesRemaining: credits.messagesRemaining,
    
    // AI Provider state
    currentProvider: messageStream.currentProvider,
    currentModel: messageStream.currentModel,
    selectedLLMModel: messageStream.selectedLLMModel,
    modelCapabilities: messageStream.modelCapabilities,
    isLoadingCapabilities: messageStream.isLoadingCapabilities,
    
    // Service status
    serviceStatus,
    getServiceStatus,
    
    // Latest sources
    latestSources: conversation.latestSources,
    
    // Actions
    setInput,
    handleManualInput,
    setMessages: conversation.setMessages,
    handleSend,
    startNewConversation,
    loadConversation: conversation.loadConversation,
    handleVoiceInput: speechInput.handleVoiceInput,
    handleSpeak: speechInput.handleSpeak,
    addAttachment: conversation.addAttachment,
    removeAttachment: conversation.removeAttachment,
    clearTranscript: speechInput.clearTranscript,
    clearError: messageStream.clearError,
    fetchCreditStatus: credits.fetchCreditStatus,
    
    // AI Provider actions
    updateModel: messageStream.updateModel,
    getAvailableModels: messageStream.getAvailableModels,
    refreshCapabilities: messageStream.refreshCapabilities,
    checkProvider: messageStream.checkProvider,
    
    // Intelligent toast actions
    analyzeConversation: messageStream.analyzeConversation,
    trackAction: messageStream.trackAction,
    showOptimizationTip: messageStream.showOptimizationTip,
    showPerformanceAlert: messageStream.showPerformanceAlert,
    
    // System message
    selectedSystemPreset: messageStream.selectedSystemPreset,
    customSystemMessage: messageStream.customSystemMessage,
    handleSystemPresetChange: messageStream.handleSystemPresetChange,
    getCurrentSystemMessage: messageStream.getCurrentSystemMessage,
    
    // Streaming toggle
    enableStreaming: messageStream.enableStreaming,
    setEnableStreaming: messageStream.setEnableStreaming,
  };
};
