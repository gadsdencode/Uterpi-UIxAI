// Speech Service Factory - Creates appropriate speech service based on AI provider

import { ISpeechService, SpeechProvider, SpeechConfig } from '../../types/speech';
import { WebSpeechService } from './webSpeechService';
import { AzureSpeechService } from './azureSpeechService';
import { OpenAISpeechService } from './openaiSpeechService';
import { GoogleSpeechService } from './googleSpeechService';
import { LMStudioSpeechService } from './lmstudioSpeechService';
import { AIProvider } from '../../hooks/useAIProvider';

export class SpeechServiceFactory {
  private static instances: Map<SpeechProvider, ISpeechService> = new Map();
  
  /**
   * Get or create a speech service instance based on the provider
   */
  static async getService(
    provider: SpeechProvider, 
    config?: SpeechConfig
  ): Promise<ISpeechService> {
    // Check if we already have an instance
    let service = this.instances.get(provider);
    
    if (!service) {
      service = this.createService(provider);
      this.instances.set(provider, service);
    }
    
    // Initialize if needed
    if (config) {
      await service.initialize(config);
    }
    
    return service;
  }
  
  /**
   * Map AI provider to appropriate speech provider
   */
  static mapAIProviderToSpeechProvider(aiProvider: AIProvider): SpeechProvider {
    switch (aiProvider) {
      case 'azure':
        return 'azure';
      case 'openai':
        return 'openai';
      case 'gemini':
        return 'google';
      case 'lmstudio':
        return 'lmstudio';
      case 'huggingface':
      case 'uterpi':
        // Hugging Face and Uterpi can use Web Speech API as fallback
        // or Azure if configured
        if ((import.meta as any).env?.VITE_AZURE_SPEECH_KEY) {
          return 'azure';
        }
        return 'web';
      default:
        return 'web';
    }
  }
  
  /**
   * Get the best available speech service for the current AI provider
   */
  static async getBestAvailableService(
    aiProvider: AIProvider,
    config?: SpeechConfig
  ): Promise<ISpeechService> {
    const preferredProvider = this.mapAIProviderToSpeechProvider(aiProvider);
    
    // Try to get the preferred provider
    let service = await this.getService(preferredProvider, config);
    
    // Check if the service is available
    if (service.isAvailable()) {
      return service;
    }
    
    // Fallback chain - prioritize based on capability and availability
    const fallbackProviders: SpeechProvider[] = ['web', 'azure', 'openai', 'google'];
    
    for (const fallback of fallbackProviders) {
      if (fallback === preferredProvider) continue;
      
      try {
        service = await this.getService(fallback, config);
        if (service.isAvailable()) {
          console.log(`Using ${fallback} speech service as fallback for ${preferredProvider}`);
          return service;
        }
      } catch (error) {
        console.warn(`Failed to initialize ${fallback} speech service:`, error);
      }
    }
    
    // Return Web Speech API as last resort (even if not available)
    console.warn('No speech services available, falling back to Web Speech API');
    return await this.getService('web', config);
  }

  /**
   * Get the best service specifically for a capability (tts or stt)
   */
  static async getBestServiceFor(
    aiProvider: AIProvider,
    capability: 'tts' | 'stt',
    config?: SpeechConfig
  ): Promise<ISpeechService> {
    const preferred = this.mapAIProviderToSpeechProvider(aiProvider);
    const providersOrder: SpeechProvider[] = [preferred, 'web', 'openai', 'google', 'azure'];

    for (const p of providersOrder) {
      try {
        const service = await this.getService(p, config);
        const caps = service.getCapabilities();
        if ((capability === 'tts' && caps.supportsTTS) || (capability === 'stt' && caps.supportsSTT)) {
          // additionally ensure runtime availability
          if (service.isAvailable()) {
            return service;
          }
        }
      } catch {
        // try next
      }
    }

    // As last resort return WebSpeech (may still be partially available)
    return await this.getService('web', config);
  }
  
  /**
   * Create a new speech service instance
   */
  private static createService(provider: SpeechProvider): ISpeechService {
    switch (provider) {
      case 'azure':
        return new AzureSpeechService();
      case 'openai':
        return new OpenAISpeechService();
      case 'google':
        return new GoogleSpeechService();
      case 'lmstudio':
        return new LMStudioSpeechService();
      case 'web':
      default:
        return new WebSpeechService();
    }
  }
  
  /**
   * Dispose of all service instances
   */
  static disposeAll(): void {
    this.instances.forEach(service => service.dispose());
    this.instances.clear();
  }
  
  /**
   * Check if any speech service is available
   */
  static async isAnyServiceAvailable(): Promise<boolean> {
    const providers: SpeechProvider[] = ['web', 'azure', 'openai', 'google'];
    
    for (const provider of providers) {
      try {
        const service = await this.getService(provider);
        if (service.isAvailable()) {
          return true;
        }
      } catch (error) {
        continue;
      }
    }
    
    return false;
  }
}
