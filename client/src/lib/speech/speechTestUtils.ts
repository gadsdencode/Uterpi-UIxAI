// Speech functionality testing utilities

import { SpeechServiceFactory } from './speechServiceFactory';
import { AIProvider } from '../../hooks/useAIProvider';

export interface SpeechTestResult {
  provider: string;
  sttAvailable: boolean;
  ttsAvailable: boolean;
  sttWorking: boolean;
  ttsWorking: boolean;
  error?: string;
  capabilities: any;
}

export class SpeechTestUtils {
  /**
   * Test speech functionality across all providers
   */
  static async testAllProviders(): Promise<SpeechTestResult[]> {
    const providers: AIProvider[] = ['azure', 'openai', 'gemini', 'lmstudio', 'uterpi', 'huggingface'];
    const results: SpeechTestResult[] = [];

    for (const provider of providers) {
      try {
        const result = await this.testProvider(provider);
        results.push(result);
      } catch (error) {
        results.push({
          provider,
          sttAvailable: false,
          ttsAvailable: false,
          sttWorking: false,
          ttsWorking: false,
          error: (error as Error).message,
          capabilities: {}
        });
      }
    }

    return results;
  }

  /**
   * Test a specific provider
   */
  static async testProvider(provider: AIProvider): Promise<SpeechTestResult> {
    console.log(`🧪 Testing speech functionality for ${provider}...`);
    
    try {
      // Test STT
      const sttService = await SpeechServiceFactory.getBestServiceFor(provider, 'stt');
      const sttAvailable = sttService.isAvailable();
      const sttCapabilities = sttService.getCapabilities();
      
      // Test TTS
      const ttsService = await SpeechServiceFactory.getBestServiceFor(provider, 'tts');
      const ttsAvailable = ttsService.isAvailable();
      const ttsCapabilities = ttsService.getCapabilities();
      
      // Test basic functionality
      let sttWorking = false;
      let ttsWorking = false;
      
      if (sttAvailable && sttCapabilities.supportsSTT) {
        try {
          // Test STT initialization
          await sttService.initialize();
          sttWorking = true;
        } catch (error) {
          console.warn(`STT test failed for ${provider}:`, error);
        }
      }
      
      if (ttsAvailable && ttsCapabilities.supportsTTS) {
        try {
          // Test TTS initialization
          await ttsService.initialize();
          ttsWorking = true;
        } catch (error) {
          console.warn(`TTS test failed for ${provider}:`, error);
        }
      }

      const result: SpeechTestResult = {
        provider,
        sttAvailable,
        ttsAvailable,
        sttWorking,
        ttsWorking,
        capabilities: {
          stt: sttCapabilities,
          tts: ttsCapabilities
        }
      };

      console.log(`✅ ${provider} test completed:`, result);
      return result;
      
    } catch (error) {
      console.error(`❌ ${provider} test failed:`, error);
      return {
        provider,
        sttAvailable: false,
        ttsAvailable: false,
        sttWorking: false,
        ttsWorking: false,
        error: (error as Error).message,
        capabilities: {}
      };
    }
  }

  /**
   * Test speech service factory fallback mechanism
   */
  static async testFallbackMechanism(): Promise<void> {
    console.log('🔄 Testing speech service fallback mechanism...');
    
    const providers: AIProvider[] = ['lmstudio', 'uterpi', 'huggingface'];
    
    for (const provider of providers) {
      try {
        const sttService = await SpeechServiceFactory.getBestServiceFor(provider, 'stt');
        const ttsService = await SpeechServiceFactory.getBestServiceFor(provider, 'tts');
        
        console.log(`${provider} STT service:`, sttService.constructor.name);
        console.log(`${provider} TTS service:`, ttsService.constructor.name);
        
        // Verify fallback is working (should fall back to Web Speech API)
        const expectedFallback = sttService.constructor.name === 'WebSpeechService' || 
                                sttService.constructor.name === 'LMStudioSpeechService';
        
        if (expectedFallback) {
          console.log(`✅ ${provider} fallback working correctly`);
        } else {
          console.warn(`⚠️ ${provider} fallback may not be working as expected`);
        }
        
      } catch (error) {
        console.error(`❌ ${provider} fallback test failed:`, error);
      }
    }
  }

  /**
   * Generate a comprehensive test report
   */
  static async generateTestReport(): Promise<string> {
    console.log('📊 Generating comprehensive speech test report...');
    
    const results = await this.testAllProviders();
    await this.testFallbackMechanism();
    
    let report = '🎤 Speech Functionality Test Report\n';
    report += '=====================================\n\n';
    
    results.forEach(result => {
      report += `Provider: ${result.provider}\n`;
      report += `  STT Available: ${result.sttAvailable ? '✅' : '❌'}\n`;
      report += `  TTS Available: ${result.ttsAvailable ? '✅' : '❌'}\n`;
      report += `  STT Working: ${result.sttWorking ? '✅' : '❌'}\n`;
      report += `  TTS Working: ${result.ttsWorking ? '✅' : '❌'}\n`;
      
      if (result.error) {
        report += `  Error: ${result.error}\n`;
      }
      
      if (result.capabilities.stt) {
        report += `  STT Capabilities:\n`;
        report += `    - Supports TTS: ${result.capabilities.stt.supportsTTS}\n`;
        report += `    - Supports STT: ${result.capabilities.stt.supportsSTT}\n`;
        report += `    - Multi-language: ${result.capabilities.stt.supportsMultiLanguage}\n`;
      }
      
      if (result.capabilities.tts) {
        report += `  TTS Capabilities:\n`;
        report += `    - Supports TTS: ${result.capabilities.tts.supportsTTS}\n`;
        report += `    - Supports STT: ${result.capabilities.tts.supportsSTT}\n`;
        report += `    - Available Voices: ${result.capabilities.tts.availableVoices?.length || 0}\n`;
      }
      
      report += '\n';
    });
    
    // Summary
    const workingProviders = results.filter(r => r.sttWorking || r.ttsWorking);
    report += `Summary:\n`;
    report += `- Total providers tested: ${results.length}\n`;
    report += `- Providers with working speech: ${workingProviders.length}\n`;
    report += `- STT working: ${results.filter(r => r.sttWorking).length}\n`;
    report += `- TTS working: ${results.filter(r => r.ttsWorking).length}\n`;
    
    console.log(report);
    return report;
  }

  /**
   * Test microphone permissions and HTTPS requirements
   */
  static async testEnvironmentRequirements(): Promise<{
    isHTTPS: boolean;
    microphonePermission: PermissionState | 'unsupported';
    webSpeechAvailable: boolean;
  }> {
    const isHTTPS = window.location.protocol === 'https:';
    
    let microphonePermission: PermissionState | 'unsupported' = 'unsupported';
    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        microphonePermission = result.state;
      }
    } catch (error) {
      console.warn('Microphone permission check failed:', error);
    }
    
    const webSpeechAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    
    return {
      isHTTPS,
      microphonePermission,
      webSpeechAvailable
    };
  }
}
