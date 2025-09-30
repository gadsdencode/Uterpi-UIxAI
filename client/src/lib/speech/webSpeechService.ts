// Web Speech API implementation (browser native, fallback provider)

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

// Web Speech API types are now defined in speech-global.d.ts

export class WebSpeechService extends BaseSpeechService {
  private recognition: SpeechRecognition | null = null;
  private currentTranscript: string = '';
  private isRecording: boolean = false;
  private recognitionResolve?: (value: SpeechRecognitionResult) => void;
  private continuousMode: boolean = false;
  private fullTranscript: string = '';
  private restartTimer?: NodeJS.Timeout;
  private lastResultTime: number = 0;
  private silenceTimer?: NodeJS.Timeout;
  private silenceTimeoutMs: number = 12000; // 12 seconds of silence before restart (optimized for natural speech)
  private consecutiveSilenceCount: number = 0;
  private maxConsecutiveSilence: number = 2; // Max 2 consecutive silence periods before forcing restart
  private isRestarting: boolean = false;
  private performanceMetrics: {
    totalResults: number;
    averageConfidence: number;
    lastPerformanceCheck: number;
  } = {
    totalResults: 0,
    averageConfidence: 0,
    lastPerformanceCheck: Date.now()
  };
  private restartAttempts: number = 0;
  private maxRestartAttempts: number = 1000000;
  private pendingRestart: boolean = false;
  private utteranceQueue: SpeechSynthesisUtterance[] = [];
  private isSpeaking: boolean = false;
  private explicitlyStopped: boolean = false;
  private recognitionRunning: boolean = false;

  constructor() {
    super('web');
  }

  async initialize(config?: SpeechConfig): Promise<void> {
    await super.initialize(config);
    
    // Check if any speech APIs are available before proceeding
    if (!this.isSTTAvailable() && !this.isTTSAvailable()) {
      throw new Error('Speech Recognition and Synthesis APIs are not available in this browser');
    }
    
    // Initialize speech recognition if available
    if (this.isSTTAvailable()) {
      try {
        const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (!SpeechRecognitionConstructor) {
          console.warn('SpeechRecognition API is not available in this browser');
          return; // Don't throw, just skip STT initialization
        }
        
        // Additional validation to ensure the constructor is callable
        if (typeof SpeechRecognitionConstructor !== 'function') {
          console.warn('SpeechRecognition constructor is not a function');
          return; // Don't throw, just skip STT initialization
        }
        
        // Ensure we're using the 'new' operator correctly
        this.recognition = new SpeechRecognitionConstructor();
        this.setupRecognition();
        console.log('✅ SpeechRecognition initialized successfully');
      } catch (error) {
        console.error('Failed to create SpeechRecognition instance:', error);
        // Don't throw the error, just log it and continue without STT
        this.recognition = null;
        console.warn('Speech recognition will be disabled due to initialization error');
      }
    }
  }

  private setupRecognition(): void {
    if (!this.recognition) return;

    // CRITICAL: These settings are essential for speech recognition to work
    this.recognition.continuous = true; // Must be true for continuous recognition
    this.recognition.interimResults = true; // Must be true to get interim results
    this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1; // Keep at 1 for faster processing
    this.recognition.lang = this.config.language ?? 'en-US';
    
    // Add grammar support for better accuracy (if available)
    if ('webkitSpeechGrammarList' in window) {
      const grammarList = new (window as any).webkitSpeechGrammarList();
      // Add common words/phrases for better recognition
      const grammar = '#JSGF V1.0; grammar common; public <common> = hello | hi | yes | no | stop | start | help;';
      grammarList.addFromString(grammar, 1);
      this.recognition.grammars = grammarList;
    }
    
    console.log('[WebSpeech] Recognition configured with:', {
      continuous: this.recognition.continuous,
      interimResults: this.recognition.interimResults,
      maxAlternatives: this.recognition.maxAlternatives,
      lang: this.recognition.lang
    });

    this.recognition.onresult = (event: any) => {
      console.log(`[WebSpeech] 🎤 onresult EVENT FIRED!`, event);
      this.lastResultTime = Date.now();
      this.resetSilenceTimer();
      
      const results = event.results;
      if (!results || results.length === 0) {
        console.log(`[WebSpeech] 🎤 No results in event`);
        return;
      }
      
      console.log(`[WebSpeech] 🎤 Processing ${results.length} results, starting from index ${event.resultIndex}`);
      
      // CORRECT IMPLEMENTATION based on official documentation:
      // interim_transcript is a local variable, and is completely rebuilt each time
      // final_transcript is a global variable that accumulates
      let interimTranscript = '';
      
      // Process results starting from event.resultIndex (CRITICAL!)
      for (let i = event.resultIndex; i < results.length; ++i) {
        const result = results[i];
        const text = result[0]?.transcript || '';
        
        console.log(`[WebSpeech] 🔍 Processing result[${i}]: "${text}" (isFinal: ${result.isFinal})`);
        
        if (result.isFinal) {
          // Accumulate final results in the global transcript
          this.fullTranscript += text;
          console.log(`[WebSpeech] ✅ Final[${i}]: "${text}" -> Full transcript now: "${this.fullTranscript}"`);
          // Reset silence count only on final results
          this.resetSilenceCount();
        } else {
          // Rebuild interim transcript completely each time
          interimTranscript += text;
          console.log(`[WebSpeech] ⏳ Interim[${i}]: "${text}" -> Interim transcript now: "${interimTranscript}"`);
        }
      }
      
      // Create display transcript: accumulated finals + current interim
      const displayTranscript = this.fullTranscript + interimTranscript;
      this.currentTranscript = displayTranscript;
      
      console.log(`[WebSpeech] 📝 Display: "${displayTranscript}"`);
      console.log(`[WebSpeech] 📝 Full transcript: "${this.fullTranscript}"`);
      console.log(`[WebSpeech] 📝 Interim transcript: "${interimTranscript}"`);
      
      // Get confidence from the most recent result
      const lastResult = results[results.length - 1];
      const confidence = lastResult?.[0]?.confidence || 0.8;
      
      const result: SpeechRecognitionResult = {
        transcript: displayTranscript,
        confidence: Math.max(confidence, 0.1),
        isFinal: lastResult ? lastResult.isFinal : false,
        alternatives: [],
        // Add separate final and interim transcripts for better handling
        finalTranscript: this.fullTranscript,
        interimTranscript: interimTranscript
      };

      // Update performance metrics
      this.updatePerformanceMetrics(result.confidence);

      console.log(`[WebSpeech] 📤 Notifying: "${result.transcript}" (final: ${result.isFinal})`);
      this.notifyRecognitionResult(result);
    };

    this.recognition.onerror = (event: any) => {
      console.error('[WebSpeech] ❌ Speech recognition error:', event);
      console.error('[WebSpeech] ❌ Error details:', {
        error: event.error,
        message: event.message,
        type: event.type,
        isRecording: this.isRecording,
        continuousMode: this.continuousMode,
        recognitionRunning: this.recognitionRunning
      });
      
      // Always reset recognition running state on error
      this.recognitionRunning = false;
      
      // Handle different error types
      switch (event.error) {
        case 'network':
          console.error('Network error - check your internet connection');
          break;
        case 'audio-capture':
          // No microphone or audio capture issue - attempt restart if still recording
          if (this.continuousMode && this.isRecording) {
            this.scheduleRestart();
          }
          break;
        case 'not-allowed':
        case 'service-not-allowed':
          // User denied permission or service not allowed
          this.continuousMode = false;
          this.isRecording = false;
          this.explicitlyStopped = true;
          break;
        case 'no-speech':
          // No speech detected - implement smart recovery
          console.log('[WebSpeech] 🔇 No speech detected - implementing smart recovery');
          if (this.continuousMode && this.isRecording) {
            // Wait a bit longer before restarting for no-speech
            setTimeout(() => {
              if (this.isRecording && this.continuousMode) {
                console.log('[WebSpeech] 🔄 Restarting after no-speech timeout');
                this.scheduleRestart();
              }
            }, 2000); // 2 second delay for no-speech recovery
          }
          break;
        case 'aborted':
          // Recognition was aborted - restart if in continuous mode
          if (this.continuousMode && this.isRecording) {
            this.scheduleRestart();
          }
          break;
        default:
          // Other errors - try to restart if in continuous mode
          if (this.continuousMode && this.isRecording) {
            this.scheduleRestart();
          }
      }
      
      // Notify error result if we're not restarting
      if (!this.isRestarting) {
        const errorResult: SpeechRecognitionResult = {
          transcript: this.currentTranscript.trim(),
          confidence: 0,
          isFinal: true
        };

        if (this.recognitionResolve) {
          this.recognitionResolve(errorResult);
          this.recognitionResolve = undefined;
        }
      }
    };

    this.recognition.onend = () => {
      console.log('[WebSpeech] 🛑 Speech recognition service ended');
      console.log('[WebSpeech] 🛑 End event details:', {
        isRecording: this.isRecording,
        continuousMode: this.continuousMode,
        isRestarting: this.isRestarting,
        recognitionRunning: this.recognitionRunning,
        recognitionContinuous: this.recognition?.continuous
      });
      
      this.clearSilenceTimer();
      this.recognitionRunning = false; // Always set to false when recognition ends
      
      // Restart if we're supposed to be listening continuously
      if (this.continuousMode && this.isRecording && !this.explicitlyStopped) {
        console.log('[WebSpeech] 🔄 Restarting recognition in continuous mode');
        setTimeout(() => {
          if (this.continuousMode && this.isRecording && !this.explicitlyStopped) {
            try {
              console.log('[WebSpeech] 🔄 Attempting to restart recognition...');
              if (this.recognition) {
                this.recognition.start();
                this.startSilenceTimer();
                console.log('[WebSpeech] ✅ Recognition restarted for continuous mode');
              }
            } catch (e) {
              console.error('[WebSpeech] ❌ Failed to restart recognition:', e);
              this.scheduleRestart();
            }
          } else {
            console.log('[WebSpeech] ❌ Not restarting because:', {
              continuousMode: this.continuousMode,
              isRecording: this.isRecording,
              explicitlyStopped: this.explicitlyStopped
            });
          }
        }, 100); // Small delay to avoid immediate restart errors
      } else {
        // If not in continuous mode or explicitly stopped, stop recording
        this.isRecording = false;
        console.log('[WebSpeech] 🛑 Recognition ended, not restarting');
      }
    };
    
    // Additional events for better handling
    this.recognition.onaudiostart = () => {
      console.log('[WebSpeech] 🎙️ Audio capture started');
      this.resetSilenceTimer();
    };
    
    this.recognition.onaudioend = () => {
      console.log('[WebSpeech] 🎙️ Audio capture ended');
    };
    
    this.recognition.onsoundstart = () => {
      console.log('[WebSpeech] 🔊 Sound detected');
      this.resetSilenceTimer();
    };
    
    this.recognition.onsoundend = () => {
      console.log('[WebSpeech] 🔊 Sound ended');
      // Don't reset silence timer on sound end - let natural pauses be handled by silence timer
      // This prevents premature restarts when user pauses between words
    };
    
    this.recognition.onspeechstart = () => {
      console.log('[WebSpeech] 🗣️ Speech detected');
      this.resetSilenceTimer();
    };
    
    this.recognition.onspeechend = () => {
      console.log('[WebSpeech] 🗣️ Speech ended');
      // Don't reset silence timer on speech end - let natural pauses be handled by silence timer
      // This prevents premature restarts when user pauses between words
    };
    
    // onstart and onend handlers are already defined above in setupRecognition()
    
    // onerror handler is already defined above in setupRecognition()

    this.recognition.onnomatch = () => {
      console.log('[WebSpeech] No match - no words recognized');
      // No words recognized despite audio — be less aggressive with restarts
      // Only restart if we've had multiple consecutive no-match events
      if (this.continuousMode && this.isRecording) {
        // Don't immediately restart on no-match, let the silence timer handle it
        console.log('[WebSpeech] No match detected, letting silence timer handle restart if needed');
      }
    };
    
    this.recognition.onstart = () => {
      console.log('[WebSpeech] Recognition service started');
      this.recognitionRunning = true;
    };
  }

  async synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult> {
    return new Promise((resolve, reject) => {
      if (!this.isTTSAvailable()) {
        reject(new Error('Text-to-speech is not available in this browser'));
        return;
      }

      const enqueueUtterance = (u: SpeechSynthesisUtterance) => {
        this.utteranceQueue.push(u);
        if (!this.isSpeaking) {
          this.playNextUtterance();
        }
      };

      // Split long text into chunks to avoid platform limits
      const chunks = this.chunkTextForSynthesis(text);
      let totalDuration = 0;

      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (options?.voice) {
          const voices = window.speechSynthesis.getVoices();
          const selectedVoice = voices.find(v => v.name === options.voice || v.voiceURI === options.voice);
          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }
        }
        const rate = options?.rate ?? 1.0;
        utterance.rate = rate;
        utterance.pitch = options?.pitch ?? 1.0;
        utterance.volume = options?.volume ?? 1.0;
        utterance.lang = options?.language ?? 'en-US';

        totalDuration += chunk.length * 60 / (150 * rate);

        if (index === chunks.length - 1) {
          utterance.onend = () => resolve({ duration: totalDuration });
          utterance.onerror = (event) => reject(new Error(`Speech synthesis failed: ${event.error}`));
        }

        enqueueUtterance(utterance);
      });
    });
  }

  cancelSynthesis(): void {
    try { window.speechSynthesis.cancel(); } catch {}
    this.utteranceQueue = [];
    this.isSpeaking = false;
    super.cancelSynthesis();
  }

  async getAvailableVoices(): Promise<VoiceInfo[]> {
    if (!this.isTTSAvailable()) {
      return [];
    }

    return new Promise((resolve) => {
      const getVoicesList = () => {
        const voices = window.speechSynthesis.getVoices();
        const voiceInfos: VoiceInfo[] = voices.map(voice => ({
          id: voice.voiceURI,
          name: voice.name,
          language: voice.lang,
          gender: this.guessGenderFromName(voice.name),
          provider: 'web' as const,
          isDefault: voice.default
        }));
        resolve(voiceInfos);
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        getVoicesList();
      } else {
        window.speechSynthesis.onvoiceschanged = getVoicesList;
        // Fallback timeout
        setTimeout(() => getVoicesList(), 100);
      }
    });
  }

  async startRecognition(options?: STTOptions): Promise<void> {
    console.log('[WebSpeech] Starting recognition with options:', options);
    
    if (!this.isSTTAvailable()) {
      console.error('[WebSpeech] Speech recognition not available in browser');
      throw new Error('Speech recognition is not available in this browser');
    }

    if (this.isRecording) {
      console.log('[WebSpeech] Already recording, returning');
      return;
    }

    // Reset transcripts for a fresh start (not a restart)
    if (!this.isRestarting) {
      console.log('[WebSpeech] Fresh start - resetting all transcripts (isRestarting:', this.isRestarting, ')');
      this.clearTranscripts();
    } else {
      console.log('[WebSpeech] Restart - keeping existing transcripts (isRestarting:', this.isRestarting, ')');
    }

    // CRITICAL: Request microphone permission explicitly before starting recognition
    try {
      console.log('[WebSpeech] 🎤 Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[WebSpeech] ✅ Microphone permission granted');
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.error('[WebSpeech] ❌ Microphone permission denied:', error);
      throw new Error('Microphone permission is required for speech recognition');
    }

    // Check if recognition instance exists
    if (!this.recognition) {
      console.error('[WebSpeech] SpeechRecognition instance is null - attempting to reinitialize');
      try {
        // Try to reinitialize the recognition instance
        const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognitionConstructor && typeof SpeechRecognitionConstructor === 'function') {
          this.recognition = new SpeechRecognitionConstructor();
          this.setupRecognition();
          console.log('[WebSpeech] SpeechRecognition reinitialized successfully');
        } else {
          throw new Error('SpeechRecognition constructor not available');
        }
      } catch (error) {
        console.error('[WebSpeech] Failed to reinitialize SpeechRecognition:', error);
        throw new Error('Speech recognition is not available - failed to initialize');
      }
    }

    // Ensure no TTS is speaking which can interfere with mic capture
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {}

    this.isRecording = true;
    this.isRestarting = false;
    this.explicitlyStopped = false; // Reset the explicitly stopped flag
    this.restartAttempts = 0;
    this.continuousMode = options?.continuous ?? true; // Default to continuous
    this.lastResultTime = Date.now();
    
    console.log('[WebSpeech] Continuous mode set to:', this.continuousMode);
    console.log('[WebSpeech] Options received:', options);

    // Update recognition settings with options
    if (this.recognition) {
      this.recognition.lang = options?.language ?? this.config.language ?? 'en-US';
      this.recognition.continuous = true; // CRITICAL: Must be true for continuous recognition
      this.recognition.interimResults = true; // CRITICAL: Must be true to get interim results
      this.recognition.maxAlternatives = options?.maxAlternatives ?? this.config.maxAlternatives ?? 1;
      
      console.log('[WebSpeech] Recognition configured:', {
        lang: this.recognition.lang,
        continuous: this.recognition.continuous,
        interimResults: this.recognition.interimResults,
        maxAlternatives: this.recognition.maxAlternatives
      });
      
      // Log the actual recognition object to see if it's properly configured
      console.log('[WebSpeech] Recognition object:', this.recognition);
    }

    try {
      // Start recognition immediately for real-time response
      if (this.recognition) {
        // More robust state checking to avoid InvalidStateError
        if (this.recognitionRunning) {
          console.log('[WebSpeech] ⚠️ Recognition already running, attempting to stop first');
          try {
            this.recognition.stop();
            // Wait a bit for the stop to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (stopError) {
            console.log('[WebSpeech] Stop failed, continuing with start attempt:', stopError);
          }
        }
        
        console.log('[WebSpeech] 🚀 Starting recognition...');
        console.log('[WebSpeech] 🚀 Recognition config:', {
          continuous: this.recognition.continuous,
          interimResults: this.recognition.interimResults,
          lang: this.recognition.lang,
          maxAlternatives: this.recognition.maxAlternatives
        });
        
        // Start the recognition with error handling
        try {
          this.recognition.start();
          this.recognitionRunning = true;
          this.startSilenceTimer();
          console.log('[WebSpeech] ✅ Recognition started successfully');
          console.log('[WebSpeech] ✅ Recognition state after start:', {
            isRecording: this.isRecording,
            continuousMode: this.continuousMode,
            recognitionContinuous: this.recognition.continuous,
            recognitionInterimResults: this.recognition.interimResults
          });
        } catch (startError: any) {
          console.error('[WebSpeech] ❌ Failed to start recognition:', startError);
          if (startError.name === 'InvalidStateError') {
            console.log('[WebSpeech] 🔄 InvalidStateError - recognition may already be running, resetting state');
            this.recognitionRunning = false;
            // Try to stop and restart
            try {
              this.recognition.stop();
              await new Promise(resolve => setTimeout(resolve, 200));
              this.recognition.start();
              this.recognitionRunning = true;
              this.startSilenceTimer();
              console.log('[WebSpeech] ✅ Recognition restarted after InvalidStateError');
            } catch (restartError) {
              console.error('[WebSpeech] ❌ Failed to restart recognition:', restartError);
              throw restartError;
            }
          } else {
            throw startError;
          }
        }
        
        // Add a timeout to detect if recognition hangs without accessing microphone
        setTimeout(() => {
          if (this.isRecording && this.recognition) {
            console.log('[WebSpeech] ⏰ Recognition timeout check - no audio events detected');
            console.log('[WebSpeech] ⏰ This may indicate microphone access issues');
          }
        }, 3000); // 3 second timeout
        
        // Add a longer timeout to keep recognition alive and check status
        setTimeout(() => {
          if (this.isRecording && this.recognition) {
            console.log('[WebSpeech] 🔄 Keeping recognition alive...');
            console.log('[WebSpeech] 🔄 Current state:', {
              isRecording: this.isRecording,
              continuousMode: this.continuousMode,
              recognitionContinuous: this.recognition.continuous
            });
            
            // Check if recognition is still active
            if (this.continuousMode && this.isRecording) {
              console.log('[WebSpeech] 🔄 Ensuring continuous recognition stays active');
              // The recognition should stay active due to continuous: true
            }
          } else {
            console.log('[WebSpeech] ❌ Recognition not active:', {
              isRecording: this.isRecording,
              hasRecognition: !!this.recognition
            });
          }
        }, 2000); // 2 second check
        
      } else {
        console.error('[WebSpeech] ❌ Cannot start recognition:', {
          hasRecognition: !!this.recognition,
          isRecording: this.isRecording
        });
      }
    } catch (error) {
      console.error('[WebSpeech] Failed to start recognition:', error);
      this.isRecording = false;
      this.continuousMode = false;
      this.explicitlyStopped = true;
      throw error;
    }
  }

  async stopRecognition(): Promise<SpeechRecognitionResult> {
    return new Promise((resolve) => {
      if (!this.recognition || !this.isRecording) {
        resolve({
          transcript: this.currentTranscript.trim(),
          confidence: 1,
          isFinal: true
        });
        return;
      }

      this.continuousMode = false; // Stop continuous mode
      this.explicitlyStopped = true; // Mark that we've explicitly stopped
      this.recognitionRunning = false; // Mark recognition as not running
      this.isRestarting = false;
      this.clearTimers();
      this.recognitionResolve = resolve;
      
      // Set up a one-time handler for the final result
      const handleStop = () => {
        if (this.recognitionResolve) {
          this.recognitionResolve({
            transcript: this.currentTranscript.trim(),
            confidence: 1,
            isFinal: true
          });
          this.recognitionResolve = undefined;
        }
        this.isRecording = false;
        
        // Reset transcripts for next session
        this.clearTranscripts();
      };
      
      // Listen for the end event
      this.recognition.addEventListener('end', handleStop, { once: true });
      
      this.recognition.stop();

      // Timeout fallback
      setTimeout(() => {
        handleStop();
      }, 2000);
    });
  }
  
  private scheduleRestart(): void {
    if (this.isRestarting || !this.continuousMode || this.restartAttempts >= this.maxRestartAttempts) {
      return;
    }
    
    this.isRestarting = true;
    this.restartAttempts++;
    
    // Clear any existing restart timer
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    
    // Delay restart to avoid rapid restarts and throttling
    this.restartTimer = setTimeout(() => {
      if (this.continuousMode && this.isRecording) {
        try {
          console.log('[WebSpeech] 🔄 Attempting restart...');
          this.pendingRestart = true;
          if (this.recognition) {
            try { 
              this.recognition.stop(); 
            } catch (stopError) {
              console.log('[WebSpeech] Stop failed, will restart on onend:', stopError);
            }
            // Try immediate restart if possible
            try {
              this.recognition.start();
              this.pendingRestart = false;
              this.isRestarting = false;
              this.startSilenceTimer();
              console.log('[WebSpeech] ✅ Recognition restarted immediately');
            } catch (immediateErr) {
              console.log('[WebSpeech] Immediate restart failed, waiting for onend:', immediateErr);
              this.isRestarting = false;
            }
          }
        } catch (error) {
          console.warn('[WebSpeech] Restart failed:', error);
          this.isRestarting = false;
        }
      } else {
        this.isRestarting = false;
      }
    }, 500); // Increased delay to reduce throttling
  }
  
  private startSilenceTimer(): void {
    this.resetSilenceTimer();
  }
  
  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    
    // Set a timer to check for prolonged silence (optimized timeout)
    this.silenceTimer = setTimeout(() => {
      if (this.isRecording && this.continuousMode) {
        const timeSinceLastResult = Date.now() - this.lastResultTime;
        if (timeSinceLastResult > this.silenceTimeoutMs) {
          this.consecutiveSilenceCount++;
          console.log(`[WebSpeech] 🔇 Prolonged silence detected (${this.consecutiveSilenceCount}/${this.maxConsecutiveSilence})`);
          
          if (this.consecutiveSilenceCount >= this.maxConsecutiveSilence) {
            console.log('[WebSpeech] 🔄 Forcing restart due to consecutive silence periods');
            this.scheduleRestart();
          } else {
            // Reset timer for next check
            this.resetSilenceTimer();
          }
        }
      }
    }, this.silenceTimeoutMs);
  }
  
  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = undefined;
    }
  }

  private resetSilenceCount(): void {
    this.consecutiveSilenceCount = 0; // Only reset silence count on final results
  }

  private clearTranscripts(): void {
    console.log('[WebSpeech] 🧹 Clearing transcripts - before:', {
      fullTranscript: this.fullTranscript,
      currentTranscript: this.currentTranscript
    });
    this.fullTranscript = '';
    this.currentTranscript = '';
    console.log('[WebSpeech] 🧹 Transcripts cleared - after:', {
      fullTranscript: this.fullTranscript,
      currentTranscript: this.currentTranscript
    });
  }

  private updatePerformanceMetrics(confidence: number): void {
    this.performanceMetrics.totalResults++;
    const totalConfidence = this.performanceMetrics.averageConfidence * (this.performanceMetrics.totalResults - 1) + confidence;
    this.performanceMetrics.averageConfidence = totalConfidence / this.performanceMetrics.totalResults;
    
    // Adaptive timeout based on performance
    const now = Date.now();
    if (now - this.performanceMetrics.lastPerformanceCheck > 30000) { // Check every 30 seconds
      if (this.performanceMetrics.averageConfidence < 0.7) {
        // Lower confidence - increase timeout for better accuracy
        this.silenceTimeoutMs = Math.min(this.silenceTimeoutMs + 2000, 15000);
        console.log(`[WebSpeech] 📊 Low confidence detected, increased timeout to ${this.silenceTimeoutMs}ms`);
      } else if (this.performanceMetrics.averageConfidence > 0.9) {
        // High confidence - can use shorter timeout
        this.silenceTimeoutMs = Math.max(this.silenceTimeoutMs - 1000, 5000);
        console.log(`[WebSpeech] 📊 High confidence detected, decreased timeout to ${this.silenceTimeoutMs}ms`);
      }
      this.performanceMetrics.lastPerformanceCheck = now;
    }
  }
  
  private clearTimers(): void {
    this.clearSilenceTimer();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
  }

  private playNextUtterance(): void {
    if (this.isSpeaking) return;
    const next = this.utteranceQueue.shift();
    if (!next) return;
    this.isSpeaking = true;
    next.onend = ((orig) => (ev: any) => {
      try { orig?.(ev); } catch {}
      this.isSpeaking = false;
      // slight delay between chunks to avoid iOS cutoff
      setTimeout(() => this.playNextUtterance(), 20);
    })(next.onend as any);
    next.onerror = ((orig) => (ev: any) => {
      try { orig?.(ev); } catch {}
      this.isSpeaking = false;
      this.playNextUtterance();
    })(next.onerror as any);
    try {
      window.speechSynthesis.speak(next);
    } catch {
      this.isSpeaking = false;
    }
  }

  private chunkTextForSynthesis(text: string): string[] {
    const maxLen = 180; // conservative chunk length for Safari/iOS
    const sentences = text.match(/[^.!?\n]+[.!?\n]?/g) || [text];
    const chunks: string[] = [];
    let current = '';
    for (const s of sentences) {
      if ((current + s).length <= maxLen) {
        current += s;
      } else {
        if (current) chunks.push(current.trim());
        if (s.length <= maxLen) {
          current = s;
        } else {
          // hard split long sentence
          for (let i = 0; i < s.length; i += maxLen) {
            chunks.push(s.slice(i, i + maxLen).trim());
          }
          current = '';
        }
      }
    }
    if (current) chunks.push(current.trim());
    return chunks;
  }

  isAvailable(): boolean {
    return this.isTTSAvailable() || this.isSTTAvailable();
  }

  isListening(): boolean {
    // Simply return whether recognition is actually running
    return this.recognitionRunning;
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
      availableLanguages: this.getAvailableLanguages()
    };
  }

  dispose(): void {
    console.log('[WebSpeech] 🧹 Disposing WebSpeechService resources');
    
    if (this.recognition) {
      this.continuousMode = false;
      this.isRecording = false;
      this.isRestarting = false;
      this.explicitlyStopped = false;
      this.recognitionRunning = false;
      this.consecutiveSilenceCount = 0;
      this.clearTimers();
      this.recognition.abort();
      this.recognition = null;
    }
    
    // Cancel any pending TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    // Clear transcript data and reset state
    this.currentTranscript = '';
    this.fullTranscript = '';
    this.lastResultTime = 0;
    this.restartAttempts = 0;
    
    super.dispose();
  }

  private isTTSAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
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

  private guessGenderFromName(name: string): 'male' | 'female' | 'neutral' {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('female') || lowerName.includes('woman')) return 'female';
    if (lowerName.includes('male') || lowerName.includes('man')) return 'male';
    return 'neutral';
  }

  private getAvailableLanguages(): string[] {
    // Common languages supported by Web Speech API
    return [
      'en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE',
      'it-IT', 'pt-BR', 'pt-PT', 'ru-RU', 'zh-CN', 'zh-TW',
      'ja-JP', 'ko-KR', 'ar-SA', 'hi-IN', 'nl-NL', 'pl-PL'
    ];
  }
}
