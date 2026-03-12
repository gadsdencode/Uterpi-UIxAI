// Speech Settings Component - Configure and test speech functionality

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  RefreshCw,
  Search,
  Activity
} from 'lucide-react';
import { useSpeech } from '../hooks/useSpeech';
import { useAIProvider } from '../hooks/useAIProvider';
import { SpeechTestUtils, SpeechTestResult } from '../lib/speech/speechTestUtils';
import { AudioRecordingTest } from './AudioRecordingTest';
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
  const [showAudioRecordingTest, setShowAudioRecordingTest] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voiceLanguageFilter, setVoiceLanguageFilter] = useState<string>('all');
  const [showAllVoices, setShowAllVoices] = useState(false);

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
    capabilities,
    vadState,
    vadStats
  } = useSpeech({
    autoInitialize: false,
    enableVAD: true,
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

  useEffect(() => {
    const loadEnv = async () => {
      const envInfo = await SpeechTestUtils.testEnvironmentRequirements();
      setEnvironmentInfo(envInfo);
    };
    loadEnv();
  }, []);

  const testAllProviders = useCallback(async () => {
    setIsTesting(true);
    try {
      const results = await SpeechTestUtils.testAllProviders();
      setTestResults(results);
      toast.success('Speech test completed!');
    } catch {
      toast.error('Speech test failed');
    } finally { setIsTesting(false); }
  }, []);

  const testTTS = useCallback(async () => {
    if (!speechAvailable) await initialize();
    setIsTestSpeaking(true);
    try {
      await speak('Hello! This is a test of the text-to-speech functionality. How does it sound?');
    } catch { toast.error('TTS test failed'); }
    finally { setIsTestSpeaking(false); }
  }, [speechAvailable, initialize, speak]);

  const testSTT = useCallback(async () => {
    if (!speechAvailable) await initialize();
    setIsTestListening(true);
    setTestTranscript('');
    try {
      await startListening({ language: 'en-US', continuous: false, interimResults: true });
    } catch {
      toast.error('STT test failed');
      setIsTestListening(false);
    }
  }, [speechAvailable, initialize, startListening]);

  const stopSTTTest = useCallback(async () => {
    try { await stopListening(); } catch {}
    setIsTestListening(false);
  }, [stopListening]);

  const stopTTSTest = useCallback(() => {
    stopSpeaking();
    setIsTestSpeaking(false);
  }, [stopSpeaking]);

  // ── Voice filtering ──────────────────────────────────────────────────
  const uniqueLanguages = useMemo(() => {
    const langs = new Set(voices.map(v => v.language));
    return Array.from(langs).sort();
  }, [voices]);

  const filteredVoices = useMemo(() => {
    let filtered = voices;
    if (voiceLanguageFilter !== 'all') {
      filtered = filtered.filter(v => v.language === voiceLanguageFilter);
    }
    if (voiceSearch.trim()) {
      const q = voiceSearch.toLowerCase();
      filtered = filtered.filter(v => v.name.toLowerCase().includes(q) || v.language.toLowerCase().includes(q));
    }
    return filtered;
  }, [voices, voiceLanguageFilter, voiceSearch]);

  const displayVoices = showAllVoices ? filteredVoices : filteredVoices.slice(0, 12);

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
                      {environmentInfo.isHTTPS ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">Microphone:</span>
                    <span className={
                      environmentInfo.microphonePermission === 'granted' ? 'text-green-400' :
                      environmentInfo.microphonePermission === 'denied' ? 'text-red-400' : 'text-yellow-400'
                    }>
                      {environmentInfo.microphonePermission === 'granted' ? 'Granted' :
                       environmentInfo.microphonePermission === 'denied' ? 'Denied' : 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">Web Speech:</span>
                    <span className={environmentInfo.webSpeechAvailable ? 'text-green-400' : 'text-red-400'}>
                      {environmentInfo.webSpeechAvailable ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Current Provider + VAD Live Indicator */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Provider & Voice Activity
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-slate-300 text-sm space-y-1">
                  <p><strong>Provider:</strong> {currentProvider}</p>
                  <p><strong>Speech Available:</strong> {speechAvailable ? 'Yes' : 'No'}</p>
                  {speechError && <p className="text-red-400"><strong>Error:</strong> {speechError}</p>}
                </div>
                {/* VAD live indicator */}
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">VAD State</div>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full transition-colors duration-200 ${
                      vadState === 'speech' ? 'bg-green-400 shadow-lg shadow-green-400/40 animate-pulse' :
                      vadState === 'noise' ? 'bg-yellow-400 shadow-lg shadow-yellow-400/30' :
                      'bg-slate-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      vadState === 'speech' ? 'text-green-400' :
                      vadState === 'noise' ? 'text-yellow-400' :
                      'text-slate-500'
                    }`}>
                      {vadState === 'speech' ? 'Speaking' :
                       vadState === 'noise' ? 'Noise' :
                       vadState === 'silence' ? 'Silence' : 'Inactive'}
                    </span>
                  </div>
                  {vadStats && (
                    <div className="text-xs text-slate-500 mt-1">
                      {vadStats.speechSegments} segment{vadStats.speechSegments !== 1 ? 's' : ''} detected
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Voice Selection — with filtering */}
            {voices.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-white mb-3">Voice Selection</h3>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={voiceSearch}
                      onChange={(e) => setVoiceSearch(e.target.value)}
                      placeholder="Search voices..."
                      className="w-full pl-8 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <select
                    value={voiceLanguageFilter}
                    onChange={(e) => setVoiceLanguageFilter(e.target.value)}
                    aria-label="Filter voices by language"
                    className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="all">All languages</option>
                    {uniqueLanguages.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {displayVoices.map((voice) => (
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
                      <div className="text-xs text-slate-400">{voice.language}{voice.gender ? ` · ${voice.gender}` : ''}</div>
                    </button>
                  ))}
                </div>
                {filteredVoices.length > 12 && !showAllVoices && (
                  <button
                    onClick={() => setShowAllVoices(true)}
                    className="mt-2 text-xs text-violet-400 hover:text-violet-300"
                  >
                    Show all {filteredVoices.length} voices
                  </button>
                )}
                {showAllVoices && filteredVoices.length > 12 && (
                  <button
                    onClick={() => setShowAllVoices(false)}
                    className="mt-2 text-xs text-violet-400 hover:text-violet-300"
                  >
                    Show fewer
                  </button>
                )}
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

            {/* Audio Recording Test */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Audio Recording Test (MRecordRTC)
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Test the MRecordRTC audio recording and processing pipeline
              </p>
              <button
                onClick={() => setShowAudioRecordingTest(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30"
              >
                <Mic className="w-4 h-4" />
                Test Audio Recording
              </button>
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
                  <><RefreshCw className="w-4 h-4 animate-spin" />Testing...</>
                ) : (
                  <><TestTube className="w-4 h-4" />Test All Providers</>
                )}
              </button>
              {testResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-medium text-slate-300">Test Results</h4>
                  {testResults.map((result) => (
                    <div key={result.provider} className="bg-slate-700/30 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white capitalize">{result.provider}</span>
                        <div className="flex gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${result.sttWorking ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                            STT {result.sttWorking ? 'OK' : 'Fail'}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${result.ttsWorking ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                            TTS {result.ttsWorking ? 'OK' : 'Fail'}
                          </span>
                        </div>
                      </div>
                      {result.error && <p className="text-xs text-red-400">{result.error}</p>}
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
                  {[
                    ['TTS', capabilities.supportsTTS],
                    ['STT', capabilities.supportsSTT],
                    ['Streaming', capabilities.supportsStreaming],
                    ['Multi-lang', capabilities.supportsMultiLanguage],
                    ['VAD', capabilities.supportsVAD]
                  ].map(([label, ok]) => (
                    <div key={label as string} className="flex items-center gap-2">
                      <span className="text-slate-300">{label as string}:</span>
                      <span className={(ok as boolean) ? 'text-green-400' : 'text-red-400'}>
                        {(ok as boolean) ? <CheckCircle className="w-4 h-4 inline" /> : <XCircle className="w-4 h-4 inline" />}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      <AudioRecordingTest
        isOpen={showAudioRecordingTest}
        onClose={() => setShowAudioRecordingTest(false)}
      />
    </AnimatePresence>
  );
};
