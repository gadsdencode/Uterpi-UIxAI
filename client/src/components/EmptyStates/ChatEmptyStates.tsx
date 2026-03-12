import React from 'react';
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  MessageCircle, 
  Plus, 
  Sparkles, 
  History,
  Search,
  Filter,
  Star,
  Archive
} from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface ChatEmptyStatesProps {
  onStartNewConversation?: () => void;
  onOpenFileManager?: () => void;
  onClearFilters?: () => void;
  onRefresh?: () => void;
  searchTerm?: string;
  hasFilters?: boolean;
  isSearching?: boolean;
}

export const ChatEmptyStates = {
  // Main chat area when no conversation is selected
  NoConversationSelected: ({ onStartNewConversation, onOpenFileManager }: ChatEmptyStatesProps) => (
    <div className="flex-1 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <div className="relative mb-8">
          {/* Animated background elements */}
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-blue-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="relative bg-slate-900/50 border border-slate-700/50 rounded-2xl p-8 backdrop-blur-sm">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center"
            >
              <MessageSquare className="w-8 h-8 text-white" />
            </motion.div>
            
            <h2 className="text-2xl font-bold text-white mb-3">
              Welcome to Uterpi AI
            </h2>
            <p className="text-slate-300 mb-6 leading-relaxed">
              Start a conversation with AI to explore ideas, analyze files, or get help with your projects. 
              Your conversations will be saved and accessible anytime.
            </p>
            
            <div className="space-y-3">
              <Button
                onClick={onStartNewConversation}
                className="w-full bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white border-0"
                size="lg"
              >
                <Plus className="w-5 h-5 mr-2" />
                Start New Conversation
              </Button>
              
              {onOpenFileManager && (
                <Button
                  onClick={onOpenFileManager}
                  variant="outline"
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
                  size="lg"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Upload & Analyze Files
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Quick tips */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <MessageCircle className="w-6 h-6 text-violet-400 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-white mb-1">Ask Questions</h4>
              <p className="text-xs text-slate-400">Get instant answers and explanations</p>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <Sparkles className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-white mb-1">AI Analysis</h4>
              <p className="text-xs text-slate-400">Upload files for intelligent analysis</p>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <History className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <h4 className="text-sm font-medium text-white mb-1">Save History</h4>
              <p className="text-xs text-slate-400">All conversations are preserved</p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  ),

  // Chat history sidebar when no conversations exist
  NoConversations: ({ onStartNewConversation, onRefresh }: ChatEmptyStatesProps) => (
    <EmptyState
      icon={MessageSquare}
      title="No conversations yet"
      description="Start your first conversation to begin chatting with AI. All your conversations will be saved here for easy access."
      action={{
        label: "Start Chatting",
        onClick: onStartNewConversation || (() => {})
      }}
      secondaryAction={onRefresh ? {
        label: "Refresh",
        onClick: onRefresh,
        variant: "outline"
      } : undefined}
      variant="illustrated"
      size="md"
    />
  ),

  // When a conversation has no messages
  NoMessages: () => (
    <EmptyState
      icon={MessageCircle}
      title="No messages yet"
      description="Send your first message to start this conversation."
      variant="minimal"
      size="sm"
    />
  ),

  // Search results empty state
  NoSearchResults: ({ searchTerm, hasFilters, onClearFilters }: ChatEmptyStatesProps) => (
    <EmptyState
      icon={Search}
      title="No conversations found"
      description={
        searchTerm 
          ? `No conversations match "${searchTerm}". Try different keywords or check your spelling.`
          : hasFilters
          ? "No conversations match your current filters. Try adjusting your search criteria."
          : "No conversations found. Start a new conversation to begin."
      }
      action={searchTerm || hasFilters ? {
        label: "Clear Search",
        onClick: onClearFilters || (() => {}),
        variant: "outline"
      } : undefined}
      secondaryAction={{
        label: "Start New Chat",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('startNewConversation'));
        }
      }}
      variant="minimal"
      size="md"
    />
  ),

  // Filtered results empty state
  NoFilteredResults: ({ onClearFilters }: ChatEmptyStatesProps) => (
    <EmptyState
      icon={Filter}
      title="No conversations match your filters"
      description="Try adjusting your filter criteria or clear all filters to see all conversations."
      action={{
        label: "Clear Filters",
        onClick: onClearFilters || (() => {}),
        variant: "outline"
      }}
      secondaryAction={{
        label: "View All",
        onClick: () => {
          window.dispatchEvent(new CustomEvent('clearAllFilters'));
        }
      }}
      variant="minimal"
      size="md"
    />
  ),

  // Starred conversations empty state
  NoStarredConversations: () => (
    <EmptyState
      icon={Star}
      title="No starred conversations"
      description="Star important conversations to quickly access them later. Click the star icon on any conversation to add it here."
      variant="minimal"
      size="md"
    />
  ),

  // Archived conversations empty state
  NoArchivedConversations: () => (
    <EmptyState
      icon={Archive}
      title="No archived conversations"
      description="Archived conversations will appear here. Archive conversations you want to keep but don't need regular access to."
      variant="minimal"
      size="md"
    />
  ),

  // Loading state for conversations
  LoadingConversations: () => (
    <div className="flex items-center justify-center py-12">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-8 h-8 border-2 border-slate-600 border-t-violet-500 rounded-full"
      />
      <span className="ml-3 text-slate-400">Loading conversations...</span>
    </div>
  ),

  // Error state for conversations
  ConversationsError: ({ onRefresh }: ChatEmptyStatesProps) => (
    <EmptyState
      icon={require('lucide-react').AlertCircle}
      title="Failed to load conversations"
      description="There was an error loading your conversation history. Please try again."
      action={{
        label: "Try Again",
        onClick: onRefresh || (() => {}),
        variant: "outline"
      }}
      variant="minimal"
      size="md"
    />
  )
};

export default ChatEmptyStates;
