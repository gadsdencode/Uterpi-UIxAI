/**
 * Centralized Error Handling System
 * Provides consistent error handling across the application
 */

import { Request, Response, NextFunction } from 'express';

// Error types and interfaces
export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: any;
  userMessage?: string;
  retryable?: boolean;
}

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  retryable?: boolean;
}

// Custom error classes
export class ValidationError extends Error implements AppError {
  statusCode = 400;
  isOperational = true;
  code = 'VALIDATION_ERROR';
  details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    this.userMessage = 'Please check your input and try again.';
  }
}

export class AuthenticationError extends Error implements AppError {
  statusCode = 401;
  isOperational = true;
  code = 'AUTHENTICATION_ERROR';

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
    this.userMessage = 'Please log in to continue.';
  }
}

export class AuthorizationError extends Error implements AppError {
  statusCode = 403;
  isOperational = true;
  code = 'AUTHORIZATION_ERROR';

  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
    this.userMessage = 'You do not have permission to perform this action.';
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  isOperational = true;
  code = 'NOT_FOUND';

  constructor(resource: string = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.userMessage = 'The requested resource was not found.';
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  isOperational = true;
  code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
    this.userMessage = 'This action conflicts with existing data.';
  }
}

export class RateLimitError extends Error implements AppError {
  statusCode = 429;
  isOperational = true;
  code = 'RATE_LIMIT_EXCEEDED';
  retryable = true;

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
    this.userMessage = 'Too many requests. Please wait a moment and try again.';
  }
}

export class SubscriptionError extends Error implements AppError {
  statusCode = 402;
  isOperational = true;
  code: string;
  details: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'SubscriptionError';
    this.code = code;
    this.details = details;
    this.userMessage = this.getUserMessage(code);
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
}

export class ExternalServiceError extends Error implements AppError {
  statusCode = 502;
  isOperational = true;
  code = 'EXTERNAL_SERVICE_ERROR';
  retryable = true;
  service: string;

  constructor(service: string, message: string) {
    super(`External service error (${service}): ${message}`);
    this.name = 'ExternalServiceError';
    this.service = service;
    this.userMessage = 'A service is temporarily unavailable. Please try again later.';
  }
}

export class DatabaseError extends Error implements AppError {
  statusCode = 500;
  isOperational = false;
  code = 'DATABASE_ERROR';

  constructor(message: string, originalError?: Error) {
    super(`Database error: ${message}`);
    this.name = 'DatabaseError';
    this.userMessage = 'A database error occurred. Please try again.';
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

// Error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let appError: AppError;

  // Convert known errors to AppError
  if (error instanceof ValidationError ||
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof RateLimitError ||
      error instanceof SubscriptionError ||
      error instanceof ExternalServiceError ||
      error instanceof DatabaseError) {
    appError = error;
  } else {
    // Handle unknown errors
    appError = {
      name: 'InternalServerError',
      message: error.message || 'Internal server error',
      statusCode: 500,
      isOperational: false,
      code: 'INTERNAL_SERVER_ERROR',
      userMessage: 'An unexpected error occurred. Please try again later.',
      retryable: false
    } as AppError;
  }

  // Log error details
  const logLevel = appError.statusCode >= 500 ? 'error' : 'warn';
  console[logLevel](`${appError.name}: ${appError.message}`, {
    statusCode: appError.statusCode,
    code: appError.code,
    stack: appError.stack,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: (req as any).user?.id
  });

  // Prepare error response
  const errorResponse: ErrorResponse = {
    error: appError.name,
    message: appError.userMessage || appError.message,
    code: appError.code,
    timestamp: new Date().toISOString(),
    retryable: appError.retryable
  };

  // Add details for operational errors in development
  if (process.env.NODE_ENV === 'development' && appError.isOperational) {
    errorResponse.details = {
      originalMessage: appError.message,
      ...appError.details
    };
  }

  // Add request ID if available
  if ((req as any).requestId) {
    errorResponse.requestId = (req as any).requestId;
  }

  res.status(appError.statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Error creation utilities
export const createError = {
  validation: (message: string, details?: any) => new ValidationError(message, details),
  authentication: (message?: string) => new AuthenticationError(message),
  authorization: (message?: string) => new AuthorizationError(message),
  notFound: (resource?: string) => new NotFoundError(resource),
  conflict: (message: string) => new ConflictError(message),
  rateLimit: (message?: string) => new RateLimitError(message),
  subscription: (code: string, message: string, details?: any) => new SubscriptionError(code, message, details),
  externalService: (service: string, message: string) => new ExternalServiceError(service, message),
  database: (message: string, originalError?: Error) => new DatabaseError(message, originalError)
};

// Retry utility with exponential backoff
export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  context: string = 'operation'
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        console.error(`❌ ${context} failed after ${maxRetries + 1} attempts:`, lastError);
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`⚠️ ${context} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

// Error boundary for unhandled errors
export const handleUnhandledErrors = () => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, you might want to send this to an error tracking service
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    // In production, you might want to gracefully shutdown the process
    process.exit(1);
  });
};
