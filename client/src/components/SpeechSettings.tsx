// Speech Settings Component - Configure and test speech functionality

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  TestTube,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Play,
  Square,
  RefreshCw
} from 'lucide-react';
import { useSpeech } from '../hooks/useSpeech';
import { useAIProvider } from '../hooks/useAIProvider';
import { SpeechTestUtils, SpeechTestResult } from '../lib/speech/speechTestUtils';
import { toast } from 'sonner';

interface SpeechSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SpeechSettings: React.FC<SpeechSettingsProps> = ({ isOpen, onClose }) => {
  const { currentProvider } = useAIProvider();
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<SpeechTestResult[]>([]);
  const [environmentInfo, setEnvironmentInfo] = useState<any>(null);
  const [isTestSpeaking, setIsTestSpeaking] = useState(false);
  const [testTranscript, setTestTranscript] = useState('');
  const [isTestListening, setIsTestListening] = useState(false);

  const {
    speak,
    stopSpeaking,
    isSpeaking,
    startListening,
    stopListening,
    isListening,
    isAvailable: speechAvailable,
    isHTTPS,
    microphonePermission,
    error: speechError,
    initialize,
    voices,
    selectedVoice,
    setVoice,
    capabilities
  } = useSpeech({
    autoInitialize: false,
    onRecognitionResult: (result) => {
      if (result.isFinal) {
        setTestTranscript(result.transcript);
        setIsTestListening(false);
      }
    },
    onRecognitionError: (error) => {
      toast.error(`Speech recognition error: ${error.message}`);
      setIsTestListening(false);
    }
  });

  // Load environment info on mount
  useEffect(() => {
    const loadEnvironmentInfo = async () => {
      const envInfo = await SpeechTestUtils.testEnvironmentRequirements();
      setEnvironmentInfo(envInfo);
    };
    loadEnvironmentInfo();
  }, []);

  // Test all providers
  const testAllProviders = useCallback(async () => {
    setIsTesting(true);
    try {
      const results = await SpeechTestUtils.testAllProviders();
      setTestResults(results);
      toast.success('Speech test completed!');
    } catch (error) {
      toast.error('Speech test failed');
      console.error('Speech test error:', error);
    } finally {
      setIsTesting(false);
    }
  }, []);

  // Test TTS with sample text
  const testTTS = useCallback(async () => {
    if (!speechAvailable) {
      await initialize();
    }
    
    setIsTestSpeaking(true);
    try {
      await speak('Hello! This is a test of the text-to-speech functionality. How does it sound?');
    } catch (error) {
      toast.error('TTS test failed');
      console.error('TTS test error:', error);
    } finally {
      setIsTestSpeaking(false);
    }
  }, [speechAvailable, initialize, speak]);

  // Test STT
  const testSTT = useCallback(async () => {
    if (!speechAvailable) {
      await initialize();
    }
    
    setIsTestListening(true);
    setTestTranscript('');
    try {
      await startListening({
        language: 'en-US',
        continuous: false,
        interimResults: true
      });
    } catch (error) {
      toast.error('STT test failed');
      console.error('STT test error:', error);
      setIsTestListening(false);
    }
  }, [speechAvailable, initialize, startListening]);

  // Stop STT test
  const stopSTTTest = useCallback(async () => {
    try {
      await stopListening();
      setIsTestListening(false);
    } catch (error) {
      console.error('Stop STT test error:', error);
    }
  }, [stopListening]);

  // Stop TTS test
  const stopTTSTest = useCallback(() => {
    stopSpeaking();
    setIsTestSpeaking(false);
  }, [stopSpeaking]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
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
          className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Speech Settings & Testing
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
              title="Close speech settings"
              aria-label="Close speech settings"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Environment Info */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Environment Status
              </h3>
              {environmentInfo && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">HTTPS:</span>
                    <span className={environmentInfo.isHTTPS ? 'text-green-400' : 'text-red-400'}>
                      {environmentInfo.isHTTPS ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">Microphone:</span>
                    <span className={
                      environmentInfo.microphonePermission === 'granted' ? 'text-green-400' :
                      environmentInfo.microphonePermission === 'denied' ? 'text-red-400' : 'text-yellow-400'
                    }>
                      {environmentInfo.microphonePermission === 'granted' ? '✅ Granted' :
                       environmentInfo.microphonePermission === 'denied' ? '❌ Denied' : '⚠️ Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">Web Speech:</span>
                    <span className={environmentInfo.webSpeechAvailable ? 'text-green-400' : 'text-red-400'}>
                      {environmentInfo.webSpeechAvailable ? '✅ Available' : '❌ Unavailable'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Current Provider Info */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3">Current AI Provider</h3>
              <div className="text-slate-300">
                <p><strong>Provider:</strong> {currentProvider}</p>
                <p><strong>Speech Available:</strong> {speechAvailable ? '✅ Yes' : '❌ No'}</p>
                {speechError && (
                  <p className="text-red-400 mt-2"><strong>Error:</strong> {speechError}</p>
                )}
              </div>
            </div>

            {/* Voice Selection */}
            {voices.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-white mb-3">Voice Selection</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {voices.slice(0, 8).map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setVoice(voice)}
                      className={`p-2 rounded text-left text-sm transition-colors ${
                        selectedVoice?.id === voice.id
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-400/30'
                          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                      }`}
                    >
                      <div className="font-medium">{voice.name}</div>
                      <div className="text-xs text-slate-400">{voice.language}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Tests */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <TestTube className="w-4 h-4" />
                Quick Tests
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* TTS Test */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-300">Text-to-Speech</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={testTTS}
                      disabled={isTestSpeaking || !speechAvailable}
                      className="flex items-center gap-2 px-3 py-2 bg-violet-500/20 text-violet-300 rounded hover:bg-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Play className="w-4 h-4" />
                      Test TTS
                    </button>
                    {isTestSpeaking && (
                      <button
                        onClick={stopTTSTest}
                        className="flex items-center gap-2 px-3 py-2 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30"
                      >
                        <Square className="w-4 h-4" />
                        Stop
                      </button>
                    )}
                  </div>
                </div>

                {/* STT Test */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-300">Speech-to-Text</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={isTestListening ? stopSTTTest : testSTT}
                      disabled={!speechAvailable}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      {isTestListening ? 'Stop' : 'Test STT'}
                    </button>
                  </div>
                  {testTranscript && (
                    <div className="mt-2 p-2 bg-slate-700/50 rounded text-sm text-slate-300">
                      <strong>Transcript:</strong> {testTranscript}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Comprehensive Test */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Comprehensive Provider Test
              </h3>
              <button
                onClick={testAllProviders}
                disabled={isTesting}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <TestTube className="w-4 h-4" />
                    Test All Providers
                  </>
                )}
              </button>

              {/* Test Results */}
              {testResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-medium text-slate-300">Test Results</h4>
                  {testResults.map((result) => (
                    <div key={result.provider} className="bg-slate-700/30 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white capitalize">{result.provider}</span>
                        <div className="flex gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            result.sttWorking ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            STT {result.sttWorking ? '✅' : '❌'}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            result.ttsWorking ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                          }`}>
                            TTS {result.ttsWorking ? '✅' : '❌'}
                          </span>
                        </div>
                      </div>
                      {result.error && (
                        <p className="text-xs text-red-400">{result.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Capabilities */}
            {capabilities && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-white mb-3">Current Capabilities</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">TTS:</span>
                    <span className={capabilities.supportsTTS ? 'text-green-400' : 'text-red-400'}>
                      {capabilities.supportsTTS ? '✅' : '❌'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">STT:</span>
                    <span className={capabilities.supportsSTT ? 'text-green-400' : 'text-red-400'}>
                      {capabilities.supportsSTT ? '✅' : '❌'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">Streaming:</span>
                    <span className={capabilities.supportsStreaming ? 'text-green-400' : 'text-red-400'}>
                      {capabilities.supportsStreaming ? '✅' : '❌'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">Multi-lang:</span>
                    <span className={capabilities.supportsMultiLanguage ? 'text-green-400' : 'text-red-400'}>
                      {capabilities.supportsMultiLanguage ? '✅' : '❌'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};