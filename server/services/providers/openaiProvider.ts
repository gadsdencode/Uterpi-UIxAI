// server/services/providers/openaiProvider.ts
// OpenAI Provider

import type { Response } from "express";
import { AbstractAIProvider, type AIProviderOptions, type AIProviderResult } from "./baseProvider";
import { createAIClient } from "../aiService";
import { trackAIRequest } from "../aiMetricsService";
import { estimateTokenCount, countTokensFromMessages } from "../tokenService";
import { conversationService } from "../../conversation-service";
import { sanitizeAIResponseForStorage, detectConversationEchoPatterns } from "../../utils/ai-response-sanitizer";

/**
 * OpenAI Provider
 * Handles chat completions via OpenAI API
 */
export class OpenAIProvider extends AbstractAIProvider {
  readonly name = 'openai';

  isAvailable(): boolean {
    return !!process.env.VITE_OPENAI_API_KEY;
  }

  async chat(options: AIProviderOptions, res?: Response): Promise<AIProviderResult> {
    if (options.stream && res) {
      return this.chatStream(options, res);
    }
    return this.chatNonStreaming(options, res);
  }

  async chatStream(options: AIProviderOptions, res: Response): Promise<AIProviderResult> {
    const startTime = Date.now();
    const { client, config } = createAIClient('openai', options.userApiKey);
    const modelName = options.modelName || config.modelName;

    try {
      this.setupStreamingHeaders(res);

      const streamResponse = await client.chat.completions.create({
        model: modelName,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        top_p: options.topP ?? 1,
        stream: true,
      });

      let fullContent = '';
      for await (const chunk of streamResponse) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullContent += content;
        this.writeStreamChunk(res, chunk);
      }
      this.endStream(res);

      // Store AI response in conversation
      await this.storeResponse(options.conversation, fullContent, modelName);

      // Calculate tokens
      const inputTokens = countTokensFromMessages(options.messages);
      const outputTokens = estimateTokenCount(fullContent);

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/openai', true, responseTime);

      return {
        content: fullContent,
        inputTokens,
        outputTokens,
        modelName
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/openai', false, responseTime, error.message);
      throw error;
    }
  }

  private async chatNonStreaming(options: AIProviderOptions, res?: Response): Promise<AIProviderResult> {
    const startTime = Date.now();
    const { client, config } = createAIClient('openai', options.userApiKey);
    const modelName = options.modelName || config.modelName;

    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        top_p: options.topP ?? 1,
        stream: false,
      });

      const content = response.choices[0]?.message?.content || '';

      // Store AI response in conversation
      await this.storeResponse(options.conversation, content, modelName);

      // Calculate tokens
      const inputTokens = countTokensFromMessages(options.messages);
      const outputTokens = estimateTokenCount(content);

      if (res) {
        res.json(response);
      }

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/openai', true, responseTime);

      return {
        content,
        inputTokens,
        outputTokens,
        modelName
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/openai', false, responseTime, error.message);
      throw error;
    }
  }

  private async storeResponse(conversation: any, content: string, modelName: string): Promise<void> {
    if (!conversation || !content) return;

    const sanitizedContent = sanitizeAIResponseForStorage(content, { logChanges: true });

    const { hasEchoedHistory } = detectConversationEchoPatterns(content);
    if (hasEchoedHistory) {
      console.warn(`⚠️ [OpenAI] Detected echoed history in AI response for conversation ${conversation.id}`);
    }

    await conversationService.addMessage({
      conversationId: conversation.id,
      content: sanitizedContent,
      role: 'assistant',
      metadata: { model: modelName, provider: 'openai' }
    });
  }
}

export const openaiProvider = new OpenAIProvider();

