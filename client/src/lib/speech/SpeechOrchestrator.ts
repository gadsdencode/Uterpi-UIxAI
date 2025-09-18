// SpeechOrchestrator: resilient, provider-agnostic STT controller with progress watchdog and fallback

import { ISpeechService, STTOptions, SpeechRecognitionResult } from '../../types/speech';
import { SpeechServiceFactory } from './speechServiceFactory';
import { AIProvider } from '../../hooks/useAIProvider';

type RecognitionCallback = (result: SpeechRecognitionResult) => void;

interface OrchestratorOptions {
  aiProvider: AIProvider;
  onResult?: RecognitionCallback;
  progressTimeoutMs?: number; // time without interim/final before restart
  maxRestartsPerMinute?: number;
}

export class SpeechOrchestrator {
  private aiProvider: AIProvider;
  private onResult?: RecognitionCallback;
  private sttService: ISpeechService | null = null;
  private progressTimeoutMs: number;
  private maxRestartsPerMinute: number;
  private lastProgressAt: number = 0;
  private watchdogTimer?: NodeJS.Timeout;
  private restartTimestamps: number[] = [];
  private isActive: boolean = false;
  private optionsRef: STTOptions | undefined;

  constructor(opts: OrchestratorOptions) {
    this.aiProvider = opts.aiProvider;
    this.onResult = opts.onResult;
    this.progressTimeoutMs = opts.progressTimeoutMs ?? 30000; // Increased to 30 seconds for natural speech pauses
    this.maxRestartsPerMinute = opts.maxRestartsPerMinute ?? 10; // Allow more restarts for continuous mode
  }

  async initialize(config?: any): Promise<void> {
    this.sttService = await SpeechServiceFactory.getBestServiceFor(this.aiProvider, 'stt', config);
    // Chain results to orchestrator to track progress
    this.sttService.onRecognitionResult((r) => {
      this.lastProgressAt = Date.now();
      if (this.onResult) this.onResult(r);
    });
  }

  setOnResult(cb?: RecognitionCallback) {
    this.onResult = cb;
  }

  async start(options?: STTOptions): Promise<void> {
    if (!this.sttService) {
      await this.initialize();
    }
    this.isActive = true;
    this.optionsRef = options;
    this.lastProgressAt = Date.now();
    await this.sttService!.startRecognition(options);
    this.startWatchdog();
  }

  async stop(): Promise<SpeechRecognitionResult> {
    this.isActive = false;
    this.clearWatchdog();
    if (!this.sttService) {
      return { transcript: '', confidence: 1, isFinal: true };
    }
    return await this.sttService.stopRecognition();
  }

  dispose(): void {
    this.isActive = false;
    this.clearWatchdog();
    this.sttService?.dispose();
    this.sttService = null;
  }

  private startWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.isActive) return;
      const now = Date.now();
      const elapsed = now - this.lastProgressAt;
      if (elapsed > this.progressTimeoutMs) {
        // Restart recognition session to break stalled state
        this.recordRestart(now);
        this.safeRestart().catch(() => {});
      }
    }, Math.max(1000, Math.floor(this.progressTimeoutMs / 2)));
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  private recordRestart(now: number): void {
    this.restartTimestamps.push(now);
    // keep last minute
    const oneMinuteAgo = now - 60000;
    this.restartTimestamps = this.restartTimestamps.filter(t => t >= oneMinuteAgo);
  }

  private async safeRestart(): Promise<void> {
    if (!this.isActive) return;
    if (!this.sttService) return;

    // If too many restarts, fallback to another provider
    if (this.restartTimestamps.length >= this.maxRestartsPerMinute) {
      try {
        const alt = await SpeechServiceFactory.getBestServiceFor(this.aiProvider, 'stt');
        if (alt && alt !== this.sttService) {
          this.sttService.dispose();
          this.sttService = alt;
          this.sttService.onRecognitionResult((r) => {
            this.lastProgressAt = Date.now();
            if (this.onResult) this.onResult(r);
          });
        }
        // reset counters after switching
        this.restartTimestamps = [];
      } catch {}
    }

    try {
      await this.sttService.stopRecognition().catch(() => ({} as any));
    } catch {}
    this.lastProgressAt = Date.now();
    await this.sttService.startRecognition(this.optionsRef);
  }
}


