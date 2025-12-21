// AI Controller - Handles AI-related routes
// LM Studio proxy, chat completions, metrics, and AI generation endpoints

import type { Request, Response } from "express";
import { aiService, createAIClient, createAzureAIClient, extractAzureAIError, parseAzureAIJSON, retryWithBackoff } from "../services/aiService";
import { aiMetricsService, trackAIRequest } from "../services/aiMetricsService";
import { aiCacheService, getCacheKey, getCachedResponse, setCachedResponse } from "../services/aiCacheService";
import { tokenService, estimateTokenCount, countTokensFromMessages, deductCreditsAfterResponse } from "../services/tokenService";
import { 
  uiGenerationService, 
  generateUICodeWithAI, 
  generatePageWithAI, 
  generatePageFilesWithAI 
} from "../services/uiGenerationService";
import { storage } from "../storage";
import { conversationService } from "../conversation-service";
import { contextEnhancer } from "../context-enhancer";
import { isVectorizationEnabled } from "../vector-flags";
import { trackAIUsage } from "../stripe-consolidated";
import type { AuthenticatedRequest } from "../types/ai";

// Rate limiting for health checks
const healthCheckRateLimit = new Map<string, { count: number; resetTime: number }>();
const HEALTH_CHECK_LIMIT = 2;
const HEALTH_CHECK_WINDOW = 60000;

/**
 * AI Controller - Handles all AI-related routes
 */
export class AIController {

  /**
   * Proxy request to LM Studio
   */
  async proxyLMStudioRequest(req: Request, res: Response, path: string): Promise<void> {
    const startTime = Date.now();
    let success = false;
    
    try {
      const baseInfo = aiService.getLMStudioBaseUrl();
      const targetUrl = `${baseInfo.url}${path}`;
      
      console.log(`🔄 Proxying to LM Studio: ${targetUrl} (${baseInfo.isProduction ? 'production' : 'development'})`);
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": req.body.stream ? "text/event-stream" : "application/json",
      };
      
      const apiKey = process.env.LMSTUDIO_API_KEY || "lm-studio";
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      // Sanitize body
      const sanitizedBody = { ...req.body };
      delete sanitizedBody.provider;
      delete sanitizedBody.userApiKey;
      delete sanitizedBody.sessionId;
      delete sanitizedBody.enableContext;
      delete sanitizedBody.original_messages;
      
      // Set default model if not provided
      if (!sanitizedBody.model) {
        sanitizedBody.model = "nomadic-icdu-v8";
      }

      const fetchResponse = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ["POST", "PUT", "PATCH"].includes(req.method) ? JSON.stringify(sanitizedBody) : undefined,
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`LM Studio error (${fetchResponse.status}): ${errorText}`);
      }

      // Handle streaming responses
      if (req.body.stream && fetchResponse.body) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        const reader = fetchResponse.body.getReader();
        const decoder = new TextDecoder();

        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            success = true;
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
          return pump();
        };

        await pump();
      } else {
        const data = await fetchResponse.json();
        success = true;
        res.json(data);
      }
    } catch (error: any) {
      console.error("LM Studio proxy error:", error);
      res.status(500).json({
        error: "LM Studio proxy error",
        message: error.message,
        details: "Failed to communicate with LM Studio server"
      });
    } finally {
      const responseTime = Date.now() - startTime;
      trackAIRequest(path, success, responseTime, success ? undefined : 'proxy_error');
    }
  }

  /**
   * LM Studio chat completions
   */
  async lmStudioChatCompletions(req: Request, res: Response): Promise<void> {
    await this.proxyLMStudioRequest(req, res, "/v1/chat/completions");
  }

  /**
   * LM Studio text completions
   */
  async lmStudioCompletions(req: Request, res: Response): Promise<void> {
    await this.proxyLMStudioRequest(req, res, "/v1/completions");
  }

  /**
   * LM Studio embeddings
   */
  async lmStudioEmbeddings(req: Request, res: Response): Promise<void> {
    await this.proxyLMStudioRequest(req, res, "/v1/embeddings");
  }

  /**
   * LM Studio models list
   */
  async lmStudioModels(req: Request, res: Response): Promise<void> {
    await this.proxyLMStudioRequest(req, res, "/v1/models");
  }

  /**
   * Universal AI chat completions endpoint
   */
  async chatCompletions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const startTime = Date.now();
    
    // Check if health check (ping)
    const body: any = req.body || {};
    const messages = body.original_messages || body.messages || [];
    const isHealthCheck = messages.length === 1 && 
                         messages[0]?.content?.toLowerCase() === 'ping' && 
                         messages[0]?.role === 'user';

    if (isHealthCheck) {
      const healthCheckResult = this.handleHealthCheckRateLimit(req.user?.id);
      if (!healthCheckResult.allowed) {
        res.status(429).json({ 
          error: 'Health check rate limit exceeded. Please wait before checking again.',
          retryAfter: healthCheckResult.retryAfter
        });
        return;
      }
    }

    console.log('🚀 Chat endpoint called for user:', req.user?.id, isHealthCheck ? '(health check)' : '');
    
    try {
      const { 
        provider, 
        messages: msgArray, 
        model, 
        max_tokens, 
        temperature, 
        top_p, 
        stream, 
        sessionId, 
        enableContext = true, 
        original_messages,
        ...otherParams 
      } = req.body;
      
      if (!provider) {
        res.status(400).json({ error: 'Provider is required' });
        return;
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      const userId = req.user!.id;
      let modelName = model || "nomadic-icdu-v8";
      let response;
      let conversation;
      let userMessage;
      let aiResponse;
      let enhancedMessages = msgArray;
      const rawMessages = original_messages || msgArray;

      // Vectorization pipeline integration
      try {
        conversation = await conversationService.getOrCreateConversation(
          userId, 
          provider.toLowerCase(), 
          modelName, 
          sessionId
        );

        console.log(`💬 Using conversation ${conversation.id} for user ${userId}`);

        const lastMessage = rawMessages[rawMessages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          userMessage = await conversationService.addMessage({
            conversationId: conversation.id,
            content: lastMessage.content,
            role: 'user',
            attachments: lastMessage.attachments,
          });
        }

        // Context enhancement
        const effectiveEnableContext = isVectorizationEnabled() ? enableContext : false;
        if (effectiveEnableContext && !isHealthCheck) {
          try {
            const enhanced = await contextEnhancer.enhanceMessagesWithContext(
              rawMessages,
              userId,
              { 
                maxSimilarMessages: 3, 
                maxSimilarConversations: 2, 
                similarityThreshold: 0.75, 
                includeConversationContext: true, 
                includeMessageContext: true, 
                maxContextLength: 2000 
              }
            );
            enhancedMessages = enhanced.enhancedMessages;
            console.log(`🔍 Context enhancement: ${rawMessages.length} → ${enhancedMessages.length} messages`);
          } catch (contextError) {
            console.warn('⚠️ Context enhancement failed, using original messages:', contextError);
            enhancedMessages = rawMessages;
          }
        }
      } catch (convError) {
        console.warn('⚠️ Conversation pipeline error, continuing without:', convError);
      }

      // Provider routing
      const providerLower = provider.toLowerCase();
      
      if (providerLower === 'lmstudio' || providerLower === 'uterpi') {
        await this.handleLMStudioChat(req, res, enhancedMessages, modelName, temperature, max_tokens, top_p, stream, conversation, userId, startTime);
      } else if (providerLower === 'gemini') {
        await this.handleGeminiChat(req, res, enhancedMessages, modelName, temperature, max_tokens, stream, conversation, userId, startTime);
      } else if (providerLower === 'openai') {
        await this.handleOpenAIChat(req, res, enhancedMessages, modelName, temperature, max_tokens, top_p, stream, conversation, userId, startTime);
      } else if (providerLower === 'azure' || providerLower === 'azureai') {
        await this.handleAzureChat(req, res, enhancedMessages, modelName, temperature, max_tokens, top_p, stream, conversation, userId, startTime);
      } else {
        res.status(400).json({ error: `Unsupported provider: ${provider}` });
      }

    } catch (error: any) {
      console.error("Chat completions error:", error);
      res.status(500).json({
        error: "Chat completion failed",
        message: error.message
      });
    }
  }

  /**
   * Handle health check rate limiting
   */
  private handleHealthCheckRateLimit(userId: number | undefined): { allowed: boolean; retryAfter?: number } {
    if (!userId) {
      return { allowed: false };
    }

    const now = Date.now();
    const userIdStr = String(userId);
    const userLimit = healthCheckRateLimit.get(userIdStr);

    if (userLimit) {
      if (now > userLimit.resetTime) {
        healthCheckRateLimit.set(userIdStr, { count: 1, resetTime: now + HEALTH_CHECK_WINDOW });
        return { allowed: true };
      } else if (userLimit.count >= HEALTH_CHECK_LIMIT) {
        console.log(`⚠️ Health check rate limit exceeded for user ${userId}`);
        return { allowed: false, retryAfter: Math.ceil((userLimit.resetTime - now) / 1000) };
      } else {
        userLimit.count++;
        return { allowed: true };
      }
    } else {
      healthCheckRateLimit.set(userIdStr, { count: 1, resetTime: now + HEALTH_CHECK_WINDOW });
      return { allowed: true };
    }
  }

  /**
   * Handle LM Studio chat
   */
  private async handleLMStudioChat(
    req: AuthenticatedRequest,
    res: Response,
    messages: any[],
    modelName: string,
    temperature: number,
    max_tokens: number,
    top_p: number,
    stream: boolean,
    conversation: any,
    userId: number,
    startTime: number
  ): Promise<void> {
    const { client, config } = createAIClient('lmstudio');
    
    try {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const streamResponse = await client.chat.completions.create({
          model: modelName || config.modelName,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 2048,
          top_p: top_p ?? 1,
          stream: true,
        });

        let fullContent = '';
        for await (const chunk of streamResponse) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullContent += content;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();

        // Store AI response
        if (conversation && fullContent) {
          await conversationService.addMessage({
            conversationId: conversation.id,
            content: fullContent,
            role: 'assistant',
            metadata: { model: modelName, provider: 'lmstudio' }
          });
        }

        // Deduct credits
        const inputTokens = countTokensFromMessages(messages);
        const outputTokens = estimateTokenCount(fullContent);
        await deductCreditsAfterResponse(req, inputTokens, outputTokens, modelName);

      } else {
        const response = await client.chat.completions.create({
          model: modelName || config.modelName,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 2048,
          top_p: top_p ?? 1,
          stream: false,
        });

        const content = response.choices[0]?.message?.content || '';
        
        if (conversation && content) {
          await conversationService.addMessage({
            conversationId: conversation.id,
            content,
            role: 'assistant',
            metadata: { model: modelName, provider: 'lmstudio' }
          });
        }

        const inputTokens = countTokensFromMessages(messages);
        const outputTokens = estimateTokenCount(content);
        await deductCreditsAfterResponse(req, inputTokens, outputTokens, modelName);

        res.json(response);
      }

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/lmstudio', true, responseTime);
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/lmstudio', false, responseTime, error.message);
      throw error;
    }
  }

  /**
   * Handle Gemini chat
   */
  private async handleGeminiChat(
    req: AuthenticatedRequest,
    res: Response,
    messages: any[],
    modelName: string,
    temperature: number,
    max_tokens: number,
    stream: boolean,
    conversation: any,
    userId: number,
    startTime: number
  ): Promise<void> {
    const { client, config } = createAIClient('gemini');
    
    try {
      const model = client.getGenerativeModel({ 
        model: modelName || config.modelName,
        generationConfig: {
          temperature: temperature ?? 0.7,
          maxOutputTokens: max_tokens ?? 2048,
        }
      });

      const systemMessage = messages.find((m: any) => m.role === 'system')?.content || '';
      const chatMessages = messages.filter((m: any) => m.role !== 'system');
      
      const history = chatMessages.slice(0, -1).map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const lastMessage = chatMessages[chatMessages.length - 1];
      const chat = model.startChat({ history });

      const userPrompt = systemMessage 
        ? `${systemMessage}\n\n${lastMessage.content}` 
        : lastMessage.content;

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const result = await chat.sendMessageStream(userPrompt);
        let fullContent = '';
        
        for await (const chunk of result.stream) {
          const text = chunk.text();
          fullContent += text;
          
          const openAIChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelName || config.modelName,
            choices: [{
              index: 0,
              delta: { content: text },
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
        }
        
        res.write('data: [DONE]\n\n');
        res.end();

        if (conversation && fullContent) {
          await conversationService.addMessage({
            conversationId: conversation.id,
            content: fullContent,
            role: 'assistant',
            metadata: { model: modelName, provider: 'gemini' }
          });
        }

        const inputTokens = countTokensFromMessages(messages);
        const outputTokens = estimateTokenCount(fullContent);
        await deductCreditsAfterResponse(req, inputTokens, outputTokens, modelName);
      } else {
        const result = await chat.sendMessage(userPrompt);
        const response = await result.response;
        const content = response.text();

        if (conversation && content) {
          await conversationService.addMessage({
            conversationId: conversation.id,
            content,
            role: 'assistant',
            metadata: { model: modelName, provider: 'gemini' }
          });
        }

        const inputTokens = countTokensFromMessages(messages);
        const outputTokens = estimateTokenCount(content);
        await deductCreditsAfterResponse(req, inputTokens, outputTokens, modelName);

        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelName || config.modelName,
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
        });
      }

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/gemini', true, responseTime);
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/gemini', false, responseTime, error.message);
      throw error;
    }
  }

  /**
   * Handle OpenAI chat
   */
  private async handleOpenAIChat(
    req: AuthenticatedRequest,
    res: Response,
    messages: any[],
    modelName: string,
    temperature: number,
    max_tokens: number,
    top_p: number,
    stream: boolean,
    conversation: any,
    userId: number,
    startTime: number
  ): Promise<void> {
    const { client, config } = createAIClient('openai');
    
    try {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const streamResponse = await client.chat.completions.create({
          model: modelName || config.modelName,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 2048,
          top_p: top_p ?? 1,
          stream: true,
        });

        let fullContent = '';
        for await (const chunk of streamResponse) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullContent += content;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();

        if (conversation && fullContent) {
          await conversationService.addMessage({
            conversationId: conversation.id,
            content: fullContent,
            role: 'assistant',
            metadata: { model: modelName, provider: 'openai' }
          });
        }

        const inputTokens = countTokensFromMessages(messages);
        const outputTokens = estimateTokenCount(fullContent);
        await deductCreditsAfterResponse(req, inputTokens, outputTokens, modelName);
      } else {
        const response = await client.chat.completions.create({
          model: modelName || config.modelName,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 2048,
          top_p: top_p ?? 1,
          stream: false,
        });

        const content = response.choices[0]?.message?.content || '';
        
        if (conversation && content) {
          await conversationService.addMessage({
            conversationId: conversation.id,
            content,
            role: 'assistant',
            metadata: { model: modelName, provider: 'openai' }
          });
        }

        const inputTokens = countTokensFromMessages(messages);
        const outputTokens = estimateTokenCount(content);
        await deductCreditsAfterResponse(req, inputTokens, outputTokens, modelName);

        res.json(response);
      }

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/openai', true, responseTime);
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/openai', false, responseTime, error.message);
      throw error;
    }
  }

  /**
   * Handle Azure AI chat
   */
  private async handleAzureChat(
    req: AuthenticatedRequest,
    res: Response,
    messages: any[],
    modelName: string,
    temperature: number,
    max_tokens: number,
    top_p: number,
    stream: boolean,
    conversation: any,
    userId: number,
    startTime: number
  ): Promise<void> {
    const { client, config } = createAIClient('azure');
    
    try {
      const response = await retryWithBackoff(async () => {
        return await client.path("/chat/completions").post({
          body: {
            messages,
            max_tokens: max_tokens ?? 2048,
            temperature: temperature ?? 0.7,
            top_p: top_p ?? 1,
            model: modelName || config.modelName,
            stream: false,
          },
        });
      }, config.maxRetries, config.retryDelay);

      if (response.status !== "200") {
        const errorDetail = extractAzureAIError(response.body?.error || response.body);
        throw new Error(`Azure AI API error (${response.status}): ${errorDetail}`);
      }

      const content = response.body.choices[0]?.message?.content || '';

      if (conversation && content) {
        await conversationService.addMessage({
          conversationId: conversation.id,
          content,
          role: 'assistant',
          metadata: { model: modelName, provider: 'azure' }
        });
      }

      const inputTokens = countTokensFromMessages(messages);
      const outputTokens = estimateTokenCount(content);
      await deductCreditsAfterResponse(req, inputTokens, outputTokens, modelName);

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName || config.modelName,
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

      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/azure', true, responseTime);
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      trackAIRequest('/ai/chat/azure', false, responseTime, error.message);
      throw error;
    }
  }

  /**
   * Get AI metrics
   */
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const summary = aiMetricsService.getMetricsSummary();
      const cacheStats = aiCacheService.getStats();

      res.json({
        success: true,
        metrics: {
          ...summary,
          cache: cacheStats
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error getting AI metrics:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Generate AI templates
   */
  async generateTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { prompt, provider = 'gemini', count = 3 } = req.body;
      
      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required' });
        return;
      }

      const { client, config } = createAIClient(provider);
      
      const templatePrompt = `Generate ${count} creative template suggestions based on: "${prompt}"
      
Return as JSON array with this structure:
[
  {
    "title": "Template title",
    "description": "Brief description",
    "category": "landing|dashboard|portfolio|blog|ecommerce",
    "features": ["feature1", "feature2"],
    "complexity": "simple|moderate|complex"
  }
]`;

      let templates;
      
      if (provider === 'gemini') {
        const model = client.getGenerativeModel({ 
          model: config.modelName,
          generationConfig: { temperature: 0.7 }
        });
        const result = await model.generateContent(templatePrompt);
        const response = await result.response;
        templates = parseAzureAIJSON(response.text());
      } else {
        const response = await client.chat.completions.create({
          model: config.modelName,
          messages: [{ role: 'user', content: templatePrompt }],
          temperature: 0.7,
          response_format: { type: 'json_object' }
        });
        templates = JSON.parse(response.choices[0].message.content || '[]');
      }

      res.json({
        success: true,
        templates: Array.isArray(templates) ? templates : [templates]
      });
    } catch (error: any) {
      console.error("Template generation error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Generate AI suggestions
   */
  async generateSuggestions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { context, type = 'improvement', provider = 'gemini' } = req.body;
      
      if (!context) {
        res.status(400).json({ error: 'Context is required' });
        return;
      }

      const { client, config } = createAIClient(provider);
      
      const suggestionPrompt = `Based on this context, provide ${type} suggestions:

Context: ${context}

Return as JSON array:
[
  {
    "suggestion": "Clear suggestion text",
    "priority": "high|medium|low",
    "effort": "low|medium|high",
    "impact": "description of impact"
  }
]`;

      let suggestions;
      
      if (provider === 'gemini') {
        const model = client.getGenerativeModel({ 
          model: config.modelName,
          generationConfig: { temperature: 0.5 }
        });
        const result = await model.generateContent(suggestionPrompt);
        const response = await result.response;
        suggestions = parseAzureAIJSON(response.text());
      } else {
        const response = await client.chat.completions.create({
          model: config.modelName,
          messages: [{ role: 'user', content: suggestionPrompt }],
          temperature: 0.5,
          response_format: { type: 'json_object' }
        });
        suggestions = JSON.parse(response.choices[0].message.content || '[]');
      }

      res.json({
        success: true,
        suggestions: Array.isArray(suggestions) ? suggestions : [suggestions]
      });
    } catch (error: any) {
      console.error("Suggestions generation error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Generate page structure
   */
  async generatePage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { template, requirements, style = 'modern' } = req.body;
      
      if (!template || !requirements) {
        res.status(400).json({ error: 'Template and requirements are required' });
        return;
      }

      // Use Azure AI for page generation (requires AzureAIConfig)
      const { client, config } = createAzureAIClient();
      
      const pageResult = await generatePageWithAI(client, config, template, requirements, style);
      const files = await generatePageFilesWithAI(client, config, pageResult);

      res.json({
        success: true,
        pageStructure: pageResult,
        files,
        message: `Generated ${files.length} files for ${template} page`
      });
    } catch (error: any) {
      console.error("Page generation error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

// Export singleton instance
export const aiController = new AIController();

