# Speech Implementation Documentation

## Overview
This application now includes comprehensive Text-to-Speech (TTS) and Speech-to-Text (STT) functionality that works seamlessly across all AI providers (Azure, OpenAI, Gemini, HuggingFace, and Uterpi).

## Architecture

### Provider-Agnostic Design
The speech system is designed to be completely provider-agnostic through:

1. **Common Interface (`ISpeechService`)**: All speech services implement the same interface
2. **Factory Pattern**: `SpeechServiceFactory` automatically selects the best available provider
3. **Automatic Fallback**: If the preferred provider isn't available, the system falls back to alternatives
4. **Unified Hook (`useSpeech`)**: Single React hook provides consistent API regardless of provider

## Components

### 1. Speech Services (`client/src/lib/speech/`)

#### Base Service
- `baseSpeechService.ts`: Abstract base class with common functionality

#### Provider Implementations
- `webSpeechService.ts`: Browser's native Web Speech API (fallback)
- `azureSpeechService.ts`: Azure Cognitive Services Speech SDK
- `openaiSpeechService.ts`: OpenAI's TTS and Whisper APIs
- `googleSpeechService.ts`: Google Cloud Speech API

#### Factory
- `speechServiceFactory.ts`: Manages service creation and provider mapping

### 2. React Integration

#### Hooks
- `useSpeech.ts`: Main hook for speech functionality in React components

#### Components
- `SpeechSettings.tsx`: Configuration UI for speech settings
- Updated `ChatView.tsx`: Integrated speech controls in chat interface

### 3. Types
- `types/speech.ts`: TypeScript definitions for all speech-related types

## Features

### Text-to-Speech (TTS)
- ✅ Read AI responses aloud
- ✅ Multiple voice options per provider
- ✅ Adjustable speech rate, pitch, and volume
- ✅ Auto-speak option for AI responses
- ✅ Per-message speaker controls
- ✅ Stop speaking functionality

### Speech-to-Text (STT)
- ✅ Voice input for messages
- ✅ Real-time transcription (interim results)
- ✅ Visual feedback during recording
- ✅ Multi-language support
- ✅ Microphone button in chat interface

## Provider Mapping

| AI Provider | Speech Provider | Features |
|------------|-----------------|----------|
| Azure | Azure Speech Services | Full TTS/STT, best quality, many voices |
| OpenAI | OpenAI TTS/Whisper | High-quality TTS (6 voices), excellent STT |
| Gemini | Google Cloud Speech | Neural voices, multi-language support |
| HuggingFace | Web Speech API or Azure | Falls back to available service |
| Uterpi | Web Speech API or Azure | Falls back to available service |

## Configuration

### Environment Variables
```env
# Azure Speech (optional, falls back to Azure AI key)
VITE_AZURE_SPEECH_KEY=your-key
VITE_AZURE_SPEECH_REGION=eastus

# These are automatically used if present:
# VITE_AZURE_AI_API_KEY (for Azure)
# OpenAI key from localStorage
# Gemini key from localStorage
```

### User Settings
Users can configure speech settings through the UI:
- Voice selection
- Speech rate (0.5x - 2.0x)
- Pitch adjustment (0.5 - 2.0)
- Volume control (0% - 100%)
- Auto-speak AI responses
- Language selection

Settings are persisted in localStorage:
- `auto-speak-responses`: boolean
- `speech-rate`: number
- `speech-pitch`: number
- `speech-volume`: number
- `speech-language`: string
- `speech-voice-id`: string

## Usage

### In React Components

```typescript
import { useSpeech } from '../hooks/useSpeech';

function MyComponent() {
  const {
    speak,
    stopSpeaking,
    isSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    isAvailable
  } = useSpeech();

  // Text-to-Speech
  const handleSpeak = async () => {
    await speak("Hello, world!", {
      voice: 'en-US-JennyNeural',
      rate: 1.2,
      pitch: 1.0,
      volume: 0.8
    });
  };

  // Speech-to-Text
  const handleListen = async () => {
    if (isListening) {
      const finalText = await stopListening();
      console.log('You said:', finalText);
    } else {
      await startListening({
        language: 'en-US',
        continuous: true,
        interimResults: true
      });
    }
  };
}
```

## Browser Compatibility

### Web Speech API (Fallback)
- Chrome: Full support
- Edge: Full support
- Safari: Partial support (TTS only)
- Firefox: Limited support

### Provider-Specific APIs
- All modern browsers support the REST API calls
- Media recording requires HTTPS in production

## Security Considerations

1. **API Keys**: Provider API keys are stored securely in localStorage or environment variables
2. **Microphone Access**: Users must grant permission for STT functionality
3. **HTTPS Required**: Production deployments must use HTTPS for microphone access
4. **CORS**: Ensure proper CORS configuration for API endpoints

## Testing

### Manual Testing Checklist

1. **TTS Testing**:
   - [ ] Test each AI provider's TTS capability
   - [ ] Verify voice selection works
   - [ ] Test speech controls (rate, pitch, volume)
   - [ ] Verify stop speaking functionality
   - [ ] Test auto-speak for AI responses

2. **STT Testing**:
   - [ ] Test microphone permission request
   - [ ] Verify transcription accuracy
   - [ ] Test interim results display
   - [ ] Verify multi-language recognition
   - [ ] Test stop recording functionality

3. **Provider Switching**:
   - [ ] Switch between AI providers and verify speech still works
   - [ ] Test fallback when preferred provider unavailable
   - [ ] Verify settings persist across provider changes

## Troubleshooting

### Common Issues

1. **No Speech Available**
   - Check browser compatibility
   - Verify API keys are configured
   - Check network connectivity

2. **Microphone Not Working**
   - Ensure HTTPS in production
   - Check browser microphone permissions
   - Verify microphone hardware

3. **API Errors**
   - Check API key validity
   - Verify quota/rate limits
   - Check CORS configuration

## Future Enhancements

- [ ] Voice cloning support (when available)
- [ ] Emotion detection in speech
- [ ] Real-time translation
- [ ] Custom voice training
- [ ] Offline speech support
- [ ] Speech analytics and insights

## Performance Optimization

- Services are lazily initialized
- Single instance per provider (singleton pattern)
- Automatic cleanup on component unmount
- Efficient audio streaming where supported
- Caching of voice lists

---

## Implementation Status

✅ **Completed**:
- Provider-agnostic speech interface
- Web Speech API implementation
- Azure Speech Services integration
- OpenAI TTS/Whisper integration
- Google Cloud Speech integration
- React hook for easy integration
- UI controls in chat interface
- Speech settings component
- Auto-speak functionality
- Voice input with visual feedback

The speech system is fully implemented and ready for use across all AI providers!
