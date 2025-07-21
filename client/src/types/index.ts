export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  attachments?: string[];
}

export interface CommandSuggestion {
  icon: React.ReactNode;
  label: string;
  description: string;
  prefix: string;
}

// Azure AI specific types
export interface AzureAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AzureAIConfig {
  endpoint: string;
  apiKey: string;
  modelName: string;
}

export interface ChatCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  // Add support for additional parameters that some models might use
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  logitBias?: Record<string, number>;
}

// Model-specific configuration types
export interface ModelParameterLimits {
  maxTokens: {
    input: number;
    output: number;
  };
  temperature: {
    min: number;
    max: number;
    default: number;
  };
  topP: {
    min: number;
    max: number;
    default: number;
  };
  frequencyPenalty?: {
    min: number;
    max: number;
    default: number;
  };
  presencePenalty?: {
    min: number;
    max: number;
    default: number;
  };
}

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsCodeGeneration: boolean;
  supportsAnalysis: boolean;
  supportsImageGeneration: boolean;
  supportsSystemMessages: boolean;
  supportsJSONMode: boolean;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  supportsStop: boolean;
  supportsLogitBias: boolean;
  supportsFrequencyPenalty: boolean;
  supportsPresencePenalty: boolean;
}

export interface ModelConfiguration {
  id: string;
  name: string;
  provider: string;
  limits: ModelParameterLimits;
  capabilities: ModelCapabilities;
  recommendedParams: {
    maxTokens: number;
    temperature: number;
    topP: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
  specialInstructions?: string[];
  contextLength: number;
}

// LLM Model Selection types
export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  performance: number;
  cost: number;
  latency: number;
  contextLength: number;
  description: string;
  category: "text" | "code" | "multimodal" | "reasoning";
  tier: "free" | "pro" | "enterprise";
  isFavorite: boolean;
  capabilities?: {
    supportsVision?: boolean;
    supportsCodeGeneration?: boolean;
    supportsAnalysis?: boolean;
    supportsImageGeneration?: boolean;
  };
}

// OpenAI specific types
export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIConfig {
  apiKey: string;
  modelName: string;
  baseUrl?: string;
}

// Gemini specific types  
export interface GeminiMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiConfig {
  apiKey: string;
  modelName: string;
  baseUrl?: string;
}

export interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}
