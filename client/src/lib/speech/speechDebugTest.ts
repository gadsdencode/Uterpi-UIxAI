// Debug test for speech recognition functionality
// Run this in the browser console to test speech recognition

export async function testSpeechRecognition() {
  console.log('🧪 Testing speech recognition functionality...');
  
  try {
    // Test if SpeechRecognition is available
    const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognitionConstructor) {
      console.error('❌ SpeechRecognition not available');
      return;
    }
    
    console.log('✅ SpeechRecognition constructor found');
    
    // Create recognition instance
    const recognition = new SpeechRecognitionConstructor();
    console.log('✅ SpeechRecognition instance created');
    
    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    console.log('✅ SpeechRecognition configured');
    
    // Set up event handlers
    recognition.onstart = () => {
      console.log('🎤 Speech recognition started');
    };
    
    recognition.onresult = (event: any) => {
      console.log('🎤 Speech result received:', event);
      const results = event.results;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const transcript = result[0]?.transcript || '';
        const isFinal = result.isFinal;
        console.log(`${isFinal ? '✅' : '⏳'} Result[${i}]: "${transcript}" (final: ${isFinal})`);
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error, event);
    };
    
    recognition.onend = () => {
      console.log('🎤 Speech recognition ended');
    };
    
    recognition.onaudiostart = () => {
      console.log('🎙️ Audio capture started');
    };
    
    recognition.onsoundstart = () => {
      console.log('🔊 Sound detected');
    };
    
    recognition.onspeechstart = () => {
      console.log('🗣️ Speech detected');
    };
    
    console.log('✅ Event handlers set up');
    
    // Start recognition
    console.log('🎤 Starting speech recognition...');
    recognition.start();
    
    // Stop after 10 seconds
    setTimeout(() => {
      console.log('🛑 Stopping speech recognition...');
      recognition.stop();
    }, 10000);
    
  } catch (error) {
    console.error('❌ Speech recognition test failed:', error);
  }
}

// Auto-run test if in browser
if (typeof window !== 'undefined') {
  console.log('Speech debug test available. Run testSpeechRecognition() to test.');
}
