// client/src/lib/openAI.ts
// OpenAI API service implementation

import { OpenAIConfig, AzureAIMessage, ChatCompletionOptions, LLMModel } from "../types";
import { BaseAIService } from "./ai";

export class OpenAIService extends BaseAIService {
  protected declare config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    super(config, 'openai');
  }

  /**
   * Get available OpenAI models
   */
  static getAvailableModels(): LLMModel[] {
    return [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        performance: 96,
        cost: 0.005,
        latency: 800,
        contextLength: 128000,
        description: "Most advanced GPT-4 model with multimodal capabilities",
        category: "multimodal",
        tier: "pro",
        isFavorite: false,
        capabilities: {
          supportsVision: true,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      {
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
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        provider: "OpenAI",
        performance: 94,
        cost: 0.01,
        latency: 1000,
        contextLength: 128000,
        description: "Enhanced GPT-4 model with improved performance",
        category: "text",
        tier: "pro",
        isFavorite: false,
        capabilities: {
          supportsVision: true,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        provider: "OpenAI",
        performance: 82,
        cost: 0.0015,
        latency: 500,
        contextLength: 16000,
        description: "Fast and efficient language model for general tasks",
        category: "text",
        tier: "freemium",
        isFavorite: false,
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      }
    ];
  }

  /**
   * Send a single chat completion request
   */
  async sendChatCompletion(
    messages: AzureAIMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    try {
      // Convert to OpenAI format
      const openAIMessages = this.convertToOpenAIMessages(messages);
      
      // Get model-specific configuration and parameters
      const modelConfig = this.getModelConfig();
      
      // Estimate token count and truncate if necessary
      const estimatedTokens = this.estimateTokenCount(openAIMessages);
      const maxContextTokens = modelConfig.contextLength || 4096;
      const reserveTokensForResponse = options.maxTokens || 1024;
      
      console.log(`🔢 Token estimate: ${estimatedTokens}/${maxContextTokens} (reserving ${reserveTokensForResponse} for response)`);
      
      let processedMessages = openAIMessages;
      if (estimatedTokens + reserveTokensForResponse > maxContextTokens) {
        console.warn(`⚠️ Approaching token limit, truncating conversation history`);
        processedMessages = this.truncateConversationHistory(openAIMessages, maxContextTokens - reserveTokensForResponse);
      }
      
      // Use validated parameters based on the model's capabilities and limits
      const validatedParams = this.getValidatedParams(options);

      // Build request body
      const requestBody: Record<string, unknown> = {
        model: this.config.modelName,
        messages: processedMessages,
        max_tokens: validatedParams.maxTokens,
        temperature: validatedParams.temperature,
        top_p: validatedParams.topP,
        stream: false,
      };

      // Add optional parameters
      if (modelConfig.capabilities.supportsFrequencyPenalty && validatedParams.frequencyPenalty !== undefined) {
        requestBody.frequency_penalty = validatedParams.frequencyPenalty;
      }
      
      if (modelConfig.capabilities.supportsPresencePenalty && validatedParams.presencePenalty !== undefined) {
        requestBody.presence_penalty = validatedParams.presencePenalty;
      }

      if (modelConfig.capabilities.supportsStop && options.stop) {
        requestBody.stop = options.stop;
      }

      this.logParams({
        max_tokens: requestBody.max_tokens,
        temperature: requestBody.temperature,
        top_p: requestBody.top_p,
      });

      this.logRequest({
        model: this.config.modelName,
        messageCount: processedMessages.length
      });

      // Use universal AI proxy for credit checking
      const response = await fetch('/ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          provider: 'openai',
          ...requestBody,
          apiKey: this.config.apiKey
        }),
      });

      this.logResponse(response.status);

      if (!response.ok) {
        await this.handleApiError(response, 'API');
      }

      const data = await response.json();
      
      // Extract credit information if present and emit update
      await this.emitCreditUpdate(data.uterpi_credit_info);
      
      const content = data.choices[0]?.message?.content || "";
      this.logSuccess(content);
      return content;
    } catch (error) {
      console.error("OpenAI Service Error:", error);
      throw error;
    }
  }

  /**
   * Send a streaming chat completion request
   */
  async sendStreamingChatCompletion(
    messages: AzureAIMessage[],
    onChunk: (chunk: string) => void,
    options: ChatCompletionOptions = {}
  ): Promise<void> {
    try {
      // Convert to OpenAI format
      const openAIMessages = this.convertToOpenAIMessages(messages);
      
      // Get model-specific configuration and parameters
      const modelConfig = this.getModelConfig();
      
      // Use validated parameters
      const validatedParams = this.getValidatedParams(options);

      // Build request body
      const requestBody: Record<string, unknown> = {
        model: this.config.modelName,
        messages: openAIMessages,
        max_tokens: validatedParams.maxTokens,
        temperature: validatedParams.temperature,
        top_p: validatedParams.topP,
        stream: true,
      };

      // Add optional parameters
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
          provider: 'openai',
          ...requestBody,
          apiKey: this.config.apiKey
        }),
      });

      if (!response.ok) {
        await this.handleStreamError(response);
      }

      const reader = this.getStreamReader(response);
      await this.parseOpenAIStyleSSE(reader, onChunk);
    } catch (error) {
      console.error("OpenAI Streaming Service Error:", error);
      throw error;
    }
  }

  /**
   * Create OpenAI config from environment variables
   */
  static createFromEnv(): OpenAIConfig {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    const modelName = import.meta.env.VITE_OPENAI_MODEL_NAME || "gpt-4o-mini";
    const baseUrl = import.meta.env.VITE_OPENAI_BASE_URL;

    if (!apiKey) {
      throw new Error(
        "OpenAI configuration missing. Please set VITE_OPENAI_API_KEY environment variable."
      );
    }

    return { apiKey, modelName, baseUrl };
  }

  /**
   * Create OpenAI config with custom model
   */
  static createWithModel(modelName: string): OpenAIConfig {
    const config = this.createFromEnv();
    return { ...config, modelName };
  }
}

export default OpenAIService;
