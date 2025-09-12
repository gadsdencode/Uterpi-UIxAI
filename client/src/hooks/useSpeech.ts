// Provider-agnostic speech hook for TTS and STT functionality

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAIProvider } from './useAIProvider';
import { SpeechServiceFactory } from '../lib/speech/speechServiceFactory';
import { SpeechOrchestrator } from '../lib/speech/SpeechOrchestrator';
import {
  ISpeechService,
  SpeechConfig,
  TTSOptions,
  STTOptions,
  SpeechRecognitionResult,
  VoiceInfo,
  SpeechServiceCapabilities
} from '../types/speech';
import { isHTTPS, getMicrophonePermission } from '../lib/speech/speechUtils';

interface UseSpeechOptions extends SpeechConfig {
  autoInitialize?: boolean;
  onRecognitionResult?: (result: SpeechRecognitionResult) => void;
  onRecognitionError?: (error: Error) => void;
  onSynthesisComplete?: () => void;
  onSynthesisError?: (error: Error) => void;
}

interface UseSpeechReturn {
  // TTS Methods
  speak: (text: string, options?: TTSOptions) => Promise<void>;
  stopSpeaking: () => void;
  isSpeaking: boolean;
  
  // STT Methods
  startListening: (options?: STTOptions) => Promise<void>;
  stopListening: () => Promise<string>;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  
  // Voice Management
  voices: VoiceInfo[];
  selectedVoice: VoiceInfo | null;
  setVoice: (voice: VoiceInfo | string) => void;
  
  // Service Info
  isAvailable: boolean;
  capabilities: SpeechServiceCapabilities | null;
  currentProvider: string;
  isHTTPS: boolean;
  microphonePermission: PermissionState | 'unsupported';
  
  // Control Methods
  initialize: () => Promise<void>;
  dispose: () => void;
  
  // Error state
  error: string | null;
}

export const useSpeech = (options: UseSpeechOptions = {}): UseSpeechReturn => {
  const { currentProvider } = useAIProvider();
  const [ttsService, setTtsService] = useState<ISpeechService | null>(null);
  const [sttService, setSttService] = useState<ISpeechService | null>(null);
  const orchestratorRef = useRef<SpeechOrchestrator | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceInfo | null>(null);
  const [capabilities, setCapabilities] = useState<SpeechServiceCapabilities | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [microphonePermission, setMicrophonePermission] = useState<PermissionState | 'unsupported'>('prompt');
  
  const abortController = useRef<AbortController | null>(null);

  // Initialize speech service based on current AI provider
  const initialize = useCallback(async () => {
    try {
      setError(null);
      
      // Check HTTPS requirement for Web Speech API
      if (!isHTTPS()) {
        const warningMsg = 'Speech recognition requires HTTPS. Microphone access may be limited on HTTP.';
        console.warn(warningMsg);
        setError(warningMsg);
      }
      
      // Check microphone permission
      const permission = await getMicrophonePermission();
      setMicrophonePermission(permission);
      
      // Pick best per-capability services
      const [bestTTS, bestSTT] = await Promise.all([
        SpeechServiceFactory.getBestServiceFor(currentProvider, 'tts', options),
        SpeechServiceFactory.getBestServiceFor(currentProvider, 'stt', options)
      ]);

      await Promise.all([
        bestTTS.initialize(options),
        bestSTT.initialize(options)
      ]);
      
      // Set up recognition callbacks
      // Initialize orchestrator for resilient STT
      orchestratorRef.current = new SpeechOrchestrator({
        aiProvider: currentProvider,
        onResult: (result) => {
          if (result.isFinal) {
            setTranscript(result.transcript);
            setInterimTranscript('');
          } else {
            setInterimTranscript(result.transcript);
            setTranscript(result.transcript);
          }
          if (options.onRecognitionResult) {
            options.onRecognitionResult(result);
          }
        },
        progressTimeoutMs: 5000,
        maxRestartsPerMinute: 5
      });
      await orchestratorRef.current.initialize(options);
      
      setTtsService(bestTTS);
      setSttService(bestSTT);
      setIsAvailable(bestTTS.isAvailable() || bestSTT.isAvailable());
      // Merge capabilities conservatively
      const ttsCaps = bestTTS.getCapabilities();
      const sttCaps = bestSTT.getCapabilities();
      setCapabilities({
        supportsTTS: ttsCaps.supportsTTS,
        supportsSTT: sttCaps.supportsSTT,
        supportsStreaming: ttsCaps.supportsStreaming || sttCaps.supportsStreaming,
        supportsVoiceCloning: ttsCaps.supportsVoiceCloning || sttCaps.supportsVoiceCloning,
        supportsEmotions: ttsCaps.supportsEmotions || sttCaps.supportsEmotions,
        supportsMultiLanguage: ttsCaps.supportsMultiLanguage || sttCaps.supportsMultiLanguage,
        availableVoices: ttsCaps.availableVoices?.length ? ttsCaps.availableVoices : sttCaps.availableVoices,
        availableLanguages: Array.from(new Set([...(ttsCaps.availableLanguages||[]), ...(sttCaps.availableLanguages||[])]))
      });
      
      // Load available voices
      const availableVoices = await bestTTS.getAvailableVoices();
      setVoices(availableVoices);
      
      // Select default voice
      if (availableVoices.length > 0 && !selectedVoice) {
        const defaultVoice = availableVoices.find(v => v.isDefault) || availableVoices[0];
        setSelectedVoice(defaultVoice);
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize speech service:', error);
      setIsAvailable(false);
      setError((error as Error).message);
      if (options.onRecognitionError) {
        options.onRecognitionError(error as Error);
      }
    }
  }, [currentProvider, options]);

  // Auto-initialize on mount if requested
  useEffect(() => {
    if (options.autoInitialize !== false) {
      initialize();
    }
    
    return () => {
      dispose();
    };
  }, [currentProvider]);

  // Speak text using TTS
  const speak = useCallback(async (text: string, ttsOptions?: TTSOptions) => {
    if (!ttsService || !isInitialized) {
      await initialize();
      if (!ttsService) {
        throw new Error('Speech service not available');
      }
    }

    setIsSpeaking(true);
    abortController.current = new AbortController();

    try {
      const speakOptions: TTSOptions = {
        ...ttsOptions,
        voice: selectedVoice?.id || ttsOptions?.voice
      };

      await ttsService!.synthesizeSpeech(text, speakOptions);
      
      if (options.onSynthesisComplete) {
        options.onSynthesisComplete();
      }
    } catch (error) {
      console.error('Speech synthesis error:', error);
      if (options.onSynthesisError) {
        options.onSynthesisError(error as Error);
      }
      throw error;
    } finally {
      setIsSpeaking(false);
      abortController.current = null;
    }
  }, [ttsService, isInitialized, selectedVoice, options, initialize]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    ttsService?.cancelSynthesis();
    if (abortController.current) {
      abortController.current.abort();
    }
    setIsSpeaking(false);
  }, [ttsService]);

  // Start listening for speech input
  const startListening = useCallback(async (sttOptions?: STTOptions) => {
    if (!orchestratorRef.current || !isInitialized) {
      await initialize();
      if (!orchestratorRef.current) {
        throw new Error('Speech service not available');
      }
    }

    if (isListening) {
      return;
    }
    
    // Check HTTPS and permission
    if (!isHTTPS() && microphonePermission !== 'granted') {
      const error = new Error('Microphone access requires HTTPS or previously granted permission');
      setError(error.message);
      if (options.onRecognitionError) {
        options.onRecognitionError(error);
      }
      throw error;
    }

    setIsListening(true);
    setTranscript('');
    setInterimTranscript('');
    setError(null);

    try {
      await orchestratorRef.current!.start(sttOptions);
    } catch (error) {
      console.error('Failed to start recognition:', error);
      setIsListening(false);
      setError((error as Error).message);
      if (options.onRecognitionError) {
        options.onRecognitionError(error as Error);
      }
      throw error;
    }
  }, [sttService, isInitialized, isListening, microphonePermission, options, initialize]);

  // Stop listening and get final transcript
  const stopListening = useCallback(async (): Promise<string> => {
    if (!orchestratorRef.current || !isListening) {
      return transcript;
    }

    try {
      const result = await orchestratorRef.current.stop();
      setTranscript(result.transcript);
      setInterimTranscript('');
      return result.transcript;
    } catch (error) {
      console.error('Failed to stop recognition:', error);
      if (options.onRecognitionError) {
        options.onRecognitionError(error as Error);
      }
      return transcript;
    } finally {
      setIsListening(false);
    }
  }, [sttService, isListening, transcript, options]);

  // Set voice by VoiceInfo or voice ID
  const setVoice = useCallback((voice: VoiceInfo | string) => {
    if (typeof voice === 'string') {
      const foundVoice = voices.find(v => v.id === voice || v.name === voice);
      if (foundVoice) {
        setSelectedVoice(foundVoice);
      }
    } else {
      setSelectedVoice(voice);
    }
  }, [voices]);

  // Dispose of resources
  const dispose = useCallback(() => {
    if (ttsService) { ttsService.dispose(); }
    if (orchestratorRef.current) { orchestratorRef.current.dispose(); }
    stopSpeaking();
    if (isListening) {
      stopListening();
    }
    setTtsService(null);
    setSttService(null);
    setIsInitialized(false);
  }, [ttsService, sttService, isListening, stopSpeaking, stopListening]);

  // Get current speech provider name
  const getCurrentProviderName = useCallback((): string => {
    const speechProvider = SpeechServiceFactory.mapAIProviderToSpeechProvider(currentProvider);
    return speechProvider.charAt(0).toUpperCase() + speechProvider.slice(1);
  }, [currentProvider]);

  return {
    // TTS Methods
    speak,
    stopSpeaking,
    isSpeaking,
    
    // STT Methods
    startListening,
    stopListening,
    isListening,
    transcript,
    interimTranscript,
    
    // Voice Management
    voices,
    selectedVoice,
    setVoice,
    
    // Service Info
    isAvailable,
    capabilities,
    currentProvider: getCurrentProviderName(),
    isHTTPS: isHTTPS(),
    microphonePermission,
    
    // Control Methods
    initialize,
    dispose,
    
    // Error state
    error
  };
};
