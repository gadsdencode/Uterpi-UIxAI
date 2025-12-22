// AI Service - AI Client Factory and Provider Configuration
// Handles creation and configuration of AI clients for various providers

import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import type { 
  AIClientResult, 
  AIClientConfig, 
  AzureAIConfig, 
  LMStudioBaseInfo,
  AIProvider 
} from "../types/ai";

/**
 * AI Service - Factory for creating AI clients
 */
export class AIService {
  /**
   * Get LM Studio base URL based on environment
   */
  getLMStudioBaseUrl(): LMStudioBaseInfo {
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.REPL_SLUG;
    
    const sanitizeBaseUrl = (raw: string): string => {
      let base = (raw || "").trim();
      // Fix accidental duplicate port patterns like :1234:1234
      base = base.replace(/:(\d+):(\d+)/, ":$1");
      // Remove any trailing slash
      base = base.replace(/\/$/, "");
      // Strip accidental API path suffixes
      base = base.replace(/\/(v1|openai|api)(\/.*)?$/i, "");
      // Ensure protocol
      if (!/^https?:\/\//i.test(base)) {
        base = `http://${base}`;
      }
      // Validate URL
      try {
        new URL(base);
      } catch {
        throw new Error(`Invalid LMSTUDIO_BASE_URL provided: ${raw}`);
      }
      return base;
    };

    // Try multiple sources for LM Studio URL configuration
    // Priority: LMSTUDIO_BASE_URL > VITE_LMSTUDIO_BASE_URL > LMSTUDIO_DEV_BASE_URL > production default
    // In production (Replit), use the Cloudflare tunnel URL with HTTPS
    // In development, use environment variable (no hardcoded IPs)
    const defaultUrl = isProduction 
      ? "https://lmstudio.uterpi.com"  // Cloudflare tunnel URL for production (MUST be HTTPS)
      : (process.env.LMSTUDIO_DEV_BASE_URL || "http://localhost:1234"); // Development: env var or localhost
    
    const lmBaseRaw = process.env.LMSTUDIO_BASE_URL || process.env.VITE_LMSTUDIO_BASE_URL || defaultUrl;
    
    return {
      url: sanitizeBaseUrl(lmBaseRaw),
      isProduction
    };
  }

  /**
   * Create AI client based on provider
   */
  createClient(provider: string = 'gemini', userApiKey?: string): AIClientResult {
    const normalizedProvider = provider.toLowerCase() as AIProvider;
    
    switch (normalizedProvider) {
      case 'gemini':
        return this.createGeminiClient(userApiKey);
      
      case 'openai':
        return this.createOpenAIClient(userApiKey);
      
      case 'azure':
      case 'azureai':
        return this.createAzureClient(userApiKey);
      
      case 'lmstudio':
      case 'uterpi':
        return this.createLMStudioClient(userApiKey);
      
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  /**
   * Create Gemini client
   */
  private createGeminiClient(userApiKey?: string): AIClientResult {
    const apiKey = userApiKey || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key missing. Please provide an API key or set VITE_GEMINI_API_KEY environment variable.");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    return {
      client: genAI,
      config: { 
        modelName: 'gemini-2.5-flash',
        apiKey 
      }
    };
  }

  /**
   * Create OpenAI client
   */
  private createOpenAIClient(userApiKey?: string): AIClientResult {
    const apiKey = userApiKey || process.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key missing. Please provide an API key or set VITE_OPENAI_API_KEY environment variable.");
    }
    const openai = new OpenAI({ apiKey });
    return {
      client: openai,
      config: {
        modelName: 'gpt-4o-mini',
        apiKey
      }
    };
  }

  /**
   * Create Azure AI client
   */
  private createAzureClient(userApiKey?: string): AIClientResult {
    const endpoint = process.env.VITE_AZURE_AI_ENDPOINT;
    const apiKey = userApiKey || process.env.VITE_AZURE_AI_API_KEY;
    const modelName = process.env.VITE_AZURE_AI_MODEL_NAME || "ministral-3b";
    
    if (!endpoint || !apiKey) {
      throw new Error("Azure AI configuration missing. Please set VITE_AZURE_AI_ENDPOINT and VITE_AZURE_AI_API_KEY environment variables.");
    }
    
    const credential = new AzureKeyCredential(apiKey);
    const client = ModelClient(endpoint, credential);
    
    return {
      client,
      config: {
        endpoint,
        apiKey,
        modelName,
        maxRetries: 3,
        retryDelay: 1000,
        cacheEnabled: true
      }
    };
  }

  /**
   * Create LM Studio / Uterpi client
   */
  private createLMStudioClient(userApiKey?: string): AIClientResult {
    const baseInfo = this.getLMStudioBaseUrl();
    const apiKey = userApiKey || process.env.LMSTUDIO_API_KEY || "lm-studio";
    
    // Create OpenAI client configured for LM Studio endpoint
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: `${baseInfo.url}/v1`
    });
    
    return {
      client: openai,
      config: {
        modelName: 'nomadic-icdu-v8', // The actual default LM Studio model
        apiKey,
        baseURL: `${baseInfo.url}/v1`,
        maxRetries: 3,
        retryDelay: 1000
      }
    };
  }

  /**
   * Create Azure AI client (legacy method for backwards compatibility)
   */
  createAzureAIClient(): { client: any; config: AzureAIConfig } {
    const endpoint = process.env.VITE_AZURE_AI_ENDPOINT;
    const apiKey = process.env.VITE_AZURE_AI_API_KEY;
    const modelName = process.env.VITE_AZURE_AI_MODEL_NAME || "ministral-3b";

    if (!endpoint || !apiKey) {
      throw new Error(
        "Azure AI configuration missing. Please set VITE_AZURE_AI_ENDPOINT and VITE_AZURE_AI_API_KEY environment variables."
      );
    }

    const config: AzureAIConfig = { 
      endpoint, 
      apiKey, 
      modelName,
      maxRetries: 3,
      retryDelay: 1000,
      cacheEnabled: true
    };
    
    const client = ModelClient(endpoint, new AzureKeyCredential(apiKey));
    
    console.log(`🚀 Azure AI client initialized with model: ${modelName}`);
    
    return { client, config };
  }

  /**
   * Extract error message from Azure AI error response
   */
  extractAzureAIError(error: any): string {
    if (!error) return "Unknown Azure AI error";
    
    // Log full error for debugging
    console.error("Full Azure AI error details:", JSON.stringify(error, null, 2));
    
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.error?.message) return error.error.message;
    if (error.details) return Array.isArray(error.details) ? error.details.join(', ') : error.details;
    if (error.code) return `Azure AI Error ${error.code}: ${error.message || 'Unknown error'}`;
    
    return "Unexpected Azure AI error format";
  }

  /**
   * Parse JSON from Azure AI response with error recovery
   */
  parseAzureAIJSON(content: string): any {
    if (!content || typeof content !== 'string') {
      console.warn("Invalid content for JSON parsing:", typeof content);
      return null;
    }

    try {
      // Remove any markdown code block markers
      const cleanContent = content.replace(/```(?:json)?\n?/g, '').trim();
      
      // Try direct parsing first
      return JSON.parse(cleanContent);
    } catch (error) {
      console.warn("Direct JSON parsing failed, attempting recovery...");
      
      try {
        // Look for JSON-like structure in the content
        const cleanContent = content.replace(/```(?:json)?\n?/g, '').trim();
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (recoveryError) {
        console.warn("JSON recovery failed:", recoveryError);
      }
      
      try {
        // Try to extract and fix common JSON issues
        const cleanContent = content.replace(/```(?:json)?\n?/g, '').trim();
        let fixedContent = cleanContent
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Add quotes to unquoted keys
          .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single quotes with double quotes
          .replace(/,\s*}/g, '}') // Remove trailing commas
          .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
        
        return JSON.parse(fixedContent);
      } catch (fixError) {
        console.error("All JSON parsing attempts failed:", fixError);
        return null;
      }
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          console.error(`Operation failed after ${maxRetries + 1} attempts:`, error);
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, this.extractAzureAIError(error));
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

// Export singleton instance
export const aiService = new AIService();

// Export functions for backwards compatibility
export function createAIClient(provider: string = 'gemini', userApiKey?: string): AIClientResult {
  return aiService.createClient(provider, userApiKey);
}

export function createAzureAIClient(): { client: any; config: AzureAIConfig } {
  return aiService.createAzureAIClient();
}

export function extractAzureAIError(error: any): string {
  return aiService.extractAzureAIError(error);
}

export function parseAzureAIJSON(content: string): any {
  return aiService.parseAzureAIJSON(content);
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  return aiService.retryWithBackoff(operation, maxRetries, baseDelay);
}

// Re-export provider factory and types
export { getProvider, getAvailableProviders, isProviderAvailable } from './providers';
export type { BaseAIProvider, AIProviderOptions, AIProviderResult } from './providers';

