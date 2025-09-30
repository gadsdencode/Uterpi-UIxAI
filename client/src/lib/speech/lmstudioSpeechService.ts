// LM Studio Speech Service implementation
// Provides TTS and STT capabilities for LM Studio/Uterpi provider

import { BaseSpeechService } from './baseSpeechService';
import {
  TTSOptions,
  STTOptions,
  SpeechRecognitionResult,
  SpeechSynthesisResult,
  VoiceInfo,
  SpeechServiceCapabilities,
  SpeechConfig
} from '../../types/speech';

interface LMStudioSpeechConfig extends SpeechConfig {
  baseUrl?: string;
  apiKey?: string;
}

export class LMStudioSpeechService extends BaseSpeechService {
  private baseUrl: string = '';
  private apiKey: string = '';
  private recognition: any = null; // Web Speech API recognition instance
  private isRecording: boolean = false;
  private currentTranscript: string = '';
  private continuousMode: boolean = false;
  private recognitionResolve?: (value: SpeechRecognitionResult) => void;
  private recognitionReject?: (reason?: any) => void;

  constructor() {
    super('web'); // Use 'web' as provider type since LM Studio doesn't have native speech APIs
  }

  async initialize(config?: LMStudioSpeechConfig): Promise<void> {
    await super.initialize(config);
    
    // Check if Speech Recognition API is available before proceeding
    if (!this.isSTTAvailable() && !this.isTTSAvailable()) {
      throw new Error('Speech Recognition and Synthesis APIs are not available in this browser');
    }
    
    // Get LM Studio configuration
    this.baseUrl = config?.baseUrl || 
                  localStorage.getItem('lmstudio-base-url') || 
                  (import.meta as any).env?.VITE_LMSTUDIO_BASE_URL || 
                  'https://lmstudio.uterpi.com';
    
    this.apiKey = config?.apiKey || 
                 localStorage.getItem('lmstudio-api-key') || 
                 (import.meta as any).env?.VITE_LMSTUDIO_API_KEY || 
                 'lm-studio';
    
    console.log('LM Studio Speech Service initialized with baseUrl:', this.baseUrl);
  }

  async synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult> {
    // LM Studio doesn't have native TTS, so we fall back to Web Speech API
    // This is handled by the speech service factory fallback mechanism
    throw new Error('LM Studio does not support native TTS. Falling back to Web Speech API.');
  }

  async getAvailableVoices(): Promise<VoiceInfo[]> {
    // Return Web Speech API voices since LM Studio doesn't have native TTS
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      return voices.map(voice => ({
        id: voice.voiceURI,
        name: voice.name,
        language: voice.lang,
        gender: voice.name.toLowerCase().includes('male') ? 'male' : 
                voice.name.toLowerCase().includes('female') ? 'female' : 'neutral',
        provider: 'web' as const,
        isDefault: voice.default
      }));
    }
    return [];
  }

  async startRecognition(options?: STTOptions): Promise<void> {
    // LM Studio doesn't have native STT, so we use Web Speech API
    if (!this.isSTTAvailable()) {
      throw new Error('Speech recognition not available in this environment');
    }

    if (this.isRecording) {
      console.warn('Recognition already in progress');
      return;
    }

    // Clean up any existing recognition instance
    this.cleanupRecognition();

    this.isRecording = true;
    this.currentTranscript = '';
    this.continuousMode = options?.continuous ?? true;

    try {
      // Use Web Speech API for STT
      const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognitionConstructor) {
        console.warn('SpeechRecognition API is not available in this browser');
        this.isRecording = false;
        throw new Error('SpeechRecognition API is not available in this browser');
      }
      
      // Additional validation to ensure the constructor is callable
      if (typeof SpeechRecognitionConstructor !== 'function') {
        console.warn('SpeechRecognition constructor is not a function');
        this.isRecording = false;
        throw new Error('SpeechRecognition constructor is not a function');
      }
      
      // Ensure we're using the 'new' operator correctly
      try {
        this.recognition = new SpeechRecognitionConstructor();
        console.log('✅ LMStudio SpeechRecognition initialized successfully');
      } catch (error) {
        console.error('Failed to create SpeechRecognition instance:', error);
        this.recognition = null;
        this.isRecording = false;
        throw new Error(`Speech recognition initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      this.recognition.continuous = this.continuousMode;
      this.recognition.interimResults = options?.interimResults ?? true;
      this.recognition.maxAlternatives = options?.maxAlternatives ?? 1;
      this.recognition.lang = options?.language ?? 'en-US';

      this.recognition.onstart = () => {
        console.log('[LMStudio] 🎤 Speech Recognition started');
      };

      this.recognition.onresult = (event: any) => {
        console.log(`[LMStudio] 🎤 onresult EVENT FIRED!`, event);
        const results = event.results;
        console.log(`[LMStudio] 🎤 onresult: ${results.length} results, resultIndex: ${event.resultIndex}`);
        
        let fullTranscript = '';
        let interimTranscript = '';
        
        // Build the complete transcript from all results
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const text = r[0]?.transcript || '';
          console.log(`[LMStudio] 🔍 Processing result[${i}]: text="${text}", isFinal=${r.isFinal}`);
          if (r.isFinal) {
            fullTranscript += text + ' ';
            console.log(`[LMStudio] ✅ Final result[${i}]: "${text}"`);
          } else {
            interimTranscript = text;
            console.log(`[LMStudio] ⏳ Interim result[${i}]: "${text}"`);
          }
        }
        
        this.currentTranscript = (fullTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
        console.log(`[LMStudio] 📝 Current transcript: "${this.currentTranscript}"`);
        
        // Get the last result for alternatives and confidence
        const lastResult = results[results.length - 1];
        const alternatives = Array.from(lastResult || []).map((alt: any) => ({
          transcript: alt.transcript,
          confidence: alt.confidence || 0
        }));

        const result: SpeechRecognitionResult = {
          transcript: this.currentTranscript,
          confidence: lastResult?.[0]?.confidence || 0,
          isFinal: lastResult?.isFinal || false,
          alternatives: alternatives.length > 1 ? alternatives : undefined
        };

        console.log(`[LMStudio] 📤 Notifying result:`, result);
        this.notifyRecognitionResult(result);
      };

      this.recognition.onerror = (event: any) => {
        console.error('LM Studio Speech Recognition error:', event.error);
        this.isRecording = false;
        
        const result: SpeechRecognitionResult = {
          transcript: this.currentTranscript,
          confidence: 0,
          isFinal: true
        };
        
        if (this.recognitionResolve) {
          this.recognitionResolve(result);
        }
        
        if (this.recognitionReject) {
          this.recognitionReject(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      this.recognition.onend = () => {
        console.log('LM Studio Speech Recognition ended');
        this.isRecording = false;
        
        const result: SpeechRecognitionResult = {
          transcript: this.currentTranscript,
          confidence: 1,
          isFinal: true
        };
        
        if (this.recognitionResolve) {
          this.recognitionResolve(result);
        }
      };

      this.recognition.start();
      
    } catch (error) {
      this.isRecording = false;
      this.cleanupRecognition();
      throw new Error(`Failed to start speech recognition: ${(error as Error).message}`);
    }
  }

  async stopRecognition(): Promise<SpeechRecognitionResult> {
    if (!this.isRecording || !this.recognition) {
      return {
        transcript: this.currentTranscript,
        confidence: 1,
        isFinal: true
      };
    }

    return new Promise((resolve, reject) => {
      this.recognitionResolve = resolve;
      this.recognitionReject = reject;
      
      try {
        // Stop the recognition instance
        this.recognition.stop();
        this.isRecording = false;
      } catch (error) {
        console.error('Error stopping recognition:', error);
        this.cleanupRecognition();
        resolve({
          transcript: this.currentTranscript,
          confidence: 1,
          isFinal: true
        });
      }
    });
  }

  isAvailable(): boolean {
    // Check if Web Speech API is available (our fallback for LM Studio)
    return this.isSTTAvailable() || this.isTTSAvailable();
  }

  getCapabilities(): SpeechServiceCapabilities {
    return {
      supportsTTS: this.isTTSAvailable(),
      supportsSTT: this.isSTTAvailable(),
      supportsStreaming: false,
      supportsVoiceCloning: false,
      supportsEmotions: false,
      supportsMultiLanguage: true,
      availableVoices: [],
      availableLanguages: ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN']
    };
  }

  private isSTTAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    
    try {
      const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      return !!(SpeechRecognitionConstructor && typeof SpeechRecognitionConstructor === 'function');
    } catch (error) {
      console.warn('Error checking SpeechRecognition availability:', error);
      return false;
    }
  }

  private isTTSAvailable(): boolean {
    return typeof window !== 'undefined' && window.speechSynthesis;
  }

  private cleanupRecognition(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('Error stopping recognition during cleanup:', error);
      }
      this.recognition = null;
    }
    this.isRecording = false;
    this.recognitionResolve = undefined;
    this.recognitionReject = undefined;
  }

  dispose(): void {
    this.cleanupRecognition();
    super.dispose();
  }
}
