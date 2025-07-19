import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { createSseStream } from "@azure/core-sse";
import { AzureAIMessage, AzureAIConfig, ChatCompletionOptions, LLMModel } from "../types";
import { getModelConfiguration, validateModelParameters, getOptimizedParameters } from "./modelConfigurations";

export class AzureAIService {
  private client: any; // ModelClient type issue - using any for now
  private config: AzureAIConfig;

  constructor(config: AzureAIConfig) {
    this.config = config;
    this.client = ModelClient(
      config.endpoint,
      new AzureKeyCredential(config.apiKey)
    );
  }

  /**
   * Update the model name for this service instance
   */
  updateModel(modelName: string): void {
    this.config.modelName = modelName;
  }

  /**
   * Get current model configuration
   */
  getCurrentModel(): string {
    return this.config.modelName;
  }

  /**
   * Estimate token count for messages (rough approximation)
   * This is a simplified estimation - in production, you'd use tiktoken or similar
   */
  private estimateTokenCount(messages: AzureAIMessage[]): number {
    return messages.reduce((total, message) => {
      // Rough estimation: 1 token ≈ 0.75 words, 1 word ≈ 1.3 tokens
      const contentTokens = Math.ceil(message.content.length / 4);
      // Add tokens for role and formatting
      return total + contentTokens + 10;
    }, 0);
  }

  /**
   * Truncate conversation history while preserving system message and recent context
   */
  private truncateConversationHistory(messages: AzureAIMessage[], maxTokens: number): AzureAIMessage[] {
    if (messages.length === 0) return messages;
    
    // Always preserve the system message (first message)
    const systemMessage = messages[0];
    let remainingMessages = messages.slice(1);
    
    // Calculate tokens for system message
    let totalTokens = this.estimateTokenCount([systemMessage]);
    
    // Add messages from most recent, working backwards
    const result = [systemMessage];
    for (let i = remainingMessages.length - 1; i >= 0; i--) {
      const messageTokens = this.estimateTokenCount([remainingMessages[i]]);
      if (totalTokens + messageTokens <= maxTokens) {
        totalTokens += messageTokens;
        result.splice(1, 0, remainingMessages[i]); // Insert after system message
      } else {
        console.log(`🔄 Truncated ${i + 1} older messages to stay within token limit`);
        break;
      }
    }
    
    return result;
  }

  /**
   * Get available Azure AI models
   * Note: This returns a curated list since Azure AI doesn't provide a direct models API
   */
  static getAvailableModels(): LLMModel[] {
    return [
      // Azure OpenAI Models
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "Azure OpenAI",
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
        provider: "Azure OpenAI",
        performance: 88,
        cost: 0.00015,
        latency: 600,
        contextLength: 128000,
        description: "Efficient and cost-effective GPT-4 model",
        category: "text",
        tier: "free",
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
        provider: "Azure OpenAI",
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
        provider: "Azure OpenAI",
        performance: 82,
        cost: 0.0015,
        latency: 500,
        contextLength: 16000,
        description: "Fast and efficient language model for general tasks",
        category: "text",
        tier: "free",
        isFavorite: false,
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      // Microsoft Models
      {
        id: "phi-4",
        name: "Phi-4",
        provider: "Microsoft",
        performance: 85,
        cost: 0.0005,
        latency: 400,
        contextLength: 16384,
        description: "Microsoft's efficient small language model",
        category: "text",
        tier: "free",
        isFavorite: false,
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      // Mistral Models
      {
        id: "ministral-3b",
        name: "Ministral 3B",
        provider: "Mistral AI",
        performance: 78,
        cost: 0.0001,
        latency: 300,
        contextLength: 131072,
        description: "Compact and efficient Mistral model",
        category: "text",
        tier: "free",
        isFavorite: false,
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      {
        id: "mistral-large-2411",
        name: "Mistral Large 2411",
        provider: "Mistral AI",
        performance: 92,
        cost: 0.008,
        latency: 900,
        contextLength: 128000,
        description: "Latest high-performance Mistral model",
        category: "reasoning",
        tier: "pro",
        isFavorite: false,
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      // Meta Models
      {
        id: "llama-3.3-70b-instruct",
        name: "Llama 3.3 70B Instruct",
        provider: "Meta",
        performance: 89,
        cost: 0.002,
        latency: 1200,
        contextLength: 128000,
        description: "Meta's latest instruction-tuned model",
        category: "text",
        tier: "free",
        isFavorite: false,
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      {
        id: "llama-3.2-11b-vision-instruct",
        name: "Llama 3.2 11B Vision",
        provider: "Meta",
        performance: 84,
        cost: 0.0008,
        latency: 800,
        contextLength: 128000,
        description: "Vision-capable Llama model for multimodal tasks",
        category: "multimodal",
        tier: "free",
        isFavorite: false,
        capabilities: {
          supportsVision: true,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      // Cohere Models
      {
        id: "cohere-command-r-plus",
        name: "Command R+",
        provider: "Cohere",
        performance: 87,
        cost: 0.003,
        latency: 700,
        contextLength: 131072,
        description: "Advanced command-following model from Cohere",
        category: "text",
        tier: "pro",
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
      // Get model-specific configuration and parameters
      const modelConfig = getModelConfiguration(this.config.modelName);
      
      // ESTIMATE TOKEN COUNT TO PREVENT CONTEXT OVERFLOW
      const estimatedTokens = this.estimateTokenCount(messages);
      const maxContextTokens = modelConfig.contextLength || 4096;
      const reserveTokensForResponse = options.maxTokens || 1024;
      
      console.log(`🔢 Token estimate: ${estimatedTokens}/${maxContextTokens} (reserving ${reserveTokensForResponse} for response)`);
      
      // If we're approaching the token limit, truncate older messages but keep system message
      let processedMessages = messages;
      if (estimatedTokens + reserveTokensForResponse > maxContextTokens) {
        console.warn(`⚠️ Approaching token limit (${estimatedTokens} + ${reserveTokensForResponse} > ${maxContextTokens}), truncating conversation history`);
        processedMessages = this.truncateConversationHistory(messages, maxContextTokens - reserveTokensForResponse);
      }
      
      // Use validated parameters based on the model's capabilities and limits
      const validatedParams = validateModelParameters(this.config.modelName, {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        frequencyPenalty: options.frequencyPenalty,
        presencePenalty: options.presencePenalty
      });

      // Build request body with only supported parameters
      const requestBody: any = {
        messages: processedMessages,
        max_tokens: validatedParams.maxTokens,
        temperature: validatedParams.temperature,
        top_p: validatedParams.topP,
        model: this.config.modelName,
        stream: false,
      };

      // Add optional parameters only if the model supports them
      if (modelConfig.capabilities.supportsFrequencyPenalty && validatedParams.frequencyPenalty !== undefined) {
        requestBody.frequency_penalty = validatedParams.frequencyPenalty;
      }
      
      if (modelConfig.capabilities.supportsPresencePenalty && validatedParams.presencePenalty !== undefined) {
        requestBody.presence_penalty = validatedParams.presencePenalty;
      }

      if (modelConfig.capabilities.supportsStop && options.stop) {
        requestBody.stop = options.stop;
      }

      if (modelConfig.capabilities.supportsLogitBias && options.logitBias) {
        requestBody.logit_bias = options.logitBias;
      }

      console.log(`Using optimized parameters for ${modelConfig.name} (${modelConfig.provider}):`, {
        max_tokens: requestBody.max_tokens,
        temperature: requestBody.temperature,
        top_p: requestBody.top_p,
        ...(requestBody.frequency_penalty !== undefined && { frequency_penalty: requestBody.frequency_penalty }),
        ...(requestBody.presence_penalty !== undefined && { presence_penalty: requestBody.presence_penalty })
      });

      console.log('🔗 Sending Azure AI request:', {
        endpoint: this.config.endpoint,
        model: this.config.modelName,
        messageCount: messages.length
      });

      // ADD DETAILED CONVERSATION LOGGING
      console.log('📝 Full conversation being sent to Azure AI:');
      messages.forEach((msg, index) => {
        console.log(`  [${index}] ${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
      });

      const response = await this.client.path("/chat/completions").post({
        body: requestBody,
      });

      console.log('📡 Azure AI response status:', response.status);

      if (response.status !== "200") {
        // Extract detailed error information
        const errorDetails = this.extractErrorDetails(response.body);
        console.error('❌ Azure AI API error details:', errorDetails);
        throw new Error(`Azure AI API error (${response.status}): ${errorDetails}`);
      }

      const content = response.body.choices[0]?.message?.content || "";
      console.log('✅ Azure AI response received:', content.substring(0, 100) + '...');
      return content;
    } catch (error) {
      console.error("Azure AI Service Error:", error);
      throw error;
    }
  }

  /**
   * Extract detailed error information from Azure AI response
   */
  private extractErrorDetails(errorBody: any): string {
    if (!errorBody) {
      return 'No error details available';
    }

    // Try different error formats that Azure AI might return
    if (typeof errorBody === 'string') {
      return errorBody;
    }

    if (errorBody.error) {
      if (typeof errorBody.error === 'string') {
        return errorBody.error;
      }
      
      if (errorBody.error.message) {
        return errorBody.error.message;
      }
      
      if (errorBody.error.code && errorBody.error.message) {
        return `${errorBody.error.code}: ${errorBody.error.message}`;
      }
    }

    if (errorBody.message) {
      return errorBody.message;
    }

    if (errorBody.detail) {
      return errorBody.detail;
    }

    // If all else fails, stringify the object safely
    try {
      return JSON.stringify(errorBody, null, 2);
    } catch {
      return 'Unable to parse error details';
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
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    
    try {
      // Get model-specific configuration and parameters
      const modelConfig = getModelConfiguration(this.config.modelName);
      
      // Use validated parameters based on the model's capabilities and limits
      const validatedParams = validateModelParameters(this.config.modelName, {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        frequencyPenalty: options.frequencyPenalty,
        presencePenalty: options.presencePenalty
      });

      // Build request body with only supported parameters
      const requestBody: any = {
        messages,
        max_tokens: validatedParams.maxTokens,
        temperature: validatedParams.temperature,
        top_p: validatedParams.topP,
        model: this.config.modelName,
        stream: true,
      };

      // Add optional parameters only if the model supports them
      if (modelConfig.capabilities.supportsFrequencyPenalty && validatedParams.frequencyPenalty !== undefined) {
        requestBody.frequency_penalty = validatedParams.frequencyPenalty;
      }
      
      if (modelConfig.capabilities.supportsPresencePenalty && validatedParams.presencePenalty !== undefined) {
        requestBody.presence_penalty = validatedParams.presencePenalty;
      }

      if (modelConfig.capabilities.supportsStop && options.stop) {
        requestBody.stop = options.stop;
      }

      if (modelConfig.capabilities.supportsLogitBias && options.logitBias) {
        requestBody.logit_bias = options.logitBias;
      }

      console.log(`Using optimized streaming parameters for ${modelConfig.name} (${modelConfig.provider}):`, {
        max_tokens: requestBody.max_tokens,
        temperature: requestBody.temperature,
        top_p: requestBody.top_p,
        ...(requestBody.frequency_penalty !== undefined && { frequency_penalty: requestBody.frequency_penalty }),
        ...(requestBody.presence_penalty !== undefined && { presence_penalty: requestBody.presence_penalty })
      });

      const response = await this.client.path("/chat/completions").post({
        body: requestBody,
      }).asBrowserStream();

      if (response.status !== "200") {
        // Try to read error details from stream response
        let errorDetails = `HTTP ${response.status}`;
        try {
          if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const { value } = await reader.read();
            if (value) {
              const errorText = decoder.decode(value);
              const errorObj = JSON.parse(errorText);
              errorDetails = this.extractErrorDetails(errorObj);
            }
          }
        } catch (parseError) {
          // If we can't parse the error, use the status code
          errorDetails = `Failed to get chat completions, HTTP ${response.status}`;
        }
        
        console.error('❌ Azure AI streaming error:', errorDetails);
        throw new Error(`Azure AI streaming error: ${errorDetails}`);
      }

      const stream = response.body;
      if (!stream) {
        throw new Error("The response stream is undefined");
      }

      // Use the browser's native ReadableStream API
      reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader!.read();
        
        if (done) {
          break;
        }

        // Decode the chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const eventData = JSON.parse(data);
              for (const choice of eventData.choices || []) {
                const content = choice.delta?.content;
                if (content) {
                  onChunk(content);
                }
              }
            } catch (parseError) {
              // Skip invalid JSON, continue processing
              console.warn("Failed to parse SSE event:", parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error("Azure AI Streaming Service Error:", error);
      throw error;
    } finally {
      // Always release the reader to avoid locked stream issues
      if (reader) {
        try {
          reader.releaseLock();
        } catch (releaseError) {
          console.warn("Error releasing stream reader:", releaseError);
        }
      }
    }
  }

  /**
   * Create Azure AI config from environment variables
   */
  static createFromEnv(): AzureAIConfig {
    const endpoint = import.meta.env.VITE_AZURE_AI_ENDPOINT;
    const apiKey = import.meta.env.VITE_AZURE_AI_API_KEY;
    const modelName = import.meta.env.VITE_AZURE_AI_MODEL_NAME || "Ministral-3B";

    if (!endpoint || !apiKey) {
      throw new Error(
        "Azure AI configuration missing. Please set VITE_AZURE_AI_ENDPOINT and VITE_AZURE_AI_API_KEY environment variables."
      );
    }

    return { endpoint, apiKey, modelName };
  }

  /**
   * Create Azure AI config with custom model
   */
  static createWithModel(modelName: string): AzureAIConfig {
    const config = this.createFromEnv();
    return { ...config, modelName };
  }
}

export default AzureAIService; 