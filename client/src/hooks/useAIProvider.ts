import { useState, useEffect, useCallback } from 'react';
import { Message, LLMModel, ModelCapabilities } from '../types';
import { useAzureAI } from './useAzureAI';
import { useOpenAI } from './useOpenAI';
import { useGemini } from './useGemini';
import { User } from './useAuth';
import { AzureAIService } from '../lib/azureAI';
import { OpenAIService } from '../lib/openai';
import { GeminiService } from '../lib/gemini';

export type AIProvider = 'azure' | 'openai' | 'gemini';

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

export const useAIProvider = (options: AIProviderOptions = {}): UseAIProviderReturn => {
  // Load saved provider or default to Azure
  const [currentProvider, setCurrentProvider] = useState<AIProvider>(() => {
    const saved = localStorage.getItem(CURRENT_PROVIDER_KEY);
    return (saved as AIProvider) || 'azure';
  });

  // Initialize all providers with the same options
  const azureAI = useAzureAI(options);
  const openAI = useOpenAI(options);
  const gemini = useGemini(options);

  // Get the current active provider hook
  const getCurrentProviderHook = useCallback(() => {
    switch (currentProvider) {
      case 'azure': return azureAI;
      case 'openai': return openAI;
      case 'gemini': return gemini;
      default: return azureAI;
    }
  }, [currentProvider, azureAI, openAI, gemini]);

  // Set provider and persist choice
  const setProvider = useCallback((provider: AIProvider) => {
    setCurrentProvider(provider);
    localStorage.setItem(CURRENT_PROVIDER_KEY, provider);
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
      default:
        return false;
    }
  }, []);

  // Forward all provider hook methods to the current provider
  const activeHook = getCurrentProviderHook();

  return {
    // Provider management
    currentProvider,
    setProvider,
    
    // Forward all AI functionality from active provider
    sendMessage: activeHook.sendMessage,
    sendStreamingMessage: activeHook.sendStreamingMessage,
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