/**
 * Minimalist AI Credits Quick Purchase Component
 * Elegant dropdown for ad-hoc credit purchases during sessions
 */

import React, { useState, useEffect } from 'react';
import { Coins, ShoppingCart, Sparkles, CreditCard, Check, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { navigateTo } from './Router';
import { useAuth } from '@/hooks/useAuth';

interface CreditPackage {
  credits: number;
  price: number;
  priceId: string;
  popular?: boolean;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { credits: 100, price: 1.99, priceId: 'price_credits_100' },
  { credits: 500, price: 8.99, priceId: 'price_credits_500', popular: true },
  { credits: 1000, price: 15.99, priceId: 'price_credits_1000' },
  { credits: 5000, price: 69.99, priceId: 'price_credits_5000' },
];

interface AICreditsQuickPurchaseProps {
  currentBalance?: number;
  isCompact?: boolean;
  onPurchaseComplete?: (newBalance: number) => void;
}

export const AICreditsQuickPurchase: React.FC<AICreditsQuickPurchaseProps> = ({
  currentBalance = 0,
  isCompact = false,
  onPurchaseComplete,
}) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState(currentBalance);
  const [isLoading, setIsLoading] = useState(false);
  const [purchasingPackage, setPurchasingPackage] = useState<string | null>(null);
  const [messagesRemaining, setMessagesRemaining] = useState<number | null>(null);
  const [isFreemium, setIsFreemium] = useState(false);

  useEffect(() => {
    if (user) {
      fetchBalance();
    }
  }, [user]);

  // Listen for balance updates from checkout success page
  useEffect(() => {
    const handleCreditsUpdate = (event: CustomEvent) => {
      const { balance } = event.detail;
      setBalance(balance);
      
      // Call the onPurchaseComplete callback if provided
      if (onPurchaseComplete) {
        onPurchaseComplete(balance);
      }
      
      // Show success toast
      toast.success('Credits added to your account!', {
        description: `Your new balance is ${balance} credits.`
      });
    };

    window.addEventListener('creditsUpdated', handleCreditsUpdate as EventListener);
    
    return () => {
      window.removeEventListener('creditsUpdated', handleCreditsUpdate as EventListener);
    };
  }, [onPurchaseComplete]);

  const fetchBalance = async () => {
    if (!user) {
      return; // Don't fetch if user is not authenticated
    }

    try {
      // Get subscription details which includes credit balance
      const response = await fetch('/api/subscription/details', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setBalance(data.features?.currentCreditsBalance || 0);
        setIsFreemium(data.tier === 'freemium');
        if (data.tier === 'freemium') {
          setMessagesRemaining(data.features?.messagesRemaining || 0);
        }
      } else if (response.status === 401) {
        // User not authenticated, just return without error
        console.log('User not authenticated for subscription details');
        return;
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const handlePurchase = async (pkg: CreditPackage) => {
    setPurchasingPackage(pkg.priceId);
    setIsLoading(true);
    
    try {
      // Map priceId to packageId for the API
      const packageMap: { [key: string]: string } = {
        'price_credits_100': 'credits_100',
        'price_credits_500': 'credits_500',
        'price_credits_1000': 'credits_1000',
        'price_credits_5000': 'credits_5000',
      };
      
      const packageId = packageMap[pkg.priceId] || 'credits_500';
      
      // Show loading toast
      toast.loading(`Creating checkout session for ${pkg.credits} credits...`, {
        id: 'checkout-loading'
      });
      
      // Create Stripe Checkout Session
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
      
      // Dismiss loading toast
      toast.dismiss('checkout-loading');
      
      // Show success toast
      toast.success(`Redirecting to secure checkout for ${pkg.credits} credits...`);
      
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error initiating purchase:', error);
      
      // Dismiss loading toast if it exists
      toast.dismiss('checkout-loading');
      
      // Show detailed error message
      const errorMessage = error instanceof Error ? error.message : 'Failed to start purchase. Please try again.';
      toast.error(errorMessage, {
        description: 'If this problem persists, please contact support.',
        action: {
          label: 'Retry',
          onClick: () => handlePurchase(pkg)
        }
      });
    } finally {
      setIsLoading(false);
      setPurchasingPackage(null);
      setIsOpen(false);
    }
  };

  const handleUpgradeToPro = async () => {
    if (!user) {
      setIsOpen(false);
      navigateTo('/login');
      return;
    }

    try {
      setIsLoading(true);
      
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
      toast.error(error instanceof Error ? error.message : 'Failed to start upgrade. Please try again.');
      // Fallback to pricing page
      setIsOpen(false);
      navigateTo('/pricing');
    } finally {
      setIsLoading(false);
    }
  };

  const getBalanceColor = () => {
    if (balance === 0) return 'text-red-500';
    if (balance < 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price);
  };

  // Compact trigger for header/sidebar
  if (isCompact) {
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2 gap-1.5",
              "hover:bg-slate-800/50 transition-all duration-200"
            )}
          >
            <Coins className={cn("w-4 h-4", getBalanceColor())} />
            <span className={cn("text-sm font-medium", getBalanceColor())}>
              {balance}
            </span>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent 
          align="end" 
          className="w-72 bg-slate-900 border-slate-700 text-white p-0"
        >
          {renderDropdownContent()}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Full button trigger
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 px-3 gap-2 border-slate-600",
            "bg-slate-800/50 hover:bg-slate-700/50",
            "text-white transition-all duration-200"
          )}
        >
          <Coins className={cn("w-4 h-4", getBalanceColor())} />
          <div className="flex flex-col items-start">
            <span className="text-xs font-medium">AI Credits</span>
            <span className={cn("text-[10px] leading-tight", getBalanceColor())}>
              {balance} remaining
            </span>
          </div>
          {balance < 100 && (
            <ShoppingCart className="w-3 h-3 ml-1 text-slate-400" />
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="end" 
        className="w-80 bg-slate-900 border-slate-700 text-white p-0"
      >
        {renderDropdownContent()}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  function renderDropdownContent() {
    return (
      <>
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-400/20">
                <Coins className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium">AI Credits</p>
                <p className="text-xs text-slate-400">Pay as you go</p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-lg font-bold", getBalanceColor())}>
                {balance}
              </p>
              <p className="text-xs text-slate-400">current</p>
            </div>
          </div>

          {/* Freemium message allowance */}
          {isFreemium && messagesRemaining !== null && (
            <div className="mt-3 p-2 bg-blue-500/10 rounded-lg border border-blue-400/20">
              <div className="flex items-center justify-between">
                <span className="text-xs text-blue-300">Free Messages</span>
                <span className="text-xs font-medium text-blue-400">
                  {messagesRemaining}/10 remaining
                </span>
              </div>
              {messagesRemaining === 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Resets monthly or upgrade to Pro
                </p>
              )}
            </div>
          )}

          {balance === 0 && (
            <div className="mt-3 p-2 bg-red-500/10 rounded-lg border border-red-400/20">
              <p className="text-xs text-red-300">
                You're out of credits! Purchase more to continue.
              </p>
            </div>
          )}
        </div>

        {/* Credit Packages */}
        <div className="p-2">
          <p className="text-xs text-slate-400 px-2 py-1">Quick Purchase</p>
          
          {CREDIT_PACKAGES.map((pkg) => (
            <DropdownMenuItem
              key={pkg.priceId}
              className={cn(
                "cursor-pointer rounded-lg my-1 p-3",
                "hover:bg-slate-800/50 transition-all duration-200",
                pkg.popular && "border border-violet-400/20 bg-violet-500/5"
              )}
              onSelect={(e) => {
                e.preventDefault();
                handlePurchase(pkg);
              }}
              disabled={isLoading}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    pkg.popular 
                      ? "bg-violet-500/10 border border-violet-400/20" 
                      : "bg-slate-800/50 border border-slate-600/50"
                  )}>
                    <Sparkles className={cn(
                      "w-4 h-4",
                      pkg.popular ? "text-violet-400" : "text-slate-400"
                    )} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {pkg.credits.toLocaleString()} Credits
                      </p>
                      {pkg.popular && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          Popular
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {(pkg.price / pkg.credits * 100).toFixed(1)}¢ per credit
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {purchasingPackage === pkg.priceId ? (
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  ) : (
                    <span className="text-sm font-bold text-violet-400">
                      {formatPrice(pkg.price)}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-slate-700 space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs bg-slate-700/50 hover:bg-slate-600/50 border-slate-600 text-white hover:text-white"
            onClick={() => {
              setIsOpen(false);
              navigateTo('/pricing');
            }}
          >
            View Subscription Plans
          </Button>
          
          {isFreemium && (
            <Button
              size="sm"
              className="w-full h-8 text-xs bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              onClick={handleUpgradeToPro}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Processing...
                </>
              ) : (
                'Upgrade to Pro - $19/month'
              )}
            </Button>
          )}

          <p className="text-[10px] text-slate-500 text-center">
            Credits never expire • Secure checkout with Stripe
          </p>
        </div>
      </>
    );
  }
};

export default AICreditsQuickPurchase;
