// useChat.ts - Custom hook for chat business logic
// Extracts all chat state management and side effects from ChatView

import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, CommandSuggestion, LLMModel } from '../types';
import { useAIProvider, AIProvider } from './useAIProvider';
import { SYSTEM_MESSAGE_PRESETS } from './useAzureAI';
import { useIntelligentToast } from './useIntelligentToast';
import { useSpeech } from './useSpeech';
import { useServiceStatus } from './useServiceStatus';
import { useDynamicGreeting } from './useDynamicGreeting';
import { useCreditUpdates } from './useCreditUpdates';
import { User } from './useAuth';
import { toast } from 'sonner';
import { handleError } from '../lib/error-handler';

export interface UseChatOptions {
  user: User | null;
  enableStreaming?: boolean;
  systemPreset?: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom';
  customSystemMessage?: string;
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
  selectedLLMModel: LLMModel | null;
  modelCapabilities: any;
  isLoadingCapabilities: boolean;
  
  // Service status
  serviceStatus: any;
  getServiceStatus: (provider: AIProvider) => any;
  
  // Latest sources from AI response
  latestSources: Array<{ fileId: number; name: string; mimeType: string; similarity: number; snippet: string }>;
  
  // Actions
  setInput: (val: string) => void;
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
  updateModel: (model: LLMModel) => void;
  getAvailableModels: () => LLMModel[];
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
  const { user, enableStreaming: initialEnableStreaming = true } = options;
  
  // Core chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [responseBuffer, setResponseBuffer] = useState('');
  
  // Conversation state
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [currentConversationTitle, setCurrentConversationTitle] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  
  // Attachments state
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachedFileIds, setAttachedFileIds] = useState<number[]>([]);
  
  // Credit state
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isFreemium, setIsFreemium] = useState(false);
  const [messagesRemaining, setMessagesRemaining] = useState<number | null>(null);
  
  // Speech state
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
  // Sources state
  const [latestSources, setLatestSources] = useState<Array<{ fileId: number; name: string; mimeType: string; similarity: number; snippet: string }>>([]);
  
  // System message state
  const [selectedSystemPreset, setSelectedSystemPreset] = useState<keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom'>('DEFAULT');
  const [customSystemMessage, setCustomSystemMessage] = useState<string>('');
  
  // Streaming toggle
  const [enableStreaming, setEnableStreaming] = useState(initialEnableStreaming);
  
  // Greeting initialization ref
  const hasInitializedGreeting = useRef(false);
  
  // Listen for real-time credit updates
  const creditUpdate = useCreditUpdates();
  
  // Update credit balance when we receive real-time updates
  useEffect(() => {
    if (creditUpdate) {
      console.log('💳 Real-time credit update received:', creditUpdate);
      setCreditBalance(creditUpdate.remainingBalance);
    }
  }, [creditUpdate]);
  
  // Get current system message
  const getCurrentSystemMessage = useCallback(() => {
    if (selectedSystemPreset === 'custom') {
      return customSystemMessage || SYSTEM_MESSAGE_PRESETS.DEFAULT;
    }
    return SYSTEM_MESSAGE_PRESETS[selectedSystemPreset];
  }, [selectedSystemPreset, customSystemMessage]);
  
  // AI Provider hook
  const {
    sendMessage,
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
    chatOptions: {
      maxTokens: 2048,
      temperature: 0.8,
      topP: 0.1
    },
    userContext: { user }
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
  
  // Dynamic greeting
  const { greeting, isLoading: greetingLoading, isAIGenerated } = useDynamicGreeting(user, {
    enableAI: true,
    fallbackToTemplate: true,
    includeSuggestions: true,
    maxLength: 150
  });
  
  // Initialize messages with dynamic greeting when it's ready
  useEffect(() => {
    if (greeting && !greetingLoading && messages.length === 0 && !hasInitializedGreeting.current) {
      setMessages([
        {
          id: '1',
          content: greeting,
          role: 'assistant',
          timestamp: new Date(),
        }
      ]);
      hasInitializedGreeting.current = true;
    }
  }, [greeting, greetingLoading, messages.length]);
  
  // Speech hook
  const {
    speak,
    stopSpeaking,
    isSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    interimTranscript,
    clearTranscript,
    isAvailable: speechAvailable,
    isHTTPS,
    microphonePermission,
    error: speechError
  } = useSpeech({
    autoInitialize: true,
    onRecognitionResult: (result) => {
      console.log('🎤 useChat onRecognitionResult called with:', result);
    },
    onRecognitionError: (error) => {
      console.error('🎤 useChat speech recognition error:', error);
      toast.error(`Speech recognition error: ${error.message}`);
    }
  });
  
  // Sync input field with speech recognition transcript
  useEffect(() => {
    console.log('🎤 Transcript sync effect triggered:', {
      transcript,
      interimTranscript,
      isSubmittingMessage,
      currentInput: input
    });
    
    if (!isSubmittingMessage) {
      const currentTranscript = transcript + (interimTranscript ? ' ' + interimTranscript : '');
      if (currentTranscript.trim() && currentTranscript !== input) {
        console.log('🎤 Syncing input with transcript:', currentTranscript);
        setInput(currentTranscript);
      }
    }
  }, [transcript, interimTranscript, isSubmittingMessage, input]);
  
  // AI Service ref for intelligent toasts
  const aiServiceRef = useRef<any>(null);
  
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
  
  // Intelligent toast system
  const {
    analyzeConversation,
    trackAction,
    showOptimizationTip,
    showPerformanceAlert
  } = useIntelligentToast({
    enabled: !!aiServiceRef.current,
    aiService: aiServiceRef.current,
    toastFunction: (title: string, options?: any) => {
      toast(title, options);
    },
    onModelSwitch: (modelId: string) => {
      const availableModels = getAvailableModels();
      const targetModel = availableModels.find((m: any) => m.id === modelId);
      if (targetModel) {
        updateModel(targetModel);
      }
    },
    onNewChat: () => {
      startNewConversation();
    }
  });
  
  // Listen for AI sources
  useEffect(() => {
    const handleSources = (e: Event) => {
      const ce = e as CustomEvent;
      if (Array.isArray(ce.detail)) {
        setLatestSources(ce.detail as any);
      }
    };
    window.addEventListener('ai-sources', handleSources as EventListener);
    return () => window.removeEventListener('ai-sources', handleSources as EventListener);
  }, []);
  
  // Fetch credit status
  const fetchCreditStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/subscription/details', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCreditBalance(data.features.currentCreditsBalance);
        setIsFreemium(data.tier === 'freemium');
        if (data.tier === 'freemium') {
          setMessagesRemaining(data.features.messagesRemaining);
        }
      }
    } catch (error) {
      console.error('Error fetching credit status:', error);
    }
  }, []);
  
  // Fetch credit status on mount
  useEffect(() => {
    if (user) {
      fetchCreditStatus();
    }
  }, [user, fetchCreditStatus]);
  
  // Extract conversation content helper
  const extractConversationContent = useCallback((content: string): string => {
    const analysisIndicators = [
      'ANALYSIS TASK:',
      'ANALYSIS CRITERIA:',
      'CONVERSATION:',
      'analyze this conversation',
      'user interaction patterns',
      'hidden insights',
      'interaction style analysis',
      'conversation dynamics',
      'behavioral insights',
      'return only a json object',
      'json object with this structure',
      'provide deep insights',
      'conversation to understand'
    ];

    const hasAnalysisIndicators = analysisIndicators.some(indicator => 
      content.toLowerCase().includes(indicator.toLowerCase())
    );

    if (!hasAnalysisIndicators) {
      return content;
    }

    const patterns = [
      /CONVERSATION:\s*([\s\S]*?)(?=ANALYSIS TASK:|$)/i,
      /conversation:\s*([\s\S]*?)(?=analysis task:|$)/i,
      /analyze this conversation[:\s]*([\s\S]*?)(?=analysis task:|$)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const conversationContent = match[1].trim();
        
        let cleanedContent = conversationContent
          .replace(/^assistant:\s*/gim, 'Assistant: ')
          .replace(/^user:\s*/gim, 'User: ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim();

        if (cleanedContent.length > 0 && cleanedContent !== conversationContent) {
          return cleanedContent;
        }
      }
    }

    const firstLine = content.split('\n')[0];
    if (firstLine.length < 100) {
      return firstLine;
    }

    return content.substring(0, 200) + (content.length > 200 ? '...' : '');
  }, []);
  
  // Parse conversation into messages helper
  const parseConversationIntoMessages = useCallback((content: string, originalMessage: any): Message[] => {
    const messages: Message[] = [];
    let messageIndex = 0;

    const lines = content.split('\n');
    let currentSpeaker = '';
    let currentContent = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.match(/^(Assistant|assistant):\s*/)) {
        if (currentSpeaker && currentContent.trim()) {
          messages.push({
            id: `${originalMessage.id}-${messageIndex}`,
            content: currentContent.trim(),
            role: currentSpeaker.toLowerCase() === 'assistant' ? 'assistant' : 'user',
            timestamp: new Date(originalMessage.createdAt),
            attachments: originalMessage.attachments,
            metadata: originalMessage.metadata
          });
          messageIndex++;
        }
        
        currentSpeaker = 'assistant';
        currentContent = trimmedLine.replace(/^(Assistant|assistant):\s*/, '');
      } else if (trimmedLine.match(/^(User|user):\s*/)) {
        if (currentSpeaker && currentContent.trim()) {
          messages.push({
            id: `${originalMessage.id}-${messageIndex}`,
            content: currentContent.trim(),
            role: currentSpeaker.toLowerCase() === 'assistant' ? 'assistant' : 'user',
            timestamp: new Date(originalMessage.createdAt),
            attachments: originalMessage.attachments,
            metadata: originalMessage.metadata
          });
          messageIndex++;
        }
        
        currentSpeaker = 'user';
        currentContent = trimmedLine.replace(/^(User|user):\s*/, '');
      } else if (currentSpeaker && trimmedLine) {
        currentContent += '\n' + trimmedLine;
      }
    }

    if (currentSpeaker && currentContent.trim()) {
      messages.push({
        id: `${originalMessage.id}-${messageIndex}`,
        content: currentContent.trim(),
        role: currentSpeaker.toLowerCase() === 'assistant' ? 'assistant' : 'user',
        timestamp: new Date(originalMessage.createdAt),
        attachments: originalMessage.attachments,
        metadata: originalMessage.metadata
      });
    }

    return messages;
  }, []);
  
  // Load conversation
  const loadConversation = useCallback(async (conversationId: number, conversationTitle?: string): Promise<Message[]> => {
    setIsLoadingConversation(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load conversation');
      }

      const data = await response.json();
      const apiMessages = data.messages || [];

      const localMessages: Message[] = [];
      
      for (const apiMsg of apiMessages) {
        const filteredContent = extractConversationContent(apiMsg.content);
        
        const isConversationContent = filteredContent.includes('Assistant:') && filteredContent.includes('User:');
        
        if (isConversationContent && filteredContent !== apiMsg.content) {
          const parsedMessages = parseConversationIntoMessages(filteredContent, apiMsg);
          if (parsedMessages.length > 0) {
            localMessages.push(...parsedMessages);
          } else {
            localMessages.push({
              id: apiMsg.id.toString(),
              content: filteredContent,
              role: apiMsg.role === 'system' ? 'assistant' : apiMsg.role,
              timestamp: new Date(apiMsg.createdAt),
              attachments: apiMsg.attachments || undefined,
              metadata: apiMsg.metadata || undefined
            });
          }
        } else {
          localMessages.push({
            id: apiMsg.id.toString(),
            content: filteredContent,
            role: apiMsg.role === 'system' ? 'assistant' : apiMsg.role,
            timestamp: new Date(apiMsg.createdAt),
            attachments: apiMsg.attachments || undefined,
            metadata: apiMsg.metadata || undefined
          });
        }
      }

      setMessages(localMessages);
      setCurrentConversationId(conversationId);
      setCurrentConversationTitle(conversationTitle || null);
      hasInitializedGreeting.current = true;

      console.log(`✅ Loaded conversation ${conversationId} with ${localMessages.length} messages`);
      return localMessages;
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast.error('Failed to load conversation');
      throw error;
    } finally {
      setIsLoadingConversation(false);
    }
  }, [extractConversationContent, parseConversationIntoMessages]);
  
  // Start new conversation
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setCurrentConversationTitle(null);
    hasInitializedGreeting.current = false;
    setInput('');
    clearTranscript();
    setAttachments([]);
    setAttachedFileIds([]);
    clearError();
    console.log('🆕 Started new conversation');
  }, [clearTranscript, clearError]);
  
  // Handle system preset change
  const handleSystemPresetChange = useCallback((preset: keyof typeof SYSTEM_MESSAGE_PRESETS | 'custom', message?: string) => {
    setSelectedSystemPreset(preset);
    if (preset === 'custom' && message !== undefined) {
      setCustomSystemMessage(message);
    }
    trackAction('system_message_change');
  }, [trackAction]);
  
  // Handle speak
  const handleSpeak = useCallback(async (messageId: string, text: string) => {
    try {
      if (speakingMessageId === messageId) {
        stopSpeaking();
        setSpeakingMessageId(null);
      } else {
        stopSpeaking();
        setSpeakingMessageId(messageId);
        await speak(text);
        setSpeakingMessageId(null);
      }
    } catch (error) {
      console.error('Failed to speak:', error);
      toast.error('Failed to speak message');
      setSpeakingMessageId(null);
    }
  }, [speakingMessageId, speak, stopSpeaking]);
  
  // Handle voice input
  const handleVoiceInput = useCallback(async () => {
    try {
      console.log('🎤 handleVoiceInput called, isListening:', isListening);
      
      const { isHTTPS: checkHTTPS } = await import('../lib/speech/speechUtils');
      const isSecureContext = checkHTTPS();
      
      if (!isSecureContext && microphonePermission !== 'granted') {
        toast.error('🔒 Microphone access requires HTTPS. Please use a secure connection.');
        return;
      }
      
      if (isListening) {
        console.log('🎤 Stopping recording...');
        const finalTranscript = await stopListening();
        console.log('🎤 Final transcript:', finalTranscript);
        if (finalTranscript) {
          setInput(finalTranscript);
        }
      } else {
        console.log('🎤 Starting recording...');
        setInput('');
        clearTranscript();
        
        await startListening({
          language: 'en-US',
          continuous: true,
          interimResults: true
        });
        console.log('🎤 Recording started successfully');
      }
    } catch (error) {
      console.error('🎤 Voice input error:', error);
      const errorMessage = (error as Error).message || 'Voice input failed';
      
      if (errorMessage.includes('permission')) {
        toast.error('🎤 Microphone permission denied. Please allow microphone access and try again.');
      } else if (errorMessage.includes('not-allowed')) {
        toast.error('🔒 Microphone access blocked. Check your browser settings.');
      } else if (errorMessage.includes('network')) {
        toast.error('🌐 Network error. Please check your internet connection.');
      } else {
        toast.error(`🎤 ${errorMessage}`);
      }
    }
  }, [isListening, startListening, stopListening, microphonePermission, clearTranscript]);
  
  // Add attachment
  const addAttachment = useCallback((file: string, fileId?: number) => {
    setAttachments(prev => [...prev, file]);
    if (fileId) {
      setAttachedFileIds(prev => [...prev, fileId]);
    }
  }, []);
  
  // Remove attachment
  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setAttachedFileIds(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  // Handle send
  const handleSend = useCallback(async () => {
    console.log('🚀 handleSend called with input:', input.trim());
    
    if (!input.trim() && attachments.length === 0) {
      console.log('❌ handleSend - No input, returning');
      return;
    }
    if (isLoading) {
      console.log('❌ handleSend - Already loading, returning');
      return;
    }

    console.log('✅ handleSend - Proceeding with message send');
    setIsSubmittingMessage(true);
    setIsChatActive(true);
    const startTime = Date.now();
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: 'user',
      timestamp: new Date(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      metadata: attachedFileIds.length ? { attachedFileIds } : undefined
    };

    const updatedMessages = [...messages, userMessage];
    
    console.log('📝 Adding user message to chat:', userMessage);
    setMessages(updatedMessages);
    setAttachments([]);
    setAttachedFileIds([]);
    setIsTyping(true);
    clearError();
    setInput('');
    clearTranscript();
    
    if (isListening) {
      console.log('🎤 Stopping speech recognition after message send');
      stopListening().catch(error => {
        console.warn('Failed to stop listening after message send:', error);
      });
    }

    try {
      if (enableStreaming) {
        console.log('📤 Using STREAMING mode with provider:', currentProvider);
        const aiMessageId = (Date.now() + 1).toString();
        
        setIsGeneratingResponse(true);
        setResponseBuffer('');

        let accumulatedResponse = '';
        await sendStreamingMessage(updatedMessages, (chunk: string) => {
          accumulatedResponse += chunk;
          setResponseBuffer(accumulatedResponse);
        });

        setIsGeneratingResponse(false);
        
        const aiMessage: Message = {
          id: aiMessageId,
          content: accumulatedResponse,
          role: 'assistant',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, aiMessage]);
        setResponseBuffer('');
        
        if (speechAvailable && !isSpeaking && accumulatedResponse) {
          const autoSpeak = localStorage.getItem('auto-speak-responses');
          if (autoSpeak === 'true') {
            handleSpeak(aiMessageId, accumulatedResponse);
          }
        }
      } else {
        console.log('📤 Sending message to AI provider:', currentProvider);
        setIsGeneratingResponse(true);
        
        const response = await sendMessage(updatedMessages);
        console.log('📥 Received response:', response ? `${response.substring(0, 100)}...` : 'EMPTY/UNDEFINED');
        
        setIsGeneratingResponse(false);
        
        if (!response) {
          console.error('❌ Empty response received from AI provider');
          throw new Error('No response received from AI provider');
        }
        
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response,
          role: 'assistant',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, aiMessage]);
        
        if (speechAvailable && !isSpeaking && response) {
          const autoSpeak = localStorage.getItem('auto-speak-responses');
          if (autoSpeak === 'true') {
            handleSpeak(aiMessage.id, response);
          }
        }
      }

      const responseTime = Date.now() - startTime;
      const estimatedTokens = userMessage.content.length * 1.3;
      
      console.log(`📊 Message sent. Total messages: ${updatedMessages.length}, Response time: ${responseTime}ms`);
      
      if (updatedMessages.length >= 2 && selectedLLMModel) {
        setTimeout(() => {
          try {
            analyzeConversation(updatedMessages, selectedLLMModel, responseTime, estimatedTokens, isChatActive)
              .catch((error: any) => {
                console.error('⚠️ analyzeConversation failed (non-critical):', error);
              });
          } catch (error) {
            console.error('⚠️ analyzeConversation error (non-critical):', error);
          }
        }, 2000);
      }

    } catch (err) {
      trackAction('error_occurred');
      
      handleError(err as Error, {
        operation: 'send_message',
        component: 'useChat',
        userId: user?.id?.toString(),
        timestamp: new Date()
      });
      
      if (err instanceof Error && err.message.includes('Subscription error:')) {
        try {
          const errorData = JSON.parse(err.message.replace('Subscription error: ', ''));
          
          if (errorData.code === 'MESSAGE_LIMIT_EXCEEDED' || 
              errorData.code === 'INSUFFICIENT_CREDITS' || 
              errorData.code === 'NO_CREDITS_AVAILABLE') {
            
            const creditLimitMessage: Message = {
              id: (Date.now() + 1).toString(),
              content: '',
              role: 'assistant',
              timestamp: new Date(),
              isCreditLimit: true,
              metadata: errorData,
            };
            
            setMessages(prev => [...prev, creditLimitMessage]);
            return;
          }
        } catch (parseError) {
          console.error('Failed to parse credit limit error:', parseError);
        }
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}. Please check your configuration and try again.`,
        role: 'assistant',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setIsGeneratingResponse(false);
      setResponseBuffer('');
      setIsSubmittingMessage(false);
      setTimeout(() => setIsChatActive(false), 1000);
    }
  }, [
    input, attachments, attachedFileIds, isLoading, messages, enableStreaming,
    currentProvider, sendMessage, sendStreamingMessage, clearError, clearTranscript,
    isListening, stopListening, speechAvailable, isSpeaking, handleSpeak,
    selectedLLMModel, analyzeConversation, trackAction, user, isChatActive
  ]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListening) {
        stopListening();
      }
      if (isSpeaking) {
        stopSpeaking();
      }
    };
  }, [isListening, isSpeaking, stopListening, stopSpeaking]);

  return {
    // State
    messages,
    input,
    isLoading,
    isTyping,
    isGeneratingResponse,
    attachments,
    attachedFileIds,
    currentConversationId,
    currentConversationTitle,
    isLoadingConversation,
    isChatActive,
    responseBuffer,
    error,
    
    // Speech state
    isListening,
    isSpeaking,
    speakingMessageId,
    speechAvailable,
    isHTTPS,
    microphonePermission,
    speechError,
    transcript,
    interimTranscript,
    
    // Greeting state
    greeting,
    greetingLoading,
    isAIGenerated,
    
    // Credit state
    creditBalance,
    isFreemium,
    messagesRemaining,
    
    // AI Provider state
    currentProvider,
    currentModel,
    selectedLLMModel,
    modelCapabilities,
    isLoadingCapabilities,
    
    // Service status
    serviceStatus,
    getServiceStatus,
    
    // Latest sources
    latestSources,
    
    // Actions
    setInput,
    setMessages,
    handleSend,
    startNewConversation,
    loadConversation,
    handleVoiceInput,
    handleSpeak,
    addAttachment,
    removeAttachment,
    clearTranscript,
    clearError,
    fetchCreditStatus,
    
    // AI Provider actions
    updateModel,
    getAvailableModels,
    refreshCapabilities,
    checkProvider,
    
    // Intelligent toast actions
    analyzeConversation,
    trackAction,
    showOptimizationTip,
    showPerformanceAlert,
    
    // System message
    selectedSystemPreset,
    customSystemMessage,
    handleSystemPresetChange,
    getCurrentSystemMessage,
    
    // Streaming toggle
    enableStreaming,
    setEnableStreaming,
  };
};

