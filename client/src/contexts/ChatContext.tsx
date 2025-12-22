// ChatContext.tsx - Context for sharing chat operations between components
// Allows Sidebar to trigger conversation loading in ChatView

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// Conversation type for the sidebar
export interface SidebarConversation {
  id: number;
  title?: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: string;
}

interface ChatContextValue {
  // Selected conversation to load
  pendingConversationId: number | null;
  pendingConversationTitle: string | null;
  
  // Actions
  selectConversation: (id: number, title?: string) => void;
  clearPendingConversation: () => void;
  
  // Registration for ChatView to provide its loadConversation function
  registerLoadConversation: (fn: (id: number, title?: string) => Promise<void>) => void;
  
  // Trigger new chat
  triggerNewChat: () => void;
  registerNewChatHandler: (fn: () => void) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [pendingConversationId, setPendingConversationId] = useState<number | null>(null);
  const [pendingConversationTitle, setPendingConversationTitle] = useState<string | null>(null);
  const [loadConversationFn, setLoadConversationFn] = useState<((id: number, title?: string) => Promise<void>) | null>(null);
  const [newChatHandler, setNewChatHandler] = useState<(() => void) | null>(null);

  const selectConversation = useCallback(async (id: number, title?: string) => {
    if (loadConversationFn) {
      try {
        await loadConversationFn(id, title);
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    } else {
      // If ChatView hasn't registered yet, store for later
      setPendingConversationId(id);
      setPendingConversationTitle(title || null);
    }
  }, [loadConversationFn]);

  const clearPendingConversation = useCallback(() => {
    setPendingConversationId(null);
    setPendingConversationTitle(null);
  }, []);

  const registerLoadConversation = useCallback((fn: (id: number, title?: string) => Promise<void>) => {
    setLoadConversationFn(() => fn);
  }, []);

  const triggerNewChat = useCallback(() => {
    if (newChatHandler) {
      newChatHandler();
    }
  }, [newChatHandler]);

  const registerNewChatHandler = useCallback((fn: () => void) => {
    setNewChatHandler(() => fn);
  }, []);

  return (
    <ChatContext.Provider value={{
      pendingConversationId,
      pendingConversationTitle,
      selectConversation,
      clearPendingConversation,
      registerLoadConversation,
      triggerNewChat,
      registerNewChatHandler,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

export default ChatContext;

