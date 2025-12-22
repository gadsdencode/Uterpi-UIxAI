// client/src/lib/huggingface.ts
// Hugging Face Inference API service implementation

import { AzureAIMessage, ChatCompletionOptions, LLMModel } from "../types";
import { BaseAIService } from "./ai";

export interface HuggingFaceConfig {
  endpointUrl: string;
  apiToken: string;
  modelName?: string;
  isUterpi?: boolean;
}

export class HuggingFaceService extends BaseAIService {
  // Store HuggingFace-specific config separately since it has different structure
  private hfConfig: HuggingFaceConfig;

  constructor(config: HuggingFaceConfig) {
    super(
      { 
        apiKey: config.apiToken, 
        modelName: config.modelName || "hf-endpoint",
        baseUrl: config.endpointUrl 
      }, 
      config.isUterpi ? 'uterpi' : 'huggingface'
    );
    this.hfConfig = config;
  }

  /**
   * Override getCurrentModel to handle optional modelName
   */
  getCurrentModel(): string {
    return this.config.modelName || "hf-endpoint";
  }

  /**
   * Basic model list for selection. For Endpoints, the deployed model is bound to your endpoint.
   */
  static getAvailableModels(): LLMModel[] {
    return [
      {
        id: "hf-endpoint",
        name: "HuggingFace",
        provider: "Hugging Face",
        performance: 80,
        cost: 0,
        latency: 800,
        contextLength: 16384,
        description: "Uses your configured Hugging Face Inference Endpoint",
        category: "text",
        tier: "pro",
        isFavorite: false,
        capabilities: {
          supportsVision: false,
          supportsCodeGeneration: true,
          supportsAnalysis: true,
          supportsImageGeneration: false
        }
      }
    ];
  }

  /**
   * Convert messages to a simple prompt format for HuggingFace text-generation
   */
  private convertToPrompt(messages: AzureAIMessage[]): string {
    return messages
      .map(m => {
        const role = m.role === "assistant" ? "Assistant" : m.role === "user" ? "User" : "System";
        return `${role}: ${m.content}`;
      })
      .join("\n\n") + "\n\nAssistant:";
  }

  /**
   * Non-streaming call to a Hugging Face Inference Endpoint.
   * Documentation: https://huggingface.co/docs/huggingface_hub/guides/inference_endpoints
   */
  async sendChatCompletion(
    messages: AzureAIMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    const modelId = this.getCurrentModel();
    const validatedParams = this.getValidatedParams(options);

    // Check if this is Uterpi LLM (uses backend proxy for credit checking)
    if (this.hfConfig.isUterpi) {
      return this.sendUterpiCompletion(messages, validatedParams);
    }

    // Original HuggingFace direct API call for non-Uterpi endpoints
    const prompt = this.convertToPrompt(messages);

    const body = {
      inputs: prompt,
      parameters: {
        // HF text-generation parameters
        max_new_tokens: validatedParams.maxTokens,
        temperature: validatedParams.temperature,
        top_p: validatedParams.topP,
        return_full_text: false
      }
    };

    const response = await fetch(this.hfConfig.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.hfConfig.apiToken}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Hugging Face endpoint error (${response.status}): ${errText}`);
    }

    // Response schema can vary by model/task. Handle common shapes without assumptions beyond official docs.
    const data = await response.json();
    let text = "";
    
    if (Array.isArray(data)) {
      const first = data[0] || {};
      text = first.generated_text || first.summary_text || "";
    } else if (typeof data === "object" && data) {
      text = (data as Record<string, unknown>).generated_text as string || "";
      if (!text) {
        const choices = (data as Record<string, unknown>).choices as Array<{ message?: { content?: string } }> | undefined;
        if (choices?.[0]?.message?.content) {
          text = choices[0].message.content;
        }
      }
    } else if (typeof data === "string") {
      text = data;
    }

    return typeof text === "string" ? text : JSON.stringify(data);
  }

  /**
   * Send completion request via Uterpi backend proxy (with credit checking)
   */
  private async sendUterpiCompletion(
    messages: AzureAIMessage[],
    validatedParams: { maxTokens: number; temperature: number; topP: number }
  ): Promise<string> {
    const requestBody = {
      provider: 'uterpi',
      messages,
      model: this.hfConfig.modelName || 'uterpi-llm',
      max_tokens: validatedParams.maxTokens,
      temperature: validatedParams.temperature,
      top_p: validatedParams.topP,
      stream: false
    };

    const response = await fetch('/ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      await this.handleApiError(response, 'API');
    }

    const data = await response.json();
    
    // Extract credit information if present and emit update
    await this.emitCreditUpdate(data.uterpi_credit_info);
    
    return data.choices[0]?.message?.content || "";
  }

  /**
   * Streaming support depends on the Endpoint configuration. If not available,
   * we fall back to a single non-streaming call and emit one chunk.
   */
  async sendStreamingChatCompletion(
    messages: AzureAIMessage[],
    onChunk: (chunk: string) => void,
    options: ChatCompletionOptions = {}
  ): Promise<void> {
    try {
      // Check if this is Uterpi LLM (uses backend proxy for credit checking)
      if (this.hfConfig.isUterpi) {
        const validatedParams = this.getValidatedParams(options);

        const requestBody = {
          provider: 'uterpi',
          messages,
          model: this.hfConfig.modelName || 'uterpi-llm',
          max_tokens: validatedParams.maxTokens,
          temperature: validatedParams.temperature,
          top_p: validatedParams.topP,
          stream: true
        };

        const response = await fetch('/ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          await this.handleStreamError(response);
        }

        // For now, fall back to non-streaming for Uterpi LLM
        // TODO: Implement proper streaming support in the backend
        const data = await response.json();
        const content = data.choices[0]?.message?.content || "";
        if (content) {
          onChunk(content);
        }
        return;
      }

      // Try non-streaming and emit as one chunk to keep UX consistent
      const full = await this.sendChatCompletion(messages, options);
      if (full) {
        onChunk(full);
      }
    } catch (err) {
      throw err;
    }
  }

  static createFromEnv(): HuggingFaceConfig {
    const endpointUrl = import.meta.env.VITE_HF_ENDPOINT_URL as string | undefined;
    const apiToken = import.meta.env.VITE_HF_API_TOKEN as string | undefined;
    if (!endpointUrl || !apiToken) {
      throw new Error("Hugging Face configuration missing. Set VITE_HF_ENDPOINT_URL and VITE_HF_API_TOKEN.");
    }
    return { endpointUrl, apiToken, modelName: "hf-endpoint" };
  }
}

export default HuggingFaceService;
