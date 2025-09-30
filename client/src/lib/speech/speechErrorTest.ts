// Test script to verify speech service error handling
// This can be run in the browser console to test speech service creation

export async function testSpeechServiceErrorHandling() {
  console.log('🧪 Testing speech service error handling...');
  
  try {
    // Test speech service factory
    const { SpeechServiceFactory } = await import('./speechServiceFactory');
    
    // Test creating services for different providers
    const providers = ['lmstudio', 'web', 'azure', 'openai', 'google'] as const;
    
    for (const provider of providers) {
      try {
        console.log(`Testing ${provider} provider...`);
        const service = await SpeechServiceFactory.getService(provider);
        console.log(`✅ ${provider} service created successfully`);
        
        // Test initialization
        try {
          await service.initialize();
          console.log(`✅ ${provider} service initialized successfully`);
        } catch (initError) {
          console.warn(`⚠️ ${provider} service initialization failed:`, initError);
        }
        
        // Test capabilities
        const caps = service.getCapabilities();
        console.log(`📊 ${provider} capabilities:`, caps);
        
      } catch (error) {
        console.error(`❌ ${provider} service creation failed:`, error);
      }
    }
    
    console.log('🎉 Speech service error handling test completed');
    
  } catch (error) {
    console.error('💥 Speech service test failed:', error);
  }
}

// Auto-run test if in browser
if (typeof window !== 'undefined') {
  console.log('Speech error test available. Run testSpeechServiceErrorHandling() to test.');
}
