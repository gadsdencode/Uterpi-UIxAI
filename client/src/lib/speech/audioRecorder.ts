// AudioRecorder: MRecordRTC-based audio recording and processing service

import RecordRTC from 'recordrtc/RecordRTC';
import { blobToBase64 } from './speechUtils';

export interface AudioRecorderConfig {
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  mimeType?: "audio/webm" | "audio/webm;codecs=pcm" | "video/mp4" | "video/webm" | "video/webm;codecs=vp9" | "video/webm;codecs=vp8" | "video/webm;codecs=h264" | "video/x-matroska;codecs=avc1" | "video/mpeg" | "audio/wav" | "audio/ogg";
  timeSlice?: number; // For streaming/chunked recording
  onDataAvailable?: (audioData: Blob) => void;
  onError?: (error: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
}

export interface AudioProcessingOptions {
  format?: 'wav' | 'mp3' | 'webm' | 'ogg';
  quality?: 'low' | 'medium' | 'high';
  compression?: boolean;
  noiseReduction?: boolean;
  normalize?: boolean;
}

export class AudioRecorder {
  private recorder: RecordRTC | null = null;
  private stream: MediaStream | null = null;
  private config: AudioRecorderConfig;
  private isRecording: boolean = false;
  private isInitialized: boolean = false;
  private audioChunks: Blob[] = [];
  private recordingStartTime: number = 0;

  constructor(config: AudioRecorderConfig = {}) {
    this.config = {
      sampleRate: 16000, // Optimal for speech recognition
      channels: 1, // Mono for speech
      bitRate: 128000,
      mimeType: 'audio/webm',
      timeSlice: 1000, // 1 second chunks for streaming
      ...config
    };
  }

  /**
   * Initialize the audio recorder with microphone access
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
          // Note: latency is not a valid MediaTrackConstraints property
          // Low latency is achieved through RecordRTC configuration instead
        }
      });

      // Create RecordRTC instance
      this.recorder = new RecordRTC(this.stream, {
        type: 'audio',
        mimeType: this.config.mimeType,
        sampleRate: this.config.sampleRate,
        numberOfAudioChannels: (this.config.channels === 1 || this.config.channels === 2) ? this.config.channels : 1,
        timeSlice: this.config.timeSlice,
        ondataavailable: (blob: Blob) => {
          this.audioChunks.push(blob);
          if (this.config.onDataAvailable) {
            this.config.onDataAvailable(blob);
          }
        }
      });

      this.isInitialized = true;
      console.log('[AudioRecorder] ✅ Initialized successfully');
    } catch (error) {
      console.error('[AudioRecorder] ❌ Initialization failed:', error);
      throw new Error(`Audio recorder initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRecording) {
      console.warn('[AudioRecorder] Already recording');
      return;
    }

    if (!this.recorder) {
      throw new Error('Audio recorder not initialized');
    }

    try {
      this.audioChunks = [];
      this.recordingStartTime = Date.now();
      this.isRecording = true;

      this.recorder.startRecording();
      
      if (this.config.onStart) {
        this.config.onStart();
      }

      console.log('[AudioRecorder] 🎤 Recording started');
    } catch (error) {
      this.isRecording = false;
      console.error('[AudioRecorder] ❌ Failed to start recording:', error);
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop recording and return the audio data
   */
  async stopRecording(): Promise<Blob> {
    if (!this.isRecording || !this.recorder) {
      throw new Error('No active recording to stop');
    }

    try {
      return new Promise((resolve, reject) => {
        this.recorder!.stopRecording(() => {
          try {
            const blob = this.recorder!.getBlob();
            this.isRecording = false;
            
            if (this.config.onStop) {
              this.config.onStop();
            }

            const duration = Date.now() - this.recordingStartTime;
            console.log(`[AudioRecorder] 🛑 Recording stopped (${duration}ms)`);
            
            resolve(blob);
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      this.isRecording = false;
      console.error('[AudioRecorder] ❌ Failed to stop recording:', error);
      throw new Error(`Failed to stop recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current recording duration
   */
  getRecordingDuration(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.recordingStartTime;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Process audio data for optimal STT performance
   */
  async processAudioForSTT(
    audioBlob: Blob, 
    options: AudioProcessingOptions = {}
  ): Promise<Blob> {
    const {
      format = 'webm',
      quality = 'medium',
      compression = true,
      noiseReduction = true,
      normalize = true
    } = options;

    try {
      // For now, we'll return the original blob
      // In a production environment, you might want to:
      // 1. Convert to different formats
      // 2. Apply noise reduction
      // 3. Normalize audio levels
      // 4. Compress audio data
      
      console.log(`[AudioRecorder] Processing audio for STT: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      // Basic validation
      if (audioBlob.size === 0) {
        throw new Error('Audio blob is empty');
      }

      // Convert to base64 if needed for API transmission
      if (format !== audioBlob.type.split('/')[1]) {
        console.warn(`[AudioRecorder] Format mismatch: requested ${format}, got ${audioBlob.type}`);
      }

      return audioBlob;
    } catch (error) {
      console.error('[AudioRecorder] ❌ Audio processing failed:', error);
      throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert audio blob to base64 for API transmission
   */
  async audioBlobToBase64(audioBlob: Blob): Promise<string> {
    try {
      return await blobToBase64(audioBlob);
    } catch (error) {
      console.error('[AudioRecorder] ❌ Base64 conversion failed:', error);
      throw new Error(`Base64 conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get audio stream for real-time processing
   */
  getAudioStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Get current audio chunks (for streaming scenarios)
   */
  getAudioChunks(): Blob[] {
    return [...this.audioChunks];
  }

  /**
   * Clear audio chunks
   */
  clearAudioChunks(): void {
    this.audioChunks = [];
  }

  /**
   * Update recorder configuration
   */
  updateConfig(newConfig: Partial<AudioRecorderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Check if the recorder is available in the current environment
   */
  static isAvailable(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Get supported audio formats
   */
  static getSupportedFormats(): string[] {
    const formats = [];
    
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      formats.push('audio/webm;codecs=opus');
    }
    if (MediaRecorder.isTypeSupported('audio/webm')) {
      formats.push('audio/webm');
    }
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      formats.push('audio/mp4');
    }
    if (MediaRecorder.isTypeSupported('audio/wav')) {
      formats.push('audio/wav');
    }
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      formats.push('audio/ogg;codecs=opus');
    }

    return formats;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.isRecording) {
      this.stopRecording().catch(() => {});
    }

    if (this.recorder) {
      this.recorder.destroy();
      this.recorder = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.audioChunks = [];
    this.isInitialized = false;
    this.isRecording = false;

    console.log('[AudioRecorder] 🧹 Disposed');
  }
}
