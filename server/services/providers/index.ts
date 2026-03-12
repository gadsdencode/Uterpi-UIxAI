// server/services/providers/index.ts
// AI Provider Factory and Exports

export * from './baseProvider';
export { LMStudioProvider, lmstudioProvider } from './lmstudioProvider';
export { GeminiProvider, geminiProvider } from './geminiProvider';
export { OpenAIProvider, openaiProvider } from './openaiProvider';
export { AzureProvider, azureProvider } from './azureProvider';

import type { BaseAIProvider } from './baseProvider';
import { lmstudioProvider } from './lmstudioProvider';
import { geminiProvider } from './geminiProvider';
import { openaiProvider } from './openaiProvider';
import { azureProvider } from './azureProvider';

/**
 * Provider registry mapping provider names to implementations
 */
const providerRegistry: Record<string, BaseAIProvider> = {
  lmstudio: lmstudioProvider,
  uterpi: lmstudioProvider, // Alias for LM Studio
  gemini: geminiProvider,
  openai: openaiProvider,
  azure: azureProvider,
  azureai: azureProvider, // Alias for Azure
};

/**
 * Get an AI provider by name
 * @param providerName Name of the provider (lmstudio, gemini, openai, azure, etc.)
 * @returns The provider implementation
 * @throws Error if provider is not found
 */
export function getProvider(providerName: string): BaseAIProvider {
  const normalizedName = providerName.toLowerCase();
  const provider = providerRegistry[normalizedName];
  
  if (!provider) {
    const availableProviders = Object.keys(providerRegistry).join(', ');
    throw new Error(`Unsupported AI provider: ${providerName}. Available providers: ${availableProviders}`);
  }
  
  return provider;
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): string[] {
  return Object.entries(providerRegistry)
    .filter(([_, provider]) => provider.isAvailable())
    .map(([name]) => name);
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(providerName: string): boolean {
  const normalizedName = providerName.toLowerCase();
  const provider = providerRegistry[normalizedName];
  return provider?.isAvailable() ?? false;
}

