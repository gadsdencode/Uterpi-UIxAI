"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Command,
  Sparkles,
  ImageIcon,
  FileUp,
  MonitorIcon,
  X,
  Loader2,
  Edit3,
  Share2,
  Plus,
  Brain,
  Cpu,
  CircuitBoard,
  AlertCircle,
  Download,
  Copy,
  ExternalLink,
  Settings,
  Files,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  CreditCard,
  MessageSquare
} from "lucide-react";
import { Message, CommandSuggestion, LLMModel, ModelCapabilities } from "../types";
import { useAIProvider } from "../hooks/useAIProvider";
import { SYSTEM_MESSAGE_PRESETS } from "../hooks/useAzureAI";
import { useIntelligentToast } from "../hooks/useIntelligentToast";
import { useSpeech } from "../hooks/useSpeech";
import { AzureAIService } from "../lib/azureAI";
import { SystemMessageSelector } from './SystemMessageSelector';
import CloneUIModal from './CloneUIModal';
import CreatePageModal from './CreatePageModal';
import ImproveModal from './ImproveModal';
import AnalyzeModal from './AnalyzeModal';
import { FileManager } from './FileManager';
import { AIProviderQuickSelector } from './AIProviderQuickSelector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { toast } from "sonner";
import { useAuth } from '../hooks/useAuth';
import { handleError, createError } from '../lib/error-handler';
import { useDynamicGreeting } from '../hooks/useDynamicGreeting';
import { 
  downloadTranscript, 
  copyTranscriptToClipboard, 
  shareTranscript, 
  isWebShareSupported 
} from '../lib/transcriptUtils';
import { CreditLimitMessage } from './CreditLimitMessage';
import { AICreditsQuickPurchase } from './AICreditsQuickPurchase';
import { navigateTo } from './Router';
import { useCreditUpdates } from '../hooks/useCreditUpdates';
import ChatHistory from './ChatHistory';
import { SpeechSettings } from './SpeechSettings';

interface ParticlesProps {
  className?: string;
  quantity?: number;
  staticity?: number;
  ease?: number;
  size?: number;
  refresh?: boolean;
  color?: string;
  vx?: number;
  vy?: number;
}

const Particles: React.FC<ParticlesProps> = ({
  className = "",
  quantity = 100,
  staticity = 50,
  ease = 50,
  size = 0.4,
  refresh = false,
  color = "#8B5CF6",
  vx = 0,
  vy = 0,
}) => {
  const [particleColor, setParticleColor] = useState<string>(color);

  interface MousePosition {
    x: number;
    y: number;
  }

  const MousePosition = (): MousePosition => {
    const [mousePosition, setMousePosition] = useState<MousePosition>({
      x: 0,
      y: 0,
    });

    useEffect(() => {
      const handleMouseMove = (event: MouseEvent) => {
        setMousePosition({ x: event.clientX, y: event.clientY });
      };

      window.addEventListener("mousemove", handleMouseMove);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
      };
    }, []);

    return mousePosition;
  };

  const hexToRgb = (hex: string): number[] => {
    hex = hex.replace("#", "");
    const hexInt = parseInt(hex, 16);
    const red = (hexInt >> 16) & 255;
    const green = (hexInt >> 8) & 255;
    const blue = hexInt & 255;
    return [red, green, blue];
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const circles = useRef<any[]>([]);
  const mousePosition = MousePosition();
  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;

  useEffect(() => {
    if (canvasRef.current) {
      context.current = canvasRef.current.getContext("2d");
    }
    initCanvas();
    animate();
    window.addEventListener("resize", initCanvas);

    return () => {
      window.removeEventListener("resize", initCanvas);
    };
  }, [particleColor]);

  useEffect(() => {
    onMouseMove();
  }, [mousePosition.x, mousePosition.y]);

  useEffect(() => {
    initCanvas();
  }, [refresh]);

  const initCanvas = () => {
    resizeCanvas();
    drawParticles();
  };

  const onMouseMove = () => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const { w, h } = canvasSize.current;
      const x = mousePosition.x - rect.left - w / 2;
      const y = mousePosition.y - rect.top - h / 2;
      const inside = x < w / 2 && x > -w / 2 && y < h / 2 && y > -h / 2;
      if (inside) {
        mouse.current.x = x;
        mouse.current.y = y;
      }
    }
  };

  type Circle = {
    x: number;
    y: number;
    translateX: number;
    translateY: number;
    size: number;
    alpha: number;
    targetAlpha: number;
    dx: number;
    dy: number;
    magnetism: number;
  };

  const resizeCanvas = () => {
    if (canvasContainerRef.current && canvasRef.current && context.current) {
      circles.current.length = 0;
      canvasSize.current.w = canvasContainerRef.current.offsetWidth;
      canvasSize.current.h = canvasContainerRef.current.offsetHeight;
      canvasRef.current.width = canvasSize.current.w * dpr;
      canvasRef.current.height = canvasSize.current.h * dpr;
      canvasRef.current.style.width = `${canvasSize.current.w}px`;
      canvasRef.current.style.height = `${canvasSize.current.h}px`;
      context.current.scale(dpr, dpr);
    }
  };

  const circleParams = (): Circle => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);
    const translateX = 0;
    const translateY = 0;
    const pSize = Math.floor(Math.random() * 2) + size;
    const alpha = 0;
    const targetAlpha = parseFloat((Math.random() * 0.6 + 0.1).toFixed(1));
    const dx = (Math.random() - 0.5) * 0.1;
    const dy = (Math.random() - 0.5) * 0.1;
    const magnetism = 0.1 + Math.random() * 4;
    return {
      x,
      y,
      translateX,
      translateY,
      size: pSize,
      alpha,
      targetAlpha,
      dx,
      dy,
      magnetism,
    };
  };

  const rgb = hexToRgb(particleColor);

  const drawCircle = (circle: Circle, update = false) => {
    if (context.current) {
      const { x, y, translateX, translateY, size, alpha } = circle;
      context.current.translate(translateX, translateY);
      context.current.beginPath();
      context.current.arc(x, y, size, 0, 2 * Math.PI);
      context.current.fillStyle = `rgba(${rgb.join(", ")}, ${alpha})`;
      context.current.fill();
      context.current.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!update) {
        circles.current.push(circle);
      }
    }
  };

  const clearContext = () => {
    if (context.current) {
      context.current.clearRect(
        0,
        0,
        canvasSize.current.w,
        canvasSize.current.h,
      );
    }
  };

  const drawParticles = () => {
    clearContext();
    const particleCount = quantity;
    for (let i = 0; i < particleCount; i++) {
      const circle = circleParams();
      drawCircle(circle);
    }
  };

  const remapValue = (
    value: number,
    start1: number,
    end1: number,
    start2: number,
    end2: number,
  ): number => {
    const remapped =
      ((value - start1) * (end2 - start2)) / (end1 - start1) + start2;
    return remapped > 0 ? remapped : 0;
  };

  const animate = () => {
    clearContext();
    circles.current.forEach((circle: Circle, i: number) => {
      const edge = [
        circle.x + circle.translateX - circle.size,
        canvasSize.current.w - circle.x - circle.translateX - circle.size,
        circle.y + circle.translateY - circle.size,
        canvasSize.current.h - circle.y - circle.translateY - circle.size,
      ];
      const closestEdge = edge.reduce((a, b) => Math.min(a, b));
      const remapClosestEdge = parseFloat(
        remapValue(closestEdge, 0, 20, 0, 1).toFixed(2),
      );
      if (remapClosestEdge > 1) {
        circle.alpha += 0.02;
        if (circle.alpha > circle.targetAlpha) {
          circle.alpha = circle.targetAlpha;
        }
      } else {
        circle.alpha = circle.targetAlpha * remapClosestEdge;
      }
      circle.x += circle.dx + vx;
      circle.y += circle.dy + vy;
      circle.translateX +=
        (mouse.current.x / (staticity / circle.magnetism) - circle.translateX) /
        ease;
      circle.translateY +=
        (mouse.current.y / (staticity / circle.magnetism) - circle.translateY) /
        ease;

      drawCircle(circle, true);

      if (
        circle.x < -circle.size ||
        circle.x > canvasSize.current.w + circle.size ||
        circle.y < -circle.size ||
        circle.y > canvasSize.current.h + circle.size
      ) {
        circles.current.splice(i, 1);
        const newCircle = circleParams();
        drawCircle(newCircle);
      }
    });
    window.requestAnimationFrame(animate);
  };

  return (
    <div className={className} ref={canvasContainerRef} aria-hidden="true">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
};

// Helper function to check if a command is available based on dynamic capabilities
const isCommandAvailable = (command: string, capabilities: ModelCapabilities | null): boolean => {
  if (!capabilities) {
    // Default to unavailable if no capability info (loading or error state)
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

const CircuitPattern: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 10h20v20h20v-20h20v40h-20v20h-40z"
      stroke="currentColor"
      strokeWidth="0.5"
      fill="none"
      opacity="0.1"
    />
    <circle cx="30" cy="30" r="2" fill="currentColor" opacity="0.2" />
    <circle cx="70" cy="50" r="2" fill="currentColor" opacity="0.2" />
  </svg>
);

const HolographicBubble: React.FC<{
  children: React.ReactNode;
  isUser?: boolean;
  className?: string;
}> = ({ children, isUser = false, className }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", damping: 20, stiffness: 300 }}
    className={`
      relative p-4 rounded-2xl backdrop-blur-xl border overflow-hidden
      ${isUser 
        ? "bg-gradient-to-br from-violet-500/20 to-purple-600/20 border-violet-400/30 ml-4 sm:ml-12" 
        : "bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30 mr-4 sm:mr-12"
      }
      ${className}
    `}
  >
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent" />
    <div className="relative z-10">{children}</div>
    
    {/* Holographic shimmer effect */}
    <motion.div
      className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent"
      animate={{
        x: ["-100%", "100%"],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        repeatType: "loop",
        ease: "linear",
      }}
    />
  </motion.div>
);

const TypingIndicator: React.FC = () => (
  <HolographicBubble>
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-violet-400 rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
      <span className="text-sm text-slate-300">AI is thinking...</span>
    </div>
  </HolographicBubble>
);

const NeuralNetworkPulse: React.FC<{ isActive?: boolean }> = ({ isActive = false }) => (
  <motion.div
    className="absolute inset-0 pointer-events-none"
    animate={isActive ? {
      opacity: [0, 0.3, 0],
      scale: [0.8, 1.2, 0.8],
    } : {}}
    transition={{
      duration: 2,
      repeat: isActive ? Infinity : 0,
      ease: "easeInOut",
    }}
  >
    <div className="absolute inset-0 rounded-2xl border border-violet-400/20">
      <div className="absolute top-2 left-2 w-1 h-1 bg-violet-400 rounded-full animate-pulse" />
      <div className="absolute top-4 right-3 w-1 h-1 bg-blue-400 rounded-full animate-pulse delay-300" />
      <div className="absolute bottom-3 left-4 w-1 h-1 bg-purple-400 rounded-full animate-pulse delay-700" />
    </div>
  </motion.div>
);

const RippleButton = React.forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
    className?: string;
    disabled?: boolean;
    'aria-label'?: string;
  }
>(({ children, onClick, className, disabled = false, 'aria-label': ariaLabel }, ref) => {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newRipple = { id: Date.now(), x, y };
    setRipples(prev => [...prev, newRipple]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 600);
    
    if (onClick && typeof onClick === 'function') {
      try {
        // Forward the original event so upstream handlers can access defaultPrevented, etc.
        onClick(e);
      } catch (error) {
        console.error('Error in onClick handler:', error);
        console.error('onClick handler failed:', error);
      }
    }
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`
        relative overflow-hidden transition-all duration-200
        ${disabled ? "opacity-50 cursor-not-allowed" : "hover:scale-105 active:scale-95"}
        ${className}
      `}
    >
      {children}
      {ripples.map(ripple => (
        <motion.span
          key={ripple.id}
          className="absolute bg-white/30 rounded-full pointer-events-none"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      ))}
    </button>
  );
});

RippleButton.displayName = 'RippleButton';

const OrigamiModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, children }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          className="relative bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 max-w-md w-full"
          initial={{ scale: 0, rotateX: -90 }}
          animate={{ scale: 1, rotateX: 0 }}
          exit={{ scale: 0, rotateX: 90 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <RippleButton
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </RippleButton>
          </div>
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const FuturisticAIChat: React.FC = () => {
  const { user } = useAuth(); // Get user context for AI personalization
  
  // Credit status state
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isFreemium, setIsFreemium] = useState(false);
  const [messagesRemaining, setMessagesRemaining] = useState<number | null>(null);

  // Listen for real-time credit updates from AI responses
  const creditUpdate = useCreditUpdates();

  // Update credit balance when we receive real-time updates
  useEffect(() => {
    if (creditUpdate) {
      console.log('💳 Real-time credit update received:', creditUpdate);
      setCreditBalance(creditUpdate.remainingBalance);
    }
  }, [creditUpdate]);

  // Fetch credit status on component mount
  useEffect(() => {
    if (user) {
      fetchCreditStatus();
    }
  }, [user]);

  const fetchCreditStatus = async () => {
    try {
      const response = await fetch('/api/subscription/details', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCreditBalance(data.features.currentCreditsBalance);
        setIsFreemium(data.tier === 'freemium');
        if (data.tier === 'freemium') {
          setMessagesRemaining(data.features.messagesRemaining);
        }
      }
    } catch (error) {
      console.error('Error fetching credit status:', error);
    }
  };

  // Load conversation messages from API
  const loadConversation = async (conversationId: number, conversationTitle?: string) => {
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

      // Convert API messages to local Message format
      const localMessages: Message[] = [];
      
      for (const apiMsg of apiMessages) {
        const filteredContent = extractConversationContent(apiMsg.content);
        
        // Check if this is a conversation that needs to be parsed into multiple messages
        const isConversationContent = filteredContent.includes('Assistant:') && filteredContent.includes('User:');
        
        if (isConversationContent && filteredContent !== apiMsg.content) {
          // Parse the conversation into separate messages
          const parsedMessages = parseConversationIntoMessages(filteredContent, apiMsg);
          if (parsedMessages.length > 0) {
            localMessages.push(...parsedMessages);
          } else {
            // Fallback: if parsing fails, add as single message
            localMessages.push({
              id: apiMsg.id.toString(),
              content: filteredContent,
              role: apiMsg.role === 'system' ? 'assistant' : apiMsg.role,
              timestamp: new Date(apiMsg.createdAt),
              attachments: apiMsg.attachments || undefined,
              metadata: apiMsg.metadata || undefined
            });
          }
        } else {
          // Regular message, add as-is
          localMessages.push({
            id: apiMsg.id.toString(),
            content: filteredContent,
            role: apiMsg.role === 'system' ? 'assistant' : apiMsg.role,
            timestamp: new Date(apiMsg.createdAt),
            attachments: apiMsg.attachments || undefined,
            metadata: apiMsg.metadata || undefined
          });
        }
      }

      // Update state
      setMessages(localMessages);
      setCurrentConversationId(conversationId);
      setCurrentConversationTitle(conversationTitle || null);
      
      // Reset greeting initialization flag since we're loading a conversation
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
  };

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

  // Function to parse conversation content into separate messages
  const parseConversationIntoMessages = useCallback((content: string, originalMessage: any): Message[] => {
    // Check if this looks like a conversation with multiple speakers
    const conversationPatterns = [
      /(?:Assistant|assistant):\s*([^\n]*(?:\n(?!User|Assistant|user|assistant)[^\n]*)*)/gi,
      /(?:User|user):\s*([^\n]*(?:\n(?!User|Assistant|user|assistant)[^\n]*)*)/gi
    ];

    const messages: Message[] = [];
    let messageIndex = 0;

    // Split content by speaker patterns
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
            id: `${originalMessage.id}-${messageIndex}`,
            content: currentContent.trim(),
            role: currentSpeaker.toLowerCase() === 'assistant' ? 'assistant' : 'user',
            timestamp: new Date(originalMessage.createdAt),
            attachments: originalMessage.attachments,
            metadata: originalMessage.metadata
          });
          messageIndex++;
        }
        
        // Start new assistant message
        currentSpeaker = 'assistant';
        currentContent = trimmedLine.replace(/^(Assistant|assistant):\s*/, '');
      } else if (trimmedLine.match(/^(User|user):\s*/)) {
        // Save previous message if exists
        if (currentSpeaker && currentContent.trim()) {
          messages.push({
            id: `${originalMessage.id}-${messageIndex}`,
            content: currentContent.trim(),
            role: currentSpeaker.toLowerCase() === 'assistant' ? 'assistant' : 'user',
            timestamp: new Date(originalMessage.createdAt),
            attachments: originalMessage.attachments,
            metadata: originalMessage.metadata
          });
          messageIndex++;
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
        id: `${originalMessage.id}-${messageIndex}`,
        content: currentContent.trim(),
        role: currentSpeaker.toLowerCase() === 'assistant' ? 'assistant' : 'user',
        timestamp: new Date(originalMessage.createdAt),
        attachments: originalMessage.attachments,
        metadata: originalMessage.metadata
      });
    }

    return messages;
  }, []);

  // Start a new conversation
  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setCurrentConversationTitle(null);
    hasInitializedGreeting.current = false;
    setInput("");
    setAttachments([]);
    setAttachedFileIds([]);
    clearError();
    console.log('🆕 Started new conversation');
  };
  
  // Use dynamic greeting system
  const { greeting, isLoading: greetingLoading, error: greetingError, isAIGenerated } = useDynamicGreeting(user, {
    enableAI: true,
    fallbackToTemplate: true,
    includeSuggestions: true,
    maxLength: 150
  });

  const [messages, setMessages] = useState<Message[]>([]);
  
  // Current conversation state
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [currentConversationTitle, setCurrentConversationTitle] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  
  // Initialize messages with dynamic greeting when it's ready (only once)
  const hasInitializedGreeting = useRef(false);
  useEffect(() => {
    if (greeting && !greetingLoading && messages.length === 0 && !hasInitializedGreeting.current) {
      setMessages([
        {
          id: "1",
          content: greeting,
          role: "assistant",
          timestamp: new Date(),
        }
      ]);
      hasInitializedGreeting.current = true;
    }
  }, [greeting, greetingLoading, messages.length]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachedFileIds, setAttachedFileIds] = useState<number[]>([]);
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [enableStreaming, setEnableStreaming] = useState(true);
  const [streamingResponse, setStreamingResponse] = useState("");
  const [showSystemMessageModal, setShowSystemMessageModal] = useState(false);
  const [selectedSystemPreset, setSelectedSystemPreset] = useState<keyof typeof SYSTEM_MESSAGE_PRESETS | "custom">("DEFAULT");
  const [customSystemMessage, setCustomSystemMessage] = useState<string>("");
  
  // Enhanced modal states
  const [showCloneUIModal, setShowCloneUIModal] = useState(false);
  const [showCreatePageModal, setShowCreatePageModal] = useState(false);
  const [showImproveModal, setShowImproveModal] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [showFileManager, setShowFileManager] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showSpeechSettings, setShowSpeechSettings] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false); // Track if chat is actively processing
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [latestSources, setLatestSources] = useState<Array<{ fileId: number; name: string; mimeType: string; similarity: number; snippet: string }>>([]);


  // Keyboard shortcuts: New Chat (Ctrl/Cmd+N) and Open Model Selector (Ctrl/Cmd+M)
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

  const SourcesList: React.FC<{ sources: typeof latestSources }> = ({ sources }) => {
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

  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setMessages([
          {
            id: "1",
            content: greeting || "Hello! I'm Uterpi's AI. What would you like to accomplish today?",
            role: "assistant",
            timestamp: new Date(),
          }
        ]);
        toast.success("Started new conversation!");
      }

      // Model selector moved to quick dropdown
      // if (e.key.toLowerCase() === 'm') {
      //   e.preventDefault();
      //   // Now handled by AIProviderQuickSelector
      // }
    };

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [greeting]);

  // Get the current system message based on selection
  const getCurrentSystemMessage = () => {
    if (selectedSystemPreset === "custom") {
      return customSystemMessage || SYSTEM_MESSAGE_PRESETS.DEFAULT;
    }
    return SYSTEM_MESSAGE_PRESETS[selectedSystemPreset];
  };

  // Handle system message preset changes
  const handleSystemPresetChange = (preset: keyof typeof SYSTEM_MESSAGE_PRESETS | "custom", message?: string) => {
    setSelectedSystemPreset(preset);
    if (preset === "custom" && message !== undefined) {
      setCustomSystemMessage(message);
    }
    
    // Track system message changes
    trackAction('system_message_change');
  };

  // AI Provider hook (supports Azure AI, OpenAI, Gemini)
  const { 
    sendMessage, 
    sendStreamingMessage, 
    isLoading, 
    error, 
    clearError,
    currentModel,
    updateModel,
    selectedLLMModel,
    modelCapabilities,
    isLoadingCapabilities,
    refreshCapabilities,
    getAvailableModels,
    currentProvider
  } = useAIProvider({
    enableStreaming,
    systemMessage: getCurrentSystemMessage(),
    chatOptions: {
      maxTokens: 2048,
      temperature: 0.8,
      topP: 0.1
    },
    userContext: { user } // Pass user context correctly
  });

  // Display label for current model in header
  const displayModelName = (() => {
    if (currentProvider === 'lmstudio') {
      // Show the actual model name from LM Studio
      return selectedLLMModel?.name || 'Uterpi AI';
    }
    return selectedLLMModel?.name || currentModel || 'Choose Model';
  })();

  // Get AI service instance for intelligent toasts (create a SEPARATE instance to avoid interference)
  const aiServiceRef = useRef<any>(null);
  useEffect(() => {
    const getAIService = async () => {
      try {
        // Create a DEDICATED service instance for intelligent toasts
        // This prevents interference with chat operations
        switch (currentProvider) {
          case 'gemini': {
            const apiKey = localStorage.getItem('gemini-api-key');
            if (apiKey) {
              const { GeminiService } = await import('../lib/gemini');
              // Create a separate instance specifically for analysis
              // Use a lightweight model for faster analysis
              aiServiceRef.current = new GeminiService({ 
                apiKey, 
                modelName: 'gemini-1.5-flash' // Use flash model for analysis to reduce load
              });
              console.log('✅ Separate Gemini Service initialized for intelligent toasts');
              return;
            }
            break;
          }
          
          case 'openai': {
            const apiKey = localStorage.getItem('openai-api-key');
            if (apiKey) {
              const { OpenAIService } = await import('../lib/openAI');
              // Create a separate instance for analysis with a lightweight model
              aiServiceRef.current = new OpenAIService({ 
                apiKey, 
                modelName: 'gpt-4o-mini' // Use mini model for analysis to reduce load
              });
              console.log('✅ Separate OpenAI Service initialized for intelligent toasts');
              return;
            }
            break;
          }
          
          case 'huggingface': {
            const token = localStorage.getItem('hf-api-token');
            const url = localStorage.getItem('hf-endpoint-url');
            if (token && url) {
              const { HuggingFaceService } = await import('../lib/huggingface');
              aiServiceRef.current = new HuggingFaceService({ 
                apiToken: token, 
                endpointUrl: url, 
                modelName: 'hf-endpoint' 
              });
              console.log('✅ HuggingFace Service initialized for intelligent toasts');
              return;
            }
            break;
          }
          
          case 'azure': {
            const azureKey = localStorage.getItem('azure-api-key');
            const azureEndpoint = localStorage.getItem('azure-endpoint');
            if (azureKey && azureEndpoint) {
              const { AzureAIService } = await import('../lib/azureAI');
              aiServiceRef.current = new AzureAIService({ 
                apiKey: azureKey, 
                endpoint: azureEndpoint,
                modelName: selectedLLMModel?.id || 'gpt-4o' 
              });
              console.log('✅ Azure AI Service initialized for intelligent toasts');
              return;
            }
            break;
          }
          
          case 'uterpi': {
            const uterpiToken = (import.meta as any).env?.VITE_UTERPI_API_TOKEN;
            const uterpiUrl = (import.meta as any).env?.VITE_UTERPI_ENDPOINT_URL;
            if (uterpiToken && uterpiUrl) {
              const { HuggingFaceService } = await import('../lib/huggingface');
              aiServiceRef.current = new HuggingFaceService({ 
                apiToken: uterpiToken, 
                endpointUrl: uterpiUrl, 
                modelName: 'hf-endpoint' 
              });
              console.log('✅ Uterpi AI Service initialized for intelligent toasts');
              return;
            }
            break;
          }
          
          case 'lmstudio': {
            const baseUrl = localStorage.getItem('lmstudio-base-url') || 'http://localhost:1234/v1';
            const { LMStudioService } = await import('../lib/lmstudio');
            aiServiceRef.current = new LMStudioService({ 
              apiKey: 'not-needed', // LM Studio doesn't require an API key
              baseUrl, 
              modelName: selectedLLMModel?.id || 'nomadic-icdu-v8' 
            });
            console.log('✅ LM Studio Service initialized for intelligent toasts');
            return;
          }
        }

        // No service available for current provider
        aiServiceRef.current = null;
        console.log(`⚠️ No AI service available for intelligent toasts with provider: ${currentProvider}`);
      } catch (err) {
        console.warn('Failed to initialize AI service for toasts:', err);
        aiServiceRef.current = null;
      }
    };
    getAIService();
  }, [currentProvider, selectedLLMModel]);

  // Intelligent toast system - pass toast function explicitly
  const {
    analyzeConversation,
    trackAction,
    showOptimizationTip,
    showPerformanceAlert,
    clearRecommendationCache,
    forceClearRecommendation,
    forceClearInsightCaches,
    testShowRecommendation,
    getRecommendationCacheStatus
  } = useIntelligentToast({
    enabled: !!aiServiceRef.current, // Only enable if we have a compatible AI service
    aiService: aiServiceRef.current,
    toastFunction: (title: string, options?: any) => {
      toast(title, options);
    },
    onModelSwitch: (modelId: string) => {
      const availableModels = getAvailableModels();
      const targetModel = availableModels.find((m: any) => m.id === modelId);
      if (targetModel) {
        updateModel(targetModel);
        toast.success(`Switched to ${targetModel.name}!`);
      }
    },
    onNewChat: () => {
      // Reset conversation
      setMessages([
        {
          id: "1",
          content: greeting || "Hello! I'm Uterpi's AI. What would you like to accomplish today?",
          role: "assistant",
          timestamp: new Date(),
        }
      ]);
      toast.success("Started new conversation!");
    }
  });
  
  // Initialize speech functionality
  const {
    speak,
    stopSpeaking,
    isSpeaking,
    startListening,
    stopListening,
    isListening,
    transcript,
    interimTranscript,
    isAvailable: speechAvailable,
    isHTTPS,
    microphonePermission,
    error: speechError,
    initialize
  } = useSpeech({
    autoInitialize: false, // Don't auto-initialize - only when user explicitly enables speech
    onRecognitionResult: (result) => {
      if (result.transcript) {
        // For both interim and final results, show the full transcript
        // The transcript already contains the accumulated text
        setInput(result.transcript);
      }
    },
    onRecognitionError: (error) => {
      toast.error(`Speech recognition error: ${error.message}`);
      setIsRecording(false);
    }
  });
  
  // Handle text-to-speech for messages
  const handleSpeak = useCallback(async (messageId: string, text: string) => {
    try {
      // Initialize speech service if not already initialized
      if (!speechAvailable && initialize) {
        toast.info('Initializing text-to-speech...');
        await initialize();
        // Wait a bit for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (speakingMessageId === messageId) {
        // Stop speaking if clicking same message
        stopSpeaking();
        setSpeakingMessageId(null);
      } else {
        // Start speaking new message
        stopSpeaking();
        setSpeakingMessageId(messageId);
        await speak(text);
        setSpeakingMessageId(null);
      }
    } catch (error) {
      console.error('Failed to speak:', error);
      toast.error('Failed to speak message');
      setSpeakingMessageId(null);
    }
  }, [speakingMessageId, speak, stopSpeaking, speechAvailable, initialize]);
  
  // Handle speech-to-text for input
  const handleVoiceInput = useCallback(async () => {
    try {
      // Initialize speech service if not already initialized
      if (!speechAvailable && initialize) {
        toast.info('Initializing speech service...');
        await initialize();
        // Wait a bit for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Check HTTPS requirement
      if (!isHTTPS && microphonePermission !== 'granted') {
        toast.error('🔒 Microphone access requires HTTPS. Please use a secure connection.');
        return;
      }
      
      if (isRecording) {
        // Stop recording and get transcript
        setIsRecording(false);
        const finalTranscript = await stopListening();
        if (finalTranscript) {
          setInput(finalTranscript);
        }
      } else {
        // Start recording
        setIsRecording(true);
        setInput(''); // Clear input to show fresh transcript
        await startListening({
          language: 'en-US',
          continuous: true,
          interimResults: true
        });
      }
    } catch (error) {
      console.error('Voice input error:', error);
      const errorMessage = (error as Error).message || 'Voice input failed';
      
      // Provide helpful error messages
      if (errorMessage.includes('permission')) {
        toast.error('🎤 Microphone permission denied. Please allow microphone access and try again.');
      } else if (errorMessage.includes('not-allowed')) {
        toast.error('🔒 Microphone access blocked. Check your browser settings.');
      } else if (errorMessage.includes('network')) {
        toast.error('🌐 Network error. Please check your internet connection.');
      } else {
        toast.error(`🎤 ${errorMessage}`);
      }
      
      setIsRecording(false);
    }
  }, [isRecording, startListening, stopListening, isHTTPS, microphonePermission, speechAvailable, initialize]);

  // Mic permission badge helper
  const MicPermissionBadge = () => (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`w-2 h-2 rounded-full ${microphonePermission === 'granted' ? 'bg-green-500' : microphonePermission === 'denied' ? 'bg-red-500' : 'bg-yellow-500'}`} />
      <span>
        Mic: {microphonePermission === 'granted' ? 'Granted' : microphonePermission === 'denied' ? 'Denied' : 'Prompt'}
        {!isHTTPS && microphonePermission !== 'granted' && (
          <span className="ml-2 text-yellow-400">(HTTPS recommended)</span>
        )}
      </span>
    </div>
  );
  
  // Stop recording when component unmounts
  useEffect(() => {
    return () => {
      if (isListening) {
        stopListening();
      }
      if (isSpeaking) {
        stopSpeaking();
      }
    };
  }, [isListening, isSpeaking, stopListening, stopSpeaking]);

  // Add debugging commands to window object for console testing
  useEffect(() => {
    (window as any).intelligentToastDebug = {
      clearCache: clearRecommendationCache,
      forceClear: forceClearRecommendation,
      clearInsights: forceClearInsightCaches,
      testShow: testShowRecommendation,
      getStatus: getRecommendationCacheStatus,
      testInsight: () => testShowRecommendation("🧠 Test Insight", "This is a test insight that should show up!", "insight"),
      testSuggestion: () => testShowRecommendation("💡 Test Suggestion", "This is a test suggestion!", "suggestion"),
      help: () => {
        console.log(`
🔧 Intelligent Toast Debug Commands:
- intelligentToastDebug.clearCache() - Clear all caches
- intelligentToastDebug.clearInsights() - Clear only insight caches (for immediate testing)
- intelligentToastDebug.forceClear('recommendation-id') - Clear specific recommendation
- intelligentToastDebug.testInsight() - Show test insight
- intelligentToastDebug.testSuggestion() - Show test suggestion  
- intelligentToastDebug.getStatus() - Get cache status
- intelligentToastDebug.help() - Show this help
        `);
      }
    };
    
    // Auto-show help on first load
    console.log('🔧 Intelligent Toast Debug Commands loaded! Type intelligentToastDebug.help() for available commands.');
    
    return () => {
      delete (window as any).intelligentToastDebug;
    };
  }, [clearRecommendationCache, forceClearRecommendation, forceClearInsightCaches, testShowRecommendation, getRecommendationCacheStatus]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

    // Performance monitoring and contextual tips
  useEffect(() => {
    if (messages.length > 3) { // Reduced from 4 to 3 for earlier feedback
      const lastMessage = messages[messages.length - 1];
      const userMessages = messages.filter(m => m.role === 'user');
      
      // Contextual coding tips - reduced threshold
      const codeMessages = userMessages.filter(m => m.content.includes('```'));
      if (codeMessages.length >= 1 && lastMessage.role === 'user' && lastMessage.content.includes('```')) {
        setTimeout(() => {
          if (selectedLLMModel?.id !== 'gpt-4o' && selectedLLMModel?.id !== 'gpt-4-turbo') {
            showOptimizationTip(
              "For extensive code analysis, GPT-4 models provide more accurate responses",
              () => {
                toast.success("Consider switching to GPT-4 for better code assistance!");
              }
            );
          }
        }, 3000); // Reduced delay from 5000 to 3000
      }

      // Lower conversation length warning threshold 
      if (messages.length > 20) { // Reduced from 35 to 20
        setTimeout(() => {
          showPerformanceAlert(
            "Long conversation detected. Performance may start to degrade. Consider starting a new chat.",
            'low'
          );
        }, 5000); // Reduced delay from 8000 to 5000
      }

      // Expert-level complexity detection - reduced requirements
      const complexTerms = ['algorithm', 'optimization', 'architecture', 'scalability', 'distributed', 'microservices'];
      const recentUserMessages = userMessages.slice(-3);
      const techMessageCount = recentUserMessages.filter(m => 
        complexTerms.some(term => m.content.toLowerCase().includes(term))
      ).length;
      
      if (techMessageCount >= 1 && selectedSystemPreset === 'DEFAULT' && messages.length > 4) { // Reduced requirements
        setTimeout(() => {
          showOptimizationTip(
            "For sustained technical discussions, the Technical system preset provides more detailed responses",
            () => {
              handleSystemPresetChange('TECHNICAL');
              toast.success("Switched to Technical system preset!");
            }
          );
        }, 4000); // Reduced delay from 6000 to 4000
      }
    }
  }, [messages, selectedLLMModel, selectedSystemPreset, showOptimizationTip, showPerformanceAlert]);

   // Periodic performance monitoring - reduced thresholds
   useEffect(() => {
     if (!selectedLLMModel || messages.length < 5) return; // Reduced from 10 to 5

     const checkPerformance = () => {
       // Alert for conversation getting very long - reduced threshold
       if (messages.length > 30) { // Reduced from 50 to 30
         showPerformanceAlert(
           "Very long conversation detected. Performance may degrade. Consider starting a new chat.",
           'medium'
         );
       }

       // Model efficiency tips based on usage patterns
       const recentUserMessages = messages.filter(m => m.role === 'user').slice(-5); // Reduced from 8 to 5
       const codeQuestions = recentUserMessages.filter(m => 
         m.content.toLowerCase().includes('code') || 
         m.content.toLowerCase().includes('programming') ||
         m.content.includes('```')
       );

       // Suggest if half or more of recent messages are code-related
       if (codeQuestions.length >= 2 && selectedLLMModel.category !== 'code' && selectedLLMModel.id !== 'gpt-4o') { // Reduced from 4 to 2
         setTimeout(() => {
           showOptimizationTip(
             "You're doing a lot of coding work. GPT-4o would provide more accurate code assistance",
             () => {
               toast.success("Consider a code-optimized model for programming tasks!");
             }
           );
         }, 3000); // Reduced delay from 5000 to 3000
       }
     };

     const interval = setInterval(checkPerformance, 180000); // Reduced from 5 minutes to 3 minutes
     return () => clearInterval(interval);
   }, [messages, selectedLLMModel, showOptimizationTip, showPerformanceAlert]);

  useEffect(() => {
    if (input.startsWith('/')) {
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  }, [input]);

  const handleSend = async () => {
    console.log('🚀 handleSend called with input:', input.trim());
    console.log('🚀 handleSend - isLoading:', isLoading);
    console.log('🚀 handleSend - attachments.length:', attachments.length);
    
    if (!input.trim() && attachments.length === 0) {
      console.log('❌ handleSend - No input, returning');
      return;
    }
    if (isLoading) {
      console.log('❌ handleSend - Already loading, returning');
      return; // Prevent multiple requests
    }

    console.log('✅ handleSend - Proceeding with message send');
    // Set chat as active to prevent interference from intelligent toasts
    setIsChatActive(true);
    const startTime = Date.now();
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: "user",
      timestamp: new Date(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      metadata: attachedFileIds.length ? { attachedFileIds } : undefined
    };

    const updatedMessages = [...messages, userMessage];
    
    // DEBUG: Log current conversation state
    console.log('🗨️ Current conversation state before sending to AI:');
    updatedMessages.forEach((msg, index) => {
      console.log(`  [${index}] ${msg.role} (${msg.id}): ${msg.content.substring(0, 60)}...`);
    });
    
    console.log('📝 Adding user message to chat:', userMessage);
    setMessages(updatedMessages);
    setInput("");
    setAttachments([]);
    setAttachedFileIds([]);
    setIsTyping(true);
    setActiveMessage(userMessage.id);
    clearError(); // Clear any previous errors
    console.log('📝 User message added, proceeding to AI call');

    try {
      if (enableStreaming) {
        // Handle streaming response
        console.log('📤 Using STREAMING mode with provider:', currentProvider);
        const aiMessageId = (Date.now() + 1).toString();
        const aiMessage: Message = {
          id: aiMessageId,
          content: "",
          role: "assistant",
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, aiMessage]);
        setStreamingResponse("");

        await sendStreamingMessage(updatedMessages, (chunk: string) => {
          setStreamingResponse(prev => {
            const newContent = prev + chunk;
            setMessages(prevMessages => 
              prevMessages.map(msg => 
                msg.id === aiMessageId 
                  ? { ...msg, content: newContent }
                  : msg
              )
            );
            return newContent;
          });
        });

        // After streaming completes, attempt to fetch sources from last backend response if available via a side channel in future

        setStreamingResponse("");
        
        // Auto-speak AI response if TTS is available and enabled (for streaming)
        if (speechAvailable && !isSpeaking) {
          const autoSpeak = localStorage.getItem('auto-speak-responses');
          if (autoSpeak === 'true') {
            // Get the final message content
            const finalMessage = messages.find(m => m.id === aiMessageId);
            if (finalMessage && finalMessage.content) {
              handleSpeak(aiMessageId, finalMessage.content);
            }
          }
        }
      } else {
        // Handle non-streaming response
        console.log('📤 Sending message to AI provider:', currentProvider);
        const response = await sendMessage(updatedMessages);
        console.log('📥 Received response:', response ? `${response.substring(0, 100)}...` : 'EMPTY/UNDEFINED');
        // If backend attaches sources, it must come with structured data. Current hooks return string only.
        
        if (!response) {
          console.error('❌ Empty response received from AI provider');
          throw new Error('No response received from AI provider');
        }
        
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response,
          role: "assistant",
          timestamp: new Date(),
        };
        console.log('💬 Adding AI message to chat:', aiMessage);
        console.log('🔍 ChatView: Current messages before adding:', messages.length);
        setMessages(prev => {
          const newMessages = [...prev, aiMessage];
          console.log('🔍 ChatView: New messages after adding:', newMessages.length);
          return newMessages;
        });
        
        // Auto-speak AI response if TTS is available and enabled
        if (speechAvailable && !isSpeaking && response) {
          const autoSpeak = localStorage.getItem('auto-speak-responses');
          if (autoSpeak === 'true') {
            handleSpeak(aiMessage.id, response);
          }
        }
      }

      // Trigger intelligent analysis and track performance - earlier triggering
      const responseTime = Date.now() - startTime;
      const estimatedTokens = userMessage.content.length * 1.3; // Rough estimate
      
      console.log(`📊 Message sent. Total messages: ${updatedMessages.length}, Response time: ${responseTime}ms, Estimated tokens: ${estimatedTokens}`);
      
      // Credit balance will be updated automatically via real-time updates from AI response
      
      // Track message sending and analyze conversation - reduced threshold for earlier analysis
      if (updatedMessages.length >= 2) { // Temporarily reduced to 2 for immediate testing
        console.log(`🚀 Triggering conversation analysis for ${updatedMessages.length} messages...`);
        console.log(`🔧 AI Service available: ${!!aiServiceRef.current}`);
        console.log(`🔧 Selected LLM Model: ${selectedLLMModel?.name || 'none'}`);
        
        setTimeout(() => {
          if (selectedLLMModel) {
            console.log('📞 Calling analyzeConversation...');
            // Wrap in try-catch to prevent analysis errors from breaking chat
            try {
              analyzeConversation(updatedMessages, selectedLLMModel, responseTime, estimatedTokens, isChatActive)
                .then(() => {
                  console.log('✅ analyzeConversation completed successfully');
                })
                .catch((error) => {
                  // Log error but don't let it break the chat
                  console.error('⚠️ analyzeConversation failed (non-critical):', error);
                });
            } catch (error) {
              // Catch any synchronous errors
              console.error('⚠️ analyzeConversation error (non-critical):', error);
            }
          } else {
            console.warn('⚠️ No selectedLLMModel available for analysis');
          }
        }, 2000); // Reduced delay from 5000 to 2000 for quicker feedback
      } else {
        console.log(`⏳ Not enough messages for analysis yet (${updatedMessages.length}/2)`);
      }

    } catch (err) {
      // Track error occurrence
      trackAction('error_occurred');
      
      // Use centralized error handling
      handleError(err as Error, {
        operation: 'send_message',
        component: 'ChatView',
        userId: user?.id?.toString(),
        timestamp: new Date()
      });
      
      // Check if this is a credit limit error (402 status)
      if (err instanceof Error && err.message.includes('Subscription error:')) {
        try {
          // Try to parse the error response for credit limit data
          const errorData = JSON.parse(err.message.replace('Subscription error: ', ''));
          
          if (errorData.code === 'MESSAGE_LIMIT_EXCEEDED' || 
              errorData.code === 'INSUFFICIENT_CREDITS' || 
              errorData.code === 'NO_CREDITS_AVAILABLE') {
            
            // Show credit limit message instead of generic error
            const creditLimitMessage: Message = {
              id: (Date.now() + 1).toString(),
              content: '',
              role: "assistant",
              timestamp: new Date(),
              isCreditLimit: true,
              metadata: errorData,
            };
            
            setMessages(prev => [...prev, creditLimitMessage]);
            return; // Don't show generic error
          }
        } catch (parseError) {
          // If parsing fails, fall through to generic error
          console.error('Failed to parse credit limit error:', parseError);
        }
      }
      
      // Generic error handling
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}. Please check your configuration and try again.`,
        role: "assistant",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setActiveMessage(null);
      // Clear chat active flag after a short delay to ensure response is complete
      setTimeout(() => setIsChatActive(false), 1000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle upgrade to Pro subscription
  const handleUpgradeToPro = async () => {
    if (!user) {
      navigateTo('/login');
      return;
    }

    try {
      // Create Stripe Checkout Session for Pro subscription
      const response = await fetch('/api/checkout/subscription', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier: 'pro',
          interval: 'monthly', // Default to monthly
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();
      
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error upgrading to Pro:', error);
      // Fallback to pricing page
      navigateTo('/pricing');
    }
  };

  // Handle purchase credits with dynamic package selection
  const handlePurchaseCredits = async (packageId: string) => {
    if (!user) {
      navigateTo('/login');
      return;
    }

    try {
      // Create Stripe Checkout Session for selected credit package
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
      
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error purchasing credits:', error);
      // Fallback to pricing page
      navigateTo('/pricing');
    }
  };

  const selectCommand = (command: CommandSuggestion) => {
    // Enhanced functionality - open appropriate modal instead of just inserting text
    setShowCommands(false);
    
    // Track command usage
    trackAction('use_command', { command: command.prefix });
    
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
        // Fallback to original behavior for unknown commands
        setInput(command.prefix + " ");
        inputRef.current?.focus();
    }

    // Show feature enhancement tips for advanced commands - only for first-time usage
    setTimeout(() => {
      if (command.prefix === "/analyze" && messages.length < 8) {
        const hasUsedAnalyzeBefore = messages.some(m => 
          m.content.includes('/analyze') || m.content.toLowerCase().includes('analyze')
        );
        
        if (!hasUsedAnalyzeBefore) {
          showOptimizationTip(
            "Pro tip: Analysis works best with detailed conversations and specific questions",
            () => {
              toast.success("Try asking detailed questions for better analysis!");
            }
          );
        }
      }
    }, 4000);
  };



  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setAttachedFileIds(prev => prev.filter((_, i) => i !== index));
  };

  // Transcript handling functions
  const handleDownloadTranscript = async () => {
    try {
      downloadTranscript(messages, true);
      toast.success('Transcript downloaded successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download transcript');
    }
  };

  const handleCopyTranscript = async () => {
    try {
      await copyTranscriptToClipboard(messages, true);
      toast.success('Transcript copied to clipboard!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy transcript');
    }
  };

  const handleShareTranscript = async () => {
    try {
      const result = await shareTranscript(messages, true);
      if (result.method === 'share') {
        toast.success('Transcript shared successfully!');
      } else {
        toast.success('Transcript copied to clipboard for sharing!');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to share transcript');
    }
  };




  // Update welcome message when user profile changes
  useEffect(() => {
    setMessages(prev => {
      const newMessages = [...prev];
      if (newMessages.length > 0 && newMessages[0].id === "1") {
        newMessages[0] = {
          ...newMessages[0],
          content: greeting || "Hello! I'm Uterpi's AI. What would you like to accomplish today?",
        };
      }
      return newMessages;
    });
  }, [greeting]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <Particles
          className="absolute inset-0"
          quantity={150}
          color="#8B5CF6"
          size={1}
          staticity={30}
        />
        
        {/* Holographic Gradients */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-violet-500/10 to-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-indigo-600/10 rounded-full blur-3xl animate-pulse delay-1000" />
        
        {/* Circuit Patterns */}
        <div className="absolute inset-0 opacity-5">
          <CircuitPattern className="absolute top-10 left-10 w-20 h-20 text-violet-400" />
          <CircuitPattern className="absolute top-1/3 right-20 w-16 h-16 text-blue-400" />
          <CircuitPattern className="absolute bottom-20 left-1/3 w-24 h-24 text-purple-400" />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
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
                    onPurchaseComplete={() => {
                      fetchCreditStatus(); // Refresh credit status after purchase
                    }}
                  />
                </div>
              )}
              
              {/* Chat History */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={() => setShowChatHistory(true)}
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
                    onClick={startNewConversation}
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

              {/* Current Model */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={() => setShowShareModal(true)}
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
                  <MicPermissionBadge />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <RippleButton
                        onClick={() => setShowEditModal(true)}
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={() => setShowEditModal(true)}
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
              
              {/* DEV: Test Credit Purchase Button */}
              {/*<Tooltip>
                <TooltipTrigger asChild>
                  <RippleButton
                    onClick={() => {
                      // Create a test credit limit message to trigger the popup
                      const testCreditMessage: Message = {
                        id: (Date.now() + 1).toString(),
                        content: "You've reached your credit limit. Purchase more credits to continue chatting.",
                        role: "assistant",
                        timestamp: new Date(),
                        isCreditLimit: true,
                        metadata: {
                          code: 'INSUFFICIENT_CREDITS',
                          currentBalance: 0,
                          messagesUsed: 10,
                          monthlyAllowance: 10,
                          isFreemium: true,
                          creditsRequired: 1,
                          isTeamPooled: false,
                          purchaseUrl: '/settings/billing/credits',
                          upgradeUrl: '/pricing',
                          message: 'You have used all your free messages for this month.'
                        }
                      };
                      setMessages(prev => [...prev, testCreditMessage]);
                      toast.info("Test credit limit message added to chat");
                    }}
                    className="p-2 bg-amber-600/20 hover:bg-amber-600/30 rounded-lg border border-amber-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    aria-label="Test credit purchase popup"
                  >
                    <CreditCard className="w-4 h-4 text-amber-400" />
                  </RippleButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Test credit purchase popup (DEV)</p>
                </TooltipContent>
              </Tooltip>*/}
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
                      onClick={startNewConversation}
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

        {/* Messages */}
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
                        onUpgrade={handleUpgradeToPro}
                        onPurchaseCredits={handlePurchaseCredits}
                      />
                    ) : (
                      <HolographicBubble isUser={message.role === 'user'}>
                        <div className="space-y-2">
                          <p className="text-sm leading-relaxed">{message.content}</p>
                          {/* Show AI-generated indicator for the first message if it was AI-generated */}
                          {message.role === 'assistant' && message.id === "1" && isAIGenerated && (
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Sparkles className="w-3 h-3 text-violet-400" />
                            </div>
                          )}
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

                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{message.timestamp.toLocaleTimeString()}</span>
                            {message.role === 'assistant' && (
                              <div className="flex items-center gap-2">
                                {speechAvailable && message.content && (
                                  <button
                                    onClick={() => handleSpeak(message.id, message.content)}
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
            
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
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

                      // Add tooltips for available commands
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
                      <FileUp className="w-4 h-4 text-violet-400" />
                      <span className="text-sm">{file}</span>
                      <RippleButton
                        onClick={() => removeAttachment(index)}
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
                  
                  {/* Speech Settings Button */}
                  {speechAvailable && (
                    <>
                      <div className="w-px h-6 sm:h-8 bg-slate-700 flex-shrink-0" /> {/* Divider */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <RippleButton
                            onClick={() => setShowSpeechSettings(true)}
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
                  
                  <div className="w-px h-6 sm:h-8 bg-slate-700 flex-shrink-0" /> {/* Divider */}
                  
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
                        onClick={() => setShowSystemMessageModal(true)}
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
                        onClick={() => setShowFileManager(true)}
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
                      onChange={(e) => setInput(e.target.value)}
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
                          onClick={handleVoiceInput}
                          className={`p-2 ${isRecording ? 'text-red-400 animate-pulse' : 'text-slate-400 hover:text-violet-400'} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 flex-shrink-0`}
                          aria-label={isRecording ? "Stop recording" : "Start voice input"}
                        >
                          {isRecording ? (
                            <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />
                          ) : (
                            <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                          )}
                        </RippleButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {isRecording ? "Stop recording" : "Start voice input"}
                          {!isHTTPS && microphonePermission !== 'granted' && (
                            <span className="block text-xs text-yellow-400 mt-1">
                              ⚠️ HTTPS required for continuous access
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
                    onClick={() => setEnableStreaming(!enableStreaming)}
                    className={`p-2 rounded-lg transition-colors ${
                      enableStreaming 
                        ? "bg-violet-600 text-white" 
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {enableStreaming ? "Enabled" : "Disabled"}
                  </RippleButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{enableStreaming ? "Disable real-time streaming" : "Enable real-time streaming"}</p>
                </TooltipContent>
              </Tooltip>
              <span className="text-sm text-slate-400">
                {enableStreaming ? "Real-time responses" : "Wait for complete response"}
              </span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Azure AI Status
            </label>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${error ? "bg-red-500" : "bg-green-500"}`} />
              <span className="text-sm text-slate-300">
                {error ? "Configuration Error" : "Connected"}
              </span>
            </div>
            {error && (
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
              {/* Streamlined Provider & Model Selector */}
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
                  selectedPreset={selectedSystemPreset}
                  customMessage={customSystemMessage}
                  onPresetChange={handleSystemPresetChange}
                />
                
                {selectedSystemPreset === "custom" && (
                  <div className="space-y-3 p-4 bg-slate-800/30 backdrop-blur-sm rounded-lg border border-slate-600/50">
                    <label className="block text-sm font-medium text-white">
                      Custom System Message
                    </label>
                    <textarea
                      value={customSystemMessage}
                      onChange={(e) => setCustomSystemMessage(e.target.value)}
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
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowFileManager(false)}
            />
            
            {/* Modal */}
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
                    setAttachments(prev => [...prev, file.name]);
                    setAttachedFileIds(prev => [...prev, file.id]);
                    setShowFileManager(false);
                    toast.success(`Attached "${file.name}"`);
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
            await loadConversation(conversation.id, conversation.title || undefined);
            setShowChatHistory(false);
            toast.success(`Loaded conversation: ${conversation.title || 'Untitled'}`);
          } catch (error) {
            console.error('Failed to load conversation:', error);
            // Error toast is already shown in loadConversation function
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
