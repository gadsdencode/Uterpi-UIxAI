# Speech Functionality Implementation Guide

## Overview

The speech functionality has been comprehensively implemented to work seamlessly across all AI providers (Azure, OpenAI, Google Gemini, LM Studio/Uterpi, Hugging Face). The system provides both Text-to-Speech (TTS) and Speech-to-Text (STT) capabilities with robust fallback mechanisms.

## Architecture

### Core Components

1. **BaseSpeechService** - Abstract base class defining the speech service interface
2. **SpeechServiceFactory** - Factory pattern for creating appropriate speech services based on AI provider
3. **SpeechOrchestrator** - Resilient STT controller with progress monitoring and fallback
4. **useSpeech Hook** - React hook providing speech functionality to components
5. **SpeechSettings Component** - UI for configuring and testing speech functionality

### Provider-Specific Implementations

#### Azure Speech Service
- **TTS**: Uses Azure Cognitive Services Speech SDK
- **STT**: Uses Azure Speech-to-Text API
- **Configuration**: Requires `VITE_AZURE_SPEECH_KEY` and `VITE_AZURE_SPEECH_REGION`

#### OpenAI Speech Service
- **TTS**: Uses OpenAI TTS API (tts-1 model)
- **STT**: Uses OpenAI Whisper API
- **Configuration**: Requires OpenAI API key in localStorage

#### Google Speech Service
- **TTS**: Uses Google Cloud Text-to-Speech API
- **STT**: Uses Google Cloud Speech-to-Text API
- **Configuration**: Requires Google API key in localStorage

#### LM Studio Speech Service
- **TTS**: Falls back to Web Speech API (LM Studio doesn't have native TTS)
- **STT**: Falls back to Web Speech API
- **Configuration**: Uses LM Studio base URL and API key

#### Web Speech Service (Fallback)
- **TTS**: Uses browser's native SpeechSynthesis API
- **STT**: Uses browser's native SpeechRecognition API
- **Requirements**: HTTPS connection and microphone permissions

## Key Features

### 1. Cross-Provider Compatibility
- Automatic provider detection based on current AI provider
- Intelligent fallback chain: Preferred → Web Speech → Azure → OpenAI → Google
- Seamless switching between providers without user intervention

### 2. Robust Error Handling
- Comprehensive error messages with user-friendly explanations
- Automatic fallback to alternative speech services
- Progress monitoring with automatic restart for stalled STT sessions
- HTTPS and microphone permission validation

### 3. Advanced STT Features
- Continuous speech recognition with interim results
- Automatic session restart on timeout (30-second default)
- Progress watchdog to detect and recover from stalled states
- Support for multiple languages and accents

### 4. Enhanced TTS Features
- Voice selection with provider-specific voice catalogs
- SSML support for advanced speech synthesis
- Audio playback management with cleanup
- Support for rate, pitch, and volume adjustments

### 5. Testing and Diagnostics
- Comprehensive speech testing utilities
- Environment validation (HTTPS, permissions, API availability)
- Provider-specific capability testing
- Real-time speech functionality testing

## Usage

### Basic Speech Integration

```typescript
import { useSpeech } from '../hooks/useSpeech';

const MyComponent = () => {
  const {
    speak,
    startListening,
    stopListening,
    isSpeaking,
    isListening,
    speechAvailable
  } = useSpeech({
    onRecognitionResult: (result) => {
      console.log('Transcript:', result.transcript);
    }
  });

  const handleSpeak = () => {
    speak('Hello, this is a test of text-to-speech');
  };

  const handleListen = () => {
    startListening();
  };

  return (
    <div>
      {speechAvailable && (
        <>
          <button onClick={handleSpeak}>Speak</button>
          <button onClick={handleListen}>Listen</button>
        </>
      )}
    </div>
  );
};
```

### Provider-Specific Configuration

```typescript
// Azure Speech
const azureConfig = {
  subscriptionKey: 'your-azure-key',
  region: 'eastus'
};

// OpenAI Speech
const openaiConfig = {
  apiKey: 'your-openai-key'
};

// Google Speech
const googleConfig = {
  apiKey: 'your-google-key'
};
```

## UI Integration

### Microphone Button
- Located in the chat input area
- Visual feedback for recording state (pulsing red when active)
- Tooltip with recording status and HTTPS requirements
- Automatic initialization of speech services on first use

### Speech Settings Panel
- Accessible via microphone button in header
- Environment status display (HTTPS, permissions, Web Speech availability)
- Voice selection for TTS
- Quick TTS/STT testing
- Comprehensive provider testing
- Real-time capability display

### Message-Level TTS
- Volume button on each AI message
- Click to speak message content
- Visual feedback during playback
- Auto-speak option for AI responses

## Configuration

### Environment Variables
```bash
# Azure Speech (optional - falls back to Web Speech if not configured)
VITE_AZURE_SPEECH_KEY=your-azure-speech-key
VITE_AZURE_SPEECH_REGION=eastus

# LM Studio (for Uterpi AI)
VITE_LMSTUDIO_BASE_URL=https://lmstudio.uterpi.com
VITE_LMSTUDIO_API_KEY=lm-studio
```

### Local Storage Keys
- `openai-api-key` - OpenAI API key for TTS/STT
- `gemini-api-key` - Google API key for TTS/STT
- `lmstudio-base-url` - LM Studio base URL
- `lmstudio-api-key` - LM Studio API key

## Testing

### Manual Testing
1. Open the Speech Settings panel via the microphone button
2. Check environment status (HTTPS, permissions, Web Speech)
3. Test TTS with sample text
4. Test STT by speaking into microphone
5. Run comprehensive provider tests

### Automated Testing
```typescript
import { SpeechTestUtils } from '../lib/speech/speechTestUtils';

// Test all providers
const results = await SpeechTestUtils.testAllProviders();

// Test specific provider
const result = await SpeechTestUtils.testProvider('lmstudio');

// Generate test report
const report = await SpeechTestUtils.generateTestReport();
```

## Troubleshooting

### Common Issues

1. **Microphone not working**
   - Ensure HTTPS connection
   - Check microphone permissions
   - Verify browser supports Web Speech API

2. **TTS not working**
   - Check API keys for cloud providers
   - Verify network connectivity
   - Check browser console for errors

3. **STT not working**
   - Ensure microphone permissions are granted
   - Check for background noise interference
   - Verify language settings

4. **Provider-specific issues**
   - Azure: Verify subscription key and region
   - OpenAI: Check API key and quota limits
   - Google: Verify API key and billing
   - LM Studio: Ensure base URL is accessible

### Debug Information
- Speech service factory logs provider selection
- Speech orchestrator logs session management
- Error messages include specific failure reasons
- Test utilities provide detailed capability information

## Performance Considerations

- Speech services are initialized on-demand
- Automatic cleanup of audio resources
- Efficient fallback chain prevents unnecessary API calls
- Progress monitoring prevents resource leaks
- Voice selection is cached for performance

## Security

- API keys stored in localStorage (consider server-side storage for production)
- HTTPS required for microphone access
- No speech data stored permanently
- Automatic cleanup of audio blobs and URLs

## Future Enhancements

- Server-side speech service integration
- Voice cloning capabilities
- Multi-language conversation support
- Advanced SSML features
- Real-time translation
- Voice command recognition
