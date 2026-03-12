/**
 * Service Status Test Component
 * Demonstrates service status monitoring and error scenarios
 */

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { ServiceStatusSummary } from './ServiceStatusIndicator';
import { AIProvider } from '../hooks/useAIProvider';

export const ServiceStatusTest: React.FC = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const {
    serviceStatus,
    startMonitoring,
    stopMonitoring,
    checkProvider,
    checkAllServices,
    getServiceStatus,
    isServiceDown,
    getOfflineServices
  } = useServiceStatus({
    checkInterval: 10000, // 10 seconds for testing
    maxConsecutiveFailures: 2,
    timeoutMs: 5000
  });

  const providers: AIProvider[] = ['lmstudio', 'azure', 'openai', 'gemini', 'huggingface', 'uterpi'];

  const handleStartMonitoring = () => {
    startMonitoring(providers);
    setIsMonitoring(true);
  };

  const handleStopMonitoring = () => {
    stopMonitoring();
    setIsMonitoring(false);
  };

  const handleCheckAll = () => {
    checkAllServices(providers);
  };

  const offlineServices = getOfflineServices();

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Service Status Monitor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleStartMonitoring}
              disabled={isMonitoring}
              variant="default"
            >
              Start Monitoring
            </Button>
            <Button
              onClick={handleStopMonitoring}
              disabled={!isMonitoring}
              variant="outline"
            >
              Stop Monitoring
            </Button>
            <Button
              onClick={handleCheckAll}
              variant="secondary"
            >
              Check All Services
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={isMonitoring ? "default" : "secondary"}>
              {isMonitoring ? "Monitoring" : "Stopped"}
            </Badge>
          </div>

          {offlineServices.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm font-medium text-red-800">
                {offlineServices.length} Service(s) Offline
              </div>
              <div className="text-xs text-red-600 mt-1">
                {offlineServices.join(', ')}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service Status Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceStatusSummary
            serviceStatus={serviceStatus}
            onRefreshAll={handleCheckAll}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Individual Service Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {providers.map(provider => {
              const status = getServiceStatus(provider);
              const isDown = isServiceDown(provider);
              
              return (
                <div key={provider} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-medium capitalize">{provider}</span>
                    <Badge
                      variant={isDown ? "destructive" : status.isOnline ? "default" : "secondary"}
                    >
                      {isDown ? "Offline" : status.isOnline ? "Online" : "Unstable"}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {status.lastChecked && (
                      <span className="text-xs text-muted-foreground">
                        Last checked: {new Date(status.lastChecked).toLocaleTimeString()}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => checkProvider(provider)}
                      disabled={status.isChecking}
                    >
                      {status.isChecking ? "Checking..." : "Check"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
