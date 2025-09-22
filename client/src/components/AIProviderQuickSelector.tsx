import React, { useState, useEffect } from 'react';
import { ChevronDown, Settings, Check, AlertCircle, Sparkles, Trash2, TestTube, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { useAIProvider, AIProvider } from '../hooks/useAIProvider';
import { LLMModel } from '../types';
import { cn } from '../lib/utils';

interface ProviderConfig {
  id: AIProvider;
  name: string;
  icon: string;
  color: string;
  requiresKey?: boolean;
  keyPlaceholder?: string;
  keyPattern?: string;
  secondaryField?: {
    name: string;
    placeholder: string;
  };
}

const providers: ProviderConfig[] = [
  {
    id: 'lmstudio',
    name: 'Uterpi AI',
    icon: '🚀',
    color: 'purple',
    requiresKey: false
  },
  {
    id: 'azure',
    name: 'Azure AI',
    icon: '☁️',
    color: 'blue',
    requiresKey: false
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    color: 'green',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    keyPattern: 'sk-'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '✨',
    color: 'purple',
    requiresKey: true,
    keyPlaceholder: 'AI...',
    keyPattern: 'AI'
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    icon: '🤗',
    color: 'orange',
    requiresKey: true,
    keyPlaceholder: 'hf_...',
    keyPattern: 'hf_',
    secondaryField: {
      name: 'Endpoint URL',
      placeholder: 'https://...'
    }
  }
];

export const AIProviderQuickSelector: React.FC = () => {
  const {
    currentProvider,
    setProvider,
    selectedLLMModel,
    updateModel,
    getAvailableModels,
    isProviderConfigured
  } = useAIProvider();

  const [isOpen, setIsOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [endpointUrl, setEndpointUrl] = useState('');
  const [showConfig, setShowConfig] = useState<AIProvider | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testingConnection, setTestingConnection] = useState<AIProvider | null>(null);

  // Load stored API keys
  useEffect(() => {
    const keys: Record<string, string> = {};
    const openaiKey = localStorage.getItem('openai-api-key');
    const geminiKey = localStorage.getItem('gemini-api-key');
    const hfToken = localStorage.getItem('hf-api-token');
    const hfUrl = localStorage.getItem('hf-endpoint-url');

    if (openaiKey) keys.openai = openaiKey;
    if (geminiKey) keys.gemini = geminiKey;
    if (hfToken) keys.huggingface = hfToken;
    if (hfUrl) setEndpointUrl(hfUrl);

    setApiKeys(keys);
  }, []);

  const saveApiKey = (provider: AIProvider, key: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: key }));
    
    // Save to localStorage based on provider
    if (provider === 'openai') {
      if (key) localStorage.setItem('openai-api-key', key);
      else localStorage.removeItem('openai-api-key');
    } else if (provider === 'gemini') {
      if (key) localStorage.setItem('gemini-api-key', key);
      else localStorage.removeItem('gemini-api-key');
    } else if (provider === 'huggingface') {
      if (key) localStorage.setItem('hf-api-token', key);
      else localStorage.removeItem('hf-api-token');
    }
  };

  const saveEndpointUrl = (url: string) => {
    setEndpointUrl(url);
    if (url) localStorage.setItem('hf-endpoint-url', url);
    else localStorage.removeItem('hf-endpoint-url');
  };

  const handleProviderSelect = (provider: AIProvider, event?: React.MouseEvent) => {
    const config = providers.find(p => p.id === provider);
    
    // Check if provider needs configuration
    if (config?.requiresKey && !isProviderConfigured(provider)) {
      // Prevent dropdown from closing when configuration is needed
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      setShowConfig(provider);
      return false; // Indicate that we should not close the dropdown
    } else {
      setProvider(provider);
      // Auto-select first available model for new provider
      const models = getAvailableModels();
      if (models.length > 0 && (!selectedLLMModel || selectedLLMModel.provider !== config?.name)) {
        updateModel(models[0]);
      }
      return true; // Indicate that we can close the dropdown
    }
  };

  const handleModelSelect = (model: LLMModel) => {
    updateModel(model);
  };

  const testConnection = async (provider: AIProvider) => {
    setTestingConnection(provider);
    try {
      // Import the service dynamically based on provider
      let service: any;
      
      if (provider === 'openai' && apiKeys.openai) {
        const { OpenAIService } = await import('../lib/openAI');
        service = new OpenAIService({ apiKey: apiKeys.openai, modelName: 'gpt-4o-mini' });
      } else if (provider === 'gemini' && apiKeys.gemini) {
        const { GeminiService } = await import('../lib/gemini');
        service = new GeminiService({ apiKey: apiKeys.gemini, modelName: 'gemini-2.5-flash' });
      } else if (provider === 'huggingface' && apiKeys.huggingface && endpointUrl) {
        const { HuggingFaceService } = await import('../lib/huggingface');
        service = new HuggingFaceService({ 
          apiToken: apiKeys.huggingface, 
          endpointUrl: endpointUrl, 
          modelName: 'hf-endpoint' 
        });
      } else if (provider === 'azure') {
        toast.success('Azure AI is pre-configured and ready to use');
        setTestingConnection(null);
        return;
      } else if (provider === 'lmstudio') {
        toast.success('LM Studio is ready to use');
        setTestingConnection(null);
        return;
      } else {
        toast.error('Missing credentials for this provider');
        setTestingConnection(null);
        return;
      }

      // Test the connection
      await service.sendChatCompletion([
        { role: 'system', content: 'Connection test' },
        { role: 'user', content: 'ping' }
      ], { maxTokens: 100 }); // Increased for Gemini compatibility
      
      toast.success(`Connection successful!`);
    } catch (error) {
      toast.error(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestingConnection(null);
    }
  };

  const clearCredentials = (provider: AIProvider) => {
    // Clear from state
    setApiKeys(prev => {
      const newKeys = { ...prev };
      delete newKeys[provider];
      return newKeys;
    });

    // Clear from localStorage
    if (provider === 'openai') {
      localStorage.removeItem('openai-api-key');
    } else if (provider === 'gemini') {
      localStorage.removeItem('gemini-api-key');
    } else if (provider === 'huggingface') {
      localStorage.removeItem('hf-api-token');
      localStorage.removeItem('hf-endpoint-url');
      setEndpointUrl('');
    }

    toast.success(`Cleared ${providers.find(p => p.id === provider)?.name} credentials`);
    
    // If this was the current provider and it now needs setup, switch to a configured provider
    if (currentProvider === provider) {
      const fallbackProvider = providers.find(p => isProviderConfigured(p.id));
      if (fallbackProvider) {
        setProvider(fallbackProvider.id);
      }
    }
  };

  const currentProviderConfig = providers.find(p => p.id === currentProvider);
  const availableModels = getAvailableModels();

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 px-3 gap-2 border-slate-600 bg-slate-800/50 hover:bg-slate-700/50",
              "text-white transition-all duration-200"
            )}
          >
            <span className="text-base">{currentProviderConfig?.icon}</span>
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium">{currentProviderConfig?.name}</span>
              {selectedLLMModel && (
                <span className="text-[10px] text-slate-400 leading-tight">{selectedLLMModel.name}</span>
              )}
            </div>
            <ChevronDown className="w-3 h-3 ml-1 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent 
          align="end" 
          className="w-80 bg-slate-900 border-slate-700 text-white"
        >
          <DropdownMenuLabel className="text-xs text-slate-400">AI Provider</DropdownMenuLabel>
          
          {/* Provider Selection */}
          {providers.map(provider => {
            const isConfigured = isProviderConfigured(provider.id);
            const isSelected = currentProvider === provider.id;
            const needsSetup = provider.requiresKey && !isConfigured;
            
            return (
              <DropdownMenuItem
                key={provider.id}
                className={cn(
                  "cursor-pointer",
                  isSelected && "bg-slate-800"
                )}
                onSelect={(event) => {
                  // For providers that need setup, prevent default closing behavior
                  if (needsSetup) {
                    event.preventDefault();
                  }
                  handleProviderSelect(provider.id, event as any);
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-violet-500" />
                    )}
                    {!isSelected && (
                      <div className="w-2 h-2 rounded-full border border-slate-600" />
                    )}
                    <span>{provider.icon}</span>
                    <span className="text-sm">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {provider.requiresKey && (
                      <Badge
                        variant={isConfigured ? "default" : "outline"}
                        className={cn(
                          "text-[10px] h-4 px-1",
                          isConfigured 
                            ? "bg-green-600/20 text-green-400 border-green-600/30" 
                            : "text-slate-400 border-slate-600"
                        )}
                      >
                        {isConfigured ? "Ready" : "Setup"}
                      </Badge>
                    )}
                    {provider.id === 'lmstudio' && (
                      <Badge className="text-[10px] h-4 px-1 bg-amber-500/20 text-amber-400 border-amber-500/30">
                        Recommended
                      </Badge>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator className="bg-slate-700" />

          {/* Model Selection */}
          {availableModels.length > 1 && (
            <>
              <DropdownMenuLabel className="text-xs text-slate-400">Model</DropdownMenuLabel>
              <DropdownMenuRadioGroup 
                value={selectedLLMModel?.id} 
                onValueChange={(value) => {
                  const model = availableModels.find(m => m.id === value);
                  if (model) handleModelSelect(model);
                }}
              >
                {availableModels.map(model => (
                  <DropdownMenuRadioItem
                    key={model.id}
                    value={model.id}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col">
                        <span className="text-sm">{model.name}</span>
                        <span className="text-[10px] text-slate-400">
                          {model.contextLength.toLocaleString()} tokens
                        </span>
                      </div>
                      {model.tier && (
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "text-[10px] h-4 px-1.5 font-medium",
                            model.tier === 'standard' && "bg-slate-700/50 text-slate-300 border-slate-600",
                            model.tier === 'freemium' && "bg-emerald-900/30 text-emerald-400 border-emerald-600",
                            model.tier === 'pro' && "bg-violet-900/30 text-violet-400 border-violet-600",
                            model.tier === 'enterprise' && "bg-amber-900/30 text-amber-400 border-amber-600"
                          )}
                        >
                          {model.tier}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator className="bg-slate-700" />
            </>
          )}

          {/* Configuration Section for Selected Provider */}
          {showConfig && (
            <>
              <div className="p-3 space-y-3">
                <div className="text-xs font-medium text-slate-300">Configure {providers.find(p => p.id === showConfig)?.name}</div>
                
                {/* API Key Input */}
                {providers.find(p => p.id === showConfig)?.requiresKey && (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">API Key</Label>
                    <Input
                      type="password"
                      placeholder={providers.find(p => p.id === showConfig)?.keyPlaceholder}
                      value={apiKeys[showConfig] || ''}
                      onChange={(e) => saveApiKey(showConfig, e.target.value)}
                      className="h-8 text-xs bg-slate-800 border-slate-600 text-white"
                    />
                  </div>
                )}

                {/* Secondary Field (for HuggingFace) */}
                {showConfig === 'huggingface' && (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">Endpoint URL</Label>
                    <Input
                      type="url"
                      placeholder="https://..."
                      value={endpointUrl}
                      onChange={(e) => saveEndpointUrl(e.target.value)}
                      className="h-8 text-xs bg-slate-800 border-slate-600 text-white"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowConfig(null);
                    }}
                    className="flex-1 h-7 text-xs border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      // Now the provider is configured, we can select it
                      handleProviderSelect(showConfig);
                      setShowConfig(null);
                      // Allow dropdown to close after successful configuration
                      setIsOpen(false);
                    }}
                    disabled={
                      (providers.find(p => p.id === showConfig)?.requiresKey && !apiKeys[showConfig]) ||
                      (showConfig === 'huggingface' && !endpointUrl)
                    }
                    className="flex-1 h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Save & Use
                  </Button>
                </div>
              </div>
              <DropdownMenuSeparator className="bg-slate-700" />
            </>
          )}

          {/* Advanced Settings Toggle */}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault(); // Keep dropdown open
              setShowAdvanced(!showAdvanced);
            }}
            className="text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <Settings className="w-3 h-3 mr-2" />
                Advanced Settings
              </div>
              <ChevronRight className={cn(
                "w-3 h-3 transition-transform",
                showAdvanced && "rotate-90"
              )} />
            </div>
          </DropdownMenuItem>

          {/* Advanced Settings Content */}
          {showAdvanced && (
            <>
              <DropdownMenuSeparator className="bg-slate-700" />
              <div className="px-2 py-3 space-y-3">
                <Label className="text-xs text-slate-400">Manage Providers</Label>
                
                {providers.filter(p => p.requiresKey || p.id === currentProvider).map(provider => {
                  const isConfigured = isProviderConfigured(provider.id);
                  const isCurrent = currentProvider === provider.id;
                  const isTesting = testingConnection === provider.id;
                  
                  return (
                    <div 
                      key={provider.id} 
                      className={cn(
                        "p-2 rounded border",
                        isCurrent 
                          ? "bg-slate-800 border-violet-500/50" 
                          : "bg-slate-900/50 border-slate-700"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span>{provider.icon}</span>
                          <span className="text-xs font-medium">{provider.name}</span>
                        </div>
                        <Badge 
                          variant={isConfigured ? "default" : "outline"}
                          className="text-[9px] h-3 px-1"
                        >
                          {isConfigured ? "Configured" : "Not configured"}
                        </Badge>
                      </div>
                      
                      {isConfigured && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              testConnection(provider.id);
                            }}
                            disabled={isTesting}
                            className="flex-1 h-6 text-[10px] border-slate-600 text-slate-300 hover:bg-slate-700"
                          >
                            {isTesting ? (
                              <>Testing...</>
                            ) : (
                              <>
                                <TestTube className="w-3 h-3 mr-1" />
                                Test
                              </>
                            )}
                          </Button>
                          {provider.requiresKey && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearCredentials(provider.id);
                              }}
                              className="flex-1 h-6 text-[10px] border-red-600/50 text-red-400 hover:bg-red-900/20"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Clear
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status Indicator */}
      {currentProviderConfig && (
        <div className="flex items-center">
          {isProviderConfigured(currentProvider) ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <AlertCircle className="w-3 h-3 text-amber-400" />
          )}
        </div>
      )}
    </div>
  );
};
