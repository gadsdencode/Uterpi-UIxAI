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
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        borderColor: 'border-green-400/30',
        title: 'AI Analysis Complete',
        description: 'Your file has been analyzed by AI',
        actionText: 'View Insights',
        actionIcon: Eye
      };
    case 'analyzing':
      return {
        icon: Clock,
        color: 'text-violet-400',
        bgColor: 'bg-violet-500/20',
        borderColor: 'border-violet-400/30',
        title: 'AI Analyzing...',
        description: 'Our AI is examining your file',
        actionText: 'Analyzing',
        actionIcon: Brain
      };
    case 'failed':
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        borderColor: 'border-red-400/30',
        title: 'Analysis Failed',
        description: 'Unable to analyze this file',
        actionText: 'Retry Analysis',
        actionIcon: Zap
      };
    case 'pending':
    default:
      return {
        icon: Brain,
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/20',
        borderColor: 'border-slate-400/30',
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
    <HolographicBubble className={className}>
      <div className="flex items-start space-x-3">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded-lg ${config.bgColor}`}>
          <IconComponent className={`w-5 h-5 ${config.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-white">
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

          <p className="text-sm text-slate-300 mb-3">
            {config.description}
          </p>

          {/* Quick Insights (for completed analysis) */}
          {status === 'completed' && insights && insights.length > 0 && (
            <div className="space-y-2 mb-3">
              {insights.slice(0, 2).map((insight, index) => (
                <div key={index} className="text-xs">
                  <span className="font-medium text-slate-200">{insight.label}: </span>
                  {insight.type === 'badge' ? (
                    <Badge variant="secondary" className="text-xs ml-1 bg-slate-700/50 text-slate-300 border-slate-600/50">
                      {insight.value}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 line-clamp-1">
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
            className={`w-full ${
              status === 'completed' 
                ? 'bg-violet-500/20 text-violet-300 border-violet-400/30 hover:bg-violet-500/30' 
                : 'border-slate-600/50 text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
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
          className="mt-3 h-1 bg-slate-700/50 rounded-full overflow-hidden"
        >
          <motion.div
            className="h-full bg-violet-400"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </HolographicBubble>
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