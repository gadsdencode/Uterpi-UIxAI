// Provider-agnostic speech hook for TTS and STT functionality

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SpeechConfig,
  TTSOptions,
  STTOptions,
  SpeechRecognitionResult,
  VoiceInfo,
  SpeechServiceCapabilities,
  VADConfig,
  VADEvent,
  VADStats
} from '../types/speech';
import { AudioRecorderConfig } from '../lib/speech/audioRecorder';
import { useAIProvider } from './useAIProvider';
import { probeBrowserSpeechCaps } from '../lib/speech/speechServiceFactory';
import { speechLog, CanonicalSTTResult, classifySpeechError } from '../lib/speech/speechDebug';

const TAG = 'useSpeech';

interface UseSpeechOptions extends SpeechConfig {
  autoInitialize?: boolean;
  onRecognitionResult?: (result: SpeechRecognitionResult) => void;
  onRecognitionError?: (error: Error) => void;
  onSynthesisComplete?: () => void;
  onSynthesisError?: (error: Error) => void;
  useAudioRecording?: boolean;
  audioConfig?: AudioRecorderConfig;
  audioProcessing?: {
    format?: 'wav' | 'mp3' | 'webm' | 'ogg';
    quality?: 'low' | 'medium' | 'high';
    compression?: boolean;
    noiseReduction?: boolean;
    normalize?: boolean;
  };
  enableVAD?: boolean;
  vadConfig?: VADConfig;
  onVADEvent?: (event: VADEvent) => void;
}

interface UseSpeechReturn {
  speak: (text: string, options?: TTSOptions) => Promise<void>;
  stopSpeaking: () => void;
  isSpeaking: boolean;
  startListening: (options?: STTOptions) => Promise<void>;
  stopListening: () => Promise<string>;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  clearTranscript: () => void;
  startAudioRecording: () => Promise<void>;
  stopAudioRecording: () => Promise<string>;
  isAudioRecording: boolean;
  audioRecordingDuration: number;
  enableVAD: boolean;
  vadState: 'silence' | 'speech' | 'noise' | null;
  vadStats: VADStats | null;
  updateVADConfig: (config: Partial<VADConfig>) => void;
  voices: VoiceInfo[];
  selectedVoice: VoiceInfo | null;
  setVoice: (voice: VoiceInfo | string) => void;
  isAvailable: boolean;
  capabilities: SpeechServiceCapabilities | null;
  currentProvider: string;
  isHTTPS: boolean;
  microphonePermission: PermissionState | 'unsupported';
  initialize: () => Promise<void>;
  dispose: () => void;
  error: string | null;
}

export const useSpeech = (options: UseSpeechOptions = {}): UseSpeechReturn => {
  const { currentProvider } = useAIProvider();

  // Single centralized browser-level check via the factory probe
  const browserCaps = probeBrowserSpeechCaps();
  const speechAPIsAvailable = browserCaps.hasSpeechRecognition || browserCaps.hasSpeechSynthesis;

  // Minimal stub when APIs are completely absent
  if (!speechAPIsAvailable) {
    return {
      speak: async () => { throw new Error('Speech APIs not available'); },
      stopSpeaking: () => {},
      isSpeaking: false,
      startListening: async () => { throw new Error('Speech APIs not available'); },
      stopListening: async () => '',
      isListening: false,
      transcript: '',
      interimTranscript: '',
      clearTranscript: () => {},
      startAudioRecording: async () => { throw new Error('Speech APIs not available'); },
      stopAudioRecording: async () => '',
      isAudioRecording: false,
      audioRecordingDuration: 0,
      enableVAD: false,
      vadState: null,
      vadStats: null,
      updateVADConfig: () => {},
      voices: [],
      selectedVoice: null,
      setVoice: () => {},
      isAvailable: false,
      capabilities: null,
      currentProvider,
      isHTTPS: false,
      microphonePermission: 'unsupported',
      initialize: async () => {},
      dispose: () => {},
      error: 'Speech APIs not available in this browser'
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────────────────────────────────
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
  const [isHTTPS, setIsHTTPS] = useState(false);
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioRecordingDuration, setAudioRecordingDuration] = useState(0);
  const audioRecordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [vadState, setVadState] = useState<'silence' | 'speech' | 'noise' | null>(null);
  const [vadStats, setVadStats] = useState<VADStats | null>(null);
  const abortController = useRef<AbortController | null>(null);

  // ────────────────────────────────────────────────────────────────────────
  // Initialize
  // ────────────────────────────────────────────────────────────────────────
  const initialize = useCallback(async () => {
    if (isInitialized) return;
    try {
      setError(null);

      const { SpeechServiceFactory } = await import('../lib/speech/speechServiceFactory');
      const { SpeechOrchestrator } = await import('../lib/speech/SpeechOrchestrator');
      const { isHTTPS: checkHTTPS, getMicrophonePermission, getHTTPSRequirementMessage, canRequestMicrophoneOnHTTP } = await import('../lib/speech/speechUtils');

      const isSecureContext = checkHTTPS();
      setIsHTTPS(isSecureContext);

      if (!isSecureContext) {
        const errorMsg = getHTTPSRequirementMessage();
        setError(errorMsg);
        setIsAvailable(false);
        const canRequest = await canRequestMicrophoneOnHTTP();
        if (canRequest) {
          setError('Speech recognition may work but requires HTTPS for best experience. ' + errorMsg);
        }
        return;
      }

      const permission = await getMicrophonePermission();
      setMicrophonePermission(permission);

      speechLog.info(TAG, `Initializing for provider: ${currentProvider}`);

      let bestTTS, bestSTT;
      try {
        [bestTTS, bestSTT] = await Promise.all([
          SpeechServiceFactory.getBestServiceFor(currentProvider, 'tts', options),
          SpeechServiceFactory.getBestServiceFor(currentProvider, 'stt', options)
        ]);
      } catch {
        setIsAvailable(false);
        setError('Speech services unavailable');
        return;
      }

      try {
        await Promise.all([bestTTS.initialize(options), bestSTT.initialize(options)]);
      } catch (initError) {
        speechLog.warn(TAG, 'Partial init failure — continuing', initError);
      }

      // Orchestrator — single canonical pipeline
      try {
        orchestratorRef.current = new SpeechOrchestrator({
          aiProvider: currentProvider,
          onResult: (canonical: CanonicalSTTResult) => {
            setTranscript(canonical.finalTranscript);
            setInterimTranscript(canonical.interimTranscript);
            if (options.onRecognitionResult) {
              options.onRecognitionResult({
                transcript: canonical.displayTranscript,
                confidence: canonical.confidence,
                isFinal: canonical.isFinal,
                finalTranscript: canonical.finalTranscript,
                interimTranscript: canonical.interimTranscript
              });
            }
          },
          progressTimeoutMs: 30000,
          maxRestartsPerMinute: 10,
          useAudioRecording: options.useAudioRecording || false,
          audioConfig: options.audioConfig,
          audioProcessing: options.audioProcessing,
          enableVAD: options.enableVAD || false,
          vadConfig: options.vadConfig,
          onVADEvent: (event: VADEvent) => {
            setVadState(
              event.type === 'speech_start' ? 'speech' :
              event.type === 'noise_detected' ? 'noise' : 'silence'
            );
            if (orchestratorRef.current) {
              const stats = orchestratorRef.current.getVADStats();
              if (stats) setVadStats(stats);
            }
            options.onVADEvent?.(event);
          }
        });
        await orchestratorRef.current.initialize(options);
        speechLog.info(TAG, 'Orchestrator initialized');
      } catch (err) {
        speechLog.warn(TAG, 'Orchestrator init failed — basic functionality may still work', err);
      }

      setTtsService(bestTTS);
      setSttService(bestSTT);
      setIsAvailable(bestTTS.isAvailable() || bestSTT.isAvailable());

      const ttsCaps = bestTTS.getCapabilities();
      const sttCaps = bestSTT.getCapabilities();
      setCapabilities({
        supportsTTS: ttsCaps.supportsTTS,
        supportsSTT: sttCaps.supportsSTT,
        supportsStreaming: ttsCaps.supportsStreaming || sttCaps.supportsStreaming,
        supportsVoiceCloning: ttsCaps.supportsVoiceCloning || sttCaps.supportsVoiceCloning,
        supportsEmotions: ttsCaps.supportsEmotions || sttCaps.supportsEmotions,
        supportsMultiLanguage: ttsCaps.supportsMultiLanguage || sttCaps.supportsMultiLanguage,
        supportsVAD: options.enableVAD || false,
        availableVoices: ttsCaps.availableVoices?.length ? ttsCaps.availableVoices : sttCaps.availableVoices,
        availableLanguages: Array.from(new Set([...(ttsCaps.availableLanguages || []), ...(sttCaps.availableLanguages || [])]))
      });

      try {
        const availableVoices = await bestTTS.getAvailableVoices();
        setVoices(availableVoices);
        if (availableVoices.length > 0 && !selectedVoice) {
          setSelectedVoice(availableVoices.find((v: VoiceInfo) => v.isDefault) || availableVoices[0]);
        }
      } catch {
        setVoices([]);
      }

      setIsInitialized(true);
    } catch (err) {
      const info = classifySpeechError(err);
      speechLog.error(TAG, info.message);
      setIsAvailable(false);
      setError(info.userMessage);
      options.onRecognitionError?.(err as Error);
    }
  }, [currentProvider, isInitialized]);

  // HTTPS state on mount
  useEffect(() => {
    (async () => {
      const { isHTTPS: checkHTTPS } = await import('../lib/speech/speechUtils');
      setIsHTTPS(checkHTTPS());
    })();
  }, []);

  // Auto-init
  useEffect(() => {
    if (options.autoInitialize !== false && !isInitialized) {
      initialize().catch(() => {
        setIsAvailable(false);
        setError('Speech services unavailable');
      });
    }
    return () => { dispose(); };
  }, [currentProvider]);

  // Sync listening state with service
  useEffect(() => {
    if (!sttService || !isInitialized) return;
    const sync = () => {
      const serviceListening = sttService.isListening();
      if (serviceListening !== isListening) setIsListening(serviceListening);
    };
    sync();
    const id = setInterval(sync, 1000);
    return () => clearInterval(id);
  }, [sttService, isInitialized]);

  // ────────────────────────────────────────────────────────────────────────
  // TTS
  // ────────────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string, ttsOptions?: TTSOptions) => {
    if (!ttsService || !isInitialized) {
      await initialize();
      if (!ttsService) throw new Error('Speech service not available');
    }
    setIsSpeaking(true);
    abortController.current = new AbortController();
    try {
      await ttsService!.synthesizeSpeech(text, { ...ttsOptions, voice: selectedVoice?.id || ttsOptions?.voice });
      options.onSynthesisComplete?.();
    } catch (err) {
      options.onSynthesisError?.(err as Error);
      throw err;
    } finally {
      setIsSpeaking(false);
      abortController.current = null;
    }
  }, [ttsService, isInitialized, selectedVoice, options, initialize]);

  const stopSpeaking = useCallback(() => {
    ttsService?.cancelSynthesis();
    abortController.current?.abort();
    setIsSpeaking(false);
  }, [ttsService]);

  // ────────────────────────────────────────────────────────────────────────
  // STT
  // ────────────────────────────────────────────────────────────────────────
  const startListening = useCallback(async (sttOptions?: STTOptions) => {
    if (!orchestratorRef.current || !isInitialized) {
      await initialize();
      if (!orchestratorRef.current) throw new Error('Speech service not available');
    }
    if (sttService?.isListening()) return;

    const { isHTTPS: checkHTTPS, getHTTPSRequirementMessage } = await import('../lib/speech/speechUtils');
    if (!checkHTTPS() && microphonePermission !== 'granted') {
      const msg = getHTTPSRequirementMessage();
      setError(msg);
      options.onRecognitionError?.(new Error(msg));
      throw new Error(msg);
    }

    setTranscript('');
    setInterimTranscript('');
    setError(null);

    try {
      await orchestratorRef.current!.start(sttOptions);
      setIsListening(true);
      speechLog.info(TAG, 'Listening started');
    } catch (err) {
      const info = classifySpeechError(err);
      setError(info.userMessage);
      setIsListening(false);
      options.onRecognitionError?.(err as Error);
      throw err;
    }
  }, [sttService, isInitialized, microphonePermission, options, initialize]);

  const stopListening = useCallback(async (): Promise<string> => {
    if (!orchestratorRef.current) return transcript;
    if (sttService && !sttService.isListening()) return transcript;
    try {
      const result = await orchestratorRef.current.stop();
      setTranscript(result.finalTranscript || result.displayTranscript);
      setInterimTranscript('');
      setIsListening(false);
      speechLog.info(TAG, 'Listening stopped');
      return result.displayTranscript;
    } catch (err) {
      setIsListening(false);
      options.onRecognitionError?.(err as Error);
      return transcript;
    }
  }, [sttService, transcript, options]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // Audio recording helpers
  // ────────────────────────────────────────────────────────────────────────
  const startAudioRecording = useCallback(async (): Promise<void> => {
    if (!orchestratorRef.current) throw new Error('Speech service not initialized');
    if (isAudioRecording) return;
    try {
      setIsAudioRecording(true);
      setAudioRecordingDuration(0);
      setTranscript('');
      setInterimTranscript('');
      setError(null);
      await orchestratorRef.current.start({ continuous: true, interimResults: true, language: options.language || 'en-US' });
      const start = Date.now();
      audioRecordingTimerRef.current = setInterval(() => setAudioRecordingDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    } catch (err) {
      setIsAudioRecording(false);
      const info = classifySpeechError(err);
      setError(info.userMessage);
      options.onRecognitionError?.(err as Error);
      throw err;
    }
  }, [isAudioRecording, options]);

  const stopAudioRecording = useCallback(async (): Promise<string> => {
    if (!orchestratorRef.current || !isAudioRecording) return transcript;
    try {
      const result = await orchestratorRef.current.stop();
      setTranscript(result.displayTranscript);
      setInterimTranscript('');
      setIsAudioRecording(false);
      setAudioRecordingDuration(0);
      if (audioRecordingTimerRef.current) { clearInterval(audioRecordingTimerRef.current); audioRecordingTimerRef.current = null; }
      return result.displayTranscript;
    } catch (err) {
      setIsAudioRecording(false);
      setAudioRecordingDuration(0);
      options.onRecognitionError?.(err as Error);
      return transcript;
    }
  }, [isAudioRecording, transcript, options]);

  // ────────────────────────────────────────────────────────────────────────
  // Voice / VAD / Dispose
  // ────────────────────────────────────────────────────────────────────────
  const setVoice = useCallback((voice: VoiceInfo | string) => {
    if (typeof voice === 'string') {
      const found = voices.find(v => v.id === voice || v.name === voice);
      if (found) setSelectedVoice(found);
    } else {
      setSelectedVoice(voice);
    }
  }, [voices]);

  const updateVADConfig = useCallback((config: Partial<VADConfig>) => {
    orchestratorRef.current?.updateVADConfig(config);
  }, []);

  const dispose = useCallback(() => {
    ttsService?.dispose();
    orchestratorRef.current?.dispose();
    stopSpeaking();
    if (isListening) stopListening();
    if (isAudioRecording) stopAudioRecording();
    if (audioRecordingTimerRef.current) { clearInterval(audioRecordingTimerRef.current); audioRecordingTimerRef.current = null; }
    setTtsService(null);
    setSttService(null);
    setIsInitialized(false);
  }, [ttsService, sttService, isListening, isAudioRecording, stopSpeaking, stopListening, stopAudioRecording]);

  return {
    speak,
    stopSpeaking,
    isSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    interimTranscript,
    clearTranscript,
    startAudioRecording,
    stopAudioRecording,
    isAudioRecording,
    audioRecordingDuration,
    enableVAD: options.enableVAD || false,
    vadState,
    vadStats,
    updateVADConfig,
    voices,
    selectedVoice,
    setVoice,
    isAvailable,
    capabilities,
    currentProvider,
    isHTTPS,
    microphonePermission,
    initialize,
    dispose,
    error
  };
};
