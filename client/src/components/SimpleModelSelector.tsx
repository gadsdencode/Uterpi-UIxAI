import React from 'react';
import { ChevronDown, Sparkles, Zap, Brain, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { Badge } from './ui/badge';
import { LLMModel } from '../types';
import { cn } from '../lib/utils';

interface SimpleModelSelectorProps {
  models: LLMModel[];
  selectedModel: LLMModel | null;
  onModelSelect: (model: LLMModel) => void;
  className?: string;
  compact?: boolean;
}

const categoryIcons = {
  text: Brain,
  code: Zap,
  multimodal: Sparkles,
  reasoning: TrendingUp
};

export const SimpleModelSelector: React.FC<SimpleModelSelectorProps> = ({
  models,
  selectedModel,
  onModelSelect,
  className,
  compact = false
}) => {
  if (!models || models.length === 0) return null;

  // If only one model available, show it as a static badge
  if (models.length === 1) {
    const model = models[0];
    const Icon = categoryIcons[model.category] || Brain;
    
    if (compact) {
      return (
        <Badge 
          variant="outline" 
          className={cn(
            "text-xs h-7 px-2 border-slate-600 bg-slate-800/50",
            className
          )}
        >
          <Icon className="w-3 h-3 mr-1" />
          {model.name}
        </Badge>
      );
    }

    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-white">{model.name}</span>
        <Badge 
          variant="outline" 
          className="text-[10px] h-4 px-1 border-slate-600 text-slate-400"
        >
          {model.contextLength.toLocaleString()} tokens
        </Badge>
      </div>
    );
  }

  // Multiple models - show dropdown selector
  return (
    <Select
      value={selectedModel?.id}
      onValueChange={(value) => {
        const model = models.find(m => m.id === value);
        if (model) onModelSelect(model);
      }}
    >
      <SelectTrigger 
        className={cn(
          "border-slate-600 bg-slate-800/50 text-white hover:bg-slate-700/50",
          compact ? "h-7 text-xs" : "h-9 text-sm",
          className
        )}
      >
        <div className="flex items-center gap-2">
          {selectedModel && (
            <>
              {React.createElement(
                categoryIcons[selectedModel.category] || Brain,
                { className: compact ? "w-3 h-3" : "w-4 h-4" }
              )}
              <span className="truncate">{selectedModel.name}</span>
            </>
          )}
        </div>
      </SelectTrigger>
      
      <SelectContent className="bg-slate-900 border-slate-700">
        {models.map(model => {
          const Icon = categoryIcons[model.category] || Brain;
          return (
            <SelectItem 
              key={model.id} 
              value={model.id}
              className="text-white hover:bg-slate-800 cursor-pointer"
            >
              <div className="flex items-center justify-between w-full gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{model.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {model.contextLength.toLocaleString()} tokens
                    </span>
                  </div>
                </div>
                {model.tier && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] h-4 px-1 ml-2",
                      model.tier === 'freemium' && "border-emerald-500/30 text-emerald-400",
                      model.tier === 'pro' && "border-violet-500/30 text-violet-400",
                      model.tier === 'enterprise' && "border-amber-500/30 text-amber-400"
                    )}
                  >
                    {model.tier}
                  </Badge>
                )}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
