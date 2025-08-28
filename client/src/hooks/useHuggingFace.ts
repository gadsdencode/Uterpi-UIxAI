import { useState, useCallback, useRef, useEffect } from "react";
import { HuggingFaceService } from "../lib/huggingface";
import { Message, AzureAIMessage, ChatCompletionOptions, LLMModel, ModelCapabilities } from "../types";
import { getModelConfiguration } from "../lib/modelConfigurations";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";
import { User } from "./useAuth";

export interface UserContext {
  user?: User | null;
}

export interface HuggingFaceOptions {
  enableStreaming?: boolean;
  systemMessage?: string;
  chatOptions?: ChatCompletionOptions;
  userContext?: UserContext;
  apiToken?: string;
  endpointUrl?: string;
}

const SELECTED_MODEL_KEY = 'hf-selected-model';
const API_TOKEN_KEY = 'hf-api-token';
const ENDPOINT_URL_KEY = 'hf-endpoint-url';

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
    const repo = `\n\n---\nUSER PROFILE REPOSITORY:\n${userProfileData.join('\n')}\n\nIMPORTANT CONTEXT GUIDELINES:\n- You have ongoing access to this user's profile information\n- Use this context naturally when relevant to the conversation\n- DO NOT greet the user or introduce yourself repeatedly\n- DO NOT acknowledge having "new" access to their information\n- Simply use the context appropriately as the conversation flows\n- Respond to their actual questions and requests, not their identity`;
    return baseSystemMessage + repo;
  }
  return baseSystemMessage;
};

interface UseHuggingFaceReturn {
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

export const useHuggingFace = (options: HuggingFaceOptions = {}): UseHuggingFaceReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [selectedLLMModel, setSelectedLLMModel] = useState<LLMModel | null>(null);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const aiServiceRef = useRef<HuggingFaceService | null>(null);

  useEffect(() => {
    const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
    if (savedModel) {
      try {
        const parsed: LLMModel = JSON.parse(savedModel);
        setSelectedLLMModel(parsed);
        setCurrentModel(parsed.id);
      } catch {
        localStorage.removeItem(SELECTED_MODEL_KEY);
        setDefaultModel();
      }
    } else {
      setDefaultModel();
    }
  }, []);

  const setDefaultModel = useCallback(() => {
    const defaultModel: LLMModel = {
      id: "hf-endpoint",
      name: "Hugging Face Endpoint",
      provider: "Hugging Face",
      performance: 80,
      cost: 0,
      latency: 800,
      contextLength: 16384,
      description: "Uses your configured Inference Endpoint",
      category: "text",
      tier: "pro",
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

  const getAIService = useCallback(() => {
    if (!aiServiceRef.current) {
      try {
        const apiToken = options.apiToken || localStorage.getItem(API_TOKEN_KEY) || (import.meta as any).env?.VITE_HF_API_TOKEN;
        const endpointUrl = options.endpointUrl || localStorage.getItem(ENDPOINT_URL_KEY) || (import.meta as any).env?.VITE_HF_ENDPOINT_URL;
        if (!apiToken) throw new Error("Hugging Face API token not configured. Set it in settings.");
        if (!endpointUrl) throw new Error("Hugging Face endpoint URL not configured. Set it in settings.");
        aiServiceRef.current = new HuggingFaceService({ endpointUrl, apiToken, modelName: selectedLLMModel?.id || "hf-endpoint" });
        setCurrentModel(aiServiceRef.current.getCurrentModel());
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to initialize Hugging Face service";
        setError(msg);
        throw new Error(msg);
      }
    }
    return aiServiceRef.current;
  }, [selectedLLMModel, options.apiToken, options.endpointUrl]);

  const updateModel = useCallback((model: LLMModel) => {
    try {
      setSelectedLLMModel(model);
      setCurrentModel(model.id);
      localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(model));
      if (aiServiceRef.current) aiServiceRef.current.updateModel(model.id);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update model";
      setError(msg);
    }
  }, []);

  const convertToAzureAIMessages = useCallback((messages: Message[]): AzureAIMessage[] => {
    const systemContent = options.systemMessage || SYSTEM_MESSAGE_PRESETS.DEFAULT;
    const personalized = createPersonalizedSystemMessage(systemContent, options.userContext?.user);
    const azureMessages: AzureAIMessage[] = [
      { role: "system", content: personalized }
    ];
    messages.forEach(m => {
      if (m.id === "1") return;
      if (m.role === "user" || m.role === "assistant") {
        azureMessages.push({ role: m.role, content: m.content });
      }
    });
    return azureMessages;
  }, [options.systemMessage, options.userContext?.user]);

  const sendMessage = useCallback(async (messages: Message[]): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const svc = getAIService();
      const azureMessages = convertToAzureAIMessages(messages);
      const text = await svc.sendChatCompletion(azureMessages, options.chatOptions);
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  const sendStreamingMessage = useCallback(async (messages: Message[], onChunk: (chunk: string) => void): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const svc = getAIService();
      const azureMessages = convertToAzureAIMessages(messages);
      await svc.sendStreamingChatCompletion(azureMessages, onChunk, options.chatOptions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send streaming message";
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  const clearError = useCallback(() => setError(null), []);

  const fetchCapabilities = useCallback(async (modelId: string) => {
    setIsLoadingCapabilities(true);
    try {
      const cfg = getModelConfiguration(modelId);
      setModelCapabilities(cfg.capabilities);
    } catch (err) {
      setModelCapabilities({
        supportsVision: false,
        supportsCodeGeneration: true,
        supportsAnalysis: true,
        supportsImageGeneration: false,
        supportsSystemMessages: true,
        supportsJSONMode: false,
        supportsFunctionCalling: false,
        supportsStreaming: false,
        supportsStop: false,
        supportsLogitBias: false,
        supportsFrequencyPenalty: false,
        supportsPresencePenalty: false
      });
    } finally {
      setIsLoadingCapabilities(false);
    }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    if (currentModel) await fetchCapabilities(currentModel);
  }, [currentModel, fetchCapabilities]);

  useEffect(() => {
    if (currentModel) fetchCapabilities(currentModel);
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


