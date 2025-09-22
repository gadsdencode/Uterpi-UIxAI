import { AzureAIMessage, ChatCompletionOptions, LLMModel } from "../types";
import { getModelConfiguration, validateModelParameters } from "./modelConfigurations";

export interface HuggingFaceConfig {
  endpointUrl: string;
  apiToken: string;
  modelName?: string;
}

export class HuggingFaceService {
  private config: HuggingFaceConfig;

  constructor(config: HuggingFaceConfig) {
    this.config = config;
  }

  updateModel(modelName: string): void {
    this.config.modelName = modelName;
  }

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

  private convertToPrompt(messages: AzureAIMessage[]): string {
    // Compose a simple prompt including system guidance
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
    const modelConfig = getModelConfiguration(modelId);

    const validated = validateModelParameters(modelId, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
    });

    // Check if this is Uterpi LLM (uses backend proxy for credit checking)
    const isUterpi = (this.config as any).isUterpi;
    
    if (isUterpi) {
      // Use backend proxy for Uterpi LLM with credit checking
      const requestBody = {
        provider: 'uterpi',
        messages,
        model: this.config.modelName || 'uterpi-llm',
        max_tokens: validated.maxTokens,
        temperature: validated.temperature,
        top_p: validated.topP,
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
        // Handle credit limit errors specially
        if (response.status === 402) {
          const errorData = await response.json();
          throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
        }
        
        const errText = await response.text();
        throw new Error(`Uterpi LLM error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    }

    // Original HuggingFace direct API call for non-Uterpi endpoints
    const prompt = this.convertToPrompt(messages);

    const body: any = {
      inputs: prompt,
      parameters: {
        // HF text-generation parameters
        max_new_tokens: validated.maxTokens,
        temperature: validated.temperature,
        top_p: validated.topP,
        return_full_text: false
      }
    };

    const response = await fetch(this.config.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiToken}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Hugging Face endpoint error (${response.status}): ${errText}`);
    }

    // Response schema can vary by model/task. Handle common shapes without assumptions beyond official docs.
    // Inference API commonly returns an array of objects with generated_text for text-generation.
    const data = await response.json();
    let text = "";
    if (Array.isArray(data)) {
      const first = data[0] || {};
      text = first.generated_text || first.summary_text || "";
    } else if (typeof data === "object" && data) {
      // Some endpoints may return an object with generated_text
      text = (data as any).generated_text || "";
      if (!text && (data as any).choices?.[0]?.message?.content) {
        text = (data as any).choices[0].message.content;
      }
    } else if (typeof data === "string") {
      text = data;
    }

    return typeof text === "string" ? text : JSON.stringify(data);
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
      const isUterpi = (this.config as any).isUterpi;
      
      if (isUterpi) {
        // Use backend proxy for Uterpi LLM with credit checking
        const modelId = this.getCurrentModel();
        const validated = validateModelParameters(modelId, {
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          topP: options.topP,
        });

        const requestBody = {
          provider: 'uterpi',
          messages,
          model: this.config.modelName || 'uterpi-llm',
          max_tokens: validated.maxTokens,
          temperature: validated.temperature,
          top_p: validated.topP,
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
          // Handle credit limit errors specially
          if (response.status === 402) {
            const errorData = await response.json();
            throw new Error(`Subscription error: ${JSON.stringify(errorData)}`);
          }
          
          const errText = await response.text();
          throw new Error(`Uterpi LLM streaming error (${response.status}): ${errText}`);
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


