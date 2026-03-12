// SpeechOrchestrator: resilient, provider-agnostic STT controller with progress watchdog and fallback

import { ISpeechService, STTOptions, SpeechRecognitionResult, VADConfig, VADEvent } from '../../types/speech';
import { SpeechServiceFactory } from './speechServiceFactory';
import { AIProvider } from '../../hooks/useAIProvider';
import { AudioRecorder, AudioRecorderConfig, AudioProcessingOptions } from './audioRecorder';
import { VADService } from './vadService';
import { speechLog, normalizeSTTResult, CanonicalSTTResult } from './speechDebug';

const TAG = 'Orchestrator';

export type CanonicalResultCallback = (result: CanonicalSTTResult) => void;

interface OrchestratorOptions {
  aiProvider: AIProvider;
  onResult?: CanonicalResultCallback;
  progressTimeoutMs?: number;
  maxRestartsPerMinute?: number;
  useAudioRecording?: boolean;
  audioConfig?: AudioRecorderConfig;
  audioProcessing?: AudioProcessingOptions;
  enableVAD?: boolean;
  vadConfig?: VADConfig;
  onVADEvent?: (event: VADEvent) => void;
}

export class SpeechOrchestrator {
  private aiProvider: AIProvider;
  private onResult?: CanonicalResultCallback;
  private onVADEvent?: (event: VADEvent) => void;
  private sttService: ISpeechService | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private vadService: VADService | null = null;
  private progressTimeoutMs: number;
  private maxRestartsPerMinute: number;
  private lastProgressAt: number = 0;
  private watchdogTimer?: ReturnType<typeof setInterval>;
  private restartTimestamps: number[] = [];
  private isActive: boolean = false;
  private optionsRef: STTOptions | undefined;
  private consecutiveRestarts: number = 0;
  private useAudioRecording: boolean = false;
  private enableVAD: boolean = false;
  private audioProcessing: AudioProcessingOptions;
  private vadConfig: VADConfig;

  constructor(opts: OrchestratorOptions) {
    this.aiProvider = opts.aiProvider;
    this.onResult = opts.onResult;
    this.onVADEvent = opts.onVADEvent;
    this.progressTimeoutMs = opts.progressTimeoutMs ?? 30000;
    this.maxRestartsPerMinute = opts.maxRestartsPerMinute ?? 10;
    this.useAudioRecording = opts.useAudioRecording ?? false;
    this.enableVAD = opts.enableVAD ?? false;
    this.audioProcessing = opts.audioProcessing ?? {
      format: 'webm',
      quality: 'medium',
      compression: true,
      noiseReduction: true,
      normalize: true
    };
    this.vadConfig = opts.vadConfig ?? {
      sensitivity: 0.5,
      minSpeechDuration: 200,
      silenceTimeout: 1000,
      sampleRate: 16000,
      frameSize: 1024,
      hopSize: 512,
      energyThreshold: 0.01,
      energyRatio: 2.0,
      spectralThreshold: 0.3,
      spectralCentroid: 1000,
      zcrThreshold: 0.1,
      adaptiveThreshold: true,
      noiseFloorLearning: true,
      noiseFloorSamples: 50
    };

    if (this.useAudioRecording) {
      this.audioRecorder = new AudioRecorder(opts.audioConfig);
    }
    if (this.enableVAD) {
      this.vadService = new VADService(this.vadConfig);
    }
  }

  async initialize(config?: any): Promise<void> {
    this.sttService = await SpeechServiceFactory.getBestServiceFor(this.aiProvider, 'stt', config);

    if (this.useAudioRecording && this.audioRecorder) {
      await this.audioRecorder.initialize();
    }

    if (this.enableVAD && this.vadService) {
      await this.vadService.initialize();
      this.vadService.onEvent((event) => {
        speechLog.info(TAG, `VAD event: ${event.type}`);
        this.onVADEvent?.(event);
        if (event.type === 'speech_end') {
          this.processVADAudioSegment();
        }
      });
    }

    this.sttService.onRecognitionResult((raw: SpeechRecognitionResult) => {
      this.lastProgressAt = Date.now();
      const canonical = normalizeSTTResult(raw);
      if (canonical.displayTranscript.length > 0) {
        this.consecutiveRestarts = 0;
      }
      speechLog.info(TAG, `STT result → final="${canonical.finalTranscript}" interim="${canonical.interimTranscript}"`);
      this.onResult?.(canonical);
    });
  }

  setOnResult(cb?: CanonicalResultCallback) {
    this.onResult = cb;
  }

  async start(options?: STTOptions): Promise<void> {
    if (!this.sttService) {
      await this.initialize();
    }
    this.isActive = true;
    this.optionsRef = options;
    this.lastProgressAt = Date.now();

    if (this.enableVAD && this.vadService) {
      await this.vadService.start();
      speechLog.info(TAG, 'VAD started');
    }

    if (this.useAudioRecording && this.audioRecorder) {
      await this.audioRecorder.startRecording();
      speechLog.info(TAG, 'Audio recording started');
      this.startWatchdog();
    } else {
      await this.sttService!.startRecognition(options);
      this.startWatchdog();
    }
  }

  async stop(): Promise<CanonicalSTTResult> {
    this.isActive = false;
    this.clearWatchdog();

    if (this.enableVAD && this.vadService) {
      this.vadService.stop();
    }

    if (!this.sttService) {
      return { finalTranscript: '', interimTranscript: '', displayTranscript: '', confidence: 1, isFinal: true };
    }

    if (this.useAudioRecording && this.audioRecorder) {
      try {
        const audioBlob = await this.audioRecorder.stopRecording();
        const processedAudio = await this.audioRecorder.processAudioForSTT(audioBlob, this.audioProcessing);

        if (this.sttService.processAudioData && this.sttService.supportsAudioProcessing?.()) {
          const raw = await this.sttService.processAudioData(processedAudio, this.optionsRef);
          return normalizeSTTResult(raw);
        } else {
          const base64Audio = await this.audioRecorder.audioBlobToBase64(processedAudio);
          const audioOptions: STTOptions = {
            ...this.optionsRef,
            audioData: base64Audio,
            audioFormat: processedAudio.type,
            sampleRate: this.audioRecorder.getAudioStream()?.getAudioTracks()[0]?.getSettings().sampleRate,
            channels: 1
          };
          await this.sttService.startRecognition(audioOptions);
          const raw = await this.sttService.stopRecognition();
          return normalizeSTTResult(raw);
        }
      } catch (error) {
        speechLog.error(TAG, 'Audio processing failed', error);
        return { finalTranscript: '', interimTranscript: '', displayTranscript: '', confidence: 0, isFinal: true };
      }
    } else {
      const raw = await this.sttService.stopRecognition();
      return normalizeSTTResult(raw);
    }
  }

  dispose(): void {
    this.isActive = false;
    this.clearWatchdog();
    this.sttService?.dispose();
    this.sttService = null;
    this.audioRecorder?.dispose();
    this.audioRecorder = null;
    this.vadService?.dispose();
    this.vadService = null;
  }

  // --- Watchdog ----------------------------------------------------------

  private startWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.isActive) return;
      const elapsed = Date.now() - this.lastProgressAt;
      if (elapsed > this.progressTimeoutMs) {
        if (this.consecutiveRestarts < 3) {
          speechLog.info(TAG, `Progress timeout (${elapsed}ms), restarting`);
          this.recordRestart(Date.now());
          this.safeRestart().catch(() => {});
        } else {
          speechLog.warn(TAG, `Too many consecutive restarts (${this.consecutiveRestarts}), skipping`);
        }
      }
    }, Math.max(2000, Math.floor(this.progressTimeoutMs / 3)));
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  private recordRestart(now: number): void {
    this.restartTimestamps.push(now);
    this.consecutiveRestarts++;
    const oneMinuteAgo = now - 60000;
    this.restartTimestamps = this.restartTimestamps.filter(t => t >= oneMinuteAgo);
  }

  private async safeRestart(): Promise<void> {
    if (!this.isActive || !this.sttService) return;

    if (this.restartTimestamps.length >= this.maxRestartsPerMinute) {
      try {
        speechLog.info(TAG, `Too many restarts (${this.restartTimestamps.length}), trying alternative service`);
        const alt = await SpeechServiceFactory.getBestServiceFor(this.aiProvider, 'stt');
        if (alt && alt !== this.sttService) {
          this.sttService.dispose();
          this.sttService = alt;
          this.sttService.onRecognitionResult((raw) => {
            this.lastProgressAt = Date.now();
            this.onResult?.(normalizeSTTResult(raw));
          });
        }
        this.restartTimestamps = [];
        this.consecutiveRestarts = 0;
      } catch (error) {
        speechLog.warn(TAG, 'Failed to switch to alternative service', error);
      }
    }

    try {
      if (this.useAudioRecording && this.audioRecorder) {
        await this.processAudioChunks();
      } else {
        await this.sttService.stopRecognition().catch(() => ({} as any));
        await new Promise(resolve => setTimeout(resolve, 200));
        this.lastProgressAt = Date.now();
        await this.sttService.startRecognition(this.optionsRef);
        speechLog.info(TAG, 'Recognition restarted');
      }
    } catch (error) {
      speechLog.warn(TAG, 'Failed to restart recognition', error);
    }
  }

  // --- Audio chunk / VAD processing -------------------------------------

  private async processAudioChunks(): Promise<void> {
    if (!this.audioRecorder || !this.sttService) return;
    try {
      const audioChunks = this.audioRecorder.getAudioChunks();
      if (audioChunks.length === 0) return;
      const combinedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const processedAudio = await this.audioRecorder.processAudioForSTT(combinedBlob, this.audioProcessing);
      this.audioRecorder.clearAudioChunks();
      if (this.sttService.processAudioData && this.sttService.supportsAudioProcessing?.()) {
        const raw = await this.sttService.processAudioData(processedAudio, this.optionsRef);
        if (raw.transcript?.trim()) {
          this.lastProgressAt = Date.now();
          this.onResult?.(normalizeSTTResult(raw));
        }
      }
    } catch (error) {
      speechLog.warn(TAG, 'Failed to process audio chunks', error);
    }
  }

  private async processVADAudioSegment(): Promise<void> {
    if (!this.audioRecorder || !this.sttService) return;
    try {
      const audioChunks = this.audioRecorder.getAudioChunks();
      if (audioChunks.length === 0) return;
      const combinedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const processedAudio = await this.audioRecorder.processAudioForSTT(combinedBlob, this.audioProcessing);
      this.audioRecorder.clearAudioChunks();
      if (this.sttService.processAudioData && this.sttService.supportsAudioProcessing?.()) {
        const raw = await this.sttService.processAudioData(processedAudio, this.optionsRef);
        if (raw.transcript?.trim()) {
          this.lastProgressAt = Date.now();
          this.onResult?.(normalizeSTTResult(raw));
        }
      }
    } catch (error) {
      speechLog.warn(TAG, 'Failed to process VAD audio segment', error);
    }
  }

  // --- VAD accessors -----------------------------------------------------

  getVADStats() {
    return this.vadService?.getStats();
  }

  getVADState() {
    return this.vadService?.getCurrentState();
  }

  updateVADConfig(config: Partial<VADConfig>) {
    this.vadService?.updateConfig(config);
  }
}
