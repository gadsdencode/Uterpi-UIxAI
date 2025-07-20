import { useCallback } from 'react';
import { toast } from 'sonner';

interface SubscriptionError {
  code: string;
  message: string;
  redirectTo?: string;
  reason?: string;
  currentTier?: string;
  requiredTier?: string;
}

export const useSubscriptionErrors = () => {
  const handleApiError = useCallback((response: Response, data?: any) => {
    // Check if this is a subscription-related error
    if (response.status === 402) {
      const error: SubscriptionError = data || {};
      
      // Show appropriate toast message
      const title = getErrorTitle(error.code);
      const description = error.message || 'Subscription required';
      
      toast.error(title, {
        description,
        duration: 5000,
        action: error.redirectTo ? {
          label: getActionLabel(error.code),
          onClick: () => {
            window.location.href = error.redirectTo!;
          }
        } : undefined
      });

      // Redirect if specified
      if (error.redirectTo) {
        setTimeout(() => {
          window.location.href = error.redirectTo!;
        }, 2000); // Give time for toast to be seen
      }

      return true; // Indicates error was handled
    }

    return false; // Not a subscription error
  }, []);

  const getErrorTitle = (code?: string): string => {
    switch (code) {
      case 'SUBSCRIPTION_REQUIRED':
        return 'Subscription Required';
      case 'SUBSCRIPTION_EXPIRED':
        return 'Subscription Expired';
      case 'PAYMENT_FAILED':
        return 'Payment Issue';
      case 'PAID_SUBSCRIPTION_REQUIRED':
        return 'Paid Plan Required';
      case 'TIER_UPGRADE_REQUIRED':
        return 'Upgrade Required';
      default:
        return 'Access Denied';
    }
  };

  const getActionLabel = (code?: string): string => {
    switch (code) {
      case 'PAYMENT_FAILED':
        return 'Update Payment';
      case 'SUBSCRIPTION_EXPIRED':
      case 'SUBSCRIPTION_REQUIRED':
      case 'PAID_SUBSCRIPTION_REQUIRED':
      case 'TIER_UPGRADE_REQUIRED':
        return 'Upgrade Now';
      default:
        return 'Learn More';
    }
  };

  // Wrapper for fetch that automatically handles subscription errors
  const protectedFetch = useCallback(async (url: string, options?: RequestInit) => {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
    });

    if (!response.ok) {
      let data;
      try {
        data = await response.json();
      } catch {
        // Response is not JSON
      }

      // Handle subscription errors
      if (handleApiError(response, data)) {
        throw new Error(`Subscription error: ${data?.message || 'Access denied'}`);
      }

      // For other errors, throw with the message
      throw new Error(data?.message || `HTTP ${response.status}`);
    }

    return response;
  }, [handleApiError]);

  return {
    handleApiError,
    protectedFetch,
  };
}; 