// Provider-agnostic speech hook for TTS and STT functionality

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SpeechConfig,
  TTSOptions,
  STTOptions,
  SpeechRecognitionResult,
  VoiceInfo,
  SpeechServiceCapabilities
} from '../types/speech';
import { useAIProvider } from './useAIProvider';

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
  // Always call useAIProvider at the top level to follow React hook rules
  const { currentProvider } = useAIProvider();
  
  // Check if speech APIs are available before initializing anything
  const speechAPIsAvailable = (() => {
    if (typeof window === 'undefined') return false;
    try {
      return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition || !!window.speechSynthesis;
    } catch (error) {
      console.warn('Error checking speech API availability:', error);
      return false;
    }
  })();
  
  // If speech APIs are not available, return a minimal implementation
  if (!speechAPIsAvailable) {
    return {
      // TTS Methods
      speak: async () => { throw new Error('Speech APIs not available'); },
      stopSpeaking: () => {},
      isSpeaking: false,
      
      // STT Methods
      startListening: async () => { throw new Error('Speech APIs not available'); },
      stopListening: async () => { return ''; },
      isListening: false,
      transcript: '',
      interimTranscript: '',
      
      // Voice Management
      voices: [],
      selectedVoice: null,
      setVoice: () => {},
      
      // Service Info
      isAvailable: false,
      capabilities: null,
      currentProvider: currentProvider,
      isHTTPS: false,
      microphonePermission: 'unsupported',
      
      // Control Methods
      initialize: async () => {},
      dispose: () => {},
      
      // Error state
      error: 'Speech APIs not available in this browser'
    };
  }
  
  // Only import and use speech services if APIs are available
  const [ttsService, setTtsService] = useState<any>(null);
  const [sttService, setSttService] = useState<any>(null);
  const orchestratorRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceInfo | null>(null);
  const [capabilities, setCapabilities] = useState<SpeechServiceCapabilities | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [microphonePermission, setMicrophonePermission] = useState<PermissionState | 'unsupported'>('prompt');
  const [isHTTPS, setIsHTTPS] = useState<boolean>(false);
  
  const abortController = useRef<AbortController | null>(null);

  // Initialize speech service based on current AI provider
  const initialize = useCallback(async () => {
    if (isInitialized) {
      console.log('🎤 Speech already initialized, skipping');
      return;
    }
    
    try {
      setError(null);
      
      // Dynamically import speech services only when needed
      const { SpeechServiceFactory } = await import('../lib/speech/speechServiceFactory');
      const { SpeechOrchestrator } = await import('../lib/speech/SpeechOrchestrator');
      const { isHTTPS: checkHTTPS, getMicrophonePermission, getHTTPSRequirementMessage, canRequestMicrophoneOnHTTP } = await import('../lib/speech/speechUtils');
      
      // Update HTTPS state
      const isSecureContext = checkHTTPS();
      setIsHTTPS(isSecureContext);
      
      // Check HTTPS requirement for Web Speech API
      if (!isSecureContext) {
        const errorMsg = getHTTPSRequirementMessage();
        console.error(errorMsg);
        setError(errorMsg);
        setIsAvailable(false);
        
        // Try to check if we can still request microphone permission
        const canRequest = await canRequestMicrophoneOnHTTP();
        if (canRequest) {
          console.log('Microphone permission can be requested despite HTTP');
          setError('Speech recognition may work but requires HTTPS for best experience. ' + errorMsg);
        }
        
        return; // Don't proceed with initialization on HTTP
      }
      
      // Check microphone permission
      const permission = await getMicrophonePermission();
      setMicrophonePermission(permission);
      
      // Pick best per-capability services with comprehensive error handling
      console.log(`🎤 Initializing speech services for provider: ${currentProvider}`);
      
      let bestTTS, bestSTT;
      try {
        [bestTTS, bestSTT] = await Promise.all([
          SpeechServiceFactory.getBestServiceFor(currentProvider, 'tts', options),
          SpeechServiceFactory.getBestServiceFor(currentProvider, 'stt', options)
        ]);
      } catch (serviceError) {
        console.error('Failed to get speech services:', serviceError);
        setIsAvailable(false);
        setError('Speech services unavailable');
        return;
      }
      
      console.log(`🎤 TTS Service: ${bestTTS.constructor.name}, STT Service: ${bestSTT.constructor.name}`);

      // Initialize services with error handling
      try {
        await Promise.all([
          bestTTS.initialize(options),
          bestSTT.initialize(options)
        ]);
      } catch (initError) {
        console.warn('Speech service initialization failed:', initError);
        // Continue with partial initialization - some services might still work
      }
      
      // Set up recognition callbacks with error handling
      try {
        // Initialize orchestrator for resilient STT
        orchestratorRef.current = new SpeechOrchestrator({
          aiProvider: currentProvider,
          onResult: (result) => {
            console.log('🎤 useSpeech received result:', result);
            // CORRECT IMPLEMENTATION: Use the separate final and interim transcripts
            if (result.finalTranscript !== undefined) {
              setTranscript(result.finalTranscript);
            }
            if (result.interimTranscript !== undefined) {
              setInterimTranscript(result.interimTranscript);
            }
            if (options.onRecognitionResult) {
              console.log('🎤 Calling onRecognitionResult callback with:', result);
              options.onRecognitionResult(result);
            }
          },
          progressTimeoutMs: 30000, // 30 seconds timeout for natural speech pauses
          maxRestartsPerMinute: 10
        });
        await orchestratorRef.current.initialize(options);
        console.log('🎤 Speech orchestrator initialized successfully');
      } catch (orchestratorError) {
        console.warn('Failed to initialize speech orchestrator:', orchestratorError);
        // Continue without orchestrator - basic functionality should still work
      }
      
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
      
      // Load available voices with error handling
      try {
        const availableVoices = await bestTTS.getAvailableVoices();
        setVoices(availableVoices);
        
        // Select default voice
        if (availableVoices.length > 0 && !selectedVoice) {
          const defaultVoice = availableVoices.find(v => v.isDefault) || availableVoices[0];
          setSelectedVoice(defaultVoice);
        }
      } catch (voiceError) {
        console.warn('Failed to load available voices:', voiceError);
        setVoices([]);
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
  }, [currentProvider, isInitialized]); // Add isInitialized to dependencies

  // Initialize HTTPS state on mount
  useEffect(() => {
    const initHTTPS = async () => {
      const { isHTTPS: checkHTTPS } = await import('../lib/speech/speechUtils');
      setIsHTTPS(checkHTTPS());
    };
    initHTTPS();
  }, []);

  // Auto-initialize on mount if requested
  useEffect(() => {
    if (options.autoInitialize !== false && !isInitialized) {
      // Don't block the component if speech initialization fails
      initialize().catch(error => {
        console.warn('Speech initialization failed, but continuing:', error);
        setIsAvailable(false);
        setError('Speech services unavailable');
      });
    }
    
    return () => {
      dispose();
    };
  }, [currentProvider]); // Remove options and initialize from dependencies

  // Sync listening state with the service
  useEffect(() => {
    if (!sttService || !isInitialized) return;

    const syncListeningState = () => {
      const serviceIsListening = sttService.isListening();
      if (serviceIsListening !== isListening) {
        console.log(`🎤 Syncing listening state: ${isListening} -> ${serviceIsListening}`);
        setIsListening(serviceIsListening);
      }
    };

    // Sync immediately
    syncListeningState();

    // Set up periodic sync
    const interval = setInterval(syncListeningState, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, [sttService, isInitialized, isListening]);

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

    // Check if already listening using the service's state
    if (sttService && sttService.isListening()) {
      return;
    }
    
    // Check HTTPS and permission
    const { isHTTPS, getHTTPSRequirementMessage } = await import('../lib/speech/speechUtils');
    const isSecureContext = isHTTPS();
    
    if (!isSecureContext && microphonePermission !== 'granted') {
      const errorMessage = getHTTPSRequirementMessage();
      const error = new Error(errorMessage);
      setError(error.message);
      if (options.onRecognitionError) {
        options.onRecognitionError(error);
      }
      throw error;
    }
    
    // Warn if not secure context but allow to proceed
    if (!isSecureContext) {
      console.warn('⚠️ Speech recognition on non-HTTPS context - functionality may be limited');
    }

    setTranscript('');
    setInterimTranscript('');
    setError(null);

    try {
      await orchestratorRef.current!.start(sttOptions);
      // Update listening state after successful start
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start recognition:', error);
      setError((error as Error).message);
      if (options.onRecognitionError) {
        options.onRecognitionError(error as Error);
      }
      throw error;
    }
  }, [sttService, isInitialized, microphonePermission, options, initialize]);

  // Stop listening and get final transcript
  const stopListening = useCallback(async (): Promise<string> => {
    if (!orchestratorRef.current) {
      return transcript;
    }

    // Check if actually listening using the service's state
    if (sttService && !sttService.isListening()) {
      return transcript;
    }

    try {
      const result = await orchestratorRef.current.stop();
      setTranscript(result.transcript);
      setInterimTranscript('');
      setIsListening(false);
      return result.transcript;
    } catch (error) {
      console.error('Failed to stop recognition:', error);
      if (options.onRecognitionError) {
        options.onRecognitionError(error as Error);
      }
      return transcript;
    }
  }, [sttService, transcript, options]);

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
  const getCurrentProviderName = useCallback(async (): Promise<string> => {
    try {
      const { SpeechServiceFactory } = await import('../lib/speech/speechServiceFactory');
      const speechProvider = SpeechServiceFactory.mapAIProviderToSpeechProvider(currentProvider);
      return speechProvider.charAt(0).toUpperCase() + speechProvider.slice(1);
    } catch (error) {
      return 'Unknown';
    }
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
    currentProvider: 'Loading...', // Will be updated when speech services are initialized
    isHTTPS,
    microphonePermission,
    
    // Control Methods
    initialize,
    dispose,
    
    // Error state
    error
  };
};
