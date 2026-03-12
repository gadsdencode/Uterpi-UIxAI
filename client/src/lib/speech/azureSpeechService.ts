// Azure Cognitive Services Speech SDK implementation

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

interface AzureSpeechConfig extends SpeechConfig {
  subscriptionKey?: string;
  region?: string;
  endpoint?: string;
}

export class AzureSpeechService extends BaseSpeechService {
  private subscriptionKey: string = '';
  private region: string = '';
  private endpoint: string = '';
  private recognizer: any = null;
  private isRecording: boolean = false;
  private currentTranscript: string = '';
  private continuousMode: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  constructor() {
    super('azure');
  }

  async initialize(config?: AzureSpeechConfig): Promise<void> {
    await super.initialize(config);
    
    // Get Azure credentials from environment or config
    this.subscriptionKey = config?.subscriptionKey || 
                          (import.meta as any).env?.VITE_AZURE_SPEECH_KEY || 
                          (import.meta as any).env?.VITE_AZURE_AI_API_KEY || '';
    
    this.region = config?.region || 
                 (import.meta as any).env?.VITE_AZURE_SPEECH_REGION || 
                 'eastus';
    
    this.endpoint = config?.endpoint || 
                   `https://${this.region}.api.cognitive.microsoft.com/`;
    
    if (!this.subscriptionKey) {
      console.warn('Azure Speech Service: No subscription key provided');
    }
  }

  async synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult> {
    if (!this.subscriptionKey) {
      throw new Error('Azure Speech subscription key is required');
    }

    const voice = options?.voice || 'en-US-JennyNeural';
    const outputFormat = options?.outputFormat || 'audio-16khz-32kbitrate-mono-mp3';
    
    // Build SSML
    const ssml = this.buildSSML(text, voice, options);
    
    try {
      const response = await fetch(
        `${this.endpoint}cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': outputFormat,
            'User-Agent': 'NomadAI-TTS'
          },
          body: ssml
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Azure TTS failed: ${response.status} - ${error}`);
      }

      const audioData = await response.arrayBuffer();
      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      // Auto-play the audio
      await this.playAudioData(audioUrl);

      return {
        audioData,
        audioUrl,
        duration: this.estimateDuration(text, options?.rate)
      };
    } catch (error) {
      console.error('Azure TTS error:', error);
      throw error;
    }
  }

  cancelSynthesis(): void {
    super.cancelSynthesis();
  }

  async getAvailableVoices(): Promise<VoiceInfo[]> {
    if (!this.subscriptionKey) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.endpoint}cognitiveservices/voices/list`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey
          }
        }
      );

      if (!response.ok) {
        console.error('Failed to fetch Azure voices');
        return this.getDefaultVoices();
      }

      const voices = await response.json();
      
      return voices.map((voice: any) => ({
        id: voice.ShortName,
        name: voice.DisplayName || voice.LocalName,
        language: voice.Locale,
        gender: voice.Gender?.toLowerCase() as 'male' | 'female' | 'neutral',
        provider: 'azure' as const,
        styles: voice.StyleList || []
      }));
    } catch (error) {
      console.error('Error fetching Azure voices:', error);
      return this.getDefaultVoices();
    }
  }

  async startRecognition(options?: STTOptions): Promise<void> {
    if (!this.subscriptionKey) {
      throw new Error('Azure Speech subscription key is required');
    }

    if (this.isRecording) {
      return;
    }

    this.currentTranscript = '';
    this.isRecording = true;
    this.audioChunks = [];
    this.continuousMode = options?.continuous ?? true;

    // For browser environment, we'll use the REST API with MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          await this.processAudioForRecognition(audioBlob, options);
        }
        stream.getTracks().forEach(track => track.stop());
        this.audioChunks = [];
      };

      this.recognizer = this.mediaRecorder;
      // Start with continuous chunking for better responsiveness
      this.mediaRecorder.start(3000); // Collect data every 3 seconds
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
        this.recognizer = null;
        this.audioChunks = [];
        this.continuousMode = false;
      };

      recorder.stop();
    });
  }

  isAvailable(): boolean {
    return !!this.subscriptionKey || !!(import.meta as any).env?.VITE_AZURE_SPEECH_KEY;
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
      supportsEmotions: true,
      supportsMultiLanguage: true,
      supportsVAD: true,
      availableVoices: [],
      availableLanguages: this.getAvailableLanguages()
    };
  }

  private async processAudioForRecognition(audioBlob: Blob, options?: STTOptions): Promise<void> {
    const language = options?.language || 'en-US';
    
    try {
      // Convert audio to WAV format for Azure
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');

      const response = await fetch(
        `${this.endpoint}speechtotext/v3.0/transcriptions`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Accept': 'application/json'
          },
          body: formData
        }
      );

      if (!response.ok) {
        throw new Error(`Azure STT failed: ${response.status}`);
      }

      const result = await response.json();
      this.currentTranscript = result.DisplayText || result.RecognizedText || '';
      
      const recognitionResult: SpeechRecognitionResult = {
        transcript: this.currentTranscript,
        confidence: result.Confidence || 0.9,
        isFinal: true
      };

      this.notifyRecognitionResult(recognitionResult);
    } catch (error) {
      console.error('Azure STT error:', error);
      this.currentTranscript = '';
    }
  }

  private buildSSML(text: string, voice: string, options?: TTSOptions): string {
    const rate = options?.rate ?? 1.0;
    const pitch = options?.pitch ?? 1.0;
    const volume = options?.volume ?? 1.0;

    // Convert rate to percentage (Azure expects percentage format)
    const ratePercent = ((rate - 1) * 100).toFixed(0);
    const pitchPercent = ((pitch - 1) * 50).toFixed(0); // Azure pitch range is smaller

    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
             xmlns:mstts="https://www.w3.org/2001/mstts" 
             xml:lang="${options?.language || 'en-US'}">
        <voice name="${voice}">
          <prosody rate="${ratePercent}%" pitch="${pitchPercent}%" volume="${volume * 100}">
            ${this.escapeXML(text)}
          </prosody>
        </voice>
      </speak>
    `.trim();
  }

  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private estimateDuration(text: string, rate?: number): number {
    // Estimate ~150 words per minute at normal speed
    const wordsPerMinute = 150 * (rate ?? 1.0);
    const wordCount = text.split(/\s+/).length;
    return (wordCount / wordsPerMinute) * 60;
  }

  private getDefaultVoices(): VoiceInfo[] {
    // Fallback list of common Azure voices
    return [
      { id: 'en-US-JennyNeural', name: 'Jenny (US)', language: 'en-US', gender: 'female', provider: 'azure' },
      { id: 'en-US-GuyNeural', name: 'Guy (US)', language: 'en-US', gender: 'male', provider: 'azure' },
      { id: 'en-GB-SoniaNeural', name: 'Sonia (UK)', language: 'en-GB', gender: 'female', provider: 'azure' },
      { id: 'en-GB-RyanNeural', name: 'Ryan (UK)', language: 'en-GB', gender: 'male', provider: 'azure' },
      { id: 'es-ES-ElviraNeural', name: 'Elvira (Spain)', language: 'es-ES', gender: 'female', provider: 'azure' },
      { id: 'fr-FR-DeniseNeural', name: 'Denise (France)', language: 'fr-FR', gender: 'female', provider: 'azure' },
      { id: 'de-DE-KatjaNeural', name: 'Katja (Germany)', language: 'de-DE', gender: 'female', provider: 'azure' },
      { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (China)', language: 'zh-CN', gender: 'female', provider: 'azure' },
      { id: 'ja-JP-NanamiNeural', name: 'Nanami (Japan)', language: 'ja-JP', gender: 'female', provider: 'azure' }
    ];
  }

  private getAvailableLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN',
      'es-ES', 'es-MX', 'es-AR', 'fr-FR', 'fr-CA',
      'de-DE', 'it-IT', 'pt-BR', 'pt-PT', 'ru-RU',
      'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'ar-SA',
      'hi-IN', 'nl-NL', 'pl-PL', 'sv-SE', 'da-DK'
    ];
  }

  // Azure Speech Service supports audio data processing
  supportsAudioProcessing(): boolean {
    return true;
  }

  async processAudioData(audioData: Blob | ArrayBuffer | string, options?: STTOptions): Promise<SpeechRecognitionResult> {
    if (!this.subscriptionKey) {
      throw new Error('Azure Speech Service not configured. Please provide subscription key and region.');
    }

    try {
      // Convert audio data to the format expected by Azure
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

      // Use Azure Speech-to-Text REST API for audio file processing
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.wav');
      
      const params = new URLSearchParams({
        language: options?.language || 'en-US',
        format: 'detailed',
        profanity: options?.profanityFilter ? 'masked' : 'raw'
      });

      const response = await fetch(
        `${this.endpoint}speech/recognition/conversation/cognitiveservices/v1?${params}`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'audio/wav'
          },
          body: audioBlob
        }
      );

      if (!response.ok) {
        throw new Error(`Azure Speech API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        transcript: result.DisplayText || result.NBest?.[0]?.Display || '',
        confidence: result.NBest?.[0]?.Confidence || 0,
        isFinal: true,
        alternatives: result.NBest?.map((alt: any) => ({
          transcript: alt.Display,
          confidence: alt.Confidence
        }))
      };
    } catch (error) {
      console.error('[AzureSpeech] Audio processing failed:', error);
      throw new Error(`Azure audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
