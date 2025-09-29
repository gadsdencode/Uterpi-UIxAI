// Speech-related type definitions for TTS and STT functionality

export interface SpeechConfig {
  // TTS Configuration
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  language?: string;
  
  // STT Configuration
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  
  // Provider-specific configurations
  apiKey?: string;
  endpoint?: string;
  region?: string;
  subscriptionKey?: string;
}

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  language?: string;
  outputFormat?: 'mp3' | 'wav' | 'ogg' | 'webm';
}

export interface STTOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  profanityFilter?: boolean;
  punctuation?: boolean;
}

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{
    transcript: string;
    confidence: number;
  }>;
}

export interface SpeechSynthesisResult {
  audioData?: ArrayBuffer | Blob;
  audioUrl?: string;
  duration?: number;
}

export type SpeechProvider = 'web' | 'azure' | 'openai' | 'google' | 'elevenlabs' | 'lmstudio';

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  provider: SpeechProvider;
  isDefault?: boolean;
  previewUrl?: string;
  styles?: string[];
}

export interface SpeechServiceCapabilities {
  supportsTTS: boolean;
  supportsSTT: boolean;
  supportsStreaming: boolean;
  supportsVoiceCloning: boolean;
  supportsEmotions: boolean;
  supportsMultiLanguage: boolean;
  availableVoices: VoiceInfo[];
  availableLanguages: string[];
}

export interface ISpeechService {
  // TTS Methods
  synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult>;
  streamSpeech?(text: string, options?: TTSOptions): AsyncGenerator<ArrayBuffer, void, unknown>;
  /** Cancel any ongoing speech synthesis/playback, if supported */
  cancelSynthesis(): void;
  getAvailableVoices(): Promise<VoiceInfo[]>;
  
  // STT Methods
  startRecognition(options?: STTOptions): Promise<void>;
  stopRecognition(): Promise<SpeechRecognitionResult>;
  onRecognitionResult(callback: (result: SpeechRecognitionResult) => void): void;
  
  // Common Methods
  isAvailable(): boolean;
  getCapabilities(): SpeechServiceCapabilities;
  initialize(config?: SpeechConfig): Promise<void>;
  dispose(): void;
}
