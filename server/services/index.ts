// Services Index - Export all services
// Central export point for all service modules

// AI Service - AI client factory and provider configuration
export { 
  aiService, 
  createAIClient, 
  createAzureAIClient, 
  extractAzureAIError, 
  parseAzureAIJSON, 
  retryWithBackoff 
} from './aiService';

// AI Metrics Service - Request tracking and analytics
export { 
  aiMetricsService, 
  trackAIRequest, 
  trackCacheHit 
} from './aiMetricsService';

// AI Cache Service - Response caching
export { 
  aiCacheService, 
  getCacheKey, 
  getCachedResponse, 
  setCachedResponse 
} from './aiCacheService';

// Token Service - Token estimation and credit deduction
export { 
  tokenService, 
  estimateTokenCount, 
  countTokensFromMessages, 
  deductCreditsAfterResponse 
} from './tokenService';

// UI Generation Service - UI code and page generation
export { 
  uiGenerationService,
  generateUICodeWithAI,
  generateFallbackUICode,
  generatePageWithAI,
  generatePageFilesWithAI,
  generateFallbackPageStructure,
  generateFallbackPageFiles,
  generateFallbackPerformanceAnalysis,
  generateFallbackPatternAnalysis,
  generateFallbackCodeAnalysis,
  generateTailwindConfig,
  generateRoutesFile,
  getDefaultRoutes
} from './uiGenerationService';

// Re-export existing services
export { smsService } from './smsService';

// Storage Service - Replit Object Storage integration
export { 
  storageService, 
  generateStorageKey,
  type StorageServiceInterface 
} from './storageService';

