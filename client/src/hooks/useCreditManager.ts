// useCreditManager.ts - Credit and subscription state management hook
// Extracts credit/subscription functionality from useChat following SRP

import { useState, useEffect, useCallback } from 'react';
import { useCreditUpdates } from './useCreditUpdates';
import { User } from './useAuth';

export interface UseCreditManagerOptions {
  /** User object for auth context */
  user: User | null;
  /** Enable real-time credit updates (default: true) */
  enableRealTimeUpdates?: boolean;
  /** Fetch credits on mount (default: true) */
  fetchOnMount?: boolean;
}

export interface UseCreditManagerReturn {
  // Credit state
  creditBalance: number | null;
  isFreemium: boolean;
  messagesRemaining: number | null;
  
  // Subscription tier info
  subscriptionTier: string | null;
  
  // Loading state
  isLoadingCredits: boolean;
  creditError: string | null;
  
  // Actions
  fetchCreditStatus: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  
  // Derived state
  hasCredits: boolean;
  isOutOfCredits: boolean;
  isLowCredits: boolean;
}

const LOW_CREDIT_THRESHOLD = 10;

export const useCreditManager = (options: UseCreditManagerOptions): UseCreditManagerReturn => {
  const {
    user,
    enableRealTimeUpdates = true,
    fetchOnMount = true
  } = options;

  // Credit state
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isFreemium, setIsFreemium] = useState(false);
  const [messagesRemaining, setMessagesRemaining] = useState<number | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null);
  
  // Loading/error state
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);

  // Listen for real-time credit updates
  const creditUpdate = useCreditUpdates();

  // Update credit balance when we receive real-time updates
  useEffect(() => {
    if (enableRealTimeUpdates && creditUpdate) {
      console.log('💳 Real-time credit update received:', creditUpdate);
      setCreditBalance(creditUpdate.remainingBalance);
    }
  }, [creditUpdate, enableRealTimeUpdates]);

  // Fetch credit status from server
  const fetchCreditStatus = useCallback(async () => {
    if (!user) {
      console.log('💳 No user, skipping credit fetch');
      return;
    }

    setIsLoadingCredits(true);
    setCreditError(null);

    try {
      const response = await fetch('/api/subscription/details', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        
        setCreditBalance(data.features.currentCreditsBalance);
        setSubscriptionTier(data.tier);
        setIsFreemium(data.tier === 'freemium');
        
        if (data.tier === 'freemium') {
          setMessagesRemaining(data.features.messagesRemaining);
        } else {
          setMessagesRemaining(null);
        }
        
        console.log('💳 Credit status fetched:', {
          balance: data.features.currentCreditsBalance,
          tier: data.tier,
          isFreemium: data.tier === 'freemium',
          messagesRemaining: data.features.messagesRemaining
        });
      } else {
        const errorText = await response.text();
        console.error('💳 Failed to fetch credit status:', response.status, errorText);
        setCreditError(`Failed to fetch credits: ${response.status}`);
      }
    } catch (error) {
      console.error('💳 Error fetching credit status:', error);
      setCreditError((error as Error).message || 'Failed to fetch credits');
    } finally {
      setIsLoadingCredits(false);
    }
  }, [user]);

  // Alias for fetchCreditStatus
  const refreshCredits = fetchCreditStatus;

  // Fetch credit status on mount
  useEffect(() => {
    if (fetchOnMount && user) {
      fetchCreditStatus();
    }
  }, [user, fetchOnMount, fetchCreditStatus]);

  // Derived state
  const hasCredits = creditBalance !== null && creditBalance > 0;
  const isOutOfCredits = creditBalance !== null && creditBalance <= 0;
  const isLowCredits = creditBalance !== null && creditBalance > 0 && creditBalance <= LOW_CREDIT_THRESHOLD;

  return {
    // Credit state
    creditBalance,
    isFreemium,
    messagesRemaining,
    subscriptionTier,
    
    // Loading state
    isLoadingCredits,
    creditError,
    
    // Actions
    fetchCreditStatus,
    refreshCredits,
    
    // Derived state
    hasCredits,
    isOutOfCredits,
    isLowCredits
  };
};

