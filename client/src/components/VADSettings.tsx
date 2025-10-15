// VAD (Voice Activity Detection) Settings Component
// Provides configuration interface for VAD parameters and real-time monitoring

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Settings,
  Activity,
  Volume2,
  VolumeX,
  Zap,
  BarChart3,
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react';
import { useSpeech } from '../hooks/useSpeech';
import { useAIProvider } from '../hooks/useAIProvider';
import { VADConfig, VADEvent, VADStats } from '../types/speech';
import { toast } from 'sonner';

interface VADSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VADSettings: React.FC<VADSettingsProps> = ({ isOpen, onClose }) => {
  const { currentProvider } = useAIProvider();
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<VADEvent[]>([]);
  const [vadStats, setVadStats] = useState<VADStats | null>(null);
  const [isVADActive, setIsVADActive] = useState(false);

  // VAD Configuration State
  const [vadConfig, setVadConfig] = useState<VADConfig>({
    sensitivity: 0.5,
    minSpeechDuration: 200,
    silenceTimeout: 1000,
    sampleRate: 16000,
    frameSize: 1024,
    hopSize: 512,
    energyThreshold: 0.01,
    energyRatio: 2.0,
    spectralThreshold: 0.3,
    spectralCentroid: 1000,
    zcrThreshold: 0.1,
    adaptiveThreshold: true,
    noiseFloorLearning: true,
    noiseFloorSamples: 50
  });

  const {
    startListening,
    stopListening,
    isListening,
    transcript,
    isAvailable: speechAvailable,
    initialize,
    error: speechError,
    capabilities,
    enableVAD,
    vadState,
    vadStats: hookVadStats,
    updateVADConfig
  } = useSpeech({
    autoInitialize: false,
    enableVAD: true,
    vadConfig,
    onVADEvent: (event) => {
      console.log('VAD Event:', event);
      setTestResults(prev => [...prev.slice(-9), event]); // Keep last 10 events
      
      // Update stats
      if (hookVadStats) {
        setVadStats(hookVadStats);
      }
    },
    onRecognitionResult: (result) => {
      if (result.isFinal && result.transcript.trim()) {
        toast.success(`VAD detected speech: "${result.transcript}"`);
      }
    },
    onRecognitionError: (error) => {
      toast.error(`VAD error: ${error.message}`);
      setIsTesting(false);
    }
  });

  // Initialize speech service on mount
  useEffect(() => {
    if (isOpen && speechAvailable) {
      initialize().catch(console.error);
    }
  }, [isOpen, speechAvailable, initialize]);

  // Update VAD stats from hook
  useEffect(() => {
    if (hookVadStats) {
      setVadStats(hookVadStats);
    }
  }, [hookVadStats]);

  // Update VAD state
  useEffect(() => {
    setIsVADActive(vadState === 'speech');
  }, [vadState]);

  const handleConfigChange = useCallback((key: keyof VADConfig, value: number | boolean) => {
    const newConfig = { ...vadConfig, [key]: value };
    setVadConfig(newConfig);
    updateVADConfig(newConfig);
  }, [vadConfig, updateVADConfig]);

  const startVADTest = async () => {
    try {
      setIsTesting(true);
      setTestResults([]);
      setVadStats(null);
      
      await startListening({
        continuous: true,
        interimResults: true,
        language: 'en-US'
      });
      
      toast.success('VAD test started - speak to test detection');
    } catch (error) {
      console.error('Failed to start VAD test:', error);
      toast.error('Failed to start VAD test');
      setIsTesting(false);
    }
  };

  const stopVADTest = async () => {
    try {
      await stopListening();
      setIsTesting(false);
      toast.success('VAD test stopped');
    } catch (error) {
      console.error('Failed to stop VAD test:', error);
      toast.error('Failed to stop VAD test');
    }
  };

  const resetConfig = () => {
    const defaultConfig: VADConfig = {
      sensitivity: 0.5,
      minSpeechDuration: 200,
      silenceTimeout: 1000,
      sampleRate: 16000,
      frameSize: 1024,
      hopSize: 512,
      energyThreshold: 0.01,
      energyRatio: 2.0,
      spectralThreshold: 0.3,
      spectralCentroid: 1000,
      zcrThreshold: 0.1,
      adaptiveThreshold: true,
      noiseFloorLearning: true,
      noiseFloorSamples: 50
    };
    setVadConfig(defaultConfig);
    updateVADConfig(defaultConfig);
    toast.success('VAD configuration reset to defaults');
  };

  const formatDuration = (ms: number): string => {
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getVADStateColor = (state: string | null): string => {
    switch (state) {
      case 'speech': return 'text-green-400';
      case 'noise': return 'text-yellow-400';
      case 'silence': return 'text-slate-400';
      default: return 'text-slate-500';
    }
  };

  const getVADStateIcon = (state: string | null) => {
    switch (state) {
      case 'speech': return <Volume2 className="w-4 h-4" />;
      case 'noise': return <AlertCircle className="w-4 h-4" />;
      case 'silence': return <VolumeX className="w-4 h-4" />;
      default: return <Mic className="w-4 h-4" />;
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
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Voice Activity Detection (VAD) Settings
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            title="Close VAD settings"
            aria-label="Close VAD settings"
          >
            <Square className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Configuration */}
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
                  <span className="text-slate-300">VAD Support:</span>
                  <span className={capabilities?.supportsVAD ? 'text-green-400' : 'text-red-400'}>
                    {capabilities?.supportsVAD ? '✅ Enabled' : '❌ Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300">Current State:</span>
                  <span className={`flex items-center gap-1 ${getVADStateColor(vadState)}`}>
                    {getVADStateIcon(vadState)}
                    {vadState || 'Unknown'}
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

            {/* VAD Configuration */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-white">VAD Configuration</h3>
                <button
                  onClick={resetConfig}
                  className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"
                >
                  Reset
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Sensitivity */}
                <div>
                  <label htmlFor="sensitivity-slider" className="block text-sm text-slate-300 mb-1">
                    Sensitivity: {vadConfig.sensitivity}
                  </label>
                  <input
                    id="sensitivity-slider"
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={vadConfig.sensitivity}
                    onChange={(e) => handleConfigChange('sensitivity', parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    aria-label="VAD sensitivity slider"
                    title="Adjust VAD sensitivity from 0.1 (less sensitive) to 1.0 (more sensitive)"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>Less Sensitive</span>
                    <span>More Sensitive</span>
                  </div>
                </div>

                {/* Min Speech Duration */}
                <div>
                  <label htmlFor="min-speech-duration-slider" className="block text-sm text-slate-300 mb-1">
                    Min Speech Duration: {vadConfig.minSpeechDuration}ms
                  </label>
                  <input
                    id="min-speech-duration-slider"
                    type="range"
                    min="100"
                    max="1000"
                    step="50"
                    value={vadConfig.minSpeechDuration}
                    onChange={(e) => handleConfigChange('minSpeechDuration', parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    aria-label="Minimum speech duration slider"
                    title="Set minimum speech duration from 100ms to 1000ms"
                  />
                </div>

                {/* Silence Timeout */}
                <div>
                  <label htmlFor="silence-timeout-slider" className="block text-sm text-slate-300 mb-1">
                    Silence Timeout: {vadConfig.silenceTimeout}ms
                  </label>
                  <input
                    id="silence-timeout-slider"
                    type="range"
                    min="500"
                    max="3000"
                    step="100"
                    value={vadConfig.silenceTimeout}
                    onChange={(e) => handleConfigChange('silenceTimeout', parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    aria-label="Silence timeout slider"
                    title="Set silence timeout from 500ms to 3000ms"
                  />
                </div>

                {/* Energy Threshold */}
                <div>
                  <label htmlFor="energy-threshold-slider" className="block text-sm text-slate-300 mb-1">
                    Energy Threshold: {vadConfig.energyThreshold}
                  </label>
                  <input
                    id="energy-threshold-slider"
                    type="range"
                    min="0.001"
                    max="0.1"
                    step="0.001"
                    value={vadConfig.energyThreshold}
                    onChange={(e) => handleConfigChange('energyThreshold', parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    aria-label="Energy threshold slider"
                    title="Set energy threshold from 0.001 to 0.1"
                  />
                </div>

                {/* Advanced Options */}
                <details className="group">
                  <summary className="cursor-pointer text-sm text-slate-300 hover:text-white transition-colors">
                    Advanced Options
                  </summary>
                  <div className="mt-3 space-y-3 pl-4 border-l-2 border-slate-600">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="adaptiveThreshold"
                        checked={vadConfig.adaptiveThreshold}
                        onChange={(e) => handleConfigChange('adaptiveThreshold', e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="adaptiveThreshold" className="text-sm text-slate-300">
                        Adaptive Threshold
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="noiseFloorLearning"
                        checked={vadConfig.noiseFloorLearning}
                        onChange={(e) => handleConfigChange('noiseFloorLearning', e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="noiseFloorLearning" className="text-sm text-slate-300">
                        Noise Floor Learning
                      </label>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* Right Column - Testing & Monitoring */}
          <div className="space-y-6">
            {/* Test Controls */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3">VAD Testing</h3>
              <div className="flex items-center justify-center gap-4">
                {!isTesting ? (
                  <button
                    onClick={startVADTest}
                    disabled={!speechAvailable || !capabilities?.supportsVAD}
                    className="flex items-center gap-2 px-6 py-3 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="w-5 h-5" />
                    Start VAD Test
                  </button>
                ) : (
                  <button
                    onClick={stopVADTest}
                    className="flex items-center gap-2 px-6 py-3 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    <Square className="w-5 h-5" />
                    Stop Test
                  </button>
                )}
              </div>
              
              {isTesting && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isVADActive ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></div>
                  <span className="text-sm text-slate-300">
                    {isVADActive ? 'Speech Detected' : 'Listening...'}
                  </span>
                </div>
              )}
            </div>

            {/* Real-time Events */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-3">Real-time Events</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {testResults.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-4">
                    No VAD events yet. Start testing to see events.
                  </div>
                ) : (
                  testResults.map((event, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-slate-700/50 rounded text-sm">
                      <div className="flex items-center gap-2">
                        {getVADStateIcon(event.type)}
                        <span className="text-slate-300">{event.type}</span>
                      </div>
                      <div className="text-slate-400">
                        {event.confidence.toFixed(2)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* VAD Statistics */}
            {vadStats && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  VAD Statistics
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-300">Speech Segments:</span>
                    <span className="text-white ml-2">{vadStats.speechSegments}</span>
                  </div>
                  <div>
                    <span className="text-slate-300">Total Speech:</span>
                    <span className="text-white ml-2">{formatDuration(vadStats.totalSpeechTime)}</span>
                  </div>
                  <div>
                    <span className="text-slate-300">Avg Speech:</span>
                    <span className="text-white ml-2">{formatDuration(vadStats.averageSpeechDuration)}</span>
                  </div>
                  <div>
                    <span className="text-slate-300">Accuracy:</span>
                    <span className="text-white ml-2">{vadStats.accuracy.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-300">False Positives:</span>
                    <span className="text-yellow-400 ml-2">{vadStats.falsePositives}</span>
                  </div>
                  <div>
                    <span className="text-slate-300">False Negatives:</span>
                    <span className="text-red-400 ml-2">{vadStats.falseNegatives}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Transcript */}
            {transcript && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  Detected Speech
                </h3>
                <div className="bg-slate-700/50 rounded p-3 text-slate-300 min-h-[60px]">
                  {transcript}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Information Panel */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <h3 className="text-lg font-medium text-blue-300 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            About Voice Activity Detection
          </h3>
          <div className="text-blue-200 text-sm space-y-2">
            <p>
              VAD automatically detects when you're speaking, reducing false triggers from background noise 
              and improving speech recognition accuracy.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong>Sensitivity:</strong> Higher values detect quieter speech but may trigger on noise</li>
              <li><strong>Min Speech Duration:</strong> Minimum time to consider as valid speech</li>
              <li><strong>Silence Timeout:</strong> How long to wait before ending speech detection</li>
              <li><strong>Energy Threshold:</strong> Minimum audio energy level to trigger speech detection</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
