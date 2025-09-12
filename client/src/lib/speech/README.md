# Speech Services - Environment Variables Fix

## Issue Resolved
Fixed "process is not defined" error by replacing `process.env` with `import.meta.env` in browser environment.

## Changes Made
1. **speechServiceFactory.ts**: Updated environment variable access for Azure Speech key check
2. **azureSpeechService.ts**: Updated all environment variable accesses for Azure credentials

## Environment Variable Access in Vite
In Vite applications, environment variables must be accessed using:
```javascript
// ✅ Correct - Works in browser
import.meta.env.VITE_VARIABLE_NAME

// ❌ Incorrect - Causes "process is not defined" error
process.env.VITE_VARIABLE_NAME
```

## TypeScript Compatibility
To avoid TypeScript errors with `import.meta.env`, we use:
```javascript
(import.meta as any).env?.VITE_VARIABLE_NAME
```

This ensures compatibility while maintaining type safety where possible.
