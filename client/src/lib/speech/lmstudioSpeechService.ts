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
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private currentTranscript: string = '';
  private continuousMode: boolean = false;
  private recognitionResolve?: (value: SpeechRecognitionResult) => void;

  constructor() {
    super('web'); // Use 'web' as provider type since LM Studio doesn't have native speech APIs
  }

  async initialize(config?: LMStudioSpeechConfig): Promise<void> {
    await super.initialize(config);
    
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
      return;
    }

    this.isRecording = true;
    this.currentTranscript = '';
    this.continuousMode = options?.continuous ?? true;

    try {
      // Use Web Speech API for STT
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = this.continuousMode;
      recognition.interimResults = options?.interimResults ?? true;
      recognition.maxAlternatives = options?.maxAlternatives ?? 1;
      recognition.lang = options?.language ?? 'en-US';

      recognition.onresult = (event: any) => {
        const results = event.results;
        let fullTranscript = '';
        let interimTranscript = '';
        
        // Build the complete transcript from all results
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const text = r[0]?.transcript || '';
          if (r.isFinal) {
            fullTranscript += text + ' ';
          } else {
            interimTranscript = text;
          }
        }
        
        this.currentTranscript = (fullTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
        
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

        this.notifyRecognitionResult(result);
      };

      recognition.onerror = (event: any) => {
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
      };

      recognition.onend = () => {
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

      recognition.start();
      
    } catch (error) {
      this.isRecording = false;
      throw new Error(`Failed to start speech recognition: ${(error as Error).message}`);
    }
  }

  async stopRecognition(): Promise<SpeechRecognitionResult> {
    if (!this.isRecording) {
      return {
        transcript: this.currentTranscript,
        confidence: 1,
        isFinal: true
      };
    }

    return new Promise((resolve) => {
      this.recognitionResolve = resolve;
      this.isRecording = false;
      
      // Stop any active recognition
      if (typeof window !== 'undefined' && window.SpeechRecognition) {
        // The recognition will stop automatically and trigger onend
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
    return typeof window !== 'undefined' && 
           (window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  private isTTSAvailable(): boolean {
    return typeof window !== 'undefined' && window.speechSynthesis;
  }
}
