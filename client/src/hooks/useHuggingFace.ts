import { HuggingFaceService } from "../lib/huggingface";
import { ChatCompletionOptions, LLMModel } from "../types";
import { SYSTEM_MESSAGE_PRESETS } from "./useAzureAI";
import { User } from "./useAuth";
import { useAI, AIOptions, AIProviderConfig, UseAIReturn } from "./useAI";

// Enhanced AI options with user context (extends generic AIOptions)
export interface HuggingFaceOptions extends AIOptions {
  isUterpi?: boolean; // Special flag for Uterpi endpoint
}

// HuggingFace provider configuration
const huggingFaceConfig: AIProviderConfig<HuggingFaceService> = {
  selectedModelKey: 'hf-selected-model',
  apiTokenKey: 'hf-api-token',
  endpointUrlKey: 'hf-endpoint-url',
  providerName: 'Hugging Face',
  
  defaultModel: {
    id: "hf-endpoint",
    name: "HuggingFace",
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
  },
  
  createService: (config: any) => new HuggingFaceService(config),
  
  buildServiceConfig: (options: HuggingFaceOptions, selectedLLMModel?: LLMModel | null) => {
    const apiToken = options.apiToken || localStorage.getItem('hf-api-token') || (import.meta as any).env?.VITE_HF_API_TOKEN;
    const endpointUrl = options.endpointUrl || localStorage.getItem('hf-endpoint-url') || (import.meta as any).env?.VITE_HF_ENDPOINT_URL;
    
    if (!apiToken) throw new Error("Hugging Face API token not configured. Set it in settings.");
    if (!endpointUrl) throw new Error("Hugging Face endpoint URL not configured. Set it in settings.");
    
    return {
      endpointUrl,
      apiToken,
      modelName: selectedLLMModel?.id || "hf-endpoint"
    };
  },
  
  updateServiceModel: (service: HuggingFaceService, modelId: string) => {
    service.updateModel(modelId);
  },
  
  getCurrentModel: (service: HuggingFaceService) => service.getCurrentModel(),
  
  defaultCapabilities: {
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
  }
};

// Special Uterpi configuration (variant of HuggingFace)
const createUterpiConfig = (options: HuggingFaceOptions): AIProviderConfig<HuggingFaceService> => {
  const baseConfig = { ...huggingFaceConfig };
  
  // Override default model for Uterpi
  baseConfig.defaultModel = {
    ...baseConfig.defaultModel,
    name: "Uterpi Endpoint",
    provider: "Uterpi",
    description: "Uses the managed Uterpi Inference Endpoint"
  };
  
  baseConfig.providerName = 'Uterpi';
  
  return baseConfig;
};

// Type alias for the return interface
export type UseHuggingFaceReturn = UseAIReturn<HuggingFaceService>;

/**
 * HuggingFace provider hook using the generic useAI implementation.
 * Provides HuggingFace-specific configuration while leveraging shared logic.
 * Supports both regular HuggingFace and Uterpi endpoints.
 */
export const useHuggingFace = (options: HuggingFaceOptions = {}): UseHuggingFaceReturn => {
  // Determine if this is a Uterpi instance
  const uterpiToken = (import.meta as any).env?.VITE_UTERPI_API_TOKEN;
  const uterpiUrl = (import.meta as any).env?.VITE_UTERPI_ENDPOINT_URL;
  const isUterpi = options.isUterpi || (!!options.apiToken && !!options.endpointUrl && options.apiToken === uterpiToken && options.endpointUrl === uterpiUrl);
  
  // Use appropriate configuration based on whether this is Uterpi or regular HuggingFace
  const config = isUterpi ? createUterpiConfig(options) : huggingFaceConfig;
  
  return useAI(config, options);
};


