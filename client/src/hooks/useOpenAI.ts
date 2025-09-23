import { OpenAIService } from "../lib/openAI";
import { ChatCompletionOptions, LLMModel } from "../types";
import { User } from "./useAuth";
import { useAI, AIOptions, AIProviderConfig, UseAIReturn } from "./useAI";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";

// Enhanced AI options with user context (extends generic AIOptions)
export interface OpenAIOptions extends AIOptions {}

// OpenAI provider configuration
const openAIConfig: AIProviderConfig<OpenAIService> = {
  selectedModelKey: 'openai-selected-model',
  apiKeyKey: 'openai-api-key',
  providerName: 'OpenAI',
  
  defaultModel: {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    performance: 88,
    cost: 0.00015,
    latency: 600,
    contextLength: 128000,
    description: "Efficient and cost-effective GPT-4 model",
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
  
  createService: (config: any) => new OpenAIService(config),
  
  buildServiceConfig: (options: OpenAIOptions, selectedLLMModel?: LLMModel | null) => {
    // Try to get API key from options first, then from localStorage
    const apiKey = options.apiKey || localStorage.getItem('openai-api-key');
    
    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Please set your API key in settings.");
    }

    return {
      apiKey,
      modelName: selectedLLMModel?.id || "gpt-4o-mini"
    };
  },
  
  updateServiceModel: (service: OpenAIService, modelId: string) => {
    service.updateModel(modelId);
  },
  
  getCurrentModel: (service: OpenAIService) => service.getCurrentModel(),
  
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
export type UseOpenAIReturn = UseAIReturn<OpenAIService>;

/**
 * OpenAI provider hook using the generic useAI implementation.
 * Provides OpenAI-specific configuration while leveraging shared logic.
 */
export const useOpenAI = (options: OpenAIOptions = {}): UseOpenAIReturn => {
  return useAI(openAIConfig, options);
}; 