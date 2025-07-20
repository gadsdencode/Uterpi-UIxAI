import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  X, 
  BarChart3, 
  Target, 
  Shield, 
  Clock, 
  Gauge,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Package,
  Zap
} from 'lucide-react';

interface AnalyzeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PerformanceAnalysis {
  loadTime: number;
  bundleSize: number;
  renderTime: number;
}

interface Pattern {
  name: string;
  usage: string;
  recommendation: string;
}

interface AntiPattern {
  name: string;
  instances: number;
  severity: 'low' | 'medium' | 'high';
}

interface AnalysisResult {
  performance: PerformanceAnalysis;
  suggestions: string[];
  codeSmells: number;
  securityIssues: number;
}

interface DesignPatternsResult {
  detected: Pattern[];
  antiPatterns: AntiPattern[];
}

const AnalyzeModal: React.FC<AnalyzeModalProps> = ({ isOpen, onClose }) => {
  const [analysisType, setAnalysisType] = useState<'performance' | 'patterns'>('performance');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [performanceResult, setPerformanceResult] = useState<AnalysisResult | null>(null);
  const [patternsResult, setPatternsResult] = useState<DesignPatternsResult | null>(null);

  const analyzePerformance = async () => {
    setIsAnalyzing(true);

    try {
      const response = await fetch('/api/analyze/performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectPath: '.',
          metrics: ['loadTime', 'bundleSize', 'renderTime']
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setPerformanceResult(result.analysis);
      } else {
        throw new Error('Performance analysis failed');
      }
    } catch (error) {
      console.error('Performance analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzePatterns = async () => {
    setIsAnalyzing(true);

    try {
      const response = await fetch('/api/analyze/design-patterns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codebase: '.'
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setPatternsResult(result.patterns);
      } else {
        throw new Error('Pattern analysis failed');
      }
    } catch (error) {
      console.error('Pattern analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetModal = () => {
    setAnalysisType('performance');
    setIsAnalyzing(false);
    setPerformanceResult(null);
    setPatternsResult(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const getPerformanceScore = (value: number, type: 'time' | 'size') => {
    if (type === 'time') {
      if (value < 1) return { score: 'excellent', color: 'text-green-400', bg: 'bg-green-500/20' };
      if (value < 2) return { score: 'good', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
      return { score: 'needs improvement', color: 'text-red-400', bg: 'bg-red-500/20' };
    } else {
      if (value < 200) return { score: 'excellent', color: 'text-green-400', bg: 'bg-green-500/20' };
      if (value < 400) return { score: 'good', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
      return { score: 'needs improvement', color: 'text-red-400', bg: 'bg-red-500/20' };
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-500/20';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20';
      case 'low': return 'text-green-400 bg-green-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-5xl max-h-[90vh] mx-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", duration: 0.5 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Brain className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">NomadAI System Performance & Status</h2>
                <p className="text-sm text-slate-400">Analysis of performance, system architecture, and current status</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              title="Close modal"
              aria-label="Close Analyze modal"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            {/* Analysis Type Selection */}
            <div className="flex justify-center gap-2 mb-8">
              <button
                onClick={() => setAnalysisType('performance')}
                className={`px-6 py-3 rounded-lg transition-all flex items-center gap-2 ${
                  analysisType === 'performance'
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-400/50'
                    : 'text-slate-400 hover:text-white border border-slate-600'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Performance Analysis
              </button>
              <button
                onClick={() => setAnalysisType('patterns')}
                className={`px-6 py-3 rounded-lg transition-all flex items-center gap-2 ${
                  analysisType === 'patterns'
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-400/50'
                    : 'text-slate-400 hover:text-white border border-slate-600'
                }`}
              >
                <Target className="w-4 h-4" />
                System Status & Architecture
              </button>
            </div>

            {analysisType === 'performance' && (
              <div className="space-y-6">
                {!performanceResult && !isAnalyzing && (
                  <div className="text-center space-y-6">
                    <div className="p-8 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <BarChart3 className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">Performance Analysis</h3>
                      <p className="text-slate-400 mb-6">
                        Analyze NomadAI performance metrics including load time, bundle size, and render performance.
                      </p>
                      <motion.button
                        onClick={analyzePerformance}
                        className="px-8 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-lg text-white font-medium flex items-center gap-2 mx-auto transition-all"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Gauge className="w-4 h-4" />
                        Start Performance Analysis
                      </motion.button>
                    </div>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-6">
                    <div className="relative">
                      <motion.div
                        className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <motion.div
                        className="absolute inset-2 bg-purple-500/20 rounded-full flex items-center justify-center"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <BarChart3 className="w-6 h-6 text-purple-400" />
                      </motion.div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-semibold text-white mb-2">Analyzing Performance</h3>
                      <p className="text-slate-400">Measuring load times, bundle sizes, and rendering performance...</p>
                    </div>
                  </div>
                )}

                {performanceResult && (
                  <div className="space-y-6">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-white mb-2">Performance Analysis Results</h3>
                      <p className="text-slate-400">Key metrics and optimization suggestions</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      {/* Load Time */}
                      <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-3 mb-4">
                          <Clock className="w-6 h-6 text-blue-400" />
                          <h4 className="font-semibold text-white">Load Time</h4>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">
                          {performanceResult.performance.loadTime.toFixed(2)}s
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          getPerformanceScore(performanceResult.performance.loadTime, 'time').bg
                        } ${getPerformanceScore(performanceResult.performance.loadTime, 'time').color}`}>
                          {getPerformanceScore(performanceResult.performance.loadTime, 'time').score}
                        </div>
                      </div>

                      {/* Bundle Size */}
                      <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-3 mb-4">
                          <Package className="w-6 h-6 text-green-400" />
                          <h4 className="font-semibold text-white">Bundle Size</h4>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">
                          {Math.round(performanceResult.performance.bundleSize)}KB
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          getPerformanceScore(performanceResult.performance.bundleSize, 'size').bg
                        } ${getPerformanceScore(performanceResult.performance.bundleSize, 'size').color}`}>
                          {getPerformanceScore(performanceResult.performance.bundleSize, 'size').score}
                        </div>
                      </div>

                      {/* Render Time */}
                      <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-3 mb-4">
                          <Zap className="w-6 h-6 text-yellow-400" />
                          <h4 className="font-semibold text-white">Render Time</h4>
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">
                          {Math.round(performanceResult.performance.renderTime)}ms
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          getPerformanceScore(performanceResult.performance.renderTime / 100, 'time').bg
                        } ${getPerformanceScore(performanceResult.performance.renderTime / 100, 'time').color}`}>
                          {getPerformanceScore(performanceResult.performance.renderTime / 100, 'time').score}
                        </div>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Suggestions */}
                      <div className="space-y-4">
                        <h4 className="text-white font-medium flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-purple-400" />
                          Optimization Suggestions
                        </h4>
                        <div className="space-y-2">
                          {performanceResult.suggestions.map((suggestion, index) => (
                            <div key={index} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                              <div className="flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-slate-300">{suggestion}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Issues Summary */}
                      <div className="space-y-4">
                        <h4 className="text-white font-medium flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-purple-400" />
                          Issues Summary
                        </h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                              <span className="text-white">Code Smells</span>
                            </div>
                            <span className="text-yellow-400 font-medium">{performanceResult.codeSmells}</span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-red-400" />
                              <span className="text-white">Security Issues</span>
                            </div>
                            <span className="text-red-400 font-medium">{performanceResult.securityIssues}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {analysisType === 'patterns' && (
              <div className="space-y-6">
                {!patternsResult && !isAnalyzing && (
                  <div className="text-center space-y-6">
                    <div className="p-8 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <Target className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">NomadAI System Status</h3>
                      <p className="text-slate-400 mb-6">
                        Run for a full system status report.
                      </p>
                      <motion.button
                        onClick={analyzePatterns}
                        className="px-8 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-lg text-white font-medium flex items-center gap-2 mx-auto transition-all"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Target className="w-4 h-4" />
                        Start System Status Analysis
                      </motion.button>
                    </div>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-6">
                    <div className="relative">
                      <motion.div
                        className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <motion.div
                        className="absolute inset-2 bg-purple-500/20 rounded-full flex items-center justify-center"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Target className="w-6 h-6 text-purple-400" />
                      </motion.div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-semibold text-white mb-2">Analyzing System Architecture</h3>
                      <p className="text-slate-400">Scanning code for patterns, anti-patterns, and architecture...</p>
                    </div>
                  </div>
                )}

                {patternsResult && (
                  <div className="space-y-6">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-white mb-2">Analyzing System Architecture</h3>
                      <p className="text-slate-400">Scanning code for patterns, anti-patterns, and architecture...</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Detected Patterns */}
                      <div className="space-y-4">
                        <h4 className="text-white font-medium flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          System Architecture
                        </h4>
                        <div className="space-y-3">
                          {patternsResult.detected.map((pattern, index) => (
                            <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-white">{pattern.name}</h5>
                                <span className="text-green-400 font-medium">{pattern.usage}</span>
                              </div>
                              <p className="text-sm text-slate-400">{pattern.recommendation}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Anti-Patterns */}
                      <div className="space-y-4">
                        <h4 className="text-white font-medium flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-400" />
                          Anti-Patterns Found
                        </h4>
                        <div className="space-y-3">
                          {patternsResult.antiPatterns.map((antiPattern, index) => (
                            <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-white">{antiPattern.name}</h5>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">{antiPattern.instances} instances</span>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(antiPattern.severity)}`}>
                                    {antiPattern.severity}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            {(performanceResult || patternsResult) && (
              <div className="flex justify-center gap-3 pt-6">
                <button
                  onClick={resetModal}
                  className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Run Another Analysis
                </button>
                <motion.button
                  onClick={handleClose}
                  className="px-8 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-lg text-white font-medium transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Done
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AnalyzeModal; 