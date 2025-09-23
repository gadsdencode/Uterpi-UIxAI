import { useState, useCallback, useRef, useEffect } from "react";
import { Message, AzureAIMessage, ChatCompletionOptions, LLMModel, ModelCapabilities } from "../types";
import { getModelConfiguration } from "../lib/modelConfigurations";
import { User } from "./useAuth";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";

// Generic user context interface for AI personalization
export interface UserContext {
  user?: User | null;
}

// Generic AI options interface
export interface AIOptions {
  enableStreaming?: boolean;
  systemMessage?: string;
  chatOptions?: ChatCompletionOptions;
  userContext?: UserContext;
  apiKey?: string;
  baseUrl?: string;
  apiToken?: string;
  endpointUrl?: string;
  isUterpi?: boolean;
}

// Provider-specific configuration interface
export interface AIProviderConfig<TService = any> {
  // Storage keys
  selectedModelKey: string;
  apiKeyKey?: string;
  baseUrlKey?: string;
  apiTokenKey?: string;
  endpointUrlKey?: string;
  
  // Default model
  defaultModel: LLMModel;
  
  // Service factory function
  createService: (config: any, options: AIOptions) => TService;
  
  // Service configuration builder
  buildServiceConfig: (options: AIOptions, selectedModel?: LLMModel | null) => any;
  
  // Model updater for the service
  updateServiceModel: (service: TService, modelId: string) => void;
  
  // Current model getter
  getCurrentModel: (service: TService) => string | null;
  
  // Default capabilities for fallback
  defaultCapabilities: ModelCapabilities;
  
  // Provider name for logging
  providerName: string;
}

// Generic return interface
export interface UseAIReturn<TService = any> {
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
  aiService?: TService; // Expose service instance if needed
}

// Function to create personalized system message
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

/**
 * Generic AI hook that provides common functionality for all AI providers.
 * This hook handles state management, API calls, and common logic while
 * allowing provider-specific customization through the config parameter.
 */
export const useAI = <TService = any>(
  config: AIProviderConfig<TService>,
  options: AIOptions = {}
): UseAIReturn<TService> => {
  // Common state management
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [selectedLLMModel, setSelectedLLMModel] = useState<LLMModel | null>(null);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const aiServiceRef = useRef<TService | null>(null);

  // Load persisted model selection on mount
  useEffect(() => {
    const savedModel = localStorage.getItem(config.selectedModelKey);
    
    // Special handling for LM Studio to force nomadic-icdu-v8 as default
    if (config.providerName === 'LM Studio') {
      // Check if we need to force reset to nomadic-icdu-v8
      if (savedModel) {
        try {
          const parsedModel: LLMModel = JSON.parse(savedModel);
          // If the saved model is not nomadic-icdu-v8, force reset to default
          if (parsedModel.id !== 'nomadic-icdu-v8') {
            console.log(`🔄 Forcing LM Studio default model reset from ${parsedModel.id} to nomadic-icdu-v8`);
            setDefaultModel();
            return;
          }
          setSelectedLLMModel(parsedModel);
          setCurrentModel(parsedModel.id);
        } catch (err) {
          console.warn(`Failed to parse saved ${config.providerName} model:`, err);
          localStorage.removeItem(config.selectedModelKey);
          setDefaultModel();
        }
      } else {
        setDefaultModel();
      }
      return;
    }
    
    // Standard logic for other providers
    if (savedModel) {
      try {
        const parsedModel: LLMModel = JSON.parse(savedModel);
        setSelectedLLMModel(parsedModel);
        setCurrentModel(parsedModel.id);
      } catch (err) {
        console.warn(`Failed to parse saved ${config.providerName} model:`, err);
        localStorage.removeItem(config.selectedModelKey);
        setDefaultModel();
      }
    } else {
      setDefaultModel();
    }
  }, [config.selectedModelKey, config.defaultModel, config.providerName]);

  // Set default model
  const setDefaultModel = useCallback(() => {
    setSelectedLLMModel(config.defaultModel);
    setCurrentModel(config.defaultModel.id);
    localStorage.setItem(config.selectedModelKey, JSON.stringify(config.defaultModel));
  }, [config.defaultModel, config.selectedModelKey]);

  // Initialize AI service
  const getAIService = useCallback(() => {
    if (!aiServiceRef.current) {
      try {
        const serviceConfig = config.buildServiceConfig(options, selectedLLMModel);
        aiServiceRef.current = config.createService(serviceConfig, options);
        
        if (selectedLLMModel) {
          config.updateServiceModel(aiServiceRef.current, selectedLLMModel.id);
        }
        
        const currentModelFromService = config.getCurrentModel(aiServiceRef.current);
        if (currentModelFromService) {
          setCurrentModel(currentModelFromService);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : `Failed to initialize ${config.providerName} service`;
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    }
    return aiServiceRef.current;
  }, [selectedLLMModel, options, config]);

  // Update model selection
  const updateModel = useCallback((model: LLMModel) => {
    try {
      setSelectedLLMModel(model);
      setCurrentModel(model.id);
      
      // Persist to localStorage
      localStorage.setItem(config.selectedModelKey, JSON.stringify(model));
      
      // Update AI service if it exists
      if (aiServiceRef.current) {
        config.updateServiceModel(aiServiceRef.current, model.id);
      }
      
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update model";
      setError(errorMessage);
    }
  }, [config]);

  // Convert app messages to Azure AI format (for compatibility across providers)
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
      const azureMessages = convertToAzureAIMessages(messages);
      const response = await (aiService as any).sendChatCompletion(azureMessages, options.chatOptions);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to send message via ${config.providerName}`;
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions, config.providerName]);

  // Send streaming message
  const sendStreamingMessage = useCallback(async (
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const aiService = getAIService();
      const azureMessages = convertToAzureAIMessages(messages);
      await (aiService as any).sendStreamingChatCompletion(azureMessages, onChunk, options.chatOptions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to send streaming message via ${config.providerName}`;
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions, config.providerName]);

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
      console.error(`Error fetching model capabilities for ${config.providerName}:`, err);
      setModelCapabilities(config.defaultCapabilities);
    } finally {
      setIsLoadingCapabilities(false);
    }
  }, [config.providerName, config.defaultCapabilities]);

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
    refreshCapabilities,
    aiService: aiServiceRef.current || undefined,
  };
};
