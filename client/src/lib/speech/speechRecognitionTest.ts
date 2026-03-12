// Simple test to verify speech recognition is working
// Run this in the browser console to test basic speech recognition

export function testBasicSpeechRecognition() {
  console.log('🧪 Testing basic speech recognition...');
  
  try {
    // Check if SpeechRecognition is available
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
      console.log(`🎤 Number of results: ${results.length}`);
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const transcript = result[0]?.transcript || '';
        const isFinal = result.isFinal;
        const confidence = result[0]?.confidence || 0;
        console.log(`🎤 Result[${i}]: "${transcript}" (final: ${isFinal}, confidence: ${confidence})`);
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
    
    recognition.onaudioend = () => {
      console.log('🎙️ Audio capture ended');
    };
    
    recognition.onsoundstart = () => {
      console.log('🔊 Sound detected');
    };
    
    recognition.onsoundend = () => {
      console.log('🔊 Sound ended');
    };
    
    recognition.onspeechstart = () => {
      console.log('🗣️ Speech detected');
    };
    
    recognition.onspeechend = () => {
      console.log('🗣️ Speech ended');
    };
    
    recognition.onnomatch = () => {
      console.log('❌ No match - no words recognized');
    };
    
    console.log('✅ Event handlers set up');
    
    // Start recognition
    console.log('🎤 Starting speech recognition...');
    recognition.start();
    
    // Stop after 15 seconds
    setTimeout(() => {
      console.log('🛑 Stopping speech recognition...');
      recognition.stop();
    }, 15000);
    
  } catch (error) {
    console.error('❌ Speech recognition test failed:', error);
  }
}

// Auto-run test if in browser
if (typeof window !== 'undefined') {
  console.log('Basic speech recognition test available. Run testBasicSpeechRecognition() to test.');
}
