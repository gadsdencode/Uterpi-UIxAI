// Base abstract class for all speech service implementations

import {
  ISpeechService,
  SpeechConfig,
  TTSOptions,
  STTOptions,
  SpeechRecognitionResult,
  SpeechSynthesisResult,
  VoiceInfo,
  SpeechServiceCapabilities,
  SpeechProvider
} from '../../types/speech';
import { speechLog } from './speechDebug';

const TAG = 'BaseSpeech';

export abstract class BaseSpeechService implements ISpeechService {
  protected config: SpeechConfig = {};
  protected provider: SpeechProvider;
  protected recognitionCallbacks: ((result: SpeechRecognitionResult) => void)[] = [];
  protected isInitialized: boolean = false;
  private activeAudioElements: Set<HTMLAudioElement> = new Set();

  constructor(provider: SpeechProvider) {
    this.provider = provider;
  }

  abstract synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult>;
  abstract getAvailableVoices(): Promise<VoiceInfo[]>;
  abstract startRecognition(options?: STTOptions): Promise<void>;
  abstract stopRecognition(): Promise<SpeechRecognitionResult>;
  abstract isAvailable(): boolean;
  abstract getCapabilities(): SpeechServiceCapabilities;
  abstract isListening(): boolean;

  async processAudioData?(audioData: Blob | ArrayBuffer | string, options?: STTOptions): Promise<SpeechRecognitionResult> {
    throw new Error(`Audio data processing not implemented for ${this.provider} provider`);
  }

  supportsAudioProcessing?(): boolean {
    return false;
  }

  async initialize(config?: SpeechConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.isInitialized = true;
  }

  onRecognitionResult(callback: (result: SpeechRecognitionResult) => void): void {
    speechLog.info(TAG, `Registering recognition callback (total: ${this.recognitionCallbacks.length + 1})`);
    this.recognitionCallbacks.push(callback);
  }

  protected notifyRecognitionResult(result: SpeechRecognitionResult): void {
    speechLog.info(TAG, `Notifying ${this.recognitionCallbacks.length} callback(s): final=${result.isFinal} transcript="${result.transcript?.slice(0, 60)}"`);
    this.recognitionCallbacks.forEach(cb => cb(result));
  }

  dispose(): void {
    this.cancelSynthesis();
    this.recognitionCallbacks = [];
    this.isInitialized = false;
  }

  /**
   * Play audio data through an HTMLAudioElement.
   * Accepts ArrayBuffer, Blob, or a URL string.
   * When receiving an ArrayBuffer, `mimeType` tells us the correct content-type
   * so we don't assume audio/mpeg for every provider.
   */
  protected async playAudioData(
    audioData: ArrayBuffer | Blob | string,
    mimeType?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.activeAudioElements.add(audio);

      if (typeof audioData === 'string') {
        audio.src = audioData;
      } else if (audioData instanceof Blob) {
        audio.src = URL.createObjectURL(audioData);
      } else {
        const effectiveMime = mimeType || 'audio/mpeg';
        const blob = new Blob([audioData], { type: effectiveMime });
        audio.src = URL.createObjectURL(blob);
      }

      audio.onended = () => {
        if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
        this.activeAudioElements.delete(audio);
        resolve();
      };

      audio.onerror = (e) => {
        this.activeAudioElements.delete(audio);
        reject(e as any);
      };

      audio.play().catch((e) => {
        this.activeAudioElements.delete(audio);
        reject(e);
      });
    });
  }

  protected textToSSML(text: string, options?: TTSOptions): string {
    const rate = options?.rate ?? 1.0;
    const pitch = options?.pitch ?? 1.0;
    const volume = options?.volume ?? 1.0;
    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis">
        <prosody rate="${rate}" pitch="${pitch}x" volume="${volume * 100}">
          ${text}
        </prosody>
      </speak>
    `.trim();
  }

  cancelSynthesis(): void {
    try {
      if (typeof window !== 'undefined' && (window as any).speechSynthesis) {
        (window as any).speechSynthesis.cancel();
      }
    } catch {}
    this.activeAudioElements.forEach((audio) => {
      try { audio.pause(); } catch {}
      try {
        if (audio.src?.startsWith('blob:')) URL.revokeObjectURL(audio.src);
      } catch {}
    });
    this.activeAudioElements.clear();
  }
}
