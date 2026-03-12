// MessageList.tsx - Scrollable message list with holographic bubbles
// Displays conversation messages with markdown rendering and TTS support

import React, { useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Sparkles,
  FileUp,
  Volume2,
  VolumeX,
  Cpu
} from 'lucide-react';
import { Message } from '../../types';
import { HolographicBubble, TypingIndicator, NeuralNetworkPulse } from './shared';
import { CreditLimitMessage } from '../CreditLimitMessage';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

// Source information type
interface Source {
  fileId: number;
  name: string;
  mimeType: string;
  similarity: number;
  snippet: string;
}

// SourcesList component - Shows referenced sources for AI responses
const SourcesList: React.FC<{ sources: Source[] }> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 border border-slate-700/50 rounded-lg bg-slate-900/40 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Sources</div>
      <div className="flex flex-col gap-2">
        {sources.slice(0, 8).map((s, idx) => (
          <div key={idx} className="text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-medium">{s.name}</span>
              <span className="text-slate-500">{(s.similarity * 100).toFixed(0)}%</span>
            </div>
            <div className="text-slate-400 truncate">{s.snippet}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  isGeneratingResponse: boolean;
  onSpeak: (id: string, text: string) => void;
  speakingMessageId: string | null;
  speechAvailable: boolean;
  onUpgrade: () => void;
  onPurchaseCredits: (packageId: string) => void;
  latestSources: Source[];
  greetingLoading?: boolean;
  isAIGenerated?: boolean;
  activeMessage?: string | null;
}

export const MessageList = memo<MessageListProps>(({
  messages,
  isTyping,
  isGeneratingResponse,
  onSpeak,
  speakingMessageId,
  speechAvailable,
  onUpgrade,
  onPurchaseCredits,
  latestSources,
  greetingLoading = false,
  isAIGenerated = false,
  activeMessage = null
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Show loading state for greeting generation */}
        {greetingLoading && messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="relative max-w-[80%]">
              <HolographicBubble isUser={false}>
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Generating personalized greeting...</span>
                </div>
              </HolographicBubble>
            </div>
          </motion.div>
        )}
        
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              layout
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="relative max-w-[80%]">
                {message.isCreditLimit ? (
                  <CreditLimitMessage 
                    message={message}
                    onUpgrade={onUpgrade}
                    onPurchaseCredits={onPurchaseCredits}
                  />
                ) : (
                  <HolographicBubble isUser={message.role === 'user'}>
                    <div className="space-y-2">
                      {message.role === 'assistant' ? (
                        <div className="text-sm leading-relaxed prose prose-invert max-w-none">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              pre: ({ children, ...props }) => (
                                <pre className="bg-black/70 text-white p-4 rounded-lg my-2 overflow-x-auto" {...props}>
                                  {children}
                                </pre>
                              ),
                              code: ({ className, children, ...props }: any) => {
                                const isInline = !className;
                                if (isInline) {
                                  return (
                                    <code className="bg-slate-700/50 text-violet-300 px-1 py-0.5 rounded text-xs" {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                                return (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              p: ({ children }) => (
                                <p className="text-sm leading-relaxed mb-2">{children}</p>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-disc list-inside space-y-1 text-sm">{children}</ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal list-inside space-y-1 text-sm">{children}</ol>
                              ),
                              li: ({ children }) => (
                                <li className="text-sm">{children}</li>
                              ),
                              h1: ({ children }) => (
                                <h1 className="text-lg font-bold mb-2">{children}</h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-base font-semibold mb-2">{children}</h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-sm font-semibold mb-1">{children}</h3>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-violet-500 pl-3 py-1 italic text-sm text-slate-300">
                                  {children}
                                </blockquote>
                              ),
                              a: ({ children, href, ...props }) => (
                                <a href={href} className="text-violet-400 hover:text-violet-300 underline" target="_blank" rel="noopener noreferrer" {...props}>
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      )}
                      
                      {/* Show AI-generated indicator for the first message if it was AI-generated */}
                      {message.role === 'assistant' && message.id === "1" && isAIGenerated && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Sparkles className="w-3 h-3 text-violet-400" />
                        </div>
                      )}
                      
                      {/* Attachments */}
                      {message.attachments && (
                        <div className="flex flex-wrap gap-2">
                          {message.attachments.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 px-2 py-1 bg-slate-700/50 rounded text-xs"
                            >
                              <FileUp className="w-3 h-3" />
                              {file}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Render sources for the latest assistant message */}
                      {message.role === 'assistant' && message.id === messages[messages.length - 1]?.id && latestSources.length > 0 && (
                        <SourcesList sources={latestSources} />
                      )}

                      {/* Timestamp and actions */}
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{message.timestamp.toLocaleTimeString()}</span>
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2">
                            {speechAvailable && message.content && (
                              <button
                                onClick={() => onSpeak(message.id, message.content)}
                                className="p-1 hover:bg-slate-600/50 rounded transition-colors"
                                title={speakingMessageId === message.id ? "Stop speaking" : "Read aloud"}
                              >
                                {speakingMessageId === message.id ? (
                                  <VolumeX className="w-3 h-3 text-blue-400" />
                                ) : (
                                  <Volume2 className="w-3 h-3" />
                                )}
                              </button>
                            )}
                            <div className="flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              <span>AI</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </HolographicBubble>
                )}
                
                {activeMessage === message.id && (
                  <NeuralNetworkPulse isActive />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Show thinking indicator during AI generation */}
        <AnimatePresence>
          {(isTyping || isGeneratingResponse) && (
            <TypingIndicator variant={isGeneratingResponse ? 'thinking' : 'typing'} />
          )}
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
});

MessageList.displayName = 'MessageList';

