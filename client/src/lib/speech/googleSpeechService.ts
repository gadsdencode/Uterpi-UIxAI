// Google Cloud Speech Service implementation

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

interface GoogleSpeechConfig extends SpeechConfig {
  apiKey?: string;
  projectId?: string;
}

export class GoogleSpeechService extends BaseSpeechService {
  private apiKey: string = '';
  private projectId: string = '';
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private currentTranscript: string = '';
  private continuousMode: boolean = false;
  private interimTranscripts: string = '';

  constructor() {
    super('google');
  }

  async initialize(config?: GoogleSpeechConfig): Promise<void> {
    await super.initialize(config);
    
    // Get Google/Gemini API key from localStorage or config
    this.apiKey = config?.apiKey || 
                 localStorage.getItem('gemini-api-key') || 
                 localStorage.getItem('google-api-key') || 
                 '';
    
    this.projectId = config?.projectId || 'nomadai-speech';
    
    if (!this.apiKey) {
      console.warn('Google Speech Service: No API key provided');
    }
  }

  async synthesizeSpeech(text: string, options?: TTSOptions): Promise<SpeechSynthesisResult> {
    if (!this.apiKey) {
      throw new Error('Google API key is required for text-to-speech');
    }

    const voice = this.mapToGoogleVoice(options?.voice);
    const languageCode = options?.language || 'en-US';
    const speakingRate = options?.rate ?? 1.0;
    const pitch = options?.pitch ?? 0.0;
    const volumeGainDb = this.volumeToDb(options?.volume ?? 1.0);

    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode,
              name: voice,
              ssmlGender: this.getGenderFromVoice(voice)
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate,
              pitch,
              volumeGainDb
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Google TTS failed: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const audioContent = result.audioContent;
      
      // Decode base64 audio content
      const audioData = Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));
      const blob = new Blob([audioData], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      // Auto-play the audio
      await this.playAudioData(audioUrl);

      return {
        audioData: audioData.buffer,
        audioUrl,
        duration: this.estimateDuration(text, speakingRate)
      };
    } catch (error) {
      console.error('Google TTS error:', error);
      throw error;
    }
  }

  cancelSynthesis(): void {
    super.cancelSynthesis();
  }

  async getAvailableVoices(): Promise<VoiceInfo[]> {
    if (!this.apiKey) {
      return this.getDefaultVoices();
    }

    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/voices?key=${this.apiKey}`
      );

      if (!response.ok) {
        return this.getDefaultVoices();
      }

      const result = await response.json();
      const voices = result.voices || [];

      return voices.map((voice: any) => ({
        id: voice.name,
        name: this.formatVoiceName(voice.name),
        language: voice.languageCodes[0],
        gender: voice.ssmlGender?.toLowerCase() as 'male' | 'female' | 'neutral',
        provider: 'google' as const
      }));
    } catch (error) {
      console.error('Error fetching Google voices:', error);
      return this.getDefaultVoices();
    }
  }

  async startRecognition(options?: STTOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Google API key is required for speech recognition');
    }

    if (this.isRecording) {
      return;
    }

    this.currentTranscript = '';
    this.interimTranscripts = '';
    this.isRecording = true;
    this.audioChunks = [];
    this.continuousMode = options?.continuous ?? true;

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

      let chunkCounter = 0;
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          chunkCounter++;
          
          // Process chunks about every ~2 seconds for continuous transcription
          if (this.continuousMode && chunkCounter % 4 === 0 && options?.interimResults) {
            this.processInterimRecognition(new Blob(this.audioChunks, { type: 'audio/webm' }), options);
          }
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          await this.processFinalRecognition(audioBlob, options);
        }
        stream.getTracks().forEach(track => track.stop());
        this.audioChunks = [];
      };

      // Start recording with 500ms chunks for better interim responsiveness
      this.mediaRecorder.start(500);
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
        
        // Include any interim transcripts in final result
        const finalTranscript = (this.currentTranscript + ' ' + this.interimTranscripts).trim();
        
        resolve({
          transcript: finalTranscript,
          confidence: 1,
          isFinal: true
        });
        
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.continuousMode = false;
        this.interimTranscripts = '';
      };

      recorder.stop();
    });
  }

  isAvailable(): boolean {
    const apiKey = this.apiKey || 
                  localStorage.getItem('gemini-api-key') || 
                  localStorage.getItem('google-api-key');
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
      availableVoices: [],
      availableLanguages: this.getAvailableLanguages()
    };
  }

  dispose(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
    this.audioChunks = [];
    super.dispose();
  }

  private async processInterimRecognition(audioChunk: Blob, options?: STTOptions): Promise<void> {
    // Convert chunk to base64 for interim processing
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      
      try {
        const result = await this.callSpeechAPI(base64Audio, options, false);
        if (result.transcript) {
          this.notifyRecognitionResult({
            transcript: result.transcript,
            confidence: result.confidence || 0.8,
            isFinal: false
          });
        }
      } catch (error) {
        console.error('Interim recognition error:', error);
      }
    };
    reader.readAsDataURL(audioChunk);
  }

  private async processFinalRecognition(audioBlob: Blob, options?: STTOptions): Promise<void> {
    // Convert blob to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      
      try {
        const result = await this.callSpeechAPI(base64Audio, options, true);
        this.currentTranscript = result.transcript || '';
        
        this.notifyRecognitionResult({
          transcript: this.currentTranscript,
          confidence: result.confidence || 0.9,
          isFinal: true,
          alternatives: result.alternatives
        });
      } catch (error) {
        console.error('Final recognition error:', error);
        this.currentTranscript = '';
      }
    };
    reader.readAsDataURL(audioBlob);
  }

  private async callSpeechAPI(
    base64Audio: string, 
    options?: STTOptions, 
    isFinal: boolean = true
  ): Promise<SpeechRecognitionResult> {
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 16000,
            languageCode: options?.language || 'en-US',
            maxAlternatives: options?.maxAlternatives || 1,
            profanityFilter: options?.profanityFilter ?? false,
            enableAutomaticPunctuation: options?.punctuation ?? true,
            model: 'latest_long'
          },
          audio: {
            content: base64Audio
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google STT failed: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const results = result.results || [];
    
    if (results.length === 0) {
      return { transcript: '', confidence: 0, isFinal };
    }

    const firstResult = results[0];
    const topAlternative = firstResult.alternatives[0];
    
    return {
      transcript: topAlternative.transcript || '',
      confidence: topAlternative.confidence || 0,
      isFinal,
      alternatives: firstResult.alternatives.slice(1).map((alt: any) => ({
        transcript: alt.transcript,
        confidence: alt.confidence || 0
      }))
    };
  }

  private mapToGoogleVoice(voice?: string): string {
    if (!voice) return 'en-US-Neural2-F'; // Default female voice
    
    // If it's already a Google voice name, return it
    if (voice.includes('-Neural2-') || voice.includes('-Wavenet-') || voice.includes('-Standard-')) {
      return voice;
    }
    
    // Map generic names to Google voices
    const voiceLower = voice.toLowerCase();
    if (voiceLower.includes('female') || voiceLower.includes('woman')) {
      return 'en-US-Neural2-F';
    }
    if (voiceLower.includes('male') || voiceLower.includes('man')) {
      return 'en-US-Neural2-D';
    }
    
    return 'en-US-Neural2-F';
  }

  private getGenderFromVoice(voice: string): string {
    if (voice.endsWith('-F') || voice.endsWith('-C') || voice.endsWith('-E') || voice.endsWith('-G')) {
      return 'FEMALE';
    }
    if (voice.endsWith('-A') || voice.endsWith('-B') || voice.endsWith('-D') || voice.endsWith('-I')) {
      return 'MALE';
    }
    return 'NEUTRAL';
  }

  private formatVoiceName(voiceName: string): string {
    // Format Google voice names to be more readable
    // e.g., "en-US-Neural2-F" -> "US English Neural2 (Female)"
    const parts = voiceName.split('-');
    if (parts.length >= 4) {
      const lang = parts[0];
      const region = parts[1];
      const type = parts[2];
      const variant = parts[3];
      
      const gender = this.getGenderFromVoice(voiceName);
      return `${region} ${lang.toUpperCase()} ${type} (${gender.toLowerCase()})`;
    }
    return voiceName;
  }

  private volumeToDb(volume: number): number {
    // Convert volume (0-1) to decibels (-96 to 16)
    if (volume <= 0) return -96;
    if (volume >= 1) return 0;
    return 20 * Math.log10(volume);
  }

  private estimateDuration(text: string, rate: number): number {
    const wordsPerMinute = 150 * rate;
    const wordCount = text.split(/\s+/).length;
    return (wordCount / wordsPerMinute) * 60;
  }

  private getDefaultVoices(): VoiceInfo[] {
    return [
      { id: 'en-US-Neural2-F', name: 'US English Neural2 (Female)', language: 'en-US', gender: 'female', provider: 'google' },
      { id: 'en-US-Neural2-D', name: 'US English Neural2 (Male)', language: 'en-US', gender: 'male', provider: 'google' },
      { id: 'en-GB-Neural2-F', name: 'UK English Neural2 (Female)', language: 'en-GB', gender: 'female', provider: 'google' },
      { id: 'en-GB-Neural2-B', name: 'UK English Neural2 (Male)', language: 'en-GB', gender: 'male', provider: 'google' },
      { id: 'es-ES-Neural2-F', name: 'Spanish Neural2 (Female)', language: 'es-ES', gender: 'female', provider: 'google' },
      { id: 'fr-FR-Neural2-E', name: 'French Neural2 (Female)', language: 'fr-FR', gender: 'female', provider: 'google' },
      { id: 'de-DE-Neural2-F', name: 'German Neural2 (Female)', language: 'de-DE', gender: 'female', provider: 'google' },
      { id: 'ja-JP-Neural2-B', name: 'Japanese Neural2 (Female)', language: 'ja-JP', gender: 'female', provider: 'google' }
    ];
  }

  private getAvailableLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'en-AU', 'en-IN', 'es-ES', 'es-MX',
      'fr-FR', 'fr-CA', 'de-DE', 'it-IT', 'pt-BR', 'pt-PT',
      'nl-NL', 'ru-RU', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW',
      'ar-SA', 'hi-IN', 'sv-SE', 'da-DK', 'no-NO', 'fi-FI'
    ];
  }
}
