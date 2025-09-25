import { OpenAIMessage, OpenAIConfig, AzureAIMessage, ChatCompletionOptions, LLMModel } from "../types";
import { getModelConfiguration, validateModelParameters } from "./modelConfigurations";

export class OpenAIService {
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
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
   */
  private estimateTokenCount(messages: OpenAIMessage[]): number {
    return messages.reduce((total, message) => {
      const contentTokens = Math.ceil(message.content.length / 4);
      return total + contentTokens + 10;
    }, 0);
  }

  /**
   * Truncate conversation history while preserving system message and recent context
   */
  private truncateConversationHistory(messages: OpenAIMessage[], maxTokens: number): OpenAIMessage[] {
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
        result.splice(1, 0, remainingMessages[i]);
      } else {
        console.log(`🔄 Truncated ${i + 1} older messages to stay within token limit`);
        break;
      }
    }
    
    return result;
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
   * Convert Azure AI messages to OpenAI format
   */
  private convertToOpenAIMessages(azureMessages: AzureAIMessage[]): OpenAIMessage[] {
    return azureMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
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
      const modelConfig = getModelConfiguration(this.config.modelName);
      
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
      const validatedParams = validateModelParameters(this.config.modelName, {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        frequencyPenalty: options.frequencyPenalty,
        presencePenalty: options.presencePenalty
      });

      // Build request body
      const requestBody: any = {
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

      console.log(`Using optimized parameters for ${modelConfig.name} (${modelConfig.provider}):`, {
        max_tokens: requestBody.max_tokens,
        temperature: requestBody.temperature,
        top_p: requestBody.top_p,
      });

      console.log('🔗 Sending OpenAI request:', {
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

      console.log('📡 OpenAI response status:', response.status);

      if (!response.ok) {
        // Handle credit limit errors specially
        if (response.status === 402) {
          const errorData = await response.json();
          throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
        }
        
        const errorData = await response.text();
        console.error('❌ OpenAI API error details:', errorData);
        throw new Error(`OpenAI API error (${response.status}): ${errorData}`);
      }

      const data = await response.json();
      
      // Extract credit information if present and emit update
      if (data.uterpi_credit_info) {
        const { emitCreditUpdate } = await import('../hooks/useCreditUpdates');
        emitCreditUpdate({
          creditsUsed: data.uterpi_credit_info.credits_used,
          remainingBalance: data.uterpi_credit_info.remaining_balance
        });
      }
      
      const content = data.choices[0]?.message?.content || "";
      console.log('✅ OpenAI response received:', content.substring(0, 100) + '...');
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
      const modelConfig = getModelConfiguration(this.config.modelName);
      
      // Use validated parameters
      const validatedParams = validateModelParameters(this.config.modelName, {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        frequencyPenalty: options.frequencyPenalty,
        presencePenalty: options.presencePenalty
      });

      // Build request body
      const requestBody: any = {
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
        // Handle credit limit errors specially
        if (response.status === 402) {
          const errorData = await response.json();
          throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
        }
        
        const errorData = await response.text();
        console.error('❌ OpenAI streaming error:', errorData);
        throw new Error(`OpenAI streaming error: ${errorData}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("The response stream is undefined");
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

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
                console.warn("Failed to parse SSE event:", parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
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