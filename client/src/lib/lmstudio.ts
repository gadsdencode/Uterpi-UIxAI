// client/src/lib/lmstudio.ts
// LM Studio API service implementation (OpenAI-compatible)

import { OpenAIConfig, AzureAIMessage, ChatCompletionOptions, LLMModel } from "../types";
import { BaseAIService } from "./ai";

// Tool/Function definition types for LM Studio (OpenAI-compatible)
export interface LMStudioTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface LMStudioToolChoice {
  type: "function";
  function: {
    name: string;
  };
}

// Extended options for LM Studio with tool support
interface LMStudioCompletionOptions extends ChatCompletionOptions {
  tools?: LMStudioTool[];
  toolChoice?: string | LMStudioToolChoice;
  originalMessages?: unknown;
  projectId?: number;
}

// LM Studio uses an OpenAI-compatible API (proxied via /lmstudio by default)
export class LMStudioService extends BaseAIService {
  protected declare config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    // Ensure baseUrl is set to LM Studio default if not provided
    const configWithDefaults = {
      ...config,
      // Default to backend proxy to avoid CORS/mixed-content issues
      baseUrl: config.baseUrl || "https://lmstudio.uterpi.com"
    };
    super(configWithDefaults, 'lmstudio');
  }

  static getAvailableModels(): LLMModel[] {
    // Models available through LM Studio - nomadic-icdu-v8 is the ONLY default
    return [
      {
        id: "nomadic-icdu-v8", // Model ID as shown in LM Studio
        name: "Uterpi AI",
        provider: "Uterpi AI via LM Studio",
        performance: 99,
        cost: 0,
        latency: 250,
        contextLength: 128000,
        description: "Uterpi AI served through LM Studio (OpenAI-compatible endpoint)",
        category: "text",
        tier: "freemium",
        isFavorite: true
      }
    ];
  }

  async sendChatCompletion(
    messages: AzureAIMessage[],
    options: LMStudioCompletionOptions = {}
  ): Promise<string> {
    const openAIMessages = this.convertToOpenAIMessages(messages);
    const modelConfig = this.getModelConfig();

    const estimatedTokens = this.estimateTokenCount(openAIMessages);
    const maxContextTokens = modelConfig.contextLength || 128000;
    const reserveTokensForResponse = options.maxTokens || 1024;

    let processedMessages = openAIMessages;
    if (estimatedTokens + reserveTokensForResponse > maxContextTokens) {
      processedMessages = this.truncateConversationHistory(openAIMessages, maxContextTokens - reserveTokensForResponse);
    }

    const validatedParams = this.getValidatedParams(options);

    const requestBody: Record<string, unknown> = {
      model: this.config.modelName,
      messages: processedMessages,
      max_tokens: validatedParams.maxTokens,
      temperature: validatedParams.temperature,
      top_p: validatedParams.topP,
      stream: false
    };

    // Add tool/function calling support if provided
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      if (options.toolChoice) {
        requestBody.tool_choice = options.toolChoice;
      }
    }

    if (modelConfig.capabilities.supportsFrequencyPenalty && validatedParams.frequencyPenalty !== undefined) {
      requestBody.frequency_penalty = validatedParams.frequencyPenalty;
    }
    if (modelConfig.capabilities.supportsPresencePenalty && validatedParams.presencePenalty !== undefined) {
      requestBody.presence_penalty = validatedParams.presencePenalty;
    }
    if (modelConfig.capabilities.supportsStop && options.stop) {
      requestBody.stop = options.stop;
    }

    // Use universal AI proxy for credit checking
    const response = await fetch('/ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        provider: 'lmstudio',
        ...requestBody,
        original_messages: options.originalMessages,
        projectId: options.projectId
      })
    });

    if (!response.ok) {
      await this.handleApiError(response, 'API');
    }

    const data = await response.json();
    
    // Extract credit information if present and emit update
    await this.emitCreditUpdate(data.uterpi_credit_info);
    
    // Emit sources event if backend provided citations
    this.dispatchSourcesEvent(data.sources);
    
    // Handle tool calls if present and non-empty
    if (data.choices?.[0]?.message?.tool_calls && data.choices[0].message.tool_calls.length > 0) {
      console.log("Tool calls detected:", data.choices[0].message.tool_calls);
      // Return the tool calls as JSON string for processing
      return JSON.stringify(data.choices[0].message.tool_calls);
    }
    
    return data.choices?.[0]?.message?.content || "";
  }

  async sendStreamingChatCompletion(
    messages: AzureAIMessage[],
    onChunk: (chunk: string) => void,
    options: LMStudioCompletionOptions = {}
  ): Promise<void> {
    const openAIMessages = this.convertToOpenAIMessages(messages);
    const modelConfig = this.getModelConfig();
    const validatedParams = this.getValidatedParams(options);

    const requestBody: Record<string, unknown> = {
      model: this.config.modelName,
      messages: openAIMessages,
      max_tokens: validatedParams.maxTokens,
      temperature: validatedParams.temperature,
      top_p: validatedParams.topP,
      stream: true
    };

    // Add tool/function calling support for streaming
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      if (options.toolChoice) {
        requestBody.tool_choice = options.toolChoice;
      }
    }

    if (modelConfig.capabilities.supportsFrequencyPenalty && validatedParams.frequencyPenalty !== undefined) {
      requestBody.frequency_penalty = validatedParams.frequencyPenalty;
    }
    if (modelConfig.capabilities.supportsPresencePenalty && validatedParams.presencePenalty !== undefined) {
      requestBody.presence_penalty = validatedParams.presencePenalty;
    }
    if (modelConfig.capabilities.supportsStop && options.stop) {
      requestBody.stop = options.stop;
    }

    // Use universal AI proxy for credit checking
    const response = await fetch('/ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        provider: 'lmstudio',
        ...requestBody,
        original_messages: options.originalMessages,
        projectId: options.projectId
      })
    });

    if (!response.ok) {
      await this.handleStreamError(response);
    }

    const reader = this.getStreamReader(response);
    await this.parseOpenAIStyleSSE(reader, onChunk);
  }

  static createFromEnv(): OpenAIConfig {
    const apiKey = import.meta.env.VITE_LMSTUDIO_API_KEY || "lm-studio";
    const modelName = import.meta.env.VITE_LMSTUDIO_MODEL_NAME || "nomadai-lcdu-v8";
    // Default to backend proxy path
    const baseUrl = import.meta.env.VITE_LMSTUDIO_BASE_URL || "https://lmstudio.uterpi.com";
    return { apiKey, modelName, baseUrl };
  }

  // Helper method to list available models from LM Studio
  async listModels(): Promise<{ data: unknown[]; error?: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl || "https://lmstudio.uterpi.com"}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey || "lm-studio"}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to list LM Studio models:", error);
      return { data: [], error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  static createWithModel(modelName: string): OpenAIConfig {
    const config = this.createFromEnv();
    return { ...config, modelName };
  }
}
