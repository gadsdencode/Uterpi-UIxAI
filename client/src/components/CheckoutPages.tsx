/**
 * Checkout Success and Cancel Pages
 * Handle Stripe Checkout Session redirects
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, Home, CreditCard, Clock } from 'lucide-react';
import { navigateTo } from './Router';
import { useAuth } from '@/hooks/useAuth';
import { handleError, createError } from '@/lib/error-handler';

interface CheckoutSession {
  id: string;
  status: string;
  mode: 'subscription' | 'payment';
  amountTotal: number;
  currency: string;
  customerEmail: string;
  paymentStatus: string;
  metadata: {
    userId: string;
    tier?: string;
    interval?: string;
    type?: string;
    credits?: string;
  };
}

export const CheckoutSuccessPage: React.FC = () => {
  const { user } = useAuth();
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Polling state for credit purchases
  const [isPolling, setIsPolling] = useState(false);
  const [creditsConfirmed, setCreditsConfirmed] = useState(false);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const [expectedCredits, setExpectedCredits] = useState<number | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxPollingAttempts = 20; // 2 minutes with 6-second intervals

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (!sessionId) {
      setError('No checkout session found');
      setLoading(false);
      return;
    }

    fetchSessionDetails(sessionId);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const fetchSessionDetails = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/checkout/session/${sessionId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch checkout session details');
      }

      const data = await response.json();
      setSession(data.session);
      
      // If this is a credit purchase, start polling for balance updates
      if (data.session.mode === 'payment' && data.session.metadata?.credits) {
        const credits = parseInt(data.session.metadata.credits);
        setExpectedCredits(credits);
        startCreditPolling();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load checkout details');
      handleError(error, {
        operation: 'fetch_checkout_session',
        component: 'CheckoutSuccessPage',
        userId: user?.id?.toString(),
        timestamp: new Date()
      });
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const startCreditPolling = () => {
    setIsPolling(true);
    setPollingAttempts(0);
    
    const pollCredits = async () => {
      try {
        const response = await fetch('/api/credits/balance', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch credit balance');
        }

        const data = await response.json();
        const currentBalance = data.balance;
        
        // Check if we have recent transactions that match our expected credits
        const recentPurchase = data.recentTransactions?.find((tx: any) => 
          tx.transactionType === 'purchase' && 
          tx.amount === expectedCredits &&
          new Date(tx.createdAt) > new Date(Date.now() - 5 * 60 * 1000) // Within last 5 minutes
        );

        if (recentPurchase || (expectedCredits && currentBalance >= expectedCredits)) {
          setCreditsConfirmed(true);
          setIsPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          return;
        }

        setPollingAttempts(prev => {
          const newAttempts = prev + 1;
          if (newAttempts >= maxPollingAttempts) {
            setIsPolling(false);
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
            // Don't show error, just stop polling - credits might still be processing
          }
          return newAttempts;
        });
      } catch (error) {
        console.error('Error polling credits:', error);
        
        // Handle polling errors gracefully
        handleError(error as Error, {
          operation: 'poll_credits_balance',
          component: 'CheckoutSuccessPage',
          userId: user?.id?.toString(),
          timestamp: new Date()
        });
        
        setPollingAttempts(prev => {
          const newAttempts = prev + 1;
          if (newAttempts >= maxPollingAttempts) {
            setIsPolling(false);
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
          }
          return newAttempts;
        });
      }
    };

    // Start polling immediately, then every 6 seconds
    pollCredits();
    pollingIntervalRef.current = setInterval(pollCredits, 6000);
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const getSuccessMessage = () => {
    if (!session) return '';

    if (session.mode === 'subscription') {
      const tier = session.metadata.tier;
      const interval = session.metadata.interval;
      return `Your ${tier} ${interval}ly subscription has been activated!`;
    } else {
      const credits = session.metadata.credits;
      if (isPolling && !creditsConfirmed) {
        return `Processing your ${credits} AI credits purchase...`;
      } else if (creditsConfirmed) {
        return `${credits} AI credits have been added to your account!`;
      } else {
        return `${credits} AI credits purchase completed!`;
      }
    }
  };

  const getSuccessDetails = () => {
    if (!session) return '';

    if (session.mode === 'subscription') {
      return 'You now have access to all premium features. Welcome aboard!';
    } else {
      if (isPolling && !creditsConfirmed) {
        return 'Please wait while we confirm your credits are available. This usually takes just a few moments.';
      } else if (creditsConfirmed) {
        return 'Your credits are ready to use and never expire.';
      } else {
        return 'Your credits are being processed and will be available shortly.';
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-auto bg-slate-900 border-slate-700">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-violet-400" />
            <p className="text-lg font-medium text-white">Processing your payment...</p>
            <p className="text-sm text-slate-400 text-center mt-2">
              Please wait while we confirm your purchase details.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-auto bg-slate-900 border-slate-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-white">Payment Error</CardTitle>
            <CardDescription className="text-slate-400">
              {error || 'Unable to verify your payment. Please contact support if you were charged.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => navigateTo('/pricing')} 
              className="w-full"
              variant="outline"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Back to Pricing
            </Button>
            <Button 
              onClick={() => navigateTo('/')} 
              className="w-full"
              variant="secondary"
            >
              <Home className="mr-2 h-4 w-4" />
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto bg-slate-900 border-slate-700">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            {isPolling && !creditsConfirmed ? (
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            )}
          </div>
          <CardTitle className="text-white">
            {isPolling && !creditsConfirmed ? 'Processing Payment...' : 'Payment Successful!'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {getSuccessMessage()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payment Details */}
          <div className="bg-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Amount Paid:</span>
              <span className="font-semibold text-white">
                {formatAmount(session.amountTotal, session.currency)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Payment Status:</span>
              <span className="text-green-400 capitalize">{session.paymentStatus}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Email:</span>
              <span className="text-white text-sm">{session.customerEmail || user?.email}</span>
            </div>
          </div>

          {/* Success Message */}
          <div className="text-center">
            <p className="text-slate-300 mb-4">
              {getSuccessDetails()}
            </p>
            
            {/* Polling Status for Credit Purchases */}
            {isPolling && !creditsConfirmed && session?.mode === 'payment' && (
              <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-center space-x-2 text-blue-300">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">
                    Confirming credits... ({pollingAttempts}/{maxPollingAttempts})
                  </span>
                </div>
                <div className="mt-2 text-xs text-blue-400 text-center">
                  This usually takes 10-30 seconds
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              onClick={() => navigateTo('/')} 
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={isPolling && !creditsConfirmed && session?.mode === 'payment'}
            >
              <Home className="mr-2 h-4 w-4" />
              {isPolling && !creditsConfirmed && session?.mode === 'payment' 
                ? 'Processing Credits...' 
                : 'Go to Dashboard'
              }
            </Button>
            {session.mode === 'subscription' && (
              <Button 
                onClick={() => navigateTo('/settings/billing')} 
                className="w-full"
                variant="outline"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const CheckoutCancelPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto bg-slate-900 border-slate-700">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
            <XCircle className="h-8 w-8 text-orange-600" />
          </div>
          <CardTitle className="text-white">Payment Cancelled</CardTitle>
          <CardDescription className="text-slate-400">
            Your payment was cancelled. No charges have been made to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-slate-300 mb-6">
            <p>You can try again anytime or explore our free features.</p>
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={() => navigateTo('/pricing')} 
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Back to Pricing
            </Button>
            <Button 
              onClick={() => navigateTo('/')} 
              className="w-full"
              variant="outline"
            >
              <Home className="mr-2 h-4 w-4" />
              Continue with Free Plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};