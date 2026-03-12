// shared.tsx - Shared UI components for the chat interface
// Contains reusable button, modal, and animation components

import React, { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain } from 'lucide-react';

// RippleButton - Button with ripple effect on click
export const RippleButton = forwardRef<
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
        onClick(e);
      } catch (error) {
        console.error('Error in onClick handler:', error);
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

// OrigamiModal - Animated modal with origami-style transitions
export const OrigamiModal: React.FC<{
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

// HolographicBubble - Message bubble with holographic styling
export const HolographicBubble: React.FC<{
  children: React.ReactNode;
  isUser?: boolean;
  className?: string;
  isNewMessage?: boolean;
}> = ({ children, isUser = false, className, isNewMessage = false }) => (
  <motion.div
    initial={isNewMessage ? { opacity: 0, scale: 0.95, y: 15 } : { opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={
      isNewMessage 
        ? { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
        : { type: "spring", damping: 20, stiffness: 300 }
    }
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
  </motion.div>
);

// TypingIndicator - Shows when AI is thinking/typing
export const TypingIndicator: React.FC<{ variant?: 'thinking' | 'typing' }> = ({ variant = 'thinking' }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.3 }}
  >
    <HolographicBubble>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-violet-400 rounded-full"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-400 animate-pulse" />
          <span className="text-sm text-slate-300">
            {variant === 'thinking' ? 'Thinking...' : 'AI is typing...'}
          </span>
        </div>
      </div>
    </HolographicBubble>
  </motion.div>
);

// NeuralNetworkPulse - Active message indicator animation
export const NeuralNetworkPulse: React.FC<{ isActive?: boolean }> = ({ isActive = false }) => (
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

// MicPermissionBadge - Shows microphone permission status
export const MicPermissionBadge: React.FC<{
  microphonePermission: PermissionState | 'unsupported';
  isHTTPS: boolean;
}> = ({ microphonePermission, isHTTPS }) => (
  <div className="flex items-center gap-2 text-xs text-slate-400">
    <span className={`w-2 h-2 rounded-full ${
      microphonePermission === 'granted' ? 'bg-green-500' : 
      microphonePermission === 'denied' ? 'bg-red-500' : 'bg-yellow-500'
    }`} />
    <span>
      Mic: {microphonePermission === 'granted' ? 'Granted' : 
           microphonePermission === 'denied' ? 'Denied' : 'Prompt'}
      {!isHTTPS && microphonePermission !== 'granted' && (
        <span className="ml-2 text-yellow-400">(HTTPS recommended)</span>
      )}
    </span>
  </div>
);

