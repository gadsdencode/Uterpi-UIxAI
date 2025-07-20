import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Lock, Crown, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';

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
  quantity = 30,
  staticity = 50,
  ease = 50,
  size = 0.4,
  refresh = false,
  color = "hsl(var(--primary))",
  vx = 0,
  vy = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const circles = useRef<any[]>([]);
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

  const hexToRgb = (hex: string): number[] => {
    // Handle HSL color values
    if (hex.startsWith('hsl')) {
      // For simplicity, return a default RGB for HSL
      return [139, 92, 246]; // purple equivalent
    }
    hex = hex.replace("#", "");
    const hexInt = parseInt(hex, 16);
    const red = (hexInt >> 16) & 255;
    const green = (hexInt >> 8) & 255;
    const blue = hexInt & 255;
    return [red, green, blue];
  };

  useEffect(() => {
    if (canvasContainerRef.current && canvasRef.current) {
      context.current = canvasRef.current.getContext("2d");
      initCanvas();
      animate();
      window.addEventListener("resize", initCanvas);
      return () => window.removeEventListener("resize", initCanvas);
    }
  }, []);

  const initCanvas = () => {
    resizeCanvas();
    drawParticles();
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
    const targetAlpha = parseFloat((Math.random() * 0.6).toFixed(1));
    const dx = (Math.random() - 0.5) * 0.2;
    const dy = (Math.random() - 0.5) * 0.2;
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

  const drawCircle = (circle: Circle, update = false) => {
    if (context.current) {
      const { x, y, translateX, translateY, size, alpha } = circle;
      context.current.translate(translateX, translateY);
      context.current.beginPath();
      context.current.arc(x, y, size, 0, 2 * Math.PI);
      context.current.fillStyle = `rgba(${hexToRgb(color).join(", ")}, ${alpha})`;
      context.current.fill();
      context.current.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!update) {
        circles.current.push(circle);
      }
    }
  };

  const clearContext = () => {
    if (context.current) {
      context.current.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
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

  const animate = () => {
    clearContext();
    circles.current.forEach((circle: Circle, i: number) => {
      // Update the circle position based on mouse position
      const edge = [
        circle.x + circle.translateX - mouse.current.x,
        circle.y + circle.translateY - mouse.current.y,
      ];
      const distance = Math.sqrt(edge[0] * edge[0] + edge[1] * edge[1]);
      const maxDistance = Math.max(canvasSize.current.w, canvasSize.current.h);
      
      if (distance < maxDistance) {
        circle.alpha += (circle.targetAlpha - circle.alpha) * 0.02;
        circle.x += circle.dx;
        circle.y += circle.dy;
        circle.translateX += (edge[0] / distance) * circle.magnetism * -1;
        circle.translateY += (edge[1] / distance) * circle.magnetism * -1;
      } else {
        circle.alpha += (0 - circle.alpha) * 0.02;
        circle.x += circle.dx;
        circle.y += circle.dy;
      }

      if (circle.x < -circle.size || circle.x > canvasSize.current.w + circle.size || 
          circle.y < -circle.size || circle.y > canvasSize.current.h + circle.size) {
        circles.current[i] = circleParams();
      }

      drawCircle(circle, true);
    });
    window.requestAnimationFrame(animate);
  };

  return (
    <div className={className} ref={canvasContainerRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
};

interface SubscriptionGuardProps {
  children: React.ReactNode;
  requiredTier?: 'basic' | 'premium';
  feature?: string;
  fallback?: React.ReactNode;
}

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  children,
  requiredTier = 'basic',
  feature = 'this feature',
  fallback
}) => {
  const { user, logout } = useAuth();
  const { subscription, hasActiveSubscription, canAccessFeature, isLoading } = useSubscription();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Particles className="absolute inset-0 pointer-events-none" quantity={20} />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center p-8"
        >
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <Particles className="absolute inset-0 pointer-events-none" quantity={30} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
        >
          <Card className="max-w-md mx-auto border-border/50 bg-card/95 backdrop-blur-sm shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Lock className="h-5 w-5 text-primary" />
                Authentication Required
              </CardTitle>
              <CardDescription>
                Please log in to access {feature}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => window.location.href = '/login'} className="w-full bg-primary hover:bg-primary/90">
                Log In
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Check if user has access to the feature
  if (canAccessFeature(requiredTier)) {
    return <>{children}</>;
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show upgrade prompt
  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex items-center justify-center p-4">
      {/* Background Effects - Match App.tsx exactly */}
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
          <svg className="absolute top-10 left-10 w-20 h-20 text-violet-400" viewBox="0 0 100 100" fill="none">
            <path d="M10 10h20v20h20v-20h20v40h-20v20h-40z" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.1" />
            <circle cx="30" cy="30" r="2" fill="currentColor" opacity="0.2" />
            <circle cx="70" cy="50" r="2" fill="currentColor" opacity="0.2" />
          </svg>
          <svg className="absolute top-1/3 right-20 w-16 h-16 text-blue-400" viewBox="0 0 100 100" fill="none">
            <path d="M10 10h20v20h20v-20h20v40h-20v20h-40z" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.1" />
            <circle cx="30" cy="30" r="2" fill="currentColor" opacity="0.2" />
            <circle cx="70" cy="50" r="2" fill="currentColor" opacity="0.2" />
          </svg>
          <svg className="absolute bottom-20 left-1/3 w-24 h-24 text-purple-400" viewBox="0 0 100 100" fill="none">
            <path d="M10 10h20v20h20v-20h20v40h-20v20h-40z" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.1" />
            <circle cx="30" cy="30" r="2" fill="currentColor" opacity="0.2" />
            <circle cx="70" cy="50" r="2" fill="currentColor" opacity="0.2" />
          </svg>
        </div>
      </div>
      
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-auto"
      >
        <div className="relative p-8 rounded-2xl backdrop-blur-xl border overflow-hidden bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-600/30">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent" />
          
          {/* Holographic shimmer effect */}
          <motion.div
            className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatType: "loop", ease: "linear" }}
          />
          
          <div className="relative z-10">
            <div className="text-center mb-8">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
                className="flex justify-center mb-4"
              >
                <div className="rounded-full bg-violet-400/10 p-3 border border-violet-400/20">
                  <Crown className="h-8 w-8 text-violet-400" />
                </div>
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Unlock {feature}
              </h2>
              <p className="text-slate-300 mb-3">
                Just <span className="text-violet-400 font-bold text-lg">$5/month</span>
              </p>
              <p className="text-slate-400 text-sm">
                {feature} requires a {requiredTier} subscription or higher
              </p>
            </div>
            
            <div className="space-y-6">
              {/* Current Status */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">Current Plan</p>
                    <p className="text-sm text-slate-300">
                      {subscription?.tier || 'free'}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-violet-400/10 text-violet-400 border border-violet-400/20 rounded text-sm">
                    {subscription?.status || 'free'}
                  </span>
                </div>
              </motion.div>

              {/* Feature Benefits */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h3 className="font-medium mb-3 text-white">What you'll get for just $5/month:</h3>
                <ul className="space-y-2">
                  {[
                    'Unlimited AI interactions',
                    'Advanced code analysis & debugging',
                    'UI generation & cloning', 
                    'Performance insights & optimization',
                    'All AI models available',
                    'Priority support & processing'
                  ].map((featureItem, index) => (
                    <motion.li 
                      key={featureItem}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle className="h-4 w-4 text-violet-400 flex-shrink-0" />
                      <span className="text-sm text-slate-300">{featureItem}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>

              {/* Action Buttons */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="space-y-3"
              >
                <button
                  onClick={() => window.location.href = '/subscribe'}
                  className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 rounded-xl text-white font-medium transition-all duration-200 flex items-center justify-center gap-2"
                >
                  Get Started for $5/month
                  <ArrowRight className="h-4 w-4" />
                </button>
                
                <button
                  onClick={() => logout()}
                  className="w-full py-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 rounded-xl text-white font-medium transition-all duration-200"
                >
                  Go Back
                </button>
              </motion.div>

              {/* Payment Failed Alert */}
              <AnimatePresence>
                {subscription?.status === 'past_due' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
                  >
                    <p className="text-red-400 text-sm">
                      Your payment method needs to be updated. Please update your billing information to regain access.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
       </motion.div>
     </div>
    );
  };

// Usage examples:
// <SubscriptionGuard feature="AI code analysis">
//   <CodeAnalysisComponent />
// </SubscriptionGuard>
//
// <SubscriptionGuard requiredTier="premium" feature="advanced AI features">
//   <PremiumFeatures />
// </SubscriptionGuard> 