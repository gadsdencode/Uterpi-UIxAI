/**
 * Multi-tier Pricing Page Component
 */

import React, { useState, useEffect, useRef } from 'react';
import { Check, X, Sparkles, Users, Building2, CreditCard, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { navigateTo } from './Router';

// Particles component for background effects (copied from ChatView)
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const circles = useRef<any[]>([]);
  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;

  useEffect(() => {
    if (canvasRef.current) {
      context.current = canvasRef.current.getContext("2d");
    }
    initCanvas();
    animate();
    
    const handleResize = () => initCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [color]);

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

  const circleParams = () => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);
    const translateX = 0;
    const translateY = 0;
    const pSize = Math.floor(Math.random() * 2) + size;
    const alpha = 0;
    const targetAlpha = parseFloat((Math.random() * 0.6 + 0.1).toFixed(1));
    const dx = (Math.random() - 0.5) * 0.2;
    const dy = (Math.random() - 0.5) * 0.2;
    const magnetism = 0.1 + Math.random() * 4;
    return { x, y, translateX, translateY, size: pSize, alpha, targetAlpha, dx, dy, magnetism };
  };

  const drawCircle = (circle: any, update = false) => {
    if (context.current) {
      const { x, y, translateX, translateY, size, alpha } = circle;
      context.current.translate(translateX, translateY);
      context.current.beginPath();
      context.current.arc(x, y, size, 0, 2 * Math.PI);
      context.current.fillStyle = color;
      context.current.globalAlpha = alpha;
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
    circles.current.forEach((circle: any, i: number) => {
      circle.x += circle.dx + vx;
      circle.y += circle.dy + vy;
      drawCircle(circle, true);
      
      if (circle.x < -circle.size || circle.x > canvasSize.current.w + circle.size ||
          circle.y < -circle.size || circle.y > canvasSize.current.h + circle.size) {
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

interface PlanFeature {
  name: string;
  included: boolean;
  value?: string | number;
  tooltip?: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year';
  popular?: boolean;
  features: PlanFeature[];
  aiCredits: number;
  maxProjects: number;
  teamSize?: number;
  supportLevel: string;
  ctaText: string;
  disabled?: boolean;
}

const PricingPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [isGrandfathered, setIsGrandfathered] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch current subscription details
  useEffect(() => {
    if (user) {
      fetchSubscriptionDetails();
    }
  }, [user]);

  const fetchSubscriptionDetails = async () => {
    if (!user) {
      return; // Don't fetch if user is not authenticated
    }

    try {
      const response = await fetch('/api/subscription/details', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentPlan(data.tier);
        setIsGrandfathered(data.grandfather?.isGrandfathered || false);
      } else if (response.status === 401) {
        // User not authenticated, just return without error
        console.log('User not authenticated for subscription details');
        return;
      } else {
        // Try to parse error response
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          console.error('Error fetching subscription details:', errorData.error || 'Unknown error');
        } else {
          console.error('Error fetching subscription details: Server returned non-JSON response');
        }
      }
    } catch (error) {
      console.error('Error fetching subscription details:', error);
    }
  };

  const plans: SubscriptionPlan[] = [
    {
      id: 'freemium',
      name: 'Base Plan',
      description: 'Get started with basic AI assistance',
      price: 0,
      interval: billingInterval,
      aiCredits: 100,
      maxProjects: 1,
      supportLevel: 'Community',
      ctaText: currentPlan === 'freemium' ? 'Current Plan' : 'Downgrade',
      disabled: currentPlan === 'freemium',
      features: [
        { name: 'Basic Chat Access', included: true },
        { name: 'AI Credits per Month', included: true, value: '100' },
        { name: 'Projects', included: true, value: '1' },
        { name: 'Full Codebase Context', included: false },
        { name: 'Git Integration', included: false },
        { name: 'AI Code Reviews', included: false },
        { name: 'Team Features', included: false },
        { name: 'Priority Support', included: false },
      ],
    },
    {
      id: 'pro',
      name: 'Pro Plan',
      description: 'Perfect for individual developers',
      price: billingInterval === 'month' ? 19 : 190,
      interval: billingInterval,
      popular: true,
      aiCredits: 1000,
      maxProjects: 1,
      supportLevel: 'Email',
      ctaText: currentPlan === 'pro' ? 'Current Plan' : 'Upgrade to Pro',
      disabled: currentPlan === 'pro',
      features: [
        { name: 'Unlimited Chat & AI Providers', included: true },
        { name: 'AI Credits per Month', included: true, value: '1,000' },
        { name: 'Projects with Full Context', included: true, value: '1' },
        { name: 'Full Codebase Context', included: true },
        { name: 'Git Integration', included: true },
        { name: 'AI Code Reviews', included: true, value: '10/month' },
        { name: 'Team Features', included: false },
        { name: 'Priority Support', included: false },
      ],
    },
    {
      id: 'team',
      name: 'Team Plan',
      description: 'Built for growing teams',
      price: billingInterval === 'month' ? 49 : 490,
      interval: billingInterval,
      aiCredits: 5000,
      maxProjects: 5,
      teamSize: 5,
      supportLevel: 'Priority Email',
      ctaText: 'Upgrade to Team',
      features: [
        { name: 'Everything in Pro', included: true },
        { name: 'AI Credits per User', included: true, value: '5,000/month' },
        { name: 'Projects per User', included: true, value: '5' },
        { name: 'Shared Workspaces', included: true },
        { name: 'Team Personas', included: true },
        { name: 'AI Code Reviews', included: true, value: '100/user/month' },
        { name: 'Team Admin Dashboard', included: true },
        { name: 'Priority Email Support', included: true },
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise Plan',
      description: 'Advanced features & support for organizations',
      price: 0, // Custom pricing
      interval: billingInterval,
      aiCredits: 999999,
      maxProjects: 999999,
      supportLevel: 'Dedicated',
      ctaText: 'Contact Sales',
      features: [
        { name: 'Everything in Team', included: true },
        { name: 'Custom AI Credits Pool', included: true },
        { name: 'Unlimited Projects', included: true },
        { name: 'SAML SSO', included: true },
        { name: 'Audit Logs', included: true },
        { name: 'Data Residency Options', included: true },
        { name: 'Custom Integrations', included: true },
        { name: 'Dedicated Account Manager', included: true },
      ],
    },
  ];

  const handleSelectPlan = async (planId: string) => {
    if (!user) {
      // Redirect to login page for unauthenticated users
      navigateTo('/login');
      return;
    }

    if (planId === 'enterprise') {
      // Redirect to contact form for enterprise
      window.location.href = 'mailto:sales@nomadai.com?subject=Enterprise Plan Inquiry';
      return;
    }

    if (planId === 'freemium') {
      // Freemium tier - no payment needed
      toast({
        title: 'Already on Base Plan',
        description: 'You are currently on the free plan. Upgrade to Pro or Team for more features.',
      });
      return;
    }

    setLoading(true);
    try {
      // Create Stripe Checkout Session
      const response = await fetch('/api/checkout/subscription', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier: planId,
          interval: billingInterval,
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
      console.error('Error selecting plan:', error);
      toast({
        title: 'Checkout Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseCredits = async (credits: number) => {
    if (!user) {
      // Redirect to login page for unauthenticated users
      navigateTo('/login');
      return;
    }

    setLoading(true);
    try {
      // Map credits amount to package ID
      const packageMap: { [key: number]: string } = {
        100: 'credits_100',
        500: 'credits_500',
        1000: 'credits_1000',
        5000: 'credits_5000',
      };
      
      const packageId = packageMap[credits];
      if (!packageId) {
        throw new Error('Invalid credit package');
      }
      
      // Create Stripe Checkout Session for AI Credits
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
      toast({
        title: 'Checkout Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      {/* Background Effects - Matching ChatView */}
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
      </div>
      
      <div className="container mx-auto px-4 relative z-10 py-12">
        {/* Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigateTo('/')}
            className="flex items-center gap-2 text-slate-300 hover:text-white bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 hover:bg-slate-700/50 transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Uterpi
          </Button>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white via-violet-200 to-white bg-clip-text text-transparent drop-shadow-lg">
            Choose Your Uterpi Plan
          </h1>
          <p className="text-xl text-slate-200 mb-8 max-w-2xl mx-auto">
            Unlock the full potential of AI-powered development
          </p>
          
          {isGrandfathered && (
            <Badge className="mb-6 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0">
              <Sparkles className="w-4 h-4 mr-2" />
              You're grandfathered into special pricing!
            </Badge>
          )}

          {/* Billing Toggle */}
          <Tabs value={billingInterval} onValueChange={(v) => setBillingInterval(v as 'month' | 'year')}>
            <TabsList className="mx-auto bg-slate-800/50 backdrop-blur-xl border border-slate-700/50">
              <TabsTrigger 
                value="month" 
                className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger 
                value="year"
                className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-300"
              >
                Annual
                <Badge className="ml-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs">
                  Save 20%
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative backdrop-blur-xl border transition-all duration-300 hover:scale-105 ${
                plan.popular 
                  ? 'bg-gradient-to-br from-slate-800/60 to-slate-900/80 border-violet-400/50 shadow-2xl shadow-violet-500/20 ring-1 ring-violet-400/30 scale-105' 
                  : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60'
              } ${
                currentPlan === plan.id 
                  ? 'ring-2 ring-blue-400/50 bg-gradient-to-br from-slate-800/60 to-blue-900/40 border-blue-400/30' 
                  : ''
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 shadow-lg">
                  Most Popular Uterpi Plan
                </Badge>
              )}
              
              {currentPlan === plan.id && (
                <Badge className="absolute -top-3 right-4 bg-gradient-to-r from-blue-500 to-cyan-600 text-white border-0">
                  Current Uterpi Plan
                </Badge>
              )}

              <CardHeader>
                <CardTitle className="flex items-center justify-between text-white font-semibold">
                  {plan.name}
                  {plan.id === 'team' && <Users className="w-5 h-5 text-slate-300" />}
                  {plan.id === 'enterprise' && <Building2 className="w-5 h-5 text-slate-300" />}
                </CardTitle>
                <CardDescription className="text-slate-200">{plan.description}</CardDescription>
                
                <div className="mt-4">
                  {plan.price === 0 && plan.id !== 'enterprise' ? (
                    <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Free</div>
                  ) : plan.id === 'enterprise' ? (
                    <div className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">Custom Pricing</div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-white">
                        ${plan.price}
                        {plan.teamSize && <span className="text-sm font-normal text-slate-300">/user</span>}
                        <span className="text-sm font-normal text-slate-300">/{plan.interval}</span>
                      </div>
                      {plan.teamSize && (
                        <p className="text-sm text-slate-400 mt-1">
                          Minimum {plan.teamSize} users
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {/* AI Credits Highlight */}
                <div className="mb-4 p-3 bg-gradient-to-r from-slate-700/40 to-slate-800/40 backdrop-blur-sm rounded-lg border border-violet-400/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">AI Credits</span>
                    <Badge className="bg-gradient-to-r from-violet-500/30 to-purple-600/30 border-violet-400/40 text-violet-200 font-semibold">
                      {plan.aiCredits === 999999 ? 'Unlimited' : plan.aiCredits.toLocaleString()}
                    </Badge>
                  </div>
                </div>

                {/* Features List */}
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start text-sm">
                      {feature.included ? (
                        <Check className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-slate-500 mr-2 mt-0.5 flex-shrink-0" />
                      )}
                      <span className={!feature.included ? 'text-slate-500 line-through' : 'text-slate-100'}>
                        {feature.name}
                        {feature.value && <span className="font-medium text-white"> - {feature.value}</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Support Level */}
                <div className="text-sm text-slate-300 mb-4">
                  Support: <span className="font-medium text-white">{plan.supportLevel}</span>
                </div>

                {/* CTA Button */}
                <Button 
                  className={`w-full transition-all duration-200 ${
                    plan.popular 
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl' 
                      : 'bg-slate-700/50 hover:bg-slate-600/50 border-slate-600/50 text-white hover:border-slate-500/50 backdrop-blur-sm'
                  }`}
                  disabled={plan.disabled || loading}
                  onClick={() => handleSelectPlan(plan.id)}
                  data-testid={`button-select-${plan.id}`}
                >
                  {!user && (plan.id === 'pro' || plan.id === 'team') ? 'Sign In to Upgrade' : plan.ctaText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* AI Credits Add-ons Section */}
        <Card className="mb-12 bg-slate-800/30 backdrop-blur-xl border-slate-700/50">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <CreditCard className="w-5 h-5 mr-2 text-violet-400" />
              Need More AI Credits?
            </CardTitle>
            <CardDescription className="text-slate-300">
              Purchase additional credits anytime. Credits never expire.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button 
                className="bg-slate-700/50 hover:bg-slate-600/50 border-slate-600/50 text-white hover:border-slate-500/50 backdrop-blur-sm transition-all duration-200"
                disabled={loading}
                onClick={() => handlePurchaseCredits(100)}
                data-testid="button-buy-credits-100"
              >
                {!user ? 'Sign In to Purchase' : '100 Credits - $1.99'}
              </Button>
              <Button 
                className="bg-gradient-to-r from-violet-500/20 to-purple-600/20 hover:from-violet-500/30 hover:to-purple-600/30 border-violet-400/30 text-white backdrop-blur-sm transition-all duration-200"
                disabled={loading}
                onClick={() => handlePurchaseCredits(500)}
                data-testid="button-buy-credits-500"
              >
                {!user ? 'Sign In to Purchase' : '500 Credits - $8.99'}
              </Button>
              <Button 
                className="bg-slate-700/50 hover:bg-slate-600/50 border-slate-600/50 text-white hover:border-slate-500/50 backdrop-blur-sm transition-all duration-200"
                disabled={loading}
                onClick={() => handlePurchaseCredits(1000)}
                data-testid="button-buy-credits-1000"
              >
                {!user ? 'Sign In to Purchase' : '1,000 Credits - $15.99'}
              </Button>
              <Button 
                className="bg-slate-700/50 hover:bg-slate-600/50 border-slate-600/50 text-white hover:border-slate-500/50 backdrop-blur-sm transition-all duration-200"
                disabled={loading}
                onClick={() => handlePurchaseCredits(5000)}
                data-testid="button-buy-credits-5000"
              >
                {!user ? 'Sign In to Purchase' : '5,000 Credits - $69.99'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feature Comparison Table */}
        <Card className="bg-slate-800/30 backdrop-blur-xl border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white">Detailed Feature Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-600">
                    <th className="text-left py-3 text-slate-200 font-semibold">Feature</th>
                    <th className="text-center py-3 text-slate-200 font-semibold">Free</th>
                    <th className="text-center py-3 text-slate-200 font-semibold">Pro</th>
                    <th className="text-center py-3 text-slate-200 font-semibold">Team</th>
                    <th className="text-center py-3 text-slate-200 font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['AI Credits/month', '100', '1,000', '5,000/user', 'Custom'],
                    ['Projects', '1', '1', '10/user', 'Unlimited'],
                    ['Full Codebase Context', '❌', '✅', '✅', '✅'],
                    ['Git Integration', '❌', '✅', '✅', '✅'],
                    ['AI Code Reviews', '❌', '10/month', '100/user', 'Unlimited'],
                    ['Team Workspaces', '❌', '❌', '✅', '✅'],
                    ['SSO & Audit Logs', '❌', '❌', '❌', '✅'],
                    ['Support', 'Community', 'Email', 'Priority', 'Dedicated'],
                  ].map(([feature, ...values]) => (
                    <tr key={feature} className="border-b border-slate-700/50">
                      <td className="py-3 font-medium text-slate-200">{feature}</td>
                      {values.map((value, idx) => (
                        <td key={idx} className="text-center py-3">
                          {value === '✅' ? (
                            <Check className="w-4 h-4 text-green-400 mx-auto" />
                          ) : value === '❌' ? (
                            <X className="w-4 h-4 text-slate-500 mx-auto" />
                          ) : (
                            <span className="text-slate-300">{value}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PricingPage;
