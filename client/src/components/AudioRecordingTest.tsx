// Audio Recording Test Component - Demonstrates MRecordRTC integration

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Play,
  Square,
  Download,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useSpeech } from '../hooks/useSpeech';
import { useAIProvider } from '../hooks/useAIProvider';
import { toast } from 'sonner';

interface AudioRecordingTestProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AudioRecordingTest: React.FC<AudioRecordingTestProps> = ({ isOpen, onClose }) => {
  const { currentProvider } = useAIProvider();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const {
    startAudioRecording,
    stopAudioRecording,
    isAudioRecording,
    audioRecordingDuration,
    transcript: speechTranscript,
    isAvailable: speechAvailable,
    initialize,
    error: speechError,
    capabilities
  } = useSpeech({
    autoInitialize: false,
    useAudioRecording: true,
    audioConfig: {
      sampleRate: 16000,
      channels: 1,
      bitRate: 128000,
      mimeType: 'audio/webm;codecs=pcm',
      timeSlice: 1000
    },
    audioProcessing: {
      format: 'webm',
      quality: 'medium',
      compression: true,
      noiseReduction: true,
      normalize: true
    },
    onRecognitionResult: (result) => {
      if (result.isFinal) {
        setTranscript(result.transcript);
        toast.success('Audio transcription completed!');
      }
    },
    onRecognitionError: (error) => {
      toast.error(`Recognition error: ${error.message}`);
      setIsProcessing(false);
    }
  });

  // Initialize speech service on mount
  useEffect(() => {
    if (isOpen && speechAvailable) {
      initialize().catch(console.error);
    }
  }, [isOpen, speechAvailable, initialize]);

  // Update recording duration display
  useEffect(() => {
    if (isAudioRecording) {
      setRecordingDuration(audioRecordingDuration);
    }
  }, [isAudioRecording, audioRecordingDuration]);

  // Update transcript from speech service
  useEffect(() => {
    if (speechTranscript) {
      setTranscript(speechTranscript);
    }
  }, [speechTranscript]);

  const handleStartRecording = async () => {
    try {
      setIsRecording(true);
      setTranscript('');
      setAudioBlob(null);
      setAudioUrl(null);
      setIsProcessing(false);
      
      await startAudioRecording();
      toast.success('Audio recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to start recording');
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    try {
      setIsProcessing(true);
      const result = await stopAudioRecording();
      setIsRecording(false);
      
      if (result) {
        setTranscript(result);
        toast.success('Audio recording stopped and processed');
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      toast.error('Failed to stop recording');
      setIsRecording(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadAudio = () => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Mic className="w-5 h-5" />
            Audio Recording Test
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            title="Close audio recording test"
            aria-label="Close audio recording test"
          >
            <Square className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Status */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">Status</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-300">Provider:</span>
                <span className="text-violet-300 capitalize">{currentProvider}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">Available:</span>
                <span className={speechAvailable ? 'text-green-400' : 'text-red-400'}>
                  {speechAvailable ? '✅ Yes' : '❌ No'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">Audio Processing:</span>
                <span className={capabilities?.supportsSTT ? 'text-green-400' : 'text-red-400'}>
                  {capabilities?.supportsSTT ? '✅ Supported' : '❌ Not Supported'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">Recording:</span>
                <span className={isRecording ? 'text-green-400' : 'text-slate-400'}>
                  {isRecording ? '🔴 Active' : '⭕ Inactive'}
                </span>
              </div>
            </div>
            {speechError && (
              <div className="mt-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                {speechError}
              </div>
            )}
          </div>

          {/* Recording Controls */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">Recording Controls</h3>
            <div className="flex items-center justify-center gap-4">
              {!isRecording ? (
                <button
                  onClick={handleStartRecording}
                  disabled={!speechAvailable || isProcessing}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Mic className="w-5 h-5" />
                  Start Recording
                </button>
              ) : (
                <button
                  onClick={handleStopRecording}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-6 py-3 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <MicOff className="w-5 h-5" />
                  Stop Recording
                </button>
              )}
            </div>
            
            {isRecording && (
              <div className="mt-4 flex items-center justify-center gap-2 text-green-400">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <Clock className="w-4 h-4" />
                <span className="font-mono text-lg">{formatDuration(recordingDuration)}</span>
              </div>
            )}
            
            {isProcessing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-blue-400">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Processing audio...</span>
              </div>
            )}
          </div>

          {/* Transcript */}
          {transcript && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                Transcript
              </h3>
              <div className="bg-slate-700/50 rounded p-3 text-slate-300 min-h-[100px]">
                {transcript}
              </div>
            </div>
          )}

          {/* Audio Download */}
          {audioBlob && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3">Audio File</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <Play className="w-4 h-4" />
                  <span>Size: {(audioBlob.size / 1024).toFixed(1)} KB</span>
                </div>
                <button
                  onClick={downloadAudio}
                  className="flex items-center gap-2 px-3 py-2 bg-violet-500/20 text-violet-300 rounded hover:bg-violet-500/30 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <h3 className="text-lg font-medium text-blue-300 mb-2">Instructions</h3>
            <ul className="text-blue-200 text-sm space-y-1">
              <li>• Click "Start Recording" to begin audio capture</li>
              <li>• Speak clearly into your microphone</li>
              <li>• Click "Stop Recording" to process the audio</li>
              <li>• The system will transcribe your speech using MRecordRTC + STT</li>
              <li>• Audio is processed and sent to the configured AI provider</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
