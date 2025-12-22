// server/services/providers/azureProvider.ts
// Azure AI Provider

import type { Response } from "express";
import { AbstractAIProvider, type AIProviderOptions, type AIProviderResult } from "./baseProvider";
import { createAIClient, extractAzureAIError, retryWithBackoff } from "../aiService";
import { trackAIRequest } from "../aiMetricsService";
import { estimateTokenCount, countTokensFromMessages } from "../tokenService";
import { conversationService } from "../../conversation-service";
import { sanitizeAIResponseForStorage, detectConversationEchoPatterns } from "../../utils/ai-response-sanitizer";

/**
 * Azure AI Provider
 * Handles chat completions via Azure AI Inference API
 */
export class AzureProvider extends AbstractAIProvider {
  readonly name = 'azure';

  isAvailable(): boolean {
    return !!(process.env.VITE_AZURE_AI_ENDPOINT && process.env.VITE_AZURE_AI_API_KEY);
  }

  async chat(options: AIProviderOptions, res?: Response): Promise<AIProviderResult> {
    // Azure currently doesn't support streaming in this implementation
    return this.chatNonStreaming(options, res);
  }

  async chatStream(options: AIProviderOptions, res: Response): Promise<AIProviderResult> {
    // Fall back to non-streaming for Azure
    // TODO: Implement Azure streaming when needed
    return this.chatNonStreaming(options, res);
  }

  private async chatNonStreaming(options: AIProviderOptions, res?: Response): Promise<AIProviderResult> {
    const startTime = Date.now();
    const { client, config } = createAIClient('azure', options.userApiKey);
    const modelName = options.modelName || config.modelName;

    try {
      const response = await retryWithBackoff(async () => {
        return await client.path("/chat/completions").post({
          body: {
            messages: options.messages,
            max_tokens: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.7,
            top_p: options.topP ?? 1,
            model: modelName,
            stream: false,
          },
        });
      }, config.maxRetries, config.retryDelay);

      if (response.status !== "200") {
        const errorDetail = extractAzureAIError(response.body?.error || response.body);
        throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
      }

      const content = response.body.choices[0]?.message?.content || '';

      // Store AI response in conversation
      await this.storeResponse(options.conversation, content, modelName);

      // Calculate tokens
      const inputTokens = countTokensFromMessages(options.messages);
      const outputTokens = estimateTokenCount(content);

      if (res) {
        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop'
          }],
          usage: response.body.usage || {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens
          }
        });
      }

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/azure', true, responseTime);

      return {
        content,
        inputTokens,
        outputTokens,
        modelName
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/azure', false, responseTime, error.message);
      throw error;
    }
  }

  private async storeResponse(conversation: any, content: string, modelName: string): Promise<void> {
    if (!conversation || !content) return;

    const sanitizedContent = sanitizeAIResponseForStorage(content, { logChanges: true });

    const { hasEchoedHistory } = detectConversationEchoPatterns(content);
    if (hasEchoedHistory) {
      console.warn(`⚠️ [Azure] Detected echoed history in AI response for conversation ${conversation.id}`);
    }

    await conversationService.addMessage({
      conversationId: conversation.id,
      content: sanitizedContent,
      role: 'assistant',
      metadata: { model: modelName, provider: 'azure' }
    });
  }
}

export const azureProvider = new AzureProvider();

