import React from 'react';
import { motion } from 'framer-motion';
import { Brain, CheckCircle, AlertCircle, Clock, Sparkles, Eye, Zap } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface AnalysisStatusCardProps {
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  analysis?: any;
  onAnalyze?: () => void;
  onViewResults?: () => void;
  className?: string;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'completed':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        title: 'AI Analysis Complete',
        description: 'Your file has been analyzed by AI',
        actionText: 'View Insights',
        actionIcon: Eye
      };
    case 'analyzing':
      return {
        icon: Clock,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        title: 'AI Analyzing...',
        description: 'Our AI is examining your file',
        actionText: 'Analyzing',
        actionIcon: Brain
      };
    case 'failed':
      return {
        icon: AlertCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        title: 'Analysis Failed',
        description: 'Unable to analyze this file',
        actionText: 'Retry Analysis',
        actionIcon: Zap
      };
    case 'pending':
    default:
      return {
        icon: Brain,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        title: 'AI Analysis Available',
        description: 'Get insights about your file',
        actionText: 'Analyze with AI',
        actionIcon: Sparkles
      };
  }
};

const getAnalysisInsights = (analysis: any) => {
  if (!analysis) return null;

  const insights = [];
  
  if (analysis.summary) {
    insights.push({
      label: 'Summary',
      value: analysis.summary,
      type: 'text'
    });
  }
  
  if (analysis.quality) {
    insights.push({
      label: 'Quality',
      value: analysis.quality,
      type: 'badge'
    });
  }
  
  if (analysis.complexity) {
    insights.push({
      label: 'Complexity',
      value: analysis.complexity,
      type: 'badge'
    });
  }
  
  if (analysis.improvements && analysis.improvements.length > 0) {
    insights.push({
      label: 'Suggestions',
      value: analysis.improvements.slice(0, 2).join(', '),
      type: 'text'
    });
  }

  return insights;
};

export const AnalysisStatusCard: React.FC<AnalysisStatusCardProps> = ({
  status,
  analysis,
  onAnalyze,
  onViewResults,
  className = ''
}) => {
  const config = getStatusConfig(status);
  const IconComponent = config.icon;
  const ActionIcon = config.actionIcon;
  const insights = getAnalysisInsights(analysis);

  const handleAction = () => {
    if (status === 'completed' && onViewResults) {
      onViewResults();
    } else if (status === 'pending' && onAnalyze) {
      onAnalyze();
    } else if (status === 'failed' && onAnalyze) {
      onAnalyze();
    }
  };

  return (
    <Card className={`${config.bgColor} ${config.borderColor} border ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start space-x-3">
          {/* Icon */}
          <div className={`flex-shrink-0 p-2 rounded-lg ${config.bgColor}`}>
            <IconComponent className={`w-5 h-5 ${config.color}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-900">
                {config.title}
              </h4>
              <Badge 
                variant="outline"
                className={`text-xs ${config.color} ${config.borderColor}`}
              >
                {status === 'completed' && '🧠 Analyzed'}
                {status === 'analyzing' && '⏳ Analyzing'}
                {status === 'failed' && '❌ Failed'}
                {status === 'pending' && '⏸️ Pending'}
              </Badge>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              {config.description}
            </p>

            {/* Quick Insights (for completed analysis) */}
            {status === 'completed' && insights && insights.length > 0 && (
              <div className="space-y-2 mb-3">
                {insights.slice(0, 2).map((insight, index) => (
                  <div key={index} className="text-xs">
                    <span className="font-medium text-gray-700">{insight.label}: </span>
                    {insight.type === 'badge' ? (
                      <Badge variant="secondary" className="text-xs ml-1">
                        {insight.value}
                      </Badge>
                    ) : (
                      <span className="text-gray-600 line-clamp-1">
                        {insight.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action Button */}
            <Button
              size="sm"
              variant={status === 'completed' ? 'default' : 'outline'}
              onClick={handleAction}
              disabled={status === 'analyzing'}
              className="w-full"
            >
              <ActionIcon className="w-3 h-3 mr-2" />
              {config.actionText}
            </Button>
          </div>
        </div>

        {/* Progress Indicator for Analyzing State */}
        {status === 'analyzing' && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="mt-3 h-1 bg-blue-200 rounded-full overflow-hidden"
          >
            <motion.div
              className="h-full bg-blue-500"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};

// Compact version for file cards
export const CompactAnalysisStatus: React.FC<{
  status: string;
  onClick?: () => void;
}> = ({ status, onClick }) => {
  const config = getStatusConfig(status);
  const IconComponent = config.icon;

  return (
    <Badge 
      variant="outline"
      className={`text-xs cursor-pointer transition-colors ${config.color} ${config.borderColor} hover:${config.bgColor}`}
      onClick={onClick}
    >
      <IconComponent className="w-3 h-3 mr-1" />
      {status === 'completed' && 'Analyzed'}
      {status === 'analyzing' && 'Analyzing'}
      {status === 'failed' && 'Failed'}
      {status === 'pending' && 'Analyze'}
    </Badge>
  );
}; 