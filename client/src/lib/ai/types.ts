// client/src/lib/ai/types.ts
// Shared types for AI service implementations

import { AzureAIMessage, ChatCompletionOptions, LLMModel } from "../../types";

/**
 * Base configuration interface for all AI services
 */
export interface BaseAIConfig {
  apiKey: string;
  modelName: string;
  baseUrl?: string;
}

/**
 * Credit information returned from API responses
 */
export interface CreditInfo {
  credits_used: number;
  remaining_balance: number;
}

/**
 * Extended API response with credit info
 */
export interface AIResponseWithCredits {
  uterpi_credit_info?: CreditInfo;
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  sources?: any[];
  error?: { message?: string; code?: string };
}

/**
 * Validated parameters after model-specific validation
 */
export interface ValidatedParams {
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/**
 * SSE parsing result for streaming responses
 */
export interface SSEParseResult {
  content: string;
  done: boolean;
  error?: string;
}

/**
 * Interface defining the contract all AI services must implement
 */
export interface IAIService {
  /**
   * Send a non-streaming chat completion request
   */
  sendChatCompletion(
    messages: AzureAIMessage[],
    options?: ChatCompletionOptions
  ): Promise<string>;

  /**
   * Send a streaming chat completion request
   */
  sendStreamingChatCompletion(
    messages: AzureAIMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatCompletionOptions
  ): Promise<void>;

  /**
   * Update the model for this service instance
   */
  updateModel(modelName: string): void;

  /**
   * Get the current model name
   */
  getCurrentModel(): string;
}

/**
 * Static methods that AI service classes should implement
 */
export interface IAIServiceStatic {
  getAvailableModels(): LLMModel[];
  createFromEnv(): BaseAIConfig;
  createWithModel?(modelName: string): BaseAIConfig;
}

/**
 * Provider identifiers for AI services
 */
export type AIProviderType = 
  | 'openai' 
  | 'gemini' 
  | 'azure' 
  | 'lmstudio' 
  | 'huggingface' 
  | 'uterpi';

/**
 * Standard message format used across services
 * (Azure AI message format is the canonical internal format)
 */
export type StandardMessage = AzureAIMessage;

/**
 * OpenAI-compatible message format
 */
export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Gemini-specific content format
 */
export interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

/**
 * Gemini system instruction format
 */
export interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

