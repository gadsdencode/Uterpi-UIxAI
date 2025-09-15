import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Settings, Cloud, Key, CheckCircle, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import OpenAISettingsModal from './OpenAISettingsModal';
import GeminiSettingsModal from './GeminiSettingsModal';
import HuggingFaceSettingsModal from './HuggingFaceSettingsModal';

export type AIProvider = 'azure' | 'openai' | 'gemini' | 'huggingface' | 'uterpi' | 'lmstudio';

interface AIProviderSelectorProps {
  currentProvider: AIProvider;
  onProviderChange: (provider: AIProvider) => void;
}

interface ProviderStatus {
  configured: boolean;
  hasApiKey?: boolean;
  hasEndpoint?: boolean; // for Hugging Face
  error?: string;
}

const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  currentProvider,
  onProviderChange
}) => {
  const [showOpenAISettings, setShowOpenAISettings] = useState(false);
  const [showGeminiSettings, setShowGeminiSettings] = useState(false);
  const [showHFSettings, setShowHFSettings] = useState(false);
  
  // Provider status tracking
  const [providerStatus, setProviderStatus] = useState<Record<AIProvider, ProviderStatus>>({
    azure: { configured: true }, // Azure is always configured via env vars
    openai: { configured: false },
    gemini: { configured: false },
    huggingface: { configured: false },
    uterpi: { configured: false },
    lmstudio: { configured: true }
  });

  // Check provider configurations on mount
  useEffect(() => {
    const checkProviderStatus = () => {
      const openaiKey = localStorage.getItem('openai-api-key');
      const geminiKey = localStorage.getItem('gemini-api-key');
      const hfToken = localStorage.getItem('hf-api-token');
      const hfUrl = localStorage.getItem('hf-endpoint-url');
      const lmstudioUrl = localStorage.getItem('lmstudio-base-url');
      
      setProviderStatus({
        azure: { configured: true }, // Azure is always ready
        openai: { configured: !!openaiKey, hasApiKey: !!openaiKey },
        gemini: { configured: !!geminiKey, hasApiKey: !!geminiKey },
        huggingface: { configured: !!hfToken && !!hfUrl, hasApiKey: !!hfToken, hasEndpoint: !!hfUrl },
        uterpi: { configured: !!(import.meta as any).env?.VITE_UTERPI_API_TOKEN && !!(import.meta as any).env?.VITE_UTERPI_ENDPOINT_URL },
        lmstudio: { configured: true, hasEndpoint: !!lmstudioUrl }
      });
    };

    checkProviderStatus();
    
    // Listen for storage changes to update status
    const handleStorageChange = () => checkProviderStatus();
    window.addEventListener('storage', handleStorageChange);
    
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [showOpenAISettings, showGeminiSettings, showHFSettings]);

  const handleProviderSelect = (provider: AIProvider) => {
    const status = providerStatus[provider];
    
    if (provider === 'azure') {
      // Azure is always ready
      onProviderChange(provider);
    } else if (status.configured) {
      // Provider has API key configured
      onProviderChange(provider);
    } else {
      // Provider needs configuration
      if (provider === 'openai') {
        setShowOpenAISettings(true);
      } else if (provider === 'gemini') {
        setShowGeminiSettings(true);
      } else if (provider === 'huggingface') {
        setShowHFSettings(true);
      } else if (provider === 'uterpi') {
        // No settings modal; credentials provided by app creator
        onProviderChange(provider);
      } else if (provider === 'lmstudio') {
        // LM Studio generally works out of the box on localhost
        onProviderChange(provider);
      }
    }
  };

  const handleSettingsComplete = (provider: AIProvider) => {
    // Switch to the provider after settings are configured
    onProviderChange(provider);
    if (provider === 'openai') {
      setShowOpenAISettings(false);
    } else if (provider === 'gemini') {
      setShowGeminiSettings(false);
    } else if (provider === 'huggingface') {
      setShowHFSettings(false);
    }
  };

  const StatusBadge: React.FC<{ status: ProviderStatus; isActive: boolean }> = ({ status, isActive }) => {
    if (isActive) {
      return <Badge className="bg-green-600 text-white"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
    }
    if (status.configured) {
      return <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
    }
    return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Setup Required</Badge>;
  };

  const providers = [
    {
      id: 'azure' as AIProvider,
      name: 'Azure AI',
      description: 'Microsoft Azure AI with enterprise-grade models',
      icon: <Cloud className="w-6 h-6" />,
      features: ['Enterprise Security', 'Pre-configured', 'Multiple Models'],
      color: 'blue'
    },
    {
      id: 'lmstudio' as AIProvider,
      name: 'Uterpi AI',
      description: 'Uterpi AI via LM Studio provider',
      icon: <Cloud className="w-6 h-6" />,
      features: ['Runs Locally', 'OpenAI-Compatible', 'No API Key Needed'],
      color: 'purple'
    },
    {
      id: 'uterpi' as AIProvider,
      name: 'Uterpi',
      description: 'Proprietary LLM. Ready out-of-the-box.',
      icon: <Cloud className="w-6 h-6" />,
      features: ['No Setup Required', 'Managed Endpoint', 'Great Defaults'],
      color: 'amber'
    },
    {
      id: 'openai' as AIProvider,
      name: 'OpenAI',
      description: 'Direct access to GPT-4, GPT-4o, and other OpenAI models',
      icon: <Key className="w-6 h-6" />,
      features: ['Latest Models', 'API Key Required', 'Vision Support'],
      color: 'green'
    },
    {
      id: 'gemini' as AIProvider,
      name: 'Google Gemini',
      description: 'Google\'s advanced multimodal AI models',
      icon: <Key className="w-6 h-6" />,
      features: ['Multimodal', 'Long Context', 'API Key Required'],
      color: 'purple'
    },
    {
      id: 'huggingface' as AIProvider,
      name: 'Hugging Face',
      description: 'Use your own HuggingFace Inference Endpoint',
      icon: <Key className="w-6 h-6" />,
      features: ['Custom Endpoint', 'API Token Required', 'Provider-Agnostic'],
      color: 'orange'
    }
  ];

  return (
    <>
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <CardTitle>AI Provider Selection</CardTitle>
          </div>
          <CardDescription>
            Choose your preferred AI provider. Azure AI is ready to use; OpenAI and Gemini require API keys; Hugging Face requires both an API token and endpoint URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {providers.map((provider) => {
              const status = providerStatus[provider.id];
              const isActive = currentProvider === provider.id;
              
              const colorMap: Record<string, string> = {
                blue: 'bg-blue-100 dark:bg-blue-900/20',
                amber: 'bg-amber-100 dark:bg-amber-900/20',
                green: 'bg-green-100 dark:bg-green-900/20',
                purple: 'bg-purple-100 dark:bg-purple-900/20',
                orange: 'bg-orange-100 dark:bg-orange-900/20'
              };

              return (
                <Card 
                  key={provider.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    isActive 
                      ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                  onClick={() => handleProviderSelect(provider.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-2 rounded-lg ${colorMap[provider.color]}`}>
                        {provider.icon}
                      </div>
                      <StatusBadge status={status} isActive={isActive} />
                    </div>
                    
                    <h3 className="font-semibold text-lg mb-2">{provider.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      {provider.description}
                    </p>
                    
                    <div className="space-y-2">
                      {provider.features.map((feature, index) => (
                        <div key={index} className="flex items-center text-sm text-gray-500">
                          <CheckCircle className="w-3 h-3 mr-2 text-green-500" />
                          {feature}
                        </div>
                      ))}
                      {provider.id === 'openai' && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${providerStatus.openai.hasApiKey ? 'bg-green-500' : 'bg-red-500'}`} />
                            API Key {providerStatus.openai.hasApiKey ? 'Present' : 'Required'}
                          </div>
                        </div>
                      )}
                      {provider.id === 'gemini' && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${providerStatus.gemini.hasApiKey ? 'bg-green-500' : 'bg-red-500'}`} />
                            API Key {providerStatus.gemini.hasApiKey ? 'Present' : 'Required'}
                          </div>
                        </div>
                      )}
                      {provider.id === 'huggingface' && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${providerStatus.huggingface.hasApiKey ? 'bg-green-500' : 'bg-red-500'}`} />
                            API Token {providerStatus.huggingface.hasApiKey ? 'Present' : 'Required'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${providerStatus.huggingface.hasEndpoint ? 'bg-green-500' : 'bg-red-500'}`} />
                            Endpoint URL {providerStatus.huggingface.hasEndpoint ? 'Present' : 'Required'}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                      {provider.id === 'azure' ? (
                        <Button 
                          variant={isActive ? "default" : "outline"} 
                          size="sm" 
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProviderSelect(provider.id);
                          }}
                        >
                          {isActive ? 'Active' : 'Select'}
                        </Button>
                      ) : (
                        <>
                          <Button 
                            variant={isActive ? "default" : "outline"} 
                            size="sm" 
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProviderSelect(provider.id);
                            }}
                          >
                            {isActive ? 'Active' : status.configured ? 'Select' : 'Setup'}
                          </Button>
                          {!status.configured && (
                            <Button 
                              variant="default" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (provider.id === 'openai') setShowOpenAISettings(true);
                                if (provider.id === 'gemini') setShowGeminiSettings(true);
                                if (provider.id === 'huggingface') setShowHFSettings(true);
                              }}
                            >
                              Configure
                            </Button>
                          )}
                          {status.configured && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (provider.id === 'openai') {
                                  setShowOpenAISettings(true);
                                } else if (provider.id === 'gemini') {
                                  setShowGeminiSettings(true);
                                } else if (provider.id === 'huggingface') {
                                  setShowHFSettings(true);
                                }
                              }}
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h4 className="font-medium mb-2">Current Selection</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You are currently using <strong>{providers.find(p => p.id === currentProvider)?.name}</strong>. 
              {currentProvider === 'azure' 
                ? ' Azure AI is pre-configured and ready to use.' 
                : ' Make sure your API key is properly configured.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* OpenAI Settings Modal */}
      <OpenAISettingsModal
        open={showOpenAISettings}
        onOpenChange={setShowOpenAISettings}
        onComplete={() => handleSettingsComplete('openai')}
      />

      {/* Gemini Settings Modal */}
      <GeminiSettingsModal
        open={showGeminiSettings}
        onOpenChange={setShowGeminiSettings}
        onComplete={() => handleSettingsComplete('gemini')}
      />

      {/* Hugging Face Settings Modal */}
      <HuggingFaceSettingsModal
        open={showHFSettings}
        onOpenChange={setShowHFSettings}
        onComplete={() => handleSettingsComplete('huggingface')}
      />
    </>
  );
};

export default AIProviderSelector; 