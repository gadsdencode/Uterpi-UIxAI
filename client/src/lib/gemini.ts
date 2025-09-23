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
        performance: 90,
        cost: 0.00015,
        latency: 400,
        contextLength: 1000000,
        description: "Fast multimodal model with 1M context",
        category: "multimodal",
        tier: "standard",
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

      // Gemini requires a minimum number of tokens to generate any response
      // Even for simple responses, it needs at least 50-100 tokens
      const minTokensForGemini = 50;
      if (validatedParams.maxTokens < minTokensForGemini) {
        console.warn(`⚠️ Gemini requires at least ${minTokensForGemini} tokens. Adjusting from ${validatedParams.maxTokens} to ${minTokensForGemini}`);
        validatedParams.maxTokens = minTokensForGemini;
      }

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
        contentCount: processedContents.length,
        hasSystemInstruction: !!systemInstruction,
        apiKeyPrefix: this.config.apiKey?.substring(0, 10) + '...'
      });

      // Use universal AI proxy for credit checking
      const response = await fetch('/ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          provider: 'gemini',
          model: this.config.modelName,
          messages: messages, // Convert back to Azure AI format for the proxy
          max_tokens: validatedParams.maxTokens,
          temperature: validatedParams.temperature,
          top_p: validatedParams.topP,
          stream: false
        }),
      });

      console.log('📡 Gemini response status:', response.status);

      if (!response.ok) {
        // Handle credit limit errors specially
        if (response.status === 402) {
          const errorData = await response.json();
          throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
        }
        
        const errorData = await response.text();
        console.error('❌ Gemini API error details:', errorData);
        
        // Handle specific error codes
        if (response.status === 403) {
          console.error('❌ Gemini API Key Error: Invalid or missing API key');
          throw new Error('Gemini API key is invalid or missing. Please check your API key in AI Provider Settings.');
        } else if (response.status === 404) {
          console.error('❌ Gemini Model Error: Model not found');
          throw new Error(`Gemini model "${this.config.modelName}" not found. Please check the model name.`);
        } else if (response.status === 400) {
          console.error('❌ Gemini Request Error: Bad request');
          throw new Error(`Invalid request to Gemini API: ${errorData}`);
        }
        
        throw new Error(`Gemini API error (${response.status}): ${errorData}`);
      }

      const data = await response.json();
      console.log('📡 Gemini API response structure:', {
        hasCandidates: !!data.candidates,
        candidatesLength: data.candidates?.length,
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        error: data.error
      });
      console.log('🔍 FULL RESPONSE DATA:', JSON.stringify(data, null, 2));
      
      // Check for error in response
      if (data.error) {
        console.error('❌ Gemini API returned error:', data.error);
        throw new Error(`Gemini API error: ${data.error.message || JSON.stringify(data.error)}`);
      }
      
      // Handle both Gemini format (candidates) and OpenAI format (choices)
      let candidate;
      if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
        // Native Gemini format
        candidate = data.candidates[0];
      } else if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
        // OpenAI-compatible format (from proxy)
        const choice = data.choices[0];
        candidate = {
          content: {
            parts: [{ text: choice.message?.content || '' }]
          },
          finishReason: choice.finish_reason || 'STOP'
        };
      } else {
        console.error('❌ Gemini API response missing candidates or choices:', data);
        throw new Error('Gemini API returned no response candidates or choices. Please check your API key and model.');
      }
      
      // Check if response was truncated due to token limit
      if (candidate.finishReason === 'MAX_TOKENS') {
        console.warn('⚠️ Gemini response truncated due to MAX_TOKENS limit');
        // Still try to get partial content if available
      }
      
      // Check for empty content
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        // If MAX_TOKENS and no content, it means we need more output tokens
        if (candidate.finishReason === 'MAX_TOKENS') {
          console.error('❌ Gemini hit token limit before generating any content. Increase maxTokens.');
          throw new Error('Gemini needs more output tokens. Please increase maxTokens in the request.');
        }
        console.error('❌ Gemini API response missing content:', candidate);
        throw new Error('Gemini API returned empty response content.');
      }
      
      // Extract content from parts array
      const content = candidate.content.parts[0]?.text || "";
      if (!content && candidate.finishReason === 'MAX_TOKENS') {
        console.error('❌ Gemini hit MAX_TOKENS limit with empty content');
        throw new Error('Gemini response was cut off. Please increase maxTokens to get a complete response.');
      } else if (!content) {
        console.warn('⚠️ Gemini API returned empty text content');
      }
      
      console.log('✅ Gemini response received:', content.substring(0, 100) + '...');
      console.log('🔍 Full Gemini response content:', content);
      console.log('🔍 Response length:', content.length);
      console.log('🔍 Response type:', typeof content);
      return content;
    } catch (error: any) {
      console.error("Gemini Service Error:", error);
      
      // Provide user-friendly error messages
      if (error.message?.includes('API key')) {
        throw new Error('Gemini API key issue. Please verify your API key in AI Provider Settings.');
      } else if (error.message?.includes('model')) {
        throw new Error('Gemini model issue. Please try a different model or check your settings.');
      }
      
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

      // Gemini requires a minimum number of tokens to generate any response
      const minTokensForGemini = 50;
      if (validatedParams.maxTokens < minTokensForGemini) {
        console.warn(`⚠️ Gemini streaming requires at least ${minTokensForGemini} tokens. Adjusting from ${validatedParams.maxTokens} to ${minTokensForGemini}`);
        validatedParams.maxTokens = minTokensForGemini;
      }

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

      // Use universal AI proxy for credit checking
      const response = await fetch('/ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          provider: 'gemini',
          model: this.config.modelName,
          messages: messages, // Convert back to Azure AI format for the proxy
          max_tokens: validatedParams.maxTokens,
          temperature: validatedParams.temperature,
          top_p: validatedParams.topP,
          stream: true
        }),
      });
      
      if (!response.ok) {
        // Handle credit limit errors specially
        if (response.status === 402) {
          const errorData = await response.json();
          throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
        }
        
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
      let accumulatedText = ''; // Track ALL text sent so far for the entire response

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            
            let jsonData = line;
            
            // Check if it's SSE format (with alt=sse parameter)
            if (line.startsWith('data: ')) {
              jsonData = line.slice(6).trim();
              if (jsonData === '[DONE]') {
                return;
              }
            }
            
            try {
              const data = JSON.parse(jsonData);
              
              // Extract text from Gemini streaming response
              if (data.candidates && data.candidates[0]) {
                const candidate = data.candidates[0];
                
                // Get the current text from this response
                const currentText = candidate.content?.parts?.[0]?.text || '';
                
                if (!currentText) continue;
                
                // Check if this chunk contains the accumulated text as a prefix
                // This means it's a cumulative update containing all previous text plus new
                if (currentText.startsWith(accumulatedText)) {
                  // Extract only the NEW characters after what we've already sent
                  const newText = currentText.substring(accumulatedText.length);
                  if (newText) {
                    onChunk(newText);
                    accumulatedText = currentText;
                  }
                } else if (accumulatedText.startsWith(currentText)) {
                  // This chunk is a subset of what we already have, skip it
                  continue;
                } else {
                  // This is completely new text (not a continuation of accumulated)
                  // Just send it as is
                  onChunk(currentText);
                  accumulatedText = accumulatedText + currentText;
                }
                
                // Check if response is complete
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                  if (candidate.finishReason === 'MAX_TOKENS') {
                    console.warn('⚠️ Gemini streaming hit token limit');
                  }
                }
              }
            } catch (e) {
              // Silently ignore parse errors for non-JSON lines
            }
          }
        }
        
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            if (data.candidates && data.candidates[0]) {
              const fullText = data.candidates[0].content?.parts?.[0]?.text || '';
              if (fullText && fullText.length > accumulatedText.length) {
                const newText = fullText.substring(accumulatedText.length);
                onChunk(newText);
              }
            }
          } catch (e) {
            // Ignore incomplete JSON at end
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