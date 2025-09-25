import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from "framer-motion";
import FuturisticAIChat from './components/ChatView'
import { Toaster } from './components/ui/sonner'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LoginForm } from './components/auth/LoginForm'
import { RegisterForm } from './components/auth/RegisterForm'
import { ForgotPasswordForm } from './components/auth/ForgotPasswordForm'
import { UserMenu } from './components/auth/UserMenu'
import { SubscriptionGuard } from './components/SubscriptionGuard'
import { Button } from './components/ui/button'
import { Card, CardContent } from './components/ui/card'
import { Loader2, Zap } from 'lucide-react'
// Import model migration utilities for debugging
import './lib/modelMigration'

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

  return (
    <div className={className} ref={canvasContainerRef} aria-hidden="true">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
};

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
  className?: string;
}> = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ type: "spring", damping: 20, stiffness: 300 }}
    className={`
      relative p-8 rounded-2xl backdrop-blur-xl border overflow-hidden
      bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30
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

const RippleButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}> = ({ children, onClick, className, disabled = false, type = "button" }) => {
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
        onClick();
      } catch (error) {
        console.error('Error in onClick handler:', error);
      }
    }
  };

  return (
    <button
      type={type}
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

const AuthenticatedApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password'>('login');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex items-center justify-center p-4">
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
        <div className="relative z-10 w-full max-w-md mx-auto">
          <HolographicBubble>
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-violet-400" />
              <p className="text-lg font-medium text-white">Loading...</p>
              <p className="text-sm text-slate-300">Checking authentication status</p>
            </div>
          </HolographicBubble>
        </div>
      </div>
    );
  }

  if (!user) {
    if (!showAuth) {
      return (
        <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex items-center justify-center p-4">
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
          <div className="relative z-10 w-full max-w-md mx-auto">
            <HolographicBubble>
              <div className="text-center mb-8">
                <div className="flex items-center justify-center mb-4">
                  <div className="relative">
                    <img 
                      src="/images/uterpi_logo.png" 
                      alt="Uterpi Logo" 
                      className="w-72 h-72 rounded-full"
                    />
                    <motion.div
                      className="absolute inset-0 bg-violet-400/20 rounded-full blur-lg"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                </div>
                <p className="text-sm bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent font-bold pt-2">
                Please sign in or create an account
                </p>
                <div className="mt-4 p-3 bg-violet-500/10 rounded-lg border border-violet-400/20">
                  <p className="text-sm text-white mb-2">
                    🚀 <span className="font-bold">Your Interface for AI</span>
                  </p>
                  <div className="flex flex-col gap-3 mb-3">
                    <div className="p-2 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-400/20">
                      <p className="text-green-400 font-bold text-sm">Start Today</p>
                      <p className="text-xs text-slate-300">10 free messages per month to start your journey with Uterpi</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1 text-center">
                        <p className="text-violet-400 font-bold text-base">$19<span className="text-xs font-normal">/mo</span></p>
                        <p className="text-xs text-slate-400">Pro • Higher Message Limit • More AI Credits</p>
                      </div>
                      <div className="flex-1 text-center border-l-0 sm:border-l border-violet-400/20">
                        <p className="text-violet-400 font-bold text-base">$49<span className="text-xs font-normal">/user</span></p>
                        <p className="text-xs text-slate-400">Team • Shared AI Credits</p>
                      </div>
                      <div className="flex-1 text-center border-l-0 sm:border-l border-violet-400/20">
                        <p className="text-blue-400 font-bold text-sm">Pay as you go</p>
                        <p className="text-xs text-slate-400">AI Credits: 2¢ each</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <p>• Use any AI model + Uterpi's proprietary LLM</p>
                    <p>• Custom templates & personas to make Uterpi your own</p>
                    <p>• AI analyzes and suggests optimizations to your workflow</p>
                    <p>• Purchase AI Credits as needed - they never expire</p>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-4 w-full">
                <RippleButton
                  onClick={() => {
                    setAuthMode('login');
                    setShowAuth(true);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-xl text-white font-medium transition-all duration-200"
                >
                  Sign In
                </RippleButton>
                <RippleButton
                  onClick={() => {
                    setAuthMode('register');
                    setShowAuth(true);
                  }}
                  className="w-full py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 rounded-xl text-white font-medium transition-all duration-200"
                >
                  <p className="text-md font-bold bg-gradient-to-r from-violet-500 to-purple-600 bg-clip-text text-transparent">Start your journey with Uterpi for free!</p>
                  <br />
                  <p className="text-xs text-slate-400">10 Messages Included Monthly + Bring Your Own AI API Keys</p>
                </RippleButton>
                <p className="text-xs text-slate-400 text-center">
                  ⚠️ Some LLMs may have parameters that are not currently supported by Uterpi.
                </p>
              </div>
            </HolographicBubble>
          </div>
        </div>
      );
    }

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

        {/* Auth Forms - positioned to cover the entire screen */}
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md mx-auto">
            {authMode === 'login' && (
              <LoginForm
                onSwitchToRegister={() => setAuthMode('register')}
                onForgotPassword={() => setAuthMode('forgot-password')}
                onSuccess={() => setShowAuth(false)}
              />
            )}
            {authMode === 'register' && (
              <RegisterForm
                onSwitchToLogin={() => setAuthMode('login')}
                onSuccess={() => setShowAuth(false)}
              />
            )}
            {authMode === 'forgot-password' && (
              <ForgotPasswordForm
                onBackToLogin={() => setAuthMode('login')}
              />
            )}
          </div>
        
          <div className="absolute top-6 left-6">
            <RippleButton
            onClick={() => setShowAuth(false)}
              className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 rounded-lg text-white font-medium transition-all duration-200"
          >
            ← Back
            </RippleButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen w-full">
      <div className="absolute top-4 right-4 z-50">
        <UserMenu />
      </div>
      <SubscriptionGuard 
        feature="NomadAI" 
        requiredTier="freemium"
      >
        <FuturisticAIChat />
      </SubscriptionGuard>
    </main>
  );
};

function App() {
  return <AuthenticatedApp />;
}

export default App
