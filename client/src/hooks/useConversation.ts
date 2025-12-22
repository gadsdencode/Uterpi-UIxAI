// useConversation.ts - Conversation state management hook
// Extracts conversation management functionality from useChat following SRP

import { useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '../types';
import { useDynamicGreeting } from './useDynamicGreeting';
import { User } from './useAuth';
import { toast } from 'sonner';

export interface UseConversationOptions {
  /** User object for auth context */
  user: User | null;
  /** Enable AI-generated greeting (default: true) */
  enableAIGreeting?: boolean;
  /** Include suggestions in greeting (default: true) */
  includeSuggestions?: boolean;
  /** Max greeting length (default: 150) */
  maxGreetingLength?: number;
}

export interface UseConversationReturn {
  // State
  messages: Message[];
  currentConversationId: number | null;
  currentConversationTitle: string | null;
  isLoadingConversation: boolean;
  isChatActive: boolean;
  
  // Greeting state
  greeting: string;
  greetingLoading: boolean;
  isAIGenerated: boolean;
  
  // Attachments state
  attachments: string[];
  attachedFileIds: number[];
  
  // Actions
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addMessage: (message: Message) => void;
  addMessages: (messages: Message[]) => void;
  loadConversation: (id: number, title?: string) => Promise<Message[]>;
  startNewConversation: () => void;
  setIsChatActive: (active: boolean) => void;
  
  // Attachment actions
  addAttachment: (file: string, fileId?: number) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  
  // Sources state
  latestSources: Array<{ fileId: number; name: string; mimeType: string; similarity: number; snippet: string }>;
  setLatestSources: (sources: Array<{ fileId: number; name: string; mimeType: string; similarity: number; snippet: string }>) => void;
}

export const useConversation = (options: UseConversationOptions): UseConversationReturn => {
  const {
    user,
    enableAIGreeting = true,
    includeSuggestions = true,
    maxGreetingLength = 150
  } = options;

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Conversation state
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [currentConversationTitle, setCurrentConversationTitle] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false);
  
  // Attachments state
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachedFileIds, setAttachedFileIds] = useState<number[]>([]);
  
  // Sources state
  const [latestSources, setLatestSources] = useState<Array<{ fileId: number; name: string; mimeType: string; similarity: number; snippet: string }>>([]);
  
  // Greeting initialization ref
  const hasInitializedGreeting = useRef(false);

  // Dynamic greeting
  const { greeting, isLoading: greetingLoading, isAIGenerated } = useDynamicGreeting(user, {
    enableAI: enableAIGreeting,
    fallbackToTemplate: true,
    includeSuggestions,
    maxLength: maxGreetingLength
  });

  // Initialize messages with dynamic greeting when it's ready
  useEffect(() => {
    if (greeting && !greetingLoading && messages.length === 0 && !hasInitializedGreeting.current) {
      setMessages([
        {
          id: '1',
          content: greeting,
          role: 'assistant',
          timestamp: new Date(),
        }
      ]);
      hasInitializedGreeting.current = true;
    }
  }, [greeting, greetingLoading, messages.length]);

  // Listen for AI sources
  useEffect(() => {
    const handleSources = (e: Event) => {
      const ce = e as CustomEvent;
      if (Array.isArray(ce.detail)) {
        setLatestSources(ce.detail as any);
      }
    };
    window.addEventListener('ai-sources', handleSources as EventListener);
    return () => window.removeEventListener('ai-sources', handleSources as EventListener);
  }, []);

  // Add a single message
  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // Add multiple messages
  const addMessages = useCallback((newMessages: Message[]) => {
    setMessages(prev => [...prev, ...newMessages]);
  }, []);

  // Load conversation from server
  const loadConversation = useCallback(async (conversationId: number, conversationTitle?: string): Promise<Message[]> => {
    setIsLoadingConversation(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load conversation');
      }

      const data = await response.json();
      const apiMessages = data.messages || [];

      // Map API messages to local messages (data is clean from backend)
      const localMessages: Message[] = apiMessages.map((apiMsg: any) => ({
        id: apiMsg.id.toString(),
        content: apiMsg.content,
        role: apiMsg.role === 'system' ? 'assistant' : apiMsg.role,
        timestamp: new Date(apiMsg.createdAt),
        attachments: apiMsg.attachments || undefined,
        metadata: apiMsg.metadata || undefined
      }));

      setMessages(localMessages);
      setCurrentConversationId(conversationId);
      setCurrentConversationTitle(conversationTitle || null);
      hasInitializedGreeting.current = true;

      console.log(`✅ Loaded conversation ${conversationId} with ${localMessages.length} messages`);
      return localMessages;
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast.error('Failed to load conversation');
      throw error;
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  // Start new conversation
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setCurrentConversationTitle(null);
    hasInitializedGreeting.current = false;
    setAttachments([]);
    setAttachedFileIds([]);
    setLatestSources([]);
    
    console.log('🆕 Started new conversation');
  }, []);

  // Add attachment
  const addAttachment = useCallback((file: string, fileId?: number) => {
    setAttachments(prev => [...prev, file]);
    if (fileId) {
      setAttachedFileIds(prev => [...prev, fileId]);
    }
  }, []);

  // Remove attachment
  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setAttachedFileIds(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Clear all attachments
  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setAttachedFileIds([]);
  }, []);

  return {
    // State
    messages,
    currentConversationId,
    currentConversationTitle,
    isLoadingConversation,
    isChatActive,
    
    // Greeting state
    greeting,
    greetingLoading,
    isAIGenerated,
    
    // Attachments state
    attachments,
    attachedFileIds,
    
    // Actions
    setMessages,
    addMessage,
    addMessages,
    loadConversation,
    startNewConversation,
    setIsChatActive,
    
    // Attachment actions
    addAttachment,
    removeAttachment,
    clearAttachments,
    
    // Sources state
    latestSources,
    setLatestSources
  };
};

