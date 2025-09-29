import { useState, useEffect, useCallback } from 'react';
import { Message, LLMModel, ModelCapabilities } from '../types';
import { useAzureAI } from './useAzureAI';
import { useOpenAI } from './useOpenAI';
import { useGemini } from './useGemini';
import { useHuggingFace } from './useHuggingFace';
import { useLMStudio } from './useLMStudio';
import { User } from './useAuth';
import { AzureAIService } from '../lib/azureAI';
import { OpenAIService } from '../lib/openAI';
import { GeminiService } from '../lib/gemini';
import { HuggingFaceService } from '../lib/huggingface';
import { LMStudioService } from '../lib/lmstudio';
import { sanitizeAIResponse, sanitizeStreamingChunk } from '../lib/response-sanitizer';

export type AIProvider = 'azure' | 'openai' | 'gemini' | 'huggingface' | 'uterpi' | 'lmstudio';

interface AIProviderOptions {
  enableStreaming?: boolean;
  systemMessage?: string;
  chatOptions?: any;
  userContext?: { user?: User | null };
}

interface UseAIProviderReturn {
  // Provider management
  currentProvider: AIProvider;
  setProvider: (provider: AIProvider) => void;
  
  // AI functionality (same interface as useAzureAI)
  sendMessage: (messages: Message[]) => Promise<string>;
  sendStreamingMessage: (messages: Message[], onChunk: (chunk: string) => void) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  currentModel: string | null;
  updateModel: (model: LLMModel) => void;
  selectedLLMModel: LLMModel | null;
  modelCapabilities: ModelCapabilities | null;
  isLoadingCapabilities: boolean;
  refreshCapabilities: () => Promise<void>;
  
  // Provider-specific info
  getAvailableModels: () => LLMModel[];
  isProviderConfigured: (provider: AIProvider) => boolean;
}

const CURRENT_PROVIDER_KEY = 'current-ai-provider';

// Default provider selection: always use LM Studio when no prior choice is saved
function determineDefaultProvider(): AIProvider {
  // Always default to LM Studio regardless of other configured providers
  return 'lmstudio';
}

export const useAIProvider = (options: AIProviderOptions = {}): UseAIProviderReturn => {
  // One-time migration: Clear cached LM Studio model if it's not nomadic-icdu-v8
  useEffect(() => {
    const migrationKey = 'lmstudio-model-migration-v1';
    const hasMigrated = localStorage.getItem(migrationKey);
    
    if (!hasMigrated) {
      const cachedModel = localStorage.getItem('lmstudio-selected-model');
      if (cachedModel) {
        try {
          const parsedModel = JSON.parse(cachedModel);
          if (parsedModel.id !== 'nomadic-icdu-v8') {
            console.log(`🔄 Migration: Clearing cached LM Studio model (${parsedModel.id}) to force nomadic-icdu-v8 default`);
            localStorage.removeItem('lmstudio-selected-model');
          }
        } catch (err) {
          console.log('🔄 Migration: Clearing invalid cached LM Studio model');
          localStorage.removeItem('lmstudio-selected-model');
        }
      }
      localStorage.setItem(migrationKey, 'true');
    }
  }, []);

  // Load saved provider or compute default by configuration
  const [currentProvider, setCurrentProvider] = useState<AIProvider>(() => {
    const saved = localStorage.getItem(CURRENT_PROVIDER_KEY);
    return (saved as AIProvider) || determineDefaultProvider();
  });

  // Initialize all providers with the same options
  const azureAI = useAzureAI(options);
  const openAI = useOpenAI(options);
  const gemini = useGemini(options);
  const huggingface = useHuggingFace(options as any);
  const lmstudio = useLMStudio(options as any);
  const uterpi = useHuggingFace({
    ...options,
    apiToken: (import.meta as any).env?.VITE_UTERPI_API_TOKEN,
    endpointUrl: (import.meta as any).env?.VITE_UTERPI_ENDPOINT_URL,
    isUterpi: true
  } as any);

  // Get the current active provider hook
  const getCurrentProviderHook = useCallback(() => {
    switch (currentProvider) {
      case 'azure': return azureAI;
      case 'openai': return openAI;
      case 'gemini': return gemini;
      case 'huggingface': return huggingface;
      case 'lmstudio': return lmstudio;
      case 'uterpi': return uterpi;
      default: 
        // Default to lmstudio instead of azure
        console.warn(`Unknown provider: ${currentProvider}, defaulting to lmstudio`);
        return lmstudio;
    }
  }, [currentProvider, azureAI, openAI, gemini, huggingface, lmstudio, uterpi]);

  // Set provider and persist choice
  const setProvider = useCallback((provider: AIProvider) => {
    setCurrentProvider(provider);
    localStorage.setItem(CURRENT_PROVIDER_KEY, provider);
    try {
      // Notify other hook instances in the same tab
      window.dispatchEvent(new CustomEvent('ai-provider-changed', { detail: provider }));
    } catch {}
  }, []);

  // If the currently selected provider isn't configured, fall back automatically
  useEffect(() => {
    const valid = isProviderConfigured(currentProvider);
    if (!valid) {
      const fallback = determineDefaultProvider();
      if (fallback !== currentProvider) {
        setProvider(fallback);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get available models for current provider
  const getAvailableModels = useCallback((): LLMModel[] => {
    switch (currentProvider) {
      case 'azure':
        return AzureAIService.getAvailableModels();
      case 'openai':
        return OpenAIService.getAvailableModels();
      case 'gemini':
        return GeminiService.getAvailableModels();
      case 'huggingface':
        return HuggingFaceService.getAvailableModels();
      case 'lmstudio':
        return LMStudioService.getAvailableModels();
      case 'uterpi':
        return HuggingFaceService.getAvailableModels().map(m => ({
          ...m,
          name: 'Uterpi Endpoint',
          provider: 'Uterpi'
        }));
      default:
        return [];
    }
  }, [currentProvider]);

  // Check if provider is configured
  const isProviderConfigured = useCallback((provider: AIProvider): boolean => {
    switch (provider) {
      case 'azure':
        // Azure is always configured via env vars
        return true;
      case 'openai':
        return !!localStorage.getItem('openai-api-key');
      case 'gemini':
        return !!localStorage.getItem('gemini-api-key');
      case 'huggingface':
        return !!localStorage.getItem('hf-api-token') && !!localStorage.getItem('hf-endpoint-url');
      case 'lmstudio':
        // LM Studio runs locally and is OpenAI-compatible; treat as available by default
        return true;
      case 'uterpi':
        return !!(import.meta as any).env?.VITE_UTERPI_API_TOKEN && !!(import.meta as any).env?.VITE_UTERPI_ENDPOINT_URL;
      default:
        return false;
    }
  }, []);

  // Keep provider in sync across different hook instances/components
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CURRENT_PROVIDER_KEY && e.newValue) {
        setCurrentProvider(e.newValue as AIProvider);
      }
    };
    const handleCustom = (e: Event) => {
      const custom = e as CustomEvent<AIProvider>;
      if (custom.detail) {
        setCurrentProvider(custom.detail);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('ai-provider-changed', handleCustom as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('ai-provider-changed', handleCustom as EventListener);
    };
  }, []);

  // Persist computed default provider on first load if not already saved
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENT_PROVIDER_KEY);
      if (!saved && currentProvider) {
        localStorage.setItem(CURRENT_PROVIDER_KEY, currentProvider);
      }
    } catch {}
  }, [currentProvider]);

  // Forward all provider hook methods to the current provider
  const activeHook = getCurrentProviderHook();

  // Wrap sendMessage to add debugging and sanitization
  const wrappedSendMessage = useCallback(async (messages: Message[]): Promise<string> => {
    console.log(`🎯 useAIProvider: Sending message via ${currentProvider}`);
    const response = await activeHook.sendMessage(messages);
    
    // Check if this is a greeting generation request
    const isGreeting = messages.some(msg => 
      msg.content.toLowerCase().includes('generate a warm, personalized greeting') ||
      msg.content.toLowerCase().includes('greeting message') ||
      msg.id === 'greeting-prompt'
    );
    
    const sanitized = sanitizeAIResponse(response, isGreeting);
    console.log(`✅ useAIProvider: Response from ${currentProvider}:`, sanitized ? `${sanitized.substring(0, 100)}...` : 'EMPTY');
    return sanitized;
  }, [activeHook, currentProvider]);

  // Wrap sendStreamingMessage to add debugging and sanitization
  const wrappedSendStreamingMessage = useCallback(async (
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    console.log(`🌊 useAIProvider: Sending STREAMING message via ${currentProvider}`);
    let streamBuffer = '';
    let fullResponse = '';
    
    await activeHook.sendStreamingMessage(messages, (chunk: string) => {
      // Sanitize streaming chunks to remove malformed patterns
      const { sanitized, newBuffer } = sanitizeStreamingChunk(chunk, streamBuffer);
      streamBuffer = newBuffer;
      
      if (sanitized) {
        fullResponse += sanitized;
        onChunk(sanitized);
      }
    });
    
    // Final sanitization of the complete response
    // This catches any patterns that span multiple chunks
    if (streamBuffer) {
      onChunk(streamBuffer);
    }
    
    console.log(`✅ useAIProvider: Streaming completed for ${currentProvider}`);
  }, [activeHook, currentProvider]);

  return {
    // Provider management
    currentProvider,
    setProvider,
    
    // Forward all AI functionality from active provider
    sendMessage: wrappedSendMessage,
    sendStreamingMessage: wrappedSendStreamingMessage,
    isLoading: activeHook.isLoading,
    error: activeHook.error,
    clearError: activeHook.clearError,
    currentModel: activeHook.currentModel,
    updateModel: activeHook.updateModel,
    selectedLLMModel: activeHook.selectedLLMModel,
    modelCapabilities: activeHook.modelCapabilities,
    isLoadingCapabilities: activeHook.isLoadingCapabilities,
    refreshCapabilities: activeHook.refreshCapabilities,
    
    // Provider-specific methods
    getAvailableModels,
    isProviderConfigured,
  };
}; 