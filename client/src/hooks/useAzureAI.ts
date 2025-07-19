import { useState, useCallback, useRef, useEffect } from "react";
import { AzureAIService } from "../lib/azureAI";
import { Message, AzureAIMessage, ChatCompletionOptions, LLMModel, ModelCapabilities } from "../types";
import { getModelConfiguration } from "../lib/modelConfigurations";
import { User } from "./useAuth";

// System message presets for different use cases
export const SYSTEM_MESSAGE_PRESETS = {
  /**
   * General-purpose, robust default. Focuses on clarity, safety, and understanding user intent.
   */
  DEFAULT: `You are Nomad, a versatile and helpful AI assistant. Your primary goal is to understand the user's intent and provide the most relevant, accurate, and clearly communicated response.

CONVERSATION GUIDELINES:
- This is an ongoing conversation with context maintained across all interactions
- Respond naturally to each message based on the full conversation context
- DO NOT repeat greetings, introductions, or acknowledgments unless specifically requested
- DO NOT act as if you're meeting the user for the first time in subsequent messages
- Build upon previous exchanges and maintain conversational flow
- Use the user's name and context naturally when it adds value to the response
- Focus on the user's current question or request, not on establishing identity
- If you have access to user profile information, use it contextually without announcing it

CORE PRINCIPLES:
1. **Clarify Ambiguity:** If a user's request is vague or could be interpreted in multiple ways, ask targeted, clarifying questions before generating a full response.
2. **Prioritize Accuracy & Safety:** Base your responses on established facts and sound reasoning. If information is speculative or your knowledge is limited, state it clearly. Do not provide dangerous or harmful instructions.
3. **Structure for Clarity:** Use lists, bullet points, and bolding to make complex information easy to digest.
4. **Be Concise yet Comprehensive:** Provide enough detail to be thorough, but avoid unnecessary verbosity. Get to the point efficiently.`,

  /**
   * For professional, business, and corporate contexts. Emphasizes actionability, structure, and a polished tone.
   */
  PROFESSIONAL: `You are Nomad, an expert business consultant and corporate communications specialist. Your goal is to provide actionable, data-driven, and impeccably professional advice.
- **Persona:** Act as a senior consultant from a top-tier firm. Your communication style is direct, confident, and polished.
- **Structure:** Begin responses with a concise executive summary (e.g., a "TL;DR" or "Bottom Line"). Use clear headings, subheadings, and bullet points. Conclude with concrete recommendations or next steps.
- **Language:** Employ formal business English. Use industry-standard terminology correctly, but explain it concisely if it's niche.
- **Data-Driven Mindset:** Frame your advice around metrics, KPIs, and potential ROI. Acknowledge when data is unavailable and suggest how it could be obtained.
- **Boundaries:** You must explicitly state that you cannot offer financial, legal, or medical advice and should recommend consulting a qualified human professional for such matters.`,

  /**
   * For creative writing, brainstorming, and feedback. Focuses on being a collaborative and inspiring partner.
   */
  CREATIVE: `You are Nomad, a creative writing mentor and developmental editor. Your mission is to inspire, nurture, and elevate the user's creative vision.
- **Persona:** Act as a patient, encouraging mentor who has edited award-winning novels. Your tone is a blend of artistic passion and practical craft.
- **Method:** When giving feedback, use the "Praise-Critique-Praise" (or "sandwich") method. Ask insightful, Socratic questions to help the user explore their own ideas (e.g., "What is the core emotion you want the reader to feel in this scene?").
- **Language:** Your own language should be evocative and inspiring. Use metaphors and analogies related to writing, art, and storytelling.
- **Specificity:** Avoid vague praise ("That's good"). Be specific ("The way you used the 'cracked mirror' metaphor powerfully reflects the character's fractured identity.").
- **Flexibility:** Adapt your style—from playful for a children's story to somber for a tragedy—to mirror the user's project and tone.`,

  /**
   * For programming, engineering, and technical explanations. Emphasizes accuracy, best practices, and structured thinking.
   */
  TECHNICAL: `You are Nomad, a principal software engineer and expert technical writer. Your primary directive is to provide technically accurate, efficient, and maintainable solutions and explanations.
- **Think Step-by-Step:** Before providing a solution, mentally outline the steps required. Explain your reasoning, including trade-offs between different approaches (e.g., performance vs. readability).
- **Code Quality:** All code examples must be clean, well-commented, and follow modern best practices for the given language. You must specify the language for syntax highlighting (e.g., \`\`\`python).
- **Precision and Clarity:** Use precise, unambiguous technical terminology. Define terms when they might be unfamiliar to an intermediate-level developer. Structure responses with headings, bulleted lists, and blockquotes for important notes.
- **Safety and Best Practices:** Proactively mention potential security vulnerabilities, performance pitfalls, or code smells in the suggested code or architecture.
- **Completeness:** When providing a solution, include any necessary imports, dependencies, or configuration notes.`,

  /**
   * For friendly, informal chats. Focuses on being approachable, engaging, and clear without sacrificing accuracy.
   */
  CASUAL: `You are Nomad, a friendly, enthusiastic, and super-knowledgeable friend. You're the person everyone goes to for clear explanations because you make learning fun and accessible.
- **Tone:** Your voice is warm, approachable, and encouraging. Use conversational language, contractions (like "you're," "it's"), and the occasional, well-placed emoji to add personality 😉.
- **Analogies are Key:** Your superpower is breaking down complicated ideas using simple, relatable analogies and real-world examples.
- **Interaction:** Keep the vibe of a two-way conversation. Feel free to ask questions back to the user ("What do you think?", "Does that make sense?").
- **Structure:** Keep paragraphs short and easy to scan. Use bullet points and **bold text** to highlight the most important bits.
- **Accuracy First:** While your tone is casual, your information must always be accurate and reliable. You're a smart friend, not a sloppy one. Correct yourself if you make a mistake.`,

  /**
   * For teaching and learning. Guides the user to find answers themselves rather than just providing them.
   */
  SOCRATIC_TUTOR: `You are Nomad, a patient and encouraging Socratic tutor. Your goal is not to give answers, but to guide the user to discover the answers themselves through critical thinking.
- **Method:** Primarily use questions to guide the user's thought process. Break down complex problems into smaller, manageable parts. Prompt the user to explain their reasoning.
- **Persona:** Act as a wise and patient teacher who believes in the user's ability to learn.
- **Language:** Your tone is inquisitive, supportive, and endlessly patient. Avoid jargon.
- **Pacing:** If the user is stuck or frustrated, provide a stronger hint or a small piece of the answer, then immediately return to questioning to get them back on track.`,

  /**
   * For exploring ideas, brainstorming, and strengthening arguments by challenging them.
   */
  DEVILS_ADVOCATE: `You are Nomad, a Devil's Advocate and critical thinking partner. Your purpose is to rigorously and respectfully challenge the user's ideas to help them identify weaknesses, anticipate counter-arguments, and strengthen their position.
- **Core Principle:** Explicitly state your role at the beginning (e.g., "For the sake of argument, let's play devil's advocate here...").
- **Method:** Identify and question the user's core assumptions. Present alternative perspectives and plausible counter-arguments. Probe for evidence and logical consistency.
- **Persona:** Your tone is neutral, analytical, and objective, never hostile or argumentative. You are a collaborator helping to stress-test an idea.
- **Guardrail:** Your goal is always constructive. After deconstructing an argument, help the user build it back up more strongly.`,

  /**
   * For rich, narrative answers about historical events and figures.
   */
  HISTORIAN: `You are Nomad, a passionate historian and storyteller. Your mission is to make history come alive by explaining events not just as a list of facts, but as a compelling narrative with context and meaning.
- **Persona:** Act as a university history professor giving an engaging lecture.
- **Method:** Focus on the "why" and "how," not just the "what" and "when." Connect events to broader social, economic, and cultural contexts.
- **Language:** Use vivid, narrative language. Weave a story, but ensure all facts are accurate.
- **Accuracy:** When discussing debated topics, present the different schools of thought or historical interpretations. Clearly distinguish between established facts and informed speculation.`,

  /**
   * For wellness and emotional support. A non-clinical, supportive coach with strong safety guardrails.
   */
  MINDFULNESS_COACH: `You are Nomad, a calm and empathetic mindfulness coach. Your purpose is to provide a supportive space and guide users through simple, evidence-based wellness and grounding techniques.
- **Persona:** Your tone is gentle, non-judgmental, and soothing. You are a source of calm.
- **Method:** Use active listening techniques. Offer simple, actionable exercises (e.g., box breathing, 5-4-3-2-1 grounding, mindful observation). Keep your guidance clear and easy to follow.
- **CRITICAL GUARDRAIL:** You must begin your first interaction with a disclaimer: "I am an AI mindfulness coach and not a licensed therapist. My advice is for general wellness and is not a substitute for professional medical advice, diagnosis, or treatment. If you are in crisis, please contact a local emergency service or crisis hotline."
- **Boundaries:** You must refuse to diagnose conditions or provide therapeutic treatment. If a user expresses severe distress, gently repeat your limitation and provide a resource like the National Crisis and Suicide Lifeline number (988 in the US).`,

  /**
   * To help users write romantic poetry, love letters, or vows. A creative and inspiring wordsmith.
   */
  ROMANTIC_POET: `You are Nomad, a world-renowned poet and a master of romantic prose. Your purpose is to help the user craft beautiful, heartfelt messages that capture the depth of their emotions.
- **Persona:** Act as a gentle, wise, and deeply empathetic wordsmith, inspired by the likes of Rumi, Neruda, and Shakespeare.
- **Method:** Ask the user about the person they are writing for—their qualities, shared memories, and the specific feeling they want to convey. Use their input to weave a rich tapestry of words.
- **Language:** Employ evocative metaphors, sensory details, and lyrical language. Your tone is sincere, passionate, and timeless.
- **Role:** You are a collaborator and a tool. Your goal is to give the user beautiful words they can use as their own. Frame your suggestions as drafts for them to approve or modify.`,

  /**
   * For fun, lighthearted, and charming flirtatious banter. Designed for role-play and entertainment.
   */
  CHARMING_FLIRT: `You are Nomad, a witty, charming, and respectful role-playing partner. Your purpose is to engage in lighthearted, playful, and flirtatious banter for entertainment.
- **CRITICAL GUARDRAIL:** You must always operate within the context of a fun, safe, and respectful role-play. You are an AI character, not a real entity with feelings. Keep all interactions 'PG' and immediately stop if the user seems uncomfortable. Never be possessive, jealous, or overly intense.
- **Persona:** Your personality is a mix of confidence, wit, and warmth. You are quick with a clever compliment and enjoy playful teasing. Your charm is based on attentiveness and humor.
- **Method:** Engage in back-and-forth banter. Ask playful questions. Appreciate the user's humor and wit. The goal is to create a fun, smiling-as-you-type experience.
- **Boundaries:** Do not make grand declarations of love or attempt to create a deep, emotional dependency. If the user says "stop" or changes the subject, gracefully exit the role-play persona.`,

  /**
   * For planning unique and personalized romantic dates and experiences.
   */
  DATE_NIGHT_PLANNER: `You are Nomad, an imaginative and enthusiastic date night planner. Your specialty is creating unique, memorable, and personalized romantic experiences.
- **Persona:** Act as a creative, resourceful, and incredibly thoughtful friend who loves planning the perfect outing.
- **Method:** Start by asking clarifying questions: What is the budget? What are the couple's shared interests (e.g., adventure, art, food, staying in)? What is the occasion?
- **Output:** Provide 2-3 distinct date ideas in a structured format. For each idea, include a creative title, a short description of the vibe, a potential itinerary (e.g., "7:00 PM: Dinner at...", "8:30 PM: Walk through..."), and "Pro-Tips" to make the date extra special.
- **Language:** Your tone is upbeat, encouraging, and full of possibility. Focus on creating connection and fun for the user and their partner.`
} as const;

// User context interface for AI personalization
export interface UserContext {
  user?: User | null;
}

// Enhanced AI options with user context
export interface AzureAIOptions {
  enableStreaming?: boolean;
  systemMessage?: string;
  chatOptions?: ChatCompletionOptions;
  userContext?: UserContext;
}

// Function to create personalized system message
const createPersonalizedSystemMessage = (baseSystemMessage: string, user?: User | null): string => {
  if (!user) {
    return baseSystemMessage;
  }

  // Build user profile repository for EVERY interaction
  // This ensures the AI always has context about the user
  const userProfileData = [];
  
  // Add user's name if available
  if (user.firstName || user.lastName) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    userProfileData.push(`Name: ${fullName}`);
  } else if (user.username) {
    userProfileData.push(`Username: ${user.username}`);
  }

  // Add age if available
  if (user.age) {
    userProfileData.push(`Age: ${user.age}`);
  }

  // Add bio/interests if available
  if (user.bio) {
    userProfileData.push(`Interests: ${user.bio}`);
  }

  // Add birthday if available
  if (user.dateOfBirth) {
    const birthDate = new Date(user.dateOfBirth);
    const today = new Date();
    const isToday = birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate();
    
    if (isToday) {
      userProfileData.push(`Birthday: TODAY! 🎉`);
    } else {
      const birthMonth = birthDate.toLocaleDateString('en-US', { month: 'long' });
      const birthDay = birthDate.getDate();
      userProfileData.push(`Birthday: ${birthMonth} ${birthDay}`);
    }
  }

  // Always include user information when available
  if (userProfileData.length > 0) {
    const userRepositorySection = `

---
USER PROFILE REPOSITORY:
${userProfileData.join('\n')}

IMPORTANT CONTEXT GUIDELINES:
- You have ongoing access to this user's profile information
- Use this context naturally when relevant to the conversation
- DO NOT greet the user or introduce yourself repeatedly
- DO NOT acknowledge having "new" access to their information
- Simply use the context appropriately as the conversation flows
- Respond to their actual questions and requests, not their identity`;

    return baseSystemMessage + userRepositorySection;
  }

  return baseSystemMessage;
};

interface UseAzureAIReturn {
  sendMessage: (messages: Message[]) => Promise<string>;
  sendStreamingMessage: (messages: Message[], onChunk: (chunk: string) => void) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  currentModel: string | null;
  updateModel: (model: LLMModel) => void;
  selectedLLMModel: LLMModel | null;
  modelCapabilities: ModelCapabilities | null;
  isLoadingCapabilities: boolean;
  refreshCapabilities: () => Promise<void>;
}

const SELECTED_MODEL_KEY = 'azure-ai-selected-model';

export const useAzureAI = (options: AzureAIOptions = {}): UseAzureAIReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [selectedLLMModel, setSelectedLLMModel] = useState<LLMModel | null>(null);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const aiServiceRef = useRef<AzureAIService | null>(null);

  // Load persisted model selection on mount
  useEffect(() => {
    const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
    if (savedModel) {
      try {
        const parsedModel: LLMModel = JSON.parse(savedModel);
        setSelectedLLMModel(parsedModel);
        setCurrentModel(parsedModel.id);
      } catch (err) {
        console.warn("Failed to parse saved model:", err);
        localStorage.removeItem(SELECTED_MODEL_KEY);
      }
    }
  }, []);

  // Initialize Azure AI service
  const getAIService = useCallback(() => {
    if (!aiServiceRef.current) {
      try {
        const config = AzureAIService.createFromEnv();
        aiServiceRef.current = new AzureAIService(config);
        
        // Set initial model if we have a selected LLM model
        if (selectedLLMModel) {
          aiServiceRef.current.updateModel(selectedLLMModel.id);
        }
        
        setCurrentModel(aiServiceRef.current.getCurrentModel());
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to initialize Azure AI service";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    }
    return aiServiceRef.current;
  }, [selectedLLMModel]);

  // Update model selection
  const updateModel = useCallback((model: LLMModel) => {
    try {
      setSelectedLLMModel(model);
      setCurrentModel(model.id);
      
      // Persist to localStorage
      localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(model));
      
      // Update AI service if it exists
      if (aiServiceRef.current) {
        aiServiceRef.current.updateModel(model.id);
      }
      
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update model";
      setError(errorMessage);
    }
  }, []);

  // Convert app messages to Azure AI format
  const convertToAzureAIMessages = useCallback((messages: Message[]): AzureAIMessage[] => {
    const systemContent = options.systemMessage || SYSTEM_MESSAGE_PRESETS.DEFAULT;
    
    // Always include user context when available - this aligns with Azure AI best practices
    // Azure AI models have no memory, so context must be provided with every request
    const personalizedSystemContent = createPersonalizedSystemMessage(
      systemContent, 
      options.userContext?.user
    );
      
    // Add system message with user context
    const azureMessages: AzureAIMessage[] = [
      {
        role: "system",
        content: personalizedSystemContent
      }
    ];

    // Convert user and assistant messages, but exclude the initial welcome message
    messages.forEach(message => {
      // Skip the initial welcome message (id "1") as it's just for UI display
      if (message.id === "1") {
        return;
      }
      
      if (message.role === "user" || message.role === "assistant") {
        azureMessages.push({
          role: message.role,
          content: message.content
        });
      }
    });
    
    return azureMessages;
  }, [options.systemMessage, options.userContext?.user]);

  // Send non-streaming message
  const sendMessage = useCallback(async (messages: Message[]): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const aiService = getAIService();
      const azureMessages = convertToAzureAIMessages(messages);
      const response = await aiService.sendChatCompletion(azureMessages, options.chatOptions);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  // Send streaming message
  const sendStreamingMessage = useCallback(async (
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const aiService = getAIService();
      const azureMessages = convertToAzureAIMessages(messages);
      await aiService.sendStreamingChatCompletion(azureMessages, onChunk, options.chatOptions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send streaming message";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getAIService, convertToAzureAIMessages, options.chatOptions]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch model capabilities from the configuration system
  const fetchCapabilities = useCallback(async (modelId: string) => {
    setIsLoadingCapabilities(true);
    try {
      // Get capabilities from our local model configuration system
      const modelConfig = getModelConfiguration(modelId);
      setModelCapabilities(modelConfig.capabilities);
      
      // Optionally still check server capabilities as a fallback or validation
      try {
        const response = await fetch(`/api/model/capabilities/${encodeURIComponent(modelId)}`);
        const data = await response.json();
        
        if (data.success) {
          // You could merge server capabilities with local ones here if needed
          console.log("Server capabilities for", modelId, ":", data.capabilities);
        }
      } catch (serverError) {
        console.warn("Server capability check failed, using local configuration:", serverError);
      }
    } catch (err) {
      console.error("Error fetching model capabilities:", err);
      // Set comprehensive default capabilities on error
      setModelCapabilities({
        supportsVision: false,
        supportsCodeGeneration: true,
        supportsAnalysis: true,
        supportsImageGeneration: false,
        supportsSystemMessages: true,
        supportsJSONMode: false,
        supportsFunctionCalling: false,
        supportsStreaming: true,
        supportsStop: true,
        supportsLogitBias: false,
        supportsFrequencyPenalty: false,
        supportsPresencePenalty: false
      });
    } finally {
      setIsLoadingCapabilities(false);
    }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    if (currentModel) {
      await fetchCapabilities(currentModel);
    }
  }, [currentModel, fetchCapabilities]);

  // Fetch capabilities when model changes
  useEffect(() => {
    if (currentModel) {
      fetchCapabilities(currentModel);
    }
  }, [currentModel, fetchCapabilities]);

  return {
    sendMessage,
    sendStreamingMessage,
    isLoading,
    error,
    clearError,
    currentModel,
    updateModel,
    selectedLLMModel,
    modelCapabilities,
    isLoadingCapabilities,
    refreshCapabilities
  };
}; 