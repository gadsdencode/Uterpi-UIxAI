/**
 * Client-side Error Handling System
 * Provides consistent error handling and user feedback
 */

import { toast } from 'sonner';

// Error types and interfaces
export interface ClientError extends Error {
  code?: string;
  statusCode?: number;
  retryable?: boolean;
  userMessage?: string;
  details?: any;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ErrorContext {
  operation: string;
  component?: string;
  userId?: string;
  timestamp: Date;
  retryCount?: number;
}

// Custom error classes
export class NetworkError extends Error implements ClientError {
  code = 'NETWORK_ERROR';
  statusCode = 0;
  retryable = true;
  userMessage = 'Network connection failed. Please check your internet connection and try again.';

  constructor(message: string = 'Network error occurred') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error implements ClientError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;
  retryable = false;
  userMessage = 'Please check your input and try again.';
  details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class AuthenticationError extends Error implements ClientError {
  code = 'AUTHENTICATION_ERROR';
  statusCode = 401;
  retryable = false;
  userMessage = 'Please log in to continue.';
  action?: { label: string; onClick: () => void };

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
    this.action = {
      label: 'Go to Login',
      onClick: () => window.location.href = '/'
    };
  }
}

export class AuthorizationError extends Error implements ClientError {
  code = 'AUTHORIZATION_ERROR';
  statusCode = 403;
  retryable = false;
  userMessage = 'You do not have permission to perform this action.';

  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements ClientError {
  code = 'NOT_FOUND';
  statusCode = 404;
  retryable = false;
  userMessage = 'The requested resource was not found.';

  constructor(resource: string = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class SubscriptionError extends Error implements ClientError {
  code: string;
  statusCode = 402;
  retryable = false;
  details: any;
  userMessage: string;
  action?: { label: string; onClick: () => void };

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'SubscriptionError';
    this.code = code;
    this.details = details;
    this.userMessage = this.getUserMessage(code);
    this.action = this.getAction(code);
  }

  private getUserMessage(code: string): string {
    switch (code) {
      case 'INSUFFICIENT_CREDITS':
        return 'You need more AI credits to perform this action.';
      case 'SUBSCRIPTION_REQUIRED':
        return 'A subscription is required for this feature.';
      case 'SUBSCRIPTION_EXPIRED':
        return 'Your subscription has expired. Please renew to continue.';
      case 'TIER_UPGRADE_REQUIRED':
        return 'Please upgrade your plan to access this feature.';
      default:
        return 'Subscription issue detected. Please check your account.';
    }
  }

  private getAction(code: string) {
    switch (code) {
      case 'INSUFFICIENT_CREDITS':
        return {
          label: 'Buy Credits',
          onClick: () => window.location.href = '/pricing'
        };
      case 'SUBSCRIPTION_REQUIRED':
      case 'SUBSCRIPTION_EXPIRED':
      case 'TIER_UPGRADE_REQUIRED':
        return {
          label: 'Upgrade Now',
          onClick: () => window.location.href = '/pricing'
        };
      default:
        return {
          label: 'View Plans',
          onClick: () => window.location.href = '/pricing'
        };
    }
  }
}

export class RateLimitError extends Error implements ClientError {
  code = 'RATE_LIMIT_EXCEEDED';
  statusCode = 429;
  retryable = true;
  userMessage = 'Too many requests. Please wait a moment and try again.';

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ExternalServiceError extends Error implements ClientError {
  code = 'EXTERNAL_SERVICE_ERROR';
  statusCode = 502;
  retryable = true;
  userMessage = 'A service is temporarily unavailable. Please try again later.';
  service: string;
  errorType?: 'network' | 'timeout' | 'auth' | 'rate_limit' | 'server_error' | 'unknown';

  constructor(service: string, message: string, errorType?: 'network' | 'timeout' | 'auth' | 'rate_limit' | 'server_error' | 'unknown') {
    super(`External service error (${service}): ${message}`);
    this.name = 'ExternalServiceError';
    this.service = service;
    this.errorType = errorType;
    
    // Customize user message based on error type
    if (errorType) {
      this.userMessage = this.getUserMessageForErrorType(errorType, service);
    }
  }

  private getUserMessageForErrorType(errorType: string, service: string): string {
    switch (errorType) {
      case 'network':
        return `${service} is currently unreachable. Please check your internet connection and try again.`;
      case 'timeout':
        return `${service} is responding slowly. Please wait a moment and try again.`;
      case 'auth':
        return `${service} authentication failed. Please check your API key in settings.`;
      case 'rate_limit':
        return `${service} rate limit exceeded. Please wait a moment before trying again.`;
      case 'server_error':
        return `${service} is experiencing technical difficulties. Please try again later.`;
      default:
        return `${service} is temporarily unavailable. Please try again later.`;
    }
  }
}

// Error handler class
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: Array<{ error: Error; context: ErrorContext; timestamp: Date }> = [];

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  // Main error handling method
  handleError(error: Error, context: ErrorContext): void {
    const clientError = this.normalizeError(error);
    
    // Log error
    this.logError(clientError, context);
    
    // Show user feedback
    this.showUserFeedback(clientError, context);
    
    // Track error for analytics
    this.trackError(clientError, context);
  }

  // Normalize different error types to ClientError
  private normalizeError(error: Error): ClientError {
    // If it's already a ClientError, return as is
    if (this.isClientError(error)) {
      return error as ClientError;
    }

    // Handle fetch errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new NetworkError('Network request failed');
    }

    // Handle JSON parsing errors
    if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
      return new ExternalServiceError('API', 'Invalid response format', 'server_error');
    }

    // Handle timeout errors
    if (error.message.includes('timeout') || error.message.includes('aborted')) {
      return new NetworkError('Request timed out');
    }

    // Handle connection refused errors
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      return new ExternalServiceError('AI Service', 'Service is currently unreachable', 'network');
    }

    // Handle authentication errors
    if (error.message.includes('401') || error.message.includes('unauthorized') || error.message.includes('api key')) {
      return new ExternalServiceError('AI Service', 'Authentication failed', 'auth');
    }

    // Handle rate limit errors
    if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('quota')) {
      return new ExternalServiceError('AI Service', 'Rate limit exceeded', 'rate_limit');
    }

    // Handle server errors
    if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503') || error.message.includes('504')) {
      return new ExternalServiceError('AI Service', 'Server error occurred', 'server_error');
    }

    // Default to generic error
    return {
      name: 'UnknownError',
      message: error.message || 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      retryable: false,
      userMessage: 'Something went wrong. Please try again.'
    } as ClientError;
  }

  // Check if error is already a ClientError
  private isClientError(error: Error): error is ClientError {
    return 'code' in error && 'userMessage' in error;
  }

  // Log error for debugging
  private logError(error: ClientError, context: ErrorContext): void {
    const logEntry = {
      error,
      context,
      timestamp: new Date()
    };

    this.errorLog.push(logEntry);

    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }

    // Console log based on error severity
    const logLevel = error.statusCode && error.statusCode >= 500 ? 'error' : 'warn';
    console[logLevel](`[${context.operation}] ${error.name}: ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      context,
      stack: error.stack
    });
  }

  // Show user feedback via toast
  private showUserFeedback(error: ClientError, context: ErrorContext): void {
    const title = this.getErrorTitle(error);
    const description = error.userMessage || error.message;
    const duration = error.retryable ? 8000 : 5000;

    // Prepare toast options for sonner
    const toastOptions: any = {
      description,
      duration,
    };

    // Add action button if available
    if (error.action) {
      toastOptions.action = {
        label: error.action.label,
        onClick: error.action.onClick
      };
    }

    // Show appropriate toast type using sonner API
    if (error.statusCode && error.statusCode >= 500) {
      toast.error(title, toastOptions);
    } else if (error.statusCode === 402) {
      // Special handling for subscription errors
      toast.error(title, toastOptions);
    } else if (error.retryable) {
      toast.warning(title, toastOptions);
    } else {
      toast.error(title, toastOptions);
    }
  }

  // Get appropriate error title
  private getErrorTitle(error: ClientError): string {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Connection Error';
      case 'VALIDATION_ERROR':
        return 'Invalid Input';
      case 'AUTHENTICATION_ERROR':
        return 'Login Required';
      case 'AUTHORIZATION_ERROR':
        return 'Access Denied';
      case 'NOT_FOUND':
        return 'Not Found';
      case 'SUBSCRIPTION_ERROR':
        return 'Subscription Issue';
      case 'RATE_LIMIT_EXCEEDED':
        return 'Too Many Requests';
      case 'EXTERNAL_SERVICE_ERROR':
        return 'Service Unavailable';
      default:
        return 'Error';
    }
  }

  // Track error for analytics
  private trackError(error: ClientError, context: ErrorContext): void {
    // Track error occurrence
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'exception', {
        description: `${error.name}: ${error.message}`,
        fatal: error.statusCode && error.statusCode >= 500,
        custom_map: {
          error_code: error.code,
          operation: context.operation,
          component: context.component
        }
      });
    }
  }

  // Retry mechanism for retryable errors
  async retryOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const clientError = this.normalizeError(lastError);

        // Don't retry non-retryable errors
        if (!clientError.retryable) {
          throw lastError;
        }

        if (attempt === maxRetries) {
          this.handleError(lastError, { ...context, retryCount: attempt });
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`Retrying ${context.operation} in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  // Get error statistics
  getErrorStats(): { total: number; byCode: Record<string, number>; recent: any[] } {
    const byCode: Record<string, number> = {};
    
    this.errorLog.forEach(entry => {
      const code = (entry.error as ClientError).code || 'UNKNOWN';
      byCode[code] = (byCode[code] || 0) + 1;
    });

    return {
      total: this.errorLog.length,
      byCode,
      recent: this.errorLog.slice(-10)
    };
  }
}

// Convenience functions
export const errorHandler = ErrorHandler.getInstance();

export const handleError = (error: Error, context: ErrorContext) => {
  errorHandler.handleError(error, context);
};

export const retryOperation = <T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  maxRetries?: number,
  baseDelay?: number
) => {
  return errorHandler.retryOperation(operation, context, maxRetries, baseDelay);
};

// Error creation utilities
export const createError = {
  network: (message?: string) => new NetworkError(message),
  validation: (message: string, details?: any) => new ValidationError(message, details),
  authentication: (message?: string) => new AuthenticationError(message),
  authorization: (message?: string) => new AuthorizationError(message),
  notFound: (resource?: string) => new NotFoundError(resource),
  subscription: (code: string, message: string, details?: any) => new SubscriptionError(code, message, details),
  rateLimit: (message?: string) => new RateLimitError(message),
  externalService: (service: string, message: string, errorType?: 'network' | 'timeout' | 'auth' | 'rate_limit' | 'server_error' | 'unknown') => 
    new ExternalServiceError(service, message, errorType)
};

// Enhanced fetch wrapper with error handling
export const safeFetch = async (
  url: string,
  options: RequestInit = {},
  context: ErrorContext
): Promise<Response> => {
  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
      }

      // Handle specific status codes
      switch (response.status) {
        case 400:
          throw createError.validation(errorData.message || 'Invalid request', errorData);
        case 401:
          throw createError.authentication(errorData.message);
        case 403:
          throw createError.authorization(errorData.message);
        case 404:
          throw createError.notFound('Resource');
        case 402:
          throw createError.subscription(
            errorData.code || 'SUBSCRIPTION_ERROR',
            errorData.message || 'Subscription required',
            errorData
          );
        case 429:
          throw createError.rateLimit(errorData.message);
        case 502:
        case 503:
        case 504:
          throw createError.externalService('API', errorData.message || 'Service unavailable');
        default:
          throw new Error(errorData.message || `HTTP ${response.status}`);
      }
    }

    return response;
  } catch (error) {
    if (error instanceof NetworkError || 
        error instanceof ValidationError ||
        error instanceof AuthenticationError ||
        error instanceof AuthorizationError ||
        error instanceof NotFoundError ||
        error instanceof SubscriptionError ||
        error instanceof RateLimitError ||
        error instanceof ExternalServiceError) {
      throw error;
    }

    // Convert unknown errors
    throw createError.network(error instanceof Error ? error.message : 'Network error');
  }
};
