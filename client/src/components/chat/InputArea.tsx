// InputArea.tsx - Chat input area with command suggestions and voice input
// Contains textarea, action buttons, and command panel

import React, { useRef, useEffect, memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Command,
  Sparkles,
  ImageIcon,
  MonitorIcon,
  X,
  Loader2,
  Brain,
  AlertCircle,
  Files,
  Mic,
  MicOff
} from 'lucide-react';
import { CommandSuggestion, ModelCapabilities } from '../../types';
import { RippleButton } from './shared';
import { AIProviderQuickSelector } from '../AIProviderQuickSelector';
import { ServiceStatusIndicator } from '../ServiceStatusIndicator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AIProvider } from '../../hooks/useAIProvider';

// Command suggestions data
const commandSuggestions: CommandSuggestion[] = [
  {
    icon: <ImageIcon className="w-4 h-4" />,
    label: "Clone UI",
    description: "Generate a UI from a screenshot",
    prefix: "/clone"
  },
  {
    icon: <MonitorIcon className="w-4 h-4" />,
    label: "Create Page",
    description: "Generate a new web page",
    prefix: "/page"
  },
  {
    icon: <Sparkles className="w-4 h-4" />,
    label: "Improve",
    description: "Improve existing UI design",
    prefix: "/improve"
  },
  {
    icon: <Brain className="w-4 h-4" />,
    label: "Uterpi System Status",
    description: "Uterpi system reports and analysis",
    prefix: "/analyze"
  }
];

// Helper function to check if a command is available based on dynamic capabilities
const isCommandAvailable = (command: string, capabilities: ModelCapabilities | null): boolean => {
  if (!capabilities) {
    return false;
  }

  switch (command) {
    case "/clone":
      return capabilities.supportsVision === true;
    case "/page":
      return capabilities.supportsCodeGeneration === true;
    case "/improve":
      return capabilities.supportsCodeGeneration === true;
    case "/analyze":
      return capabilities.supportsAnalysis === true;
    default:
      return true;
  }
};

export interface InputAreaProps {
  input: string;
  setInput: (val: string) => void;
  handleManualInput: (val: string) => void; // Use for keyboard input to prevent transcript overwrite
  handleSend: () => void;
  isLoading: boolean;
  attachments: string[];
  onRemoveAttachment: (index: number) => void;
  isListening: boolean;
  onVoiceInput: () => void;
  onCommandSelect: (cmd: CommandSuggestion) => void;
  speechAvailable: boolean;
  isHTTPS: boolean;
  microphonePermission: PermissionState | 'unsupported';
  speechError: string | null;
  error: string | null;
  clearError: () => void;
  // Modal triggers
  onShowSystemMessage: () => void;
  onShowFileManager: () => void;
  onShowSpeechSettings: () => void;
  // AI Provider state
  currentProvider: AIProvider;
  getServiceStatus: (provider: AIProvider) => any;
  checkProvider: (provider: AIProvider) => void;
  modelCapabilities: ModelCapabilities | null;
  isLoadingCapabilities: boolean;
  selectedLLMModel: any;
  currentModel: string | null;
}

export const InputArea = memo<InputAreaProps>(({
  input,
  setInput,
  handleManualInput,
  handleSend,
  isLoading,
  attachments,
  onRemoveAttachment,
  isListening,
  onVoiceInput,
  onCommandSelect,
  speechAvailable,
  isHTTPS,
  microphonePermission,
  speechError,
  error,
  clearError,
  onShowSystemMessage,
  onShowFileManager,
  onShowSpeechSettings,
  currentProvider,
  getServiceStatus,
  checkProvider,
  modelCapabilities,
  isLoadingCapabilities,
  selectedLLMModel,
  currentModel
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showCommands, setShowCommands] = useState(false);

  // Show/hide command suggestions based on input
  useEffect(() => {
    if (input.startsWith('/')) {
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  }, [input]);

  // Handle key press for sending messages
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle command selection
  const selectCommand = (command: CommandSuggestion) => {
    setShowCommands(false);
    onCommandSelect(command);
  };

  // Get required capability text
  const getRequiredCapability = (prefix: string) => {
    switch (prefix) {
      case "/clone": return "vision";
      case "/page": return "code generation";
      case "/improve": return "code generation";
      case "/analyze": return "analysis";
      default: return "unknown";
    }
  };

  return (
    <motion.div
      className="p-4 sm:p-6 border-t border-slate-800/50 backdrop-blur-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Command Suggestions */}
        <AnimatePresence>
          {showCommands && (
            <motion.div
              className="mb-4 p-4 bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-700/50"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="grid grid-cols-2 gap-2">
                {commandSuggestions.map((command) => {
                  const isAvailable = isCommandAvailable(command.prefix, modelCapabilities);
                  const isLoading = isLoadingCapabilities;
                  const buttonContent = (
                    <RippleButton
                      key={command.prefix}
                      onClick={() => isAvailable && !isLoading && selectCommand(command)}
                      disabled={!isAvailable || isLoading}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200 ${
                        isAvailable && !isLoading
                          ? "bg-slate-800/50 hover:bg-slate-700/50 border-slate-700/30 cursor-pointer"
                          : "bg-slate-900/30 border-slate-800/30 cursor-not-allowed opacity-50"
                      }`}
                    >
                      <div className={`${isAvailable && !isLoading ? "text-violet-400" : "text-slate-500"}`}>
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : command.icon}
                      </div>
                      <div>
                        <div className={`text-sm font-medium ${isAvailable && !isLoading ? "text-white" : "text-slate-500"}`}>
                          {command.label}
                        </div>
                        <div className={`text-xs ${isAvailable && !isLoading ? "text-slate-400" : "text-slate-600"}`}>
                          {isLoading 
                            ? "Checking capabilities..." 
                            : isAvailable 
                              ? command.description 
                              : "Not available with current model"
                          }
                        </div>
                      </div>
                    </RippleButton>
                  );

                  if (!isAvailable && !isLoading) {
                    return (
                      <TooltipProvider key={command.prefix}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {buttonContent}
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-slate-800 border-slate-700">
                            <p className="text-sm">
                              This feature requires {getRequiredCapability(command.prefix)} capabilities.
                              <br />
                              Current model: <span className="font-medium">{selectedLLMModel?.name || currentModel}</span>
                              <br />
                              Try switching to a model with {getRequiredCapability(command.prefix)} support.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }

                  return (
                    <TooltipProvider key={command.prefix}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {buttonContent}
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-slate-800 border-slate-700">
                          <p className="text-sm">
                            {command.description}
                            <br />
                            <span className="text-violet-400 font-medium">Click to use {command.prefix}</span>
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachments */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              className="mb-4 flex flex-wrap gap-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {attachments.map((file, index) => (
                <motion.div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Files className="w-4 h-4 text-violet-400" />
                  <span className="text-sm">{file}</span>
                  <RippleButton
                    onClick={() => onRemoveAttachment(index)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </RippleButton>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Display */}
        {error && !error.includes('Subscription error:') && (
          <motion.div
            className="mb-4 p-4 bg-red-900/20 backdrop-blur-xl rounded-xl border border-red-500/30"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <div className="flex-1">
                <p className="text-sm text-red-200">{error}</p>
              </div>
              <RippleButton
                onClick={clearError}
                className="p-1 text-red-400 hover:text-red-200"
              >
                <X className="w-4 h-4" />
              </RippleButton>
            </div>
          </motion.div>
        )}

        {/* Input */}
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 p-4 bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
            {/* Action Buttons Row - Mobile: Top row, Desktop: Left side */}
            <div className="flex gap-2 items-center justify-start pb-2 sm:pb-0">
              {/* Quick Provider & Model Selector */}
              <div className="flex-shrink-0">
                <AIProviderQuickSelector />
              </div>
              
              {/* Service Status Indicator */}
              <div className="flex-shrink-0">
                <ServiceStatusIndicator
                  provider={currentProvider}
                  status={getServiceStatus(currentProvider)}
                  onRefresh={() => {
                    checkProvider(currentProvider);
                  }}
                  compact
                />
              </div>
              
              {/* Speech Settings Button */}
              {speechAvailable && (
                <>
                  <div className="w-px h-6 sm:h-8 bg-slate-700 flex-shrink-0" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <RippleButton
                        onClick={onShowSpeechSettings}
                        className="p-2 text-slate-400 hover:text-violet-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                        aria-label="Speech settings"
                      >
                        <Mic className="w-4 h-4" />
                      </RippleButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Speech settings & testing</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              
              <div className="w-px h-6 sm:h-8 bg-slate-700 flex-shrink-0" />
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={() => setShowCommands(!showCommands)}
                    className="p-2 text-slate-400 hover:text-violet-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                    aria-label="Toggle quick commands"
                  >
                    <Command className="w-4 h-4 sm:w-5 sm:h-5" />
                  </RippleButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Quick commands & shortcuts</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={onShowSystemMessage}
                    className="p-2 text-slate-400 hover:text-violet-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                    aria-label="Change AI personality"
                  >
                    <Brain className="w-4 h-4 sm:w-5 sm:h-5" />
                  </RippleButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Change AI personality & style</p>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={onShowFileManager}
                    className="p-2 text-slate-400 hover:text-violet-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0"
                    aria-label="Open file manager"
                  >
                    <Files className="w-4 h-4 sm:w-5 sm:h-5" />
                  </RippleButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Manage files & uploads</p>
                </TooltipContent>
              </Tooltip>
            </div>
            
            {/* Input Row - Mobile: Bottom row, Desktop: Center + Right */}
            <div className="flex items-end gap-3 flex-1">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => handleManualInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message or use / for commands..."
                  className="w-full bg-transparent text-white placeholder-slate-400 resize-none focus:outline-none min-h-[40px] max-h-32"
                  rows={1}
                  disabled={isLoading}
                />
              </div>
              
              {/* Voice Input Button */}
              {speechAvailable && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RippleButton
                      onClick={onVoiceInput}
                      className={`p-2 ${isListening ? 'text-red-400 animate-pulse' : 'text-slate-400 hover:text-violet-400'} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0`}
                      aria-label={isListening ? "Stop recording" : "Start voice input"}
                    >
                      {isListening ? (
                        <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </RippleButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {isListening ? "Stop recording" : "Start voice input"}
                      {!isHTTPS && microphonePermission !== 'granted' && (
                        <span className="block text-xs text-yellow-400 mt-1">
                          ⚠️ HTTPS required for microphone access
                        </span>
                      )}
                      {speechError && speechError.includes('HTTPS') && (
                        <span className="block text-xs text-red-400 mt-1">
                          🔒 {speechError}
                        </span>
                      )}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={handleSend}
                    disabled={(!input.trim() && attachments.length === 0) || isLoading}
                    className="p-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-xl transition-all duration-200 flex-shrink-0"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </RippleButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isLoading ? "AI is thinking..." : "Send message (Enter)"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

InputArea.displayName = 'InputArea';

