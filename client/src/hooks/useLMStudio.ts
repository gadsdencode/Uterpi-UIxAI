import { useState, useCallback, useRef, useEffect } from "react";
import { LMStudioService } from "../lib/lmstudio";
import { Message, AzureAIMessage, ChatCompletionOptions, LLMModel, ModelCapabilities } from "../types";
import { getModelConfiguration } from "../lib/modelConfigurations";
import { User } from "./useAuth";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";

export interface LMStudioOptions {
  enableStreaming?: boolean;
  systemMessage?: string;
  chatOptions?: ChatCompletionOptions;
  userContext?: { user?: User | null };
  apiKey?: string; // optional; LM Studio can accept any token
  baseUrl?: string; // optional override for LM Studio server
}

const SELECTED_MODEL_KEY = 'lmstudio-selected-model';
const API_KEY_KEY = 'lmstudio-api-key';
const BASE_URL_KEY = 'lmstudio-base-url';

const createPersonalizedSystemMessage = (baseSystemMessage: string, user?: User | null): string => {
  if (!user) return baseSystemMessage;
  const userProfileData: string[] = [];
  if (user.firstName || user.lastName) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    userProfileData.push(`Name: ${fullName}`);
  } else if (user.username) {
    userProfileData.push(`Username: ${user.username}`);
  }
  if (user.age) userProfileData.push(`Age: ${user.age}`);
  if (user.bio) userProfileData.push(`Interests: ${user.bio}`);

  if (userProfileData.length > 0) {
    const repo = `\n\n---\nUSER PROFILE REPOSITORY:\n${userProfileData.join('\n')}\n`;
    return baseSystemMessage + repo;
  }
  return baseSystemMessage;
};

interface UseLMStudioReturn {
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

export const useLMStudio = (options: LMStudioOptions = {}): UseLMStudioReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [selectedLLMModel, setSelectedLLMModel] = useState<LLMModel | null>(null);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const aiServiceRef = useRef<LMStudioService | null>(null);

  // Load persisted model selection and optional settings on mount
  useEffect(() => {
    const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
    if (savedModel) {
      try {
        const parsedModel: LLMModel = JSON.parse(savedModel);
        setSelectedLLMModel(parsedModel);
        setCurrentModel(parsedModel.id);
      } catch {
        localStorage.removeItem(SELECTED_MODEL_KEY);
        setDefaultModel();
      }
    } else {
      setDefaultModel();
    }
  }, []);

  const setDefaultModel = useCallback(() => {
    const models = LMStudioService.getAvailableModels();
    const defaultModel = models[0];
    setSelectedLLMModel(defaultModel);
    setCurrentModel(defaultModel.id);
    localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(defaultModel));
  }, []);

  const getAIService = useCallback(() => {
    if (!aiServiceRef.current) {
      const apiKey = options.apiKey || localStorage.getItem(API_KEY_KEY) || 'lm-studio';
      const baseUrl = options.baseUrl || localStorage.getItem(BASE_URL_KEY) || undefined;
      const config = {
        apiKey,
        modelName: selectedLLMModel?.id || LMStudioService.getAvailableModels()[0].id,
        baseUrl
      };
      aiServiceRef.current = new LMStudioService(config);
      if (selectedLLMModel) {
        aiServiceRef.current.updateModel(selectedLLMModel.id);
      }
      setCurrentModel(aiServiceRef.current.getCurrentModel());
    }
    return aiServiceRef.current;
  }, [selectedLLMModel, options.apiKey, options.baseUrl]);

  const updateModel = useCallback((model: LLMModel) => {
    try {
      setSelectedLLMModel(model);
      setCurrentModel(model.id);
      localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(model));
      if (aiServiceRef.current) {
        aiServiceRef.current.updateModel(model.id);
      }
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update model";
      setError(errorMessage);
    }
  }, []);

  const convertToAzureAIMessages = useCallback((messages: Message[]): AzureAIMessage[] => {
    const systemContent = options.systemMessage || SYSTEM_MESSAGE_PRESETS.DEFAULT;
    const personalized = createPersonalizedSystemMessage(systemContent, options.userContext?.user);
    const azureMessages: AzureAIMessage[] = [
      { role: "system", content: personalized }
    ];
    messages.forEach(message => {
      if (message.id === "1") return;
      if (message.role === "user" || message.role === "assistant") {
        azureMessages.push({ role: message.role, content: message.content });
      }
    });
    return azureMessages;
  }, [options.systemMessage, options.userContext?.user]);

  const sendMessage = useCallback(async (messages: Message[]): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const aiService = getAIService();
      const azureMessages = convertToAzureAIMessages(messages);
      const response = await aiService.sendChatCompletion(azureMessages, options.chatOptions);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  const sendStreamingMessage = useCallback(async (
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const aiService = getAIService();
      const azureMessages = convertToAzureAIMessages(messages);
      await aiService.sendStreamingChatCompletion(azureMessages, onChunk, options.chatOptions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send streaming message";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  const clearError = useCallback(() => setError(null), []);

  const fetchCapabilities = useCallback(async (modelId: string) => {
    setIsLoadingCapabilities(true);
    try {
      const modelConfig = getModelConfiguration(modelId);
      setModelCapabilities(modelConfig.capabilities);
    } catch (err) {
      console.error("Error fetching model capabilities:", err);
      setModelCapabilities({
        supportsVision: false,
        supportsCodeGeneration: true,
        supportsAnalysis: true,
        supportsImageGeneration: false,
        supportsSystemMessages: true,
        supportsJSONMode: false,
        supportsFunctionCalling: false,
        supportsStreaming: true,
        supportsStop: true,
        supportsLogitBias: false,
        supportsFrequencyPenalty: true,
        supportsPresencePenalty: true
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


