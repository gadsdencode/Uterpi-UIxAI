/**
 * Checkout Success and Cancel Pages
 * Handle Stripe Checkout Session redirects
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, Home, CreditCard } from 'lucide-react';
import { navigateTo } from './Router';
import { useAuth } from '@/hooks/useAuth';

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checkout details');
    } finally {
      setLoading(false);
    }
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
      return `${credits} AI credits have been added to your account!`;
    }
  };

  const getSuccessDetails = () => {
    if (!session) return '';

    if (session.mode === 'subscription') {
      return 'You now have access to all premium features. Welcome aboard!';
    } else {
      return 'Your credits are ready to use and never expire.';
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
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-white">Payment Successful!</CardTitle>
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
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              onClick={() => navigateTo('/')} 
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
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