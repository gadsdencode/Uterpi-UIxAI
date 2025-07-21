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
    case 'low': return 'bg-green-100 text-green-800 border-green-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getConfidenceColor = (confidence: string) => {
  switch (confidence?.toLowerCase()) {
    case 'high': return 'bg-green-100 text-green-800 border-green-200';
    case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getQualityColor = (quality: string) => {
  switch (quality?.toLowerCase()) {
    case 'excellent':
    case 'good': return 'bg-green-100 text-green-800 border-green-200';
    case 'fair':
    case 'average': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'poor':
    case 'bad': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <span>AI Analysis Results</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Debug Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Debug Info</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Modal is rendering! File: {file.name}, Analysis Status: {file.analysisStatus}
            </p>
          </div>

          {/* File Information */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <FileText className="w-5 h-5 text-gray-600" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">{file.name}</h3>
                <p className="text-sm text-gray-500">
                  {file.mimeType} • {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
          </div>

          {/* Analysis Status */}
          {!analysis && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <span className="font-medium text-yellow-800 dark:text-yellow-200">
                  No Analysis Data Available
                </span>
              </div>
              <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-2">
                This file hasn't been analyzed yet or the analysis data is not available.
              </p>
            </div>
          )}

          {/* Analysis Summary */}
          {analysis?.summary && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2">
                <Info className="w-5 h-5 text-blue-600" />
                <span>Summary</span>
              </h3>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {analysis.summary}
                </p>
              </div>
            </div>
          )}

          {/* Analysis Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Complexity */}
            {analysis?.complexity && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-sm">Complexity</span>
                </div>
                <Badge 
                  variant="outline" 
                  className={`w-full justify-center ${getComplexityColor(analysis.complexity)}`}
                >
                  {analysis.complexity}
                </Badge>
              </div>
            )}

            {/* Quality */}
            {analysis?.quality && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-sm">Quality</span>
                </div>
                <Badge 
                  variant="outline" 
                  className={`w-full justify-center ${getQualityColor(analysis.quality)}`}
                >
                  {analysis.quality}
                </Badge>
              </div>
            )}

            {/* Confidence */}
            {analysis?.confidence && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-sm">Confidence</span>
                </div>
                <Badge 
                  variant="outline" 
                  className={`w-full justify-center ${getConfidenceColor(analysis.confidence)}`}
                >
                  {analysis.confidence}
                </Badge>
              </div>
            )}
          </div>

          {/* Improvements */}
          {analysis?.improvements && analysis.improvements.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span>Suggested Improvements</span>
              </h3>
              <div className="space-y-2">
                {analysis.improvements.map((improvement: string, index: number) => (
                  <div 
                    key={index}
                    className="flex items-start space-x-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-700 dark:text-gray-300 text-sm">
                      {improvement}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security */}
          {analysis?.security && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2">
                <Shield className="w-5 h-5 text-orange-600" />
                <span>Security Assessment</span>
              </h3>
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {analysis.security}
                </p>
              </div>
            </div>
          )}

          {/* Analysis Metadata */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
              Analysis Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {analysis?.analyzedAt && (
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {analysis?.analysisType && (
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Type: {analysis.analysisType}
                  </span>
                </div>
              )}
              {analysis?.fileMetadata?.encoding && (
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Encoding: {analysis.fileMetadata.encoding}
                  </span>
                </div>
              )}
              {analysis?.model && (
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Model: {analysis.model}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Error Information (if analysis failed) */}
          {analysis?.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="font-medium text-red-800 dark:text-red-200">Analysis Error</span>
              </div>
              <p className="text-red-700 dark:text-red-300 text-sm">
                {analysis.error}
              </p>
            </div>
          )}

          {/* Raw Response (for debugging) */}
          {analysis?.rawResponse && (
            <details className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-400">
                Raw Analysis Response (Debug)
              </summary>
              <pre className="mt-2 text-xs text-gray-500 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
                {analysis.rawResponse}
              </pre>
            </details>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 