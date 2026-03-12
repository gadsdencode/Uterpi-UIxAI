import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Brain, TrendingUp, Lightbulb, Target, X, ThumbsUp, ThumbsDown, Sparkles, Settings2, Zap } from 'lucide-react';
import { useAICoach } from '../hooks/useAICoach';
import { cn } from '../lib/utils';

// Available AI providers for the coach
const AI_PROVIDERS = [
  { id: 'lmstudio', name: 'LM Studio / Uterpi', description: 'Local AI' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o' },
  { id: 'gemini', name: 'Google Gemini', description: 'Gemini 2.5' },
  { id: 'azure', name: 'Azure AI', description: 'Azure OpenAI' },
] as const;

type AIProviderType = typeof AI_PROVIDERS[number]['id'];

interface AICoachPanelProps {
  className?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  autoExpand?: boolean;
}

export const AICoachPanel: React.FC<AICoachPanelProps> = ({
  className,
  position = 'bottom-right',
  autoExpand = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  const [selectedInsight, setSelectedInsight] = useState<number | null>(null);
  const [coachProvider, setCoachProvider] = useState<AIProviderType>('lmstudio');
  const [showProviderSelector, setShowProviderSelector] = useState(false);
  
  const {
    insights,
    workflowStats,
    isLoading,
    recordFeedback,
    applyRecommendation,
    fetchInsights,
    generateInsights,
  } = useAICoach({ enabled: true, autoFetch: true });

  // Get the display name for current provider
  const getProviderDisplayName = (providerId: string) => {
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    return provider?.name || providerId;
  };

  // Auto-expand when new high-priority insights arrive
  useEffect(() => {
    const hasHighPriorityInsights = insights.some(
      i => !i.wasShown && i.expectedImpact === 'high'
    );
    if (hasHighPriorityInsights && !isExpanded) {
      setIsExpanded(true);
    }
  }, [insights]);

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-20 right-4',
    'top-left': 'top-20 left-4',
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'workflow_optimization':
        return <TrendingUp className="w-4 h-4" />;
      case 'model_recommendation':
        return <Brain className="w-4 h-4" />;
      case 'efficiency_tip':
        return <Lightbulb className="w-4 h-4" />;
      case 'strategic_advice':
        return <Target className="w-4 h-4" />;
      default:
        return <Sparkles className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'strategic':
        return 'text-purple-400 bg-purple-900/20';
      case 'tactical':
        return 'text-blue-400 bg-blue-900/20';
      case 'operational':
        return 'text-green-400 bg-green-900/20';
      default:
        return 'text-gray-400 bg-gray-900/20';
    }
  };

  const handleFeedback = async (insightId: number, feedback: 'positive' | 'negative') => {
    await recordFeedback(insightId, feedback);
    setSelectedInsight(null);
  };

  const handleApplyRecommendation = async (insight: any, index: number) => {
    await applyRecommendation(insight, index);
    setSelectedInsight(null);
  };

  const unreadCount = insights.filter(i => !i.wasShown).length;

  return (
    <div
      className={cn(
        'fixed z-50 transition-all duration-300',
        positionClasses[position],
        className
      )}
    >
      {/* Collapsed View */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-full px-4 py-3 shadow-2xl hover:bg-slate-800/95 transition-all group flex items-center gap-2"
        >
          <Brain className="w-5 h-5 text-violet-400 group-hover:text-violet-300" />
          <span className="text-sm font-medium text-white">AI Coach</span>
          {unreadCount > 0 && (
            <span className="bg-violet-600 text-white text-xs rounded-full px-2 py-0.5 animate-pulse">
              {unreadCount}
            </span>
          )}
          <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-300" />
        </button>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl w-96 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-violet-400" />
                <h3 className="text-white font-semibold">AI Coach</h3>
                {unreadCount > 0 && (
                  <span className="bg-violet-600 text-white text-xs rounded-full px-2 py-0.5">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowProviderSelector(!showProviderSelector)}
                  className="text-slate-400 hover:text-slate-300 transition-colors p-1 rounded-md hover:bg-slate-700/50"
                  aria-label="Settings"
                  title="Select AI Provider"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-slate-400 hover:text-slate-300 transition-colors"
                  aria-label="Minimize AI Coach panel"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Provider Selector Dropdown */}
            {showProviderSelector && (
              <div className="mt-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                <div className="text-xs text-slate-400 mb-2 font-medium">Select AI Provider</div>
                <div className="space-y-1">
                  {AI_PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => {
                        setCoachProvider(provider.id);
                        setShowProviderSelector(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors",
                        coachProvider === provider.id
                          ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                          : "hover:bg-slate-700/50 text-slate-300"
                      )}
                    >
                      <span className="font-medium">{provider.name}</span>
                      <span className="text-slate-500">{provider.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Workflow Stats */}
          {workflowStats && (
            <div className="p-3 border-b border-slate-700/50 bg-slate-800/30">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-slate-400">Efficiency</div>
                  <div className="text-white font-semibold">{workflowStats.averageEfficiency}%</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400">Workflows</div>
                  <div className="text-white font-semibold">{workflowStats.completedWorkflows}/{workflowStats.totalWorkflows}</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-400">Trend</div>
                  <div className={cn(
                    "font-semibold",
                    workflowStats.improvementTrend === 'improving' ? 'text-green-400' :
                    workflowStats.improvementTrend === 'declining' ? 'text-red-400' :
                    'text-yellow-400'
                  )}>
                    {workflowStats.improvementTrend === 'improving' ? '↑' :
                     workflowStats.improvementTrend === 'declining' ? '↓' : '→'}
                    {' '}{workflowStats.improvementTrend}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Insights List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading && (
              <div className="text-center py-8 text-slate-400">
                <Brain className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                <p className="text-sm">Analyzing your workflow...</p>
              </div>
            )}

            {!isLoading && insights.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Sparkles className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No new insights yet.</p>
                <p className="text-xs mt-1">Keep working and I'll provide strategic advice!</p>
              </div>
            )}

            {insights.map((insight) => (
              <div
                key={insight.id}
                className={cn(
                  "rounded-lg p-3 border transition-all cursor-pointer",
                  insight.wasShown 
                    ? "border-slate-700/30 bg-slate-800/20" 
                    : "border-violet-600/30 bg-violet-900/10",
                  selectedInsight === insight.id && "ring-2 ring-violet-500/50"
                )}
                onClick={() => setSelectedInsight(selectedInsight === insight.id ? null : insight.id)}
              >
                {/* Insight Header */}
                <div className="flex items-start gap-2 mb-2">
                  <div className={cn(
                    "p-1.5 rounded-md",
                    getCategoryColor(insight.insightCategory)
                  )}>
                    {getInsightIcon(insight.insightType)}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                      {insight.title}
                      {!insight.wasShown && (
                        <span className="text-xs bg-violet-600/20 text-violet-400 px-1.5 py-0.5 rounded">
                          NEW
                        </span>
                      )}
                    </h4>
                    <span className={cn(
                      "text-xs",
                      insight.expectedImpact === 'high' ? 'text-red-400' :
                      insight.expectedImpact === 'medium' ? 'text-yellow-400' :
                      'text-slate-400'
                    )}>
                      {insight.expectedImpact} impact
                    </span>
                  </div>
                </div>

                {/* Insight Content */}
                <p className="text-xs text-slate-300 leading-relaxed">
                  {insight.description}
                </p>

                {/* Expanded Content */}
                {selectedInsight === insight.id && insight.recommendations && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-slate-400 mb-1">
                      Recommendations:
                    </div>
                    {insight.recommendations.map((rec, index) => (
                      <div
                        key={index}
                        className="bg-slate-800/50 rounded-md p-2 text-xs"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="text-white font-medium">{rec.action}</span>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            rec.difficulty === 'easy' ? 'bg-green-900/30 text-green-400' :
                            rec.difficulty === 'medium' ? 'bg-yellow-900/30 text-yellow-400' :
                            'bg-red-900/30 text-red-400'
                          )}>
                            {rec.difficulty}
                          </span>
                        </div>
                        <p className="text-slate-400 mb-2">
                          Expected: {rec.expectedImprovement}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyRecommendation(insight, index);
                          }}
                          className="w-full bg-violet-600 hover:bg-violet-700 text-white py-1.5 rounded-md transition-colors text-xs font-medium"
                        >
                          Apply This
                        </button>
                      </div>
                    ))}

                    {/* Feedback Buttons */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700/30">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFeedback(insight.id, 'positive');
                        }}
                        className="flex-1 flex items-center justify-center gap-1 bg-green-900/20 hover:bg-green-900/30 text-green-400 py-1.5 rounded-md transition-colors text-xs"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        Helpful
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFeedback(insight.id, 'negative');
                        }}
                        className="flex-1 flex items-center justify-center gap-1 bg-red-900/20 hover:bg-red-900/30 text-red-400 py-1.5 rounded-md transition-colors text-xs"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        Not Helpful
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={fetchInsights}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Refresh Insights
              </button>
              <div className="text-xs text-slate-500">
                Powered by {getProviderDisplayName(coachProvider)}
              </div>
            </div>
            <button
              onClick={() => generateInsights(coachProvider)}
              disabled={isLoading}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all",
                isLoading
                  ? "bg-slate-700/50 text-slate-400 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-700 text-white"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              {isLoading ? 'Generating...' : 'Generate New Insights'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
