"use client";

// ChatView.tsx - Refactored main chat interface
// Uses useChat hook for business logic and decomposed UI components

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Download,
  Copy,
  ExternalLink,
  Loader2
} from "lucide-react";
import { CommandSuggestion } from "../types";
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { SYSTEM_MESSAGE_PRESETS } from "../hooks/useAzureAI";
import { useSnackbar } from './SnackbarProvider';
import { toast } from "sonner";
import { navigateTo } from './Router';
import { 
  downloadTranscript, 
  copyTranscriptToClipboard, 
  shareTranscript, 
  isWebShareSupported 
} from '../lib/transcriptUtils';

// Import decomposed components
import {
  Visualizations,
  MessageList,
  InputArea,
  ChatHeader,
  RippleButton,
  OrigamiModal
} from './chat';

// Import modals
import { SystemMessageSelector } from './SystemMessageSelector';
import CloneUIModal from './CloneUIModal';
import CreatePageModal from './CreatePageModal';
import ImproveModal from './ImproveModal';
import AnalyzeModal from './AnalyzeModal';
import { FileManager } from './FileManager';
import { AIProviderQuickSelector } from './AIProviderQuickSelector';
import ChatHistory from './ChatHistory';
import { SpeechSettings } from './SpeechSettings';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const FuturisticAIChat: React.FC = () => {
  const { user } = useAuth();
  const snackbar = useSnackbar();
  
  // Use the consolidated chat hook
  const chat = useChat({ user });
  
  // Modal states (kept in ChatView as they are global layout concerns)
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSystemMessageModal, setShowSystemMessageModal] = useState(false);
  const [showCloneUIModal, setShowCloneUIModal] = useState(false);
  const [showCreatePageModal, setShowCreatePageModal] = useState(false);
  const [showImproveModal, setShowImproveModal] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [showFileManager, setShowFileManager] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showSpeechSettings, setShowSpeechSettings] = useState(false);

  // Keyboard shortcuts: New Chat (Ctrl/Cmd+N)
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        chat.startNewConversation();
        snackbar.show("Started new conversation!", "success");
      }
    };

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [chat, snackbar]);

  // Handle upgrade to Pro subscription
  const handleUpgradeToPro = useCallback(async () => {
    if (!user) {
      navigateTo('/login');
      return;
    }

    try {
      const response = await fetch('/api/checkout/subscription', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier: 'pro',
          interval: 'monthly',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error upgrading to Pro:', error);
      navigateTo('/pricing');
    }
  }, [user]);

  // Handle purchase credits
  const handlePurchaseCredits = useCallback(async (packageId: string) => {
    if (!user) {
      navigateTo('/login');
      return;
    }

    try {
      const response = await fetch('/api/checkout/credits', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error purchasing credits:', error);
      navigateTo('/pricing');
    }
  }, [user]);

  // Handle command selection from InputArea
  const handleCommandSelect = useCallback((command: CommandSuggestion) => {
    chat.trackAction('use_command', { command: command.prefix });
    
    switch (command.prefix) {
      case "/clone":
        setShowCloneUIModal(true);
        break;
      case "/page":
        setShowCreatePageModal(true);
        break;
      case "/improve":
        setShowImproveModal(true);
        break;
      case "/analyze":
        setShowAnalyzeModal(true);
        break;
      default:
        chat.setInput(command.prefix + " ");
    }
  }, [chat]);

  // Transcript handling functions
  const handleDownloadTranscript = useCallback(async () => {
    try {
      downloadTranscript(chat.messages, true);
      snackbar.show('Transcript downloaded successfully!', 'success');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download transcript');
    }
  }, [chat.messages, snackbar]);

  const handleCopyTranscript = useCallback(async () => {
    try {
      await copyTranscriptToClipboard(chat.messages, true);
      snackbar.show('Transcript copied to clipboard!', 'success');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy transcript');
    }
  }, [chat.messages, snackbar]);

  const handleShareTranscript = useCallback(async () => {
    try {
      const result = await shareTranscript(chat.messages, true);
      if (result.method === 'share') {
        snackbar.show('Transcript shared successfully!', 'success');
      } else {
        snackbar.show('Transcript copied to clipboard for sharing!', 'success');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to share transcript');
    }
  }, [chat.messages, snackbar]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
        {/* Background Effects */}
        <Visualizations />

        {/* Main Content */}
        <div className="relative z-10 flex flex-col h-screen">
          {/* Header */}
          <ChatHeader
            user={user}
            creditBalance={chat.creditBalance}
            isFreemium={chat.isFreemium}
            messagesRemaining={chat.messagesRemaining}
            onShowChatHistory={() => setShowChatHistory(true)}
            onNewChat={chat.startNewConversation}
            onShowShareModal={() => setShowShareModal(true)}
            onShowEditModal={() => setShowEditModal(true)}
            onCreditPurchaseComplete={chat.fetchCreditStatus}
            speechAvailable={chat.speechAvailable}
            microphonePermission={chat.microphonePermission}
            isHTTPS={chat.isHTTPS}
            currentConversationTitle={chat.currentConversationTitle}
            isLoadingConversation={chat.isLoadingConversation}
          />

          {/* Messages */}
          <MessageList
            messages={chat.messages}
            isTyping={chat.isTyping}
            isGeneratingResponse={chat.isGeneratingResponse}
            onSpeak={chat.handleSpeak}
            speakingMessageId={chat.speakingMessageId}
            speechAvailable={chat.speechAvailable}
            onUpgrade={handleUpgradeToPro}
            onPurchaseCredits={handlePurchaseCredits}
            latestSources={chat.latestSources}
            greetingLoading={chat.greetingLoading}
            isAIGenerated={chat.isAIGenerated}
          />

          {/* Input Area */}
          <InputArea
            input={chat.input}
            setInput={chat.setInput}
            handleSend={chat.handleSend}
            isLoading={chat.isLoading}
            attachments={chat.attachments}
            onRemoveAttachment={chat.removeAttachment}
            isListening={chat.isListening}
            onVoiceInput={chat.handleVoiceInput}
            onCommandSelect={handleCommandSelect}
            speechAvailable={chat.speechAvailable}
            isHTTPS={chat.isHTTPS}
            microphonePermission={chat.microphonePermission}
            speechError={chat.speechError}
            error={chat.error}
            clearError={chat.clearError}
            onShowSystemMessage={() => setShowSystemMessageModal(true)}
            onShowFileManager={() => setShowFileManager(true)}
            onShowSpeechSettings={() => setShowSpeechSettings(true)}
            currentProvider={chat.currentProvider}
            getServiceStatus={chat.getServiceStatus}
            checkProvider={chat.checkProvider}
            modelCapabilities={chat.modelCapabilities}
            isLoadingCapabilities={chat.isLoadingCapabilities}
            selectedLLMModel={chat.selectedLLMModel}
            currentModel={chat.currentModel}
          />
        </div>

        {/* Modals */}
        <OrigamiModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title="Share Conversation"
        >
          <div className="space-y-6">
            <div>
              <p className="text-slate-300 mb-4">Export and share your chat transcript</p>
              
              {/* Download Transcript */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-200">Download Transcript</h4>
                <RippleButton
                  onClick={handleDownloadTranscript}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 rounded-lg text-white transition-colors"
                  aria-label="Download chat transcript as text file"
                >
                  <Download className="w-4 h-4" />
                  Download as .txt file
                </RippleButton>
                <p className="text-xs text-slate-400">
                  Downloads a formatted text file with your complete conversation
                </p>
              </div>

              {/* Share Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-200">Share Options</h4>
                <div className="grid grid-cols-1 gap-2">
                  {isWebShareSupported() && (
                    <RippleButton
                      onClick={handleShareTranscript}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-violet-600/80 hover:bg-violet-600 border border-violet-500/50 rounded-lg text-white transition-colors"
                      aria-label="Share transcript using system share dialog"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Share Transcript
                    </RippleButton>
                  )}
                  <RippleButton
                    onClick={handleCopyTranscript}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 rounded-lg text-white transition-colors"
                    aria-label="Copy transcript to clipboard"
                  >
                    <Copy className="w-4 h-4" />
                    Copy to Clipboard
                  </RippleButton>
                </div>
                <p className="text-xs text-slate-400">
                  {isWebShareSupported() 
                    ? "Use your device's native sharing options or copy to clipboard"
                    : "Copy the transcript text to share via your preferred method"
                  }
                </p>
              </div>
            </div>
          </div>
        </OrigamiModal>

        <OrigamiModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Uterpi Settings & Status"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Streaming Mode
              </label>
              <div className="flex items-center gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RippleButton
                      onClick={() => chat.setEnableStreaming(!chat.enableStreaming)}
                      className={`p-2 rounded-lg transition-colors ${
                        chat.enableStreaming 
                          ? "bg-violet-600 text-white" 
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {chat.enableStreaming ? "Enabled" : "Disabled"}
                    </RippleButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{chat.enableStreaming ? "Disable real-time streaming" : "Enable real-time streaming"}</p>
                  </TooltipContent>
                </Tooltip>
                <span className="text-sm text-slate-400">
                  {chat.enableStreaming ? "Real-time responses" : "Wait for complete response"}
                </span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Azure AI Status
              </label>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${chat.error ? "bg-red-500" : "bg-green-500"}`} />
                <span className="text-sm text-slate-300">
                  {chat.error ? "Configuration Error" : "Connected"}
                </span>
              </div>
              {chat.error && (
                <p className="text-xs text-red-400 mt-1">
                  Check your .env file for proper Azure AI configuration
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Model Selection
              </label>
              <div className="p-3 bg-slate-800 rounded-lg">
                <AIProviderQuickSelector />
              </div>
              <div className="mt-2">
                <p className="text-xs text-slate-400">
                  AzureAI API: {import.meta.env.VITE_AZURE_AI_ENDPOINT ? "Configured" : "Not configured"}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
              Uterpi Terms & Conditions
              </label>
              <div className="text-xs text-slate-400 space-y-1 max-h-32 overflow-y-auto">
                <p className="text-sm font-thin text-slate-300 mb-2 text-center">By using Uterpi, you agree to the following terms & conditions:</p>
                <p>1. Uterpi is an ongoing project; always check AI responses for accuracy.</p>
                <p>2. Uterpi is not responsible for any damage caused by the use of Uterpi.</p>
                <p>3. Uterpi is not responsible for any data loss or corruption caused by the use of Uterpi.</p>
                <p>4. Uterpi is not responsible for any legal issues caused by the use of Uterpi.</p>
                <p>5. Uterpi is not responsible for any ethical issues caused by the use of Uterpi.</p>
                <p>6. Uterpi is not responsible for any issues caused by the use of Uterpi.</p>
              </div>
            </div>
          </div>
        </OrigamiModal>

        {/* System Message Modal */}
        <AnimatePresence>
          {showSystemMessageModal && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowSystemMessageModal(false)}
              />
              <motion.div
                className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                initial={{ scale: 0, rotateX: -90 }}
                animate={{ scale: 1, rotateX: 0 }}
                exit={{ scale: 0, rotateX: 90 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-white">AI Personality & Style</h3>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <RippleButton
                        onClick={() => setShowSystemMessageModal(false)}
                        className="p-2 text-slate-400 hover:text-white rounded-lg"
                      >
                        <X className="w-5 h-5" />
                      </RippleButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Close personality settings</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                <div className="space-y-6">
                  <SystemMessageSelector
                    selectedPreset={chat.selectedSystemPreset}
                    customMessage={chat.customSystemMessage}
                    onPresetChange={chat.handleSystemPresetChange}
                  />
                  
                  {chat.selectedSystemPreset === "custom" && (
                    <div className="space-y-3 p-4 bg-slate-800/30 backdrop-blur-sm rounded-lg border border-slate-600/50">
                      <label className="block text-sm font-medium text-white">
                        Custom System Message
                      </label>
                      <textarea
                        value={chat.customSystemMessage}
                        onChange={(e) => chat.handleSystemPresetChange('custom', e.target.value)}
                        placeholder="Enter your custom system message..."
                        className="w-full h-32 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  )}
                  
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-600">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <RippleButton
                          onClick={() => setShowSystemMessageModal(false)}
                          className="px-6 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-white font-medium"
                        >
                          Apply Settings
                        </RippleButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Apply personality changes and close</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Enhanced Feature Modals */}
        <CloneUIModal 
          isOpen={showCloneUIModal} 
          onClose={() => setShowCloneUIModal(false)} 
        />
        
        <CreatePageModal 
          isOpen={showCreatePageModal} 
          onClose={() => setShowCreatePageModal(false)} 
        />
        
        <ImproveModal 
          isOpen={showImproveModal} 
          onClose={() => setShowImproveModal(false)} 
        />
        
        <AnalyzeModal 
          isOpen={showAnalyzeModal} 
          onClose={() => setShowAnalyzeModal(false)} 
        />

        {/* File Manager Modal */}
        <AnimatePresence>
          {showFileManager && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowFileManager(false)}
              />
              
              <motion.div
                className="relative bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
                  <h2 className="text-2xl font-bold text-white">File Manager</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowFileManager(false)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        aria-label="Close File Manager"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Close file manager</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="p-6 max-h-[calc(90vh-120px)] overflow-auto">
                  <FileManager 
                    onFileSelect={(file) => {
                      chat.addAttachment(file.name, file.id);
                      setShowFileManager(false);
                      snackbar.show(`Attached "${file.name}"`, "success");
                    }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat History Modal */}
        <ChatHistory
          isOpen={showChatHistory}
          onClose={() => setShowChatHistory(false)}
          onSelectConversation={async (conversation) => {
            try {
              await chat.loadConversation(conversation.id, conversation.title || undefined);
              setShowChatHistory(false);
              snackbar.show(`Loaded conversation: ${conversation.title || 'Untitled'}`, "success");
            } catch (error) {
              console.error('Failed to load conversation:', error);
            }
          }}
        />

        {/* Speech Settings Modal */}
        <SpeechSettings
          isOpen={showSpeechSettings}
          onClose={() => setShowSpeechSettings(false)}
        />

      </div>
    </TooltipProvider>
  );
};

export default FuturisticAIChat;
