import { OpenAIMessage, OpenAIConfig, AzureAIMessage, ChatCompletionOptions, LLMModel } from "../types";
import { getModelConfiguration, validateModelParameters } from "./modelConfigurations";

// Tool/Function definition types for LM Studio (OpenAI-compatible)
export interface LMStudioTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

export interface LMStudioToolChoice {
  type: "function";
  function: {
    name: string;
  };
}

// LM Studio uses an OpenAI-compatible API (proxied via /lmstudio by default)
export class LMStudioService {
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    // Ensure baseUrl is set to LM Studio default if not provided
    this.config = {
      ...config,
      // Default to backend proxy to avoid CORS/mixed-content issues
      baseUrl: config.baseUrl || "https://lmstudio.uterpi.com"
    };
  }

  updateModel(modelName: string): void {
    this.config.modelName = modelName;
  }

  getCurrentModel(): string {
    return this.config.modelName;
  }

  private estimateTokenCount(messages: OpenAIMessage[]): number {
    return messages.reduce((total, message) => {
      const contentTokens = Math.ceil(message.content.length / 4);
      return total + contentTokens + 10;
    }, 0);
  }

  private truncateConversationHistory(messages: OpenAIMessage[], maxTokens: number): OpenAIMessage[] {
    if (messages.length === 0) return messages;
    const systemMessage = messages[0];
    let remainingMessages = messages.slice(1);
    let totalTokens = this.estimateTokenCount([systemMessage]);
    const result = [systemMessage];
    for (let i = remainingMessages.length - 1; i >= 0; i--) {
      const messageTokens = this.estimateTokenCount([remainingMessages[i]]);
      if (totalTokens + messageTokens <= maxTokens) {
        totalTokens += messageTokens;
        result.splice(1, 0, remainingMessages[i]);
      } else {
        break;
      }
    }
    return result;
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

  private convertToOpenAIMessages(azureMessages: AzureAIMessage[]): OpenAIMessage[] {
    return azureMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  async sendChatCompletion(
    messages: AzureAIMessage[],
    options: ChatCompletionOptions & { tools?: LMStudioTool[]; toolChoice?: string | LMStudioToolChoice } = {}
  ): Promise<string> {
    const openAIMessages = this.convertToOpenAIMessages(messages);
    const modelConfig = getModelConfiguration(this.config.modelName);

    const estimatedTokens = this.estimateTokenCount(openAIMessages);
    const maxContextTokens = modelConfig.contextLength || 128000;
    const reserveTokensForResponse = options.maxTokens || 1024;

    let processedMessages = openAIMessages;
    if (estimatedTokens + reserveTokensForResponse > maxContextTokens) {
      processedMessages = this.truncateConversationHistory(openAIMessages, maxContextTokens - reserveTokensForResponse);
    }

    const validatedParams = validateModelParameters(this.config.modelName, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty
    });

    const requestBody: any = {
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
        ...requestBody
      })
    });

    if (!response.ok) {
      // Handle credit limit errors specially
      if (response.status === 402) {
        const errorData = await response.json();
        throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
      }
      
      const errorText = await response.text();
      console.error("LM Studio API error:", errorText);
      throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
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
    
    // Handle tool calls if present
    if (data.choices?.[0]?.message?.tool_calls) {
      console.log("Tool calls detected:", data.choices[0].message.tool_calls);
      // Return the tool calls as JSON string for processing
      return JSON.stringify(data.choices[0].message.tool_calls);
    }
    
    return data.choices?.[0]?.message?.content || "";
  }

  async sendStreamingChatCompletion(
    messages: AzureAIMessage[],
    onChunk: (chunk: string) => void,
    options: ChatCompletionOptions & { tools?: LMStudioTool[]; toolChoice?: string | LMStudioToolChoice } = {}
  ): Promise<void> {
    const openAIMessages = this.convertToOpenAIMessages(messages);
    const modelConfig = getModelConfiguration(this.config.modelName);
    const validatedParams = validateModelParameters(this.config.modelName, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty
    });

    const requestBody: any = {
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
        ...requestBody
      })
    });

    if (!response.ok) {
      // Handle credit limit errors specially
      if (response.status === 402) {
        const errorData = await response.json();
        throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
      }
      
      const errorText = await response.text();
      throw new Error(`LM Studio streaming error (${response.status}): ${errorText}`);
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
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
              const eventData = JSON.parse(data);
              for (const choice of eventData.choices || []) {
                const content = choice.delta?.content;
                if (content) onChunk(content);
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  static createFromEnv(): OpenAIConfig {
    const apiKey = import.meta.env.VITE_LMSTUDIO_API_KEY || "lm-studio";
    const modelName = import.meta.env.VITE_LMSTUDIO_MODEL_NAME || "nomadai-lcdu-v8";
    // Default to backend proxy path
    const baseUrl = import.meta.env.VITE_LMSTUDIO_BASE_URL || "https://lmstudio.uterpi.com";
    return { apiKey, modelName, baseUrl };
  }

  // Helper method to list available models from LM Studio
  async listModels(): Promise<any> {
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


