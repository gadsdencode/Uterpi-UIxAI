import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Brain, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Clock, 
  FileText,
  Shield,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { type FileItem } from '../../hooks/useFileManager';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileItem | null;
}

const getComplexityColor = (complexity: string) => {
  switch (complexity?.toLowerCase()) {
    case 'low': return 'bg-green-500/20 text-green-300 border-green-400/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30';
    case 'high': return 'bg-red-500/20 text-red-300 border-red-400/30';
    default: return 'bg-slate-500/20 text-slate-300 border-slate-400/30';
  }
};

const getConfidenceColor = (confidence: string) => {
  switch (confidence?.toLowerCase()) {
    case 'high': return 'bg-green-500/20 text-green-300 border-green-400/30';
    case 'medium': return 'bg-violet-500/20 text-violet-300 border-violet-400/30';
    case 'low': return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30';
    default: return 'bg-slate-500/20 text-slate-300 border-slate-400/30';
  }
};

const getQualityColor = (quality: string) => {
  switch (quality?.toLowerCase()) {
    case 'excellent':
    case 'good': return 'bg-green-500/20 text-green-300 border-green-400/30';
    case 'fair':
    case 'average': return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30';
    case 'poor':
    case 'bad': return 'bg-red-500/20 text-red-300 border-red-400/30';
    default: return 'bg-slate-500/20 text-slate-300 border-slate-400/30';
  }
};

// Helper function to get meaningful fallback values
const getFallbackValue = (value: string | undefined, field: string): string => {
  if (value && value !== 'unknown') {
    return value;
  }
  
  switch (field) {
    case 'complexity':
      return 'Analysis Needed';
    case 'quality':
      return 'Analysis Needed';
    case 'confidence':
      return 'Low';
    default:
      return 'Unknown';
  }
};

// Holographic Bubble Component to match app aesthetic
const HolographicBubble: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", damping: 20, stiffness: 300 }}
    className={`
      relative p-4 rounded-xl backdrop-blur-xl border overflow-hidden
      bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30
      ${className}
    `}
  >
    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent" />
    <div className="relative z-10">{children}</div>
    
    {/* Holographic shimmer effect */}
    <motion.div
      className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent"
      animate={{
        x: ["-100%", "100%"],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        repeatType: "loop",
        ease: "linear",
      }}
    />
  </motion.div>
);

export const AnalysisModal: React.FC<AnalysisModalProps> = ({
  isOpen,
  onClose,
  file
}) => {
  // Add debugging
  console.log('AnalysisModal render:', { isOpen, file, hasAnalysis: !!file?.aiAnalysis });
  
  if (!file) {
    console.log('AnalysisModal: No file provided');
    return null;
  }

  if (!isOpen) {
    return null;
  }

  const analysis = file.aiAnalysis;
  
  // Log the analysis data structure
  console.log('AnalysisModal: Analysis data:', analysis);

  console.log('AnalysisModal: Rendering modal with isOpen:', isOpen);
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border-slate-600/30">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-white">
            <Brain className="w-5 h-5 text-violet-400" />
            <span>AI Analysis Results</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Debug Info */}
          <HolographicBubble>
            <h3 className="font-medium text-violet-300 mb-2">Debug Info</h3>
            <p className="text-sm text-slate-300">
              Modal is rendering! File: {file.name}, Analysis Status: {file.analysisStatus}
            </p>
          </HolographicBubble>

          {/* File Information */}
          <HolographicBubble>
            <div className="flex items-center space-x-3">
              <FileText className="w-5 h-5 text-slate-400" />
              <div>
                <h3 className="font-medium text-white">{file.name}</h3>
                <p className="text-sm text-slate-400">
                  {file.mimeType} • {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
          </HolographicBubble>

          {/* Analysis Status */}
          {!analysis && (
            <HolographicBubble>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <span className="font-medium text-yellow-300">
                  No Analysis Data Available
                </span>
              </div>
              <p className="text-slate-300 text-sm mt-2">
                This file hasn't been analyzed yet or the analysis data is not available.
              </p>
            </HolographicBubble>
          )}

          {/* Analysis Summary */}
          {analysis?.summary && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2 text-white">
                <Info className="w-5 h-5 text-violet-400" />
                <span>Summary</span>
              </h3>
              <HolographicBubble>
                <p className="text-slate-300 leading-relaxed">
                  {analysis.summary}
                </p>
              </HolographicBubble>
            </div>
          )}

          {/* Analysis Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Complexity */}
            <HolographicBubble>
              <div className="flex items-center space-x-2 mb-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-sm text-white">Complexity</span>
              </div>
              <Badge 
                variant="outline" 
                className={`w-full justify-center ${getComplexityColor(analysis.complexity)}`}
              >
                {getFallbackValue(analysis.complexity, 'complexity')}
              </Badge>
            </HolographicBubble>

            {/* Quality */}
            <HolographicBubble>
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-sm text-white">Quality</span>
              </div>
              <Badge 
                variant="outline" 
                className={`w-full justify-center ${getQualityColor(analysis.quality)}`}
              >
                {getFallbackValue(analysis.quality, 'quality')}
              </Badge>
            </HolographicBubble>

            {/* Confidence */}
            <HolographicBubble>
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-sm text-white">Confidence</span>
              </div>
              <Badge 
                variant="outline" 
                className={`w-full justify-center ${getConfidenceColor(analysis.confidence)}`}
              >
                {getFallbackValue(analysis.confidence, 'confidence')}
              </Badge>
            </HolographicBubble>
          </div>

          {/* Improvements */}
          {analysis?.improvements && analysis.improvements.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2 text-white">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <span>Suggested Improvements</span>
              </h3>
              <div className="space-y-2">
                {analysis.improvements.map((improvement: string, index: number) => (
                  <HolographicBubble key={index}>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0" />
                      <p className="text-slate-300 text-sm">
                        {improvement}
                      </p>
                    </div>
                  </HolographicBubble>
                ))}
              </div>
            </div>
          )}

          {/* Security */}
          {analysis?.security && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2 text-white">
                <Shield className="w-5 h-5 text-orange-400" />
                <span>Security Assessment</span>
              </h3>
              <HolographicBubble>
                <p className="text-slate-300 leading-relaxed">
                  {analysis.security}
                </p>
              </HolographicBubble>
            </div>
          )}

          {/* Analysis Metadata */}
          <HolographicBubble>
            <h3 className="text-sm font-medium text-slate-400 mb-3">
              Analysis Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {analysis?.analyzedAt && (
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-300">
                    Analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {analysis?.analysisType && (
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-300">
                    Type: {analysis.analysisType}
                  </span>
                </div>
              )}
              {analysis?.fileMetadata?.encoding && (
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-300">
                    Encoding: {analysis.fileMetadata.encoding}
                  </span>
                </div>
              )}
              {analysis?.model && (
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-300">
                    Model: {analysis.model}
                  </span>
                </div>
              )}
            </div>
          </HolographicBubble>

          {/* Error Information (if analysis failed) */}
          {analysis?.error && (
            <HolographicBubble>
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="font-medium text-red-300">Analysis Error</span>
              </div>
              <p className="text-red-300 text-sm">
                {analysis.error}
              </p>
            </HolographicBubble>
          )}

          {/* Raw Response (for debugging) */}
          {analysis?.rawResponse && (
            <HolographicBubble>
              <details className="cursor-pointer">
                <summary className="font-medium text-slate-400">
                  Raw Analysis Response (Debug)
                </summary>
                <pre className="mt-2 text-xs text-slate-500 overflow-x-auto whitespace-pre-wrap">
                  {analysis.rawResponse}
                </pre>
              </details>
            </HolographicBubble>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-slate-600/30">
          <Button variant="outline" onClick={onClose} className="border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 