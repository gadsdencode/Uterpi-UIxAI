// useSpeechInput.ts - Voice input management hook
// Extracts speech/voice functionality from useChat following SRP

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeech } from './useSpeech';
import { toast } from 'sonner';

export interface UseSpeechInputOptions {
  /** Callback when voice input is confirmed */
  onVoiceInputConfirmed?: (transcript: string) => void;
  /** Auto-confirm voice input after listening stops (default: true) */
  autoConfirm?: boolean;
  /** Delay before auto-confirming voice input in ms (default: 500) */
  autoConfirmDelay?: number;
}

export interface UseSpeechInputReturn {
  // Speech state
  isListening: boolean;
  isSpeaking: boolean;
  speechAvailable: boolean;
  isHTTPS: boolean;
  microphonePermission: PermissionState | 'unsupported';
  speechError: string | null;
  transcript: string;
  interimTranscript: string;
  
  // Voice input state (decoupled from keyboard input)
  voiceTranscript: string;
  isVoiceInputPending: boolean;
  
  // User typing state
  isUserTyping: boolean;
  
  // Speaking message tracking
  speakingMessageId: string | null;
  
  // Actions
  handleVoiceInput: () => Promise<void>;
  handleSpeak: (messageId: string, text: string) => Promise<void>;
  confirmVoiceInput: () => void;
  discardVoiceInput: () => void;
  clearTranscript: () => void;
  
  // Manual input management (for coordinating with keyboard input)
  setUserTyping: (isTyping: boolean) => void;
  resetUserTypingLock: () => void;
}

export const useSpeechInput = (options: UseSpeechInputOptions = {}): UseSpeechInputReturn => {
  const {
    onVoiceInputConfirmed,
    autoConfirm = true,
    autoConfirmDelay = 500
  } = options;

  // Voice input state management - decoupled from main input
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isVoiceInputPending, setIsVoiceInputPending] = useState(false);
  const [voiceInputSource, setVoiceInputSource] = useState<'keyboard' | 'voice'>('keyboard');
  
  // Speaking state
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  
  // User typing state lock - prevents transcript from overwriting manual keyboard input
  const isUserTypingRef = useRef(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const userTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Speech hook
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
    error: speechError
  } = useSpeech({
    autoInitialize: true,
    onRecognitionResult: (result) => {
      console.log('🎤 useSpeechInput onRecognitionResult:', result);
    },
    onRecognitionError: (error) => {
      console.error('🎤 useSpeechInput speech recognition error:', error);
      toast.error(`Speech recognition error: ${error.message}`);
    }
  });

  // Voice transcript state management - decoupled from main input
  useEffect(() => {
    console.log('🎤 Voice transcript effect triggered:', {
      transcript,
      interimTranscript,
      isListening,
      voiceInputSource,
      isUserTyping: isUserTypingRef.current
    });
    
    // Only update voice transcript when actively listening and not manually typing
    if (isListening && !isUserTypingRef.current && voiceInputSource === 'voice') {
      const currentTranscript = transcript + (interimTranscript ? ' ' + interimTranscript : '');
      if (currentTranscript.trim()) {
        console.log('🎤 Updating voice transcript (decoupled):', currentTranscript);
        setVoiceTranscript(currentTranscript);
        setIsVoiceInputPending(true);
      }
    }
  }, [transcript, interimTranscript, isListening, voiceInputSource]);

  // Auto-confirm voice input when listening stops
  useEffect(() => {
    if (!autoConfirm) return;
    
    if (!isListening && isVoiceInputPending && voiceTranscript.trim()) {
      console.log('🎤 Listening stopped with pending voice input, auto-confirming');
      
      const confirmTimer = setTimeout(() => {
        if (isVoiceInputPending && voiceTranscript.trim() && !isUserTypingRef.current) {
          console.log('🎤 Auto-confirming voice input:', voiceTranscript);
          
          if (onVoiceInputConfirmed) {
            onVoiceInputConfirmed(voiceTranscript.trim());
          }
          
          setVoiceTranscript('');
          setIsVoiceInputPending(false);
          setVoiceInputSource('keyboard');
        }
      }, autoConfirmDelay);
      
      return () => clearTimeout(confirmTimer);
    }
  }, [isListening, isVoiceInputPending, voiceTranscript, autoConfirm, autoConfirmDelay, onVoiceInputConfirmed]);

  // Confirm voice input explicitly
  const confirmVoiceInput = useCallback(() => {
    if (voiceTranscript.trim()) {
      console.log('🎤 Explicitly confirming voice input:', voiceTranscript);
      
      if (onVoiceInputConfirmed) {
        onVoiceInputConfirmed(voiceTranscript.trim());
      }
      
      setVoiceTranscript('');
      setIsVoiceInputPending(false);
      setVoiceInputSource('keyboard');
    }
  }, [voiceTranscript, onVoiceInputConfirmed]);

  // Discard voice input explicitly
  const discardVoiceInput = useCallback(() => {
    console.log('🎤 Discarding voice input');
    setVoiceTranscript('');
    setIsVoiceInputPending(false);
    setVoiceInputSource('keyboard');
    clearTranscript();
  }, [clearTranscript]);

  // Handle speak (text-to-speech)
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
      console.error('Failed to speak:', error);
      toast.error('Failed to speak message');
      setSpeakingMessageId(null);
    }
  }, [speakingMessageId, speak, stopSpeaking]);

  // Handle voice input toggle (speech-to-text)
  const handleVoiceInput = useCallback(async () => {
    try {
      console.log('🎤 handleVoiceInput called, isListening:', isListening);
      
      const { isHTTPS: checkHTTPS } = await import('../lib/speech/speechUtils');
      const isSecureContext = checkHTTPS();
      
      if (!isSecureContext && microphonePermission !== 'granted') {
        toast.error('🔒 Microphone access requires HTTPS. Please use a secure connection.');
        return;
      }
      
      if (isListening) {
        console.log('🎤 Stopping recording...');
        const finalTranscript = await stopListening();
        console.log('🎤 Final transcript:', finalTranscript);
        
        if (finalTranscript) {
          setVoiceTranscript(finalTranscript);
          setIsVoiceInputPending(true);
        }
        setVoiceInputSource('keyboard');
      } else {
        console.log('🎤 Starting recording...');
        
        // Set voice input source to 'voice' to enable transcript capture
        setVoiceInputSource('voice');
        
        // Reset user typing lock when starting voice input
        isUserTypingRef.current = false;
        setIsUserTyping(false);
        if (userTypingTimeoutRef.current) {
          clearTimeout(userTypingTimeoutRef.current);
          userTypingTimeoutRef.current = null;
        }
        console.log('🎤 User typing lock reset - voice input taking over');
        
        // Clear voice transcript state
        setVoiceTranscript('');
        setIsVoiceInputPending(false);
        clearTranscript();
        
        await startListening({
          language: 'en-US',
          continuous: true,
          interimResults: true
        });
        console.log('🎤 Recording started successfully');
      }
    } catch (error) {
      console.error('🎤 Voice input error:', error);
      const errorMessage = (error as Error).message || 'Voice input failed';
      
      // Reset voice state on error
      setVoiceInputSource('keyboard');
      setVoiceTranscript('');
      setIsVoiceInputPending(false);
      
      if (errorMessage.includes('permission')) {
        toast.error('🎤 Microphone permission denied. Please allow microphone access and try again.');
      } else if (errorMessage.includes('not-allowed')) {
        toast.error('🔒 Microphone access blocked. Check your browser settings.');
      } else if (errorMessage.includes('network')) {
        toast.error('🌐 Network error. Please check your internet connection.');
      } else {
        toast.error(`🎤 ${errorMessage}`);
      }
    }
  }, [isListening, startListening, stopListening, microphonePermission, clearTranscript]);

  // Set user typing state (for coordinating with keyboard input)
  const setUserTyping = useCallback((isTyping: boolean) => {
    isUserTypingRef.current = isTyping;
    setIsUserTyping(isTyping);
    
    if (isTyping) {
      // Clear any existing timeout
      if (userTypingTimeoutRef.current) {
        clearTimeout(userTypingTimeoutRef.current);
      }
      
      // Reset the lock after user stops typing for 3 seconds
      userTypingTimeoutRef.current = setTimeout(() => {
        isUserTypingRef.current = false;
        setIsUserTyping(false);
      }, 3000);
    }
  }, []);

  // Reset user typing lock
  const resetUserTypingLock = useCallback(() => {
    isUserTypingRef.current = false;
    setIsUserTyping(false);
    if (userTypingTimeoutRef.current) {
      clearTimeout(userTypingTimeoutRef.current);
      userTypingTimeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListening) {
        stopListening();
      }
      if (isSpeaking) {
        stopSpeaking();
      }
      if (userTypingTimeoutRef.current) {
        clearTimeout(userTypingTimeoutRef.current);
      }
    };
  }, [isListening, isSpeaking, stopListening, stopSpeaking]);

  return {
    // Speech state
    isListening,
    isSpeaking,
    speechAvailable,
    isHTTPS,
    microphonePermission,
    speechError,
    transcript,
    interimTranscript,
    
    // Voice input state
    voiceTranscript,
    isVoiceInputPending,
    
    // User typing state
    isUserTyping,
    
    // Speaking message tracking
    speakingMessageId,
    
    // Actions
    handleVoiceInput,
    handleSpeak,
    confirmVoiceInput,
    discardVoiceInput,
    clearTranscript,
    
    // Manual input management
    setUserTyping,
    resetUserTypingLock
  };
};

