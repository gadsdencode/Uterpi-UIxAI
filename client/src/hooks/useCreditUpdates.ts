/**
 * Hook for managing real-time credit updates from AI responses
 */

import { useState, useCallback, useEffect } from 'react';

interface CreditInfo {
  creditsUsed: number;
  remainingBalance: number;
}

// Global credit update emitter
class CreditUpdateEmitter {
  private listeners: ((creditInfo: CreditInfo) => void)[] = [];

  subscribe(listener: (creditInfo: CreditInfo) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(creditInfo: CreditInfo) {
    this.listeners.forEach(listener => listener(creditInfo));
  }
}

const creditUpdateEmitter = new CreditUpdateEmitter();

// Function to emit credit updates from AI services
export const emitCreditUpdate = (creditInfo: CreditInfo) => {
  creditUpdateEmitter.emit(creditInfo);
};

// Hook to subscribe to credit updates
export const useCreditUpdates = () => {
  const [lastCreditUpdate, setLastCreditUpdate] = useState<CreditInfo | null>(null);

  useEffect(() => {
    const unsubscribe = creditUpdateEmitter.subscribe((creditInfo) => {
      setLastCreditUpdate(creditInfo);
    });

    return unsubscribe;
  }, []);

  return lastCreditUpdate;
};
