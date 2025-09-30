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
  private silenceTimeoutMs: number = 8000; // 8 seconds of silence before restart (optimized for natural speech)
  private consecutiveSilenceCount: number = 0;
  private maxConsecutiveSilence: number = 3; // Max 3 consecutive silence periods before forcing restart
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
    this.recognition.maxAlternatives = this.config.maxAlternatives ?? 3; // Increased for better alternatives
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
      console.log(`[WebSpeech] 🎤 Event details:`, {
        resultsLength: event.results?.length,
        resultIndex: event.resultIndex,
        results: event.results
      });
      this.lastResultTime = Date.now();
      this.resetSilenceTimer();
      
      const results = event.results;
      console.log(`[WebSpeech] 🎤 onresult: ${results.length} results, resultIndex: ${event.resultIndex}`);
      
      // Process all results from the beginning to maintain complete transcript
      let fullTranscript = '';
      let interimTranscript = '';
      
      // Build the complete transcript from all results
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const text = r[0]?.transcript || '';
        console.log(`[WebSpeech] 🔍 Processing result[${i}]: text="${text}", isFinal=${r.isFinal}`);
        if (r.isFinal) {
          // Add final results to the full transcript
          fullTranscript += text + ' ';
          console.log(`[WebSpeech] ✅ Final result[${i}]: "${text}"`);
        } else {
          // Add interim results (only the last one matters)
          interimTranscript = text;
          console.log(`[WebSpeech] ⏳ Interim result[${i}]: "${text}"`);
        }
      }
      
      // CRITICAL: Always show the latest result, whether interim or final
      const currentTranscript = fullTranscript + interimTranscript;
      console.log(`[WebSpeech] 📝 Current transcript: "${currentTranscript}"`);
      
      // Update the persistent full transcript with all finals
      this.fullTranscript = fullTranscript;
      
      // Current transcript is all finals + current interim
      this.currentTranscript = (fullTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
      console.log(`[WebSpeech] 📝 Current transcript: "${this.currentTranscript}"`);
      
      // Get the last result for alternatives and confidence if available
      const lastResult = results[results.length - 1];
      const alternatives = Array.from(lastResult || []).map((alt: any) => ({
        transcript: alt.transcript,
        confidence: alt.confidence || 0
      }));

      // Calculate weighted confidence based on all results
      let totalConfidence = 0;
      let confidenceCount = 0;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result[0] && typeof result[0].confidence === 'number') {
          totalConfidence += result[0].confidence;
          confidenceCount++;
        }
      }
      const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0.9;

      const result: SpeechRecognitionResult = {
        transcript: this.currentTranscript,
        confidence: Math.max(averageConfidence, 0.1), // Ensure minimum confidence
        isFinal: lastResult ? lastResult.isFinal : false,
        alternatives: alternatives.slice(1)
      };

      // Update performance metrics
      this.updatePerformanceMetrics(result.confidence);

      console.log(`[WebSpeech] 📤 Notifying result:`, result);
      this.notifyRecognitionResult(result);
      
      // Keep the recognition going in continuous mode
      if (this.continuousMode && !this.isRecording) {
        this.isRecording = true;
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('[WebSpeech] ❌ Speech recognition error:', event);
      console.error('[WebSpeech] ❌ Error details:', {
        error: event.error,
        message: event.message,
        type: event.type,
        isRecording: this.isRecording,
        continuousMode: this.continuousMode
      });
      
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
        recognitionContinuous: this.recognition?.continuous
      });
      
      this.clearSilenceTimer();
      
      // Always restart if we're in continuous mode and supposed to be recording
      if (this.continuousMode && this.isRecording) {
        // Immediately restart without delay for seamless continuous recognition
        console.log('[WebSpeech] 🔄 Restarting recognition in continuous mode');
        this.isRestarting = true;
        setTimeout(() => {
          if (this.continuousMode && this.isRecording) {
            try {
              console.log('[WebSpeech] 🔄 Attempting to restart recognition...');
              if (this.recognition) {
                this.recognition.start();
                this.isRestarting = false;
                this.startSilenceTimer();
                console.log('[WebSpeech] ✅ Recognition restarted for continuous mode');
              }
            } catch (e) {
              console.error('[WebSpeech] ❌ Failed to restart recognition:', e);
              this.isRestarting = false;
              this.scheduleRestart();
            }
          } else {
            console.log('[WebSpeech] ❌ Not restarting because:', {
              continuousMode: this.continuousMode,
              isRecording: this.isRecording
            });
            this.isRestarting = false;
          }
        }, 100); // Small delay to avoid immediate restart errors
      } else {
        this.isRecording = false;
        this.isRestarting = false;
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
    };
    
    this.recognition.onspeechstart = () => {
      console.log('[WebSpeech] 🗣️ Speech detected');
      this.resetSilenceTimer();
    };
    
    this.recognition.onspeechend = () => {
      console.log('[WebSpeech] 🗣️ Speech ended');
    };
    
    // onstart and onend handlers are already defined above in setupRecognition()
    
    // onerror handler is already defined above in setupRecognition()

    this.recognition.onnomatch = () => {
      console.log('[WebSpeech] No match - no words recognized');
      // No words recognized despite audio — trigger a safe restart in continuous mode
      if (this.continuousMode && this.isRecording) {
        this.scheduleRestart();
      }
    };
    
    this.recognition.onstart = () => {
      console.log('[WebSpeech] Recognition service started');
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

    this.currentTranscript = '';
    this.fullTranscript = '';
    this.isRecording = true;
    this.isRestarting = false;
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
      // Start recognition with a small delay to ensure proper initialization
      setTimeout(() => {
        if (this.recognition && this.isRecording) {
          console.log('[WebSpeech] 🚀 Starting recognition...');
          console.log('[WebSpeech] 🚀 Recognition config:', {
            continuous: this.recognition.continuous,
            interimResults: this.recognition.interimResults,
            lang: this.recognition.lang,
            maxAlternatives: this.recognition.maxAlternatives
          });
          
          // Start the recognition
          this.recognition.start();
          this.startSilenceTimer();
          console.log('[WebSpeech] ✅ Recognition started successfully');
          
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
      }, 100);
    } catch (error) {
      console.error('[WebSpeech] Failed to start recognition:', error);
      this.isRecording = false;
      this.continuousMode = false;
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
    
    // Delay restart slightly to avoid rapid restarts and throttling
    this.restartTimer = setTimeout(() => {
      if (this.continuousMode && this.isRecording) {
        try {
          // Prefer stop→onend→start sequencing to avoid InvalidStateError
          this.fullTranscript = this.currentTranscript;
          this.pendingRestart = true;
          if (this.recognition) {
            try { this.recognition.stop(); } catch {}
            // If engine is already ended, attempt immediate start
            try {
              this.recognition.start();
              this.pendingRestart = false;
              this.isRestarting = false;
              this.startSilenceTimer();
              console.log('Recognition restarted successfully');
            } catch (immediateErr) {
              // Will start on onend
              this.isRestarting = false;
            }
          }
        } catch (error) {
          console.warn('Failed to restart recognition:', error);
          // Attempt to fully re-initialize the recognition engine
          try {
            const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognitionConstructor) {
              this.recognition = new SpeechRecognitionConstructor();
              this.setupRecognition();
              if (this.recognition) {
                this.recognition.lang = this.config.language ?? 'en-US';
                this.recognition.continuous = true;
                this.recognition.interimResults = this.config.interimResults ?? true;
                this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;
                try {
                  this.recognition.start();
                  this.isRestarting = false;
                  this.startSilenceTimer();
                  console.log('Recognition re-initialized and restarted successfully');
                } catch {
                  // If start fails immediately, request onend-driven restart
                  this.pendingRestart = true;
                  this.isRestarting = false;
                }
              }
            } else {
              this.isRecording = false;
              this.isRestarting = false;
            }
          } catch (e) {
            console.warn('Re-initialization failed:', e);
            this.isRecording = false;
            this.isRestarting = false;
          }
        }
      } else {
        this.isRestarting = false;
      }
    }, 300); // Slightly larger delay to reduce throttling and improve stability
  }
  
  private startSilenceTimer(): void {
    this.resetSilenceTimer();
  }
  
  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.consecutiveSilenceCount = 0; // Reset silence count when we get results
    
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
