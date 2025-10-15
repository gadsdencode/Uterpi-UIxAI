# MRecordRTC Audio Recording Integration

## Overview

This document describes the implementation of MRecordRTC (RecordRTC) for audio recording and processing in the speech recognition system. The integration provides a robust, provider-agnostic audio recording solution that works with all supported STT services.

## Architecture

### Core Components

1. **AudioRecorder** (`client/src/lib/speech/audioRecorder.ts`)
   - MRecordRTC-based audio recording service
   - Handles microphone access, audio encoding, and processing
   - Supports multiple audio formats and quality settings
   - Provides real-time audio chunk processing

2. **SpeechOrchestrator** (Updated)
   - Enhanced to support audio recording mode
   - Manages audio recording lifecycle
   - Processes recorded audio and passes to STT services
   - Maintains backward compatibility with direct microphone access

3. **Speech Services** (Updated)
   - Added `processAudioData()` method for audio blob processing
   - Added `supportsAudioProcessing()` capability check
   - Azure and OpenAI services support audio data processing
   - Web Speech API falls back to direct microphone access

4. **useSpeech Hook** (Updated)
   - New audio recording methods: `startAudioRecording()`, `stopAudioRecording()`
   - Audio recording state management
   - Duration tracking and real-time updates

## Key Features

### Audio Recording Capabilities
- **High-quality audio capture** with configurable sample rates (8kHz-48kHz)
- **Multiple format support**: WebM, MP3, WAV, OGG
- **Real-time processing** with configurable chunk sizes
- **Audio optimization** for STT (noise reduction, normalization, compression)

### Provider Compatibility
- **Azure Speech Service**: Full audio data processing support
- **OpenAI Whisper**: Full audio data processing support  
- **Google Speech**: Audio data processing support
- **Web Speech API**: Falls back to direct microphone access
- **LM Studio**: Uses Web Speech API for STT

### Error Handling & Resilience
- **Automatic fallback** to direct microphone access if audio recording fails
- **Progress monitoring** with timeout detection and restart capabilities
- **Comprehensive error handling** with detailed logging
- **Resource cleanup** and memory management

## Usage Examples

### Basic Audio Recording

```typescript
import { useSpeech } from '../hooks/useSpeech';

const MyComponent = () => {
  const {
    startAudioRecording,
    stopAudioRecording,
    isAudioRecording,
    audioRecordingDuration,
    transcript
  } = useSpeech({
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
    }
  });

  const handleStartRecording = async () => {
    try {
      await startAudioRecording();
      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      const result = await stopAudioRecording();
      console.log('Transcript:', result);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  return (
    <div>
      <button onClick={handleStartRecording} disabled={isAudioRecording}>
        Start Recording
      </button>
      <button onClick={handleStopRecording} disabled={!isAudioRecording}>
        Stop Recording ({audioRecordingDuration}s)
      </button>
      <div>Transcript: {transcript}</div>
    </div>
  );
};
```

### Advanced Configuration

```typescript
const speechConfig = {
  useAudioRecording: true,
  audioConfig: {
    sampleRate: 44100,        // High quality
    channels: 2,              // Stereo
    bitRate: 256000,          // High bitrate
    mimeType: 'audio/webm;codecs=opus',
    timeSlice: 500            // 500ms chunks for real-time processing
  },
  audioProcessing: {
    format: 'webm',
    quality: 'high',
    compression: true,
    noiseReduction: true,
    normalize: true
  }
};
```

### Direct AudioRecorder Usage

```typescript
import { AudioRecorder } from '../lib/speech/audioRecorder';

const recorder = new AudioRecorder({
  sampleRate: 16000,
  channels: 1,
  onDataAvailable: (blob) => {
    console.log('Audio chunk:', blob.size, 'bytes');
  },
  onError: (error) => {
    console.error('Recording error:', error);
  }
});

// Initialize and start recording
await recorder.initialize();
await recorder.startRecording();

// Record for 5 seconds
await new Promise(resolve => setTimeout(resolve, 5000));

// Stop and get audio data
const audioBlob = await recorder.stopRecording();
const processedAudio = await recorder.processAudioForSTT(audioBlob);
const base64Audio = await recorder.audioBlobToBase64(processedAudio);
```

## Configuration Options

### AudioRecorderConfig
```typescript
interface AudioRecorderConfig {
  sampleRate?: number;        // 8000-48000 Hz
  channels?: number;          // 1 (mono) or 2 (stereo)
  bitRate?: number;           // Audio bitrate
  mimeType?: string;          // Audio MIME type
  timeSlice?: number;         // Chunk size in milliseconds
  onDataAvailable?: (blob: Blob) => void;
  onError?: (error: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
}
```

### AudioProcessingOptions
```typescript
interface AudioProcessingOptions {
  format?: 'wav' | 'mp3' | 'webm' | 'ogg';
  quality?: 'low' | 'medium' | 'high';
  compression?: boolean;
  noiseReduction?: boolean;
  normalize?: boolean;
}
```

## Testing

### Automated Tests
Run the comprehensive test suite:

```typescript
import { runAudioRecordingTests } from '../lib/speech/integrationTest';

// Run all tests
await runAudioRecordingTests();
```

### Browser Console Testing
```javascript
// Available in browser console
await window.testAudioRecording();
```

### Manual Testing
Use the AudioRecordingTest component in SpeechSettings:
1. Open Speech Settings
2. Click "Test Audio Recording"
3. Start/stop recording and verify transcription

## Browser Compatibility

### Supported Browsers
- **Chrome/Chromium**: Full support
- **Firefox**: Full support
- **Safari**: Limited support (WebM codec issues)
- **Edge**: Full support

### Required APIs
- `navigator.mediaDevices.getUserMedia()`
- `MediaRecorder` API
- `Blob` and `ArrayBuffer` support

### HTTPS Requirement
Audio recording requires HTTPS or localhost for security reasons.

## Performance Considerations

### Memory Usage
- Audio chunks are processed in real-time to minimize memory usage
- Automatic cleanup of processed audio data
- Configurable chunk sizes to balance memory vs. latency

### Network Optimization
- Audio compression reduces bandwidth usage
- Base64 encoding for API transmission
- Configurable quality settings for different use cases

### CPU Usage
- Audio processing is optimized for real-time performance
- Noise reduction and normalization are optional
- Chunk-based processing reduces CPU spikes

## Troubleshooting

### Common Issues

1. **Microphone Permission Denied**
   - Ensure HTTPS or localhost
   - Check browser permissions
   - Use `requestMicrophonePermission()` helper

2. **Audio Recording Fails**
   - Check browser compatibility
   - Verify MediaRecorder support
   - Fall back to direct microphone access

3. **Poor Audio Quality**
   - Increase sample rate (16000+ Hz)
   - Enable noise reduction
   - Use mono recording for speech

4. **STT Processing Errors**
   - Check audio format compatibility
   - Verify API keys and configuration
   - Test with different providers

### Debug Mode
Enable detailed logging:

```typescript
// Set debug mode in browser console
localStorage.setItem('speech-debug', 'true');
```

## Migration Guide

### From Direct Microphone Access
The integration is backward compatible. Existing code continues to work:

```typescript
// Old way (still works)
const { startListening, stopListening } = useSpeech();

// New way (with audio recording)
const { startAudioRecording, stopAudioRecording } = useSpeech({
  useAudioRecording: true
});
```

### Gradual Migration
1. Enable audio recording for new features
2. Test with existing STT providers
3. Gradually migrate existing functionality
4. Remove direct microphone access when ready

## Future Enhancements

### Planned Features
- **Real-time streaming** to STT services
- **Audio format conversion** for better compatibility
- **Advanced noise reduction** algorithms
- **Voice activity detection** for automatic start/stop
- **Multi-language support** with automatic detection

### Performance Improvements
- **Web Workers** for audio processing
- **Streaming compression** for large audio files
- **Caching** for repeated audio processing
- **Batch processing** for multiple audio files

## Security Considerations

### Data Privacy
- Audio data is processed locally when possible
- No audio data is stored permanently
- Automatic cleanup of temporary files
- Secure transmission to STT services

### Browser Security
- HTTPS requirement for microphone access
- Permission-based audio recording
- Sandboxed audio processing
- No cross-origin audio access

## Conclusion

The MRecordRTC integration provides a robust, scalable solution for audio recording and processing in the speech recognition system. It maintains backward compatibility while adding powerful new capabilities for high-quality audio capture and processing.

The implementation follows best practices for error handling, performance optimization, and security, making it suitable for production use across different browsers and devices.
