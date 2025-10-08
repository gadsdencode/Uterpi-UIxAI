"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MessageSquare,
  Clock,
  MoreVertical,
  Trash2,
  Edit3,
  Copy,
  Share2,
  Archive,
  Filter,
  ChevronDown,
  ChevronRight,
  Calendar,
  Tag,
  User,
  Bot,
  Sparkles,
  X,
  Loader2,
  RefreshCw,
  Plus,
  FolderOpen,
  Star,
  StarOff,
  Eye,
  EyeOff,
  Download,
  FileText,
  FileJson,
  FileSpreadsheet,
  FileType,
  ArrowUp
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Checkbox } from "./ui/checkbox";
import { cn } from "../lib/utils";
import { ChatEmptyStates } from "./EmptyStates";

// Types
interface Conversation {
  id: number;
  userId: number;
  sessionId: string;
  title?: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: string;
  isStarred?: boolean;
  isArchived?: boolean;
}

interface Message {
  id: number;
  conversationId: number;
  content: string;
  role: "user" | "assistant" | "system";
  messageIndex: number;
  attachments?: string[];
  metadata?: any;
  createdAt: string;
}

interface ChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation?: (conversation: Conversation) => void;
  currentConversationId?: number;
}

interface FilterState {
  search: string;
  provider: string;
  dateRange: string;
  starred: boolean;
  archived: boolean;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({
  isOpen,
  onClose,
  onSelectConversation,
  currentConversationId
}) => {
  const { user } = useAuth();
  
  // State management
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter and search state
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    provider: "all",
    dateRange: "all",
    starred: false,
    archived: false
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortBy, setSortBy] = useState<"date" | "title" | "provider">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'markdown' | 'csv' | 'txt'>('json');
  
  // Refs for scroll areas
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const conversationsScrollRef = useRef<HTMLDivElement>(null);

  // Function to extract actual conversation content from analysis prompts
  const extractConversationContent = useCallback((content: string): string => {
    // Check if this looks like an analysis prompt
    const analysisIndicators = [
      'ANALYSIS TASK:',
      'ANALYSIS CRITERIA:',
      'CONVERSATION:',
      'analyze this conversation',
      'user interaction patterns',
      'hidden insights',
      'interaction style analysis',
      'conversation dynamics',
      'behavioral insights',
      'return only a json object',
      'json object with this structure',
      'provide deep insights',
      'conversation to understand'
    ];

    const hasAnalysisIndicators = analysisIndicators.some(indicator => 
      content.toLowerCase().includes(indicator.toLowerCase())
    );

    if (!hasAnalysisIndicators) {
      return content; // Not an analysis prompt, return as-is
    }

    // Try multiple extraction patterns
    const patterns = [
      /CONVERSATION:\s*([\s\S]*?)(?=ANALYSIS TASK:|$)/i,
      /conversation:\s*([\s\S]*?)(?=analysis task:|$)/i,
      /analyze this conversation[:\s]*([\s\S]*?)(?=analysis task:|$)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const conversationContent = match[1].trim();
        
        // Clean up the conversation content
        let cleanedContent = conversationContent
          .replace(/^assistant:\s*/gim, 'Assistant: ')
          .replace(/^user:\s*/gim, 'User: ')
          .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
          .trim();

        // If we have a clean conversation, return it
        if (cleanedContent.length > 0 && cleanedContent !== conversationContent) {
          return cleanedContent;
        }
      }
    }

    // If we can't extract clean conversation content, return a summary
    const firstLine = content.split('\n')[0];
    if (firstLine.length < 100) {
      return firstLine;
    }

    // Return truncated version if it's too long
    return content.substring(0, 200) + (content.length > 200 ? '...' : '');
  }, []);

  // Function to parse conversation content into separate messages for display
  const parseConversationForDisplay = useCallback((content: string): { messages: Array<{role: string, content: string}>, isParsed: boolean } => {
    // Check if this looks like a conversation with multiple speakers
    const hasMultipleSpeakers = content.includes('Assistant:') && content.includes('User:');
    
    if (!hasMultipleSpeakers) {
      return { messages: [{ role: 'single', content }], isParsed: false };
    }

    const messages: Array<{role: string, content: string}> = [];
    const lines = content.split('\n');
    let currentSpeaker = '';
    let currentContent = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check if this line starts a new speaker
      if (trimmedLine.match(/^(Assistant|assistant):\s*/)) {
        // Save previous message if exists
        if (currentSpeaker && currentContent.trim()) {
          messages.push({
            role: currentSpeaker.toLowerCase(),
            content: currentContent.trim()
          });
        }
        
        // Start new assistant message
        currentSpeaker = 'assistant';
        currentContent = trimmedLine.replace(/^(Assistant|assistant):\s*/, '');
      } else if (trimmedLine.match(/^(User|user):\s*/)) {
        // Save previous message if exists
        if (currentSpeaker && currentContent.trim()) {
          messages.push({
            role: currentSpeaker.toLowerCase(),
            content: currentContent.trim()
          });
        }
        
        // Start new user message
        currentSpeaker = 'user';
        currentContent = trimmedLine.replace(/^(User|user):\s*/, '');
      } else if (currentSpeaker && trimmedLine) {
        // Continue current message
        currentContent += '\n' + trimmedLine;
      }
    }

    // Add the last message
    if (currentSpeaker && currentContent.trim()) {
      messages.push({
        role: currentSpeaker.toLowerCase(),
        content: currentContent.trim()
      });
    }

    return { messages, isParsed: true };
  }, []);

  // Scroll to bottom of messages with smooth scrolling
  const scrollToBottom = useCallback(() => {
    if (messagesScrollRef.current) {
      const scrollContainer = messagesScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, []);

  // Scroll to top of conversations with smooth scrolling
  const scrollToTop = useCallback(() => {
    if (conversationsScrollRef.current) {
      const scrollContainer = conversationsScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }
    }
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, scrollToBottom]);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      // Ctrl/Cmd + Home: Scroll to top of conversations
      if ((e.ctrlKey || e.metaKey) && e.key === 'Home') {
        e.preventDefault();
        scrollToTop();
      }
      
      // Ctrl/Cmd + End: Scroll to bottom of messages
      if ((e.ctrlKey || e.metaKey) && e.key === 'End') {
        e.preventDefault();
        scrollToBottom();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, scrollToTop, scrollToBottom]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Build query parameters
      const params = new URLSearchParams({
        limit: '100'
      });

      if (filters.search) {
        params.append('search', filters.search);
      }
      if (filters.provider !== 'all') {
        params.append('provider', filters.provider);
      }
      if (filters.starred) {
        params.append('isStarred', 'true');
      }
      if (filters.archived) {
        params.append('isArchived', 'true');
      }
      if (filters.dateRange !== 'all') {
        params.append('dateRange', filters.dateRange);
      }

      const response = await fetch(`/api/conversations?${params.toString()}`, {
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }
      
      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error("Error fetching conversations:", err);
      setError(err instanceof Error ? err.message : "Failed to load conversations");
      toast.error("Failed to load chat history");
    } finally {
      setIsLoading(false);
    }
  }, [user, filters]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: number) => {
    setIsLoadingMessages(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Error fetching messages:", err);
      setError(err instanceof Error ? err.message : "Failed to load messages");
      toast.error("Failed to load messages");
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Load conversations on mount and when filters change
  useEffect(() => {
    if (isOpen && user) {
      fetchConversations();
    }
  }, [isOpen, user, fetchConversations]);

  // Sort conversations (filtering is done server-side)
  const sortedConversations = useMemo(() => {
    const sorted = [...conversations];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "date":
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case "title":
          comparison = (a.title || "").localeCompare(b.title || "");
          break;
        case "provider":
          comparison = a.provider.localeCompare(b.provider);
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
    
    return sorted;
  }, [conversations, sortBy, sortOrder]);

  // Handle conversation selection
  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    fetchMessages(conversation.id);
    onSelectConversation?.(conversation);
  };

  // Export single conversation
  const handleExportConversation = async (conversationId: number, format: 'json' | 'markdown' | 'csv' | 'txt') => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/export?format=${format}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to export conversation');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
        : `conversation_${conversationId}_${new Date().toISOString().split('T')[0]}.${format}`;

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Conversation exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Error exporting conversation:', error);
      toast.error('Failed to export conversation');
    } finally {
      setIsExporting(false);
    }
  };

  // Export multiple conversations
  const handleBulkExport = async (conversationIds: number[], format: 'json' | 'markdown' | 'csv' | 'txt') => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/conversations/export/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ conversationIds, format })
      });

      if (!response.ok) {
        throw new Error('Failed to export conversations');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
        : `conversations_${new Date().toISOString().split('T')[0]}.${format}`;

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${conversationIds.length} conversations exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Error exporting conversations:', error);
      toast.error('Failed to export conversations');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle conversation selection for bulk operations
  const handleToggleConversationSelection = (conversationId: number) => {
    setSelectedConversations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  };

  // Select all conversations
  const handleSelectAllConversations = () => {
    setSelectedConversations(new Set(sortedConversations.map(conv => conv.id)));
  };

  // Clear all selections
  const handleClearAllSelections = () => {
    setSelectedConversations(new Set());
  };

  // Handle conversation actions
  const handleStarConversation = async (conversationId: number, isStarred: boolean) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/star`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isStarred })
      });

      if (!response.ok) {
        throw new Error('Failed to update conversation');
      }

      // Update local state
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId ? { ...conv, isStarred } : conv
        )
      );

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, isStarred } : null);
      }

      toast.success(isStarred ? "Conversation starred" : "Conversation unstarred");
    } catch (error) {
      toast.error("Failed to update conversation");
    }
  };

  const handleArchiveConversation = async (conversationId: number, isArchived: boolean) => {
    try {
      const endpoint = isArchived ? 'archive' : 'unarchive';
      const response = await fetch(`/api/conversations/${conversationId}/${endpoint}`, {
        method: 'PATCH',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to update conversation');
      }

      // Update local state
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId ? { ...conv, isArchived } : conv
        )
      );

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, isArchived } : null);
      }

      toast.success(isArchived ? "Conversation archived" : "Conversation unarchived");
    } catch (error) {
      toast.error("Failed to update conversation");
    }
  };

  const handleDeleteConversation = async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      // Update local state
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
        setMessages([]);
      }

      toast.success("Conversation deleted");
    } catch (error) {
      toast.error("Failed to delete conversation");
    }
  };

  const handleRenameConversation = async (conversationId: number, newTitle: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/title`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle })
      });

      if (!response.ok) {
        throw new Error('Failed to rename conversation');
      }

      // Update local state
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId ? { ...conv, title: newTitle } : conv
        )
      );

      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, title: newTitle } : null);
      }

      toast.success("Conversation renamed");
    } catch (error) {
      toast.error("Failed to rename conversation");
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return date.toLocaleDateString();
  };

  // Copy conversation to clipboard
  const handleCopyConversation = async () => {
    if (!selectedConversation || messages.length === 0) {
      toast.error("No conversation to copy");
      return;
    }

    try {
      // Format the conversation for copying
      let conversationText = `Conversation: ${selectedConversation.title || 'Untitled'}\n`;
      conversationText += `Provider: ${selectedConversation.provider} • Model: ${selectedConversation.model}\n`;
      conversationText += `Date: ${formatDate(selectedConversation.updatedAt)}\n`;
      conversationText += `${'='.repeat(50)}\n\n`;

      messages.forEach((message) => {
        const filteredContent = extractConversationContent(message.content);
        const { messages: parsedMessages, isParsed } = parseConversationForDisplay(filteredContent);
        
        if (isParsed) {
          parsedMessages.forEach((parsedMsg) => {
            const speaker = parsedMsg.role === 'user' ? 'User' : 'Assistant';
            conversationText += `${speaker}: ${parsedMsg.content}\n\n`;
          });
        } else {
          const speaker = message.role === 'user' ? 'User' : 'Assistant';
          conversationText += `${speaker}: ${filteredContent}\n\n`;
        }
      });

      // Check if clipboard API is supported
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(conversationText);
        toast.success("Conversation copied to clipboard");
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = conversationText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          toast.success("Conversation copied to clipboard");
        } catch (fallbackError) {
          console.error('Fallback copy failed:', fallbackError);
          toast.error("Failed to copy conversation");
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (error) {
      console.error('Error copying conversation:', error);
      toast.error("Failed to copy conversation");
    }
  };

  // Share conversation
  const handleShareConversation = async () => {
    if (!selectedConversation || messages.length === 0) {
      toast.error("No conversation to share");
      return;
    }

    try {
      // Format the conversation for sharing
      let conversationText = `Conversation: ${selectedConversation.title || 'Untitled'}\n`;
      conversationText += `Provider: ${selectedConversation.provider} • Model: ${selectedConversation.model}\n`;
      conversationText += `Date: ${formatDate(selectedConversation.updatedAt)}\n`;
      conversationText += `${'='.repeat(50)}\n\n`;

      messages.forEach((message) => {
        const filteredContent = extractConversationContent(message.content);
        const { messages: parsedMessages, isParsed } = parseConversationForDisplay(filteredContent);
        
        if (isParsed) {
          parsedMessages.forEach((parsedMsg) => {
            const speaker = parsedMsg.role === 'user' ? 'User' : 'Assistant';
            conversationText += `${speaker}: ${parsedMsg.content}\n\n`;
          });
        } else {
          const speaker = message.role === 'user' ? 'User' : 'Assistant';
          conversationText += `${speaker}: ${filteredContent}\n\n`;
        }
      });

      // Check if Web Share API is supported
      if (navigator.share) {
        await navigator.share({
          title: `Chat Conversation: ${selectedConversation.title || 'Untitled'}`,
          text: conversationText,
          url: window.location.href
        });
        toast.success("Conversation shared successfully");
      } else {
        // Fallback: copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(conversationText);
          toast.success("Conversation copied to clipboard (sharing not supported)");
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = conversationText;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          try {
            document.execCommand('copy');
            toast.success("Conversation copied to clipboard (sharing not supported)");
          } catch (fallbackError) {
            console.error('Fallback copy failed:', fallbackError);
            toast.error("Failed to copy conversation");
          } finally {
            document.body.removeChild(textArea);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled the share
        return;
      }
      console.error('Error sharing conversation:', error);
      toast.error("Failed to share conversation");
    }
  };

  // Get provider icon
  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "openai":
        return <Sparkles className="w-4 h-4 text-green-500" />;
      case "azure":
        return <Bot className="w-4 h-4 text-blue-500" />;
      case "gemini":
        return <Sparkles className="w-4 h-4 text-purple-500" />;
      case "uterpi":
        return <Bot className="w-4 h-4 text-orange-500" />;
      case "lmstudio":
        return <Bot className="w-4 h-4 text-indigo-500" />;
      default:
        return <MessageSquare className="w-4 h-4 text-gray-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl h-[85vh] max-h-[800px] min-h-[600px] p-0 bg-slate-900/95 backdrop-blur-xl border-slate-700/50 overflow-hidden">
          <DialogHeader className="p-6 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-6 h-6" />
                  Chat History
                </DialogTitle>
                <DialogDescription className="text-slate-400 mt-1">
                  Browse and manage your conversation history
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedConversations.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExportModal(true)}
                    disabled={isExporting}
                    className="text-slate-400 hover:text-white"
                  >
                    <Download className="w-4 h-4" />
                    <span className="ml-1">Export ({selectedConversations.size})</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchConversations}
                  disabled={isLoading}
                  className="text-slate-400 hover:text-white"
                >
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex h-full min-h-0 flex-col sm:flex-row">
            {/* Sidebar - Conversations List */}
            <div className="w-full sm:w-1/2 border-r-0 sm:border-r border-b sm:border-b-0 border-slate-700/50 flex flex-col min-h-0 h-1/2 sm:h-full">
              {/* Search and Filters */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search conversations..."
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      className="pl-10 bg-slate-800/50 border-slate-600 text-white placeholder-slate-400"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={scrollToTop}
                    className="text-slate-400 hover:text-white"
                    title="Scroll to top"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                </div>

                {/* Bulk Selection Controls */}
                {sortedConversations.length > 0 && (
                  <div className="flex items-center justify-between mb-3 p-2 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedConversations.size === sortedConversations.length && sortedConversations.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleSelectAllConversations();
                          } else {
                            handleClearAllSelections();
                          }
                        }}
                      />
                      <span className="text-sm text-slate-300">
                        {selectedConversations.size > 0 
                          ? `${selectedConversations.size} selected`
                          : 'Select conversations'
                        }
                      </span>
                    </div>
                    {selectedConversations.size > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearAllSelections}
                          className="text-slate-400 hover:text-white text-xs"
                        >
                          Clear
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowExportModal(true)}
                          disabled={isExporting}
                          className="text-slate-400 hover:text-white text-xs"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Export
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Filters */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-3"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={filters.provider}
                          onChange={(e) => setFilters(prev => ({ ...prev, provider: e.target.value }))}
                          className="px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-md text-white text-sm"
                          aria-label="Filter by AI provider"
                        >
                          <option value="all">All Providers</option>
                          <option value="openai">OpenAI</option>
                          <option value="azure">Azure</option>
                          <option value="gemini">Gemini</option>
                          <option value="uterpi">Uterpi</option>
                          <option value="lmstudio">LM Studio</option>
                        </select>
                        <select
                          value={filters.dateRange}
                          onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                          className="px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-md text-white text-sm"
                          aria-label="Filter by date range"
                        >
                          <option value="all">All Time</option>
                          <option value="today">Today</option>
                          <option value="week">This Week</option>
                          <option value="month">This Month</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                          <Checkbox
                            checked={filters.starred}
                            onCheckedChange={(checked) => setFilters(prev => ({ ...prev, starred: !!checked }))}
                          />
                          Starred only
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                          <Checkbox
                            checked={filters.archived}
                            onCheckedChange={(checked) => setFilters(prev => ({ ...prev, archived: !!checked }))}
                          />
                          Archived
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Conversations List */}
              <ScrollArea ref={conversationsScrollRef} className="flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
                <div className="p-4 space-y-2">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                  ) : error ? (
                    <div className="text-center py-8">
                      <p className="text-red-400 mb-2">{error}</p>
                      <Button variant="outline" size="sm" onClick={fetchConversations}>
                        Try Again
                      </Button>
                    </div>
                  ) : sortedConversations.length === 0 ? (
                    <div className="p-4">
                      {filters.search || filters.provider !== 'all' || filters.starred || filters.archived || filters.dateRange !== 'all' ? (
                        <ChatEmptyStates.NoSearchResults 
                          searchTerm={filters.search}
                          hasFilters={filters.provider !== 'all' || filters.starred || filters.archived || filters.dateRange !== 'all'}
                          onClearFilters={() => {
                            setFilters({
                              search: "",
                              provider: "all",
                              dateRange: "all",
                              starred: false,
                              archived: false
                            });
                          }}
                        />
                      ) : (
                        <ChatEmptyStates.NoConversations 
                          onStartNewConversation={() => {
                            window.dispatchEvent(new CustomEvent('startNewConversation'));
                          }}
                          onRefresh={fetchConversations}
                        />
                      )}
                    </div>
                  ) : (
                    sortedConversations.map((conversation) => (
                      <motion.div
                        key={conversation.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "group relative p-3 rounded-lg border cursor-pointer transition-all duration-200",
                          selectedConversation?.id === conversation.id
                            ? "bg-slate-800/50 border-slate-600"
                            : "bg-slate-800/20 border-slate-700/50 hover:bg-slate-800/30 hover:border-slate-600/50"
                        )}
                        onClick={() => handleSelectConversation(conversation)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedConversations.has(conversation.id)}
                              onCheckedChange={() => handleToggleConversationSelection(conversation.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {getProviderIcon(conversation.provider)}
                                <h3 className="font-medium text-white truncate">
                                  {conversation.title || `Chat with ${conversation.provider}`}
                                </h3>
                                {conversation.isStarred && (
                                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                                )}
                              </div>
                              <p className="text-sm text-slate-400 truncate mb-2">
                                {conversation.lastMessage || "No messages yet"}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="w-3 h-3" />
                                <span>{formatDate(conversation.updatedAt)}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {conversation.provider}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStarConversation(conversation.id, !conversation.isStarred);
                                }}
                              >
                                {conversation.isStarred ? (
                                  <>
                                    <StarOff className="w-4 h-4 mr-2" />
                                    Unstar
                                  </>
                                ) : (
                                  <>
                                    <Star className="w-4 h-4 mr-2" />
                                    Star
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchiveConversation(conversation.id, !conversation.isArchived);
                                }}
                              >
                                {conversation.isArchived ? (
                                  <>
                                    <Eye className="w-4 h-4 mr-2" />
                                    Unarchive
                                  </>
                                ) : (
                                  <>
                                    <Archive className="w-4 h-4 mr-2" />
                                    Archive
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // TODO: Implement rename functionality
                                }}
                              >
                                <Edit3 className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportConversation(conversation.id, 'json');
                                }}
                              >
                                <FileJson className="w-4 h-4 mr-2" />
                                Export as JSON
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportConversation(conversation.id, 'markdown');
                                }}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                Export as Markdown
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportConversation(conversation.id, 'csv');
                                }}
                              >
                                <FileSpreadsheet className="w-4 h-4 mr-2" />
                                Export as CSV
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportConversation(conversation.id, 'txt');
                                }}
                              >
                                <FileType className="w-4 h-4 mr-2" />
                                Export as Text
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteConversation(conversation.id);
                                }}
                                className="text-red-400"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Main Content - Messages */}
            <div className="w-full sm:w-1/2 flex flex-col min-h-0 h-1/2 sm:h-full">
              {selectedConversation ? (
                <>
                  {/* Conversation Header */}
                  <div className="p-4 border-b border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                          {getProviderIcon(selectedConversation.provider)}
                          {selectedConversation.title || `Chat with ${selectedConversation.provider}`}
                        </h2>
                        <p className="text-sm text-slate-400">
                          {selectedConversation.provider} • {selectedConversation.model} • {formatDate(selectedConversation.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                              <Download className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                            <DropdownMenuItem
                              onClick={() => handleExportConversation(selectedConversation.id, 'json')}
                            >
                              <FileJson className="w-4 h-4 mr-2" />
                              Export as JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExportConversation(selectedConversation.id, 'markdown')}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              Export as Markdown
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExportConversation(selectedConversation.id, 'csv')}
                            >
                              <FileSpreadsheet className="w-4 h-4 mr-2" />
                              Export as CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExportConversation(selectedConversation.id, 'txt')}
                            >
                              <FileType className="w-4 h-4 mr-2" />
                              Export as Text
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-slate-400 hover:text-white"
                              onClick={handleShareConversation}
                              aria-label="Share conversation"
                            >
                              <Share2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Share conversation</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-slate-400 hover:text-white"
                              onClick={handleCopyConversation}
                              aria-label="Copy conversation to clipboard"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Copy conversation to clipboard</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea ref={messagesScrollRef} className="flex-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
                    <div className="p-4 space-y-4">
                      {isLoadingMessages ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                      ) : messages.length === 0 ? (
                        <ChatEmptyStates.NoMessages />
                      ) : (
                        messages.map((message) => (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              "flex gap-3 p-3 rounded-lg",
                              message.role === "user"
                                ? "bg-slate-800/30 ml-8"
                                : "bg-slate-800/20 mr-8"
                            )}
                          >
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                              message.role === "user"
                                ? "bg-blue-600"
                                : "bg-slate-600"
                            )}>
                              {message.role === "user" ? (
                                <User className="w-4 h-4 text-white" />
                              ) : (
                                <Bot className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-white">
                                  {message.role === "user" ? "You" : "Assistant"}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {formatDate(message.createdAt)}
                                </span>
                              </div>
                              <div className="text-slate-300 whitespace-pre-wrap">
                                {(() => {
                                  const filteredContent = extractConversationContent(message.content);
                                  const isFiltered = filteredContent !== message.content;
                                  const { messages: parsedMessages, isParsed } = parseConversationForDisplay(filteredContent);
                                  
                                  return (
                                    <>
                                      {isFiltered && (
                                        <div className="mb-2 p-2 bg-slate-800/30 rounded text-xs text-slate-400 border-l-2 border-slate-600">
                                          <span className="font-medium">📝 Analysis prompt detected</span> - Showing extracted conversation content
                                        </div>
                                      )}
                                      {isParsed ? (
                                        <div className="space-y-2">
                                          {parsedMessages.map((parsedMsg, index) => (
                                            <div key={index} className={cn(
                                              "p-2 rounded text-sm",
                                              parsedMsg.role === 'user' 
                                                ? "bg-blue-600/20 ml-4" 
                                                : "bg-slate-600/20 mr-4"
                                            )}>
                                              <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-medium text-slate-400">
                                                  {parsedMsg.role === 'user' ? '👤 User' : '🤖 Assistant'}
                                                </span>
                                              </div>
                                              <p className="text-slate-200">{parsedMsg.content}</p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p>{filteredContent}</p>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">Select a conversation</h3>
                    <p className="text-slate-400">Choose a conversation from the sidebar to view its messages</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-md bg-slate-900/95 backdrop-blur-xl border-slate-700/50">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export Conversations
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Choose the format for exporting {selectedConversations.size} selected conversation{selectedConversations.size !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <label className="text-sm font-medium text-white">Export Format</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={exportFormat === 'json' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportFormat('json')}
                  className="flex items-center gap-2"
                >
                  <FileJson className="w-4 h-4" />
                  JSON
                </Button>
                <Button
                  variant={exportFormat === 'markdown' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportFormat('markdown')}
                  className="flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Markdown
                </Button>
                <Button
                  variant={exportFormat === 'csv' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportFormat('csv')}
                  className="flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV
                </Button>
                <Button
                  variant={exportFormat === 'txt' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportFormat('txt')}
                  className="flex items-center gap-2"
                >
                  <FileType className="w-4 h-4" />
                  Text
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button
                variant="outline"
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  handleBulkExport(Array.from(selectedConversations), exportFormat);
                  setShowExportModal(false);
                }}
                disabled={isExporting}
                className="flex items-center gap-2"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export {selectedConversations.size} Conversation{selectedConversations.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default ChatHistory;
