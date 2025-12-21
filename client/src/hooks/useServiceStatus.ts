/**
 * AI Service Status Monitoring Hook
 * Provides real-time monitoring of AI service availability and health
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AIProvider } from './useAIProvider';

// Debounce utility function
const debounce = <T extends (...args: any[]) => void>(func: T, delay: number): T => {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
};

export interface ServiceStatus {
  isOnline: boolean;
  lastChecked: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  isChecking: boolean;
  responseTime?: number;
  errorType?: 'network' | 'timeout' | 'auth' | 'rate_limit' | 'server_error' | 'credit_required' | 'unknown';
  serviceStatus: 'online' | 'offline' | 'auth_required' | 'credit_required' | 'rate_limited' | 'checking';
  /** Seconds until rate limit resets (from server 429 response) */
  rateLimitRetryAfter?: number;
  /** Timestamp when rate limit will reset */
  rateLimitResetTime?: number;
}

export interface ServiceStatusMap {
  [key: string]: ServiceStatus;
}

interface ServiceStatusOptions {
  checkInterval?: number; // milliseconds
  maxConsecutiveFailures?: number;
  timeoutMs?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: Required<ServiceStatusOptions> = {
  checkInterval: 300000, // 300 seconds (5 minutes - much reduced frequency)
  maxConsecutiveFailures: 3,
  timeoutMs: 10000, // 10 seconds
  retryDelay: 5000 // 5 seconds
};

export const useServiceStatus = (options: ServiceStatusOptions = {}) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusMap>({});
  const [isMonitoring, setIsMonitoring] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const checkPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const lastCheckTimeRef = useRef<Map<string, number>>(new Map());
  const debouncedUpdateRef = useRef<Map<string, ReturnType<typeof debounce>>>(new Map());
  const clientRateLimitRef = useRef<Map<string, { count: number; resetTime: number }>>(new Map());
  
  // Global rate limiter to prevent ANY health checks from exceeding limits
  const globalRateLimitRef = useRef<{ count: number; resetTime: number }>({ count: 0, resetTime: 0 });
  
  // Server-side rate limit backoff tracking (from 429 responses)
  // This tracks when the server told us to back off
  const serverRateLimitBackoffRef = useRef<Map<string, number>>(new Map());

  // Initialize service status for all providers
  const initializeServiceStatus = useCallback((providers: AIProvider[]) => {
    const initialStatus: ServiceStatusMap = {};
    providers.forEach(provider => {
      initialStatus[provider] = {
        isOnline: true, // Assume online initially
        lastChecked: null,
        lastError: null,
        consecutiveFailures: 0,
        isChecking: false,
        serviceStatus: 'online'
      };
    });
    setServiceStatus(initialStatus);
  }, []);

  // Perform health check for a specific service
  const checkServiceHealth = useCallback(async (provider: AIProvider): Promise<ServiceStatus> => {
    const startTime = Date.now();
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), opts.timeoutMs);
      });

      // Create health check promise based on provider
      const healthCheckPromise = performProviderHealthCheck(provider);
      
      // Race between health check and timeout
      await Promise.race([healthCheckPromise, timeoutPromise]);
      
      const responseTime = Date.now() - startTime;
      
      return {
        isOnline: true,
        lastChecked: new Date(),
        lastError: null,
        consecutiveFailures: 0,
        isChecking: false,
        responseTime,
        errorType: undefined,
        serviceStatus: 'online',
        rateLimitRetryAfter: undefined,
        rateLimitResetTime: undefined
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorType = categorizeError(errorMessage);
      const serviceStatus = determineServiceStatus(errorMessage, errorType);
      
      // Only count infrastructure failures as consecutive failures
      // Rate limits, auth issues, and credit issues should NOT count as consecutive failures
      const isInfrastructureFailure = serviceStatus === 'offline';
      
      // Extract retryAfter from error if available (for 429 responses)
      const retryAfter = (error as any)?.retryAfter as number | undefined;
      const rateLimitResetTime = retryAfter ? Date.now() + (retryAfter * 1000) : undefined;
      
      // Log rate limit info for debugging
      if (serviceStatus === 'rate_limited') {
        console.log(`[ServiceStatus] ${provider} is rate limited${retryAfter ? ` - retry after ${retryAfter}s` : ''}`);
      }
      
      return {
        // Service is "online" unless it's a true infrastructure failure
        // Rate limited services are still "online" - just temporarily unavailable
        isOnline: serviceStatus !== 'offline',
        lastChecked: new Date(),
        lastError: errorMessage,
        // Don't increment consecutive failures for rate limits - this is expected behavior
        consecutiveFailures: isInfrastructureFailure ? 1 : 0,
        isChecking: false,
        responseTime,
        errorType,
        serviceStatus,
        rateLimitRetryAfter: retryAfter,
        rateLimitResetTime
      };
    }
  }, [opts.timeoutMs]);

  /**
   * Parse error response from server to extract detailed error info
   * Especially important for 429 rate limit responses which include retryAfter
   */
  const parseErrorResponse = async (response: Response, providerName: string): Promise<never> => {
    let errorMessage = `${providerName} endpoint returned ${response.status}`;
    let retryAfterSeconds: number | undefined;
    
    try {
      const errorData = await response.json();
      
      // Extract error message from response body if available
      if (errorData.error) {
        errorMessage = typeof errorData.error === 'string' 
          ? errorData.error 
          : errorData.error.message || errorMessage;
      }
      if (errorData.message) {
        errorMessage = errorData.message;
      }
      
      // Extract retryAfter for rate limit responses
      if (response.status === 429 && errorData.retryAfter) {
        retryAfterSeconds = Number(errorData.retryAfter);
        errorMessage = `Rate limit exceeded. Retry after ${retryAfterSeconds}s`;
      }
    } catch {
      // Response body wasn't JSON, use status-based message
      if (response.status === 429) {
        errorMessage = 'Rate limit exceeded (429). Please wait before checking again.';
      }
    }
    
    // Create error with additional metadata
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).retryAfter = retryAfterSeconds;
    throw error;
  };

  // Perform actual health check for each provider
  const performProviderHealthCheck = async (provider: AIProvider): Promise<void> => {
    const testMessage = { role: 'user' as const, content: 'ping' };
    
    switch (provider) {
      case 'lmstudio': {
        const { LMStudioService } = await import('../lib/lmstudio');
        const baseUrl = localStorage.getItem('lmstudio-base-url') || 'https://lmstudio.uterpi.com';
        const service = new LMStudioService({ 
          apiKey: 'not-needed', 
          baseUrl, 
          modelName: 'nomadic-icdu-v8' 
        });
        await service.sendChatCompletion([testMessage], { maxTokens: 10 });
        break;
      }
      
      case 'gemini': {
        const apiKey = localStorage.getItem('gemini-api-key');
        if (!apiKey) throw new Error('Gemini API key not configured');
        
        const { GeminiService } = await import('../lib/gemini');
        const service = new GeminiService({ 
          apiKey, 
          modelName: 'gemini-2.5-flash' 
        });
        await service.sendChatCompletion([testMessage], { maxTokens: 10 });
        break;
      }
      
      case 'openai': {
        const apiKey = localStorage.getItem('openai-api-key');
        if (!apiKey) throw new Error('OpenAI API key not configured');
        
        const { OpenAIService } = await import('../lib/openAI');
        const service = new OpenAIService({ 
          apiKey, 
          modelName: 'gpt-4o-mini' 
        });
        await service.sendChatCompletion([testMessage], { maxTokens: 10 });
        break;
      }
      
      case 'azure': {
        // Azure AI is server-side configured, just test the endpoint
        const response = await fetch('/ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            provider: 'azure',
            messages: [testMessage],
            max_tokens: 10,
            stream: false
          })
        });
        
        if (!response.ok) {
          await parseErrorResponse(response, 'Azure AI');
        }
        break;
      }
      
      case 'huggingface': {
        const apiToken = localStorage.getItem('huggingface-api-token');
        const endpointUrl = localStorage.getItem('huggingface-endpoint-url');
        if (!apiToken || !endpointUrl) {
          throw new Error('Hugging Face configuration incomplete');
        }
        
        const { HuggingFaceService } = await import('../lib/huggingface');
        const service = new HuggingFaceService({ 
          apiToken, 
          endpointUrl, 
          modelName: 'hf-endpoint' 
        });
        await service.sendChatCompletion([testMessage], { maxTokens: 10 });
        break;
      }
      
      case 'uterpi': {
        // Uterpi is server-side configured
        const response = await fetch('/ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            provider: 'uterpi',
            messages: [testMessage],
            max_tokens: 10,
            stream: false
          })
        });
        
        if (!response.ok) {
          await parseErrorResponse(response, 'Uterpi');
        }
        break;
      }
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  };

  // Categorize error types for better user feedback
  const categorizeError = (errorMessage: string): ServiceStatus['errorType'] => {
    const message = errorMessage.toLowerCase();
    
    if (message.includes('fetch failed') || message.includes('econnrefused') || message.includes('network')) {
      return 'network';
    }
    if (message.includes('timeout') || message.includes('aborted')) {
      return 'timeout';
    }
    if (message.includes('api key') || message.includes('authentication') || message.includes('unauthorized') || message.includes(' 401')) {
      return 'auth';
    }
    // Properly detect 429 responses and rate limit errors
    if (message.includes('rate limit') || message.includes('quota') || message.includes(' 429') || message.includes('too many requests')) {
      return 'rate_limit';
    }
    if (message.includes('subscription error') || message.includes('402') || message.includes('credit') || message.includes('insufficient')) {
      return 'credit_required';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return 'server_error';
    }
    
    return 'unknown';
  };

  // Determine service status based on error type
  const determineServiceStatus = (errorMessage: string, errorType: ServiceStatus['errorType']): ServiceStatus['serviceStatus'] => {
    const message = errorMessage.toLowerCase();
    
    // Infrastructure failures - service is truly offline
    if (errorType === 'network' || errorType === 'timeout' || errorType === 'server_error') {
      return 'offline';
    }
    
    // User account issues - service is online but user can't use it
    if (errorType === 'credit_required' || message.includes('subscription error') || message.includes('402')) {
      return 'credit_required';
    }
    
    if (errorType === 'auth' || message.includes('401') || message.includes('unauthorized')) {
      return 'auth_required';
    }
    
    if (errorType === 'rate_limit' || message.includes('429') || message.includes('rate limit')) {
      return 'rate_limited';
    }
    
    // Default to offline for unknown errors
    return 'offline';
  };

  // Update service status with proper consecutive failure logic and debouncing
  const updateServiceStatus = useCallback((provider: AIProvider, status: ServiceStatus) => {
    // Get or create debounced update function for this provider
    if (!debouncedUpdateRef.current.has(provider)) {
      debouncedUpdateRef.current.set(provider, debounce((newStatus: ServiceStatus) => {
        setServiceStatus(prev => {
          const currentStatus = prev[provider];
          const isInfrastructureFailure = newStatus.serviceStatus === 'offline';
          const isUserIssue = ['credit_required', 'auth_required', 'rate_limited'].includes(newStatus.serviceStatus);
          
          // Only count infrastructure failures as consecutive failures
          // User issues (credits, auth, rate limits) don't count as consecutive failures
          let consecutiveFailures = currentStatus?.consecutiveFailures || 0;
          
          if (isInfrastructureFailure) {
            consecutiveFailures = (currentStatus?.consecutiveFailures || 0) + 1;
          } else if (newStatus.serviceStatus === 'online') {
            consecutiveFailures = 0; // Reset on successful connection
          }
          // For user issues, keep the existing consecutive failure count
          
          return {
            ...prev,
            [provider]: {
              ...currentStatus,
              ...newStatus,
              consecutiveFailures,
              // Ensure isOnline reflects the actual service availability
              isOnline: newStatus.serviceStatus === 'online' || isUserIssue
            }
          };
        });
      }, 500)); // 500ms debounce
    }
    
    // Call the debounced update function
    debouncedUpdateRef.current.get(provider)!(status);
  }, []);

  // Check all services
  const checkAllServices = useCallback(async (providers: AIProvider[]) => {
    // Global rate limiting - prevent ANY health checks if global limit exceeded
    const now = Date.now();
    const globalLimit = globalRateLimitRef.current;
    const GLOBAL_RATE_LIMIT = 5; // Max 5 health checks total per window
    const GLOBAL_RATE_WINDOW = 300000; // 5 minutes
    
    if (globalLimit.count >= GLOBAL_RATE_LIMIT && now < globalLimit.resetTime) {
      console.log(`Global health check rate limit exceeded - skipping all checks for ${Math.round((globalLimit.resetTime - now) / 1000)}s`);
      return;
    }
    
    if (now > globalLimit.resetTime) {
      globalRateLimitRef.current = { count: 0, resetTime: now + GLOBAL_RATE_WINDOW };
    }
    
    const checkPromises = providers.map(async (provider) => {
      // Skip if already checking this provider
      if (checkPromisesRef.current.has(provider)) {
        return;
      }
      
      // Check for server-side rate limit backoff (from previous 429 responses)
      const serverBackoffUntil = serverRateLimitBackoffRef.current.get(provider) || 0;
      if (now < serverBackoffUntil) {
        const waitTime = Math.ceil((serverBackoffUntil - now) / 1000);
        console.log(`[ServiceStatus] ${provider} server-side rate limit backoff active - ${waitTime}s remaining (skipping)`);
        return;
      }
      
      // Increment global counter
      globalRateLimitRef.current.count++;

      // Client-side rate limiting for automatic checks - VERY RESTRICTIVE
      const clientRateLimit = clientRateLimitRef.current.get(provider);
      const CLIENT_RATE_LIMIT = 1; // Only 1 automatic check per window
      const CLIENT_RATE_WINDOW = 600000; // 10 minutes - much longer window
      
      if (clientRateLimit) {
        if (now > clientRateLimit.resetTime) {
          // Reset the counter
          clientRateLimitRef.current.set(provider, { count: 1, resetTime: now + CLIENT_RATE_WINDOW });
        } else if (clientRateLimit.count >= CLIENT_RATE_LIMIT) {
          // Client-side rate limit exceeded for automatic checks
          console.log(`Skipping automatic health check for ${provider} - client rate limit exceeded`);
          return;
        } else {
          // Increment counter
          clientRateLimit.count++;
        }
      } else {
        // First automatic request for this provider
        clientRateLimitRef.current.set(provider, { count: 1, resetTime: now + CLIENT_RATE_WINDOW });
      }

      // Mark as checking
      updateServiceStatus(provider, { 
        ...serviceStatus[provider], 
        isChecking: true 
      });

      const checkPromise = checkServiceHealth(provider).then(() => {});
      checkPromisesRef.current.set(provider, checkPromise);

      try {
        const status = await checkServiceHealth(provider);
        
        // Track rate limit backoff from server response
        if (status.serviceStatus === 'rate_limited' && status.rateLimitResetTime) {
          serverRateLimitBackoffRef.current.set(provider, status.rateLimitResetTime);
        } else if (status.serviceStatus === 'online') {
          serverRateLimitBackoffRef.current.delete(provider);
        }
        
        updateServiceStatus(provider, status);
      } catch (error) {
        console.error(`Health check failed for ${provider}:`, error);
        
        // Check if this is a rate limit error
        const retryAfter = (error as any)?.retryAfter as number | undefined;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorType = categorizeError(errorMessage);
        const derivedServiceStatus = determineServiceStatus(errorMessage, errorType);
        
        // Handle rate limit errors gracefully - don't mark as offline
        if (derivedServiceStatus === 'rate_limited' || retryAfter) {
          const backoffTime = retryAfter 
            ? Date.now() + (retryAfter * 1000) 
            : Date.now() + 60000;
          serverRateLimitBackoffRef.current.set(provider, backoffTime);
          
          updateServiceStatus(provider, {
            isOnline: true,
            lastChecked: new Date(),
            lastError: errorMessage,
            consecutiveFailures: 0,
            isChecking: false,
            errorType: 'rate_limit',
            serviceStatus: 'rate_limited',
            rateLimitRetryAfter: retryAfter || 60,
            rateLimitResetTime: backoffTime
          });
        } else {
          // Non-rate-limit error
          updateServiceStatus(provider, {
            isOnline: derivedServiceStatus !== 'offline',
            lastChecked: new Date(),
            lastError: errorMessage,
            consecutiveFailures: derivedServiceStatus === 'offline' 
              ? (serviceStatus[provider]?.consecutiveFailures || 0) + 1 
              : 0,
            isChecking: false,
            errorType,
            serviceStatus: derivedServiceStatus
          });
        }
      } finally {
        checkPromisesRef.current.delete(provider);
      }
    });

    await Promise.allSettled(checkPromises);
  }, [checkServiceHealth, updateServiceStatus, serviceStatus]);

  // Start monitoring (with automatic checks DISABLED to prevent rate limit issues)
  const startMonitoring = useCallback((providers: AIProvider[]) => {
    if (isMonitoring) return;

    setIsMonitoring(true);
    initializeServiceStatus(providers);

    // NO automatic checks - only manual checks allowed to prevent rate limit issues
    console.log('Service monitoring started - automatic health checks DISABLED to prevent rate limits');
    
    // Completely disabled automatic interval to prevent rate limit issues
    // intervalRef.current = setInterval(() => {
    //   checkAllServices(providers);
    // }, opts.checkInterval);
  }, [isMonitoring, initializeServiceStatus]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  // Get service status
  const getServiceStatus = useCallback((provider: AIProvider): ServiceStatus => {
    return serviceStatus[provider] || {
      isOnline: true,
      lastChecked: null,
      lastError: null,
      consecutiveFailures: 0,
      isChecking: false,
      serviceStatus: 'online'
    };
  }, [serviceStatus]);

  // Manual health check for specific provider with aggressive cooldown and client-side rate limiting
  const checkProvider = useCallback(async (provider: AIProvider) => {
    const now = Date.now();
    
    // Check if server told us to back off (from a previous 429 response)
    const serverBackoffUntil = serverRateLimitBackoffRef.current.get(provider) || 0;
    if (now < serverBackoffUntil) {
      const waitTime = Math.ceil((serverBackoffUntil - now) / 1000);
      console.log(`[ServiceStatus] ${provider} server-side rate limit backoff active - ${waitTime}s remaining`);
      
      // Return current status with rate limited info instead of making a request
      const currentStatus = serviceStatus[provider];
      if (currentStatus) {
        return {
          ...currentStatus,
          serviceStatus: 'rate_limited' as const,
          lastError: `Rate limited. Please wait ${waitTime}s before checking again.`,
          isOnline: true, // Service is online, just rate limited
          rateLimitRetryAfter: waitTime,
          rateLimitResetTime: serverBackoffUntil
        };
      }
      
      return {
        isOnline: true,
        lastChecked: new Date(),
        lastError: `Rate limited. Please wait ${waitTime}s before checking again.`,
        consecutiveFailures: 0,
        isChecking: false,
        serviceStatus: 'rate_limited' as const,
        rateLimitRetryAfter: waitTime,
        rateLimitResetTime: serverBackoffUntil
      };
    }
    
    // Global rate limiting - prevent ANY health checks if global limit exceeded
    const globalLimit = globalRateLimitRef.current;
    const GLOBAL_RATE_LIMIT = 5; // Max 5 health checks total per window
    const GLOBAL_RATE_WINDOW = 300000; // 5 minutes
    
    if (globalLimit.count >= GLOBAL_RATE_LIMIT && now < globalLimit.resetTime) {
      console.log(`Global health check rate limit exceeded - skipping manual check for ${provider}`);
      return serviceStatus[provider] || {
        isOnline: true,
        lastChecked: null,
        lastError: null,
        consecutiveFailures: 0,
        isChecking: false,
        serviceStatus: 'online'
      };
    }
    
    if (now > globalLimit.resetTime) {
      globalRateLimitRef.current = { count: 0, resetTime: now + GLOBAL_RATE_WINDOW };
    }
    
    // Increment global counter
    globalRateLimitRef.current.count++;
    
    const lastCheck = lastCheckTimeRef.current.get(provider) || 0;
    const cooldownMs = 120000; // 2 minute cooldown between manual checks (very aggressive)
    
    // Client-side rate limiting: max 1 request per 2 minutes per provider
    const clientRateLimit = clientRateLimitRef.current.get(provider);
    const CLIENT_RATE_LIMIT = 1;
    const CLIENT_RATE_WINDOW = 120000; // 2 minutes
    
    if (clientRateLimit) {
      if (now > clientRateLimit.resetTime) {
        // Reset the counter
        clientRateLimitRef.current.set(provider, { count: 1, resetTime: now + CLIENT_RATE_WINDOW });
      } else if (clientRateLimit.count >= CLIENT_RATE_LIMIT) {
        // Client-side rate limit exceeded
        console.log(`Client-side rate limit exceeded for ${provider} - skipping health check`);
        return serviceStatus[provider] || {
          isOnline: true,
          lastChecked: null,
          lastError: null,
          consecutiveFailures: 0,
          isChecking: false,
          serviceStatus: 'online'
        };
      } else {
        // Increment counter
        clientRateLimit.count++;
      }
    } else {
      // First request for this provider
      clientRateLimitRef.current.set(provider, { count: 1, resetTime: now + CLIENT_RATE_WINDOW });
    }
    
    // Skip if checked recently
    if (now - lastCheck < cooldownMs) {
      console.log(`Skipping health check for ${provider} - cooldown active (${Math.round((cooldownMs - (now - lastCheck)) / 1000)}s remaining)`);
      return serviceStatus[provider] || {
        isOnline: true,
        lastChecked: null,
        lastError: null,
        consecutiveFailures: 0,
        isChecking: false,
        serviceStatus: 'online'
      };
    }
    
    lastCheckTimeRef.current.set(provider, now);
    
    updateServiceStatus(provider, { 
      ...serviceStatus[provider], 
      isChecking: true,
      serviceStatus: 'checking'
    });

    try {
      const status = await checkServiceHealth(provider);
      
      // If we got a rate limit response, store the backoff time
      if (status.serviceStatus === 'rate_limited' && status.rateLimitResetTime) {
        serverRateLimitBackoffRef.current.set(provider, status.rateLimitResetTime);
        console.log(`[ServiceStatus] ${provider} rate limited - backoff until ${new Date(status.rateLimitResetTime).toLocaleTimeString()}`);
      } else if (status.serviceStatus === 'online') {
        // Clear backoff on successful response
        serverRateLimitBackoffRef.current.delete(provider);
      }
      
      updateServiceStatus(provider, status);
      return status;
    } catch (error) {
      // Check if this error contains rate limit info
      const retryAfter = (error as any)?.retryAfter as number | undefined;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorType = categorizeError(errorMessage);
      const derivedServiceStatus = determineServiceStatus(errorMessage, errorType);
      
      // If it's a rate limit error, track the backoff
      if (derivedServiceStatus === 'rate_limited' || retryAfter) {
        const backoffTime = retryAfter 
          ? Date.now() + (retryAfter * 1000) 
          : Date.now() + 60000; // Default 60s backoff if no retryAfter
        serverRateLimitBackoffRef.current.set(provider, backoffTime);
        
        const rateLimitStatus: ServiceStatus = {
          isOnline: true, // Service is online, just rate limited
          lastChecked: new Date(),
          lastError: errorMessage,
          consecutiveFailures: 0, // Rate limits don't count as failures
          isChecking: false,
          errorType: 'rate_limit',
          serviceStatus: 'rate_limited',
          rateLimitRetryAfter: retryAfter || 60,
          rateLimitResetTime: backoffTime
        };
        updateServiceStatus(provider, rateLimitStatus);
        return rateLimitStatus;
      }
      
      // For non-rate-limit errors, handle normally
      const errorStatus: ServiceStatus = {
        isOnline: derivedServiceStatus !== 'offline',
        lastChecked: new Date(),
        lastError: errorMessage,
        consecutiveFailures: derivedServiceStatus === 'offline' 
          ? (serviceStatus[provider]?.consecutiveFailures || 0) + 1 
          : 0,
        isChecking: false,
        errorType,
        serviceStatus: derivedServiceStatus
      };
      updateServiceStatus(provider, errorStatus);
      return errorStatus;
    }
  }, [checkServiceHealth, updateServiceStatus, serviceStatus]);

  // Check if service is considered down (only infrastructure failures)
  const isServiceDown = useCallback((provider: AIProvider): boolean => {
    const status = serviceStatus[provider] || {
      isOnline: true,
      lastChecked: null,
      lastError: null,
      consecutiveFailures: 0,
      isChecking: false,
      serviceStatus: 'online'
    };
    return status.serviceStatus === 'offline' && status.consecutiveFailures >= opts.maxConsecutiveFailures;
  }, [serviceStatus, opts.maxConsecutiveFailures]);

  // Get all offline services
  const getOfflineServices = useCallback((): AIProvider[] => {
    return Object.keys(serviceStatus).filter(provider => {
      const status = serviceStatus[provider] || {
        isOnline: true,
        lastChecked: null,
        lastError: null,
        consecutiveFailures: 0,
        isChecking: false,
        serviceStatus: 'online'
      };
      return status.serviceStatus === 'offline' && status.consecutiveFailures >= opts.maxConsecutiveFailures;
    }) as AIProvider[];
  }, [serviceStatus, opts.maxConsecutiveFailures]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
      // Clear all debounced update functions and rate limiting
      debouncedUpdateRef.current.clear();
      clientRateLimitRef.current.clear();
      serverRateLimitBackoffRef.current.clear();
    };
  }, [stopMonitoring]);

  return {
    serviceStatus,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    checkProvider,
    checkAllServices,
    getServiceStatus,
    isServiceDown,
    getOfflineServices
  };
};
