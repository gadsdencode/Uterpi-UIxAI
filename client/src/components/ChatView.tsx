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
  Zap,
  Brain,
  Cpu,
  CircuitBoard,
  AlertCircle,
  Download,
  Copy,
  ExternalLink
} from "lucide-react";
import { Message, CommandSuggestion, LLMModel, ModelCapabilities } from "../types";
import { useAzureAI, SYSTEM_MESSAGE_PRESETS } from "../hooks/useAzureAI";
import { useIntelligentToast } from "../hooks/useIntelligentToast";
import { AzureAIService } from "../lib/azureAI";
import LLMModalSelector from './LLMModelSelector';
import { SystemMessageSelector } from './SystemMessageSelector';
import CloneUIModal from './CloneUIModal';
import CreatePageModal from './CreatePageModal';
import ImproveModal from './ImproveModal';
import AnalyzeModal from './AnalyzeModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { toast } from "sonner";
import { useAuth } from '../hooks/useAuth';
import { 
  downloadTranscript, 
  copyTranscriptToClipboard, 
  shareTranscript, 
  isWebShareSupported 
} from '../lib/transcriptUtils';

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
    label: "Analyze",
    description: "Analyze design patterns",
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
        ? "bg-gradient-to-br from-violet-500/20 to-purple-600/20 border-violet-400/30 ml-12" 
        : "bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30 mr-12"
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

const RippleButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}> = ({ children, onClick, className, disabled = false }) => {
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
    
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
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
};

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
  
  // Create personalized welcome message
  const getPersonalizedWelcome = useCallback(() => {
    if (!user) {
      return "Hello! I'm Nomad AI. What would you like to accomplish today?";
    }

    const name = user.firstName || user.username || "there";
    const greeting = `Hello ${name}! I'm Nomad AI.`;
    
    const personalizations = [];
    
    if (user.bio) {
      personalizations.push(`I see you're interested in ${user.bio.toLowerCase()}.`);
    }
    
    if (user.age) {
      if (user.age < 25) {
        personalizations.push("I'm here to help with any questions or projects you're working on.");
      } else if (user.age < 40) {
        personalizations.push("Whether it's work, personal projects, or learning something new, I'm here to assist.");
      } else {
        personalizations.push("I'm here to help with any professional or personal endeavors.");
      }
    }

    // Check for birthday
    if (user.dateOfBirth) {
      const birthDate = new Date(user.dateOfBirth);
      const today = new Date();
      const isToday = birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate();
      
      if (isToday) {
        return `🎉 ${greeting} Happy Birthday! I hope you're having a wonderful day. What would you like to explore together today?`;
      }
    }
    
    if (personalizations.length > 0) {
      return `${greeting} ${personalizations.join(' ')} What would you like to work on today?`;
    }
    
    return `${greeting} What would you like to accomplish today?`;
  }, [user]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: getPersonalizedWelcome(),
      role: "assistant",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLLMSelector, setShowLLMSelector] = useState(false);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Azure AI hook
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
    refreshCapabilities
  } = useAzureAI({
    enableStreaming,
    systemMessage: getCurrentSystemMessage(),
    chatOptions: {
      maxTokens: 2048,
      temperature: 0.8,
      topP: 0.1
    },
    userContext: { user } // Pass user context correctly
  });

  // Get AI service instance for intelligent toasts
  const aiServiceRef = useRef<any>(null);
  useEffect(() => {
    const getAIService = async () => {
      try {
        const { AzureAIService } = await import('../lib/azureAI');
        if (!aiServiceRef.current) {
          const config = AzureAIService.createFromEnv();
          aiServiceRef.current = new AzureAIService(config);
          console.log('✅ AI Service initialized for intelligent toasts');
        }
      } catch (err) {
        console.warn('Failed to initialize AI service for toasts:', err);
      }
    };
    getAIService();
  }, []);

  // Intelligent toast system - pass toast function explicitly
  const {
    analyzeConversation,
    trackAction,
    showOptimizationTip,
    showPerformanceAlert
  } = useIntelligentToast({
    enabled: true,
    aiService: aiServiceRef.current,
    onModelSwitch: (modelId: string) => {
      // Find and switch to the recommended model
      const availableModels = AzureAIService.getAvailableModels();
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
          content: getPersonalizedWelcome(),
          role: "assistant",
          timestamp: new Date(),
        }
      ]);
      toast.success("Started new conversation!");
    }
  });

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
    if (!input.trim() && attachments.length === 0) return;
    if (isLoading) return; // Prevent multiple requests

    const startTime = Date.now();
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: "user",
      timestamp: new Date(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };

    const updatedMessages = [...messages, userMessage];
    
    // DEBUG: Log current conversation state
    console.log('🗨️ Current conversation state before sending to AI:');
    updatedMessages.forEach((msg, index) => {
      console.log(`  [${index}] ${msg.role} (${msg.id}): ${msg.content.substring(0, 60)}...`);
    });
    
    setMessages(updatedMessages);
    setInput("");
    setAttachments([]);
    setIsTyping(true);
    setActiveMessage(userMessage.id);
    clearError(); // Clear any previous errors

    try {
      if (enableStreaming) {
        // Handle streaming response
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

        setStreamingResponse("");
      } else {
        // Handle non-streaming response
        const response = await sendMessage(updatedMessages);
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response,
          role: "assistant",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
      }

      // Trigger intelligent analysis and track performance - earlier triggering
      const responseTime = Date.now() - startTime;
      const estimatedTokens = userMessage.content.length * 1.3; // Rough estimate
      
      console.log(`📊 Message sent. Total messages: ${updatedMessages.length}, Response time: ${responseTime}ms, Estimated tokens: ${estimatedTokens}`);
      
      // Track message sending and analyze conversation - reduced threshold for earlier analysis
      if (updatedMessages.length >= 2) { // Temporarily reduced to 2 for immediate testing
        console.log(`🚀 Triggering conversation analysis for ${updatedMessages.length} messages...`);
        console.log(`🔧 AI Service available: ${!!aiServiceRef.current}`);
        console.log(`🔧 Selected LLM Model: ${selectedLLMModel?.name || 'none'}`);
        
        setTimeout(() => {
          if (selectedLLMModel) {
            console.log('📞 Calling analyzeConversation...');
            analyzeConversation(updatedMessages, selectedLLMModel, responseTime, estimatedTokens)
              .then(() => {
                console.log('✅ analyzeConversation completed successfully');
              })
              .catch((error) => {
                console.error('❌ analyzeConversation failed:', error);
              });
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
      
      // Error handling - show error message in chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}. Please check your Azure AI configuration and try again.`,
        role: "assistant",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setActiveMessage(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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



  const handleModelSelection = (model: LLMModel) => {
    updateModel(model);
    setShowLLMSelector(false);
    
    // Track model switching
    trackAction('model_switch');
    
    // Show optimization tip for model switching - only for significant switches
    if (messages.length > 8) {
      const isSignificantUpgrade = (
        (model.id === 'gpt-4o' || model.id === 'gpt-4-turbo') &&
        model.performance > 90
      );
      
      if (isSignificantUpgrade) {
        setTimeout(() => {
          showOptimizationTip(
            `${model.name} will provide more detailed and accurate responses for complex tasks`,
            () => {
              toast.success("Model upgrade applied!");
            }
          );
        }, 3000);
      }
    }
  };

  // Update welcome message when user profile changes
  useEffect(() => {
    setMessages(prev => {
      const newMessages = [...prev];
      if (newMessages.length > 0 && newMessages[0].id === "1") {
        newMessages[0] = {
          ...newMessages[0],
          content: getPersonalizedWelcome(),
        };
      }
      return newMessages;
    });
  }, [getPersonalizedWelcome]);

  return (
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
          className="p-6 border-b border-slate-800/50 backdrop-blur-xl"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Zap className="w-8 h-8 text-violet-400" />
                <motion.div
                  className="absolute inset-0 bg-violet-400/20 rounded-full blur-lg"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  NomadAI
                </h1>
                <p className="text-xs text-slate-400">UI x AI</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <RippleButton
                onClick={() => setShowShareModal(true)}
                className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50"
              >
                <Share2 className="w-4 h-4" />
              </RippleButton>
              <RippleButton
                onClick={() => setShowEditModal(true)}
                className="p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700/50"
              >
                <Edit3 className="w-4 h-4" />
              </RippleButton>
            </div>
          </div>
        </motion.header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  layout
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="relative max-w-[80%]">
                    <HolographicBubble isUser={message.role === 'user'}>
                      <div className="space-y-2">
                        <p className="text-sm leading-relaxed">{message.content}</p>
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
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>{message.timestamp.toLocaleTimeString()}</span>
                          {message.role === 'assistant' && (
                            <div className="flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              <span>AI</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </HolographicBubble>
                    
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
          className="p-6 border-t border-slate-800/50 backdrop-blur-xl"
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

                      return buttonContent;
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
            {error && (
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
              <div className="flex items-end gap-4 p-4 bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
                <div className="flex gap-2">
                  <RippleButton
                    onClick={() => setShowCommands(!showCommands)}
                    className="p-2 text-slate-400 hover:text-violet-400 transition-colors"
                  >
                    <Command className="w-5 h-5" />
                  </RippleButton>
                  <RippleButton
                    onClick={() => setShowSystemMessageModal(true)}
                    className="p-2 text-slate-400 hover:text-violet-400 transition-colors"
                  >
                    <Brain className="w-5 h-5" />
                  </RippleButton>

                </div>
                
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
                
                <RippleButton
                  onClick={handleSend}
                  disabled={(!input.trim() && attachments.length === 0) || isLoading}
                  className="p-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-xl transition-all duration-200"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </RippleButton>
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
        title="Azure AI Settings"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Streaming Mode
            </label>
            <div className="flex items-center gap-3">
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
            <div className="p-3 bg-slate-800 rounded-lg space-y-3">
              <div>
                <p className="text-sm text-slate-300">
                  Current Model: {selectedLLMModel ? selectedLLMModel.name : (currentModel || "Ministral-3B")}
                </p>
                {selectedLLMModel && (
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedLLMModel.provider} • {selectedLLMModel.category} • {selectedLLMModel.tier}
                  </p>
                )}
              </div>
              <RippleButton
                onClick={() => setShowLLMSelector(true)}
                className="w-full px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-white text-sm transition-colors"
              >
                Choose Model
              </RippleButton>
            </div>
            <div className="mt-2">
              <p className="text-xs text-slate-400">
                Endpoint: {import.meta.env.VITE_AZURE_AI_ENDPOINT ? "Configured" : "Not configured"}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Configuration Help
            </label>
            <div className="text-xs text-slate-400 space-y-1">
              <p>1. Copy env.template to .env</p>
              <p>2. Add your Azure AI endpoint and API key</p>
              <p>3. Restart the development server</p>
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
                <RippleButton
                  onClick={() => setShowSystemMessageModal(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </RippleButton>
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
                  <RippleButton
                    onClick={() => setShowSystemMessageModal(false)}
                    className="px-6 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-white font-medium"
                  >
                    Apply Settings
                  </RippleButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LLM Model Selector Modal */}
      <LLMModalSelector
        isOpen={showLLMSelector}
        onClose={() => setShowLLMSelector(false)}
        onSelect={handleModelSelection}
        selectedModel={selectedLLMModel}
      />

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
    </div>
  );
};

export default FuturisticAIChat;
