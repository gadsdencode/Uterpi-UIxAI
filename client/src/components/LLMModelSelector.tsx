"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Search, 
  Filter, 
  Star, 
  StarOff, 
  Zap, 
  DollarSign, 
  Clock, 
  TrendingUp, 
  Brain, 
  Sparkles,
  ChevronDown,
  ArrowUpDown,
  Heart,
  HeartOff,
  X
} from "lucide-react";
import { LLMModel } from "@/types";
import { AzureAIService } from "@/lib/azureAI";

// Get models from current provider
const getModelsForProvider = (getAvailableModels?: () => LLMModel[]): LLMModel[] => {
  if (getAvailableModels) {
    return getAvailableModels();
  }
  // Fallback to Azure AI models
  return AzureAIService.getAvailableModels();
};

const categoryIcons = {
  text: Brain,
  code: Zap,
  multimodal: Sparkles,
  reasoning: TrendingUp
};

const tierColors = {
  free: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  pro: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  enterprise: "bg-amber-500/20 text-amber-400 border-amber-500/30"
};

interface ModelCardProps {
  model: LLMModel;
  onFavorite: (id: string) => void;
  onSelect: (model: LLMModel) => void;
  isSelected: boolean;
}

const ModelCard: React.FC<ModelCardProps> = ({ model, onFavorite, onSelect, isSelected }) => {
  const CategoryIcon = categoryIcons[model.category];
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -2, scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(model);
          }
        }}
        className={cn(
          "relative overflow-hidden border transition-all duration-300 cursor-pointer group",
          "bg-slate-900/50 backdrop-blur-xl border-slate-700/50",
          "hover:bg-slate-800/50 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/10",
          "rounded-2xl p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          isSelected 
            ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/20" 
            : ""
        )}
        onClick={() => onSelect(model)}
        aria-pressed={isSelected}
        aria-label={`Select model ${model.name}`}
      >
        {/* Favorite Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onFavorite(model.id);
                }}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 backdrop-blur-sm border border-slate-600/50 hover:bg-slate-700/80 transition-colors"
              >
                {model.isFavorite ? (
                  <Heart className="w-4 h-4 text-red-400 fill-current" />
                ) : (
                  <HeartOff className="w-4 h-4 text-slate-400" />
                )}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-800 border-slate-700">
              <p>{model.isFavorite ? "Remove from favorites" : "Add to favorites"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="p-3 rounded-xl bg-violet-500/20 border border-violet-500/30">
            <CategoryIcon className="w-6 h-6 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-white truncate">{model.name}</h3>
            <p className="text-sm text-slate-400">{model.provider}</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-300 mb-4 line-clamp-2">{model.description}</p>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-center p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                  <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <div className="text-sm font-semibold text-white">{model.performance}%</div>
                  <div className="text-xs text-slate-400">Performance</div>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700">
                <p>Model performance score</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-center p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                  <DollarSign className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                  <div className="text-sm font-semibold text-white">${model.cost}</div>
                  <div className="text-xs text-slate-400">Per 1K tokens</div>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700">
                <p>Cost per 1000 tokens</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-center p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                  <Clock className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                  <div className="text-sm font-semibold text-white">{model.latency}ms</div>
                  <div className="text-xs text-slate-400">Latency</div>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700">
                <p>Average response time</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Tags */}
        <div className="flex items-center justify-between mb-3">
          <Badge variant="outline" className="capitalize border-slate-600 text-slate-300 bg-slate-800/50">
            {model.category}
          </Badge>
          <Badge className={cn("capitalize border", tierColors[model.tier])}>
            {model.tier}
          </Badge>
        </div>

        {/* Note: Capabilities are now checked dynamically when model is selected */}

        {/* Selection Indicator */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-4 left-4 w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center"
            >
              <Star className="w-4 h-4 text-white fill-current" />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};

interface FilterControlsProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  selectedTier: string;
  onTierChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  searchTerm,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedTier,
  onTierChange,
  sortBy,
  onSortChange,
  showFavoritesOnly,
  onToggleFavorites
}) => {
  return (
    <div className="flex flex-wrap gap-4 items-center justify-between p-4 rounded-2xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
      {/* Search */}
      <div className="relative flex-1 min-w-[250px]">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
        <Input
          placeholder="Search models..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-10 rounded-xl border-slate-600 bg-slate-800/50 text-white placeholder:text-slate-400 text-sm focus:border-violet-500"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-[120px] h-10 rounded-xl border-slate-600 bg-slate-800/50 text-white text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="code">Code</SelectItem>
            <SelectItem value="multimodal">Multimodal</SelectItem>
            <SelectItem value="reasoning">Reasoning</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedTier} onValueChange={onTierChange}>
          <SelectTrigger className="w-[100px] h-10 rounded-xl border-slate-600 bg-slate-800/50 text-white text-sm">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[120px] h-10 rounded-xl border-slate-600 bg-slate-800/50 text-white text-sm">
            <ArrowUpDown className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="cost">Cost</SelectItem>
            <SelectItem value="latency">Latency</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showFavoritesOnly ? "default" : "outline"}
                onClick={onToggleFavorites}
                size="sm"
                className={cn(
                  "h-10 px-4 rounded-xl transition-colors",
                  showFavoritesOnly 
                    ? "bg-violet-600 hover:bg-violet-700 text-white" 
                    : "border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
                )}
              >
                <Star className={cn("w-3 h-3 mr-1", showFavoritesOnly && "fill-current")} />
                Favorites
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-800 border-slate-700">
              <p>{showFavoritesOnly ? "Show all models" : "Show only favorite models"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

interface LLMModalSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (model: LLMModel) => void;
  selectedModel?: LLMModel | null;
  getAvailableModels?: () => LLMModel[];
  providerLabel?: string;
}

const LLMModalSelector: React.FC<LLMModalSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  selectedModel: externalSelectedModel,
  getAvailableModels,
  providerLabel
}) => {
  const [models, setModels] = React.useState<LLMModel[]>(getModelsForProvider(getAvailableModels));
  const [selectedModel, setSelectedModel] = React.useState<LLMModel | null>(externalSelectedModel || null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState("all");
  const [selectedTier, setSelectedTier] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("performance");
  const [showFavoritesOnly, setShowFavoritesOnly] = React.useState(false);

  // Refresh model list whenever the modal opens or the provider's getter changes
  React.useEffect(() => {
    if (isOpen) {
      const next = getModelsForProvider(getAvailableModels);
      setModels(next);
      if (selectedModel && !next.find(m => m.id === selectedModel.id)) {
        setSelectedModel(null);
      }
    }
  }, [isOpen, getAvailableModels]);

  // Keep external selected model in sync for current provider
  React.useEffect(() => {
    if (externalSelectedModel) {
      const available = getModelsForProvider(getAvailableModels);
      if (available.find(m => m.id === externalSelectedModel.id)) {
        setSelectedModel(externalSelectedModel);
      } else {
        setSelectedModel(null);
      }
    }
  }, [externalSelectedModel, getAvailableModels]);

  const handleFavorite = (id: string) => {
    setModels(prev => prev.map(model => 
      model.id === id ? { ...model, isFavorite: !model.isFavorite } : model
    ));
  };

  const handleSelect = (model: LLMModel) => {
    setSelectedModel(model);
  };

  const handleConfirmSelection = () => {
    if (selectedModel) {
      onSelect(selectedModel);
      onClose();
    }
  };

  const filteredAndSortedModels = React.useMemo(() => {
    let filtered = models.filter(model => {
      const matchesSearch = model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           model.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           model.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "all" || model.category === selectedCategory;
      const matchesTier = selectedTier === "all" || model.tier === selectedTier;
      const matchesFavorites = !showFavoritesOnly || model.isFavorite;

      return matchesSearch && matchesCategory && matchesTier && matchesFavorites;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "performance":
          return b.performance - a.performance;
        case "cost":
          return a.cost - b.cost;
        case "latency":
          return a.latency - b.latency;
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [models, searchTerm, selectedCategory, selectedTier, sortBy, showFavoritesOnly]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-slate-950/95 backdrop-blur-xl border-slate-700/50 text-white p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 pb-4 border-b border-slate-700/50">
            <DialogHeader>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-violet-600 bg-clip-text text-transparent">
                  Select AI Model
                </DialogTitle>
                <DialogDescription className="text-base text-slate-300">
                  Choose from {providerLabel || 'the current provider'} models
                </DialogDescription>
              </motion.div>
            </DialogHeader>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={onClose}
                    aria-label="Close model selector"
                    className="absolute right-4 top-4 p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-800 border-slate-700">
                  <p>Close model selector</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Filter Controls */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <FilterControls
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                selectedTier={selectedTier}
                onTierChange={setSelectedTier}
                sortBy={sortBy}
                onSortChange={setSortBy}
                showFavoritesOnly={showFavoritesOnly}
                onToggleFavorites={() => setShowFavoritesOnly(!showFavoritesOnly)}
              />
            </motion.div>

            {/* Results Count */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center justify-between"
            >
              <p className="text-sm text-slate-400">
                Showing {filteredAndSortedModels.length} of {models.length} models
              </p>
              {selectedModel && (
                <Badge variant="outline" className="text-sm px-3 py-1 border-violet-500/50 text-violet-400 bg-violet-500/10">
                  Selected: {selectedModel.name}
                </Badge>
              )}
            </motion.div>

            {/* Model Grid */}
            <motion.div 
              layout
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              <AnimatePresence>
                {filteredAndSortedModels.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    onFavorite={handleFavorite}
                    onSelect={handleSelect}
                    isSelected={selectedModel?.id === model.id}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Empty State */}
            {filteredAndSortedModels.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <Search className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">No models found</h3>
                <p className="text-slate-400">Try adjusting your search criteria or filters.</p>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 pt-4 border-t border-slate-700/50 bg-slate-900/30">
            <div className="flex items-center justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 px-6"
                    >
                      Cancel
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-800 border-slate-700">
                    <p>Cancel and keep current model</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex gap-3">
                {selectedModel && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" className="border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 px-6">
                              View Details
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-slate-800 border-slate-700">
                            <p>View detailed model information</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl bg-slate-950/95 backdrop-blur-xl border-slate-700/50 text-white">
                      <DialogHeader>
                        <DialogTitle className="text-2xl text-white">{selectedModel.name}</DialogTitle>
                        <DialogDescription className="text-base text-slate-300">
                          {selectedModel.description}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-6 mt-6">
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-slate-400">Provider</label>
                            <p className="text-lg font-semibold text-white">{selectedModel.provider}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-400">Performance</label>
                            <p className="text-lg font-semibold text-white">{selectedModel.performance}%</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-400">Context Length</label>
                            <p className="text-lg font-semibold text-white">{selectedModel.contextLength.toLocaleString()} tokens</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-slate-400">Cost per 1K tokens</label>
                            <p className="text-lg font-semibold text-white">${selectedModel.cost}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-400">Latency</label>
                            <p className="text-lg font-semibold text-white">{selectedModel.latency}ms</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-400">Tier</label>
                            <Badge className={cn("capitalize border", tierColors[selectedModel.tier])}>
                              {selectedModel.tier}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleConfirmSelection}
                        disabled={!selectedModel}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-8 disabled:opacity-50"
                      >
                        Select Model
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-slate-800 border-slate-700">
                      <p>{selectedModel ? `Use ${selectedModel.name} for this conversation` : "Please select a model first"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LLMModalSelector; 