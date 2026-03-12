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
        // LM Studio should use Web Speech API for STT, not its own service
        return 'web';
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
    // Check if we're in a browser environment and if speech APIs are available
    if (typeof window === 'undefined') {
      throw new Error('Speech services not available in non-browser environment');
    }

    // Enhanced validation for speech APIs
    const hasSpeechRecognition = (() => {
      try {
        const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        return !!(SpeechRecognitionConstructor && typeof SpeechRecognitionConstructor === 'function');
      } catch (error) {
        console.warn('Error checking SpeechRecognition availability:', error);
        return false;
      }
    })();
    
    const hasSpeechSynthesis = (() => {
      try {
        return !!(window.speechSynthesis && typeof window.speechSynthesis === 'object');
      } catch (error) {
        console.warn('Error checking speechSynthesis availability:', error);
        return false;
      }
    })();

    if (!hasSpeechRecognition && !hasSpeechSynthesis) {
      throw new Error('No speech APIs available in this browser');
    }

    const preferred = this.mapAIProviderToSpeechProvider(aiProvider);
    // For STT, always prioritize Web Speech API as it's the most reliable
    const providersOrder: SpeechProvider[] = capability === 'stt' 
      ? ['web', preferred, 'openai', 'google', 'azure']
      : [preferred, 'web', 'openai', 'google', 'azure'];

    for (const p of providersOrder) {
      try {
        const service = await this.getService(p, config);
        const caps = service.getCapabilities();
        if ((capability === 'tts' && caps.supportsTTS) || (capability === 'stt' && caps.supportsSTT)) {
          // additionally ensure runtime availability
          if (service.isAvailable()) {
            console.log(`✅ Using ${p} speech service for ${capability} with ${aiProvider} provider`);
            return service;
          } else {
            console.warn(`⚠️ ${p} speech service not available for ${capability}`);
          }
        }
      } catch (error) {
        console.warn(`❌ Failed to initialize ${p} speech service:`, error);
        // try next
      }
    }

    // As last resort return WebSpeech (may still be partially available)
    console.warn(`🔄 Falling back to Web Speech API for ${capability}`);
    try {
      return await this.getService('web', config);
    } catch (error) {
      console.error('Failed to create fallback Web Speech service:', error);
      // Return a minimal service that won't crash
      return new WebSpeechService();
    }
  }
  
  /**
   * Create a new speech service instance
   */
  private static createService(provider: SpeechProvider): ISpeechService {
    try {
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
    } catch (error) {
      console.error(`Failed to create ${provider} speech service:`, error);
      // Fallback to WebSpeechService which has the most comprehensive error handling
      try {
        return new WebSpeechService();
      } catch (fallbackError) {
        console.error('Failed to create fallback WebSpeechService:', fallbackError);
        // Return a minimal service that implements the interface but does nothing
        return {
          synthesizeSpeech: async () => { throw new Error('Speech services unavailable'); },
          cancelSynthesis: () => {},
          getAvailableVoices: async () => [],
          startRecognition: async () => { throw new Error('Speech services unavailable'); },
          stopRecognition: async () => ({ transcript: '', confidence: 0, isFinal: true }),
          onRecognitionResult: () => {},
          isAvailable: () => false,
          getCapabilities: () => ({
            supportsTTS: false,
            supportsSTT: false,
            supportsStreaming: false,
            supportsVoiceCloning: false,
            supportsEmotions: false,
            supportsMultiLanguage: false,
            supportsVAD: false,
            availableVoices: [],
            availableLanguages: []
          }),
          initialize: async () => {},
          dispose: () => {}
        };
      }
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
