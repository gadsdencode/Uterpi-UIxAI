// ChatHeader.tsx - Chat header with logo, credits, and action buttons
// Contains navigation controls and status indicators

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Share2,
  Settings,
  MessageSquare,
  Loader2,
  Volume2
} from 'lucide-react';
import { User } from '../../hooks/useAuth';
import { RippleButton, MicPermissionBadge } from './shared';
import { AICreditsQuickPurchase } from '../AICreditsQuickPurchase';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export interface ChatHeaderProps {
  user: User | null;
  creditBalance: number | null;
  isFreemium: boolean;
  messagesRemaining: number | null;
  onShowChatHistory: () => void;
  onNewChat: () => void;
  onShowShareModal: () => void;
  onShowEditModal: () => void;
  onCreditPurchaseComplete: () => void;
  speechAvailable: boolean;
  microphonePermission: PermissionState | 'unsupported';
  isHTTPS: boolean;
  // Conversation state
  currentConversationTitle: string | null;
  isLoadingConversation: boolean;
}

export const ChatHeader = memo<ChatHeaderProps>(({
  user,
  creditBalance,
  isFreemium,
  messagesRemaining,
  onShowChatHistory,
  onNewChat,
  onShowShareModal,
  onShowEditModal,
  onCreditPurchaseComplete,
  speechAvailable,
  microphonePermission,
  isHTTPS,
  currentConversationTitle,
  isLoadingConversation
}) => {
  return (
    <>
      <motion.header
        className="p-4 sm:p-6 border-b border-slate-800/50 backdrop-blur-xl"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src="/images/uterpi_logo.png" 
                alt="Uterpi Logo" 
                className="w-16 h-16 sm:w-24 sm:h-24 rounded-full"
              />
              <motion.div
                className="absolute inset-0 bg-violet-400/20 rounded-full blur-lg"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Credit Status Indicator */}
            {user && (
              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50 flex-shrink-0">
                {isFreemium ? (
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-300 hidden sm:inline">Free:</span>
                      <span className="text-slate-300 sm:hidden">F:</span>
                      <span className={`font-medium ${
                        (messagesRemaining || 0) === 0 
                          ? 'text-red-400' 
                          : (messagesRemaining || 0) <= 2 
                            ? 'text-amber-400' 
                            : 'text-green-400'
                      }`}>
                        {messagesRemaining || 0}
                      </span>
                    </div>
                    <div className="h-3 sm:h-4 w-px bg-slate-600"></div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-300 hidden sm:inline">Credits:</span>
                      <span className="text-slate-300 sm:hidden">C:</span>
                      <span className={`font-medium ${(creditBalance || 0) === 0 ? 'text-red-400' : (creditBalance || 0) < 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {creditBalance || 0}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                    <span className="text-slate-300 hidden sm:inline">Credits:</span>
                    <span className="text-slate-300 sm:hidden">C:</span>
                    <span className={`font-medium ${(creditBalance || 0) === 0 ? 'text-red-400' : (creditBalance || 0) < 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {creditBalance || 0}
                    </span>
                  </div>
                )}
                <AICreditsQuickPurchase 
                  currentBalance={creditBalance || 0}
                  isCompact={true}
                  onPurchaseComplete={onCreditPurchaseComplete}
                />
              </div>
            )}
            
            {/* Chat History */}
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  onClick={onShowChatHistory}
                  className="px-2 sm:px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 text-xs sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                  aria-label="Chat History"
                >
                  <span className="hidden sm:inline">History</span>
                  <MessageSquare className="w-4 h-4 sm:hidden" />
                </RippleButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>View chat history</p>
              </TooltipContent>
            </Tooltip>

            {/* New Chat */}
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  onClick={onNewChat}
                  className="px-2 sm:px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 text-xs sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                  aria-label="New Chat (Ctrl+N)"
                >
                  <span className="hidden sm:inline">New Chat</span>
                  <Plus className="w-4 h-4 sm:hidden" />
                </RippleButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>Start a new chat (Ctrl/Cmd + N)</p>
              </TooltipContent>
            </Tooltip>

            {/* Share Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  onClick={onShowShareModal}
                  className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                  aria-label="Share or export conversation"
                >
                  <Share2 className="w-3 h-3 sm:w-4 sm:h-4" />
                </RippleButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>Share or export conversation</p>
              </TooltipContent>
            </Tooltip>
            
            {/* Mic status indicator and Speech Settings */}
            {speechAvailable && (
              <div className="hidden sm:flex items-center gap-2">
                <MicPermissionBadge 
                  microphonePermission={microphonePermission}
                  isHTTPS={isHTTPS}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RippleButton
                      onClick={onShowEditModal}
                      className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                      aria-label="Speech settings"
                    >
                      <Volume2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    </RippleButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Speech settings</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
            
            {/* Settings Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  onClick={onShowEditModal}
                  className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                  aria-label="Open AI provider settings"
                >
                  <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
                </RippleButton>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI provider settings</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </motion.header>

      {/* Conversation Title Indicator */}
      {(currentConversationTitle || isLoadingConversation) && (
        <motion.div
          className="px-4 sm:px-6 py-2 border-b border-slate-800/30 bg-slate-900/20"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              {isLoadingConversation ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading conversation...</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>Conversation: {currentConversationTitle}</span>
                  <button
                    onClick={onNewChat}
                    className="ml-auto text-xs text-slate-400 hover:text-white underline"
                  >
                    Start New Chat
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
});

ChatHeader.displayName = 'ChatHeader';

