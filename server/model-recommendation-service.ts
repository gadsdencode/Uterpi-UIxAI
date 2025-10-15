/**
 * Model Recommendation Service
 * 
 * Configurable service for providing AI model recommendations based on
 * workflow types, task characteristics, and performance metrics.
 * 
 * This service separates model recommendation logic from the core AI Coach
 * service, making it easier to update recommendations without modifying
 * the main service code.
 */

export interface ModelRecommendation {
  modelId: string;
  modelName: string;
  provider: string;
  reasoning: string;
  expectedImprovement: number;
  confidence: number;
  useCases: string[];
  limitations?: string[];
}

export interface TaskCharacteristics {
  hasCode: boolean;
  hasAnalysis: boolean;
  hasWriting: boolean;
  hasResearch: boolean;
  hasDebugging: boolean;
  hasRefactoring: boolean;
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  timeSensitivity: 'low' | 'medium' | 'high';
  accuracyRequirement: 'low' | 'medium' | 'high';
}

export interface ModelPerformanceMetrics {
  modelId: string;
  successRate: number;
  averageResponseTime: number;
  costPerRequest: number;
  userSatisfaction: number;
  lastUpdated: Date;
}

export interface ModelRecommendationConfig {
  models: {
    [modelId: string]: {
      name: string;
      provider: string;
      capabilities: string[];
      strengths: string[];
      weaknesses: string[];
      costTier: 'low' | 'medium' | 'high';
      speedTier: 'fast' | 'medium' | 'slow';
      accuracyTier: 'high' | 'medium' | 'low';
    };
  };
  taskTypePreferences: {
    [taskType: string]: string[]; // Array of preferred model IDs
  };
  performanceThresholds: {
    minSuccessRate: number;
    maxResponseTime: number;
    maxCostPerRequest: number;
  };
  fallbackModels: string[]; // Models to use when primary recommendations fail
}

export class ModelRecommendationService {
  private config: ModelRecommendationConfig;
  private performanceMetrics: Map<string, ModelPerformanceMetrics> = new Map();

  constructor(config?: Partial<ModelRecommendationConfig>) {
    this.config = this.mergeWithDefaults(config || {});
    this.initializePerformanceMetrics();
  }

  /**
   * Get recommended model based on task characteristics and current model
   */
  getRecommendedModel(
    currentModel: string,
    taskCharacteristics: TaskCharacteristics,
    workflowType?: string
  ): ModelRecommendation {
    try {
      // Analyze task characteristics
      const taskScore = this.analyzeTaskCharacteristics(taskCharacteristics);
      
      // Get candidate models
      const candidates = this.getCandidateModels(taskCharacteristics, workflowType);
      
      // Score and rank candidates
      const scoredCandidates = candidates.map(modelId => ({
        modelId,
        score: this.scoreModel(modelId, taskScore, taskCharacteristics),
        metrics: this.performanceMetrics.get(modelId)
      }));

      // Sort by score and select best
      const bestCandidate = scoredCandidates
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (!bestCandidate) {
        return this.getFallbackRecommendation(currentModel);
      }

      const modelConfig = this.config.models[bestCandidate.modelId];
      if (!modelConfig) {
        return this.getFallbackRecommendation(currentModel);
      }

      return {
        modelId: bestCandidate.modelId,
        modelName: modelConfig.name,
        provider: modelConfig.provider,
        reasoning: this.generateReasoning(modelConfig, taskCharacteristics, bestCandidate.score),
        expectedImprovement: this.calculateExpectedImprovement(currentModel, bestCandidate.modelId),
        confidence: Math.min(95, bestCandidate.score * 10),
        useCases: modelConfig.capabilities,
        limitations: modelConfig.weaknesses
      };
    } catch (error) {
      console.error('Error getting model recommendation:', error);
      return this.getFallbackRecommendation(currentModel);
    }
  }

  /**
   * Update model performance metrics
   */
  updateModelPerformance(
    modelId: string,
    success: boolean,
    responseTime: number,
    userSatisfaction?: number
  ): void {
    const current = this.performanceMetrics.get(modelId);
    if (!current) return;

    // Update success rate with exponential moving average
    const alpha = 0.1; // Learning rate
    current.successRate = current.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    
    // Update response time with exponential moving average
    current.averageResponseTime = current.averageResponseTime * (1 - alpha) + responseTime * alpha;
    
    // Update user satisfaction if provided
    if (userSatisfaction !== undefined) {
      current.userSatisfaction = current.userSatisfaction * (1 - alpha) + userSatisfaction * alpha;
    }
    
    current.lastUpdated = new Date();
  }

  /**
   * Get model recommendations for a specific workflow type
   */
  getWorkflowTypeRecommendations(workflowType: string): ModelRecommendation[] {
    const preferredModels = this.config.taskTypePreferences[workflowType] || [];
    
    return preferredModels
      .map(modelId => {
        const modelConfig = this.config.models[modelId];
        if (!modelConfig) return null;

        return {
          modelId,
          modelName: modelConfig.name,
          provider: modelConfig.provider,
          reasoning: `Optimized for ${workflowType} workflows`,
          expectedImprovement: 25,
          confidence: 80,
          useCases: modelConfig.capabilities,
          limitations: modelConfig.weaknesses
        } as ModelRecommendation;
      })
      .filter((rec): rec is ModelRecommendation => rec !== null);
  }

  /**
   * Update configuration (useful for runtime updates)
   */
  updateConfig(newConfig: Partial<ModelRecommendationConfig>): void {
    this.config = this.mergeWithDefaults(newConfig);
    this.initializePerformanceMetrics();
  }

  /**
   * Get current configuration
   */
  getConfig(): ModelRecommendationConfig {
    return { ...this.config };
  }

  /**
   * Analyze task characteristics and return a score
   */
  private analyzeTaskCharacteristics(characteristics: TaskCharacteristics): number {
    let score = 0;
    
    // Weight different characteristics
    if (characteristics.hasCode) score += 3;
    if (characteristics.hasAnalysis) score += 2;
    if (characteristics.hasWriting) score += 2;
    if (characteristics.hasResearch) score += 1;
    if (characteristics.hasDebugging) score += 3;
    if (characteristics.hasRefactoring) score += 2;
    
    // Complexity multiplier
    const complexityMultiplier = {
      simple: 1,
      moderate: 1.2,
      complex: 1.5,
      expert: 2
    };
    score *= complexityMultiplier[characteristics.complexity];
    
    return score;
  }

  /**
   * Get candidate models based on task characteristics
   */
  private getCandidateModels(
    characteristics: TaskCharacteristics,
    workflowType?: string
  ): string[] {
    const candidates = new Set<string>();
    
    // Add workflow type specific models
    if (workflowType && this.config.taskTypePreferences[workflowType]) {
      this.config.taskTypePreferences[workflowType].forEach(modelId => {
        candidates.add(modelId);
      });
    }
    
    // Add models based on task characteristics
    Object.entries(this.config.models).forEach(([modelId, config]) => {
      if (this.isModelSuitableForTask(modelId, config, characteristics)) {
        candidates.add(modelId);
      }
    });
    
    return Array.from(candidates);
  }

  /**
   * Check if a model is suitable for the given task characteristics
   */
  private isModelSuitableForTask(
    modelId: string,
    modelConfig: ModelRecommendationConfig['models'][string],
    characteristics: TaskCharacteristics
  ): boolean {
    // Check performance thresholds
    const metrics = this.performanceMetrics.get(modelId);
    if (metrics) {
      if (metrics.successRate < this.config.performanceThresholds.minSuccessRate) return false;
      if (metrics.averageResponseTime > this.config.performanceThresholds.maxResponseTime) return false;
    }
    
    // Check capability alignment
    const hasRelevantCapability = modelConfig.capabilities.some(capability => {
      if (characteristics.hasCode && capability.includes('code')) return true;
      if (characteristics.hasAnalysis && capability.includes('analysis')) return true;
      if (characteristics.hasWriting && capability.includes('writing')) return true;
      if (characteristics.hasResearch && capability.includes('research')) return true;
      return false;
    });
    
    return hasRelevantCapability;
  }

  /**
   * Score a model based on task requirements
   */
  private scoreModel(
    modelId: string,
    taskScore: number,
    characteristics: TaskCharacteristics
  ): number {
    const modelConfig = this.config.models[modelId];
    const metrics = this.performanceMetrics.get(modelId);
    
    if (!modelConfig) return 0;
    
    let score = 0;
    
    // Base score from model capabilities
    score += this.getCapabilityScore(modelConfig, characteristics);
    
    // Performance bonus
    if (metrics) {
      score += metrics.successRate * 20; // Success rate weight
      score += (1 - Math.min(1, metrics.averageResponseTime / 5000)) * 10; // Speed bonus
      score += metrics.userSatisfaction * 15; // User satisfaction weight
    }
    
    // Cost consideration
    if (characteristics.timeSensitivity === 'high') {
      score += modelConfig.speedTier === 'fast' ? 10 : 0;
    }
    
    if (characteristics.accuracyRequirement === 'high') {
      score += modelConfig.accuracyTier === 'high' ? 15 : 0;
    }
    
    return Math.max(0, score);
  }

  /**
   * Get capability score for a model
   */
  private getCapabilityScore(
    modelConfig: ModelRecommendationConfig['models'][string],
    characteristics: TaskCharacteristics
  ): number {
    let score = 0;
    
    modelConfig.capabilities.forEach(capability => {
      if (characteristics.hasCode && capability.includes('code')) score += 3;
      if (characteristics.hasAnalysis && capability.includes('analysis')) score += 2;
      if (characteristics.hasWriting && capability.includes('writing')) score += 2;
      if (characteristics.hasResearch && capability.includes('research')) score += 1;
      if (characteristics.hasDebugging && capability.includes('debug')) score += 3;
      if (characteristics.hasRefactoring && capability.includes('refactor')) score += 2;
    });
    
    return score;
  }

  /**
   * Generate reasoning for the recommendation
   */
  private generateReasoning(
    modelConfig: ModelRecommendationConfig['models'][string],
    characteristics: TaskCharacteristics,
    score: number
  ): string {
    const reasons: string[] = [];
    
    // Add capability-based reasoning
    if (characteristics.hasCode) {
      reasons.push('excellent for coding tasks');
    }
    if (characteristics.hasAnalysis) {
      reasons.push('strong analytical capabilities');
    }
    if (characteristics.hasWriting) {
      reasons.push('optimized for writing tasks');
    }
    
    // Add performance reasoning
    if (score > 80) {
      reasons.push('high performance score');
    } else if (score > 60) {
      reasons.push('good performance score');
    }
    
    // Add model-specific strengths
    if (modelConfig.strengths.length > 0) {
      reasons.push(`strengths: ${modelConfig.strengths.slice(0, 2).join(', ')}`);
    }
    
    return reasons.length > 0 
      ? `Recommended because it's ${reasons.join(', ')}`
      : 'Recommended based on current task requirements';
  }

  /**
   * Calculate expected improvement over current model
   */
  private calculateExpectedImprovement(currentModel: string, recommendedModel: string): number {
    const currentMetrics = this.performanceMetrics.get(currentModel);
    const recommendedMetrics = this.performanceMetrics.get(recommendedModel);
    
    if (!currentMetrics || !recommendedMetrics) {
      return 25; // Default improvement estimate
    }
    
    const successRateImprovement = (recommendedMetrics.successRate - currentMetrics.successRate) * 100;
    const speedImprovement = (currentMetrics.averageResponseTime - recommendedMetrics.averageResponseTime) / currentMetrics.averageResponseTime * 100;
    
    return Math.max(10, Math.round((successRateImprovement + speedImprovement) / 2));
  }

  /**
   * Get fallback recommendation when no suitable model is found
   */
  private getFallbackRecommendation(currentModel: string): ModelRecommendation {
    const fallbackModelId = this.config.fallbackModels[0] || 'gpt-4o-mini';
    const fallbackConfig = this.config.models[fallbackModelId];
    
    return {
      modelId: fallbackModelId,
      modelName: fallbackConfig?.name || 'GPT-4o Mini',
      provider: fallbackConfig?.provider || 'OpenAI',
      reasoning: 'Fallback recommendation due to insufficient data',
      expectedImprovement: 15,
      confidence: 50,
      useCases: fallbackConfig?.capabilities || ['general-purpose'],
      limitations: fallbackConfig?.weaknesses || ['Limited specialized capabilities']
    };
  }

  /**
   * Initialize performance metrics with default values
   */
  private initializePerformanceMetrics(): void {
    Object.keys(this.config.models).forEach(modelId => {
      if (!this.performanceMetrics.has(modelId)) {
        this.performanceMetrics.set(modelId, {
          modelId,
          successRate: 0.85, // Default success rate
          averageResponseTime: 2000, // Default 2 seconds
          costPerRequest: 0.01, // Default cost
          userSatisfaction: 0.8, // Default satisfaction
          lastUpdated: new Date()
        });
      }
    });
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(userConfig: Partial<ModelRecommendationConfig>): ModelRecommendationConfig {
    const defaultConfig: ModelRecommendationConfig = {
      models: {
        'gpt-4o': {
          name: 'GPT-4o',
          provider: 'OpenAI',
          capabilities: ['code', 'analysis', 'writing', 'research', 'debug', 'refactor'],
          strengths: ['code generation', 'complex reasoning', 'multimodal'],
          weaknesses: ['slower response', 'higher cost'],
          costTier: 'high',
          speedTier: 'medium',
          accuracyTier: 'high'
        },
        'gpt-4o-mini': {
          name: 'GPT-4o Mini',
          provider: 'OpenAI',
          capabilities: ['code', 'analysis', 'writing', 'research'],
          strengths: ['fast response', 'cost effective', 'general purpose'],
          weaknesses: ['less complex reasoning'],
          costTier: 'low',
          speedTier: 'fast',
          accuracyTier: 'medium'
        },
        'claude-3-opus': {
          name: 'Claude 3 Opus',
          provider: 'Anthropic',
          capabilities: ['analysis', 'writing', 'research', 'code'],
          strengths: ['deep analysis', 'long context', 'safety'],
          weaknesses: ['slower for simple tasks'],
          costTier: 'high',
          speedTier: 'slow',
          accuracyTier: 'high'
        },
        'claude-3-sonnet': {
          name: 'Claude 3 Sonnet',
          provider: 'Anthropic',
          capabilities: ['code', 'analysis', 'writing', 'research'],
          strengths: ['balanced performance', 'good reasoning'],
          weaknesses: ['moderate speed'],
          costTier: 'medium',
          speedTier: 'medium',
          accuracyTier: 'high'
        },
        'claude-3-haiku': {
          name: 'Claude 3 Haiku',
          provider: 'Anthropic',
          capabilities: ['code', 'writing', 'research'],
          strengths: ['very fast', 'cost effective'],
          weaknesses: ['limited complex reasoning'],
          costTier: 'low',
          speedTier: 'fast',
          accuracyTier: 'medium'
        }
      },
      taskTypePreferences: {
        'coding': ['gpt-4o', 'claude-3-sonnet', 'gpt-4o-mini'],
        'analysis': ['claude-3-opus', 'gpt-4o', 'claude-3-sonnet'],
        'writing': ['claude-3-opus', 'gpt-4o', 'claude-3-sonnet'],
        'research': ['claude-3-opus', 'gpt-4o', 'claude-3-haiku'],
        'debugging': ['gpt-4o', 'claude-3-sonnet', 'gpt-4o-mini'],
        'refactoring': ['gpt-4o', 'claude-3-sonnet', 'gpt-4o-mini'],
        'general': ['gpt-4o-mini', 'claude-3-haiku', 'claude-3-sonnet']
      },
      performanceThresholds: {
        minSuccessRate: 0.7,
        maxResponseTime: 10000, // 10 seconds
        maxCostPerRequest: 0.1
      },
      fallbackModels: ['gpt-4o-mini', 'claude-3-haiku']
    };

    return {
      models: { ...defaultConfig.models, ...userConfig.models },
      taskTypePreferences: { ...defaultConfig.taskTypePreferences, ...userConfig.taskTypePreferences },
      performanceThresholds: { ...defaultConfig.performanceThresholds, ...userConfig.performanceThresholds },
      fallbackModels: userConfig.fallbackModels || defaultConfig.fallbackModels
    };
  }
}

// Create singleton instance
export const modelRecommendationService = new ModelRecommendationService();
