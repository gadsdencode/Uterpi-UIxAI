// AI Types and Interfaces
// Shared type definitions for AI services and controllers

import type { Request } from 'express';

// Azure AI Configuration
export interface AzureAIConfig {
  endpoint: string;
  apiKey: string;
  modelName: string;
  maxRetries?: number;
  retryDelay?: number;
  cacheEnabled?: boolean;
}

// Generic AI Client Configuration
export interface AIClientConfig {
  modelName: string;
  apiKey?: string;
  endpoint?: string;
  baseURL?: string;
  maxRetries?: number;
  retryDelay?: number;
  cacheEnabled?: boolean;
}

// AI Client Result
export interface AIClientResult {
  client: any;
  config: AIClientConfig;
}

// AI Service Metrics
export interface AIServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  totalResponseTime: number;
  avgResponseTime: number;
  endpointStats: Map<string, EndpointStats>;
  errorTypes: Map<string, number>;
}

export interface EndpointStats {
  requests: number;
  successes: number;
  failures: number;
  avgResponseTime: number;
}

// AI Cache Entry
export interface AICacheEntry {
  response: any;
  timestamp: number;
  ttl: number;
}

// Credit Deduction Result
export interface CreditDeductionResult {
  creditsUsed: number;
  remainingBalance: number;
}

// Authenticated Request with user data
export interface AuthenticatedRequest extends Request {
  user?: any & {
    id: number;
    creditsPending?: {
      amount: number;
      operationType: string;
      currentBalance: number;
    };
    freeMessageUsed?: boolean;
    needsCreditDeduction?: {
      operationType: string;
    };
  };
}

// LM Studio Base URL Info
export interface LMStudioBaseInfo {
  url: string;
  isProduction: boolean;
}

// Supported AI Providers
export type AIProvider = 'gemini' | 'openai' | 'azure' | 'azureai' | 'lmstudio' | 'uterpi';

// UI Analysis Result
export interface UIAnalysisResult {
  components: Array<{
    type: string;
    description: string;
    styles?: any;
    props?: any;
  }>;
  colorPalette?: string[];
  layout?: string;
  typography?: any;
}

// Page Generation Result
export interface PageGenerationResult {
  projectMetadata: {
    template: string;
    complexity: string;
    estimatedDevTime: string;
    recommendedFeatures: string[];
  };
  pageStructure: {
    layout: string;
    sections: any[];
  };
  colorScheme?: any;
  components?: any[];
}

// Performance Analysis Result
export interface PerformanceAnalysisResult {
  performanceMetrics: {
    loadTime: { value: string; grade: string; benchmark: string };
    bundleSize: { main: string; chunks: string; total: string; grade: string };
    renderPerformance: {
      firstPaint: string;
      firstContentfulPaint: string;
      largestContentfulPaint: string;
      cumulativeLayoutShift: string;
      grade: string;
    };
    memoryUsage: { initialHeap: string; peakHeap: string; memoryLeaks: string; grade: string };
  };
  optimizationSuggestions: Array<{
    category: string;
    priority: string;
    issue: string;
    solution: string;
    expectedImprovement: string;
    effort: string;
    impact: string;
  }>;
  codeQualityMetrics: {
    codeSmells: string;
    duplicateCode: string;
    complexity: string;
    maintainability: string;
  };
  securityAssessment: {
    vulnerabilities: string;
    riskLevel: string;
    recommendations: string[];
  };
  overallScore: {
    performance: string;
    grade: string;
    summary: string;
    priorityActions: string[];
  };
  _fallback?: boolean;
  _timestamp?: number;
}

// Code Analysis Result
export interface CodeAnalysisResult {
  analysisMetadata?: {
    codeLength: number;
    complexity: string;
    overallScore: string;
    primaryLanguage: string;
  };
  improvements: Array<{
    category?: string;
    type: string;
    description: string;
    severity: string;
    line?: number | string;
    currentCode?: string;
    suggestedFix?: string;
    suggestion?: string;
    reasoning?: string;
    impact?: string;
  }>;
  optimizedCode: string;
  summary?: {
    totalIssues: string;
    criticalIssues: string;
    estimatedImprovement: string;
    keyBenefits: string[];
  };
}

// Pattern Analysis Result
export interface PatternAnalysisResult {
  detected: Array<{
    name: string;
    usage: string;
    recommendation: string;
  }>;
  antiPatterns: Array<{
    name: string;
    instances: number;
    severity: string;
  }>;
}

