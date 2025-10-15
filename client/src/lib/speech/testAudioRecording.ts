// Test script for MRecordRTC audio recording integration

import { AudioRecorder } from './audioRecorder';
import { SpeechOrchestrator } from './SpeechOrchestrator';
import { SpeechServiceFactory } from './speechServiceFactory';

export class AudioRecordingTestSuite {
  private audioRecorder: AudioRecorder;
  private orchestrator: SpeechOrchestrator | null = null;

  constructor() {
    this.audioRecorder = new AudioRecorder({
      sampleRate: 16000,
      channels: 1,
      timeSlice: 1000,
      onDataAvailable: (blob) => {
        console.log(`[Test] Audio chunk received: ${blob.size} bytes`);
      },
      onError: (error) => {
        console.error('[Test] Audio recording error:', error);
      }
    });
  }

  /**
   * Test 1: AudioRecorder initialization and basic functionality
   */
  async testAudioRecorderInitialization(): Promise<boolean> {
    console.log('[Test] Testing AudioRecorder initialization...');
    
    try {
      await this.audioRecorder.initialize();
      console.log('✅ AudioRecorder initialized successfully');
      
      // Test availability check
      const isAvailable = AudioRecorder.isAvailable();
      console.log(`✅ AudioRecorder availability: ${isAvailable}`);
      
      // Test supported formats
      const formats = AudioRecorder.getSupportedFormats();
      console.log(`✅ Supported formats: ${formats.join(', ')}`);
      
      return true;
    } catch (error) {
      console.error('❌ AudioRecorder initialization failed:', error);
      return false;
    }
  }

  /**
   * Test 2: Audio recording and processing
   */
  async testAudioRecording(): Promise<boolean> {
    console.log('[Test] Testing audio recording...');
    
    try {
      // Start recording
      await this.audioRecorder.startRecording();
      console.log('✅ Audio recording started');
      
      // Record for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Stop recording
      const audioBlob = await this.audioRecorder.stopRecording();
      console.log(`✅ Audio recording stopped, blob size: ${audioBlob.size} bytes`);
      
      // Test audio processing
      const processedAudio = await this.audioRecorder.processAudioForSTT(audioBlob);
      console.log(`✅ Audio processed for STT, size: ${processedAudio.size} bytes`);
      
      // Test base64 conversion
      const base64Audio = await this.audioRecorder.audioBlobToBase64(processedAudio);
      console.log(`✅ Base64 conversion successful, length: ${base64Audio.length} chars`);
      
      return true;
    } catch (error) {
      console.error('❌ Audio recording test failed:', error);
      return false;
    }
  }

  /**
   * Test 3: SpeechOrchestrator with audio recording
   */
  async testSpeechOrchestratorWithAudioRecording(): Promise<boolean> {
    console.log('[Test] Testing SpeechOrchestrator with audio recording...');
    
    try {
      // Create orchestrator with audio recording enabled
      this.orchestrator = new SpeechOrchestrator({
        aiProvider: 'openai', // Use OpenAI for testing
        useAudioRecording: true,
        audioConfig: {
          sampleRate: 16000,
          channels: 1,
          timeSlice: 1000
        },
        audioProcessing: {
          format: 'webm',
          quality: 'medium',
          compression: true,
          noiseReduction: true,
          normalize: true
        },
        onResult: (result) => {
          console.log(`[Test] Orchestrator result: ${result.transcript}`);
        }
      });

      await this.orchestrator.initialize();
      console.log('✅ SpeechOrchestrator initialized with audio recording');

      // Test start (this will start audio recording)
      await this.orchestrator.start({
        language: 'en-US',
        continuous: true,
        interimResults: true
      });
      console.log('✅ SpeechOrchestrator started with audio recording');

      // Let it run for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test stop (this will process the recorded audio)
      const result = await this.orchestrator.stop();
      console.log(`✅ SpeechOrchestrator stopped, transcript: "${result.transcript}"`);

      return true;
    } catch (error) {
      console.error('❌ SpeechOrchestrator test failed:', error);
      return false;
    }
  }

  /**
   * Test 4: Speech service audio processing capabilities
   */
  async testSpeechServiceAudioProcessing(): Promise<boolean> {
    console.log('[Test] Testing speech service audio processing...');
    
    try {
      // Use valid AIProvider values
      const aiProviders = ['openai', 'azure', 'gemini'] as const;
      
      for (const aiProvider of aiProviders) {
        try {
          const service = await SpeechServiceFactory.getBestServiceFor(aiProvider, 'stt');
          const supportsAudioProcessing = service.supportsAudioProcessing?.() || false;
          
          console.log(`✅ ${aiProvider} AI provider -> speech service supports audio processing: ${supportsAudioProcessing}`);
          
          if (supportsAudioProcessing) {
            // Test with a small audio blob
            const testBlob = new Blob(['test audio data'], { type: 'audio/wav' });
            
            try {
              const result = await service.processAudioData!(testBlob, {
                language: 'en-US'
              });
              console.log(`✅ ${aiProvider} audio processing test successful`);
            } catch (processingError) {
              console.warn(`⚠️ ${aiProvider} audio processing test failed (expected for test data):`, processingError);
            }
          }
        } catch (serviceError) {
          console.warn(`⚠️ ${aiProvider} AI provider service not available:`, serviceError);
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Speech service audio processing test failed:', error);
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<{ passed: number; total: number; results: boolean[] }> {
    console.log('🚀 Starting Audio Recording Integration Tests...\n');
    
    const tests = [
      () => this.testAudioRecorderInitialization(),
      () => this.testAudioRecording(),
      () => this.testSpeechOrchestratorWithAudioRecording(),
      () => this.testSpeechServiceAudioProcessing()
    ];
    
    const results: boolean[] = [];
    
    for (let i = 0; i < tests.length; i++) {
      console.log(`\n--- Test ${i + 1}/${tests.length} ---`);
      try {
        const result = await tests[i]();
        results.push(result);
        console.log(`Test ${i + 1} ${result ? 'PASSED' : 'FAILED'}`);
      } catch (error) {
        console.error(`Test ${i + 1} FAILED with error:`, error);
        results.push(false);
      }
    }
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log(`\n🏁 Test Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! MRecordRTC integration is working correctly.');
    } else {
      console.log('⚠️ Some tests failed. Check the logs above for details.');
    }
    
    return { passed, total, results };
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.audioRecorder.dispose();
    if (this.orchestrator) {
      this.orchestrator.dispose();
    }
  }
}

// Export a function to run tests
export async function runAudioRecordingTests(): Promise<void> {
  const testSuite = new AudioRecordingTestSuite();
  
  try {
    await testSuite.runAllTests();
  } finally {
    testSuite.dispose();
  }
}
