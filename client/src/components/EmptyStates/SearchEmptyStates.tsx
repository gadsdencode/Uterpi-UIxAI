import React from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Filter, 
  X, 
  RefreshCw, 
  AlertCircle,
  Lightbulb,
  TrendingUp,
  Clock,
  Star
} from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface SearchEmptyStatesProps {
  searchTerm?: string;
  hasFilters?: boolean;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  onRefresh?: () => void;
  searchType?: 'conversations' | 'files' | 'models' | 'general';
  suggestions?: string[];
}

export const SearchEmptyStates = {
  // No search results found
  NoResults: ({ 
    searchTerm, 
    hasFilters, 
    onClearSearch, 
    onClearFilters, 
    searchType = 'general',
    suggestions = []
  }: SearchEmptyStatesProps) => {
    const getSearchTypeContext = () => {
      switch (searchType) {
        case 'conversations':
          return {
            title: 'No conversations found',
            description: searchTerm 
              ? `No conversations match "${searchTerm}". Try different keywords or check your spelling.`
              : 'No conversations match your search criteria.',
            icon: require('lucide-react').MessageSquare
          };
        case 'files':
          return {
            title: 'No files found',
            description: searchTerm 
              ? `No files match "${searchTerm}". Try different keywords or check your spelling.`
              : 'No files match your search criteria.',
            icon: require('lucide-react').FileText
          };
        case 'models':
          return {
            title: 'No models found',
            description: searchTerm 
              ? `No AI models match "${searchTerm}". Try different keywords or check your spelling.`
              : 'No models match your search criteria.',
            icon: require('lucide-react').Cpu
          };
        default:
          return {
            title: 'No results found',
            description: searchTerm 
              ? `No results match "${searchTerm}". Try different keywords or check your spelling.`
              : 'No results match your search criteria.',
            icon: Search
          };
      }
    };

    const context = getSearchTypeContext();

    return (
      <div className="text-center py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-md mx-auto"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="w-16 h-16 mx-auto mb-6 bg-slate-800/50 rounded-full flex items-center justify-center"
          >
            <context.icon className="w-8 h-8 text-slate-400" />
          </motion.div>
          
          <h3 className="text-xl font-semibold text-white mb-3">
            {context.title}
          </h3>
          
          <p className="text-slate-400 mb-6 leading-relaxed">
            {context.description}
          </p>
          
          {/* Search suggestions */}
          {suggestions.length > 0 && (
            <div className="mb-6">
              <p className="text-sm text-slate-500 mb-3">Try searching for:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.slice(0, 3).map((suggestion, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + index * 0.1 }}
                    onClick={() => {
                      // This would be handled by the parent component
                      window.dispatchEvent(new CustomEvent('searchSuggestion', { 
                        detail: { suggestion } 
                      }));
                    }}
                    className="px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 text-sm rounded-full transition-colors"
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {(searchTerm || hasFilters) && (
              <Button
                onClick={searchTerm ? onClearSearch : onClearFilters}
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                <X className="w-4 h-4 mr-2" />
                {searchTerm ? 'Clear Search' : 'Clear Filters'}
              </Button>
            )}
            
            <Button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('browseAll'));
              }}
              className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white border-0"
            >
              <Search className="w-4 h-4 mr-2" />
              Browse All
            </Button>
          </div>
        </motion.div>
      </div>
    );
  },

  // Search is too specific/filtered
  TooManyFilters: ({ onClearFilters }: SearchEmptyStatesProps) => (
    <EmptyState
      icon={Filter}
      title="Too many filters applied"
      description="Your search criteria are too specific. Try removing some filters to see more results."
      action={{
        label: "Clear Filters",
        onClick: onClearFilters || (() => {}),
        variant: "outline"
      }}
      secondaryAction={{
        label: "Reset Search",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('resetSearch'));
        }
      }}
      variant="minimal"
      size="md"
    />
  ),

  // Search error
  SearchError: ({ onRefresh }: SearchEmptyStatesProps) => (
    <EmptyState
      icon={AlertCircle}
      title="Search failed"
      description="There was an error performing your search. Please try again."
      action={{
        label: "Try Again",
        onClick: onRefresh || (() => {}),
        variant: "outline"
      }}
      variant="minimal"
      size="md"
    />
  ),

  // Empty search query
  EmptyQuery: ({ searchType = 'general' }: SearchEmptyStatesProps) => {
    const getSearchTypeContext = () => {
      switch (searchType) {
        case 'conversations':
          return {
            title: 'Search conversations',
            description: 'Enter keywords to find specific conversations, topics, or messages.',
            placeholder: 'Search conversations...',
            icon: require('lucide-react').MessageSquare
          };
        case 'files':
          return {
            title: 'Search files',
            description: 'Enter keywords to find files by name, content, or tags.',
            placeholder: 'Search files...',
            icon: require('lucide-react').FileText
          };
        case 'models':
          return {
            title: 'Search AI models',
            description: 'Enter keywords to find AI models by name, provider, or capabilities.',
            placeholder: 'Search models...',
            icon: require('lucide-react').Cpu
          };
        default:
          return {
            title: 'Search',
            description: 'Enter keywords to find what you\'re looking for.',
            placeholder: 'Search...',
            icon: Search
          };
      }
    };

    const context = getSearchTypeContext();

    return (
      <div className="text-center py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-md mx-auto"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="w-16 h-16 mx-auto mb-6 bg-slate-800/50 rounded-full flex items-center justify-center"
          >
            <context.icon className="w-8 h-8 text-slate-400" />
          </motion.div>
          
          <h3 className="text-xl font-semibold text-white mb-3">
            {context.title}
          </h3>
          
          <p className="text-slate-400 mb-6">
            {context.description}
          </p>
          
          {/* Search tips */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <Card className="bg-slate-800/30 border-slate-700/50">
              <CardContent className="p-4 text-center">
                <Lightbulb className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                <h4 className="text-sm font-medium text-white mb-1">Search Tips</h4>
                <p className="text-xs text-slate-400">Use keywords and phrases</p>
              </CardContent>
            </Card>
            
            <Card className="bg-slate-800/30 border-slate-700/50">
              <CardContent className="p-4 text-center">
                <Filter className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                <h4 className="text-sm font-medium text-white mb-1">Use Filters</h4>
                <p className="text-xs text-slate-400">Narrow down results</p>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>
    );
  },

  // Popular searches
  PopularSearches: ({ 
    popularSearches = [],
    onSearchSelect 
  }: SearchEmptyStatesProps & { 
    popularSearches?: string[];
    onSearchSelect?: (search: string) => void;
  }) => (
    <div className="text-center py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-lg mx-auto"
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="w-16 h-16 mx-auto mb-6 bg-slate-800/50 rounded-full flex items-center justify-center"
        >
          <TrendingUp className="w-8 h-8 text-slate-400" />
        </motion.div>
        
        <h3 className="text-xl font-semibold text-white mb-3">
          Popular Searches
        </h3>
        
        <p className="text-slate-400 mb-6">
          Try one of these popular searches to get started.
        </p>
        
        {popularSearches.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {popularSearches.map((search, index) => (
              <motion.button
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                onClick={() => onSearchSelect?.(search)}
                className="p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-left transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 group-hover:text-white transition-colors">
                    {search}
                  </span>
                  <Search className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  ),

  // Recent searches
  RecentSearches: ({ 
    recentSearches = [],
    onSearchSelect,
    onClearRecent 
  }: SearchEmptyStatesProps & { 
    recentSearches?: string[];
    onSearchSelect?: (search: string) => void;
    onClearRecent?: () => void;
  }) => (
    <div className="text-center py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-lg mx-auto"
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="w-16 h-16 mx-auto mb-6 bg-slate-800/50 rounded-full flex items-center justify-center"
        >
          <Clock className="w-8 h-8 text-slate-400" />
        </motion.div>
        
        <h3 className="text-xl font-semibold text-white mb-3">
          Recent Searches
        </h3>
        
        <p className="text-slate-400 mb-6">
          Continue where you left off with your recent searches.
        </p>
        
        {recentSearches.length > 0 ? (
          <div className="space-y-2">
            {recentSearches.slice(0, 5).map((search, index) => (
              <motion.button
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                onClick={() => onSearchSelect?.(search)}
                className="w-full p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-left transition-colors group flex items-center justify-between"
              >
                <span className="text-slate-300 group-hover:text-white transition-colors">
                  {search}
                </span>
                <Search className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" />
              </motion.button>
            ))}
            
            {onClearRecent && (
              <button
                onClick={onClearRecent}
                className="text-sm text-slate-500 hover:text-slate-400 transition-colors mt-4"
              >
                Clear recent searches
              </button>
            )}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">
            No recent searches yet. Start searching to see your history here.
          </p>
        )}
      </motion.div>
    </div>
  )
};

export default SearchEmptyStates;
