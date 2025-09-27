import { User } from '../hooks/useAuth';

export interface GreetingContext {
  user?: User | null;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  isFirstVisit: boolean;
  lastVisitDate?: Date;
  userPreferences?: {
    preferredTopics?: string[];
    communicationStyle?: 'casual' | 'professional' | 'friendly';
    interests?: string[];
  };
  sessionContext?: {
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    location?: string;
    referrer?: string;
  };
}

export interface GreetingOptions {
  useAI: boolean;
  fallbackToTemplate: boolean;
  includeSuggestions: boolean;
  maxLength: number;
}

export class GreetingService {
  private static instance: GreetingService;
  private aiService: any; // Will be injected

  private constructor() {}

  public static getInstance(): GreetingService {
    if (!GreetingService.instance) {
      GreetingService.instance = new GreetingService();
    }
    return GreetingService.instance;
  }

  public setAIService(aiService: any): void {
    this.aiService = aiService;
  }

  /**
   * Generate a dynamic, AI-powered greeting message
   */
  public async generateGreeting(
    context: GreetingContext,
    options: GreetingOptions = {
      useAI: true,
      fallbackToTemplate: true,
      includeSuggestions: true,
      maxLength: 150
    }
  ): Promise<string> {
    try {
      if (options.useAI && this.aiService) {
        return await this.generateAIGreeting(context, options);
      }
    } catch (error) {
      console.warn('AI greeting generation failed, falling back to template:', error);
    }

    if (options.fallbackToTemplate) {
      return this.generateTemplateGreeting(context);
    }

    return this.getDefaultGreeting();
  }

  /**
   * Generate greeting using AI service
   */
  private async generateAIGreeting(
    context: GreetingContext,
    options: GreetingOptions
  ): Promise<string> {
    const prompt = this.buildGreetingPrompt(context, options);
    
    const response = await this.aiService.sendMessage(prompt, {
      maxTokens: options.maxLength,
      temperature: 0.8, // Slightly creative but not too random
      systemMessage: this.getGreetingSystemMessage()
    });

    return this.sanitizeGreeting(response.content || response);
  }

  /**
   * Build the prompt for AI greeting generation
   */
  private buildGreetingPrompt(context: GreetingContext, options: GreetingOptions): string {
    const { user, timeOfDay, dayOfWeek, isFirstVisit, lastVisitDate, userPreferences, sessionContext } = context;
    
    let prompt = `Generate a warm, personalized greeting message for a user. `;
    
    // User context
    if (user) {
      const name = user.firstName || user.username || 'there';
      prompt += `User's name: ${name}. `;
      
      if (user.bio) {
        prompt += `User's interests: ${user.bio}. `;
      }
      
      if (user.age) {
        prompt += `User's age: ${user.age}. `;
      }
    }

    // Time context
    prompt += `Current time: ${timeOfDay} on ${dayOfWeek}. `;
    
    // Visit context
    if (isFirstVisit) {
      prompt += `This is the user's first visit. `;
    } else if (lastVisitDate) {
      const daysSince = Math.floor((Date.now() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince === 0) {
        prompt += `User visited earlier today. `;
      } else if (daysSince === 1) {
        prompt += `User visited yesterday. `;
      } else if (daysSince < 7) {
        prompt += `User visited ${daysSince} days ago. `;
      } else {
        prompt += `User hasn't visited in over a week. `;
      }
    }

    // Preferences context
    if (userPreferences?.communicationStyle) {
      prompt += `Communication style preference: ${userPreferences.communicationStyle}. `;
    }

    // Session context
    if (sessionContext?.deviceType) {
      prompt += `User is on ${sessionContext.deviceType}. `;
    }

    prompt += `\n\nGenerate a natural, engaging greeting that feels personal and contextually relevant. `;
    prompt += `Keep it under ${options.maxLength} characters. `;
    prompt += `Don't be overly formal or robotic. `;
    
    if (options.includeSuggestions) {
      prompt += `Include a subtle suggestion of what they might want to do today. `;
    }

    return prompt;
  }

  /**
   * Get system message for greeting generation
   */
  private getGreetingSystemMessage(): string {
    return `You are Uterpi, a friendly and intelligent AI assistant. Your task is to generate warm, personalized greeting messages that feel natural and contextually relevant.

GREETING GUIDELINES:
- Be warm and welcoming, but not overly enthusiastic
- Use the user's name naturally when available
- Reference time of day and context appropriately
- Avoid generic phrases like "How can I help you today?"
- Make it feel like you're genuinely happy to see them
- Keep it conversational and human-like
- Don't repeat the same greeting patterns
- Be contextually aware (first visit vs returning user)
- Include subtle suggestions for what they might want to do

TONE: Friendly, intelligent, slightly casual but professional
LENGTH: Concise but meaningful (under 150 characters)
STYLE: Natural conversation, not robotic or templated`;
  }

  /**
   * Generate template-based greeting as fallback
   */
  private generateTemplateGreeting(context: GreetingContext): string {
    const { user, timeOfDay, dayOfWeek, isFirstVisit } = context;
    
    const name = user?.firstName || user?.username || 'there';
    const timeGreeting = this.getTimeBasedGreeting(timeOfDay);
    
    if (isFirstVisit) {
      return `${timeGreeting} ${name}! I'm Uterpi, your AI assistant. I'm excited to help you explore what's possible today. What would you like to dive into?`;
    }
    
    const returnGreetings = [
      `${timeGreeting} ${name}! Great to see you back. What's on your mind today?`,
      `Welcome back, ${name}! Ready to tackle something new?`,
      `${timeGreeting} ${name}! I've been thinking about our last conversation. What should we work on today?`,
      `Hey ${name}! Perfect timing - I was just thinking about some ideas for you. What's your focus today?`
    ];
    
    return returnGreetings[Math.floor(Math.random() * returnGreetings.length)];
  }

  /**
   * Get time-appropriate greeting
   */
  private getTimeBasedGreeting(timeOfDay: string): string {
    switch (timeOfDay) {
      case 'morning': return 'Good morning';
      case 'afternoon': return 'Good afternoon';
      case 'evening': return 'Good evening';
      case 'night': return 'Good evening';
      default: return 'Hello';
    }
  }

  /**
   * Get default greeting
   */
  private getDefaultGreeting(): string {
    return "Hello! I'm Uterpi's AI. What would you like to accomplish today?";
  }

  /**
   * Sanitize and validate AI-generated greeting
   */
  private sanitizeGreeting(greeting: string): string {
    // Remove any unwanted characters or patterns
    let sanitized = greeting.trim();
    
    // Ensure it doesn't start with system-like responses
    if (sanitized.startsWith('Here\'s a greeting:') || sanitized.startsWith('Generated greeting:')) {
      sanitized = sanitized.replace(/^(Here's a greeting:|Generated greeting:)\s*/i, '');
    }
    
    // Ensure it ends properly
    if (!sanitized.endsWith('.') && !sanitized.endsWith('!') && !sanitized.endsWith('?')) {
      sanitized += '.';
    }
    
    return sanitized;
  }

  /**
   * Build context from user data and session info
   */
  public buildContext(user?: User | null, additionalData?: any): GreetingContext {
    const now = new Date();
    const hour = now.getHours();
    
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour < 6) timeOfDay = 'night';
    else if (hour < 12) timeOfDay = 'morning';
    else if (hour < 18) timeOfDay = 'afternoon';
    else timeOfDay = 'evening';

    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Check if this is first visit (you'd implement this based on your tracking)
    const isFirstVisit = !user || !user.updatedAt;
    // Get last visit date
    const lastVisitDate = user?.updatedAt ? new Date(user.updatedAt) : undefined;

    return {
      user,
      timeOfDay,
      dayOfWeek,
      isFirstVisit,
      lastVisitDate,
      userPreferences: {
        communicationStyle: 'friendly', // Could be determined from user behavior
        interests: user?.bio ? [user.bio] : undefined
      },
      sessionContext: {
        deviceType: this.detectDeviceType(),
        ...additionalData
      }
    };
  }

  /**
   * Detect device type from user agent
   */
  private detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
    if (typeof window === 'undefined') return 'desktop';
    
    const userAgent = window.navigator.userAgent.toLowerCase();
    
    if (/tablet|ipad/.test(userAgent)) return 'tablet';
    if (/mobile|android|iphone/.test(userAgent)) return 'mobile';
    return 'desktop';
  }
}
