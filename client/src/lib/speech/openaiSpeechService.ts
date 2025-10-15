// OpenAI Speech Service implementation (TTS and Whisper)

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

interface OpenAISpeechConfig extends SpeechConfig {
  apiKey?: string;
  baseUrl?: string;
}

type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
type OpenAIModel = 'tts-1' | 'tts-1-hd';

export class OpenAISpeechService extends BaseSpeechService {
  private apiKey: string = '';
  private baseUrl: string = 'https://api.openai.com/v1';
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private currentTranscript: string = '';
  private continuousMode: boolean = false;
  private recordingStartTime: number = 0;
  private chunkProcessingInterval?: NodeJS.Timeout;
  private processedChunks: number = 0;

  constructor() {
    super('openai');
  }

  async initialize(config?: OpenAISpeechConfig): Promise<void> {
    await super.initialize(config);
    
    // Get OpenAI API key from localStorage or config
    this.apiKey = config?.apiKey || 
                 localStorage.getItem('openai-api-key') || 
                 '';
    
    this.baseUrl = config?.baseUrl || this.baseUrl;
    
    if (!this.apiKey) {
      console.warn('OpenAI Speech Service: No API key provided');
    }
  }

  async synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for text-to-speech');
    }

    // Map custom voice names to OpenAI voices
    const voice = this.mapToOpenAIVoice(options?.voice);
    const model: OpenAIModel = 'tts-1'; // Use standard model for lower latency
    const speed = options?.rate ?? 1.0;

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          speed: Math.max(0.25, Math.min(4.0, speed)) // OpenAI speed range
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(`OpenAI TTS failed: ${error.error?.message || response.statusText}`);
      }

      const audioData = await response.arrayBuffer();
      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      // Auto-play the audio
      await this.playAudioData(audioUrl);

      return {
        audioData,
        audioUrl,
        duration: this.estimateDuration(text, speed)
      };
    } catch (error) {
      console.error('OpenAI TTS error:', error);
      throw error;
    }
  }

  cancelSynthesis(): void {
    // Playback uses <audio> via BaseSpeechService
    super.cancelSynthesis();
  }

  async *streamSpeech(text: string, options?: TTSOptions): AsyncGenerator<ArrayBuffer, void, unknown> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for text-to-speech');
    }

    const voice = this.mapToOpenAIVoice(options?.voice);
    const model: OpenAIModel = 'tts-1';
    const speed = options?.rate ?? 1.0;

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          speed: Math.max(0.25, Math.min(4.0, speed)),
          stream: true
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`OpenAI TTS streaming failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          yield value.buffer;
        }
      }
    } catch (error) {
      console.error('OpenAI TTS streaming error:', error);
      throw error;
    }
  }

  async getAvailableVoices(): Promise<VoiceInfo[]> {
    // OpenAI has a fixed set of voices
    return [
      { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral', provider: 'openai' },
      { id: 'echo', name: 'Echo', language: 'en-US', gender: 'male', provider: 'openai' },
      { id: 'fable', name: 'Fable', language: 'en-US', gender: 'neutral', provider: 'openai' },
      { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male', provider: 'openai' },
      { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female', provider: 'openai' },
      { id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female', provider: 'openai' }
    ];
  }

  async startRecognition(options?: STTOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for speech recognition');
    }

    if (this.isRecording) {
      return;
    }

    this.currentTranscript = '';
    this.isRecording = true;
    this.audioChunks = [];
    this.continuousMode = options?.continuous ?? true;
    this.recordingStartTime = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          await this.processWhisperRecognition(audioBlob, options);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording with smaller chunks for better continuous experience
      this.mediaRecorder.start(500); // more frequent chunks for timely interim
      
      // For continuous mode, process chunks periodically
      if (this.continuousMode) {
        this.chunkProcessingInterval = setInterval(() => {
          if (this.audioChunks.length > this.processedChunks && this.isRecording) {
            this.processIntermediateAudio(options);
          }
        }, 4000); // Process more often for real-time feel
      }
    } catch (error) {
      this.isRecording = false;
      throw new Error(`Failed to start recording: ${error}`);
    }
  }

  async stopRecognition(): Promise<SpeechRecognitionResult> {
    if (!this.isRecording || !this.mediaRecorder) {
      return {
        transcript: this.currentTranscript.trim(),
        confidence: 1,
        isFinal: true
      };
    }

    this.continuousMode = false;
    
    // Clear the processing interval
    if (this.chunkProcessingInterval) {
      clearInterval(this.chunkProcessingInterval);
      this.chunkProcessingInterval = undefined;
    }

    return new Promise((resolve) => {
      const recorder = this.mediaRecorder!;
      
      // Set up completion handler
      const originalOnStop = recorder.onstop;
      recorder.onstop = async (event) => {
        if (originalOnStop) {
          await originalOnStop.call(recorder, event);
        }
        
        resolve({
          transcript: this.currentTranscript.trim(),
          confidence: 1,
          isFinal: true
        });
        
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.continuousMode = false;
        this.processedChunks = 0;
      };

      recorder.stop();
    });
  }

  isAvailable(): boolean {
    const apiKey = this.apiKey || localStorage.getItem('openai-api-key');
    return !!apiKey;
  }

  isListening(): boolean {
    return this.isRecording;
  }

  getCapabilities(): SpeechServiceCapabilities {
    return {
      supportsTTS: true,
      supportsSTT: true,
      supportsStreaming: true,
      supportsVoiceCloning: false,
      supportsEmotions: false,
      supportsMultiLanguage: true,
      supportsVAD: true,
      availableVoices: [],
      availableLanguages: this.getAvailableLanguages()
    };
  }

  dispose(): void {
    if (this.chunkProcessingInterval) {
      clearInterval(this.chunkProcessingInterval);
      this.chunkProcessingInterval = undefined;
    }
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
    this.audioChunks = [];
    this.processedChunks = 0;
    super.dispose();
  }

  private async processWhisperRecognition(audioBlob: Blob, options?: STTOptions, isFinal: boolean = true): Promise<SpeechRecognitionResult | void> {
    const language = options?.language || 'en';
    
    try {
      // Check audio size - Whisper has a 25MB limit
      if (audioBlob.size > 25 * 1024 * 1024) {
        console.warn('Audio file too large for Whisper API, truncating...');
        // Process only the last 20MB
        const slice = audioBlob.slice(-20 * 1024 * 1024);
        audioBlob = new Blob([slice], { type: 'audio/webm' });
      }
      
      // Create form data with the audio file
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      
      if (language && language !== 'auto') {
        formData.append('language', language.split('-')[0]); // Use ISO 639-1 code
      }
      
      // Add context prompt for better continuity
      const contextPrompt = this.buildContextPrompt();
      if (contextPrompt) {
        formData.append('prompt', contextPrompt);
      }

      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(`Whisper API failed: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const newText = result.text || '';
      
      // For intermediate processing, replace the entire transcript
      // Whisper processes the full audio each time
      this.currentTranscript = newText;
      
      const recognitionResult: SpeechRecognitionResult = {
        transcript: this.currentTranscript,
        confidence: 0.95, // Whisper doesn't provide confidence scores
        isFinal: isFinal
      };

      this.notifyRecognitionResult(recognitionResult);
      
      // Return the result for direct processing (like in processAudioData)
      return recognitionResult;
    } catch (error) {
      console.error('Whisper API error:', error);
      // Don't clear transcript on error in continuous mode
      if (!this.continuousMode) {
        this.currentTranscript = '';
      }
      
      // For direct processing, throw the error; for intermediate processing, return void
      if (isFinal) {
        throw error;
      }
    }
  }
  
  private buildContextPrompt(): string {
    // Build a context prompt to help Whisper maintain continuity
    const prompts = [];
    
    // Add punctuation instruction
    prompts.push('Please transcribe with proper punctuation and capitalization.');
    
    // Add recent context if available
    if (this.currentTranscript) {
      const recentWords = this.currentTranscript.split(' ').slice(-30).join(' ');
      if (recentWords.length > 20) {
        prompts.push(`Recent context: ...${recentWords}`);
      }
    }
    
    // Add common words that might be misheard
    prompts.push('Common terms: AI, API, UI, URL, HTTP, JSON');
    
    return prompts.join(' ');
  }
  
  private async processIntermediateAudio(options?: STTOptions): Promise<void> {
    // Only process new chunks since last processing
    const newChunks = this.audioChunks.slice(this.processedChunks);
    if (newChunks.length === 0) return;
    
    // Create a blob from all chunks (Whisper works better with full context)
    const allChunks = this.audioChunks.slice(0);
    const audioBlob = new Blob(allChunks, { type: 'audio/webm' });
    
    // Update processed count
    this.processedChunks = this.audioChunks.length;
    
    // Process in background without blocking
    this.processWhisperRecognition(audioBlob, options, false).catch(error => {
      console.warn('Intermediate processing error:', error);
    });
  }

  private mapToOpenAIVoice(voice?: string): OpenAIVoice {
    if (!voice) return 'nova'; // Default voice
    
    const voiceLower = voice.toLowerCase();
    
    // Direct mapping
    if (['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(voiceLower)) {
      return voiceLower as OpenAIVoice;
    }
    
    // Gender-based mapping
    if (voiceLower.includes('female') || voiceLower.includes('woman')) {
      return 'nova';
    }
    if (voiceLower.includes('male') || voiceLower.includes('man')) {
      return 'echo';
    }
    
    return 'nova'; // Default
  }

  private estimateDuration(text: string, speed: number): number {
    // Estimate ~150 words per minute at normal speed
    const wordsPerMinute = 150 * speed;
    const wordCount = text.split(/\s+/).length;
    return (wordCount / wordsPerMinute) * 60;
  }

  private getAvailableLanguages(): string[] {
    // Whisper supports many languages
    return [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
      'ar', 'hi', 'nl', 'pl', 'tr', 'sv', 'da', 'no', 'fi', 'el',
      'he', 'id', 'ms', 'th', 'vi', 'cs', 'hu', 'ro', 'uk', 'bg'
    ];
  }

  // OpenAI Whisper supports audio data processing
  supportsAudioProcessing(): boolean {
    return true;
  }

  async processAudioData(audioData: Blob | ArrayBuffer | string, options?: STTOptions): Promise<SpeechRecognitionResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured. Please provide an API key.');
    }

    try {
      // Convert audio data to the format expected by Whisper
      let audioBlob: Blob;
      
      if (typeof audioData === 'string') {
        // Base64 encoded audio
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioBlob = new Blob([bytes], { type: options?.audioFormat || 'audio/wav' });
      } else if (audioData instanceof ArrayBuffer) {
        audioBlob = new Blob([audioData], { type: options?.audioFormat || 'audio/wav' });
      } else {
        audioBlob = audioData;
      }

      // Use the existing Whisper processing method
      const result = await this.processWhisperRecognition(audioBlob, options, true);
      if (!result) {
        throw new Error('Failed to process audio data');
      }
      return result;
    } catch (error) {
      console.error('[OpenAI] Audio processing failed:', error);
      throw new Error(`OpenAI audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
