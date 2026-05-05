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
import { speechLog } from './speechDebug';

const TAG = 'WebSpeech';

export class WebSpeechService extends BaseSpeechService {
  private recognition: SpeechRecognition | null = null;
  private currentTranscript: string = '';
  private isRecording: boolean = false;
  private recognitionResolve?: (value: SpeechRecognitionResult) => void;
  private continuousMode: boolean = false;
  private fullTranscript: string = '';
  private restartTimer?: ReturnType<typeof setTimeout>;
  private lastResultTime: number = 0;
  private silenceTimer?: ReturnType<typeof setTimeout>;
  private silenceTimeoutMs: number = 12000;
  private consecutiveSilenceCount: number = 0;
  private maxConsecutiveSilence: number = 2;
  private isRestarting: boolean = false;
  private performanceMetrics = {
    totalResults: 0,
    averageConfidence: 0,
    lastPerformanceCheck: Date.now()
  };
  private restartAttempts: number = 0;
  private maxRestartAttempts: number = 100;
  private pendingRestart: boolean = false;
  private utteranceQueue: SpeechSynthesisUtterance[] = [];
  private isSpeakingTTS: boolean = false;
  private explicitlyStopped: boolean = false;
  private recognitionRunning: boolean = false;

  constructor() {
    super('web');
  }

  async initialize(config?: SpeechConfig): Promise<void> {
    await super.initialize(config);

    if (!this.isSTTAvailable() && !this.isTTSAvailable()) {
      throw new Error('Speech Recognition and Synthesis APIs are not available in this browser');
    }

    if (this.isSTTAvailable()) {
      try {
        const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!Ctor || typeof Ctor !== 'function') {
          speechLog.warn(TAG, 'SpeechRecognition constructor not available');
          return;
        }
        this.recognition = new Ctor();
        this.setupRecognition();
        speechLog.info(TAG, 'SpeechRecognition initialized');
      } catch (error) {
        speechLog.error(TAG, 'Failed to create SpeechRecognition instance', error);
        this.recognition = null;
      }
    }
  }

  // --------------- Recognition setup ----------------------------------------

  private setupRecognition(): void {
    if (!this.recognition) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;
    this.recognition.lang = this.config.language ?? 'en-US';

    if ('webkitSpeechGrammarList' in window) {
      const grammarList = new (window as any).webkitSpeechGrammarList();
      const grammar = '#JSGF V1.0; grammar common; public <common> = hello | hi | yes | no | stop | start | help;';
      grammarList.addFromString(grammar, 1);
      this.recognition.grammars = grammarList;
    }

    this.recognition.onresult = (event: any) => {
      this.lastResultTime = Date.now();
      this.resetSilenceTimer();

      const results = event.results;
      if (!results || results.length === 0) return;

      let interimTranscript = '';
      for (let i = event.resultIndex; i < results.length; ++i) {
        const text = results[i][0]?.transcript || '';
        if (results[i].isFinal) {
          this.fullTranscript += text;
          this.resetSilenceCount();
        } else {
          interimTranscript += text;
        }
      }

      const displayTranscript = this.fullTranscript + interimTranscript;
      this.currentTranscript = displayTranscript;

      const lastResult = results[results.length - 1];
      const confidence = lastResult?.[0]?.confidence || 0.8;

      const result: SpeechRecognitionResult = {
        transcript: displayTranscript,
        confidence: Math.max(confidence, 0.1),
        isFinal: lastResult ? lastResult.isFinal : false,
        alternatives: [],
        finalTranscript: this.fullTranscript,
        interimTranscript
      };

      this.updatePerformanceMetrics(result.confidence);
      this.notifyRecognitionResult(result);
    };

    this.recognition.onerror = (event: any) => {
      speechLog.error(TAG, `Recognition error: ${event.error}`, {
        error: event.error,
        isRecording: this.isRecording,
        continuousMode: this.continuousMode
      });

      this.recognitionRunning = false;

      switch (event.error) {
        case 'network':
          break;
        case 'audio-capture':
          if (this.continuousMode && this.isRecording) this.scheduleRestart();
          break;
        case 'not-allowed':
        case 'service-not-allowed':
          this.continuousMode = false;
          this.isRecording = false;
          this.explicitlyStopped = true;
          break;
        case 'no-speech':
          if (this.continuousMode && this.isRecording) {
            setTimeout(() => {
              if (this.isRecording && this.continuousMode) this.scheduleRestart();
            }, 2000);
          }
          break;
        case 'aborted':
        default:
          if (this.continuousMode && this.isRecording) this.scheduleRestart();
      }

      if (!this.isRestarting && this.recognitionResolve) {
        this.recognitionResolve({
          transcript: this.currentTranscript.trim(),
          confidence: 0,
          isFinal: true
        });
        this.recognitionResolve = undefined;
      }
    };

    this.recognition.onend = () => {
      speechLog.info(TAG, 'Recognition ended', { isRecording: this.isRecording, continuousMode: this.continuousMode });
      this.clearSilenceTimer();
      this.recognitionRunning = false;

      if (this.continuousMode && this.isRecording && !this.explicitlyStopped) {
        setTimeout(() => {
          if (this.continuousMode && this.isRecording && !this.explicitlyStopped) {
            try {
              this.recognition?.start();
              this.startSilenceTimer();
              speechLog.info(TAG, 'Recognition restarted for continuous mode');
            } catch {
              this.scheduleRestart();
            }
          }
        }, 100);
      } else {
        this.isRecording = false;
      }
    };

    this.recognition.onaudiostart = () => this.resetSilenceTimer();
    this.recognition.onaudioend = () => {};
    this.recognition.onsoundstart = () => this.resetSilenceTimer();
    this.recognition.onsoundend = () => {};
    this.recognition.onspeechstart = () => this.resetSilenceTimer();
    this.recognition.onspeechend = () => {};
    this.recognition.onnomatch = () => {
      speechLog.info(TAG, 'No match — letting silence timer handle restart');
    };
    this.recognition.onstart = () => { this.recognitionRunning = true; };
  }

  // --------------- TTS -----------------------------------------------------

  async synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult> {
    return new Promise((resolve, reject) => {
      if (!this.isTTSAvailable()) {
        reject(new Error('Text-to-speech is not available in this browser'));
        return;
      }

      const enqueueUtterance = (u: SpeechSynthesisUtterance) => {
        this.utteranceQueue.push(u);
        if (!this.isSpeakingTTS) this.playNextUtterance();
      };

      const chunks = this.chunkTextForSynthesis(text);
      let totalDuration = 0;

      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (options?.voice) {
          const voices = window.speechSynthesis.getVoices();
          const v = voices.find(v => v.name === options.voice || v.voiceURI === options.voice);
          if (v) utterance.voice = v;
        }
        const rate = options?.rate ?? 1.0;
        utterance.rate = rate;
        utterance.pitch = options?.pitch ?? 1.0;
        utterance.volume = options?.volume ?? 1.0;
        utterance.lang = options?.language ?? 'en-US';
        totalDuration += chunk.length * 60 / (150 * rate);

        if (index === chunks.length - 1) {
          utterance.onend = () => resolve({ duration: totalDuration });
          utterance.onerror = (ev) => reject(new Error(`Speech synthesis failed: ${ev.error}`));
        }
        enqueueUtterance(utterance);
      });
    });
  }

  cancelSynthesis(): void {
    try { window.speechSynthesis.cancel(); } catch {}
    this.utteranceQueue = [];
    this.isSpeakingTTS = false;
    super.cancelSynthesis();
  }

  async getAvailableVoices(): Promise<VoiceInfo[]> {
    if (!this.isTTSAvailable()) return [];
    return new Promise((resolve) => {
      const getList = () => {
        resolve(
          window.speechSynthesis.getVoices().map(voice => ({
            id: voice.voiceURI,
            name: voice.name,
            language: voice.lang,
            gender: this.guessGenderFromName(voice.name),
            provider: 'web' as const,
            isDefault: voice.default
          }))
        );
      };
      if (window.speechSynthesis.getVoices().length > 0) {
        getList();
      } else {
        window.speechSynthesis.onvoiceschanged = getList;
        setTimeout(getList, 100);
      }
    });
  }

  // --------------- STT start / stop ----------------------------------------

  async startRecognition(options?: STTOptions): Promise<void> {
    speechLog.info(TAG, 'Starting recognition', options);

    if (!this.isSTTAvailable()) {
      throw new Error('Speech recognition is not available in this browser');
    }
    if (this.isRecording) return;

    if (!this.isRestarting) this.clearTranscripts();

    // Request microphone permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      throw new Error('Microphone permission is required for speech recognition');
    }

    // Re-create recognition instance if needed
    if (!this.recognition) {
      const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!Ctor || typeof Ctor !== 'function') throw new Error('SpeechRecognition constructor not available');
      this.recognition = new Ctor();
      this.setupRecognition();
    }

    const rec = this.recognition!;

    // Cancel any active TTS that might interfere with mic capture
    try { window.speechSynthesis?.cancel(); } catch {}

    this.isRecording = true;
    this.isRestarting = false;
    this.explicitlyStopped = false;
    this.restartAttempts = 0;
    this.continuousMode = options?.continuous ?? true;
    this.lastResultTime = Date.now();

    rec.lang = options?.language ?? this.config.language ?? 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = options?.maxAlternatives ?? this.config.maxAlternatives ?? 1;

    try {
      if (this.recognitionRunning) {
        try { rec.stop(); } catch {}
        await new Promise(r => setTimeout(r, 100));
      }
      rec.start();
      this.recognitionRunning = true;
      this.startSilenceTimer();
      speechLog.info(TAG, 'Recognition started');
    } catch (startError: any) {
      if (startError.name === 'InvalidStateError') {
        this.recognitionRunning = false;
        try {
          rec.stop();
          await new Promise(r => setTimeout(r, 200));
          rec.start();
          this.recognitionRunning = true;
          this.startSilenceTimer();
        } catch (restartError) {
          this.isRecording = false;
          this.continuousMode = false;
          throw restartError;
        }
      } else {
        this.isRecording = false;
        this.continuousMode = false;
        this.explicitlyStopped = true;
        throw startError;
      }
    }
  }

  async stopRecognition(): Promise<SpeechRecognitionResult> {
    return new Promise((resolve) => {
      if (!this.recognition || !this.isRecording) {
        resolve({ transcript: this.currentTranscript.trim(), confidence: 1, isFinal: true });
        return;
      }

      this.continuousMode = false;
      this.explicitlyStopped = true;
      this.recognitionRunning = false;
      this.isRestarting = false;
      this.clearTimers();
      this.recognitionResolve = resolve;

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
        this.clearTranscripts();
      };

      this.recognition.addEventListener('end', handleStop, { once: true });
      this.recognition.stop();
      setTimeout(handleStop, 2000);
    });
  }

  // --------------- Internal helpers ----------------------------------------

  private scheduleRestart(): void {
    if (this.isRestarting || !this.continuousMode || this.restartAttempts >= this.maxRestartAttempts) return;
    this.isRestarting = true;
    this.restartAttempts++;
    if (this.restartTimer) clearTimeout(this.restartTimer);

    this.restartTimer = setTimeout(() => {
      if (this.continuousMode && this.isRecording && this.recognition) {
        try {
          try { this.recognition.stop(); } catch {}
          try {
            this.recognition.start();
            this.pendingRestart = false;
            this.isRestarting = false;
            this.startSilenceTimer();
            speechLog.info(TAG, 'Recognition restarted');
          } catch {
            this.isRestarting = false;
          }
        } catch {
          this.isRestarting = false;
        }
      } else {
        this.isRestarting = false;
      }
    }, 500);
  }

  private startSilenceTimer(): void { this.resetSilenceTimer(); }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.isRecording && this.continuousMode) {
        if (Date.now() - this.lastResultTime > this.silenceTimeoutMs) {
          this.consecutiveSilenceCount++;
          speechLog.info(TAG, `Prolonged silence (${this.consecutiveSilenceCount}/${this.maxConsecutiveSilence})`);
          if (this.consecutiveSilenceCount >= this.maxConsecutiveSilence) {
            this.scheduleRestart();
          } else {
            this.resetSilenceTimer();
          }
        }
      }
    }, this.silenceTimeoutMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = undefined; }
  }

  private resetSilenceCount(): void { this.consecutiveSilenceCount = 0; }

  private clearTranscripts(): void {
    this.fullTranscript = '';
    this.currentTranscript = '';
  }

  private updatePerformanceMetrics(confidence: number): void {
    this.performanceMetrics.totalResults++;
    const total = this.performanceMetrics.averageConfidence * (this.performanceMetrics.totalResults - 1) + confidence;
    this.performanceMetrics.averageConfidence = total / this.performanceMetrics.totalResults;

    const now = Date.now();
    if (now - this.performanceMetrics.lastPerformanceCheck > 30000) {
      if (this.performanceMetrics.averageConfidence < 0.7) {
        this.silenceTimeoutMs = Math.min(this.silenceTimeoutMs + 2000, 15000);
      } else if (this.performanceMetrics.averageConfidence > 0.9) {
        this.silenceTimeoutMs = Math.max(this.silenceTimeoutMs - 1000, 5000);
      }
      this.performanceMetrics.lastPerformanceCheck = now;
    }
  }

  private clearTimers(): void {
    this.clearSilenceTimer();
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = undefined; }
  }

  private playNextUtterance(): void {
    if (this.isSpeakingTTS) return;
    const next = this.utteranceQueue.shift();
    if (!next) return;
    this.isSpeakingTTS = true;
    next.onend = ((orig) => (ev: any) => {
      try { (orig as any)?.(ev); } catch {}
      this.isSpeakingTTS = false;
      setTimeout(() => this.playNextUtterance(), 20);
    })(next.onend as any);
    next.onerror = ((orig) => (ev: any) => {
      try { (orig as any)?.(ev); } catch {}
      this.isSpeakingTTS = false;
      this.playNextUtterance();
    })(next.onerror as any);
    try { window.speechSynthesis.speak(next); } catch { this.isSpeakingTTS = false; }
  }

  private chunkTextForSynthesis(text: string): string[] {
    const maxLen = 180;
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
          for (let i = 0; i < s.length; i += maxLen) chunks.push(s.slice(i, i + maxLen).trim());
          current = '';
        }
      }
    }
    if (current) chunks.push(current.trim());
    return chunks;
  }

  // --------------- Capability queries --------------------------------------

  isAvailable(): boolean { return this.isTTSAvailable() || this.isSTTAvailable(); }

  isListening(): boolean { return this.isRecording && !this.explicitlyStopped; }

  getCapabilities(): SpeechServiceCapabilities {
    return {
      supportsTTS: this.isTTSAvailable(),
      supportsSTT: this.isSTTAvailable(),
      supportsStreaming: false,
      supportsVoiceCloning: false,
      supportsEmotions: false,
      supportsMultiLanguage: true,
      supportsVAD: true,
      availableVoices: [],
      availableLanguages: this.getAvailableLanguages()
    };
  }

  dispose(): void {
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
    try { window.speechSynthesis?.cancel(); } catch {}
    this.currentTranscript = '';
    this.fullTranscript = '';
    this.lastResultTime = 0;
    this.restartAttempts = 0;
    super.dispose();
  }

  supportsAudioProcessing(): boolean { return false; }

  async processAudioData(_audioData: Blob | ArrayBuffer | string, _options?: STTOptions): Promise<SpeechRecognitionResult> {
    throw new Error('Web Speech API does not support direct audio data processing. Use startRecognition() for microphone-based recognition.');
  }

  // --------------- Private availability checks ----------------------------

  private isTTSAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private isSTTAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      return !!(Ctor && typeof Ctor === 'function');
    } catch { return false; }
  }

  private guessGenderFromName(name: string): 'male' | 'female' | 'neutral' {
    const l = name.toLowerCase();
    if (l.includes('female') || l.includes('woman')) return 'female';
    if (l.includes('male') || l.includes('man')) return 'male';
    return 'neutral';
  }

  private getAvailableLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE',
      'it-IT', 'pt-BR', 'pt-PT', 'ru-RU', 'zh-CN', 'zh-TW',
      'ja-JP', 'ko-KR', 'ar-SA', 'hi-IN', 'nl-NL', 'pl-PL'
    ];
  }
}
