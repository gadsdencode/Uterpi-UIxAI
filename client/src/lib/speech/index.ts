// Speech Services - Main export file

export { BaseSpeechService } from './baseSpeechService';
export { WebSpeechService } from './webSpeechService';
export { AzureSpeechService } from './azureSpeechService';
export { OpenAISpeechService } from './openaiSpeechService';
export { GoogleSpeechService } from './googleSpeechService';
export { SpeechServiceFactory } from './speechServiceFactory';

// Export utilities
export * from './speechUtils';

// Re-export types
export type {
  ISpeechService,
  SpeechConfig,
  TTSOptions,
  STTOptions,
  SpeechRecognitionResult,
  SpeechSynthesisResult,
  VoiceInfo,
  SpeechServiceCapabilities,
  SpeechProvider
} from '../../types/speech';
