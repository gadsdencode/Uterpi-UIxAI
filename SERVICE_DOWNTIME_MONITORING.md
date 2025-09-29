# AI Service Downtime Monitoring System

## Overview

This document describes the comprehensive service downtime monitoring and visual feedback system implemented to handle AI service failures gracefully. The system provides real-time monitoring, visual indicators, and user-friendly error messages when AI services like LMStudio, Gemini, or other providers go down.

## Architecture

### Core Components

1. **useServiceStatus Hook** (`client/src/hooks/useServiceStatus.ts`)
   - Central service status monitoring
   - Health check automation
   - Error categorization and tracking
   - Retry logic and failure detection

2. **ServiceStatusIndicator Component** (`client/src/components/ServiceStatusIndicator.tsx`)
   - Visual status indicators
   - Compact and full view modes
   - Service status summary
   - Real-time status updates

3. **Enhanced Error Handler** (`client/src/lib/error-handler.ts`)
   - Improved error categorization
   - Service-specific error messages
   - Network error detection
   - User-friendly error feedback

4. **Integration Points**
   - ChatView component integration
   - AIProviderQuickSelector enhancement
   - Real-time status monitoring

## Features

### Real-Time Monitoring

- **Automatic Health Checks**: Services are monitored every 30 seconds by default
- **Immediate Detection**: Network errors trigger instant status updates
- **Failure Tracking**: Consecutive failures are tracked to determine service status
- **Response Time Monitoring**: Tracks service response times for performance insights

### Visual Feedback

- **Status Indicators**: Color-coded dots and badges show service status
  - 🟢 Green: Online and fully functional
  - 🟡 Yellow: Credits required or configuration needed
  - 🟠 Orange: Authentication required
  - 🟣 Purple: Rate limited
  - 🔴 Red: Offline due to infrastructure issues
  - 🔵 Blue: Currently checking status

- **Service Status Summary**: Overview of all configured services
- **Detailed Error Information**: Tooltips and expanded views show error details
- **Refresh Controls**: Manual refresh buttons for immediate status checks

### Error Categorization

The system categorizes errors into specific types for better user feedback:

- **Network Errors**: Connection refused, fetch failures (Service Offline)
- **Timeout Errors**: Request timeouts, slow responses (Service Offline)
- **Authentication Errors**: Invalid API keys, auth failures (Service Online, Auth Required)
- **Rate Limit Errors**: Quota exceeded, rate limiting (Service Online, Rate Limited)
- **Credit Required Errors**: Insufficient credits, subscription issues (Service Online, Credits Required)
- **Server Errors**: 5xx HTTP status codes (Service Offline)
- **Unknown Errors**: Unclassified errors (Service Offline)

### Service Status Types

The system distinguishes between infrastructure issues and user account issues:

- **Online**: Service is fully functional and user can use it
- **Offline**: Service is unreachable due to infrastructure issues (network, server errors)
- **Auth Required**: Service is online but user needs to configure authentication
- **Credits Required**: Service is online but user needs more credits/subscription
- **Rate Limited**: Service is online but temporarily rate limited
- **Checking**: Currently performing health check

### User Experience

- **Non-Intrusive**: Status indicators don't interrupt normal usage
- **Informative**: Clear error messages explain what's wrong
- **Actionable**: Users can refresh services or switch providers
- **Contextual**: Status shown where relevant (chat interface, settings)

## Implementation Details

### Service Health Checks

```typescript
// Example health check for LMStudio
const performProviderHealthCheck = async (provider: AIProvider): Promise<void> => {
  const testMessage = { role: 'user' as const, content: 'ping' };
  
  switch (provider) {
    case 'lmstudio': {
      const service = new LMStudioService({ 
        apiKey: 'not-needed', 
        baseUrl: localStorage.getItem('lmstudio-base-url') || 'https://lmstudio.uterpi.com',
        modelName: 'nomadic-icdu-v8' 
      });
      await service.sendChatCompletion([testMessage], { maxTokens: 10 });
      break;
    }
    // ... other providers
  }
};
```

### Error Detection and Handling

```typescript
// Enhanced error categorization
const categorizeError = (errorMessage: string): ServiceStatus['errorType'] => {
  const message = errorMessage.toLowerCase();
  
  if (message.includes('fetch failed') || message.includes('econnrefused')) {
    return 'network';
  }
  if (message.includes('timeout') || message.includes('aborted')) {
    return 'timeout';
  }
  // ... other categorizations
};
```

### Visual Status Indicators

```typescript
// Status display logic
const getStatusDisplay = () => {
  if (status.isChecking) {
    return {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      color: 'text-blue-400',
      label: 'Checking...'
    };
  }
  
  if (status.isOnline) {
    return {
      icon: <CheckCircle className="w-3 h-3" />,
      color: 'text-green-400',
      label: 'Online'
    };
  }
  
  if (status.consecutiveFailures >= 3) {
    return {
      icon: <XCircle className="w-3 h-3" />,
      color: 'text-red-400',
      label: 'Offline'
    };
  }
  
  return {
    icon: <AlertCircle className="w-3 h-3" />,
    color: 'text-yellow-400',
    label: 'Unstable'
  };
};
```

## Configuration

### Service Status Options

```typescript
interface ServiceStatusOptions {
  checkInterval?: number; // milliseconds (default: 30000)
  maxConsecutiveFailures?: number; // (default: 3)
  timeoutMs?: number; // (default: 10000)
  retryDelay?: number; // (default: 5000)
}
```

### Provider Configuration

Each AI provider is configured with:
- Health check endpoint
- Authentication requirements
- Error handling specifics
- Timeout settings

## Usage Examples

### Basic Service Monitoring

```typescript
const {
  serviceStatus,
  startMonitoring,
  stopMonitoring,
  checkProvider,
  isServiceDown
} = useServiceStatus();

// Start monitoring all providers
useEffect(() => {
  const providers: AIProvider[] = ['lmstudio', 'azure', 'openai', 'gemini'];
  startMonitoring(providers);
  
  return () => stopMonitoring();
}, []);
```

### Service Status Display

```typescript
<ServiceStatusIndicator
  provider={currentProvider}
  status={getServiceStatus(currentProvider)}
  onRefresh={() => checkProvider(currentProvider)}
  compact
/>
```

### Error Handling Integration

```typescript
try {
  await sendMessage(messages);
} catch (err) {
  // Check if this is a service downtime error
  if (err instanceof Error) {
    const errorMessage = err.message.toLowerCase();
    if (errorMessage.includes('fetch failed') || 
        errorMessage.includes('econnrefused')) {
      // Trigger immediate service status check
      checkProvider(currentProvider);
    }
  }
  
  // Use centralized error handling
  handleError(err, {
    operation: 'send_message',
    component: 'ChatView',
    userId: user?.id?.toString(),
    timestamp: new Date()
  });
}
```

## Testing

### Test Components

1. **ServiceStatusTest** (`client/src/components/ServiceStatusTest.tsx`)
   - Interactive service monitoring dashboard
   - Manual health check controls
   - Status visualization

2. **ErrorScenarioTest** (`client/src/components/ErrorScenarioTest.tsx`)
   - Automated error scenario testing
   - Network error simulation
   - Error handler validation

### Test Scenarios

- Network connection refused (ECONNREFUSED)
- Invalid API key authentication
- Request timeouts
- Server errors (5xx status codes)
- Error handler integration

## Benefits

### For Users

- **Clear Visibility**: Always know which services are available
- **Better Error Messages**: Understand what went wrong and how to fix it
- **Proactive Notifications**: Get warned before services fail
- **Seamless Experience**: Graceful degradation when services are down

### For Developers

- **Centralized Monitoring**: Single source of truth for service status
- **Extensible Design**: Easy to add new providers or error types
- **Comprehensive Logging**: Detailed error tracking and analytics
- **Test Coverage**: Automated testing of error scenarios

### For Operations

- **Real-Time Monitoring**: Immediate detection of service issues
- **Performance Insights**: Response time tracking and analysis
- **Failure Patterns**: Understanding of common failure modes
- **Proactive Maintenance**: Early warning system for service degradation

## Future Enhancements

### Planned Features

1. **Service Recovery Detection**: Automatic detection when services come back online
2. **Fallback Mechanisms**: Automatic switching to backup providers
3. **Performance Metrics**: Historical performance data and trends
4. **Alert System**: Notifications for critical service failures
5. **Service Health Dashboard**: Comprehensive monitoring interface

### Integration Opportunities

1. **External Monitoring**: Integration with external monitoring services
2. **Slack/Discord Notifications**: Team notifications for service issues
3. **Analytics Integration**: Service usage and performance analytics
4. **Automated Recovery**: Self-healing mechanisms for common issues

## Conclusion

The AI Service Downtime Monitoring System provides a robust, user-friendly solution for handling service failures. By combining real-time monitoring, visual feedback, and comprehensive error handling, it ensures users have a smooth experience even when AI services encounter issues.

The system is designed to be:
- **Reliable**: Consistent monitoring and accurate status reporting
- **User-Friendly**: Clear visual indicators and helpful error messages
- **Maintainable**: Well-structured code with comprehensive testing
- **Extensible**: Easy to add new providers and error types

This implementation significantly improves the reliability and user experience of the AI chat application by providing transparency and control over service availability.
