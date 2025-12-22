// server/services/providers/geminiProvider.ts
// Google Gemini AI Provider

import type { Response } from "express";
import { AbstractAIProvider, type AIProviderOptions, type AIProviderResult } from "./baseProvider";
import { createAIClient } from "../aiService";
import { trackAIRequest } from "../aiMetricsService";
import { estimateTokenCount, countTokensFromMessages } from "../tokenService";
import { conversationService } from "../../conversation-service";
import { sanitizeAIResponseForStorage, detectConversationEchoPatterns } from "../../utils/ai-response-sanitizer";

/**
 * Google Gemini AI Provider
 * Handles chat completions via Google Generative AI API
 */
export class GeminiProvider extends AbstractAIProvider {
  readonly name = 'gemini';

  isAvailable(): boolean {
    return !!process.env.VITE_GEMINI_API_KEY;
  }

  async chat(options: AIProviderOptions, res?: Response): Promise<AIProviderResult> {
    if (options.stream && res) {
      return this.chatStream(options, res);
    }
    return this.chatNonStreaming(options, res);
  }

  async chatStream(options: AIProviderOptions, res: Response): Promise<AIProviderResult> {
    const startTime = Date.now();
    const { client, config } = createAIClient('gemini', options.userApiKey);
    const modelName = options.modelName || config.modelName;

    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 2048,
        }
      });

      // Convert messages to Gemini format
      const { systemMessage, userPrompt, history } = this.prepareMessages(options.messages);
      const chat = model.startChat({ history });

      this.setupStreamingHeaders(res);

      const result = await chat.sendMessageStream(userPrompt);
      let fullContent = '';

      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullContent += text;

        const openAIChunk = this.createStreamChunk(text, modelName);
        this.writeStreamChunk(res, openAIChunk);
      }

      this.endStream(res);

      // Store AI response in conversation
      await this.storeResponse(options.conversation, fullContent, modelName);

      // Calculate tokens
      const inputTokens = countTokensFromMessages(options.messages);
      const outputTokens = estimateTokenCount(fullContent);

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/gemini', true, responseTime);

      return {
        content: fullContent,
        inputTokens,
        outputTokens,
        modelName
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/gemini', false, responseTime, error.message);
      throw error;
    }
  }

  private async chatNonStreaming(options: AIProviderOptions, res?: Response): Promise<AIProviderResult> {
    const startTime = Date.now();
    const { client, config } = createAIClient('gemini', options.userApiKey);
    const modelName = options.modelName || config.modelName;

    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 2048,
        }
      });

      // Convert messages to Gemini format
      const { userPrompt, history } = this.prepareMessages(options.messages);
      const chat = model.startChat({ history });

      const result = await chat.sendMessage(userPrompt);
      const response = await result.response;
      const content = response.text();

      // Store AI response in conversation
      await this.storeResponse(options.conversation, content, modelName);

      // Calculate tokens
      const inputTokens = countTokensFromMessages(options.messages);
      const outputTokens = estimateTokenCount(content);

      if (res) {
        res.json(this.createChatResponse(content, modelName, inputTokens, outputTokens));
      }

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/gemini', true, responseTime);

      return {
        content,
        inputTokens,
        outputTokens,
        modelName
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/gemini', false, responseTime, error.message);
      throw error;
    }
  }

  /**
   * Convert OpenAI-style messages to Gemini format
   */
  private prepareMessages(messages: any[]): {
    systemMessage: string;
    userPrompt: string;
    history: any[];
  } {
    const systemMessage = messages.find((m: any) => m.role === 'system')?.content || '';
    const chatMessages = messages.filter((m: any) => m.role !== 'system');

    const history = chatMessages.slice(0, -1).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const lastMessage = chatMessages[chatMessages.length - 1];
    const userPrompt = systemMessage
      ? `${systemMessage}\n\n${lastMessage.content}`
      : lastMessage.content;

    return { systemMessage, userPrompt, history };
  }

  private async storeResponse(conversation: any, content: string, modelName: string): Promise<void> {
    if (!conversation || !content) return;

    const sanitizedContent = sanitizeAIResponseForStorage(content, { logChanges: true });

    const { hasEchoedHistory } = detectConversationEchoPatterns(content);
    if (hasEchoedHistory) {
      console.warn(`⚠️ [Gemini] Detected echoed history in AI response for conversation ${conversation.id}`);
    }

    await conversationService.addMessage({
      conversationId: conversation.id,
      content: sanitizedContent,
      role: 'assistant',
      metadata: { model: modelName, provider: 'gemini' }
    });
  }
}

export const geminiProvider = new GeminiProvider();

