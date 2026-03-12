/**
 * Service Status Indicator Component
 * Displays real-time status of AI services with visual feedback
 */

import React, { useMemo } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Wifi, 
  WifiOff,
  Clock,
  RefreshCw
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';
import { AIProvider } from '../hooks/useAIProvider';
import { ServiceStatus } from '../hooks/useServiceStatus';

interface ServiceStatusIndicatorProps {
  provider: AIProvider;
  status: ServiceStatus;
  onRefresh?: () => void;
  compact?: boolean;
  showDetails?: boolean;
  className?: string;
}

const providerConfig = {
  lmstudio: { name: 'Uterpi AI', icon: '🚀', color: 'purple' },
  azure: { name: 'Azure AI', icon: '☁️', color: 'blue' },
  openai: { name: 'OpenAI', icon: '🤖', color: 'green' },
  gemini: { name: 'Gemini', icon: '✨', color: 'purple' },
  huggingface: { name: 'Hugging Face', icon: '🤗', color: 'orange' },
  uterpi: { name: 'Uterpi', icon: '🚀', color: 'purple' }
};

export const ServiceStatusIndicator: React.FC<ServiceStatusIndicatorProps> = React.memo(({
  provider,
  status,
  onRefresh,
  compact = false,
  showDetails = false,
  className
}) => {
  const config = providerConfig[provider];
  
  // Determine status color and icon based on service status
  const getStatusDisplay = () => {
    if (status.isChecking || status.serviceStatus === 'checking') {
      return {
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        borderColor: 'border-blue-500/50',
        label: 'Checking...'
      };
    }
    
    switch (status.serviceStatus) {
      case 'online':
        return {
          icon: <CheckCircle className="w-3 h-3" />,
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          borderColor: 'border-green-500/50',
          label: 'Online'
        };
      
      case 'offline':
        return {
          icon: <XCircle className="w-3 h-3" />,
          color: 'text-red-400',
          bgColor: 'bg-red-500/20',
          borderColor: 'border-red-500/50',
          label: 'Offline'
        };
      
      case 'credit_required':
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          borderColor: 'border-yellow-500/50',
          label: 'Credits Required'
        };
      
      case 'auth_required':
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          color: 'text-orange-400',
          bgColor: 'bg-orange-500/20',
          borderColor: 'border-orange-500/50',
          label: 'Auth Required'
        };
      
      case 'rate_limited': {
        // Calculate remaining time if available
        let label = 'Rate Limited';
        if (status.rateLimitResetTime) {
          const remainingMs = status.rateLimitResetTime - Date.now();
          if (remainingMs > 0) {
            const remainingSec = Math.ceil(remainingMs / 1000);
            label = remainingSec > 60 
              ? `Rate Limited (${Math.ceil(remainingSec / 60)}m)`
              : `Rate Limited (${remainingSec}s)`;
          }
        }
        return {
          icon: <Clock className="w-3 h-3" />,
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/20',
          borderColor: 'border-purple-500/50',
          label
        };
      }
      
      default:
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          borderColor: 'border-yellow-500/50',
          label: 'Unknown'
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  
  // Memoize tooltip content to prevent unnecessary re-renders
  const tooltipContent = useMemo(() => {
    const formatLastChecked = (date: Date | null) => {
      if (!date) return 'Never';
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      
      return date.toLocaleDateString();
    };
    
    const formatRateLimitReset = () => {
      if (!status.rateLimitResetTime) return null;
      const remainingMs = status.rateLimitResetTime - Date.now();
      if (remainingMs <= 0) return null;
      const remainingSec = Math.ceil(remainingMs / 1000);
      return remainingSec > 60 
        ? `Retry in ${Math.ceil(remainingSec / 60)} minute(s)`
        : `Retry in ${remainingSec} second(s)`;
    };

    return (
      <div className="space-y-1">
        <div className="font-medium">{config.name}</div>
        <div className={cn("flex items-center gap-1 text-xs", statusDisplay.color)}>
          {statusDisplay.icon}
          {statusDisplay.label}
        </div>
        {status.lastChecked && (
          <div className="text-xs text-muted-foreground">
            Last checked: {formatLastChecked(status.lastChecked)}
          </div>
        )}
        {status.serviceStatus === 'rate_limited' && (
          <div className="text-xs text-purple-400">
            {formatRateLimitReset() || 'Rate limit will reset soon'}
          </div>
        )}
        {status.serviceStatus === 'rate_limited' && (
          <div className="text-xs text-muted-foreground italic">
            Service is online, just temporarily rate limited
          </div>
        )}
        {status.lastError && status.serviceStatus !== 'rate_limited' && (
          <div className="text-xs text-red-400 max-w-xs">
            {status.lastError}
          </div>
        )}
      </div>
    );
  }, [
    config.name, 
    statusDisplay.color, 
    statusDisplay.icon, 
    statusDisplay.label, 
    status.lastChecked, 
    status.lastError,
    status.serviceStatus,
    status.isChecking,
    status.rateLimitResetTime
  ]);

  // Get error type display
  const getErrorTypeDisplay = (errorType?: ServiceStatus['errorType']) => {
    switch (errorType) {
      case 'network':
        return { icon: <WifiOff className="w-3 h-3" />, label: 'Network Error' };
      case 'timeout':
        return { icon: <Clock className="w-3 h-3" />, label: 'Timeout' };
      case 'auth':
        return { icon: <AlertCircle className="w-3 h-3" />, label: 'Auth Error' };
      case 'rate_limit':
        return { icon: <Clock className="w-3 h-3" />, label: 'Rate Limited (temporary)' };
      case 'credit_required':
        return { icon: <AlertCircle className="w-3 h-3" />, label: 'Credits Required' };
      case 'server_error':
        return { icon: <XCircle className="w-3 h-3" />, label: 'Server Error' };
      default:
        return { icon: <AlertCircle className="w-3 h-3" />, label: 'Error' };
    }
  };

  const errorDisplay = getErrorTypeDisplay(status.errorType);

  // Compact view
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md border",
            statusDisplay.bgColor,
            statusDisplay.borderColor,
            className
          )}>
            <span className="text-xs">{config.icon}</span>
            {statusDisplay.icon}
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
              >
                <RefreshCw className="w-2 h-2" />
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Full view
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border",
      statusDisplay.bgColor,
      statusDisplay.borderColor,
      className
    )}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <div>
            <div className="font-medium text-sm">{config.name}</div>
            <div className={cn("flex items-center gap-1 text-xs", statusDisplay.color)}>
              {statusDisplay.icon}
              {statusDisplay.label}
            </div>
          </div>
        </div>
        
        {showDetails && (
          <div className="text-xs text-muted-foreground space-y-1">
            {status.lastChecked && (
              <div>Last checked: {(() => {
                const date = status.lastChecked;
                if (!date) return 'Never';
                
                const now = new Date();
                const diffMs = now.getTime() - date.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                
                if (diffMins < 1) return 'Just now';
                if (diffMins < 60) return `${diffMins}m ago`;
                
                const diffHours = Math.floor(diffMins / 60);
                if (diffHours < 24) return `${diffHours}h ago`;
                
                return date.toLocaleDateString();
              })()}</div>
            )}
            {status.responseTime && (
              <div>Response time: {status.responseTime}ms</div>
            )}
            {status.consecutiveFailures > 0 && (
              <div>Failures: {status.consecutiveFailures}</div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {status.lastError && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-red-400">
                {errorDisplay.icon}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <div className="font-medium">{errorDisplay.label}</div>
                <div className="text-xs max-w-xs">{status.lastError}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
        
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onRefresh}
            disabled={status.isChecking}
          >
            <RefreshCw className={cn("w-3 h-3", status.isChecking && "animate-spin")} />
          </Button>
        )}
      </div>
    </div>
  );
});

ServiceStatusIndicator.displayName = 'ServiceStatusIndicator';

// Service Status Summary Component
interface ServiceStatusSummaryProps {
  serviceStatus: Record<string, ServiceStatus>;
  onRefreshAll?: () => void;
  className?: string;
}

export const ServiceStatusSummary: React.FC<ServiceStatusSummaryProps> = ({
  serviceStatus,
  onRefreshAll,
  className
}) => {
  const services = Object.entries(serviceStatus);
  const onlineCount = services.filter(([_, status]) => status.isOnline).length;
  const totalCount = services.length;
  const offlineServices = services.filter(([_, status]) => !status.isOnline && status.consecutiveFailures >= 3);
  
  const getOverallStatus = () => {
    const onlineServices = services.filter(([_, status]) => status.serviceStatus === 'online').length;
    const offlineServices = services.filter(([_, status]) => status.serviceStatus === 'offline').length;
    const creditRequiredServices = services.filter(([_, status]) => status.serviceStatus === 'credit_required').length;
    const authRequiredServices = services.filter(([_, status]) => status.serviceStatus === 'auth_required').length;
    
    if (offlineServices === 0 && creditRequiredServices === 0 && authRequiredServices === 0) {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: 'text-green-400',
        label: 'All Services Online'
      };
    }
    
    if (offlineServices === totalCount) {
      return {
        icon: <XCircle className="w-4 h-4" />,
        color: 'text-red-400',
        label: 'All Services Offline'
      };
    }
    
    if (offlineServices > 0) {
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-red-400',
        label: `${offlineServices} Service(s) Offline`
      };
    }
    
    if (creditRequiredServices > 0 || authRequiredServices > 0) {
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-yellow-400',
        label: `${creditRequiredServices + authRequiredServices} Service(s) Need Setup`
      };
    }
    
    return {
      icon: <CheckCircle className="w-4 h-4" />,
      color: 'text-green-400',
      label: 'All Services Online'
    };
  };

  const overallStatus = getOverallStatus();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {overallStatus.icon}
          <span className={cn("text-sm font-medium", overallStatus.color)}>
            {overallStatus.label}
          </span>
        </div>
        
        {onRefreshAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefreshAll}
            className="h-6 px-2 text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh All
          </Button>
        )}
      </div>
      
      <div className="text-xs text-muted-foreground">
        {onlineCount}/{totalCount} services online
      </div>
      
      {offlineServices.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-red-400">Offline Services:</div>
          {offlineServices.map(([provider, status]) => (
            <ServiceStatusIndicator
              key={provider}
              provider={provider as AIProvider}
              status={status}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
};
