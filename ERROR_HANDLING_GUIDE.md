# Error Handling System Guide

This guide explains how to use the comprehensive error handling system implemented across the application.

## Overview

The error handling system provides:
- **Centralized error management** with consistent patterns
- **User-friendly error messages** instead of technical jargon
- **Proper HTTP status codes** for API responses
- **Retry mechanisms** for transient failures
- **Error tracking and logging** for debugging
- **Graceful degradation** when services are unavailable

## Server-Side Error Handling

### Basic Usage

```typescript
import { asyncHandler, createError } from './error-handler';

// Wrap async route handlers
app.get('/api/users/:id', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) {
    throw createError.notFound('User');
  }
  res.json(user);
}));
```

### Error Types

```typescript
// Validation errors (400)
throw createError.validation('Invalid email format', { field: 'email' });

// Authentication errors (401)
throw createError.authentication('Invalid credentials');

// Authorization errors (403)
throw createError.authorization('Insufficient permissions');

// Not found errors (404)
throw createError.notFound('User');

// Conflict errors (409)
throw createError.conflict('Email already exists');

// Rate limit errors (429)
throw createError.rateLimit('Too many requests');

// Subscription errors (402)
throw createError.subscription('INSUFFICIENT_CREDITS', 'Not enough credits');

// External service errors (502)
throw createError.externalService('Stripe', 'Payment service unavailable');

// Database errors (500)
throw createError.database('Failed to save user', originalError);
```

### Retry Operations

```typescript
import { retryOperation } from './error-handler';

const result = await retryOperation(
  () => externalApiCall(),
  3, // max retries
  1000, // base delay in ms
  'external-api-call' // context
);
```

## Client-Side Error Handling

### Basic Usage

```typescript
import { handleError, createError } from '@/lib/error-handler';

try {
  const response = await fetch('/api/data');
  const data = await response.json();
} catch (error) {
  handleError(error, {
    operation: 'fetch_data',
    component: 'DataComponent',
    userId: user?.id?.toString(),
    timestamp: new Date()
  });
}
```

### Safe Fetch Wrapper

```typescript
import { safeFetch } from '@/lib/error-handler';

try {
  const response = await safeFetch('/api/data', {
    method: 'POST',
    body: JSON.stringify(data)
  }, {
    operation: 'create_data',
    component: 'DataComponent',
    userId: user?.id?.toString(),
    timestamp: new Date()
  });
  
  const result = await response.json();
} catch (error) {
  // Error is already handled and user feedback shown
  console.log('Operation failed:', error.message);
}
```

### Retry Operations

```typescript
import { retryOperation } from '@/lib/error-handler';

try {
  const result = await retryOperation(
    () => riskyOperation(),
    {
      operation: 'risky_operation',
      component: 'MyComponent',
      userId: user?.id?.toString(),
      timestamp: new Date()
    },
    3, // max retries
    1000 // base delay
  );
} catch (error) {
  // Final attempt failed
}
```

## Error Types and User Messages

### Network Errors
- **User sees**: "Network connection failed. Please check your internet connection and try again."
- **Action**: Retry button available

### Validation Errors
- **User sees**: "Please check your input and try again."
- **Action**: Form validation feedback

### Authentication Errors
- **User sees**: "Please log in to continue."
- **Action**: "Go to Login" button

### Subscription Errors
- **User sees**: Context-specific messages like "You need more AI credits to perform this action."
- **Action**: "Buy Credits" or "Upgrade Now" buttons

### External Service Errors
- **User sees**: "A service is temporarily unavailable. Please try again later."
- **Action**: Retry button (for retryable errors)

## Error Response Format

### Server Response
```json
{
  "error": "ValidationError",
  "message": "Please check your input and try again.",
  "code": "VALIDATION_ERROR",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "retryable": false,
  "details": {
    "field": "email",
    "originalMessage": "Invalid email format"
  }
}
```

### Client Error Object
```typescript
interface ClientError {
  name: string;
  message: string;
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
```

## Best Practices

### Server-Side
1. **Use specific error types** instead of generic errors
2. **Wrap async handlers** with `asyncHandler`
3. **Provide context** in error messages
4. **Log errors** with sufficient detail for debugging
5. **Don't expose sensitive information** in error responses

### Client-Side
1. **Always provide context** when calling `handleError`
2. **Use safeFetch** for API calls when possible
3. **Implement retry logic** for transient failures
4. **Show user-friendly messages** instead of technical errors
5. **Provide recovery actions** when appropriate

### Error Boundaries
```typescript
import { handleError } from '@/lib/error-handler';

class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    handleError(error, {
      operation: 'react_error_boundary',
      component: this.props.componentName || 'Unknown',
      timestamp: new Date(),
      details: errorInfo
    });
  }
}
```

## Migration Guide

### Before (Basic Error Handling)
```typescript
// Server
} catch (error) {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

// Client
} catch (error) {
  console.error('Error:', error);
  toast.error('Something went wrong');
}
```

### After (Enhanced Error Handling)
```typescript
// Server
} catch (error) {
  if (error.message.includes('not found')) {
    throw createError.notFound('Resource');
  }
  throw createError.database('Operation failed', error);
}

// Client
} catch (error) {
  handleError(error, {
    operation: 'operation_name',
    component: 'ComponentName',
    userId: user?.id?.toString(),
    timestamp: new Date()
  });
}
```

## Error Tracking

The system automatically tracks errors for analytics:
- Error frequency and patterns
- User impact assessment
- Component-specific error rates
- Retry success rates

Access error statistics:
```typescript
import { errorHandler } from '@/lib/error-handler';

const stats = errorHandler.getErrorStats();
console.log('Error statistics:', stats);
```

## Testing Error Scenarios

### Server Testing
```typescript
import { createError } from './error-handler';

test('should throw validation error for invalid input', async () => {
  await expect(asyncHandler(async (req, res) => {
    throw createError.validation('Invalid input');
  })).rejects.toThrow('Invalid input');
});
```

### Client Testing
```typescript
import { handleError, createError } from '@/lib/error-handler';

test('should handle network errors gracefully', () => {
  const networkError = createError.network('Connection failed');
  const context = {
    operation: 'test_operation',
    component: 'TestComponent',
    timestamp: new Date()
  };
  
  expect(() => handleError(networkError, context)).not.toThrow();
});
```

This error handling system ensures consistent, user-friendly error management across the entire application while providing developers with the tools needed for effective debugging and monitoring.
