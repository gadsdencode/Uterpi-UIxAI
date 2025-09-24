import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MonitorIcon, 
  X, 
  Check, 
  ArrowRight, 
  Download, 
  Copy, 
  Layout,
  Palette,
  Settings,
  Sparkles,
  FileText,
  Code,
  Zap,
  CreditCard,
  Brain,
  Wand2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Cpu,
  Clock,
  DollarSign
} from 'lucide-react';
import { useAIProvider } from '../hooks/useAIProvider';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/use-toast';
import { LLMModel } from '../types';

interface CreatePageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AITemplate {
  id: string;
  name: string;
  description: string;
  preview?: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedCredits: number;
  suggestedBy?: 'ai' | 'static';
  confidence?: number;
}

interface AIGenerationConfig {
  provider: string;
  model: string;
  estimatedCredits: number;
  complexity: 'simple' | 'medium' | 'complex';
}

interface CreditEstimate {
  baseCredits: number;
  complexityMultiplier: number;
  providerMultiplier: number;
  totalCredits: number;
}

interface AIAssistantSuggestion {
  id: string;
  text: string;
  type: 'requirement' | 'style' | 'component';
  confidence: number;
}

interface PageResult {
  template: string;
  components: Array<{ name: string; props: string[]; description?: string }>;
  styles: {
    theme: string;
    colors: {
      primary: string;
      secondary: string;
      accent: string;
    };
    spacing: string;
    borderRadius: string;
  };
  routes: string[];
  aiProvider: string;
  modelUsed: string;
  creditsUsed: number;
  generationTime: number;
}

interface GenerationResult {
  success: boolean;
  page: PageResult;
  files: Array<{ name: string; content: string; type: string }>;
  progressSteps?: Array<{ step: string; completed: boolean; timestamp?: number }>;
  warnings?: string[];
  suggestions?: string[];
}

const CreatePageModal: React.FC<CreatePageModalProps> = ({ isOpen, onClose }) => {
  // Enhanced step flow with AI configuration
  const [step, setStep] = useState<'discovery' | 'templates' | 'customize' | 'configure' | 'generating' | 'results'>('discovery');
  
  // AI Provider integration
  const {
    currentProvider,
    selectedLLMModel,
    isProviderConfigured,
    getAvailableModels,
    updateModel
  } = useAIProvider();
  const { user } = useAuth();
  const { toast } = useToast();

  // Enhanced state management
  const [templates, setTemplates] = useState<AITemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AITemplate | null>(null);
  const [requirements, setRequirements] = useState('');
  const [style, setStyle] = useState('modern');
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // AI-specific state
  const [aiGenerationConfig, setAiGenerationConfig] = useState<AIGenerationConfig | null>(null);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [creditEstimate, setCreditEstimate] = useState<CreditEstimate | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AIAssistantSuggestion[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ step: string; progress: number; currentTask: string }>({
    step: 'idle',
    progress: 0,
    currentTask: ''
  });

  // Initialize on mount
  useEffect(() => {
    if (isOpen) {
      initializeModal();
    }
  }, [isOpen]);

  // Initialize available models when provider changes
  useEffect(() => {
    if (currentProvider) {
      const models = getAvailableModels();
      setAvailableModels(models);
      
      // Update AI generation config
      if (selectedLLMModel) {
        updateAIGenerationConfig();
      }
    }
  }, [currentProvider, selectedLLMModel, getAvailableModels]);

  // Initialize modal with credit balance and AI setup
  const initializeModal = useCallback(async () => {
    await Promise.all([
      fetchCreditBalance(),
      fetchInitialAITemplates()
    ]);
  }, []);

  // Fetch user's credit balance
  const fetchCreditBalance = useCallback(async () => {
    try {
      const response = await fetch('/api/credits/balance', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCreditBalance(data.balance || 0);
      } else {
        // Try subscription details endpoint
        const subResponse = await fetch('/api/subscription/details', {
          credentials: 'include',
        });
        
        if (subResponse.ok) {
          const subData = await subResponse.json();
          setCreditBalance(subData.features?.currentCreditsBalance || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    }
  }, []);

  // Generate AI-powered template suggestions
  const fetchInitialAITemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      // Start with static templates as fallback
      const staticTemplates: AITemplate[] = [
        {
          id: 'landing-page',
          name: 'Landing Page',
          description: 'Professional landing page with hero section, features, and CTA',
          complexity: 'medium',
          estimatedCredits: 15,
          suggestedBy: 'static'
        },
        {
          id: 'dashboard',
          name: 'Dashboard',
          description: 'Admin dashboard with charts, tables, and navigation',
          complexity: 'complex',
          estimatedCredits: 25,
          suggestedBy: 'static'
        },
        {
          id: 'blog',
          name: 'Blog Page',
          description: 'Blog layout with articles, sidebar, and pagination',
          complexity: 'simple',
          estimatedCredits: 10,
          suggestedBy: 'static'
        },
        {
          id: 'portfolio',
          name: 'Portfolio',
          description: 'Portfolio showcase with project gallery and contact form',
          complexity: 'medium',
          estimatedCredits: 18,
          suggestedBy: 'static'
        }
      ];
      
      setTemplates(staticTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({ title: 'Error', description: 'Failed to load page templates' });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [toast]);

  // Generate AI template suggestions based on user input
  const generateAITemplateSuggestions = useCallback(async (description: string) => {
    if (!description.trim() || !isProviderConfigured(currentProvider)) {
      return;
    }

    setIsLoadingTemplates(true);
    try {
      const response = await fetch('/api/ai/generate-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          description,
          provider: currentProvider,
          model: selectedLLMModel?.id
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiTemplates: AITemplate[] = data.templates.map((t: any) => ({
          ...t,
          suggestedBy: 'ai' as const,
          confidence: t.confidence || 0.8
        }));
        
        setTemplates(prev => [...prev, ...aiTemplates]);
        toast({ title: 'AI Templates Generated', description: `Found ${aiTemplates.length} AI-suggested templates` });
      }
    } catch (error) {
      console.error('Error generating AI templates:', error);
      toast({ title: 'Warning', description: 'AI template generation failed, using static templates' });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [currentProvider, selectedLLMModel, isProviderConfigured, toast]);

  // Update AI generation configuration
  const updateAIGenerationConfig = useCallback(() => {
    if (!selectedLLMModel || !selectedTemplate) return;

    const estimate = calculateCreditEstimate(selectedTemplate.complexity, currentProvider, selectedLLMModel);
    
    const config: AIGenerationConfig = {
      provider: currentProvider,
      model: selectedLLMModel.id,
      estimatedCredits: estimate.totalCredits,
      complexity: selectedTemplate.complexity
    };

    setAiGenerationConfig(config);
    setCreditEstimate(estimate);
  }, [selectedLLMModel, selectedTemplate, currentProvider]);

  // Calculate credit estimate based on complexity and provider
  const calculateCreditEstimate = useCallback((
    complexity: 'simple' | 'medium' | 'complex',
    provider: string,
    model: LLMModel
  ): CreditEstimate => {
    const baseCredits = { simple: 10, medium: 20, complex: 35 };
    const complexityMultipliers = { simple: 1, medium: 1.5, complex: 2.5 };
    
    // Provider-specific multipliers
    const providerMultipliers: Record<string, number> = {
      'lmstudio': 0.1,  // Nearly free (local)
      'azure': 0.8,     // Moderate cost
      'openai': 1.5,    // Higher cost
      'gemini': 1.0,    // Standard cost
      'huggingface': 0.6 // Lower cost
    };

    const base = baseCredits[complexity];
    const complexityMult = complexityMultipliers[complexity];
    const providerMult = providerMultipliers[provider] || 1.0;
    
    // Add model-specific multiplier from cost property
    const modelMult = model.cost > 0 ? Math.max(0.5, model.cost * 1000) : 1.0;
    
    const total = Math.ceil(base * complexityMult * providerMult * modelMult);

    return {
      baseCredits: base,
      complexityMultiplier: complexityMult,
      providerMultiplier: providerMult * modelMult,
      totalCredits: Math.max(1, total)
    };
  }, []);

  // Generate AI assistance suggestions
  const generateAISuggestions = useCallback(async (inputText: string) => {
    if (!inputText.trim() || !isProviderConfigured(currentProvider)) {
      setAiSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const response = await fetch('/api/ai/generate-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          input: inputText,
          context: 'page-generation',
          provider: currentProvider,
          model: selectedLLMModel?.id
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [currentProvider, selectedLLMModel, isProviderConfigured]);

  // Enhanced page generation with AI integration
  const generatePage = useCallback(async () => {
    if (!selectedTemplate || !aiGenerationConfig) {
      toast({ title: 'Error', description: 'Please configure AI settings first' });
      return;
    }

    // Check credit balance
    if (creditBalance < aiGenerationConfig.estimatedCredits) {
      toast({ 
        title: 'Insufficient Credits', 
        description: `You need ${aiGenerationConfig.estimatedCredits} credits but only have ${creditBalance}` 
      });
      return;
    }

    setStep('generating');
    setGenerationProgress({ step: 'initializing', progress: 0, currentTask: 'Initializing AI generation...' });

    try {
      const startTime = Date.now();
      
      // Enhanced generation request with AI configuration
      const response = await fetch('/api/ai/generate-page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          template: selectedTemplate.id,
          requirements,
          style,
          aiConfig: aiGenerationConfig,
          userContext: {
            userId: user?.id,
            preferences: {
              complexity: selectedTemplate.complexity,
              style: style
            }
          }
        }),
      });

      if (response.ok) {
        const result: GenerationResult = await response.json();
        const generationTime = Date.now() - startTime;
        
        // Update result with generation metadata
        result.page.aiProvider = aiGenerationConfig.provider;
        result.page.modelUsed = aiGenerationConfig.model;
        result.page.generationTime = generationTime;
        
        setGenerationResult(result);
        setStep('results');
        
        // Update credit balance
        await fetchCreditBalance();
        
        toast({ 
          title: 'Page Generated Successfully!', 
          description: `Generated in ${(generationTime / 1000).toFixed(1)}s using ${aiGenerationConfig.provider}` 
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({ 
        title: 'Generation Failed', 
        description: error instanceof Error ? error.message : 'Unknown error occurred' 
      });
      setStep('configure');
    } finally {
      setGenerationProgress({ step: 'idle', progress: 0, currentTask: '' });
    }
  }, [selectedTemplate, aiGenerationConfig, creditBalance, requirements, style, user?.id, toast, fetchCreditBalance]);

  // Apply AI suggestion to requirements
  const applySuggestion = useCallback((suggestion: AIAssistantSuggestion) => {
    if (suggestion.type === 'requirement') {
      setRequirements(prev => {
        const newReq = prev ? `${prev}\n${suggestion.text}` : suggestion.text;
        return newReq;
      });
    } else if (suggestion.type === 'style') {
      // Extract style suggestion and apply it
      const styleMatch = suggestion.text.toLowerCase();
      if (styleMatch.includes('modern')) setStyle('modern');
      else if (styleMatch.includes('classic')) setStyle('classic');
      else if (styleMatch.includes('minimal')) setStyle('minimal');
      else if (styleMatch.includes('dark')) setStyle('dark');
      else if (styleMatch.includes('colorful')) setStyle('colorful');
    }
    
    toast({ title: 'AI Suggestion Applied', description: suggestion.text });
  }, [toast]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: 'Content copied to clipboard' });
  }, [toast]);

  const downloadFiles = useCallback(() => {
    if (generationResult?.files) {
      generationResult.files.forEach(file => {
        const blob = new Blob([file.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      });
      
      toast({ 
        title: 'Files Downloaded', 
        description: `Downloaded ${generationResult.files.length} files` 
      });
    }
  }, [generationResult, toast]);

  const resetModal = useCallback(() => {
    setStep('discovery');
    setSelectedTemplate(null);
    setRequirements('');
    setStyle('modern');
    setGenerationResult(null);
    setAiGenerationConfig(null);
    setCreditEstimate(null);
    setAiSuggestions([]);
    setShowAdvancedOptions(false);
    setGenerationProgress({ step: 'idle', progress: 0, currentTask: '' });
    // Reset templates to initial static set
    fetchInitialAITemplates();
  }, [fetchInitialAITemplates]);

  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [resetModal, onClose]);

  // Debounced AI suggestions generation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (requirements.trim().length > 10) {
        generateAISuggestions(requirements);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [requirements, generateAISuggestions]);

  // Update AI config when template or model changes
  useEffect(() => {
    if (selectedTemplate && selectedLLMModel) {
      updateAIGenerationConfig();
    }
  }, [selectedTemplate, selectedLLMModel, updateAIGenerationConfig]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-5xl max-h-[90vh] mx-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", duration: 0.5 }}
        >
          {/* Enhanced Header with AI Status */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg">
                <Brain className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">AI Page Generator</h2>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span>Powered by {currentProvider}</span>
                  {selectedLLMModel && (
                    <>
                      <span>•</span>
                      <span>{selectedLLMModel.name}</span>
                    </>
                  )}
                  {creditBalance > 0 && (
                    <>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        <span>{creditBalance} credits</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              title="Close modal"
              aria-label="Close AI Page Generator modal"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            {step === 'discovery' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lightbulb className="w-8 h-8 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Describe Your Vision</h3>
                  <p className="text-slate-400 max-w-md mx-auto">
                    Tell our AI what kind of page you want to create. The more specific you are, the better results you'll get.
                  </p>
                </div>

                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="relative">
                    <textarea
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      placeholder="Example: I need a modern landing page for a SaaS product with a hero section, feature highlights, pricing table, and contact form. The design should be clean and professional with a blue color scheme."
                      className="w-full h-32 p-4 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 resize-none focus:border-blue-400 focus:outline-none transition-colors"
                    />
                    {requirements.length > 0 && (
                      <div className="absolute bottom-2 right-2 text-xs text-slate-500">
                        {requirements.length} characters
                      </div>
                    )}
                  </div>

                  {requirements.trim().length > 20 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-center"
                    >
                      <motion.button
                        onClick={() => {
                          generateAITemplateSuggestions(requirements);
                          setStep('templates');
                        }}
                        className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isLoadingTemplates}
                      >
                        {isLoadingTemplates ? (
                          <>
                            <Settings className="w-4 h-4 animate-spin" />
                            Generating Templates...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4" />
                            Generate AI Templates
                          </>
                        )}
                      </motion.button>
                    </motion.div>
                  )}

                  {requirements.trim().length <= 20 && requirements.trim().length > 0 && (
                    <div className="text-center text-sm text-slate-500">
                      Please provide more details (at least 20 characters) for better AI suggestions
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 'templates' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">AI-Generated Templates</h3>
                  <p className="text-slate-400">Choose from AI-suggested templates based on your description</p>
                </div>

                {isLoadingTemplates && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <motion.div
                      className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    <p className="text-slate-400">AI is analyzing your requirements...</p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <motion.div
                      key={template.id}
                      className={`relative p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedTemplate?.id === template.id
                          ? 'border-blue-400 bg-blue-500/10'
                          : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
                      }`}
                      onClick={() => setSelectedTemplate(template)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {template.suggestedBy === 'ai' ? (
                              <Brain className="w-6 h-6 text-purple-400" />
                            ) : (
                              <Layout className="w-6 h-6 text-blue-400" />
                            )}
                            {template.suggestedBy === 'ai' && template.confidence && (
                              <div className="text-xs text-purple-400 bg-purple-500/20 px-2 py-1 rounded">
                                {Math.round(template.confidence * 100)}% match
                              </div>
                            )}
                          </div>
                          {selectedTemplate?.id === template.id && (
                            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-semibold text-white">{template.name}</h4>
                            <div className={`text-xs px-2 py-1 rounded ${
                              template.complexity === 'simple' ? 'bg-green-500/20 text-green-400' :
                              template.complexity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {template.complexity}
                            </div>
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{template.description}</p>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1 text-slate-500">
                              <DollarSign className="w-3 h-3" />
                              <span>{template.estimatedCredits} credits</span>
                            </div>
                            {template.suggestedBy === 'ai' && (
                              <div className="text-purple-400">AI Suggested</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {selectedTemplate && (
                  <div className="flex justify-center gap-3 pt-4">
                    <button
                      onClick={() => setStep('discovery')}
                      className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      Back
                    </button>
                    <motion.button
                      onClick={() => setStep('customize')}
                      className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Customize Template
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                )}
              </div>
            )}

            {step === 'customize' && selectedTemplate && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">Refine Your Requirements</h3>
                  <p className="text-slate-400">Add more details and let AI assist you</p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <FileText className="w-5 h-5 text-blue-400" />
                      Enhanced Requirements
                    </div>
                    <div className="relative">
                    <textarea
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                        placeholder="Expand on your original idea with specific features, functionality, and design preferences..."
                        className="w-full h-40 p-4 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 resize-none focus:border-blue-400 focus:outline-none"
                    />
                      {isLoadingSuggestions && (
                        <div className="absolute top-2 right-2">
                          <Settings className="w-4 h-4 text-blue-400 animate-spin" />
                        </div>
                      )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Palette className="w-5 h-5 text-blue-400" />
                      Style Theme
                    </div>
                      <div className="grid grid-cols-2 gap-2">
                      {['modern', 'classic', 'minimal', 'dark', 'colorful'].map((styleOption) => (
                        <label
                          key={styleOption}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                            style === styleOption
                              ? 'border-blue-400 bg-blue-500/10'
                              : 'border-slate-600 hover:border-slate-500'
                          }`}
                        >
                          <input
                            type="radio"
                            name="style"
                            value={styleOption}
                            checked={style === styleOption}
                            onChange={(e) => setStyle(e.target.value)}
                            className="text-blue-500"
                          />
                          <span className="text-white capitalize">{styleOption}</span>
                        </label>
                      ))}
                    </div>
                    </div>
                  </div>

                  {/* AI Assistant Panel */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Brain className="w-5 h-5 text-purple-400" />
                      AI Suggestions
                    </div>
                    
                    {aiSuggestions.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {aiSuggestions.map((suggestion) => (
                          <motion.button
                            key={suggestion.id}
                            onClick={() => applySuggestion(suggestion)}
                            className="w-full text-left p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-purple-500/50 rounded-lg transition-all"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm text-slate-300">{suggestion.text}</span>
                              <div className={`text-xs px-2 py-1 rounded ${
                                suggestion.type === 'requirement' ? 'bg-blue-500/20 text-blue-400' :
                                suggestion.type === 'style' ? 'bg-purple-500/20 text-purple-400' :
                                'bg-green-500/20 text-green-400'
                              }`}>
                                {suggestion.type}
                              </div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {Math.round(suggestion.confidence * 100)}% confidence
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    ) : requirements.trim().length > 10 ? (
                      <div className="text-center py-8 text-slate-500">
                        <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">AI is analyzing your requirements...</p>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Add more requirements to get AI suggestions</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-center gap-3 pt-4">
                  <button
                    onClick={() => setStep('templates')}
                    className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                  <motion.button
                    onClick={() => setStep('configure')}
                    className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg text-white font-medium flex items-center gap-2 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Configure AI
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            )}

            {step === 'configure' && selectedTemplate && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">AI Generation Settings</h3>
                  <p className="text-slate-400">Configure your AI model and review generation costs</p>
                </div>

                <div className="max-w-3xl mx-auto space-y-6">
                  {/* Provider and Model Selection */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-white font-medium">
                        <Cpu className="w-5 h-5 text-blue-400" />
                        AI Provider
                      </div>
                      <div className="p-4 bg-slate-800/50 border border-slate-600 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            isProviderConfigured(currentProvider) ? 'bg-green-400' : 'bg-red-400'
                          }`} />
                          <span className="text-white font-medium">{currentProvider}</span>
                          {!isProviderConfigured(currentProvider) && (
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                        {!isProviderConfigured(currentProvider) && (
                          <p className="text-sm text-red-400 mt-2">
                            Provider not configured. Please set up your API keys in settings.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-white font-medium">
                        <Brain className="w-5 h-5 text-purple-400" />
                        AI Model
                      </div>
                      <div className="relative">
                        <select
                          value={selectedLLMModel?.id || ''}
                          onChange={(e) => {
                            const model = availableModels.find(m => m.id === e.target.value);
                            if (model) updateModel(model);
                          }}
                          className="w-full p-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:border-blue-400 focus:outline-none appearance-none"
                          title="Select AI Model"
                        >
                          {availableModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name} - Performance: {model.performance}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                      {selectedLLMModel && (
                        <div className="text-sm text-slate-400">
                          <div className="flex items-center gap-4">
                            <span>Performance: {selectedLLMModel.performance}/100</span>
                            <span>Context: {selectedLLMModel.contextLength.toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cost Estimation */}
                  {creditEstimate && (
                    <div className="p-6 bg-gradient-to-br from-slate-800/50 to-slate-700/50 border border-slate-600 rounded-xl">
                      <div className="flex items-center gap-2 text-white font-medium mb-4">
                        <DollarSign className="w-5 h-5 text-green-400" />
                        Generation Cost Estimate
                      </div>
                      
                      <div className="grid md:grid-cols-4 gap-4 text-sm">
                        <div className="text-center">
                          <div className="text-slate-400">Base Cost</div>
                          <div className="text-white font-semibold">{creditEstimate.baseCredits}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-slate-400">Complexity</div>
                          <div className="text-white font-semibold">×{creditEstimate.complexityMultiplier}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-slate-400">Provider</div>
                          <div className="text-white font-semibold">×{creditEstimate.providerMultiplier.toFixed(1)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-slate-400">Total</div>
                          <div className="text-2xl font-bold text-green-400">{creditEstimate.totalCredits}</div>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Your Balance:</span>
                          <span className={`font-semibold ${
                            creditBalance >= creditEstimate.totalCredits ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {creditBalance} credits
                          </span>
                        </div>
                        {creditBalance < creditEstimate.totalCredits && (
                          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <div className="flex items-center gap-2 text-red-400 text-sm">
                              <AlertCircle className="w-4 h-4" />
                              Insufficient credits. You need {creditEstimate.totalCredits - creditBalance} more credits.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Generation Summary */}
                  <div className="p-4 bg-slate-800/50 border border-slate-600 rounded-lg">
                    <h4 className="text-white font-medium mb-3">Generation Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Template:</span>
                        <span className="text-white">{selectedTemplate.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Complexity:</span>
                        <span className={`capitalize ${
                          selectedTemplate.complexity === 'simple' ? 'text-green-400' :
                          selectedTemplate.complexity === 'medium' ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {selectedTemplate.complexity}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Style:</span>
                        <span className="text-white capitalize">{style}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Est. Time:</span>
                        <span className="text-white">
                          {selectedLLMModel ? Math.round(selectedLLMModel.latency / 1000) : 30}s
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center gap-3 pt-4">
                  <button
                    onClick={() => setStep('customize')}
                    className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Back
                  </button>
                  <motion.button
                    onClick={generatePage}
                    disabled={!isProviderConfigured(currentProvider) || !creditEstimate || creditBalance < creditEstimate.totalCredits}
                    className={`px-8 py-3 rounded-lg text-white font-medium flex items-center gap-2 transition-all ${
                      !isProviderConfigured(currentProvider) || !creditEstimate || creditBalance < (creditEstimate?.totalCredits || 0)
                        ? 'bg-slate-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                    }`}
                    whileHover={!(!isProviderConfigured(currentProvider) || !creditEstimate || creditBalance < (creditEstimate?.totalCredits || 0)) ? { scale: 1.02 } : {}}
                    whileTap={!(!isProviderConfigured(currentProvider) || !creditEstimate || creditBalance < (creditEstimate?.totalCredits || 0)) ? { scale: 0.98 } : {}}
                  >
                    <Zap className="w-4 h-4" />
                    Generate Page
                  </motion.button>
                </div>
              </div>
            )}

            {step === 'generating' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-8">
                <div className="relative">
                  <motion.div
                    className="w-20 h-20 border-4 border-gradient-to-r from-blue-500/30 to-purple-500/30 border-t-blue-500 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute inset-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Brain className="w-8 h-8 text-blue-400" />
                  </motion.div>
                </div>

                <div className="text-center max-w-md">
                  <h3 className="text-xl font-semibold text-white mb-2">AI is Generating Your Page</h3>
                  <p className="text-slate-400 mb-4">{generationProgress.currentTask}</p>
                  
                  {generationProgress.progress > 0 && (
                    <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                      <motion.div 
                        className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${generationProgress.progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  )}
                </div>

                {aiGenerationConfig && (
                  <div className="text-center space-y-2 text-sm text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <Cpu className="w-4 h-4" />
                      <span>Using {aiGenerationConfig.provider} • {aiGenerationConfig.model}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>Estimated time: {selectedLLMModel ? Math.round(selectedLLMModel.latency / 1000) : 30}s</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      <span>Cost: {aiGenerationConfig.estimatedCredits} credits</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'results' && generationResult && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Page Generated Successfully!</h3>
                  <p className="text-slate-400">Your AI-powered page is ready with all necessary files</p>
                </div>

                {/* Generation Statistics */}
                <div className="grid md:grid-cols-4 gap-4 p-4 bg-gradient-to-br from-slate-800/50 to-slate-700/50 border border-slate-600 rounded-xl">
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">Provider</div>
                    <div className="text-white font-semibold">{generationResult.page.aiProvider}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">Model</div>
                    <div className="text-white font-semibold">{generationResult.page.modelUsed}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">Time</div>
                    <div className="text-white font-semibold">{(generationResult.page.generationTime / 1000).toFixed(1)}s</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-sm">Credits Used</div>
                    <div className="text-green-400 font-semibold">{generationResult.page.creditsUsed}</div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-white font-medium flex items-center gap-2">
                      <Layout className="w-5 h-5 text-blue-400" />
                      Page Structure
                    </h4>
                    
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-800/50 rounded-lg">
                        <h5 className="font-medium text-white mb-2">Components ({generationResult.page.components.length})</h5>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {generationResult.page.components.map((comp, index) => (
                            <div key={index} className="text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-blue-400">{comp.name}</span>
                                <span className="text-xs text-slate-500">
                                  ({comp.props.join(', ')})
                                </span>
                              </div>
                              {comp.description && (
                                <div className="text-xs text-slate-400 mt-1 ml-2">
                                  {comp.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-slate-800/50 rounded-lg">
                        <h5 className="font-medium text-white mb-2">Routes ({generationResult.page.routes.length})</h5>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {generationResult.page.routes.map((route, index) => (
                            <div key={index} className="text-sm text-blue-400 font-mono">
                              {route}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-white font-medium flex items-center gap-2">
                      <Code className="w-5 h-5 text-blue-400" />
                      Generated Files ({generationResult.files.length})
                    </h4>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {generationResult.files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              file.type === 'component' ? 'bg-green-400' :
                              file.type === 'style' ? 'bg-purple-400' :
                              file.type === 'config' ? 'bg-yellow-400' :
                              'bg-blue-400'
                            }`} />
                            <span className="text-white font-mono text-sm">{file.name}</span>
                            <span className="text-xs text-slate-500 capitalize">{file.type}</span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(file.content)}
                            className="p-2 hover:bg-slate-700/50 rounded transition-colors group"
                            title="Copy file content"
                          >
                            <Copy className="w-4 h-4 text-slate-400 group-hover:text-white" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        onClick={downloadFiles}
                        className="p-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download All
                      </button>
                      <button
                        onClick={() => {
                          const allContent = generationResult.files.map(f => f.content).join('\n\n---\n\n');
                          copyToClipboard(allContent);
                        }}
                        className="p-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        Copy All
                      </button>
                    </div>
                  </div>
                </div>

                {/* AI Feedback and Suggestions */}
                {(generationResult.warnings?.length || generationResult.suggestions?.length) && (
                  <div className="grid md:grid-cols-2 gap-4">
                    {generationResult.warnings && generationResult.warnings.length > 0 && (
                      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <h5 className="flex items-center gap-2 text-yellow-400 font-medium mb-2">
                          <AlertCircle className="w-4 h-4" />
                          AI Warnings
                        </h5>
                        <div className="space-y-1">
                          {generationResult.warnings.map((warning, index) => (
                            <div key={index} className="text-sm text-yellow-300">
                              {warning}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {generationResult.suggestions && generationResult.suggestions.length > 0 && (
                      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <h5 className="flex items-center gap-2 text-blue-400 font-medium mb-2">
                          <Lightbulb className="w-4 h-4" />
                          AI Suggestions
                        </h5>
                        <div className="space-y-1">
                          {generationResult.suggestions.map((suggestion, index) => (
                            <div key={index} className="text-sm text-blue-300">
                              {suggestion}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-center gap-3 pt-4">
                  <button
                    onClick={resetModal}
                    className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Create Another
                  </button>
                  <motion.button
                    onClick={handleClose}
                    className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg text-white font-medium transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Done
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreatePageModal; 