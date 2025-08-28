import { ModelConfiguration } from "../types";

/**
 * Comprehensive model configurations for Azure AI models
 * Each model has specific parameter limits and capabilities
 */
export const MODEL_CONFIGURATIONS: Record<string, ModelConfiguration> = {
  // Hugging Face Endpoint (generic)
  "hf-endpoint": {
    id: "hf-endpoint",
    name: "Hugging Face Endpoint",
    provider: "Hugging Face",
    contextLength: 16384,
    limits: {
      maxTokens: {
        input: 16384,
        output: 2048
      },
      temperature: {
        min: 0,
        max: 1,
        default: 0.7
      },
      topP: {
        min: 0,
        max: 1,
        default: 0.9
      }
    },
    capabilities: {
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
    },
    recommendedParams: {
      maxTokens: 512,
      temperature: 0.7,
      topP: 0.9
    },
    specialInstructions: [
      "Parameters map to HF text-generation: max_new_tokens, temperature, top_p",
      "Set return_full_text=false to get only the completion"
    ]
  },
  // Azure OpenAI Models
  "gpt-4o": {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "Azure OpenAI",
    contextLength: 128000,
    limits: {
      maxTokens: {
        input: 128000,
        output: 16384
      },
      temperature: {
        min: 0,
        max: 2,
        default: 0.7
      },
      topP: {
        min: 0.01,
        max: 1,
        default: 0.95
      },
      frequencyPenalty: {
        min: -2,
        max: 2,
        default: 0
      },
      presencePenalty: {
        min: -2,
        max: 2,
        default: 0
      }
    },
    capabilities: {
      supportsVision: true,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false,
      supportsSystemMessages: true,
      supportsJSONMode: true,
      supportsFunctionCalling: true,
      supportsStreaming: true,
      supportsStop: true,
      supportsLogitBias: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true
    },
    recommendedParams: {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.95
    }
  },

  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "Azure OpenAI",
    contextLength: 128000,
    limits: {
      maxTokens: {
        input: 128000,
        output: 16384
      },
      temperature: {
        min: 0,
        max: 2,
        default: 0.7
      },
      topP: {
        min: 0.01,
        max: 1,
        default: 0.95
      },
      frequencyPenalty: {
        min: -2,
        max: 2,
        default: 0
      },
      presencePenalty: {
        min: -2,
        max: 2,
        default: 0
      }
    },
    capabilities: {
      supportsVision: false,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false,
      supportsSystemMessages: true,
      supportsJSONMode: true,
      supportsFunctionCalling: true,
      supportsStreaming: true,
      supportsStop: true,
      supportsLogitBias: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true
    },
    recommendedParams: {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.95
    }
  },

  "gpt-4-turbo": {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "Azure OpenAI",
    contextLength: 128000,
    limits: {
      maxTokens: {
        input: 128000,
        output: 4096
      },
      temperature: {
        min: 0,
        max: 2,
        default: 0.7
      },
      topP: {
        min: 0.01,
        max: 1,
        default: 0.95
      },
      frequencyPenalty: {
        min: -2,
        max: 2,
        default: 0
      },
      presencePenalty: {
        min: -2,
        max: 2,
        default: 0
      }
    },
    capabilities: {
      supportsVision: true,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false,
      supportsSystemMessages: true,
      supportsJSONMode: true,
      supportsFunctionCalling: true,
      supportsStreaming: true,
      supportsStop: true,
      supportsLogitBias: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true
    },
    recommendedParams: {
      maxTokens: 3072,
      temperature: 0.7,
      topP: 0.95
    }
  },

  "gpt-3.5-turbo": {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "Azure OpenAI",
    contextLength: 16385,
    limits: {
      maxTokens: {
        input: 16385,
        output: 4096
      },
      temperature: {
        min: 0,
        max: 2,
        default: 0.7
      },
      topP: {
        min: 0.01,
        max: 1,
        default: 0.95
      },
      frequencyPenalty: {
        min: -2,
        max: 2,
        default: 0
      },
      presencePenalty: {
        min: -2,
        max: 2,
        default: 0
      }
    },
    capabilities: {
      supportsVision: false,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false,
      supportsSystemMessages: true,
      supportsJSONMode: true,
      supportsFunctionCalling: true,
      supportsStreaming: true,
      supportsStop: true,
      supportsLogitBias: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true
    },
    recommendedParams: {
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.95
    }
  },

  // Fine-tuned Models
  "breaking-better-v6-1-ft": {
    id: "breaking-better-v6-1-ft",
    name: "Breaking Better v6.1 (Fine-tuned)",
    provider: "Azure OpenAI (Fine-tuned)",
    contextLength: 128000,
    limits: {
      maxTokens: {
        input: 128000,
        output: 16384
      },
      temperature: {
        min: 0,
        max: 2,
        default: 0.7
      },
      topP: {
        min: 0.01,
        max: 1,
        default: 0.95
      },
      frequencyPenalty: {
        min: -2,
        max: 2,
        default: 0
      },
      presencePenalty: {
        min: -2,
        max: 2,
        default: 0
      }
    },
    capabilities: {
      supportsVision: false,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false,
      supportsSystemMessages: true,
      supportsJSONMode: true,
      supportsFunctionCalling: true,
      supportsStreaming: true,
      supportsStop: true,
      supportsLogitBias: true,
      supportsFrequencyPenalty: true,
      supportsPresencePenalty: true
    },
    recommendedParams: {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.95
    },
    specialInstructions: [
      "Custom fine-tuned model optimized for specific use cases",
      "May have specialized knowledge or behavior based on fine-tuning data"
    ]
  },

  // Microsoft Models
  "phi-4": {
    id: "phi-4",
    name: "Phi-4",
    provider: "Microsoft",
    contextLength: 16384,
    limits: {
      maxTokens: {
        input: 16384,
        output: 4096
      },
      temperature: {
        min: 0,
        max: 1,
        default: 0.6
      },
      topP: {
        min: 0.1,
        max: 1,
        default: 0.9
      }
    },
    capabilities: {
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
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false
    },
    recommendedParams: {
      maxTokens: 2048,
      temperature: 0.6,
      topP: 0.9
    },
    specialInstructions: [
      "Phi models prefer shorter, more concise prompts",
      "Works best with structured programming tasks"
    ]
  },

  // Mistral AI Models
  "ministral-3b": {
    id: "ministral-3b",
    name: "Ministral 3B",
    provider: "Mistral AI",
    contextLength: 131072,
    limits: {
      maxTokens: {
        input: 131072,
        output: 8192
      },
      temperature: {
        min: 0,
        max: 1,
        default: 0.7
      },
      topP: {
        min: 0,
        max: 1,
        default: 1
      }
    },
    capabilities: {
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
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false
    },
    recommendedParams: {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 1
    },
    specialInstructions: [
      "Mistral models prefer top_p = 1 for best performance",
      "Lower temperature for more focused responses"
    ]
  },

  "mistral-large-2411": {
    id: "mistral-large-2411",
    name: "Mistral Large 2411",
    provider: "Mistral AI",
    contextLength: 128000,
    limits: {
      maxTokens: {
        input: 128000,
        output: 8192
      },
      temperature: {
        min: 0,
        max: 1,
        default: 0.7
      },
      topP: {
        min: 0,
        max: 1,
        default: 1
      }
    },
    capabilities: {
      supportsVision: false,
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
    },
    recommendedParams: {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 1
    },
    specialInstructions: [
      "Mistral Large supports function calling and JSON mode",
      "Use top_p = 1 for optimal performance"
    ]
  },

  // Meta Llama Models
  "llama-3.3-70b-instruct": {
    id: "llama-3.3-70b-instruct",
    name: "Llama 3.3 70B Instruct",
    provider: "Meta",
    contextLength: 128000,
    limits: {
      maxTokens: {
        input: 128000,
        output: 4096
      },
      temperature: {
        min: 0,
        max: 2,
        default: 0.6
      },
      topP: {
        min: 0,
        max: 1,
        default: 0.9
      }
    },
    capabilities: {
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
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false
    },
    recommendedParams: {
      maxTokens: 3072,
      temperature: 0.6,
      topP: 0.9
    },
    specialInstructions: [
      "Llama models perform best with temperature between 0.5-0.8",
      "Prefers detailed, specific instructions"
    ]
  },

  "llama-3.2-11b-vision-instruct": {
    id: "llama-3.2-11b-vision-instruct",
    name: "Llama 3.2 11B Vision",
    provider: "Meta",
    contextLength: 128000,
    limits: {
      maxTokens: {
        input: 128000,
        output: 4096
      },
      temperature: {
        min: 0,
        max: 2,
        default: 0.6
      },
      topP: {
        min: 0,
        max: 1,
        default: 0.9
      }
    },
    capabilities: {
      supportsVision: true,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false,
      supportsSystemMessages: true,
      supportsJSONMode: false,
      supportsFunctionCalling: false,
      supportsStreaming: true,
      supportsStop: true,
      supportsLogitBias: false,
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false
    },
    recommendedParams: {
      maxTokens: 3072,
      temperature: 0.6,
      topP: 0.9
    },
    specialInstructions: [
      "Vision-capable Llama model - can process images",
      "Best performance with detailed image descriptions"
    ]
  },

  // Cohere Models
  "cohere-command-r-plus": {
    id: "cohere-command-r-plus",
    name: "Command R+",
    provider: "Cohere",
    contextLength: 131072,
    limits: {
      maxTokens: {
        input: 131072,
        output: 4096
      },
      temperature: {
        min: 0,
        max: 1,
        default: 0.3
      },
      topP: {
        min: 0,
        max: 1,
        default: 0.75
      }
    },
    capabilities: {
      supportsVision: false,
      supportsCodeGeneration: true,
      supportsAnalysis: true,
      supportsImageGeneration: false,
      supportsSystemMessages: true,
      supportsJSONMode: false,
      supportsFunctionCalling: true,
      supportsStreaming: true,
      supportsStop: true,
      supportsLogitBias: false,
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false
    },
    recommendedParams: {
      maxTokens: 3072,
      temperature: 0.3,
      topP: 0.75
    },
    specialInstructions: [
      "Cohere models prefer lower temperature (0.1-0.5)",
      "Excellent for RAG and tool use scenarios",
      "Works best with clear, structured prompts"
    ]
  }
};

/**
 * Get model configuration by ID, with fallback to default configuration
 */
export function getModelConfiguration(modelId: string): ModelConfiguration {
  // First try exact match
  let config = MODEL_CONFIGURATIONS[modelId];
  
  if (!config) {
    // Try case-insensitive match
    const lowercaseId = modelId.toLowerCase();
    const matchingKey = Object.keys(MODEL_CONFIGURATIONS).find(key => 
      key.toLowerCase() === lowercaseId
    );
    
    if (matchingKey) {
      config = MODEL_CONFIGURATIONS[matchingKey];
      console.log(`🔧 Found model configuration for "${modelId}" using case-insensitive match: "${matchingKey}"`);
    }
  }
  
  if (config) {
    return config;
  }
  
  // Fallback configuration for unknown models
  console.warn(`Model configuration not found for: ${modelId}. Using fallback configuration.`);
  
  return {
    id: modelId,
    name: modelId,
    provider: "Unknown",
    contextLength: 16384,
    limits: {
      maxTokens: {
        input: 16384,
        output: 4096
      },
      temperature: {
        min: 0,
        max: 1,
        default: 0.7
      },
      topP: {
        min: 0.1,
        max: 1,
        default: 0.9
      }
    },
    capabilities: {
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
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false
    },
    recommendedParams: {
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.9
    },
    specialInstructions: [
      "Using fallback configuration - model parameters may not be optimal"
    ]
  };

  // Check for OpenAI models (support all OpenAI models with consistent config)
  if (modelId.startsWith('gpt-') || modelId.includes('openai')) {
    return {
      id: modelId,
      name: modelId.replace('openai-', '').toUpperCase().replace('-', ' '),
      provider: "OpenAI",
      contextLength: modelId.includes('gpt-3.5') ? 16000 : 128000,
      limits: {
        maxTokens: {
          input: modelId.includes('gpt-3.5') ? 16000 : 128000,
          output: 16384
        },
        temperature: {
          min: 0,
          max: 2,
          default: 0.7
        },
        topP: {
          min: 0.01,
          max: 1,
          default: 0.95
        },
        frequencyPenalty: {
          min: -2,
          max: 2,
          default: 0
        },
        presencePenalty: {
          min: -2,
          max: 2,
          default: 0
        }
      },
      capabilities: {
        supportsVision: modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo'),
        supportsCodeGeneration: true,
        supportsAnalysis: true,
        supportsImageGeneration: false,
        supportsSystemMessages: true,
        supportsJSONMode: true,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        supportsStop: true,
        supportsLogitBias: true,
        supportsFrequencyPenalty: true,
        supportsPresencePenalty: true
      },
      recommendedParams: {
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
        frequencyPenalty: 0,
        presencePenalty: 0
      }
    };
  }

  // Check for Gemini models (support all Gemini models with consistent config)
  if (modelId.startsWith('gemini-') || modelId.includes('gemini')) {
    return {
      id: modelId,
      name: modelId.replace('gemini-', 'Gemini ').replace('-', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      provider: "Google",
      contextLength: modelId.includes('pro') ? 2000000 : 1000000,
      limits: {
        maxTokens: {
          input: modelId.includes('pro') ? 2000000 : 1000000,
          output: 8192
        },
        temperature: {
          min: 0,
          max: 2,
          default: 0.7
        },
        topP: {
          min: 0.01,
          max: 1,
          default: 0.95
        }
      },
      capabilities: {
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
      },
      recommendedParams: {
        maxTokens: 2048,
        temperature: 0.7,
        topP: 0.95
      }
    };
  }

  // Fallback for unknown models
  return {
    id: modelId,
    name: modelId,
    provider: "Unknown",
    contextLength: 4096,
    limits: {
      maxTokens: {
        input: 4096,
        output: 1024
      },
      temperature: {
        min: 0,
        max: 1,
        default: 0.7
      },
      topP: {
        min: 0.1,
        max: 1,
        default: 0.9
      }
    },
    capabilities: {
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
      supportsFrequencyPenalty: false,
      supportsPresencePenalty: false
    },
    recommendedParams: {
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.9
    },
    specialInstructions: [
      "Using fallback configuration - model parameters may not be optimal"
    ]
  };
}

/**
 * Validate and clamp parameters according to model limits
 */
export function validateModelParameters(
  modelId: string,
  params: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  }
): {
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
} {
  const config = getModelConfiguration(modelId);
  const { limits, capabilities } = config;
  
  // Validate and clamp max_tokens
  let maxTokens = params.maxTokens ?? config.recommendedParams.maxTokens;
  maxTokens = Math.min(maxTokens, limits.maxTokens.output);
  maxTokens = Math.max(maxTokens, 1);
  
  // Validate and clamp temperature
  let temperature = params.temperature ?? limits.temperature.default;
  temperature = Math.min(temperature, limits.temperature.max);
  temperature = Math.max(temperature, limits.temperature.min);
  
  // Validate and clamp top_p
  let topP = params.topP ?? limits.topP.default;
  topP = Math.min(topP, limits.topP.max);
  topP = Math.max(topP, limits.topP.min);
  
  // Azure AI constraint: top_p must be 1 when using greedy sampling (temperature = 0)
  if (temperature === 0) {
    topP = 1;
    console.log(`🔧 Azure AI constraint: Setting top_p=1 for greedy sampling (temperature=0)`);
  }

  const validatedParams: any = {
    maxTokens,
    temperature,
    topP
  };
  
  // Only include frequency_penalty if supported
  if (capabilities.supportsFrequencyPenalty && limits.frequencyPenalty && params.frequencyPenalty !== undefined) {
    let frequencyPenalty = params.frequencyPenalty;
    frequencyPenalty = Math.min(frequencyPenalty, limits.frequencyPenalty.max);
    frequencyPenalty = Math.max(frequencyPenalty, limits.frequencyPenalty.min);
    validatedParams.frequencyPenalty = frequencyPenalty;
  }
  
  // Only include presence_penalty if supported
  if (capabilities.supportsPresencePenalty && limits.presencePenalty && params.presencePenalty !== undefined) {
    let presencePenalty = params.presencePenalty;
    presencePenalty = Math.min(presencePenalty, limits.presencePenalty.max);
    presencePenalty = Math.max(presencePenalty, limits.presencePenalty.min);
    validatedParams.presencePenalty = presencePenalty;
  }
  
  return validatedParams;
}

/**
 * Get optimized parameters for a specific model
 */
export function getOptimizedParameters(modelId: string): {
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
} {
  const config = getModelConfiguration(modelId);
  return validateModelParameters(modelId, config.recommendedParams);
} 