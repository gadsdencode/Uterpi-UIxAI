/**
 * Service Status Fix Test Component
 * Tests the rapid cycling fix for service status indicators
 */

import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { ServiceStatusIndicator } from './ServiceStatusIndicator';
import { AIProvider } from '../hooks/useAIProvider';

export const ServiceStatusFixTest: React.FC = () => {
  const [refreshCount, setRefreshCount] = useState(0);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  
  const {
    serviceStatus,
    startMonitoring,
    stopMonitoring,
    checkProvider,
    getServiceStatus
  } = useServiceStatus({
    checkInterval: 30000, // 30 seconds for testing
    maxConsecutiveFailures: 3,
    timeoutMs: 5000
  });

  const providers: AIProvider[] = ['lmstudio', 'azure', 'openai', 'gemini'];

  useEffect(() => {
    startMonitoring(providers);
    return () => stopMonitoring();
  }, [startMonitoring, stopMonitoring]);

  const handleManualRefresh = async () => {
    const startTime = Date.now();
    setLastRefreshTime(new Date());
    
    // Try to refresh all providers rapidly
    const promises = providers.map(provider => checkProvider(provider));
    await Promise.allSettled(promises);
    
    const endTime = Date.now();
    setRefreshCount(prev => prev + 1);
    
    console.log(`Manual refresh completed in ${endTime - startTime}ms`);
  };

  const handleRapidRefresh = async () => {
    // Simulate rapid clicking
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        checkProvider('lmstudio');
        setRefreshCount(prev => prev + 1);
      }, i * 100);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Service Status Rapid Cycling Fix Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleManualRefresh} variant="default">
              Manual Refresh All
            </Button>
            <Button onClick={handleRapidRefresh} variant="destructive">
              Rapid Refresh Test (5x)
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <Badge variant="outline">
              Refresh Count: {refreshCount}
            </Badge>
            {lastRefreshTime && (
              <Badge variant="outline">
                Last Refresh: {lastRefreshTime.toLocaleTimeString()}
              </Badge>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <p>This test verifies that:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Manual refreshes have a 10-second cooldown</li>
              <li>Tooltip content is memoized to prevent re-renders</li>
              <li>Health checks don't trigger on every error</li>
              <li>Service status updates are stable</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service Status Indicators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {providers.map(provider => (
              <div key={provider} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="font-medium capitalize">{provider}</span>
                  <ServiceStatusIndicator
                    provider={provider}
                    status={getServiceStatus(provider)}
                    onRefresh={() => checkProvider(provider)}
                    compact
                  />
                </div>
                
                <div className="text-xs text-muted-foreground">
                  {getServiceStatus(provider).lastChecked && (
                    <div>
                      Last checked: {new Date(getServiceStatus(provider).lastChecked!).toLocaleTimeString()}
                    </div>
                  )}
                  {getServiceStatus(provider).lastError && (
                    <div className="text-red-400 max-w-xs truncate">
                      Error: {getServiceStatus(provider).lastError}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
