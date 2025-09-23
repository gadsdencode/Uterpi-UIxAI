import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useSubscription, type SubscriptionPlan } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { CheckCircle, XCircle, Clock, CreditCard, Shield, Star, Zap, Crown, Sparkles, Loader2 } from 'lucide-react';

// Initialize Stripe (you'll need to add your publishable key to environment variables)
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

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
  quantity = 50,
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

interface PaymentFormProps {
  selectedPlan: SubscriptionPlan;
  onSuccess: () => void;
  onCancel: () => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ selectedPlan, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { createSubscription, createSetupIntent } = useSubscription();
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    // Create setup intent for payment method collection
    const setupPayment = async () => {
      const result = await createSetupIntent();
      if (result.error) {
        toast.error('Payment Setup Failed: ' + result.error);
      } else {
        setClientSecret(result.clientSecret || null);
      }
    };

    setupPayment();
  }, [createSetupIntent]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setIsProcessing(true);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Confirm setup intent
      const { error: setupError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (setupError) {
        throw new Error(setupError.message);
      }

      // Create subscription with the payment method
      const result = await createSubscription(selectedPlan.id, setupIntent.payment_method as string);

      if (!result.success) {
        throw new Error(result.error || 'Failed to create subscription');
      }

      // Handle 3D Secure or other authentication if needed
      if (result.clientSecret) {
        const { error: confirmError } = await stripe.confirmCardPayment(result.clientSecret);
        if (confirmError) {
          throw new Error(confirmError.message);
        }
      }

      toast.success('Subscription Created - Welcome to your new plan!');
      onSuccess();
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment Failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md mx-auto"
    >
      <Card className="border-border/50 bg-card/95 backdrop-blur-sm shadow-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <CreditCard className="h-5 w-5 text-primary" />
            Complete Your Subscription
          </CardTitle>
          <CardDescription>
            {selectedPlan.price === '5.00' ? (
              <>You're getting unlimited AI development assistance for just <span className="font-bold text-primary">${selectedPlan.price}/{selectedPlan.interval}</span> - Amazing value!</>
            ) : (
              <>You're subscribing to {selectedPlan.name} for ${selectedPlan.price}/{selectedPlan.interval}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 border border-border rounded-lg bg-background/50">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: 'hsl(var(--foreground))',
                      backgroundColor: 'transparent',
                      '::placeholder': {
                        color: 'hsl(var(--muted-foreground))',
                      },
                    },
                  },
                }}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!stripe || isProcessing}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : selectedPlan.price === '5.00' ? (
                  `Start AI Development for $${selectedPlan.price}/${selectedPlan.interval}`
                ) : (
                  `Subscribe for $${selectedPlan.price}/${selectedPlan.interval}`
                )}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              <div className="flex items-center justify-center gap-1">
                <Shield className="h-3 w-3" />
                Secured by Stripe
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const PlanCard: React.FC<{
  plan: SubscriptionPlan;
  isCurrentPlan?: boolean;
  isPopular?: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
}> = ({ plan, isCurrentPlan, isPopular, onSelect }) => {
  const features = Array.isArray(plan.features) ? plan.features : [];
  const isFreemium = plan.price === '0.00' || plan.price === '0';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`relative transition-all duration-300 hover:shadow-2xl border-border/50 bg-card/95 backdrop-blur-sm ${
        isPopular ? 'ring-2 ring-primary/50 shadow-lg shadow-primary/10' : ''
      } ${
        isCurrentPlan ? 'bg-primary/5 border-primary/20' : ''
      }`}>
        {isPopular && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-3 left-1/2 transform -translate-x-1/2"
          >
            <Badge className="bg-primary text-primary-foreground shadow-lg">
              <Crown className="h-3 w-3 mr-1" />
              {plan.price === '5.00' ? 'Best Value' : 'Most Popular'}
            </Badge>
          </motion.div>
        )}

        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl text-card-foreground">{plan.name}</CardTitle>
            {isCurrentPlan && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                Current Plan
              </Badge>
            )}
          </div>
          <CardDescription className="text-muted-foreground">{plan.description}</CardDescription>
          <div className="mt-4">
            <div className="flex items-baseline">
              <span className="text-3xl font-bold text-foreground">
                {isFreemium ? 'Freemium' : `$${plan.price}`}
              </span>
              {!isFreemium && (
                <span className="text-muted-foreground ml-1">/{plan.interval}</span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <ul className="space-y-3 mb-6">
            {features.map((feature, index) => (
              <motion.li 
                key={index} 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-2"
              >
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm text-card-foreground">{feature}</span>
              </motion.li>
            ))}
          </ul>

          <Button
            onClick={() => onSelect(plan)}
            disabled={isCurrentPlan}
            className={`w-full ${
              isCurrentPlan 
                ? "bg-secondary text-secondary-foreground" 
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
            variant={isCurrentPlan ? "secondary" : "default"}
          >
            {isCurrentPlan ? 'Current Plan' : isFreemium ? 'Get Started' : 'Subscribe'}
            {!isCurrentPlan && !isFreemium && <Sparkles className="h-4 w-4 ml-2" />}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const SubscriptionStatus: React.FC = () => {
  const { 
    subscription, 
    hasActiveSubscription, 
    isTrialing, 
    isPastDue, 
    needsPaymentUpdate,
    cancelSubscription,
    reactivateSubscription,
    openBillingPortal 
  } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);

  if (!subscription) return null;

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
      return;
    }

    setIsLoading(true);
    const result = await cancelSubscription();
    setIsLoading(false);

    if (result.success) {
      toast.success('Subscription Canceled - Your subscription will end at the current billing period.');
    } else {
      toast.error('Cancel Failed: ' + (result.error || 'Failed to cancel subscription'));
    }
  };

  const handleReactivateSubscription = async () => {
    setIsLoading(true);
    const result = await reactivateSubscription();
    setIsLoading(false);

    if (result.success) {
      toast.success('Subscription Reactivated - Your subscription is now active again.');
    } else {
      toast.error('Reactivation Failed: ' + (result.error || 'Failed to reactivate subscription'));
    }
  };

  const handleOpenBillingPortal = async () => {
    const result = await openBillingPortal();
    if (!result.success) {
      toast.error('Billing Portal Error: ' + (result.error || 'Failed to open billing portal'));
    }
  };

  const getStatusIcon = () => {
    if (isPastDue) return <XCircle className="h-5 w-5 text-destructive" />;
    if (isTrialing) return <Clock className="h-5 w-5 text-yellow-500" />;
    if (hasActiveSubscription) return <CheckCircle className="h-5 w-5 text-primary" />;
    return <XCircle className="h-5 w-5 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (isPastDue) return 'Payment Required';
    if (isTrialing) return 'Trial Active';
    if (hasActiveSubscription) return 'Active';
    return 'Inactive';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="border-border/50 bg-card/95 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            {getStatusIcon()}
            Subscription Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">{subscription.tier}</p>
              <p className="text-sm text-muted-foreground">{getStatusText()}</p>
            </div>
            <Badge variant={hasActiveSubscription ? "default" : "secondary"} 
                   className={hasActiveSubscription ? "bg-primary text-primary-foreground" : ""}>
              {subscription.status}
            </Badge>
          </div>

          {subscription.endsAt && (
            <div>
              <p className="text-sm text-muted-foreground">
                {subscription.status === 'canceled' ? 'Ends' : 'Renews'} on{' '}
                {new Date(subscription.endsAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {needsPaymentUpdate && (
            <Alert className="border-destructive/50 bg-destructive/10">
              <XCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                Your payment method needs to be updated. Please update your payment information to continue your subscription.
              </AlertDescription>
            </Alert>
          )}

          <Separator className="bg-border" />

          <div className="flex gap-2">
            <Button onClick={handleOpenBillingPortal} variant="outline" size="sm" 
                    className="border-border hover:bg-accent">
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Billing
            </Button>

            {hasActiveSubscription && subscription.status !== 'canceled' && (
              <Button
                onClick={handleCancelSubscription}
                variant="outline"
                size="sm"
                disabled={isLoading}
                className="border-border hover:bg-accent"
              >
                Cancel Subscription
              </Button>
            )}

            {subscription.status === 'canceled' && (
              <Button
                onClick={handleReactivateSubscription}
                size="sm"
                disabled={isLoading}
                className="bg-primary hover:bg-primary/90"
              >
                Reactivate
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export const SubscriptionPage: React.FC = () => {
  const { user } = useAuth();
  const { subscription, plans, isLoading, hasActiveSubscription } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [view, setView] = useState<'plans' | 'payment'>('plans');

  const handlePlanSelect = (plan: SubscriptionPlan) => {
    // For free plans, handle immediately
    if (plan.price === '0.00' || plan.price === '0') {
      // TODO: Implement free plan activation
      return;
    }

    setSelectedPlan(plan);
    setView('payment');
  };

  const handlePaymentSuccess = () => {
    setView('plans');
    setSelectedPlan(null);
  };

  const handlePaymentCancel = () => {
    setView('plans');
    setSelectedPlan(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Particles className="absolute inset-0 pointer-events-none" quantity={30} />
        <Card className="border-border/50 bg-card/95 backdrop-blur-sm">
          <CardContent className="p-6">
            <p className="text-card-foreground">Please log in to manage your subscription.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === 'payment' && selectedPlan) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden py-12">
        <Particles className="absolute inset-0 pointer-events-none" quantity={30} />
        <div className="max-w-4xl mx-auto px-4 relative z-10">
          <Elements stripe={stripePromise}>
            <PaymentForm
              selectedPlan={selectedPlan}
              onSuccess={handlePaymentSuccess}
              onCancel={handlePaymentCancel}
            />
          </Elements>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden py-12">
      <Particles className="absolute inset-0 pointer-events-none" quantity={50} />
      
      <div className="max-w-6xl mx-auto px-4 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Start your journey with Uterpi for <span className="text-violet-600">free</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            Unlock the full power of AI with Uterpi
          </p>
          <p className="text-lg text-violet-600 font-medium">
            🚀 Uterpi is free to get started with 10 messages per month
          </p>
        </motion.div>

        <AnimatePresence>
          {hasActiveSubscription && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <SubscriptionStatus />
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/50 bg-card/95 backdrop-blur-sm">
                <CardHeader>
                  <Skeleton className="h-6 w-32 bg-muted" />
                  <Skeleton className="h-4 w-48 bg-muted" />
                  <Skeleton className="h-8 w-24 bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((j) => (
                      <Skeleton key={j} className="h-4 w-full bg-muted" />
                    ))}
                  </div>
                  <Skeleton className="h-10 w-full mt-6 bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <motion.div 
            className="grid md:grid-cols-3 gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.1 }}
          >
            {plans.map((plan, index) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={subscription?.plan?.id === plan.id}
                isPopular={plan.price === '5.00'} // Make $5 plan popular
                onSelect={handlePlanSelect}
              />
            ))}
          </motion.div>
        )}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <div className="mb-6 p-6 bg-gradient-to-r from-violet-500/10 to-purple-600/10 rounded-2xl border border-violet-500/20">
            <h3 className="text-xl font-bold text-foreground mb-2">
              💡 Why choose Uterpi Pro?
            </h3>
            <p className="text-muted-foreground mb-4">
              At just $19 per month, you get access to advanced AI within the Uterpi platform.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>Unlimited* AI usage</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-500" />
                <span>Upload files for in-depth AI analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-purple-500" />
                <span>Access to cutting-edge AI models</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-1"
            >
              <Shield className="h-4 w-4" />
              SSL Secured
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-1"
            >
              <Zap className="h-4 w-4" />
              Instant Activation
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-1"
            >
              <CheckCircle className="h-4 w-4" />
              Cancel Anytime
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}; 