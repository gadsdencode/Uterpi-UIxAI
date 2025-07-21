import { GeminiContent, GeminiConfig, AzureAIMessage, ChatCompletionOptions, LLMModel, GeminiSystemInstruction } from "../types";
import { getModelConfiguration, validateModelParameters } from "./modelConfigurations";

export class GeminiService {
  private config: GeminiConfig;

  constructor(config: GeminiConfig) {
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
   * Estimate token count for contents (rough approximation)
   */
  private estimateTokenCount(contents: GeminiContent[]): number {
    return contents.reduce((total, content) => {
      const textContent = content.parts.reduce((partTotal, part) => {
        return partTotal + Math.ceil(part.text.length / 4);
      }, 0);
      return total + textContent + 10;
    }, 0);
  }

  /**
   * Truncate conversation history while preserving system message and recent context
   */
  private truncateConversationHistory(contents: GeminiContent[], maxTokens: number): GeminiContent[] {
    if (contents.length === 0) return contents;
    
    // Calculate tokens and add messages from most recent, working backwards
    let totalTokens = 0;
    const result: GeminiContent[] = [];
    
    for (let i = contents.length - 1; i >= 0; i--) {
      const contentTokens = this.estimateTokenCount([contents[i]]);
      if (totalTokens + contentTokens <= maxTokens) {
        totalTokens += contentTokens;
        result.unshift(contents[i]);
      } else {
        console.log(`🔄 Truncated ${i + 1} older messages to stay within token limit`);
        break;
      }
    }
    
    return result;
  }

  /**
   * Get available Gemini models
   */
  static getAvailableModels(): LLMModel[] {
    return [
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "Google",
        performance: 94,
        cost: 0.0002,
        latency: 500,
        contextLength: 1000000,
        description: "Latest multimodal model with next generation features",
        category: "multimodal",
        tier: "pro",
        isFavorite: true,
        capabilities: {
          supportsVision: true,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "Google",
        performance: 96,
        cost: 0.001,
        latency: 800,
        contextLength: 2000000,
        description: "Most powerful thinking model with complex reasoning",
        category: "reasoning",
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
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        provider: "Google",
        performance: 88,
        cost: 0.0001,
        latency: 400,
        contextLength: 1000000,
        description: "Fast and efficient multimodal model",
        category: "text",
        tier: "free",
        isFavorite: false,
        capabilities: {
          supportsVision: true,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      },
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        provider: "Google",
        performance: 92,
        cost: 0.0005,
        latency: 700,
        contextLength: 2000000,
        description: "Advanced multimodal model for complex tasks",
        category: "multimodal",
        tier: "pro",
        isFavorite: false,
        capabilities: {
          supportsVision: true,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      }
    ];
  }

  /**
   * Convert Azure AI messages to Gemini format
   */
  private convertToGeminiContents(azureMessages: AzureAIMessage[]): { contents: GeminiContent[], systemInstruction?: GeminiSystemInstruction } {
    const contents: GeminiContent[] = [];
    let systemInstruction: GeminiSystemInstruction | undefined;

    for (const msg of azureMessages) {
      if (msg.role === "system") {
        // System messages become system instruction
        systemInstruction = {
          parts: [{ text: msg.content }]
        };
      } else if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === "assistant") {
        contents.push({
          role: "model",
          parts: [{ text: msg.content }]
        });
      }
    }

    return { contents, systemInstruction };
  }

  /**
   * Send a single chat completion request
   */
  async sendChatCompletion(
    messages: AzureAIMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    try {
      // Convert to Gemini format
      const { contents, systemInstruction } = this.convertToGeminiContents(messages);
      
      // Get model-specific configuration and parameters
      const modelConfig = getModelConfiguration(this.config.modelName);
      
      // Estimate token count and truncate if necessary
      const estimatedTokens = this.estimateTokenCount(contents);
      const maxContextTokens = modelConfig.contextLength || 32000;
      const reserveTokensForResponse = options.maxTokens || 1024;
      
      console.log(`🔢 Token estimate: ${estimatedTokens}/${maxContextTokens} (reserving ${reserveTokensForResponse} for response)`);
      
      let processedContents = contents;
      if (estimatedTokens + reserveTokensForResponse > maxContextTokens) {
        console.warn(`⚠️ Approaching token limit, truncating conversation history`);
        processedContents = this.truncateConversationHistory(contents, maxContextTokens - reserveTokensForResponse);
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
        contents: processedContents,
        generationConfig: {
          maxOutputTokens: validatedParams.maxTokens,
          temperature: validatedParams.temperature,
          topP: validatedParams.topP,
        }
      };

      // Add system instruction if present
      if (systemInstruction) {
        requestBody.systemInstruction = systemInstruction;
      }

      // Add stop sequences if supported
      if (modelConfig.capabilities.supportsStop && options.stop) {
        requestBody.generationConfig.stopSequences = Array.isArray(options.stop) ? options.stop : [options.stop];
      }

      console.log(`Using optimized parameters for ${modelConfig.name} (${modelConfig.provider}):`, {
        maxOutputTokens: requestBody.generationConfig.maxOutputTokens,
        temperature: requestBody.generationConfig.temperature,
        topP: requestBody.generationConfig.topP,
      });

      console.log('🔗 Sending Gemini request:', {
        model: this.config.modelName,
        contentCount: processedContents.length
      });

      const baseUrl = this.config.baseUrl || 'https://generativelanguage.googleapis.com';
      const response = await fetch(`${baseUrl}/v1beta/models/${this.config.modelName}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📡 Gemini response status:', response.status);

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Gemini API error details:', errorData);
        throw new Error(`Gemini API error (${response.status}): ${errorData}`);
      }

      const data = await response.json();
      const content = data.candidates[0]?.content?.parts[0]?.text || "";
      console.log('✅ Gemini response received:', content.substring(0, 100) + '...');
      return content;
    } catch (error) {
      console.error("Gemini Service Error:", error);
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
      // Convert to Gemini format
      const { contents, systemInstruction } = this.convertToGeminiContents(messages);
      
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
        contents,
        generationConfig: {
          maxOutputTokens: validatedParams.maxTokens,
          temperature: validatedParams.temperature,
          topP: validatedParams.topP,
        }
      };

      // Add system instruction if present
      if (systemInstruction) {
        requestBody.systemInstruction = systemInstruction;
      }

      // Add stop sequences if supported
      if (modelConfig.capabilities.supportsStop && options.stop) {
        requestBody.generationConfig.stopSequences = Array.isArray(options.stop) ? options.stop : [options.stop];
      }

      const baseUrl = this.config.baseUrl || 'https://generativelanguage.googleapis.com';
      const response = await fetch(`${baseUrl}/v1beta/models/${this.config.modelName}:streamGenerateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Gemini streaming error:', errorData);
        throw new Error(`Gemini streaming error: ${errorData}`);
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

          // Process complete SSE events (Gemini uses same format as OpenAI)
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
                // Gemini response format is different - candidates[].content.parts[].text
                for (const candidate of eventData.candidates || []) {
                  const content = candidate.content?.parts?.[0]?.text;
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
      console.error("Gemini Streaming Service Error:", error);
      throw error;
    }
  }

  /**
   * Create Gemini config from environment variables
   */
  static createFromEnv(): GeminiConfig {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const modelName = import.meta.env.VITE_GEMINI_MODEL_NAME || "gemini-2.5-flash";
    const baseUrl = import.meta.env.VITE_GEMINI_BASE_URL;

    if (!apiKey) {
      throw new Error(
        "Gemini configuration missing. Please set VITE_GEMINI_API_KEY environment variable."
      );
    }

    return { apiKey, modelName, baseUrl };
  }

  /**
   * Create Gemini config with custom model
   */
  static createWithModel(modelName: string): GeminiConfig {
    const config = this.createFromEnv();
    return { ...config, modelName };
  }
}

export default GeminiService; 