// Speech-related type definitions for TTS and STT functionality

// VAD (Voice Activity Detection) types
export interface VADConfig {
  sensitivity?: number;
  minSpeechDuration?: number;
  silenceTimeout?: number;
  sampleRate?: number;
  frameSize?: number;
  hopSize?: number;
  energyThreshold?: number;
  energyRatio?: number;
  spectralThreshold?: number;
  spectralCentroid?: number;
  zcrThreshold?: number;
  adaptiveThreshold?: boolean;
  noiseFloorLearning?: boolean;
  noiseFloorSamples?: number;
}

export interface VADEvent {
  type: 'speech_start' | 'speech_end' | 'speech_segment' | 'noise_detected' | 'silence_detected';
  timestamp: number;
  confidence: number;
  audioData?: Float32Array;
  duration?: number;
  energy?: number;
  spectralCentroid?: number;
  zeroCrossingRate?: number;
}

export interface VADStats {
  totalSpeechTime: number;
  totalSilenceTime: number;
  speechSegments: number;
  averageSpeechDuration: number;
  averageSilenceDuration: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number;
}

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
  // Audio processing options
  audioData?: Blob | ArrayBuffer | string; // Base64 encoded audio
  audioFormat?: string; // MIME type of audio data
  sampleRate?: number;
  channels?: number;
  // VAD options
  enableVAD?: boolean;
  vadConfig?: VADConfig;
}

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{
    transcript: string;
    confidence: number;
  }>;
  // Additional fields for better transcript handling
  finalTranscript?: string;
  interimTranscript?: string;
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
  supportsVAD: boolean;
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
  
  // Audio processing methods (new)
  processAudioData?(audioData: Blob | ArrayBuffer | string, options?: STTOptions): Promise<SpeechRecognitionResult>;
  supportsAudioProcessing?(): boolean;
  
  // Common Methods
  isAvailable(): boolean;
  getCapabilities(): SpeechServiceCapabilities;
  initialize(config?: SpeechConfig): Promise<void>;
  dispose(): void;
}
