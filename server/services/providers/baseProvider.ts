// server/services/providers/baseProvider.ts
// Base AI Provider Interface and Types

import type { Response } from "express";

/**
 * Options for AI chat operations
 */
export interface AIProviderOptions {
  messages: any[];
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  conversation?: any;
  userId: number;
  userApiKey?: string;
}

/**
 * Result from AI chat operations
 */
export interface AIProviderResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  modelName: string;
}

/**
 * Callback for handling streaming chunks
 */
export type StreamChunkCallback = (chunk: string) => void;

/**
 * Base interface for all AI providers
 * Implements the Strategy pattern for provider-specific chat logic
 */
export interface BaseAIProvider {
  /**
   * Provider identifier
   */
  readonly name: string;

  /**
   * Execute chat completion
   * @param options Chat options including messages, model, etc.
   * @param res Express response for streaming (optional)
   * @returns Promise resolving to chat result
   */
  chat(options: AIProviderOptions, res?: Response): Promise<AIProviderResult>;

  /**
   * Execute streaming chat completion
   * @param options Chat options including messages, model, etc.
   * @param res Express response for streaming
   */
  chatStream(options: AIProviderOptions, res: Response): Promise<AIProviderResult>;

  /**
   * Check if provider is available/configured
   */
  isAvailable(): boolean;
}

/**
 * Abstract base class providing common functionality for providers
 */
export abstract class AbstractAIProvider implements BaseAIProvider {
  abstract readonly name: string;

  abstract chat(options: AIProviderOptions, res?: Response): Promise<AIProviderResult>;
  abstract chatStream(options: AIProviderOptions, res: Response): Promise<AIProviderResult>;
  abstract isAvailable(): boolean;

  /**
   * Set up SSE headers for streaming responses
   */
  protected setupStreamingHeaders(res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  }

  /**
   * Write streaming chunk in SSE format
   */
  protected writeStreamChunk(res: Response, data: any): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * End streaming response
   */
  protected endStream(res: Response): void {
    res.write('data: [DONE]\n\n');
    res.end();
  }

  /**
   * Create OpenAI-compatible chunk format
   */
  protected createStreamChunk(content: string, modelName: string, isLast: boolean = false): any {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [{
        index: 0,
        delta: isLast ? {} : { content },
        finish_reason: isLast ? 'stop' : null
      }]
    };
  }

  /**
   * Create OpenAI-compatible response format
   */
  protected createChatResponse(
    content: string,
    modelName: string,
    inputTokens: number,
    outputTokens: number
  ): any {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    };
  }
}

