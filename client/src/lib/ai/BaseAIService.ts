// client/src/lib/ai/BaseAIService.ts
// Abstract base class for all AI service implementations

import { AzureAIMessage, ChatCompletionOptions } from "../../types";
import { getModelConfiguration, validateModelParameters } from "../modelConfigurations";
import { 
  BaseAIConfig, 
  IAIService, 
  ValidatedParams, 
  CreditInfo,
  OpenAIMessage,
  AIProviderType
} from "./types";
import { 
  parseOpenAIStyleSSE, 
  getStreamReader, 
  handleStreamError 
} from "./streamParsers";

/**
 * Abstract base class providing shared functionality for all AI services.
 * 
 * Subclasses must implement:
 * - sendChatCompletion(): Provider-specific API call
 * - sendStreamingChatCompletion(): Provider-specific streaming
 * - convertMessages(): Convert AzureAIMessage[] to provider format
 * 
 * Base class provides:
 * - Token estimation
 * - Conversation history truncation
 * - Credit update handling
 * - SSE stream parsing utilities
 * - Parameter validation
 * - Common model management
 */
export abstract class BaseAIService implements IAIService {
  protected config: BaseAIConfig;
  protected providerName: AIProviderType;

  constructor(config: BaseAIConfig, providerName: AIProviderType) {
    this.config = config;
    this.providerName = providerName;
  }

  // ============================================
  // Abstract methods - must be implemented by subclasses
  // ============================================

  /**
   * Send a non-streaming chat completion request
   */
  abstract sendChatCompletion(
    messages: AzureAIMessage[],
    options?: ChatCompletionOptions
  ): Promise<string>;

  /**
   * Send a streaming chat completion request
   */
  abstract sendStreamingChatCompletion(
    messages: AzureAIMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatCompletionOptions
  ): Promise<void>;

  // ============================================
  // Common model management
  // ============================================

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

  // ============================================
  // Token estimation and conversation management
  // ============================================

  /**
   * Estimate token count for a single text string
   * Uses rough approximation: ~4 characters per token
   * 
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  protected estimateTextTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate token count for OpenAI-style messages
   * Includes overhead for role and formatting (~10 tokens per message)
   * 
   * @param messages - Array of messages to estimate
   * @returns Total estimated token count
   */
  protected estimateTokenCount(messages: OpenAIMessage[]): number {
    return messages.reduce((total, message) => {
      const contentTokens = this.estimateTextTokens(message.content);
      // Add tokens for role and formatting overhead
      return total + contentTokens + 10;
    }, 0);
  }

  /**
   * Truncate conversation history while preserving system message and recent context
   * Works backwards from most recent messages to stay within token limit
   * 
   * @param messages - Full conversation history
   * @param maxTokens - Maximum tokens allowed
   * @param preserveSystemMessage - Whether to always keep the first (system) message
   * @returns Truncated message array
   */
  protected truncateConversationHistory(
    messages: OpenAIMessage[],
    maxTokens: number,
    preserveSystemMessage: boolean = true
  ): OpenAIMessage[] {
    if (messages.length === 0) return messages;
    
    // Always preserve the system message (first message) if requested
    const systemMessage = preserveSystemMessage ? messages[0] : null;
    const remainingMessages = preserveSystemMessage ? messages.slice(1) : messages;
    
    // Calculate tokens for system message
    let totalTokens = systemMessage ? this.estimateTokenCount([systemMessage]) : 0;
    
    // Add messages from most recent, working backwards
    const result: OpenAIMessage[] = systemMessage ? [systemMessage] : [];
    const insertIndex = systemMessage ? 1 : 0;
    
    for (let i = remainingMessages.length - 1; i >= 0; i--) {
      const messageTokens = this.estimateTokenCount([remainingMessages[i]]);
      if (totalTokens + messageTokens <= maxTokens) {
        totalTokens += messageTokens;
        result.splice(insertIndex, 0, remainingMessages[i]); // Insert after system message
      } else {
        console.log(`🔄 Truncated ${i + 1} older messages to stay within token limit`);
        break;
      }
    }
    
    return result;
  }

  // ============================================
  // Parameter validation
  // ============================================

  /**
   * Get model configuration and validate parameters
   * Uses the centralized model configuration system
   * 
   * @param options - Chat completion options
   * @returns Validated parameters within model limits
   */
  protected getValidatedParams(options: ChatCompletionOptions = {}): ValidatedParams {
    return validateModelParameters(this.config.modelName, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty
    });
  }

  /**
   * Get the model configuration for the current model
   */
  protected getModelConfig() {
    return getModelConfiguration(this.config.modelName);
  }

  // ============================================
  // Credit update handling
  // ============================================

  /**
   * Emit credit update event if credit info is present in response
   * Uses dynamic import to avoid circular dependencies
   * 
   * @param creditInfo - Credit information from API response
   */
  protected async emitCreditUpdate(creditInfo: CreditInfo | undefined): Promise<void> {
    if (creditInfo) {
      const { emitCreditUpdate } = await import('../../hooks/useCreditUpdates');
      emitCreditUpdate({
        creditsUsed: creditInfo.credits_used,
        remainingBalance: creditInfo.remaining_balance
      });
    }
  }

  // ============================================
  // Streaming utilities
  // ============================================

  /**
   * Parse OpenAI-style SSE stream (used by OpenAI, LMStudio, Azure)
   * Delegates to shared parser utility
   */
  protected parseOpenAIStyleSSE = parseOpenAIStyleSSE;

  /**
   * Get stream reader from response with error checking
   */
  protected getStreamReader = getStreamReader;

  /**
   * Handle streaming error responses
   */
  protected handleStreamError(response: Response): Promise<never> {
    return handleStreamError(response, this.getProviderDisplayName());
  }

  // ============================================
  // Error handling
  // ============================================

  /**
   * Get display name for the provider (for error messages)
   */
  protected getProviderDisplayName(): string {
    const displayNames: Record<AIProviderType, string> = {
      openai: 'OpenAI',
      gemini: 'Gemini',
      azure: 'Azure AI',
      lmstudio: 'LM Studio',
      huggingface: 'Hugging Face',
      uterpi: 'Uterpi AI'
    };
    return displayNames[this.providerName] || this.providerName;
  }

  /**
   * Handle non-OK API response
   * 
   * @param response - Fetch response
   * @param context - Additional context for error message
   */
  protected async handleApiError(
    response: Response,
    context: string = 'API call'
  ): Promise<never> {
    const providerName = this.getProviderDisplayName();
    
    // Handle credit limit errors specially
    if (response.status === 402) {
      const errorData = await response.json();
      throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
    }
    
    const errorData = await response.text();
    console.error(`❌ ${providerName} ${context} error details:`, errorData);
    throw new Error(`${providerName} ${context} error (${response.status}): ${errorData}`);
  }

  /**
   * Dispatch AI sources event if backend provided citations
   * 
   * @param sources - Array of source citations
   */
  protected dispatchSourcesEvent(sources: any[] | undefined): void {
    try {
      if (Array.isArray(sources) && sources.length > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ai-sources', { detail: sources }));
      }
    } catch {
      // Silently ignore errors
    }
  }

  // ============================================
  // Message conversion utilities
  // ============================================

  /**
   * Convert AzureAIMessage array to OpenAI message format
   * Simple pass-through since formats are compatible
   */
  protected convertToOpenAIMessages(azureMessages: AzureAIMessage[]): OpenAIMessage[] {
    return azureMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  // ============================================
  // Logging utilities
  // ============================================

  /**
   * Log request details for debugging
   */
  protected logRequest(details: Record<string, any>): void {
    console.log(`🔗 Sending ${this.getProviderDisplayName()} request:`, details);
  }

  /**
   * Log response details for debugging
   */
  protected logResponse(status: number): void {
    console.log(`📡 ${this.getProviderDisplayName()} response status:`, status);
  }

  /**
   * Log successful response
   */
  protected logSuccess(content: string): void {
    console.log(`✅ ${this.getProviderDisplayName()} response received:`, 
      content.substring(0, 100) + (content.length > 100 ? '...' : ''));
  }

  /**
   * Log parameter usage
   */
  protected logParams(params: Record<string, any>): void {
    const modelConfig = this.getModelConfig();
    console.log(`Using optimized parameters for ${modelConfig.name} (${modelConfig.provider}):`, params);
  }
}

