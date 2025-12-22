// ChatHeader.tsx - Streamlined chat header with essential controls only
// Redundant controls moved to sidebar (History, New Chat, Settings)
// Credits moved to App header

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Share2,
  MessageSquare,
  Loader2,
  FolderKanban,
  Sparkles,
  Volume2,
  Settings
} from 'lucide-react';
import { User } from '../../hooks/useAuth';
import { RippleButton, MicPermissionBadge } from './shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

// Project type for display
interface ActiveProjectInfo {
  id: number;
  name: string;
  instructions?: string | null;
}

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
  // Project state
  activeProject?: ActiveProjectInfo | null;
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
  isLoadingConversation,
  activeProject
}) => {
  return (
    <motion.header
      className="flex-shrink-0 px-4 py-3 border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-sm"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between max-w-5xl mx-auto">
        {/* Left side - Logo and context */}
        <div className="flex items-center gap-3">
          {/* Compact Uterpi Logo */}
          <div className="relative flex-shrink-0">
            <img 
              src="/images/uterpi_logo.png" 
              alt="Uterpi" 
              className="w-10 h-10 rounded-full"
            />
            <motion.div
              className="absolute inset-0 bg-violet-400/20 rounded-full blur-md"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </div>
          
          {/* Title / Conversation context */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-white">Uterpi</span>
            {currentConversationTitle ? (
              <span className="text-xs text-slate-400 truncate max-w-[200px]">
                {isLoadingConversation ? 'Loading...' : currentConversationTitle}
              </span>
            ) : (
              <span className="text-xs text-slate-500">New conversation</span>
            )}
          </div>

          {/* Active Project Badge */}
          {activeProject && (
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div 
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-violet-500/15 border border-violet-400/25 rounded-full cursor-default"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <FolderKanban className="w-3 h-3 text-violet-400" />
                  <span className="text-xs font-medium text-violet-300 max-w-[100px] truncate">
                    {activeProject.name}
                  </span>
                  {activeProject.instructions && (
                    <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  )}
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-medium">Project: {activeProject.name}</p>
                {activeProject.instructions && (
                  <p className="text-xs text-slate-400 mt-0.5">Custom AI instructions active</p>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        
        {/* Right side - Actions */}
        <div className="flex items-center gap-1.5">
          {/* Compact Credits Display */}
          {user && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-800/40 rounded-md border border-slate-700/40">
              {isFreemium && (
                <>
                  <span className="text-slate-400">Free:</span>
                  <span className={`font-medium ${
                    (messagesRemaining || 0) === 0 ? 'text-red-400' : 
                    (messagesRemaining || 0) <= 2 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {messagesRemaining || 0}
                  </span>
                  <span className="text-slate-600">|</span>
                </>
              )}
              <span className="text-slate-400">Credits:</span>
              <span className={`font-medium ${
                (creditBalance || 0) === 0 ? 'text-red-400' : 
                (creditBalance || 0) < 50 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {creditBalance?.toLocaleString() || 0}
              </span>
            </div>
          )}

          {/* Mic status */}
          {speechAvailable && (
            <div className="hidden md:block">
              <MicPermissionBadge 
                microphonePermission={microphonePermission}
                isHTTPS={isHTTPS}
              />
            </div>
          )}

          {/* Share Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <RippleButton
                onClick={onShowShareModal}
                className="p-2 bg-slate-800/40 hover:bg-slate-700/50 rounded-lg border border-slate-700/40 transition-colors"
                aria-label="Share conversation"
              >
                <Share2 className="w-4 h-4 text-slate-400" />
              </RippleButton>
            </TooltipTrigger>
            <TooltipContent>Share conversation</TooltipContent>
          </Tooltip>

          {/* Speech Settings */}
          {speechAvailable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  onClick={onShowEditModal}
                  className="p-2 bg-slate-800/40 hover:bg-slate-700/50 rounded-lg border border-slate-700/40 transition-colors"
                  aria-label="Voice settings"
                >
                  <Volume2 className="w-4 h-4 text-slate-400" />
                </RippleButton>
              </TooltipTrigger>
              <TooltipContent>Voice settings</TooltipContent>
            </Tooltip>
          )}
          
          {/* AI Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <RippleButton
                onClick={onShowEditModal}
                className="p-2 bg-slate-800/40 hover:bg-slate-700/50 rounded-lg border border-slate-700/40 transition-colors"
                aria-label="AI settings"
              >
                <Settings className="w-4 h-4 text-slate-400" />
              </RippleButton>
            </TooltipTrigger>
            <TooltipContent>AI provider settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.header>
  );
});

ChatHeader.displayName = 'ChatHeader';
