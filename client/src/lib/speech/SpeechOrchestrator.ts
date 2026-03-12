// SpeechOrchestrator: resilient, provider-agnostic STT controller with progress watchdog and fallback

import { ISpeechService, STTOptions, SpeechRecognitionResult, VADConfig, VADEvent } from '../../types/speech';
import { SpeechServiceFactory } from './speechServiceFactory';
import { AIProvider } from '../../hooks/useAIProvider';
import { AudioRecorder, AudioRecorderConfig, AudioProcessingOptions } from './audioRecorder';
import { VADService } from './vadService';

type RecognitionCallback = (result: SpeechRecognitionResult) => void;

interface OrchestratorOptions {
  aiProvider: AIProvider;
  onResult?: RecognitionCallback;
  progressTimeoutMs?: number; // time without interim/final before restart
  maxRestartsPerMinute?: number;
  useAudioRecording?: boolean; // Enable MRecordRTC audio recording
  audioConfig?: AudioRecorderConfig;
  audioProcessing?: AudioProcessingOptions;
  // VAD options
  enableVAD?: boolean;
  vadConfig?: VADConfig;
  onVADEvent?: (event: VADEvent) => void;
}

export class SpeechOrchestrator {
  private aiProvider: AIProvider;
  private onResult?: RecognitionCallback;
  private onVADEvent?: (event: VADEvent) => void;
  private sttService: ISpeechService | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private vadService: VADService | null = null;
  private progressTimeoutMs: number;
  private maxRestartsPerMinute: number;
  private lastProgressAt: number = 0;
  private watchdogTimer?: NodeJS.Timeout;
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
    this.progressTimeoutMs = opts.progressTimeoutMs ?? 30000; // Increased to 30 seconds for natural speech pauses
    this.maxRestartsPerMinute = opts.maxRestartsPerMinute ?? 10; // Allow more restarts for continuous mode
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

    // Initialize audio recorder if enabled
    if (this.useAudioRecording) {
      this.audioRecorder = new AudioRecorder(opts.audioConfig);
    }

    // Initialize VAD service if enabled
    if (this.enableVAD) {
      this.vadService = new VADService(this.vadConfig);
    }
  }

  async initialize(config?: any): Promise<void> {
    this.sttService = await SpeechServiceFactory.getBestServiceFor(this.aiProvider, 'stt', config);
    
    // Initialize audio recorder if enabled
    if (this.useAudioRecording && this.audioRecorder) {
      await this.audioRecorder.initialize();
    }

    // Initialize VAD service if enabled
    if (this.enableVAD && this.vadService) {
      await this.vadService.initialize();
      
      // Set up VAD event handling
      this.vadService.onEvent((event) => {
        console.log('[Orchestrator] 🎤 VAD Event:', event);
        
        // Forward VAD events to callback
        if (this.onVADEvent) {
          this.onVADEvent(event);
        }

        // Handle speech start/end events
        if (event.type === 'speech_start') {
          console.log('[Orchestrator] 🎤 Speech detected, starting STT processing');
          // VAD detected speech - we can optimize STT processing here
        } else if (event.type === 'speech_end') {
          console.log('[Orchestrator] 🎤 Speech ended, processing final audio');
          // Speech ended - process the audio segment
          this.processVADAudioSegment();
        }
      });
    }
    
    // Chain results to orchestrator to track progress
    this.sttService.onRecognitionResult((r) => {
      this.lastProgressAt = Date.now();
      // Reset consecutive restart counter on successful results
      if (r.transcript && r.transcript.trim().length > 0) {
        this.consecutiveRestarts = 0;
      }
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

    // Start VAD if enabled
    if (this.enableVAD && this.vadService) {
      await this.vadService.start();
      console.log('[Orchestrator] 🎤 VAD started');
    }

    if (this.useAudioRecording && this.audioRecorder) {
      // Start audio recording
      await this.audioRecorder.startRecording();
      console.log('[Orchestrator] 🎤 Audio recording started');
      
      // For audio recording mode, we'll process audio chunks
      // The actual STT processing will happen in the watchdog or when stopping
      this.startWatchdog();
    } else {
      // Traditional direct microphone access
      await this.sttService!.startRecognition(options);
      this.startWatchdog();
    }
  }

  async stop(): Promise<SpeechRecognitionResult> {
    this.isActive = false;
    this.clearWatchdog();
    
    // Stop VAD if enabled
    if (this.enableVAD && this.vadService) {
      this.vadService.stop();
      console.log('[Orchestrator] 🛑 VAD stopped');
    }
    
    if (!this.sttService) {
      return { transcript: '', confidence: 1, isFinal: true };
    }

    if (this.useAudioRecording && this.audioRecorder) {
      try {
        // Stop audio recording and get the audio data
        const audioBlob = await this.audioRecorder.stopRecording();
        console.log('[Orchestrator] 🛑 Audio recording stopped, processing audio data');
        
        // Process audio for STT
        const processedAudio = await this.audioRecorder.processAudioForSTT(audioBlob, this.audioProcessing);
        
        // Check if the STT service supports audio processing
        if (this.sttService.processAudioData && this.sttService.supportsAudioProcessing?.()) {
          // Use the new audio processing method
          const result = await this.sttService.processAudioData(processedAudio, this.optionsRef);
          return result;
        } else {
          // Fallback: convert to base64 and pass as audioData in options
          const base64Audio = await this.audioRecorder.audioBlobToBase64(processedAudio);
          const audioOptions: STTOptions = {
            ...this.optionsRef,
            audioData: base64Audio,
            audioFormat: processedAudio.type,
            sampleRate: this.audioRecorder.getAudioStream()?.getAudioTracks()[0]?.getSettings().sampleRate,
            channels: 1
          };
          
          // Try to start recognition with audio data
          await this.sttService.startRecognition(audioOptions);
          return await this.sttService.stopRecognition();
        }
      } catch (error) {
        console.error('[Orchestrator] ❌ Audio processing failed:', error);
        return { transcript: '', confidence: 0, isFinal: true };
      }
    } else {
      // Traditional stop
      return await this.sttService.stopRecognition();
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

  private startWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.isActive) return;
      const now = Date.now();
      const elapsed = now - this.lastProgressAt;
      if (elapsed > this.progressTimeoutMs) {
        // Only restart if we haven't had too many consecutive restarts
        if (this.consecutiveRestarts < 3) {
          console.log(`[Orchestrator] 🔄 Progress timeout (${elapsed}ms), restarting...`);
          this.recordRestart(now);
          this.safeRestart().catch(() => {});
        } else {
          console.log(`[Orchestrator] ⚠️ Too many consecutive restarts (${this.consecutiveRestarts}), skipping restart`);
        }
      }
    }, Math.max(2000, Math.floor(this.progressTimeoutMs / 3))); // Less frequent checks
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
        console.log(`[Orchestrator] 🔄 Too many restarts (${this.restartTimestamps.length}), trying alternative service`);
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
        this.consecutiveRestarts = 0;
      } catch (error) {
        console.warn('[Orchestrator] Failed to switch to alternative service:', error);
      }
    }

    try {
      if (this.useAudioRecording && this.audioRecorder) {
        // For audio recording mode, process accumulated audio chunks
        await this.processAudioChunks();
      } else {
        console.log('[Orchestrator] 🔄 Stopping current recognition...');
        await this.sttService.stopRecognition().catch(() => ({} as any));
        
        // Add a small delay before restarting to avoid rapid restarts
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('[Orchestrator] 🔄 Starting recognition...');
        this.lastProgressAt = Date.now();
        await this.sttService.startRecognition(this.optionsRef);
        console.log('[Orchestrator] ✅ Recognition restarted successfully');
      }
    } catch (error) {
      console.warn('[Orchestrator] Failed to restart recognition:', error);
    }
  }

  /**
   * Process accumulated audio chunks for continuous recognition
   */
  private async processAudioChunks(): Promise<void> {
    if (!this.audioRecorder || !this.sttService) return;

    try {
      const audioChunks = this.audioRecorder.getAudioChunks();
      if (audioChunks.length === 0) return;

      // Combine audio chunks into a single blob
      const combinedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // Process the audio
      const processedAudio = await this.audioRecorder.processAudioForSTT(combinedBlob, this.audioProcessing);
      
      // Clear processed chunks
      this.audioRecorder.clearAudioChunks();
      
      // Process with STT service
      if (this.sttService.processAudioData && this.sttService.supportsAudioProcessing?.()) {
        const result = await this.sttService.processAudioData(processedAudio, this.optionsRef);
        if (result.transcript && result.transcript.trim().length > 0) {
          this.lastProgressAt = Date.now();
          if (this.onResult) this.onResult(result);
        }
      }
    } catch (error) {
      console.warn('[Orchestrator] Failed to process audio chunks:', error);
    }
  }

  /**
   * Process audio segment detected by VAD
   */
  private async processVADAudioSegment(): Promise<void> {
    if (!this.audioRecorder || !this.sttService) return;

    try {
      // Get the audio chunks that were recorded during the speech segment
      const audioChunks = this.audioRecorder.getAudioChunks();
      if (audioChunks.length === 0) return;

      // Combine audio chunks into a single blob
      const combinedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // Process the audio for STT
      const processedAudio = await this.audioRecorder.processAudioForSTT(combinedBlob, this.audioProcessing);
      
      // Clear processed chunks
      this.audioRecorder.clearAudioChunks();
      
      // Process with STT service
      if (this.sttService.processAudioData && this.sttService.supportsAudioProcessing?.()) {
        const result = await this.sttService.processAudioData(processedAudio, this.optionsRef);
        if (result.transcript && result.transcript.trim().length > 0) {
          this.lastProgressAt = Date.now();
          if (this.onResult) this.onResult(result);
        }
      }
    } catch (error) {
      console.warn('[Orchestrator] Failed to process VAD audio segment:', error);
    }
  }

  /**
   * Get VAD statistics
   */
  getVADStats() {
    return this.vadService?.getStats();
  }

  /**
   * Get current VAD state
   */
  getVADState() {
    return this.vadService?.getCurrentState();
  }

  /**
   * Update VAD configuration
   */
  updateVADConfig(config: Partial<VADConfig>) {
    if (this.vadService) {
      this.vadService.updateConfig(config);
    }
  }
}


