// useSpeechInput.ts - Voice input management hook
// Extracts speech/voice functionality from useChat following SRP

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeech } from './useSpeech';
import { speechLog, classifySpeechError } from '../lib/speech/speechDebug';

const TAG = 'useSpeechInput';

const MIN_AUTO_CONFIRM_LENGTH = 3;

export type VoiceInputPhase = 'idle' | 'listening' | 'preview' | 'applied';

export interface UseSpeechInputOptions {
  onVoiceInputConfirmed?: (transcript: string) => void;
  autoConfirm?: boolean;
  autoConfirmDelay?: number;
  /** Minimum word count before auto-confirm will fire (default 2) */
  minWordsForAutoConfirm?: number;
  /** If VAD is enabled and speech_end fires, auto-stop listening after this delay (ms, 0 = disabled) */
  vadAutoStopDelay?: number;
}

export interface UseSpeechInputReturn {
  isListening: boolean;
  isSpeaking: boolean;
  speechAvailable: boolean;
  isHTTPS: boolean;
  microphonePermission: PermissionState | 'unsupported';
  speechError: string | null;
  transcript: string;
  interimTranscript: string;
  voiceTranscript: string;
  isVoiceInputPending: boolean;
  voiceInputPhase: VoiceInputPhase;
  isUserTyping: boolean;
  speakingMessageId: string | null;
  handleVoiceInput: () => Promise<void>;
  handleSpeak: (messageId: string, text: string) => Promise<void>;
  confirmVoiceInput: () => void;
  discardVoiceInput: () => void;
  clearTranscript: () => void;
  setUserTyping: (isTyping: boolean) => void;
  resetUserTypingLock: () => void;
}

export const useSpeechInput = (options: UseSpeechInputOptions = {}): UseSpeechInputReturn => {
  const {
    onVoiceInputConfirmed,
    autoConfirm = true,
    autoConfirmDelay = 500,
    minWordsForAutoConfirm = 2,
    vadAutoStopDelay = 0
  } = options;

  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isVoiceInputPending, setIsVoiceInputPending] = useState(false);
  const [voiceInputPhase, setVoiceInputPhase] = useState<VoiceInputPhase>('idle');
  const [voiceInputSource, setVoiceInputSource] = useState<'keyboard' | 'voice'>('keyboard');
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const isUserTypingRef = useRef(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const userTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadAutoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    speak,
    stopSpeaking,
    isSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    interimTranscript,
    clearTranscript,
    isAvailable: speechAvailable,
    isHTTPS,
    microphonePermission,
    error: speechError,
    vadState
  } = useSpeech({
    autoInitialize: true,
    onRecognitionResult: (result) => {
      speechLog.info(TAG, 'Recognition result received', { isFinal: result.isFinal });
    },
    onRecognitionError: (error) => {
      const info = classifySpeechError(error);
      speechLog.error(TAG, info.message);
    }
  });

  // ── Sync voice transcript from recognition results ───────────────────
  useEffect(() => {
    if (isListening && !isUserTypingRef.current && voiceInputSource === 'voice') {
      const current = transcript + (interimTranscript ? ' ' + interimTranscript : '');
      if (current.trim()) {
        setVoiceTranscript(current);
        setIsVoiceInputPending(true);
        setVoiceInputPhase('listening');
      }
    }
  }, [transcript, interimTranscript, isListening, voiceInputSource]);

  // ── VAD-based auto-stop ──────────────────────────────────────────────
  useEffect(() => {
    if (!vadAutoStopDelay || vadAutoStopDelay <= 0) return;
    if (vadState === 'silence' && isListening && voiceTranscript.trim().length > MIN_AUTO_CONFIRM_LENGTH) {
      vadAutoStopTimerRef.current = setTimeout(async () => {
        if (isListening) {
          speechLog.info(TAG, 'VAD auto-stop: speech ended, stopping listening');
          await stopListening();
        }
      }, vadAutoStopDelay);
    }
    return () => {
      if (vadAutoStopTimerRef.current) {
        clearTimeout(vadAutoStopTimerRef.current);
        vadAutoStopTimerRef.current = null;
      }
    };
  }, [vadState, isListening, voiceTranscript, vadAutoStopDelay, stopListening]);

  // ── Auto-confirm when listening stops ────────────────────────────────
  useEffect(() => {
    if (!autoConfirm) return;
    if (!isListening && isVoiceInputPending && voiceTranscript.trim()) {
      setVoiceInputPhase('preview');

      const wordCount = voiceTranscript.trim().split(/\s+/).length;
      if (wordCount < minWordsForAutoConfirm) {
        speechLog.info(TAG, `Transcript too short (${wordCount} words), staying in preview`);
        return;
      }

      const timer = setTimeout(() => {
        if (isVoiceInputPending && voiceTranscript.trim() && !isUserTypingRef.current) {
          speechLog.info(TAG, 'Auto-confirming voice input');
          onVoiceInputConfirmed?.(voiceTranscript.trim());
          setVoiceTranscript('');
          setIsVoiceInputPending(false);
          setVoiceInputSource('keyboard');
          setVoiceInputPhase('applied');
          setTimeout(() => setVoiceInputPhase('idle'), 1500);
        }
      }, autoConfirmDelay);

      return () => clearTimeout(timer);
    }
  }, [isListening, isVoiceInputPending, voiceTranscript, autoConfirm, autoConfirmDelay, minWordsForAutoConfirm, onVoiceInputConfirmed]);

  // ── Manual confirm / discard ─────────────────────────────────────────
  const confirmVoiceInput = useCallback(() => {
    if (voiceTranscript.trim()) {
      onVoiceInputConfirmed?.(voiceTranscript.trim());
      setVoiceTranscript('');
      setIsVoiceInputPending(false);
      setVoiceInputSource('keyboard');
      setVoiceInputPhase('applied');
      setTimeout(() => setVoiceInputPhase('idle'), 1500);
    }
  }, [voiceTranscript, onVoiceInputConfirmed]);

  const discardVoiceInput = useCallback(() => {
    setVoiceTranscript('');
    setIsVoiceInputPending(false);
    setVoiceInputSource('keyboard');
    setVoiceInputPhase('idle');
    clearTranscript();
  }, [clearTranscript]);

  // ── TTS speak toggle ─────────────────────────────────────────────────
  const handleSpeak = useCallback(async (messageId: string, text: string) => {
    try {
      if (speakingMessageId === messageId) {
        stopSpeaking();
        setSpeakingMessageId(null);
      } else {
        stopSpeaking();
        setSpeakingMessageId(messageId);
        await speak(text);
        setSpeakingMessageId(null);
      }
    } catch (error) {
      const info = classifySpeechError(error);
      speechLog.error(TAG, info.message);
      setSpeakingMessageId(null);
    }
  }, [speakingMessageId, speak, stopSpeaking]);

  // ── Voice input toggle ───────────────────────────────────────────────
  const handleVoiceInput = useCallback(async () => {
    try {
      const { isHTTPS: checkHTTPS } = await import('../lib/speech/speechUtils');
      if (!checkHTTPS() && microphonePermission !== 'granted') {
        const info = classifySpeechError(new Error('Requires HTTPS'));
        throw new Error(info.userMessage);
      }

      if (isListening) {
        const finalTranscript = await stopListening();
        if (finalTranscript) {
          setVoiceTranscript(finalTranscript);
          setIsVoiceInputPending(true);
          setVoiceInputPhase('preview');
        }
        setVoiceInputSource('keyboard');
      } else {
        setVoiceInputSource('voice');
        isUserTypingRef.current = false;
        setIsUserTyping(false);
        if (userTypingTimeoutRef.current) { clearTimeout(userTypingTimeoutRef.current); userTypingTimeoutRef.current = null; }
        setVoiceTranscript('');
        setIsVoiceInputPending(false);
        setVoiceInputPhase('listening');
        clearTranscript();

        await startListening({ language: 'en-US', continuous: true, interimResults: true });
      }
    } catch (error) {
      const info = classifySpeechError(error);
      setVoiceInputSource('keyboard');
      setVoiceTranscript('');
      setIsVoiceInputPending(false);
      setVoiceInputPhase('idle');
      speechLog.error(TAG, info.message);
      throw new Error(info.userMessage);
    }
  }, [isListening, startListening, stopListening, microphonePermission, clearTranscript]);

  // ── User typing coordination ─────────────────────────────────────────
  const setUserTyping = useCallback((typing: boolean) => {
    isUserTypingRef.current = typing;
    setIsUserTyping(typing);
    if (typing) {
      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
      userTypingTimeoutRef.current = setTimeout(() => {
        isUserTypingRef.current = false;
        setIsUserTyping(false);
      }, 3000);
    }
  }, []);

  const resetUserTypingLock = useCallback(() => {
    isUserTypingRef.current = false;
    setIsUserTyping(false);
    if (userTypingTimeoutRef.current) { clearTimeout(userTypingTimeoutRef.current); userTypingTimeoutRef.current = null; }
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (isListening) stopListening();
      if (isSpeaking) stopSpeaking();
      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
      if (vadAutoStopTimerRef.current) clearTimeout(vadAutoStopTimerRef.current);
    };
  }, [isListening, isSpeaking, stopListening, stopSpeaking]);

  return {
    isListening,
    isSpeaking,
    speechAvailable,
    isHTTPS,
    microphonePermission,
    speechError,
    transcript,
    interimTranscript,
    voiceTranscript,
    isVoiceInputPending,
    voiceInputPhase,
    isUserTyping,
    speakingMessageId,
    handleVoiceInput,
    handleSpeak,
    confirmVoiceInput,
    discardVoiceInput,
    clearTranscript,
    setUserTyping,
    resetUserTypingLock
  };
};
