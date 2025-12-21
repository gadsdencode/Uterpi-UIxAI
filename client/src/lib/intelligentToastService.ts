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

export interface SmartToast {
  id: string;
  title: string;
  description: string;
  category: 'optimization' | 'suggestion' | 'insight' | 'enhancement' | 'alert';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionable: boolean;
  action?: {
    label: string;
    callback: () => void;
  };
  data?: any;
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

  // Toast queue management to avoid rapid-fire notifications
  private toastQueue: SmartToast[] = [];
  private isShowingToast: boolean = false;
  private lastToastTimestamp: number = 0;
  private readonly MIN_TOAST_GAP_MS: number = 3000; // Minimum gap between toasts

  // Cache rules by category
  private readonly CACHE_RULES = {
    'alert': { permanent: true, cooldownMinutes: 0 },           // Never show again
    'optimization': { permanent: true, cooldownMinutes: 0 },   // Never show again
    'insight': { permanent: false, cooldownMinutes: 1 },       // Show again after 1 minute (was 2)
    'suggestion': { permanent: false, cooldownMinutes: 1.5 },  // Show again after 1.5 minutes (was 3)
    'enhancement': { permanent: false, cooldownMinutes: 2 }    // Show again after 2 minutes (was 5)
  };

  constructor(
    aiService: AzureAIService | any, // Accept any AI service with sendChatCompletion method
    toastFunction?: ToastFunction,
    modelSwitchCallback?: (modelId: string) => void,
    newChatCallback?: () => void
  ) {
    this.aiService = aiService;
    this.toastFunction = toastFunction || this.defaultToastFunction;
    this.modelSwitchCallback = modelSwitchCallback;
    this.newChatCallback = newChatCallback;
    this.metrics = this.initializeMetrics();
    this.loadAvailableModels();
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
    // Prevent concurrent analysis to avoid interference
    if (this.isAnalyzing) {
      console.log('⏸️ Analysis already in progress, skipping to prevent interference');
      return;
    }

    this.isAnalyzing = true;
    console.log(`🔍 Starting analysis for ${messages.length} messages with model ${currentModel.name}`);
    
    // Don't show analysis in progress notification - it can interfere with chat
    // The analysis should happen silently in the background
    
    // Update metrics
    this.updateMetrics(messages, currentModel, responseTime, tokenUsage);

    // Reduce analysis frequency throttling even further for testing
    const now = Date.now();
    if (now - this.lastAnalysisTime < 10000) { // Reduced from 30s to 10s for faster testing
      console.log('⚠️ Analysis throttled - waiting for cooldown');
      this.isAnalyzing = false;
      return;
    }
    this.lastAnalysisTime = now;

    try {
      console.log('🔍 Performing conversation analysis...');
      
      // Try AI service analysis first
      let analysis = null;
      try {
        console.log('🚀 Attempting AI service analysis...');
        analysis = await this.performConversationAnalysis(messages, currentModel);
        console.log('✅ AI service analysis completed successfully');
        console.log('📋 Analysis result structure:', {
          hasUserInteractionStyle: !!analysis?.userInteractionStyle,
          hasBehavioralInsights: !!analysis?.behavioralInsights,
          hasConversationDynamics: !!analysis?.conversationDynamics,
          hasHiddenInsights: !!analysis?.hiddenInsights,
          hasInteractionQuality: !!analysis?.interactionQuality,
          keys: Object.keys(analysis || {})
        });
      } catch (aiError) {
        console.warn('⚠️ AI service analysis failed, using fallback:', aiError);
        console.warn('🔍 Error details:', aiError instanceof Error ? aiError.message : String(aiError));
        // Generate fallback analysis without AI service
        analysis = this.generateEnhancedFallbackAnalysis(messages, currentModel);
        console.log('🔄 Fallback analysis completed');
        console.log('📋 Fallback analysis structure:', {
          hasUserInteractionStyle: !!analysis?.userInteractionStyle,
          hasBehavioralInsights: !!analysis?.behavioralInsights,
          hasConversationDynamics: !!analysis?.conversationDynamics,
          hasHiddenInsights: !!analysis?.hiddenInsights,
          hasInteractionQuality: !!analysis?.interactionQuality,
          keys: Object.keys(analysis || {})
        });
      }
      
      // Generate recommendations based on analysis (or fallback)
      const recommendations = this.generateRecommendations(analysis, currentModel);
      console.log(`💡 Generated ${recommendations.length} recommendations:`, recommendations.map((r: SmartToast) => r.title));
      console.log('📊 Analysis data received:', JSON.stringify(analysis, null, 2));
      
      console.log('📋 All recommendations before selection:', recommendations);
      console.log('🔍 Previously shown recommendations:', Array.from(this.shownRecommendations));
      
      // Show the most relevant recommendation
      const topRecommendation = this.selectTopRecommendation(recommendations);
      console.log('🎯 Selected top recommendation:', topRecommendation);
      
      if (topRecommendation && this.canShowRecommendation(topRecommendation)) {
        console.log('📢 Showing smart recommendation:', topRecommendation.title);
        this.showSmartToast(topRecommendation);
        this.markRecommendationShown(topRecommendation);
        console.log('✅ Recommendation shown and added to cache');
      } else if (topRecommendation) {
        console.log('🔄 Top recommendation already shown or blocked:', topRecommendation.title);
        console.log('🔄 Recommendation ID:', topRecommendation.id);
        console.log('🔄 Previously shown IDs:', Array.from(this.shownRecommendations));
      } else {
        console.log('ℹ️ No new recommendations to show');
      }

    } catch (error) {
      console.error('❌ Analysis completely failed:', error);
      
      // Don't show any toast on error - just fail silently to avoid disrupting chat
      // The chat functionality is more important than analysis notifications
    } finally {
      // Always clear the analyzing flag
      this.isAnalyzing = false;
    }
  }

  private async performConversationAnalysis(messages: Message[], currentModel: LLMModel): Promise<any> {
    if (messages.length < 2) {
      console.log('⚠️ Not enough messages for analysis yet');
      return null;
    }

    console.log(`🔍 Starting enhanced conversation analysis for ${messages.length} messages...`);

    const recentMessages = messages.slice(-15); // Analyze last 15 messages for better context
    const conversationText = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // Extract user messages for pattern analysis
    const userMessages = recentMessages.filter(m => m.role === 'user');
    const assistantMessages = recentMessages.filter(m => m.role === 'assistant');

    // Create a more concise prompt for providers with token limitations (like Gemini)
    const isGemini = this.aiService.constructor?.name?.includes('Gemini');
    
    // IMPORTANT: System instructions and analysis tasks are now STRICTLY in the system role
    // to prevent context leaks where "ANALYSIS TASK:" strings appear in the UI.
    // The user role message contains ONLY the conversation data to analyze.
    
    const systemInstructions = isGemini ?
    // Concise system instructions for Gemini
    `You are an expert in analyzing human-AI interaction patterns. You will receive a conversation transcript to analyze.

Your task: Analyze the conversation and return ONLY a valid JSON object with insights about the user's interaction style, behavioral patterns, and communication preferences.

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON, no other text
- Do NOT include any text before or after the JSON
- Do NOT use apostrophes or quotes in string values unless you escape them with backslash
- Example: "user's goal" should be "user goal" or "users goal"

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
    // Full system instructions for other providers
    `You are an expert in analyzing human-AI interaction patterns. You will receive a conversation transcript to analyze.

Your task: Provide deep insights about the user's interaction style, communication patterns, and behavioral tendencies. Focus on revealing "hidden insights" that would help understand how this user thinks and interacts with AI.

Analysis Criteria:

1. User Interaction Style Analysis:
   - How does the user communicate? (direct, exploratory, detailed, concise, iterative)
   - What type of questions do they ask? (specific, open-ended, follow-up, clarifying)
   - What's their engagement level? (high, medium, low)
   - How patient are they with responses? (high, medium, low)

2. Conversation Dynamics:
   - How deep do they go into topics? (surface, moderate, deep, expert)
   - How do they handle multiple topics? (single-topic, multi-topic, branching, returning)
   - Does complexity increase, decrease, or stay stable?
   - What response style do they prefer? (detailed, concise, step-by-step, overview)

3. Behavioral Insights:
   - What's their learning style? (visual, practical, theoretical, experimental)
   - How do they approach problem-solving? (systematic, creative, pragmatic, analytical)
   - What's their confidence level? (high, medium, low)
   - What areas show expertise vs. areas for improvement?

4. Interaction Quality Assessment:
   - Rate clarity of communication (1-10)
   - Rate efficiency of interaction (1-10)
   - Predict satisfaction level (1-10)
   - Identify potential frustration points

5. Hidden Patterns:
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

    // User message contains ONLY the conversation data - no analysis instructions
    // This prevents "ANALYSIS TASK:" or similar strings from leaking into visible conversation
    const userMessage = isGemini ?
      `Analyze this conversation transcript:\n\n${conversationText.substring(0, 1500)}` :
      `Analyze this conversation transcript:\n\n${conversationText}`;

    try {
      // Check if the AI service is available and properly configured
      if (!this.aiService || typeof this.aiService.sendChatCompletion !== 'function') {
        console.warn('⚠️ AI service not properly configured for analysis, using fallback');
        return this.generateEnhancedFallbackAnalysis(messages, currentModel);
      }

      // Get the service type for logging
      const serviceName = this.aiService.constructor?.name || 'Unknown';
      console.log(`🤖 Using ${serviceName} for conversation analysis`);

      // Adjust token limit based on provider (Gemini needs more tokens for JSON responses)
      // Increased from 2048 to 4096 for Gemini to prevent truncation
      const maxTokens = serviceName.includes('Gemini') ? 4096 : 1500;
      console.log(`📊 Requesting ${maxTokens} max tokens for analysis`);

      // FIXED: System instructions and analysis tasks are now STRICTLY in the system role
      // This prevents context leaks where analysis prompt strings appear in the UI
      const response = await this.aiService.sendChatCompletion([
        {
          role: "system",
          content: systemInstructions
        },
        {
          role: "user",
          content: userMessage
        }
      ], { maxTokens, temperature: 0.3 });

      console.log('📡 Enhanced analysis response received:', response.substring(0, 200) + '...');
      
      const parsed = this.parseAnalysisResponse(response);
      if (parsed) {
        console.log('✅ Successfully parsed enhanced analysis:', parsed);
        return parsed;
      } else {
        console.warn('⚠️ Could not parse enhanced analysis, using fallback');
        return this.generateEnhancedFallbackAnalysis(messages, currentModel);
      }
    } catch (apiError: any) {
      console.error('❌ Enhanced analysis failed:', apiError);
      // Don't log the full error if it's a known issue (like service not available)
      if (apiError.message?.includes('endpoint error') || apiError.message?.includes('403') || apiError.message?.includes('API key')) {
        console.log('ℹ️ AI service not available for analysis, using fallback');
      }
      return this.generateEnhancedFallbackAnalysis(messages, currentModel);
    }
  }

  /**
   * Robust JSON parsing for AI service responses
   */
  private parseAnalysisResponse(response: string): any {
    try {
      console.log('📡 Raw AI response length:', response.length);
      console.log('📡 Raw AI response preview:', response.substring(0, 300) + '...');
      
      // Strategy 0: First check if response is wrapped in markdown code blocks
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
      
      // Strategy 1: Try parsing cleaned response first
      try {
        const parsed = JSON.parse(cleanedResponse);
        console.log('✅ JSON parsed successfully after cleaning markdown');
        
        if (this.validateAnalysisResponse(parsed)) {
          return parsed;
        } else {
          console.warn('⚠️ Parsed JSON but validation failed:', parsed);
        }
      } catch (directParseError) {
        console.log('❌ Direct JSON parse failed after cleaning:', directParseError);
        
        // Try original response as fallback
        try {
          const parsed = JSON.parse(response);
          console.log('✅ JSON parsed successfully without cleaning');
          
          if (this.validateAnalysisResponse(parsed)) {
            return parsed;
          }
        } catch (originalError) {
          console.log('❌ Original response parse also failed:', originalError);
        }
      }

      // Strategy 2: Extract JSON from text
      const jsonExtractionPatterns = [
        // Look for complete JSON objects
        /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
        // Look for JSON that might be wrapped in markdown code blocks
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi,
        // Look for JSON starting after a colon or other delimiter
        /[:\n]\s*(\{[\s\S]*\})/g
      ];

      for (let patternIndex = 0; patternIndex < jsonExtractionPatterns.length; patternIndex++) {
        const pattern = jsonExtractionPatterns[patternIndex];
        const matches = response.match(pattern);
        
        if (matches) {
          console.log(`🎯 Found ${matches.length} potential JSON matches with pattern ${patternIndex + 1}`);
          
          for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
            let jsonStr = matches[matchIndex];
            
            // Clean up the match
            if (pattern.source.includes('```')) {
              // Extract from markdown code block
              const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
              if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1];
              }
            } else if (pattern.source.includes('[:\\n]')) {
              // Remove leading delimiter
              jsonStr = jsonStr.replace(/^[:\n]\s*/, '');
            }
            
            console.log(`🧪 Trying to parse match ${matchIndex + 1}:`, jsonStr.substring(0, 200) + '...');
            
            // Strategy 3: Try with conservative sanitization
            try {
              const sanitized = this.conservativeSanitizeJSON(jsonStr);
              console.log('🧽 Sanitized JSON:', sanitized.substring(0, 200) + '...');
              
              const parsed = JSON.parse(sanitized);
              
              if (this.validateAnalysisResponse(parsed)) {
                console.log('✅ Successfully parsed and validated JSON with conservative sanitization');
                return parsed;
              } else {
                console.warn('⚠️ Parsed JSON but validation failed');
              }
            } catch (conservativeError) {
              console.warn(`⚠️ Conservative sanitization failed for match ${matchIndex + 1}:`, conservativeError);
              
              // Strategy 4: Try with aggressive sanitization as last resort
              try {
                const aggressiveSanitized = this.aggressiveSanitizeJSON(jsonStr);
                console.log('🔧 Aggressively sanitized JSON:', aggressiveSanitized.substring(0, 200) + '...');
                
                const parsed = JSON.parse(aggressiveSanitized);
                
                if (this.validateAnalysisResponse(parsed)) {
                  console.log('✅ Successfully parsed and validated JSON with aggressive sanitization');
                  return parsed;
                }
              } catch (aggressiveError) {
                console.warn(`⚠️ Aggressive sanitization failed for match ${matchIndex + 1}:`, aggressiveError);
                
                // Log detailed error information for debugging
                this.logDetailedParsingError(jsonStr, aggressiveError);
              }
            }
          }
        }
      }

      console.warn('⚠️ No valid JSON found in Azure AI response after all attempts');
      return null;
    } catch (error) {
      console.error('❌ JSON parsing completely failed:', error);
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
    
    // Check if the JSON seems to be incomplete (missing closing braces)
    const openBraces = (result.match(/{/g) || []).length;
    const closeBraces = (result.match(/}/g) || []).length;
    
    if (openBraces > closeBraces) {
      console.log(`🔧 Fixing incomplete JSON: ${openBraces} open braces, ${closeBraces} close braces`);
      // Add missing closing braces
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
      console.log('🔧 JSON appears truncated after userInteractionStyle, attempting to complete structure');
      // Try to complete with minimal valid structure
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
   * Log detailed information about parsing errors for debugging
   */
  private logDetailedParsingError(jsonStr: string, error: any): void {
    console.error('🔍 Detailed parsing error analysis:');
    console.error('Error:', error.message);
    
    if (error.message.includes('position')) {
      const positionMatch = error.message.match(/position (\d+)/);
      if (positionMatch) {
        const position = parseInt(positionMatch[1]);
        const start = Math.max(0, position - 50);
        const end = Math.min(jsonStr.length, position + 50);
        const context = jsonStr.substring(start, end);
        const pointer = ' '.repeat(Math.min(50, position - start)) + '^';
        
        console.error('Context around error position:');
        console.error(context);
        console.error(pointer);
        console.error(`Character at error position: "${jsonStr[position]}" (code: ${jsonStr.charCodeAt(position)})`);
      }
    }
    
    // Show first few lines of the JSON for structure analysis
    const lines = jsonStr.split('\n').slice(0, 10);
    console.error('First 10 lines of JSON:');
    lines.forEach((line, index) => {
      console.error(`${index + 1}: ${line}`);
    });
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

  /**
   * Generate enhanced fallback analysis when Azure AI is not available
   */
  private generateEnhancedFallbackAnalysis(messages: Message[], currentModel: LLMModel): any {
    console.log('🔄 Generating enhanced fallback analysis...');
    
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

  /**
   * Generate insight-based recommendations from conversation analysis
   */
  private generateInsightBasedRecommendations(insights: any): SmartToast[] {
    const recommendations: SmartToast[] = [];
    
    console.log('🧠 Generating insight-based recommendations from:', insights);
    
    // Communication style insights
    if (insights.userInteractionStyle?.communicationType === 'detailed') {
      recommendations.push({
        id: 'communication-style-detailed',
        title: "📝 Detailed Communicator Detected",
        description: "You prefer comprehensive explanations. The AI is adapting to provide more thorough responses.",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    if (insights.userInteractionStyle?.communicationType === 'iterative') {
      recommendations.push({
        id: 'communication-style-iterative',
        title: "🔄 Iterative Problem Solver",
        description: "You build solutions step by step. This approach often leads to better results!",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    if (insights.userInteractionStyle?.communicationType === 'exploratory') {
      recommendations.push({
        id: 'communication-style-exploratory',
        title: "🔍 Exploratory Thinker",
        description: "You explore topics thoroughly. This helps uncover the best solutions!",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    // Learning style insights
    if (insights.behavioralInsights?.learningStyle === 'practical') {
      recommendations.push({
        id: 'learning-style-practical',
        title: "🔧 Hands-On Learner",
        description: "You learn best through practical examples. Try asking for code samples or step-by-step guides.",
        category: 'suggestion',
        priority: 'medium',
        actionable: false
      });
    }
    
    if (insights.behavioralInsights?.learningStyle === 'theoretical') {
      recommendations.push({
        id: 'learning-style-theoretical',
        title: "📚 Theoretical Learner",
        description: "You prefer understanding concepts deeply. The AI is providing comprehensive explanations.",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    // Confidence insights
    if (insights.behavioralInsights?.confidenceLevel === 'low') {
      recommendations.push({
        id: 'confidence-boost',
        title: "💪 Building Confidence",
        description: "Your questions show you're learning. Don't hesitate to ask for clarification - it's a sign of good thinking!",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    if (insights.behavioralInsights?.confidenceLevel === 'high') {
      recommendations.push({
        id: 'confidence-high',
        title: "🚀 Confident Problem Solver",
        description: "Your confident approach helps you tackle complex challenges effectively!",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    // Efficiency insights
    if (insights.interactionQuality?.efficiencyScore < 6) {
      recommendations.push({
        id: 'efficiency-tip',
        title: "⚡ Efficiency Tip",
        description: "Try being more specific in your questions. It helps the AI provide more targeted, useful responses.",
        category: 'suggestion',
        priority: 'medium',
        actionable: false
      });
    }
    
    if (insights.interactionQuality?.efficiencyScore >= 8) {
      recommendations.push({
        id: 'efficiency-high',
        title: "⚡ Highly Efficient",
        description: "Your communication style is very efficient! You get great results with clear, focused questions.",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    // Hidden pattern insights
    if (insights.hiddenInsights?.thinkingPattern) {
      recommendations.push({
        id: 'thinking-pattern',
        title: "🧠 Your Thinking Pattern",
        description: insights.hiddenInsights.thinkingPattern,
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    if (insights.hiddenInsights?.motivation) {
      recommendations.push({
        id: 'motivation-insight',
        title: "🎯 Your Motivation",
        description: insights.hiddenInsights.motivation,
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    // Interaction quality insights
    if (insights.interactionQuality?.satisfactionPrediction >= 8) {
      recommendations.push({
        id: 'high-satisfaction',
        title: "😊 Great Interaction Quality",
        description: "You're having a highly effective conversation! Your clear communication style is working well.",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    if (insights.interactionQuality?.satisfactionPrediction < 6) {
      recommendations.push({
        id: 'satisfaction-improvement',
        title: "🎯 Improving Satisfaction",
        description: "Try being more specific about what you need. It helps the AI provide better, more relevant responses.",
        category: 'suggestion',
        priority: 'medium',
        actionable: false
      });
    }
    
    // Topic depth insights
    if (insights.conversationDynamics?.topicDepth === 'deep') {
      recommendations.push({
        id: 'topic-depth-deep',
        title: "🔬 Deep Dive Expert",
        description: "You're exploring topics in depth. This approach reveals valuable insights and solutions.",
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }
    
    if (insights.conversationDynamics?.topicDepth === 'expert') {
      recommendations.push({
        id: 'topic-depth-expert',
        title: "🎓 Expert Level Analysis",
        description: "You're working at an expert level. Consider using the Technical system preset for even more detailed responses.",
        category: 'enhancement',
        priority: 'medium',
        actionable: true
      });
    }
    
    // Focus pattern insights
    if (insights.conversationDynamics?.focusPattern === 'multi-topic') {
      recommendations.push({
        id: 'focus-multi-topic',
        title: "🎯 Multi-Topic Explorer",
        description: "You're covering multiple topics. This shows broad thinking, but focusing on one area at a time can lead to deeper insights.",
        category: 'suggestion',
        priority: 'low',
        actionable: false
      });
    }
    
    console.log(`💡 Generated ${recommendations.length} insight-based recommendations`);
    return recommendations;
  }

  private generateRecommendations(analysis: any, currentModel: LLMModel): SmartToast[] {
    const recommendations: SmartToast[] = [];

    console.log('💡 Generating recommendations with analysis:', analysis);
    console.log('📊 Current metrics:', this.metrics);

    // PRIORITY 1: Long conversation warnings (highest priority - actionable)
    if (this.metrics.messageCount >= 20) {
      recommendations.push({
        id: 'long-conversation-warning',
        title: "📊 Long Conversation Alert",
        description: `You've had ${this.metrics.messageCount} messages. Consider starting a new chat for better performance and context clarity.`,
        category: 'alert',
        priority: 'high',
        actionable: true,
        action: {
          label: "New Chat",
          callback: () => this.triggerNewChat()
        }
      });
    }

    // PRIORITY 2: Token usage optimization (lowered threshold for earlier warnings)
    if (this.metrics.totalTokens > 10000) { // Reduced from 15000
      recommendations.push({
        id: 'token-optimization',
        title: "📊 Token Usage Alert",
        description: `High token usage (${this.metrics.totalTokens.toLocaleString()}). Consider starting a new conversation for optimal context`,
        category: 'alert',
        priority: 'high',
        actionable: true,
        action: {
          label: "New Chat",
          callback: () => this.triggerNewChat()
        }
      });
    }

    // PRIORITY 3: AI-generated insights (only if analysis is available and has real insights)
    if (analysis && (analysis.userInteractionStyle || analysis.behavioralInsights || analysis.hiddenInsights)) {
      console.log('🧠 Analysis has insight data, generating insight-based recommendations...');
      console.log('📋 userInteractionStyle:', analysis.userInteractionStyle);
      console.log('📋 behavioralInsights:', analysis.behavioralInsights);
      console.log('📋 hiddenInsights:', analysis.hiddenInsights);
      
      const insightRecommendations = this.generateInsightBasedRecommendations(analysis);
      recommendations.push(...insightRecommendations);
      console.log(`💡 Generated ${insightRecommendations.length} insight-based recommendations:`, 
        insightRecommendations.map((r: SmartToast) => r.title));
    } else {
      console.log('⚠️ Analysis missing insight data. Available keys:', Object.keys(analysis || {}));
    }

    // PRIORITY 4: Performance insights
    if (this.metrics.averageResponseTime > 3000) {
      recommendations.push({
        id: 'performance-slow',
        title: "⚡ Performance Insight",
        description: `Average response time is ${(this.metrics.averageResponseTime/1000).toFixed(1)}s. Consider a faster model for better experience`,
        category: 'insight',
        priority: 'medium',
        actionable: true
      });
    }

    // PRIORITY 5: Model optimization recommendations
    if (!analysis?.modelOptimal && 
        analysis?.modelRecommendation && 
        analysis.modelRecommendation !== currentModel.id &&
        analysis?.confidenceScore >= 7) {
      
      const recommendedModel = this.availableModels.find(m => m.id === analysis.modelRecommendation);
      if (recommendedModel) {
        const efficiencyGain = this.calculateRealEfficiencyGain(currentModel, recommendedModel, analysis.taskType);
        
        recommendations.push({
          id: `model-opt-${analysis.modelRecommendation}`,
          title: "🚀 Model Optimization",
          description: `${recommendedModel.name} would be ${efficiencyGain}% more effective for ${analysis.taskType} tasks. ${analysis.improvementReason || 'Better suited for this type of work.'}`,
          category: 'optimization',
          priority: 'medium',
          actionable: true,
          action: {
            label: "Switch Model",
            callback: () => this.triggerModelSwitch(analysis.modelRecommendation)
          }
        });
      }
    }

    // PRIORITY 6: Context quality recommendations
    if (analysis?.focusScore < 6 && this.metrics.messageCount > 6) {
      recommendations.push({
        id: 'context-focus',
        title: "🎯 Context Enhancement",
        description: "Conversation is covering multiple topics. Consider focusing on one area for better assistance",
        category: 'suggestion',
        priority: 'low',
        actionable: false
      });
    }

    // PRIORITY 7: Feature enhancement suggestions
    if (analysis?.taskType === 'coding' && this.metrics.attachmentUsage === 0 && this.metrics.messageCount > 3) {
      recommendations.push({
        id: 'coding-enhancement',
        title: "💻 Coding Enhancement",
        description: "Upload code files for more accurate analysis and suggestions",
        category: 'enhancement',
        priority: 'low',
        actionable: false
      });
    }

    // PRIORITY 8: Advanced usage patterns
    if (analysis?.complexity === 'expert' && this.metrics.systemMessageChanges === 0 && this.metrics.messageCount > 4) {
      recommendations.push({
        id: 'expert-system-message',
        title: "🧠 Expert Mode",
        description: "Try the Technical system preset for more detailed, expert-level responses",
        category: 'enhancement',
        priority: 'medium',
        actionable: true
      });
    }

    // PRIORITY 9: Basic conversation milestone (ONLY if no other recommendations exist)
    if (recommendations.length === 0 && this.metrics.messageCount >= 3 && this.metrics.messageCount % 5 === 0) {
      recommendations.push({
        id: `conversation-milestone-${this.metrics.messageCount}`,
        title: "🎯 Conversation Milestone",
        description: `You've had ${this.metrics.messageCount} messages in this conversation. Great job exploring!`,
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }

    // PRIORITY 10: Basic performance note (ONLY if no other recommendations exist)
    if (recommendations.length === 0 && this.metrics.averageResponseTime > 1000) {
      recommendations.push({
        id: 'basic-performance',
        title: "⚡ Performance Note",
        description: `Response time averaging ${(this.metrics.averageResponseTime/1000).toFixed(1)}s. This is normal for complex queries.`,
        category: 'insight',
        priority: 'low',
        actionable: false
      });
    }

    console.log(`📝 Generated ${recommendations.length} total recommendations`);
    return recommendations;
  }

  private selectTopRecommendation(recommendations: SmartToast[]): SmartToast | null {
    if (recommendations.length === 0) return null;

    console.log('🎯 Selecting top recommendation from:', recommendations.map(r => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
      category: r.category,
      actionable: r.actionable
    })));

    // Prioritize by urgency and actionability
    const priorityScore = (rec: SmartToast) => {
      let score = 0;
      
      // Priority scoring (highest to lowest)
      if (rec.priority === 'urgent') score += 100;
      else if (rec.priority === 'high') score += 75;
      else if (rec.priority === 'medium') score += 50;
      else score += 25;

      // Actionable items get bonus points
      if (rec.actionable) score += 30;
      
      // Category bonuses
      if (rec.category === 'alert') score += 25; // Alerts are important
      if (rec.category === 'optimization') score += 20;
      if (rec.category === 'suggestion') score += 15;
      if (rec.category === 'insight') score += 10;
      
      // Specific recommendation type bonuses
      if (rec.id.includes('long-conversation-warning')) score += 40; // Long conversation warnings are critical
      if (rec.id.includes('token-optimization')) score += 35; // Token optimization is important
      if (rec.id.includes('thinking-pattern')) score += 25; // AI insights are valuable
      if (rec.id.includes('communication-style')) score += 20; // Communication insights are helpful
      
      // Penalize basic milestones when other recommendations exist
      if (rec.id.includes('conversation-milestone')) score -= 20;
      if (rec.id.includes('basic-performance')) score -= 15;
      
      return score;
    };

    const sortedRecommendations = recommendations.sort((a, b) => priorityScore(b) - priorityScore(a));
    const topRecommendation = sortedRecommendations[0];
    
    console.log('🏆 Top recommendation selected:', {
      id: topRecommendation.id,
      title: topRecommendation.title,
      priority: topRecommendation.priority,
      category: topRecommendation.category,
      actionable: topRecommendation.actionable,
      score: priorityScore(topRecommendation)
    });
    
    // Log why this recommendation was selected over others
    if (sortedRecommendations.length > 1) {
      console.log('📊 Recommendation ranking:');
      sortedRecommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec.title} (${rec.priority}, ${rec.category}, actionable: ${rec.actionable}, score: ${priorityScore(rec)})`);
      });
    }

    return topRecommendation;
  }

  private showSmartToast(smartToast: SmartToast): void {
    console.log('🎬 Queueing toast:', smartToast.title);
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
      const duration = next.priority === 'urgent' ? 10000 :
                       next.priority === 'high' ? 8000 : 6000;

      console.log('🚀 Displaying queued toast:', next.title);
      this.toastFunction(next.title, {
        description: next.description,
        duration,
        action: next.action ? { label: next.action.label, onClick: next.action.callback } : undefined
      });

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
    this.lastAnalysisTime = 0;
    console.log('🔄 Session reset - all metrics, recommendation cache, and timestamps cleared');
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
    // Clear all insight-related recommendations from both caches
    const insightIds = Array.from(this.recommendationTimestamps.keys()).filter(id => 
      id.includes('thinking-pattern') || 
      id.includes('communication-style') || 
      id.includes('motivation') ||
      id.includes('confidence') ||
      id.includes('learning-style') ||
      id.includes('satisfaction') ||
      id.includes('topic-depth') ||
      id.includes('focus-')
    );
    
    insightIds.forEach(id => {
      this.shownRecommendations.delete(id);
      this.recommendationTimestamps.delete(id);
    });
    
    console.log(`🗑️ Forced clear ${insightIds.length} insight caches:`, insightIds);
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
      priority: 'medium',
      actionable: false
    };
    
    console.log('🧪 Testing recommendation:', testRecommendation);
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
    timestampCachedIds: Array<{id: string, lastShown: number, minutesAgo: number}>;
  } {
    const now = Date.now();
    const timestampEntries = Array.from(this.recommendationTimestamps.entries()).map(([id, timestamp]) => ({
      id,
      lastShown: timestamp,
      minutesAgo: Math.round((now - timestamp) / 1000 / 60)
    }));

    return {
      permanentCacheSize: this.shownRecommendations.size,
      permanentCachedIds: Array.from(this.shownRecommendations),
      timestampCacheSize: this.recommendationTimestamps.size,
      timestampCachedIds: timestampEntries
    };
  }

  /**
   * Check if a recommendation can be shown based on category-aware caching rules
   */
  private canShowRecommendation(recommendation: SmartToast): boolean {
    const { id, category } = recommendation;
    const rules = this.CACHE_RULES[category as keyof typeof this.CACHE_RULES];
    
    // If no rules defined for this category, default to permanent cache
    if (!rules) {
      console.log(`⚠️ No cache rules for category: ${category}, defaulting to permanent cache`);
      return !this.shownRecommendations.has(id);
    }
    
    // If permanent cache, only show once
    if (rules.permanent) {
      const canShow = !this.shownRecommendations.has(id);
      console.log(`🔒 Permanent cache check for ${id}: ${canShow ? 'CAN SHOW' : 'BLOCKED'}`);
      return canShow;
    }
    
    // For non-permanent cache, check cooldown period
    const lastShown = this.recommendationTimestamps.get(id);
    if (!lastShown) {
      console.log(`🆕 First time showing recommendation: ${id}`);
      return true;
    }
    
    const cooldownMs = rules.cooldownMinutes * 60 * 1000;
    const toleranceMs = 10 * 1000; // 10 second tolerance buffer for timing precision
    const timeSinceLastShown = Date.now() - lastShown;
    const canShow = timeSinceLastShown >= (cooldownMs - toleranceMs);
    
    const minutesAgo = Math.round(timeSinceLastShown / 1000 / 60 * 10) / 10; // One decimal place
    const cooldownMinutes = rules.cooldownMinutes;
    
    console.log(`⏰ Cooldown check for ${id}: ${minutesAgo}min ago, cooldown: ${cooldownMinutes}min, tolerance: 10s, ${canShow ? 'CAN SHOW' : 'BLOCKED'}`);
    
    if (!canShow) {
      const remainingMs = (cooldownMs - toleranceMs) - timeSinceLastShown;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      console.log(`⏰ ${id} blocked for ${remainingSeconds} more seconds`);
    }
    
    return canShow;
  }

  /**
   * Mark a recommendation as shown
   */
  private markRecommendationShown(recommendation: SmartToast): void {
    const { id, category } = recommendation;
    const rules = this.CACHE_RULES[category as keyof typeof this.CACHE_RULES];
    
    // Always track timestamp
    this.recommendationTimestamps.set(id, Date.now());
    
    // For permanent cache categories, also add to the set
    if (rules?.permanent) {
      this.shownRecommendations.add(id);
      console.log(`🔒 Permanently cached: ${id}`);
    } else {
      console.log(`⏰ Time-cached: ${id} (can show again in ${rules?.cooldownMinutes || 0} minutes)`);
    }
  }
} 