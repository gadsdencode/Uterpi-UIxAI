import { useCallback } from "react";
import { LMStudioService } from "../lib/lmstudio";
import { ChatCompletionOptions, LLMModel } from "../types";
import { User } from "./useAuth";
import { useAI, AIOptions, AIProviderConfig, UseAIReturn } from "./useAI";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";

// Enhanced AI options with user context (extends generic AIOptions)
export interface LMStudioOptions extends AIOptions {}

// LMStudio provider configuration
const lmStudioConfig: AIProviderConfig<LMStudioService> = {
  selectedModelKey: 'lmstudio-selected-model',
  apiKeyKey: 'lmstudio-api-key',
  baseUrlKey: 'lmstudio-base-url',
  providerName: 'LM Studio',
  
  defaultModel: {
    id: "nomadic-icdu-v8",
    name: "Nomadic ICDU v8 (Uterpi AI)",
    provider: "Uterpi AI via LM Studio",
    performance: 99,
    cost: 0,
    latency: 250,
    contextLength: 128000,
    description: "Uterpi AI served through LM Studio (OpenAI-compatible endpoint)",
    category: "text",
    tier: "freemium",
    isFavorite: true,
    capabilities: {
      supportsVision: false,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false
    }
  },
  
  createService: (config: any) => new LMStudioService(config),
  
  buildServiceConfig: (options: LMStudioOptions, selectedLLMModel?: LLMModel | null) => {
    const apiKey =
      options.apiKey ||
      localStorage.getItem('lmstudio-api-key') ||
      (import.meta as any).env?.VITE_LMSTUDIO_API_KEY ||
      'lm-studio';
    const baseUrl =
      options.baseUrl ||
      localStorage.getItem('lmstudio-base-url') ||
      (import.meta as any).env?.VITE_LMSTUDIO_BASE_URL ||
      'https://lmstudio.uterpi.com';
    
      const modelName = selectedLLMModel?.id || lmStudioConfig.defaultModel.id;

      return { apiKey, baseUrl, modelName };
  },
  
  updateServiceModel: (service: LMStudioService, modelId: string) => {
    service.updateModel(modelId);
  },
  
  getCurrentModel: (service: LMStudioService) => service.getCurrentModel(),
  
  defaultCapabilities: {
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
  }
};

// Type alias for the return interface
export type UseLMStudioReturn = UseAIReturn<LMStudioService>;

/**
 * LM Studio provider hook using the generic useAI implementation.
 * Provides LM Studio-specific configuration while leveraging shared logic.
 * Includes special fallback handling for streaming failures.
 */
export const useLMStudio = (options: LMStudioOptions = {}): UseLMStudioReturn => {
  const baseHook = useAI(lmStudioConfig, options);
  
  // Override sendStreamingMessage to include LM Studio-specific fallback logic
  const sendStreamingMessage = useCallback(async (
    messages: any[],
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    try {
      await baseHook.sendStreamingMessage(messages, onChunk);
    } catch (streamErr) {
      // Fallback to non-streaming if streaming fails (e.g., tunnel issues)
      try {
        const response = await baseHook.sendMessage(messages);
        if (response) {
          onChunk(response);
        }
      } catch (fallbackErr) {
        // If fallback also fails, throw the original streaming error
        throw streamErr;
      }
    }
  }, [baseHook]);

  return {
    ...baseHook,
    sendStreamingMessage,
  };
};


