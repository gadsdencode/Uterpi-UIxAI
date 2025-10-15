// Voice Activity Detection (VAD) Service
// Provides real-time speech detection using Web Audio API and advanced algorithms

import { AudioRecorder } from './audioRecorder';

export interface VADConfig {
  // Detection sensitivity (0.0 to 1.0, lower = more sensitive)
  sensitivity?: number;
  // Minimum speech duration in ms before triggering
  minSpeechDuration?: number;
  // Silence duration in ms before ending speech
  silenceTimeout?: number;
  // Audio analysis parameters
  sampleRate?: number;
  frameSize?: number; // Analysis frame size in samples
  hopSize?: number;   // Hop size between frames
  // Energy-based detection
  energyThreshold?: number;
  energyRatio?: number;
  // Spectral analysis
  spectralThreshold?: number;
  spectralCentroid?: number;
  // Zero crossing rate
  zcrThreshold?: number;
  // Advanced features
  adaptiveThreshold?: boolean;
  noiseFloorLearning?: boolean;
  noiseFloorSamples?: number;
}

export interface VADEvent {
  type: 'speech_start' | 'speech_end' | 'speech_segment' | 'noise_detected' | 'silence_detected';
  timestamp: number;
  confidence: number;
  audioData?: Float32Array;
  duration?: number;
  energy?: number;
  spectralCentroid?: number;
  zeroCrossingRate?: number;
}

export interface VADStats {
  totalSpeechTime: number;
  totalSilenceTime: number;
  speechSegments: number;
  averageSpeechDuration: number;
  averageSilenceDuration: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number;
}

type VADCallback = (event: VADEvent) => void;

export class VADService {
  private config: Required<VADConfig>;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private isActive: boolean = false;
  private isListening: boolean = false;
  private callbacks: VADCallback[] = [];
  
  // Audio analysis buffers
  private audioBuffer: Float32Array;
  private frameBuffer: Float32Array;
  private energyBuffer: number[] = [];
  private spectralBuffer: number[] = [];
  private zcrBuffer: number[] = [];
  
  // State tracking
  private currentState: 'silence' | 'speech' | 'noise' = 'silence';
  private speechStartTime: number = 0;
  private lastSpeechTime: number = 0;
  private silenceStartTime: number = 0;
  private speechSegments: number = 0;
  private totalSpeechTime: number = 0;
  private totalSilenceTime: number = 0;
  
  // Adaptive thresholds
  private noiseFloor: number = 0;
  private adaptiveThreshold: number = 0;
  private noiseFloorSamples: number[] = [];
  private isLearningNoiseFloor: boolean = true;
  
  // Performance tracking
  private falsePositives: number = 0;
  private falseNegatives: number = 0;
  private lastAnalysisTime: number = 0;
  
  // Analysis timer
  private analysisTimer?: NodeJS.Timeout;
  private frameId?: number;

  constructor(config: VADConfig = {}) {
    this.config = {
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
      noiseFloorSamples: 50,
      ...config
    };

    // Initialize audio buffers
    this.audioBuffer = new Float32Array(this.config.frameSize);
    this.frameBuffer = new Float32Array(this.config.frameSize);
  }

  /**
   * Initialize the VAD service with microphone access
   */
  async initialize(): Promise<void> {
    if (this.isActive) return;

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate
      });

      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create audio nodes
      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      
      // Configure analyser
      this.analyser.fftSize = this.config.frameSize * 2;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      // Connect audio nodes
      this.microphone.connect(this.analyser);

      this.isActive = true;
      console.log('[VAD] ✅ Initialized successfully');
    } catch (error) {
      console.error('[VAD] ❌ Initialization failed:', error);
      throw new Error(`VAD initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start voice activity detection
   */
  async start(): Promise<void> {
    if (!this.isActive) {
      await this.initialize();
    }

    if (this.isListening) {
      console.warn('[VAD] Already listening');
      return;
    }

    this.isListening = true;
    this.currentState = 'silence';
    this.speechSegments = 0;
    this.totalSpeechTime = 0;
    this.totalSilenceTime = 0;
    this.falsePositives = 0;
    this.falseNegatives = 0;
    this.isLearningNoiseFloor = this.config.noiseFloorLearning;

    // Start audio analysis
    this.startAnalysis();
    console.log('[VAD] 🎤 Voice activity detection started');
  }

  /**
   * Stop voice activity detection
   */
  stop(): void {
    if (!this.isListening) return;

    this.isListening = false;
    this.stopAnalysis();

    // Emit final speech end event if currently in speech
    if (this.currentState === 'speech') {
      this.emitEvent({
        type: 'speech_end',
        timestamp: Date.now(),
        confidence: 1.0,
        duration: Date.now() - this.speechStartTime
      });
    }

    console.log('[VAD] 🛑 Voice activity detection stopped');
  }

  /**
   * Add event callback
   */
  onEvent(callback: VADCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove event callback
   */
  offEvent(callback: VADCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Update VAD configuration
   */
  updateConfig(newConfig: Partial<VADConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize buffers if frame size changed
    if (newConfig.frameSize && newConfig.frameSize !== this.config.frameSize) {
      this.audioBuffer = new Float32Array(this.config.frameSize);
      this.frameBuffer = new Float32Array(this.config.frameSize);
    }
  }

  /**
   * Get current VAD statistics
   */
  getStats(): VADStats {
    const totalTime = this.totalSpeechTime + this.totalSilenceTime;
    const accuracy = totalTime > 0 ? 
      (this.totalSpeechTime / totalTime) * 100 : 0;

    return {
      totalSpeechTime: this.totalSpeechTime,
      totalSilenceTime: this.totalSilenceTime,
      speechSegments: this.speechSegments,
      averageSpeechDuration: this.speechSegments > 0 ? 
        this.totalSpeechTime / this.speechSegments : 0,
      averageSilenceDuration: this.speechSegments > 0 ? 
        this.totalSilenceTime / this.speechSegments : 0,
      falsePositives: this.falsePositives,
      falseNegatives: this.falseNegatives,
      accuracy
    };
  }

  /**
   * Check if VAD is currently active
   */
  isCurrentlyActive(): boolean {
    return this.isActive && this.isListening;
  }

  /**
   * Get current detection state
   */
  getCurrentState(): 'silence' | 'speech' | 'noise' {
    return this.currentState;
  }

  /**
   * Start audio analysis loop
   */
  private startAnalysis(): void {
    const analyzeFrame = () => {
      if (!this.isListening || !this.analyser) return;

      this.analyzeAudioFrame();
      this.frameId = requestAnimationFrame(analyzeFrame);
    };

    this.frameId = requestAnimationFrame(analyzeFrame);
  }

  /**
   * Stop audio analysis loop
   */
  private stopAnalysis(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = undefined;
    }
  }

  /**
   * Analyze current audio frame for voice activity
   */
  private analyzeAudioFrame(): void {
    if (!this.analyser) return;

    // Get audio data
    const buffer = new Float32Array(new ArrayBuffer(this.config.frameSize * 4));
    this.analyser.getFloatTimeDomainData(buffer);
    this.audioBuffer.set(buffer);
    
    // Calculate audio features
    const energy = this.calculateEnergy(this.audioBuffer);
    const spectralCentroid = this.calculateSpectralCentroid();
    const zeroCrossingRate = this.calculateZeroCrossingRate(this.audioBuffer);
    
    // Update buffers
    this.energyBuffer.push(energy);
    this.spectralBuffer.push(spectralCentroid);
    this.zcrBuffer.push(zeroCrossingRate);
    
    // Keep buffer sizes manageable
    if (this.energyBuffer.length > 10) {
      this.energyBuffer.shift();
      this.spectralBuffer.shift();
      this.zcrBuffer.shift();
    }

    // Learn noise floor if enabled
    if (this.isLearningNoiseFloor && this.noiseFloorSamples.length < this.config.noiseFloorSamples) {
      this.noiseFloorSamples.push(energy);
      if (this.noiseFloorSamples.length === this.config.noiseFloorSamples) {
        this.noiseFloor = this.calculateMedian(this.noiseFloorSamples);
        this.adaptiveThreshold = this.noiseFloor * this.config.energyRatio;
        this.isLearningNoiseFloor = false;
        console.log(`[VAD] 📊 Noise floor learned: ${this.noiseFloor.toFixed(4)}, threshold: ${this.adaptiveThreshold.toFixed(4)}`);
      }
    }

    // Detect voice activity
    const isSpeech = this.detectSpeech(energy, spectralCentroid, zeroCrossingRate);
    this.updateState(isSpeech, energy, spectralCentroid, zeroCrossingRate);
  }

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateEnergy(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  /**
   * Calculate spectral centroid
   */
  private calculateSpectralCentroid(): number {
    if (!this.analyser) return 0;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    let weightedSum = 0;
    let magnitudeSum = 0;

    for (let i = 0; i < bufferLength; i++) {
      const magnitude = dataArray[i];
      const frequency = (i * this.config.sampleRate) / (bufferLength * 2);
      
      weightedSum += frequency * magnitude;
      magnitudeSum += magnitude;
    }

    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  /**
   * Calculate zero crossing rate
   */
  private calculateZeroCrossingRate(buffer: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < buffer.length; i++) {
      if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / buffer.length;
  }

  /**
   * Detect speech based on audio features
   */
  private detectSpeech(energy: number, spectralCentroid: number, zcr: number): boolean {
    // Use adaptive threshold if enabled and noise floor is learned
    const energyThreshold = this.config.adaptiveThreshold && !this.isLearningNoiseFloor ? 
      this.adaptiveThreshold : this.config.energyThreshold;

    // Energy-based detection
    const energyCheck = energy > energyThreshold;
    
    // Spectral centroid check (speech typically has higher spectral centroid)
    const spectralCheck = spectralCentroid > this.config.spectralCentroid;
    
    // Zero crossing rate check (speech has moderate ZCR, noise has high ZCR)
    const zcrCheck = zcr > this.config.zcrThreshold && zcr < 0.5;

    // Combine features with sensitivity weighting
    const confidence = (
      (energyCheck ? 0.4 : 0) +
      (spectralCheck ? 0.3 : 0) +
      (zcrCheck ? 0.3 : 0)
    ) * this.config.sensitivity;

    return confidence > 0.5;
  }

  /**
   * Update VAD state based on detection results
   */
  private updateState(isSpeech: boolean, energy: number, spectralCentroid: number, zcr: number): void {
    const now = Date.now();
    const timestamp = now;

    switch (this.currentState) {
      case 'silence':
        if (isSpeech) {
          this.currentState = 'speech';
          this.speechStartTime = now;
          this.lastSpeechTime = now;
          
          this.emitEvent({
            type: 'speech_start',
            timestamp,
            confidence: 0.8,
            energy,
            spectralCentroid,
            zeroCrossingRate: zcr
          });
        } else {
          // Update silence duration
          if (this.silenceStartTime === 0) {
            this.silenceStartTime = now;
          }
        }
        break;

      case 'speech':
        if (isSpeech) {
          this.lastSpeechTime = now;
        } else {
          // Check if silence timeout exceeded
          const silenceDuration = now - this.lastSpeechTime;
          if (silenceDuration > this.config.silenceTimeout) {
            const speechDuration = this.lastSpeechTime - this.speechStartTime;
            
            // Only emit speech_end if minimum duration met
            if (speechDuration >= this.config.minSpeechDuration) {
              this.speechSegments++;
              this.totalSpeechTime += speechDuration;
              
              this.emitEvent({
                type: 'speech_end',
                timestamp,
                confidence: 0.9,
                duration: speechDuration,
                energy,
                spectralCentroid,
                zeroCrossingRate: zcr
              });
            } else {
              // Too short, count as false positive
              this.falsePositives++;
            }

            this.currentState = 'silence';
            this.silenceStartTime = now;
            this.totalSilenceTime += silenceDuration;
          }
        }
        break;
    }
  }

  /**
   * Emit VAD event to all callbacks
   */
  private emitEvent(event: VADEvent): void {
    this.callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[VAD] Error in event callback:', error);
      }
    });
  }

  /**
   * Calculate median of array
   */
  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? 
      (sorted[mid - 1] + sorted[mid]) / 2 : 
      sorted[mid];
  }

  /**
   * Dispose of VAD resources
   */
  dispose(): void {
    this.stop();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.microphone = null;
    this.callbacks = [];
    this.isActive = false;
    this.isListening = false;

    console.log('[VAD] 🧹 Disposed');
  }

  /**
   * Check if VAD is available in the current environment
   */
  static isAvailable(): boolean {
    return !!(
      navigator.mediaDevices && 
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (window.AudioContext || (window as any).webkitAudioContext)
    );
  }
}
