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

// Extend window to include Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    speechSynthesis: SpeechSynthesis;
  }
}

export class WebSpeechService extends BaseSpeechService {
  private recognition: any = null;
  private currentTranscript: string = '';
  private isRecording: boolean = false;
  private recognitionResolve?: (value: SpeechRecognitionResult) => void;
  private continuousMode: boolean = false;
  private fullTranscript: string = '';
  private restartTimer?: NodeJS.Timeout;
  private lastResultTime: number = 0;
  private silenceTimer?: NodeJS.Timeout;
  private isRestarting: boolean = false;
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
    
    // Initialize speech recognition if available
    if (this.isSTTAvailable()) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
    }
  }

  private setupRecognition(): void {
    if (!this.recognition) return;

    this.recognition.continuous = true; // Always continuous for better experience
    this.recognition.interimResults = this.config.interimResults ?? true;
    this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;
    this.recognition.lang = this.config.language ?? 'en-US';

    this.recognition.onresult = (event: any) => {
      this.lastResultTime = Date.now();
      this.resetSilenceTimer();
      
      const results = event.results;
      console.log(`[WebSpeech] onresult: ${results.length} results, resultIndex: ${event.resultIndex}`);
      
      // Process all results from the beginning to maintain complete transcript
      let fullTranscript = '';
      let interimTranscript = '';
      
      // Build the complete transcript from all results
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const text = r[0]?.transcript || '';
        if (r.isFinal) {
          // Add final results to the full transcript
          fullTranscript += text + ' ';
          console.log(`[WebSpeech] Final result[${i}]: "${text}"`);
        } else {
          // Add interim results (only the last one matters)
          interimTranscript = text;
          console.log(`[WebSpeech] Interim result[${i}]: "${text}"`);
        }
      }
      
      // Update the persistent full transcript with all finals
      this.fullTranscript = fullTranscript;
      
      // Current transcript is all finals + current interim
      this.currentTranscript = (fullTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
      console.log(`[WebSpeech] Current transcript: "${this.currentTranscript}"`);
      
      // Get the last result for alternatives and confidence if available
      const lastResult = results[results.length - 1];
      const alternatives = Array.from(lastResult || []).map((alt: any) => ({
        transcript: alt.transcript,
        confidence: alt.confidence || 0
      }));

      const result: SpeechRecognitionResult = {
        transcript: this.currentTranscript,
        confidence: (lastResult && lastResult[0] && typeof lastResult[0].confidence === 'number') ? lastResult[0].confidence : 0.9,
        isFinal: false, // Never report final while in continuous mode to keep listening
        alternatives: alternatives.slice(1)
      };

      this.notifyRecognitionResult(result);
      
      // Keep the recognition going in continuous mode
      if (this.continuousMode && !this.isRecording) {
        this.isRecording = true;
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('[WebSpeech] Recognition error:', event.error, event);
      
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
          // No speech detected - don't restart, just continue listening
          // The continuous mode should handle silence naturally
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
      this.clearSilenceTimer();
      
      // Always restart if we're in continuous mode and supposed to be recording
      if (this.continuousMode && this.isRecording) {
        // Immediately restart without delay for seamless continuous recognition
        this.isRestarting = true;
        setTimeout(() => {
          if (this.continuousMode && this.isRecording) {
            try {
              this.recognition.start();
              this.isRestarting = false;
              this.startSilenceTimer();
              console.log('Recognition restarted for continuous mode');
            } catch (e) {
              console.log('Failed to restart, will retry...');
              this.isRestarting = false;
              this.scheduleRestart();
            }
          } else {
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
      console.log('[WebSpeech] Audio capture started');
      this.resetSilenceTimer();
    };
    
    this.recognition.onaudioend = () => {
      console.log('[WebSpeech] Audio capture ended');
    };
    
    this.recognition.onsoundstart = () => {
      console.log('[WebSpeech] Sound detected');
      this.resetSilenceTimer();
    };
    
    this.recognition.onsoundend = () => {
      console.log('[WebSpeech] Sound ended');
    };
    
    this.recognition.onspeechstart = () => {
      console.log('[WebSpeech] Speech detected');
      this.resetSilenceTimer();
    };
    
    this.recognition.onspeechend = () => {
      console.log('[WebSpeech] Speech ended');
    };

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

    // Update recognition settings with options
    if (this.recognition) {
      this.recognition.lang = options?.language ?? this.config.language ?? 'en-US';
      this.recognition.continuous = true; // Always use continuous internally
      this.recognition.interimResults = options?.interimResults ?? this.config.interimResults ?? true;
      this.recognition.maxAlternatives = options?.maxAlternatives ?? this.config.maxAlternatives ?? 1;
      
      console.log('[WebSpeech] Recognition configured:', {
        lang: this.recognition.lang,
        continuous: this.recognition.continuous,
        interimResults: this.recognition.interimResults,
        maxAlternatives: this.recognition.maxAlternatives
      });
    }

    try {
      // Start recognition
      this.recognition.start();
      this.startSilenceTimer();
      console.log('[WebSpeech] Recognition started successfully');
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
        } catch (error) {
          console.warn('Failed to restart recognition:', error);
          // Attempt to fully re-initialize the recognition engine
          try {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
              this.recognition = new SpeechRecognition();
              this.setupRecognition();
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
    
    // Set a timer to check for prolonged silence (60 seconds for better tolerance)
    this.silenceTimer = setTimeout(() => {
      if (this.isRecording && this.continuousMode) {
        const timeSinceLastResult = Date.now() - this.lastResultTime;
        if (timeSinceLastResult > 60000) { // 60 seconds of silence
          console.log('Restarting due to prolonged silence');
          this.scheduleRestart();
        }
      }
    }, 60000);
  }
  
  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = undefined;
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
    if (this.recognition) {
      this.continuousMode = false;
      this.isRecording = false;
      this.isRestarting = false;
      this.clearTimers();
      this.recognition.abort();
      this.recognition = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    super.dispose();
  }

  private isTTSAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private isSTTAvailable(): boolean {
    return typeof window !== 'undefined' && 
           ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
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
