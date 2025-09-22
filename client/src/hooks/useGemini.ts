import { useState, useCallback, useRef, useEffect } from "react";
import { GeminiService } from "../lib/gemini";
import { Message, AzureAIMessage, ChatCompletionOptions, LLMModel, ModelCapabilities } from "../types";
import { getModelConfiguration } from "../lib/modelConfigurations";
import { User } from "./useAuth";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";

// User context interface for AI personalization
export interface UserContext {
  user?: User | null;
}

// Enhanced AI options with user context
export interface GeminiOptions {
  enableStreaming?: boolean;
  systemMessage?: string;
  chatOptions?: ChatCompletionOptions;
  userContext?: UserContext;
  apiKey?: string;
}

// Function to create personalized system message (same as Azure AI)
const createPersonalizedSystemMessage = (baseSystemMessage: string, user?: User | null): string => {
  if (!user) {
    return baseSystemMessage;
  }

  const userProfileData = [];
  
  if (user.firstName || user.lastName) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    userProfileData.push(`Name: ${fullName}`);
  } else if (user.username) {
    userProfileData.push(`Username: ${user.username}`);
  }

  if (user.age) {
    userProfileData.push(`Age: ${user.age}`);
  }

  if (user.bio) {
    userProfileData.push(`Interests: ${user.bio}`);
  }

  if (user.dateOfBirth) {
    const birthDate = new Date(user.dateOfBirth);
    const today = new Date();
    const isToday = birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate();
    
    if (isToday) {
      userProfileData.push(`Birthday: TODAY! 🎉`);
    } else {
      const birthMonth = birthDate.toLocaleDateString('en-US', { month: 'long' });
      const birthDay = birthDate.getDate();
      userProfileData.push(`Birthday: ${birthMonth} ${birthDay}`);
    }
  }

  if (userProfileData.length > 0) {
    const userRepositorySection = `

---
USER PROFILE REPOSITORY:
${userProfileData.join('\n')}

IMPORTANT CONTEXT GUIDELINES:
- You have ongoing access to this user's profile information
- Use this context naturally when relevant to the conversation
- DO NOT greet the user or introduce yourself repeatedly
- DO NOT acknowledge having "new" access to their information
- Simply use the context appropriately as the conversation flows
- Respond to their actual questions and requests, not their identity`;

    return baseSystemMessage + userRepositorySection;
  }

  return baseSystemMessage;
};

interface UseGeminiReturn {
  sendMessage: (messages: Message[]) => Promise<string>;
  sendStreamingMessage: (messages: Message[], onChunk: (chunk: string) => void) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  currentModel: string | null;
  updateModel: (model: LLMModel) => void;
  selectedLLMModel: LLMModel | null;
  modelCapabilities: ModelCapabilities | null;
  isLoadingCapabilities: boolean;
  refreshCapabilities: () => Promise<void>;
}

const SELECTED_MODEL_KEY = 'gemini-selected-model';
const API_KEY_KEY = 'gemini-api-key';

export const useGemini = (options: GeminiOptions = {}): UseGeminiReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [selectedLLMModel, setSelectedLLMModel] = useState<LLMModel | null>(null);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const aiServiceRef = useRef<GeminiService | null>(null);

  // Load persisted model selection and API key on mount
  useEffect(() => {
    const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
    if (savedModel) {
      try {
        const parsedModel: LLMModel = JSON.parse(savedModel);
        setSelectedLLMModel(parsedModel);
        setCurrentModel(parsedModel.id);
      } catch (err) {
        console.warn("Failed to parse saved Gemini model:", err);
        localStorage.removeItem(SELECTED_MODEL_KEY);
        // Set default model if no saved model exists
        setDefaultModel();
      }
    } else {
      // Set default model if no saved model exists
      setDefaultModel();
    }
  }, []);

  // Set default model (Gemini 2.5 Flash)
  const setDefaultModel = useCallback(() => {
    const defaultModel: LLMModel = {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      provider: "Google",
      performance: 85,
      cost: 0.00025,
      latency: 500,
      contextLength: 1000000,
      description: "Fast and efficient Gemini model for general tasks",
      category: "text",
      tier: "free",
      isFavorite: false,
      capabilities: {
        supportsVision: false,
        supportsCodeGeneration: true,
        supportsAnalysis: true,
        supportsImageGeneration: false
      }
    };
    
    setSelectedLLMModel(defaultModel);
    setCurrentModel(defaultModel.id);
    localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(defaultModel));
  }, []);

  // Initialize Gemini service
  const getAIService = useCallback(() => {
    if (!aiServiceRef.current) {
      try {
        // Try to get API key from options first, then from localStorage
        const apiKey = options.apiKey || localStorage.getItem(API_KEY_KEY);
        
        if (!apiKey) {
          throw new Error("Gemini API key not configured. Please set your API key in settings.");
        }

        const config = {
          apiKey,
          modelName: selectedLLMModel?.id || "gemini-2.5-flash"
        };
        
        aiServiceRef.current = new GeminiService(config);
        
        if (selectedLLMModel) {
          aiServiceRef.current.updateModel(selectedLLMModel.id);
        }
        
        setCurrentModel(aiServiceRef.current.getCurrentModel());
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to initialize Gemini service";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    }
    return aiServiceRef.current;
  }, [selectedLLMModel, options.apiKey]);

  // Update model selection
  const updateModel = useCallback((model: LLMModel) => {
    try {
      setSelectedLLMModel(model);
      setCurrentModel(model.id);
      
      // Persist to localStorage
      localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(model));
      
      // Update AI service if it exists
      if (aiServiceRef.current) {
        aiServiceRef.current.updateModel(model.id);
      }
      
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update model";
      setError(errorMessage);
    }
  }, []);

  // Convert app messages to Azure AI format (for compatibility)
  const convertToAzureAIMessages = useCallback((messages: Message[]): AzureAIMessage[] => {
    const systemContent = options.systemMessage || SYSTEM_MESSAGE_PRESETS.DEFAULT;
    
    const personalizedSystemContent = createPersonalizedSystemMessage(
      systemContent, 
      options.userContext?.user
    );
      
    // Add system message with user context
    const azureMessages: AzureAIMessage[] = [
      {
        role: "system",
        content: personalizedSystemContent
      }
    ];

    // Convert user and assistant messages, but exclude the initial welcome message
    messages.forEach(message => {
      if (message.id === "1") {
        return;
      }
      
      if (message.role === "user" || message.role === "assistant") {
        azureMessages.push({
          role: message.role,
          content: message.content
        });
      }
    });
    
    return azureMessages;
  }, [options.systemMessage, options.userContext?.user]);

  // Send non-streaming message
  const sendMessage = useCallback(async (messages: Message[]): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const aiService = getAIService();
      console.log('🚀 Gemini hook: Sending message with', messages.length, 'messages');
      const azureMessages = convertToAzureAIMessages(messages);
      const response = await aiService.sendChatCompletion(azureMessages, options.chatOptions);
      console.log('✅ Gemini hook: Response received:', response ? `${response.substring(0, 100)}...` : 'EMPTY');
      
      if (!response) {
        throw new Error('Gemini returned empty response');
      }
      
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      console.error('❌ Gemini hook error:', errorMessage);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  // Send streaming message
  const sendStreamingMessage = useCallback(async (
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    console.log('🌊 Gemini hook: sendStreamingMessage called with', messages.length, 'messages');
    setIsLoading(true);
    setError(null);

    try {
      const aiService = getAIService();
      console.log('🌊 Gemini hook: Got AI service, converting messages...');
      const azureMessages = convertToAzureAIMessages(messages);
      console.log('🌊 Gemini hook: Calling service streaming with', azureMessages.length, 'messages');
      await aiService.sendStreamingChatCompletion(azureMessages, onChunk, options.chatOptions);
      console.log('🌊 Gemini hook: Streaming completed successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send streaming message";
      console.error('❌ Gemini hook streaming error:', errorMessage);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch model capabilities from the configuration system
  const fetchCapabilities = useCallback(async (modelId: string) => {
    setIsLoadingCapabilities(true);
    try {
      const modelConfig = getModelConfiguration(modelId);
      setModelCapabilities(modelConfig.capabilities);
    } catch (err) {
      console.error("Error fetching model capabilities:", err);
      setModelCapabilities({
        supportsVision: true,
        supportsCodeGeneration: true,
        supportsAnalysis: true,
        supportsImageGeneration: false,
        supportsSystemMessages: true,
        supportsJSONMode: true,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        supportsStop: true,
        supportsLogitBias: false,
        supportsFrequencyPenalty: false,
        supportsPresencePenalty: false
      });
    } finally {
      setIsLoadingCapabilities(false);
    }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    if (currentModel) {
      await fetchCapabilities(currentModel);
    }
  }, [currentModel, fetchCapabilities]);

  // Fetch capabilities when model changes
  useEffect(() => {
    if (currentModel) {
      fetchCapabilities(currentModel);
    }
  }, [currentModel, fetchCapabilities]);

  return {
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
    refreshCapabilities
  };
}; 