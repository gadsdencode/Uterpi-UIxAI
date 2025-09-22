import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: string;
  interval: 'month' | 'year';
  features: string[];
  stripePriceId: string;
  stripeProductId: string;
  isActive: boolean;
  sortOrder: number;
}

export interface SubscriptionStatus {
  status: 'freemium' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  tier: string;
  endsAt?: string;
  plan?: SubscriptionPlan;
  details?: any;
}

export interface SubscriptionError {
  code: string;
  message: string;
  redirectTo?: string;
  reason?: string;
}

interface UseSubscriptionReturn {
  // Status
  subscription: SubscriptionStatus | null;
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: string | null;
  
  // Checks
  hasActiveSubscription: boolean;
  isTrialing: boolean;
  isPastDue: boolean;
  needsPaymentUpdate: boolean;
  canAccessFeature: (requiredTier?: string) => boolean;
  
  // Actions
  refreshSubscription: () => Promise<void>;
  loadPlans: () => Promise<void>;
  createSubscription: (planId: number, paymentMethodId?: string) => Promise<{ success: boolean; error?: string; clientSecret?: string }>;
  cancelSubscription: (immediate?: boolean) => Promise<{ success: boolean; error?: string }>;
  reactivateSubscription: () => Promise<{ success: boolean; error?: string }>;
  openBillingPortal: () => Promise<{ success: boolean; error?: string }>;
  
  // Setup
  createSetupIntent: () => Promise<{ clientSecret?: string; error?: string }>;
}

export const useSubscription = (): UseSubscriptionReturn => {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch subscription status
  const refreshSubscription = useCallback(async () => {
    if (!isAuthenticated) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/subscription/status', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription status');
      }

      const data = await response.json();
      setSubscription(data.subscription);
    } catch (err) {
      console.error('Error fetching subscription status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Load available plans
  const loadPlans = useCallback(async () => {
    try {
      const response = await fetch('/api/subscription/plans', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription plans');
      }

      const data = await response.json();
      setPlans(data.plans || []);
    } catch (err) {
      console.error('Error fetching subscription plans:', err);
    }
  }, []);

  // Create setup intent for payment method collection
  const createSetupIntent = useCallback(async () => {
    try {
      const response = await fetch('/api/subscription/setup-intent', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error || 'Failed to create setup intent' };
      }

      return { clientSecret: data.clientSecret };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, []);

  // Create subscription
  const createSubscription = useCallback(async (planId: number, paymentMethodId?: string) => {
    try {
      const response = await fetch('/api/subscription/create', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId, paymentMethodId }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to create subscription' };
      }

      // Refresh subscription status
      await refreshSubscription();

      return { 
        success: true, 
        clientSecret: data.subscription?.clientSecret 
      };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  }, [refreshSubscription]);

  // Cancel subscription
  const cancelSubscription = useCallback(async (immediate = false) => {
    try {
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ immediate }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to cancel subscription' };
      }

      // Refresh subscription status
      await refreshSubscription();

      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  }, [refreshSubscription]);

  // Reactivate subscription
  const reactivateSubscription = useCallback(async () => {
    try {
      const response = await fetch('/api/subscription/reactivate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to reactivate subscription' };
      }

      // Refresh subscription status
      await refreshSubscription();

      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  }, [refreshSubscription]);

  // Open billing portal
  const openBillingPortal = useCallback(async () => {
    try {
      const response = await fetch('/api/subscription/billing-portal', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to create billing portal session' };
      }

      // Open billing portal in new tab
      window.open(data.url, '_blank');

      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      };
    }
  }, []);

  // Access control checks
  const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isTrialing = subscription?.status === 'trialing';
  const isPastDue = subscription?.status === 'past_due';
  const needsPaymentUpdate = isPastDue;

  const canAccessFeature = useCallback((requiredTier?: string) => {
    // Return false if still loading to prevent flash of wrong content
    if (isLoading) return false;
    
    if (!subscription) return false;
    
    // Check tier hierarchy first - Friends & Family should have premium access
    const tierHierarchy: Record<string, number> = { 
      freemium: 0,  // Freemium tier
      basic: 1, 
      premium: 2,
      friends_family: 2, // Friends & Family gets premium access
      nomadai_pro: 2,    // Alias for premium
      'nomadai pro': 2   // Handle potential space variations
    };
    
    // Allow access for friends_family tier regardless of status for now (testing phase)
    if (subscription.tier?.toLowerCase() === 'friends_family') {
      return true; // Always allow Friends & Family users during testing
    }
    
    // For freemium tier, allow access regardless of status
    if (subscription.tier?.toLowerCase() === 'freemium') {
      // Freemium users should have access to basic features
      if (!requiredTier || requiredTier.toLowerCase() === 'basic') {
        return true;
      }
      // Check if they can access higher tiers
      const userTierLevel = tierHierarchy[subscription.tier?.toLowerCase()] || 0;
      const requiredTierLevel = tierHierarchy[requiredTier.toLowerCase()] || 0;
      return userTierLevel >= requiredTierLevel;
    }
    
    // For paid tiers, check normal subscription logic
    const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
    if (!isActive) return false;
    
    if (!requiredTier) return true;
    
    const userTierLevel = tierHierarchy[subscription.tier?.toLowerCase()] || 0;
    const requiredTierLevel = tierHierarchy[requiredTier.toLowerCase()] || 0;
    
    return userTierLevel >= requiredTierLevel;
  }, [subscription, isLoading]);

  // Load data on mount and when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      refreshSubscription();
      loadPlans();
    } else {
      setSubscription(null);
      setIsLoading(false);
    }
  }, [isAuthenticated, refreshSubscription, loadPlans]);

  return {
    // Status
    subscription,
    plans,
    isLoading,
    error,
    
    // Checks
    hasActiveSubscription,
    isTrialing,
    isPastDue,
    needsPaymentUpdate,
    canAccessFeature,
    
    // Actions
    refreshSubscription,
    loadPlans,
    createSubscription,
    cancelSubscription,
    reactivateSubscription,
    openBillingPortal,
    createSetupIntent,
  };
}; 