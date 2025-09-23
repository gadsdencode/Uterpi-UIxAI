import { GeminiService } from "../lib/gemini";
import { ChatCompletionOptions, LLMModel } from "../types";
import { User } from "./useAuth";
import { useAI, AIOptions, AIProviderConfig, UseAIReturn } from "./useAI";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";

// Enhanced AI options with user context (extends generic AIOptions)
export interface GeminiOptions extends AIOptions {}

// Gemini provider configuration
const geminiConfig: AIProviderConfig<GeminiService> = {
  selectedModelKey: 'gemini-selected-model',
  apiKeyKey: 'gemini-api-key',
  providerName: 'Gemini',
  
  defaultModel: {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    performance: 85,
    cost: 0.00025,
    latency: 500,
    contextLength: 1000000,
    description: "Fast and efficient Gemini model for general tasks",
    category: "text",
    tier: "freemium",
    isFavorite: false,
    capabilities: {
      supportsVision: false,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false
    }
  },
  
  createService: (config: any) => new GeminiService(config),
  
  buildServiceConfig: (options: GeminiOptions, selectedLLMModel?: LLMModel | null) => {
    // Try to get API key from options first, then from localStorage
    const apiKey = options.apiKey || localStorage.getItem('gemini-api-key');
    
    if (!apiKey) {
      throw new Error("Gemini API key not configured. Please set your API key in settings.");
    }

    return {
      apiKey,
      modelName: selectedLLMModel?.id || "gemini-2.5-flash"
    };
  },
  
  updateServiceModel: (service: GeminiService, modelId: string) => {
    service.updateModel(modelId);
  },
  
  getCurrentModel: (service: GeminiService) => service.getCurrentModel(),
  
  defaultCapabilities: {
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
  }
};

// Type alias for the return interface
export type UseGeminiReturn = UseAIReturn<GeminiService>;

/**
 * Gemini provider hook using the generic useAI implementation.
 * Provides Gemini-specific configuration while leveraging shared logic.
 */
export const useGemini = (options: GeminiOptions = {}): UseGeminiReturn => {
  return useAI(geminiConfig, options);
}; 