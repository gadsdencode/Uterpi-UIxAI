import { AzureAIService } from "./azureAI";
import { Message, LLMModel } from "../types";
import { toast } from "sonner";

// Toast function type for our smart toasts
type ToastFunction = (title: string, options?: {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}) => void;

export type SlotId = 'onboarding' | 'efficiency' | 'focus' | 'model-choice' | 'feature';

const SLOT_CONFIG: Record<SlotId, { maxPerConversation: number }> = {
  onboarding:     { maxPerConversation: 1 },
  efficiency:     { maxPerConversation: 2 },
  focus:          { maxPerConversation: 1 },
  'model-choice': { maxPerConversation: 1 },
  feature:        { maxPerConversation: 2 },
};

export interface SmartToast {
  id: string;
  title: string;
  description: string;
  category: 'optimization' | 'suggestion' | 'insight' | 'enhancement' | 'alert';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionable: boolean;
  slot: SlotId;
  action?: {
    label: string;
    callback: () => void;
  };
  data?: any;
}

// Options for improving UX behavior and wiring UI actions
interface IntelligentToastOptions {
  debug?: boolean;
  maxToastsPerMinute?: number;
  shouldDisplay?: () => boolean;
  getLatestContext?: () => { isChatActive?: boolean };
  actions?: {
    openModelSelector?: () => void;
    openSystemPreset?: () => void;
    openFileUpload?: () => void;
  };
  cooldowns?: Partial<Record<SmartToast['category'], number>>;
  getExternalInsights?: () => any | null;
}

export interface ConversationInsights {
  // User interaction patterns
  userInteractionStyle: {
    communicationType: 'direct' | 'exploratory' | 'detailed' | 'concise' | 'iterative';
    questionStyle: 'specific' | 'open-ended' | 'follow-up' | 'clarifying';
    engagementLevel: 'high' | 'medium' | 'low';
    patienceLevel: 'high' | 'medium' | 'low';
  };
  
  // Conversation dynamics
  conversationDynamics: {
    topicDepth: 'surface' | 'moderate' | 'deep' | 'expert';
    focusPattern: 'single-topic' | 'multi-topic' | 'branching' | 'returning';
    complexityProgression: 'increasing' | 'decreasing' | 'stable' | 'fluctuating';
    responsePreference: 'detailed' | 'concise' | 'step-by-step' | 'overview';
  };
  
  // Behavioral insights
  behavioralInsights: {
    learningStyle: 'visual' | 'practical' | 'theoretical' | 'experimental';
    problemSolvingApproach: 'systematic' | 'creative' | 'pragmatic' | 'analytical';
    confidenceLevel: 'high' | 'medium' | 'low';
    expertiseArea: string[];
    improvementAreas: string[];
  };
  
  // Interaction quality
  interactionQuality: {
    clarityScore: number; // 1-10
    efficiencyScore: number; // 1-10
    satisfactionPrediction: number; // 1-10
    potentialFrustrationPoints: string[];
  };
  
  // Hidden patterns
  hiddenInsights: {
    thinkingPattern: string;
    aiAssumptions: string;
    uncertaintyHandling: string;
    motivation: string;
  };
}

export interface ConversationMetrics {
  totalTokens: number;
  averageResponseTime: number;
  messageCount: number;
  modelSwitches: number;
  errorCount: number;
  attachmentUsage: number;
  systemMessageChanges: number;
  conversationLength: number;
  topicComplexity: 'simple' | 'moderate' | 'complex' | 'technical';
  currentModel: string;
  modelEfficiency: number;
  interactionPatterns: {
    communicationTypes: string[];
    questionStyles: string[];
    engagementTrend: 'increasing' | 'decreasing' | 'stable';
    averageMessageLength: number;
    followUpFrequency: number;
  };
  behavioralProfile: {
    learningStyle: string;
    problemSolvingApproach: string;
    confidenceTrend: 'increasing' | 'decreasing' | 'stable';
    expertiseAreas: string[];
  };
}

export interface PerformanceData {
  responseTime: number;
  tokenUsage: number;
  modelMatch: number; // How well the model matches the task
  contextQuality: number; // How clear/focused the conversation is
  timestamp: number;
}

export class IntelligentToastService {
  private aiService: AzureAIService | any; // Allow any AI service that has sendChatCompletion
  private metrics: ConversationMetrics;
  private performanceHistory: PerformanceData[] = [];
  private shownRecommendations: Set<string> = new Set();
  private recommendationTimestamps: Map<string, number> = new Map(); // Track when recommendations were last shown
  private lastAnalysisTime: number = 0;
  private toastFunction: ToastFunction;
  private availableModels: LLMModel[] = [];
  private modelSwitchCallback?: (modelId: string) => void;
  private newChatCallback?: () => void;
  private isAnalyzing: boolean = false; // Track if analysis is in progress
  private options: IntelligentToastOptions = {};

  // Toast queue management to avoid rapid-fire notifications
  private toastQueue: SmartToast[] = [];
  private isShowingToast: boolean = false;
  private lastToastTimestamp: number = 0;
  private readonly MIN_TOAST_GAP_MS: number = 3000; // Minimum gap between toasts
  private toastsThisMinute: number = 0;
  private minuteWindowStart: number = 0;

  // Cache rules by category
  private readonly CACHE_RULES = {
    'alert': { permanent: true, cooldownMinutes: 0 },           // Never show again
    'optimization': { permanent: true, cooldownMinutes: 0 },   // Never show again
    'insight': { permanent: false, cooldownMinutes: 1 },       // Show again after 1 minute (was 2)
    'suggestion': { permanent: false, cooldownMinutes: 1.5 },  // Show again after 1.5 minutes (was 3)
    'enhancement': { permanent: false, cooldownMinutes: 2 }    // Show again after 2 minutes (was 5)
  };

  // Display history and threshold tracking for edge-triggering and backoff
  private displayHistory: Map<string, { count: number; lastShown: number; backoffMs: number }> = new Map();
  private lastThresholds = { longConversation: 0, tokens: 0 };
  private slowResponseStreak: number = 0;
  private suppressedIds: Set<string> = new Set();
  private slotUsage: Map<SlotId, number> = new Map();

  constructor(
    aiService: AzureAIService | any, // Accept any AI service with sendChatCompletion method
    toastFunction?: ToastFunction,
    modelSwitchCallback?: (modelId: string) => void,
    newChatCallback?: () => void,
    options?: IntelligentToastOptions
  ) {
    this.aiService = aiService;
    this.toastFunction = toastFunction || this.defaultToastFunction;
    this.modelSwitchCallback = modelSwitchCallback;
    this.newChatCallback = newChatCallback;
    this.metrics = this.initializeMetrics();
    this.loadAvailableModels();
    this.options = { debug: false, maxToastsPerMinute: 2, ...options };
    this.loadSuppressedIds();
    if (this.options.cooldowns) {
      for (const k of Object.keys(this.options.cooldowns) as Array<keyof typeof this.CACHE_RULES>) {
        if (this.CACHE_RULES[k] && !this.CACHE_RULES[k].permanent && typeof this.options.cooldowns[k] === 'number') {
          this.CACHE_RULES[k].cooldownMinutes = this.options.cooldowns[k] as number;
        }
      }
    }
  }

  private loadAvailableModels(): void {
    try {
      this.availableModels = AzureAIService.getAvailableModels();
    } catch (err) {
      console.warn('Failed to load available models:', err);
      this.availableModels = [];
    }
  }

  private defaultToastFunction: ToastFunction = (title, options) => {
    toast(title, {
      description: options?.description,
      duration: options?.duration || 6000,
      action: options?.action
    });
  };

  private initializeMetrics(): ConversationMetrics {
    return {
      totalTokens: 0,
      averageResponseTime: 0,
      messageCount: 0,
      modelSwitches: 0,
      errorCount: 0,
      attachmentUsage: 0,
      systemMessageChanges: 0,
      conversationLength: 0,
      topicComplexity: 'simple',
      currentModel: '',
      modelEfficiency: 100,
      interactionPatterns: {
        communicationTypes: [],
        questionStyles: [],
        engagementTrend: 'stable',
        averageMessageLength: 0,
        followUpFrequency: 0
      },
      behavioralProfile: {
        learningStyle: 'theoretical',
        problemSolvingApproach: 'systematic',
        confidenceTrend: 'stable',
        expertiseAreas: []
      }
    };
  }

  /**
   * Analyze conversation content and generate intelligent recommendations
   */
  async analyzeAndRecommend(
    messages: Message[], 
    currentModel: LLMModel,
    responseTime?: number,
    tokenUsage?: number
  ): Promise<void> {
    if (this.isAnalyzing) return;

    this.isAnalyzing = true;
    this.updateMetrics(messages, currentModel, responseTime, tokenUsage);

    const now = Date.now();
    if (now - this.lastAnalysisTime < 30000) {
      this.isAnalyzing = false;
      return;
    }
    this.lastAnalysisTime = now;

    try {
      let analysis = null;
      try {
        analysis = await this.performConversationAnalysis(messages, currentModel);
      } catch (aiError) {
        analysis = this.generateEnhancedFallbackAnalysis(messages, currentModel);
      }

      const recommendations = this.generateRecommendations(analysis, currentModel, messages);

      const topRecommendation = this.selectTopRecommendation(recommendations);

      if (topRecommendation && this.canShowRecommendation(topRecommendation)) {
        this.showSmartToast(topRecommendation);
        this.markRecommendationShown(topRecommendation);
      }

    } catch {
      // Fail silently — chat UX is more important than analysis notifications
    } finally {
      this.isAnalyzing = false;
    }
  }

  private async performConversationAnalysis(messages: Message[], currentModel: LLMModel): Promise<any> {
    if (messages.length < 4) return null;

    const recentMessages = messages.slice(-15); // Analyze last 15 messages for better context
    const conversationText = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // Extract user messages for pattern analysis
    const userMessages = recentMessages.filter(m => m.role === 'user');
    const assistantMessages = recentMessages.filter(m => m.role === 'assistant');

    // Create a more concise prompt for providers with token limitations (like Gemini)
    const isGemini = this.aiService.constructor?.name?.includes('Gemini');
    
    const analysisPrompt = isGemini ? 
    // Concise version for Gemini with strict JSON requirements
    `Analyze this conversation. Return ONLY valid JSON, no other text.

CONVERSATION:
${conversationText.substring(0, 1500)}

CRITICAL: Return ONLY a valid JSON object. Do NOT include any text before or after the JSON.
Do NOT use apostrophes or quotes in string values unless you escape them with backslash.
Example: "user's goal" should be "user\\'s goal" or just "user goal"

Return this exact JSON structure (replace placeholders with actual values):
{
  "userInteractionStyle": {
    "communicationType": "direct",
    "questionStyle": "specific",
    "engagementLevel": "low",
    "patienceLevel": "medium"
  },
  "conversationDynamics": {
    "topicDepth": "surface",
    "focusPattern": "single-topic",
    "complexityProgression": "stable",
    "responsePreference": "detailed"
  },
  "behavioralInsights": {
    "learningStyle": "practical",
    "problemSolvingApproach": "systematic",
    "confidenceLevel": "high",
    "expertiseArea": ["coding"],
    "improvementAreas": ["clarity"]
  },
  "interactionQuality": {
    "clarityScore": 8,
    "efficiencyScore": 7,
    "satisfactionPrediction": 9,
    "potentialFrustrationPoints": ["none"]
  },
  "hiddenInsights": {
    "thinkingPattern": "seeks quick solutions",
    "aiAssumptions": "expects accurate responses",
    "uncertaintyHandling": "asks for clarification",
    "motivation": "problem solving"
  }
}` :
    // Full version for other providers
    `Analyze this conversation to understand the user's interaction patterns and provide hidden insights:

CONVERSATION:
${conversationText}

ANALYSIS TASK:
Provide deep insights about the user's interaction style, communication patterns, and behavioral tendencies. Focus on revealing "hidden insights" that would help understand how this user thinks and interacts with AI.

ANALYSIS CRITERIA:

1. **User Interaction Style Analysis:**
   - How does the user communicate? (direct, exploratory, detailed, concise, iterative)
   - What type of questions do they ask? (specific, open-ended, follow-up, clarifying)
   - What's their engagement level? (high, medium, low)
   - How patient are they with responses? (high, medium, low)

2. **Conversation Dynamics:**
   - How deep do they go into topics? (surface, moderate, deep, expert)
   - How do they handle multiple topics? (single-topic, multi-topic, branching, returning)
   - Does complexity increase, decrease, or stay stable?
   - What response style do they prefer? (detailed, concise, step-by-step, overview)

3. **Behavioral Insights:**
   - What's their learning style? (visual, practical, theoretical, experimental)
   - How do they approach problem-solving? (systematic, creative, pragmatic, analytical)
   - What's their confidence level? (high, medium, low)
   - What areas show expertise vs. areas for improvement?

4. **Interaction Quality Assessment:**
   - Rate clarity of communication (1-10)
   - Rate efficiency of interaction (1-10)
   - Predict satisfaction level (1-10)
   - Identify potential frustration points

5. **Hidden Patterns:**
   - What subtle patterns reveal their thinking process?
   - What assumptions do they make about AI capabilities?
   - How do they handle uncertainty or ambiguity?
   - What motivates their questions?

Return ONLY a JSON object with this structure:
{
  "userInteractionStyle": {
    "communicationType": "direct|exploratory|detailed|concise|iterative",
    "questionStyle": "specific|open-ended|follow-up|clarifying",
    "engagementLevel": "high|medium|low",
    "patienceLevel": "high|medium|low"
  },
  "conversationDynamics": {
    "topicDepth": "surface|moderate|deep|expert",
    "focusPattern": "single-topic|multi-topic|branching|returning",
    "complexityProgression": "increasing|decreasing|stable|fluctuating",
    "responsePreference": "detailed|concise|step-by-step|overview"
  },
  "behavioralInsights": {
    "learningStyle": "visual|practical|theoretical|experimental",
    "problemSolvingApproach": "systematic|creative|pragmatic|analytical",
    "confidenceLevel": "high|medium|low",
    "expertiseArea": ["area1", "area2"],
    "improvementAreas": ["area1", "area2"]
  },
  "interactionQuality": {
    "clarityScore": 1-10,
    "efficiencyScore": 1-10,
    "satisfactionPrediction": 1-10,
    "potentialFrustrationPoints": ["point1", "point2"]
  },
  "hiddenInsights": {
    "thinkingPattern": "description of how they think",
    "aiAssumptions": "what they assume about AI",
    "uncertaintyHandling": "how they handle uncertainty",
    "motivation": "what drives their questions"
  }
}`;

    try {
      if (!this.aiService || typeof this.aiService.sendChatCompletion !== 'function') {
        return this.generateEnhancedFallbackAnalysis(messages, currentModel);
      }

      const serviceName = this.aiService.constructor?.name || 'Unknown';
      const maxTokens = serviceName.includes('Gemini') ? 4096 : 1500;

      const response = await this.aiService.sendChatCompletion([
        {
          role: "system",
          content: "You are an expert in analyzing human-AI interaction patterns. Focus on revealing subtle insights about user behavior, communication style, and interaction preferences. Be insightful and specific."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ], { maxTokens, temperature: 0.3 });

      const parsed = this.parseAnalysisResponse(response);
      return parsed ?? this.generateEnhancedFallbackAnalysis(messages, currentModel);
    } catch {
      return this.generateEnhancedFallbackAnalysis(messages, currentModel);
    }
  }

  /**
   * Robust JSON parsing for AI service responses
   */
  private parseAnalysisResponse(response: string): any {
    try {
      let cleanedResponse = response.trim();
      
      // Remove markdown code block wrapper if present
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.substring(7); // Remove ```json
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.substring(3); // Remove ```
      }
      
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - 3);
      }
      
      cleanedResponse = cleanedResponse.trim();
      
      try {
        const parsed = JSON.parse(cleanedResponse);
        if (this.validateAnalysisResponse(parsed)) return parsed;
      } catch {
        try {
          const parsed = JSON.parse(response);
          if (this.validateAnalysisResponse(parsed)) return parsed;
        } catch { /* continue to extraction strategies */ }
      }

      const jsonExtractionPatterns = [
        /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi,
        /[:\n]\s*(\{[\s\S]*\})/g,
      ];

      for (const pattern of jsonExtractionPatterns) {
        const matches = response.match(pattern);
        if (!matches) continue;

        for (let jsonStr of matches) {
          if (pattern.source.includes('```')) {
            const cb = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
            if (cb) jsonStr = cb[1];
          } else if (pattern.source.includes('[:\\n]')) {
            jsonStr = jsonStr.replace(/^[:\n]\s*/, '');
          }

          try {
            const parsed = JSON.parse(this.conservativeSanitizeJSON(jsonStr));
            if (this.validateAnalysisResponse(parsed)) return parsed;
          } catch {
            try {
              const parsed = JSON.parse(this.aggressiveSanitizeJSON(jsonStr));
              if (this.validateAnalysisResponse(parsed)) return parsed;
            } catch { /* continue */ }
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Conservative JSON sanitization - only fixes the most common, safe issues
   */
  private conservativeSanitizeJSON(jsonStr: string): string {
    let result = jsonStr
      .trim()
      // Remove any leading/trailing non-JSON content
      .replace(/^[^{]*/, '')
      .replace(/[^}]*$/, '');
    
    const openBraces = (result.match(/{/g) || []).length;
    const closeBraces = (result.match(/}/g) || []).length;
    
    if (openBraces > closeBraces) {
      const missingBraces = openBraces - closeBraces;
      for (let i = 0; i < missingBraces; i++) {
        result += '}';
      }
    }
    
    // Fix trailing commas (most common issue)
    result = result.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix unquoted property names (but be careful with already quoted ones)
    result = result.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
    
    // Don't touch apostrophes - they're valid in JSON strings
    // The issue is likely something else
    
    return result;
  }

  /**
   * Aggressive JSON sanitization - for when conservative approach fails
   */
  private aggressiveSanitizeJSON(jsonStr: string): string {
    // Start with conservative fixes
    jsonStr = this.conservativeSanitizeJSON(jsonStr);
    
    // Additional check: if JSON appears truncated, try to complete it with minimal structure
    // Look for the last complete property
    if (jsonStr.includes('"userInteractionStyle"') && !jsonStr.includes('"conversationDynamics"')) {
      const lastCompleteObject = jsonStr.lastIndexOf('}');
      if (lastCompleteObject > -1) {
        // Check if we're inside an object that needs completion
        const afterLastObject = jsonStr.substring(lastCompleteObject + 1).trim();
        if (afterLastObject && !afterLastObject.startsWith(',') && !afterLastObject.startsWith('}')) {
          // We're likely in the middle of an incomplete structure
          jsonStr = jsonStr.substring(0, lastCompleteObject + 1);
          
          // Add minimal completion for missing properties
          const openBraces = (jsonStr.match(/{/g) || []).length;
          const closeBraces = (jsonStr.match(/}/g) || []).length;
          
          if (openBraces > closeBraces) {
            const missingBraces = openBraces - closeBraces;
            for (let i = 0; i < missingBraces; i++) {
              jsonStr += '}';
            }
          }
        }
      }
    }
    
    // Fix common Gemini-specific issues
    // Look for patterns like: "user's goal" and similar unescaped quotes
    jsonStr = jsonStr.replace(/"([^"]*)'([^"]*)"/g, (match, before, after) => {
      // Replace unescaped apostrophes with escaped ones or remove them
      return `"${before}${after}"`;
    });
    
    // More aggressive fixes
    jsonStr = jsonStr
      // Fix boolean values that might be quoted
      .replace(/:\s*"(true|false|null)"/g, ': $1')
      // Fix number values that might be quoted
      .replace(/:\s*"(\d+(?:\.\d+)?)"/g, ': $1')
      // Fix array syntax issues - be more careful with the content
      .replace(/\[\s*([^\[\]]*?)\s*\]/g, (match, content) => {
        if (!content.trim()) return '[]';
        
        // Handle arrays more carefully
        // Split by comma but be aware of commas inside quotes
        const items: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          if (char === '"' && (i === 0 || content[i-1] !== '\\')) {
            inQuotes = !inQuotes;
          }
          if (char === ',' && !inQuotes) {
            items.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        if (current.trim()) {
          items.push(current.trim());
        }
        
        // Process each item
        const processedItems = items.map((item: string) => {
          if (!item) return null;
          
          // If already quoted properly, keep as is
          if ((item.startsWith('"') && item.endsWith('"')) || 
              item === 'true' || item === 'false' || item === 'null' || 
              /^\d+(\.\d+)?$/.test(item)) {
            return item;
          }
          
          // Quote everything else, removing problematic characters
          const cleaned = item.replace(/['"]/g, '');
          return `"${cleaned}"`;
        }).filter(item => item !== null);
        
        return `[${processedItems.join(', ')}]`;
      })
      // Try to fix unquoted string values (very carefully)
      .replace(/:\s*([a-zA-Z][a-zA-Z0-9_\-]*)\s*([,}\]])/g, ': "$1"$2');
    
    return jsonStr;
  }

  /**
   * Validate that the parsed response has the expected structure
   */
  private validateAnalysisResponse(obj: any): boolean {
    return obj && 
           typeof obj === 'object' &&
           (obj.userInteractionStyle || obj.conversationDynamics || obj.behavioralInsights || 
            obj.taskType || obj.complexity || obj.modelOptimal !== undefined);
  }

  // Exponential backoff calculation for non-permanent categories
  private getBackoffMsFor(rec: SmartToast): number {
    const rules = this.CACHE_RULES[rec.category as keyof typeof this.CACHE_RULES];
    const baseMinutes = (rules?.cooldownMinutes ?? 1);
    const base = baseMinutes * 60000;
    const hist = this.displayHistory.get(rec.id);
    const count = hist?.count ?? 0;
    const factor = Math.min(8, count); // cap growth
    return base * Math.pow(2, factor);
  }

  // User suppression persistence
  private loadSuppressedIds(): void {
    try {
      const raw = localStorage.getItem('smartToast:suppressed');
      if (raw) this.suppressedIds = new Set(JSON.parse(raw));
    } catch {}
  }

  private persistSuppressedIds(): void {
    try {
      localStorage.setItem('smartToast:suppressed', JSON.stringify(Array.from(this.suppressedIds)));
    } catch {}
  }

  // Public suppression API
  suppress(id: string): void {
    this.suppressedIds.add(id);
    this.persistSuppressedIds();
  }

  unsuppress(id: string): void {
    this.suppressedIds.delete(id);
    this.persistSuppressedIds();
  }

  private hasSlotBudget(slot: SlotId): boolean {
    const cfg = SLOT_CONFIG[slot];
    if (!cfg) return true;
    const used = this.slotUsage.get(slot) ?? 0;
    return used < cfg.maxPerConversation;
  }

  private markSlotUsage(slot: SlotId): void {
    const used = this.slotUsage.get(slot) ?? 0;
    this.slotUsage.set(slot, used + 1);
  }

  /**
   * Generate enhanced fallback analysis when Azure AI is not available
   */
  private generateEnhancedFallbackAnalysis(messages: Message[], _currentModel: LLMModel): any {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    // Analyze message patterns
    const avgUserMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
    const hasCode = userMessages.some(m => m.content.includes('```') || m.content.toLowerCase().includes('code'));
    const hasQuestions = userMessages.some(m => m.content.includes('?'));
    const hasFollowUps = userMessages.length > 2 && userMessages.slice(-2).some(m => 
      m.content.toLowerCase().includes('what about') || 
      m.content.toLowerCase().includes('can you') ||
      m.content.toLowerCase().includes('how about')
    );
    
    // Determine interaction patterns based on message count and content
    const communicationType = avgUserMessageLength > 200 ? 'detailed' : 
                             hasFollowUps ? 'iterative' : 
                             hasQuestions ? 'exploratory' : 'direct';
    
    const questionStyle = hasFollowUps ? 'follow-up' : 
                         hasQuestions ? 'open-ended' : 'specific';
    
    const engagementLevel = userMessages.length > 5 ? 'high' : 
                           userMessages.length > 2 ? 'medium' : 'low';
    
    // Determine learning style based on content
    const learningStyle = hasCode ? 'practical' : 
                         avgUserMessageLength > 150 ? 'theoretical' : 'experimental';
    
    // Determine problem-solving approach
    const problemSolvingApproach = hasCode ? 'systematic' : 
                                  hasFollowUps ? 'iterative' : 'creative';
    
    // Determine confidence level based on question patterns
    const confidenceLevel = hasFollowUps ? 'medium' : 
                           hasQuestions ? 'low' : 'high';
    
    // Determine topic depth
    const topicDepth = hasCode ? 'deep' : 
                      avgUserMessageLength > 100 ? 'moderate' : 'surface';
    
    // Determine focus pattern
    const focusPattern = userMessages.length > 8 ? 'multi-topic' : 'single-topic';
    
    // Calculate interaction quality scores
    const clarityScore = Math.min(10, Math.max(1, 8 - (userMessages.length * 0.2)));
    const efficiencyScore = Math.min(10, Math.max(1, 7 - (userMessages.length * 0.15)));
    const satisfactionPrediction = Math.min(10, Math.max(1, 9 - (userMessages.length * 0.1)));
    
    // Generate thinking pattern based on interaction style
    const thinkingPattern = hasCode ? "You approach problems systematically with practical solutions" :
                           hasFollowUps ? "You build understanding iteratively, refining your approach" :
                           "You seek comprehensive understanding before taking action";
    
    // Generate AI assumptions based on interaction style
    const aiAssumptions = hasCode ? "You expect precise, actionable technical guidance" :
                         hasFollowUps ? "You expect the AI to build on previous responses" :
                         "You expect comprehensive, detailed explanations";
    
    // Generate uncertainty handling based on question patterns
    const uncertaintyHandling = hasQuestions ? "You ask clarifying questions when concepts are unclear" :
                               hasFollowUps ? "You explore alternatives to find the best approach" :
                               "You prefer to gather comprehensive information before proceeding";
    
    // Generate motivation based on interaction patterns
    const motivation = hasCode ? "You're motivated by practical problem-solving and skill development" :
                      hasFollowUps ? "You're motivated by thorough understanding and optimal solutions" :
                      "You're motivated by comprehensive knowledge and clear explanations";
    
    return {
      userInteractionStyle: {
        communicationType,
        questionStyle,
        engagementLevel,
        patienceLevel: 'medium'
      },
      conversationDynamics: {
        topicDepth,
        focusPattern,
        complexityProgression: 'stable',
        responsePreference: 'detailed'
      },
      behavioralInsights: {
        learningStyle,
        problemSolvingApproach,
        confidenceLevel,
        expertiseArea: hasCode ? ['programming', 'technical'] : ['general', 'analytical'],
        improvementAreas: ['communication_clarity', 'focus_optimization']
      },
      interactionQuality: {
        clarityScore: Math.round(clarityScore),
        efficiencyScore: Math.round(efficiencyScore),
        satisfactionPrediction: Math.round(satisfactionPrediction),
        potentialFrustrationPoints: ['response_length', 'complexity', 'context_switching']
      },
      hiddenInsights: {
        thinkingPattern,
        aiAssumptions,
        uncertaintyHandling,
        motivation
      }
    };
  }

  private getModelStrengths(model: LLMModel): string[] {
    const strengths: string[] = [];
    
    if (model.performance >= 95) strengths.push("Exceptional accuracy");
    if (model.capabilities?.supportsVision) strengths.push("Image analysis");
    if (model.capabilities?.supportsCodeGeneration) strengths.push("Code generation");
    if (model.category === "code") strengths.push("Programming expertise");
    if (model.category === "reasoning") strengths.push("Complex reasoning");
    if (model.latency < 700) strengths.push("Fast response");
    if (model.cost < 0.001) strengths.push("Cost-effective");
    if (model.contextLength > 100000) strengths.push("Long context");
    
    return strengths;
  }

  private getModelBestUseCase(model: LLMModel): string {
    if (model.category === "code") return "Programming and software development";
    if (model.category === "multimodal") return "Image analysis and complex tasks";
    if (model.category === "reasoning") return "Complex problem solving and analysis";
    if (model.performance >= 95) return "High-accuracy professional tasks";
    if (model.cost < 0.001) return "High-volume or cost-sensitive applications";
    return "General-purpose conversations";
  }

  // =========================================================================
  // EVENT-DRIVEN TIP BUILDERS — each maps to exactly one slot
  // =========================================================================

  private buildOnboardingTip(messages: Message[]): SmartToast | null {
    if (messages.length < 3 || !this.hasSlotBudget('onboarding')) return null;
    return {
      id: 'onboarding-shortcuts',
      slot: 'onboarding',
      title: '💡 Pro tip',
      description: 'Press Ctrl/Cmd+N any time to start a fresh chat. Use / in the input bar for quick commands.',
      category: 'insight',
      priority: 'low',
      actionable: false,
    };
  }

  private buildEfficiencyTip(analysis: any, messages: Message[]): SmartToast | null {
    if (!this.hasSlotBudget('efficiency')) return null;
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length < 3) return null;

    const recent = userMsgs.slice(-3);
    const codeMessages = recent.filter(m => m.content.includes('```'));

    if (codeMessages.length >= 2) {
      const last = recent[recent.length - 1];
      const lines = last.content.split('\n').filter(l => l.trim()).length;
      return {
        id: `efficiency-code-${lines > 80 ? 'large' : 'small'}`,
        slot: 'efficiency',
        title: '💻 Code analysis tip',
        description: lines > 80
          ? 'Large snippet detected. Consider sharing just the relevant function or section for faster, more focused help.'
          : 'Adding a short comment above your code explaining the goal helps the model give more precise fixes.',
        category: 'suggestion',
        priority: 'medium',
        actionable: false,
      };
    }

    if (this.metrics.averageResponseTime > 3000 && this.slowResponseStreak >= 3) {
      return {
        id: 'efficiency-slow-responses',
        slot: 'efficiency',
        title: '⚡ Response time tip',
        description: `Responses are averaging ${(this.metrics.averageResponseTime / 1000).toFixed(1)}s. Shorter, focused questions often get faster answers.`,
        category: 'suggestion',
        priority: 'medium',
        actionable: false,
      };
    }

    return null;
  }

  private buildFocusTip(analysis: any, messages: Message[]): SmartToast | null {
    if (!this.hasSlotBudget('focus')) return null;

    const longConvThresholds = [25, 50, 75];
    const crossed = this.nextCrossedThreshold(this.metrics.messageCount, longConvThresholds, this.lastThresholds.longConversation);
    if (crossed !== null) {
      this.lastThresholds.longConversation = crossed;
      return {
        id: `focus-long-conversation-${crossed}`,
        slot: 'focus',
        title: '📊 Long conversation',
        description: `You're at ${crossed} messages. Starting a new chat can improve clarity and response quality.`,
        category: 'alert',
        priority: 'high',
        actionable: true,
        action: this.newChatCallback
          ? { label: 'New Chat', callback: () => this.triggerNewChat() }
          : undefined,
      };
    }

    if (messages.length >= 10 && analysis?.conversationDynamics?.focusPattern === 'multi-topic') {
      return {
        id: 'focus-split-chats',
        slot: 'focus',
        title: '🎯 Keep threads focused',
        description: 'This chat covers several topics. Consider a new chat for the next topic so context stays clean.',
        category: 'suggestion',
        priority: 'medium',
        actionable: true,
        action: this.newChatCallback
          ? { label: 'New Chat', callback: () => this.triggerNewChat() }
          : undefined,
      };
    }

    return null;
  }

  private buildModelChoiceTip(analysis: any, currentModel: LLMModel): SmartToast | null {
    if (!this.hasSlotBudget('model-choice')) return null;
    if (!analysis?.modelRecommendation || analysis.modelOptimal) return null;
    if ((analysis.confidenceScore ?? 0) < 7) return null;

    const recommended = this.availableModels.find(m => m.id === analysis.modelRecommendation);
    if (!recommended || recommended.id === currentModel.id) return null;

    const gain = this.calculateRealEfficiencyGain(currentModel, recommended, analysis.taskType ?? 'general');
    return {
      id: `model-choice-${recommended.id}`,
      slot: 'model-choice',
      title: '🚀 Better model for this task',
      description: `${recommended.name} is estimated ~${gain}% more effective for the kind of work you're doing in this chat.`,
      category: 'optimization',
      priority: 'high',
      actionable: !!this.modelSwitchCallback,
      action: this.modelSwitchCallback
        ? { label: `Switch to ${recommended.name}`, callback: () => this.triggerModelSwitch(recommended.id) }
        : undefined,
    };
  }

  private buildFeatureTip(analysis: any, messages: Message[]): SmartToast | null {
    if (!this.hasSlotBudget('feature')) return null;
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length < 5) return null;

    const hasAttachments = messages.some(m => m.attachments?.length);
    const longMessages = userMsgs.slice(-4).filter(m => m.content.length > 400);

    if (!hasAttachments && longMessages.length >= 2 && this.options.actions?.openFileUpload) {
      return {
        id: 'feature-file-manager',
        slot: 'feature',
        title: '📁 Easier file sharing',
        description: 'Instead of pasting long content, try using the File Manager so Uterpi can analyze the full file.',
        category: 'enhancement',
        priority: 'medium',
        actionable: true,
        action: { label: 'Open File Manager', callback: this.options.actions.openFileUpload },
      };
    }

    if (analysis?.conversationDynamics?.topicDepth === 'expert'
        && this.metrics.systemMessageChanges === 0
        && this.options.actions?.openSystemPreset) {
      return {
        id: 'feature-system-preset',
        slot: 'feature',
        title: '🧠 Expert mode available',
        description: 'For expert-level discussions, the Technical system preset gives more detailed, in-depth responses.',
        category: 'enhancement',
        priority: 'medium',
        actionable: true,
        action: { label: 'Open Presets', callback: this.options.actions.openSystemPreset },
      };
    }

    return null;
  }

  // =========================================================================
  // RECOMMENDATION GENERATOR — collects tips from builders, respects slots
  // =========================================================================

  private generateRecommendations(analysis: any, currentModel: LLMModel, messages: Message[]): SmartToast[] {
    const out: SmartToast[] = [];

    const push = (tip: SmartToast | null) => {
      if (tip) out.push(tip);
    };

    push(this.buildOnboardingTip(messages));
    push(this.buildEfficiencyTip(analysis, messages));
    push(this.buildFocusTip(analysis, messages));
    push(this.buildModelChoiceTip(analysis, currentModel));
    push(this.buildFeatureTip(analysis, messages));

    return out;
  }

  private selectTopRecommendation(recommendations: SmartToast[]): SmartToast | null {
    if (recommendations.length === 0) return null;

    const PRIORITY_SCORE: Record<string, number> = { urgent: 100, high: 75, medium: 50, low: 25 };
    const CATEGORY_SCORE: Record<string, number> = { alert: 25, optimization: 20, suggestion: 15, enhancement: 12, insight: 10 };

    const score = (rec: SmartToast) => {
      let s = PRIORITY_SCORE[rec.priority] ?? 0;
      s += CATEGORY_SCORE[rec.category] ?? 0;
      if (rec.actionable) s += 20;
      return s;
    };

    const sorted = recommendations.slice().sort((a, b) => score(b) - score(a));
    for (const rec of sorted) {
      if (this.canShowRecommendation(rec)) return rec;
    }
    return null;
  }

  private showSmartToast(smartToast: SmartToast): void {
    this.toastQueue.push(smartToast);
    this.processToastQueue();
  }

  private processToastQueue(): void {
    if (this.isShowingToast) return;
    const next = this.toastQueue.shift();
    if (!next) return;

    const now = Date.now();
    const sinceLast = now - this.lastToastTimestamp;
    const wait = Math.max(0, this.MIN_TOAST_GAP_MS - sinceLast);

    this.isShowingToast = true;

    window.setTimeout(() => {
      // Gate: rate limit, chat-active revalidation, and optional shouldDisplay
      const isActive = !!this.options.getLatestContext?.().isChatActive;
      if (!this.withinRateLimit() || isActive || (this.options.shouldDisplay && !this.options.shouldDisplay())) {
        this.isShowingToast = false;
        this.processToastQueue();
        return;
      }

      const duration = next.priority === 'urgent' ? 10000 :
                       next.priority === 'high' ? 8000 : 6000;

      this.toastFunction(next.title, {
        description: next.description,
        duration,
        action: next.action ? { label: next.action.label, onClick: next.action.callback } : undefined
      });

      this.toastsThisMinute += 1;

      // Schedule ready for next toast after this one finishes plus a small buffer
      window.setTimeout(() => {
        this.lastToastTimestamp = Date.now();
        this.isShowingToast = false;
        this.processToastQueue();
      }, duration + 400);
    }, wait);
  }

  private getCategoryIcon(category: string): string {
    switch (category) {
      case 'optimization': return '🚀';
      case 'suggestion': return '💡';
      case 'insight': return '📊';
      case 'enhancement': return '✨';
      case 'alert': return '⚠️';
      default: return '💡';
    }
  }

  // Rate limiting window
  private withinRateLimit(): boolean {
    const now = Date.now();
    if (now - this.minuteWindowStart >= 60000) {
      this.minuteWindowStart = now;
      this.toastsThisMinute = 0;
    }
    const cap = this.options.maxToastsPerMinute ?? 2;
    return this.toastsThisMinute < cap;
  }

  // Threshold helper: returns crossed threshold value or null
  private nextCrossedThreshold(value: number, thresholds: number[], last: number): number | null {
    for (const t of thresholds) {
      if (value >= t && last < t) return t;
    }
    return null;
  }

  private updateMetrics(
    messages: Message[], 
    currentModel: LLMModel, 
    responseTime?: number, 
    tokenUsage?: number
  ): void {
    this.metrics.messageCount = messages.length;
    this.metrics.currentModel = currentModel.id;
    
    // Update interaction patterns
    this.updateInteractionPatterns(messages);
    
    if (responseTime) {
      this.performanceHistory.push({
        responseTime,
        tokenUsage: tokenUsage || 0,
        modelMatch: this.calculateModelMatch(messages, currentModel),
        contextQuality: this.calculateContextQuality(messages),
        timestamp: Date.now()
      });

      // Keep only last 50 performance records
      if (this.performanceHistory.length > 50) {
        this.performanceHistory = this.performanceHistory.slice(-50);
      }

      this.metrics.averageResponseTime = this.performanceHistory.reduce((sum, p) => sum + p.responseTime, 0) / this.performanceHistory.length;
      // Track slow response streak for gating performance toasts
      this.slowResponseStreak = responseTime > 3000 ? this.slowResponseStreak + 1 : 0;
    }

    if (tokenUsage) {
      this.metrics.totalTokens += tokenUsage;
    }
  }

  private updateInteractionPatterns(messages: Message[]): void {
    const userMessages = messages.filter(m => m.role === 'user');
    
    if (userMessages.length === 0) return;
    
    // Calculate average message length
    const totalLength = userMessages.reduce((sum, m) => sum + m.content.length, 0);
    this.metrics.interactionPatterns.averageMessageLength = totalLength / userMessages.length;
    
    // Analyze recent communication patterns
    const recentMessages = userMessages.slice(-5);
    const hasQuestions = recentMessages.some(m => m.content.includes('?'));
    const hasFollowUps = recentMessages.length > 1 && recentMessages.slice(-2).some(m => 
      m.content.toLowerCase().includes('what about') || 
      m.content.toLowerCase().includes('can you') ||
      m.content.toLowerCase().includes('how about')
    );
    
    // Update communication types
    if (this.metrics.interactionPatterns.averageMessageLength > 200 && 
        !this.metrics.interactionPatterns.communicationTypes.includes('detailed')) {
      this.metrics.interactionPatterns.communicationTypes.push('detailed');
    }
    
    if (hasFollowUps && !this.metrics.interactionPatterns.communicationTypes.includes('iterative')) {
      this.metrics.interactionPatterns.communicationTypes.push('iterative');
    }
    
    // Update question styles
    if (hasQuestions && !this.metrics.interactionPatterns.questionStyles.includes('open-ended')) {
      this.metrics.interactionPatterns.questionStyles.push('open-ended');
    }
    
    if (hasFollowUps && !this.metrics.interactionPatterns.questionStyles.includes('follow-up')) {
      this.metrics.interactionPatterns.questionStyles.push('follow-up');
    }
    
    // Calculate follow-up frequency
    this.metrics.interactionPatterns.followUpFrequency = hasFollowUps ? 
      (this.metrics.interactionPatterns.followUpFrequency + 1) / 2 : 
      this.metrics.interactionPatterns.followUpFrequency * 0.9;
  }

  private calculateModelMatch(messages: Message[], model: LLMModel): number {
    // Simple heuristic for how well the model matches the conversation
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return 100;

    const content = lastMessage.content.toLowerCase();
    const hasCode = /```|function|class|const|let|var|import|export/.test(content);
    const hasImages = messages.some(m => m.attachments?.length);
    const isAnalytical = /analyze|compare|evaluate|assess|review/.test(content);

    let score = 50;

    if (hasCode && model.capabilities?.supportsCodeGeneration) score += 30;
    if (hasImages && model.capabilities?.supportsVision) score += 30;
    if (isAnalytical && model.capabilities?.supportsAnalysis) score += 20;

    return Math.min(100, score);
  }

  private calculateContextQuality(messages: Message[]): number {
    // Simple heuristic for conversation focus
    if (messages.length < 3) return 100;

    const topics = new Set<string>();
    messages.slice(-10).forEach(msg => {
      const words = msg.content.toLowerCase().split(' ');
      words.forEach(word => {
        if (word.length > 5) topics.add(word);
      });
    });

    // More unique topics = less focused
    return Math.max(20, 100 - (topics.size * 2));
  }

  private calculateRealEfficiencyGain(currentModel: LLMModel, recommendedModel: LLMModel, taskType: string): number {
    // Calculate efficiency gain based on actual model performance differences
    let baseGain = Math.max(0, recommendedModel.performance - currentModel.performance);
    
    // Apply task-specific multipliers
    const taskMultipliers: Record<string, number> = {
      'coding': recommendedModel.capabilities?.supportsCodeGeneration ? 1.5 : 0.8,
      'technical': recommendedModel.category === 'reasoning' ? 1.4 : 1.0,
      'analysis': recommendedModel.capabilities?.supportsAnalysis ? 1.3 : 1.0,
      'creative': recommendedModel.category === 'text' ? 1.2 : 1.0,
      'multimodal': recommendedModel.capabilities?.supportsVision ? 1.6 : 1.0
    };
    
    const multiplier = taskMultipliers[taskType] || 1.0;
    const adjustedGain = Math.round(baseGain * multiplier);
    
    // Ensure realistic range (15-60% improvement)
    return Math.max(15, Math.min(60, adjustedGain));
  }

  private triggerModelSwitch(modelId: string): void {
    if (this.modelSwitchCallback) {
      this.modelSwitchCallback(modelId);
    } else {
      console.warn('Model switch callback not configured');
    }
  }

  private triggerNewChat(): void {
    if (this.newChatCallback) {
      this.newChatCallback();
    } else {
      console.warn('New chat callback not configured');
    }
  }

  /**
   * Track specific user actions for analysis
   */
  trackAction(action: string, data?: any): void {
    switch (action) {
      case 'model_switch':
        this.metrics.modelSwitches++;
        break;
      case 'system_message_change':
        this.metrics.systemMessageChanges++;
        break;
      case 'attachment_upload':
        this.metrics.attachmentUsage++;
        break;
      case 'error_occurred':
        this.metrics.errorCount++;
        break;
    }
  }

  /**
   * Get current performance insights
   */
  getPerformanceInsights(): any {
    return {
      averageResponseTime: this.metrics.averageResponseTime,
      totalTokens: this.metrics.totalTokens,
      modelEfficiency: this.metrics.modelEfficiency,
      conversationFocus: this.performanceHistory.length > 0 ? 
        this.performanceHistory[this.performanceHistory.length - 1].contextQuality : 100
    };
  }

  /**
   * Reset analytics (for new conversations)
   */
  resetSession(): void {
    this.metrics = this.initializeMetrics();
    this.performanceHistory = [];
    this.shownRecommendations.clear();
    this.recommendationTimestamps.clear();
    this.displayHistory.clear();
    this.slotUsage.clear();
    this.lastThresholds = { longConversation: 0, tokens: 0 };
    this.slowResponseStreak = 0;
    this.lastAnalysisTime = 0;
    this.toastQueue = [];
  }

  /**
   * Clear recommendation cache (for testing or manual reset)
   */
  clearRecommendationCache(): void {
    this.shownRecommendations.clear();
    this.recommendationTimestamps.clear();
    console.log('🗑️ Recommendation cache and timestamps cleared');
  }

  /**
   * Force clear cache for a specific recommendation (for testing)
   */
  forceClearRecommendation(recommendationId: string): void {
    this.shownRecommendations.delete(recommendationId);
    this.recommendationTimestamps.delete(recommendationId);
    console.log(`🗑️ Forced clear cache for: ${recommendationId}`);
  }

  /**
   * Force clear all insight caches (for testing)
   */
  forceClearInsightCaches(): void {
    const allIds = Array.from(this.recommendationTimestamps.keys());
    allIds.forEach(id => {
      this.shownRecommendations.delete(id);
      this.recommendationTimestamps.delete(id);
    });
    this.displayHistory.clear();
    this.slotUsage.clear();
  }

  /**
   * Test method to manually trigger a specific recommendation (for debugging)
   */
  testShowRecommendation(title: string, description: string, category: 'insight' | 'suggestion' | 'alert' = 'insight'): void {
    const testRecommendation: SmartToast = {
      id: `test-${Date.now()}`,
      title,
      description,
      category,
      slot: 'feature',
      priority: 'medium',
      actionable: false,
    };
    this.showSmartToast(testRecommendation);
    this.markRecommendationShown(testRecommendation);
  }

  /**
   * Get current recommendation cache status (for debugging)
   */
  getRecommendationCacheStatus(): {
    permanentCacheSize: number;
    permanentCachedIds: string[];
    timestampCacheSize: number;
    timestampCachedIds: Array<{ id: string; lastShown: number; minutesAgo: number }>;
    slotUsage: Record<string, number>;
  } {
    const now = Date.now();
    const timestampEntries = Array.from(this.recommendationTimestamps.entries()).map(([id, timestamp]) => ({
      id,
      lastShown: timestamp,
      minutesAgo: Math.round((now - timestamp) / 1000 / 60),
    }));

    const slots: Record<string, number> = {};
    for (const [k, v] of this.slotUsage.entries()) slots[k] = v;

    return {
      permanentCacheSize: this.shownRecommendations.size,
      permanentCachedIds: Array.from(this.shownRecommendations),
      timestampCacheSize: this.recommendationTimestamps.size,
      timestampCachedIds: timestampEntries,
      slotUsage: slots,
    };
  }

  /**
   * Check if a recommendation can be shown based on category-aware caching rules
   */
  private canShowRecommendation(recommendation: SmartToast): boolean {
    const { id, category, slot } = recommendation;

    if (this.suppressedIds.has(id)) return false;

    if (!this.hasSlotBudget(slot)) return false;

    const rules = this.CACHE_RULES[category as keyof typeof this.CACHE_RULES];
    if (!rules) return !this.shownRecommendations.has(id);

    if (rules.permanent) return !this.shownRecommendations.has(id);

    const lastShown = this.recommendationTimestamps.get(id);
    if (!lastShown) return true;

    return Date.now() - lastShown >= this.getBackoffMsFor(recommendation);
  }

  /**
   * Mark a recommendation as shown
   */
  private markRecommendationShown(recommendation: SmartToast): void {
    const { id, category, slot } = recommendation;
    const rules = this.CACHE_RULES[category as keyof typeof this.CACHE_RULES];

    const hist = this.displayHistory.get(id) || { count: 0, lastShown: 0, backoffMs: 0 };
    hist.count += 1;
    hist.lastShown = Date.now();
    hist.backoffMs = this.getBackoffMsFor(recommendation);
    this.displayHistory.set(id, hist);

    this.recommendationTimestamps.set(id, Date.now());

    if (rules?.permanent) {
      this.shownRecommendations.add(id);
    }

    this.markSlotUsage(slot);
  }
} 