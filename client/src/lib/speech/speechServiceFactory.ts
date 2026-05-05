// Speech Service Factory - Creates appropriate speech service based on AI provider

import { ISpeechService, SpeechProvider, SpeechConfig, SpeechServiceCapabilities } from '../../types/speech';
import { WebSpeechService } from './webSpeechService';
import { AzureSpeechService } from './azureSpeechService';
import { OpenAISpeechService } from './openaiSpeechService';
import { GoogleSpeechService } from './googleSpeechService';
import { LMStudioSpeechService } from './lmstudioSpeechService';
import { AIProvider } from '../../hooks/useAIProvider';
import { speechLog } from './speechDebug';

const TAG = 'SpeechFactory';

/** Centralized browser-level capability probe (runs once). */
let _browserCaps: { hasSpeechRecognition: boolean; hasSpeechSynthesis: boolean } | null = null;

export function probeBrowserSpeechCaps(): { hasSpeechRecognition: boolean; hasSpeechSynthesis: boolean } {
  if (_browserCaps) return _browserCaps;
  if (typeof window === 'undefined') {
    _browserCaps = { hasSpeechRecognition: false, hasSpeechSynthesis: false };
    return _browserCaps;
  }
  let hasSpeechRecognition = false;
  let hasSpeechSynthesis = false;
  try {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    hasSpeechRecognition = !!(Ctor && typeof Ctor === 'function');
  } catch {}
  try {
    hasSpeechSynthesis = !!(window.speechSynthesis && typeof window.speechSynthesis === 'object');
  } catch {}
  _browserCaps = { hasSpeechRecognition, hasSpeechSynthesis };
  return _browserCaps;
}

export class SpeechServiceFactory {
  private static instances: Map<SpeechProvider, ISpeechService> = new Map();

  static async getService(provider: SpeechProvider, config?: SpeechConfig): Promise<ISpeechService> {
    let service = this.instances.get(provider);
    if (!service) {
      service = this.createService(provider);
      this.instances.set(provider, service);
    }
    if (config) await service.initialize(config);
    return service;
  }

  static mapAIProviderToSpeechProvider(aiProvider: AIProvider): SpeechProvider {
    switch (aiProvider) {
      case 'azure': return 'azure';
      case 'openai': return 'openai';
      case 'gemini': return 'google';
      case 'lmstudio': return 'web';
      case 'huggingface':
      case 'uterpi':
        if ((import.meta as any).env?.VITE_AZURE_SPEECH_KEY) return 'azure';
        return 'web';
      default: return 'web';
    }
  }

  static async getBestAvailableService(aiProvider: AIProvider, config?: SpeechConfig): Promise<ISpeechService> {
    const preferred = this.mapAIProviderToSpeechProvider(aiProvider);
    let service = await this.getService(preferred, config);
    if (service.isAvailable()) return service;

    const fallbacks: SpeechProvider[] = ['web', 'azure', 'openai', 'google'];
    for (const fb of fallbacks) {
      if (fb === preferred) continue;
      try {
        service = await this.getService(fb, config);
        if (service.isAvailable()) {
          speechLog.info(TAG, `Using ${fb} as fallback for ${preferred}`);
          return service;
        }
      } catch (error) {
        speechLog.warn(TAG, `Fallback ${fb} failed`, error);
      }
    }
    speechLog.warn(TAG, 'No speech services available, returning Web Speech API');
    return await this.getService('web', config);
  }

  static async getBestServiceFor(
    aiProvider: AIProvider,
    capability: 'tts' | 'stt',
    config?: SpeechConfig
  ): Promise<ISpeechService> {
    if (typeof window === 'undefined') {
      throw new Error('Speech services not available in non-browser environment');
    }

    const { hasSpeechRecognition, hasSpeechSynthesis } = probeBrowserSpeechCaps();
    if (!hasSpeechRecognition && !hasSpeechSynthesis) {
      throw new Error('No speech APIs available in this browser');
    }

    const preferred = this.mapAIProviderToSpeechProvider(aiProvider);
    const providersOrder: SpeechProvider[] = capability === 'stt'
      ? ['web', preferred, 'openai', 'google', 'azure']
      : [preferred, 'web', 'openai', 'google', 'azure'];

    for (const p of providersOrder) {
      try {
        const service = await this.getService(p, config);
        const caps = service.getCapabilities();
        const capMatch = capability === 'tts' ? caps.supportsTTS : caps.supportsSTT;
        if (capMatch && service.isAvailable()) {
          speechLog.info(TAG, `Using ${p} for ${capability} (provider: ${aiProvider})`);
          return service;
        }
      } catch (error) {
        speechLog.warn(TAG, `${p} init failed for ${capability}`, error);
      }
    }

    speechLog.warn(TAG, `Falling back to Web Speech API for ${capability}`);
    try {
      return await this.getService('web', config);
    } catch {
      return new WebSpeechService();
    }
  }

  private static createService(provider: SpeechProvider): ISpeechService {
    try {
      switch (provider) {
        case 'azure': return new AzureSpeechService();
        case 'openai': return new OpenAISpeechService();
        case 'google': return new GoogleSpeechService();
        case 'lmstudio': return new LMStudioSpeechService();
        case 'web':
        default: return new WebSpeechService();
      }
    } catch (error) {
      speechLog.error(TAG, `Failed to create ${provider} service, falling back`, error);
      try {
        return new WebSpeechService();
      } catch {
        return this.createNoopService();
      }
    }
  }

  private static createNoopService(): ISpeechService {
    const noop: SpeechServiceCapabilities = {
      supportsTTS: false, supportsSTT: false, supportsStreaming: false,
      supportsVoiceCloning: false, supportsEmotions: false, supportsMultiLanguage: false,
      supportsVAD: false, availableVoices: [], availableLanguages: []
    };
    return {
      synthesizeSpeech: async () => { throw new Error('Speech services unavailable'); },
      cancelSynthesis: () => {},
      getAvailableVoices: async () => [],
      startRecognition: async () => { throw new Error('Speech services unavailable'); },
      stopRecognition: async () => ({ transcript: '', confidence: 0, isFinal: true }),
      onRecognitionResult: () => {},
      isAvailable: () => false,
      getCapabilities: () => noop,
      initialize: async () => {},
      dispose: () => {}
    };
  }

  static disposeAll(): void {
    this.instances.forEach(s => s.dispose());
    this.instances.clear();
  }

  static async isAnyServiceAvailable(): Promise<boolean> {
    const providers: SpeechProvider[] = ['web', 'azure', 'openai', 'google'];
    for (const p of providers) {
      try {
        const s = await this.getService(p);
        if (s.isAvailable()) return true;
      } catch { continue; }
    }
    return false;
  }
}
