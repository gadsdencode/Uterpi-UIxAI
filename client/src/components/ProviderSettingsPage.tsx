import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Settings, ArrowLeft } from 'lucide-react';
import AIProviderSelector, { AIProvider } from './AIProviderSelector';
// Inline model selection replaces the modal-based selector
import { useAIProvider } from '../hooks/useAIProvider';
import { LLMModel } from '../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

interface ProviderSettingsPageProps {
  onBack?: () => void;
}

const ProviderSettingsPage: React.FC<ProviderSettingsPageProps> = ({ onBack }) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  
  const {
    currentProvider,
    setProvider,
    selectedLLMModel,
    updateModel,
    getAvailableModels,
    isProviderConfigured
  } = useAIProvider();

  const handleProviderChange = (provider: AIProvider) => {
    setProvider(provider);
  };

  const handleModelSelection = (model: LLMModel) => {
    updateModel(model);
    setShowModelSelector(false);
  };

  const providerInfo = {
    azure: {
      name: 'Azure AI',
      description: 'Enterprise-grade AI models from Microsoft Azure',
      status: isProviderConfigured('azure') ? 'Configured' : 'Setup required'
    },
    openai: {
      name: 'OpenAI',
      description: 'Direct access to GPT-4, GPT-4o, and other OpenAI models',
      status: isProviderConfigured('openai') ? 'Configured' : 'Setup required'
    },
    gemini: {
      name: 'Google Gemini',
      description: 'Google\'s advanced multimodal AI models',
      status: isProviderConfigured('gemini') ? 'Configured' : 'Setup required'
    },
    huggingface: {
      name: 'Hugging Face',
      description: 'Use your own HuggingFace Inference Endpoint',
      status: isProviderConfigured('huggingface') ? 'Configured' : 'Setup required'
    },
    uterpi: {
      name: 'Uterpi',
      description: 'Proprietary LLM. Ready out-of-the-box.',
      status: isProviderConfigured('uterpi') ? 'Configured' : 'Unavailable'
    },
    lmstudio: {
      name: 'Uterpi AI',
      description: 'Uterpi AI via LM Studio (Recommended)',
      status: isProviderConfigured('lmstudio') ? 'Configured' : 'Setup required'
    }
  };

  return (
    <div className="space-y-6">{/* Current setup summary + drawer for changes */}
      {/* Current Setup Summary */}
      <Card className="bg-slate-800/30 border-slate-700/50 mx-auto max-w-[1100px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Settings className="w-5 h-5 text-blue-400" />
            Current setup
          </CardTitle>
          <CardDescription className="text-slate-400">
            Your active provider and model
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100">{providerInfo[currentProvider].name}</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">{providerInfo[currentProvider].description}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Status: {providerInfo[currentProvider].status}</p>
            </div>
            {selectedLLMModel && (
              <div className="text-right">
                <p className="font-medium text-blue-900 dark:text-blue-100">{selectedLLMModel.name}</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">{selectedLLMModel.contextLength.toLocaleString()} tokens</p>
              </div>
            )}
          </div>
          <div className="mt-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white">Change</Button>
              </DialogTrigger>
              <DialogContent className="p-0 w-[96vw] sm:w-[92vw] max-w-[1000px] h-[min(96vh,100dvh-2rem)] flex flex-col overflow-hidden">
                <DialogHeader className="flex-none px-6 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
                  <DialogTitle>Configure AI Provider</DialogTitle>
                  <DialogDescription>Choose provider and model. Changes auto-save.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 px-6 py-4 overflow-y-auto">
                  <Accordion type="single" collapsible className="w-full" defaultValue="provider">
                    <AccordionItem value="provider">
                      <AccordionTrigger>Choose Provider</AccordionTrigger>
                      <AccordionContent>
                        <AIProviderSelector
                          currentProvider={currentProvider}
                          onProviderChange={handleProviderChange}
                        />
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="model">
                      <AccordionTrigger>Choose Model</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          {selectedLLMModel ? (
                            <div className="p-3 bg-slate-900/60 border border-slate-700/60 rounded">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-white">{selectedLLMModel.name}</div>
                                  <div className="text-xs text-slate-400">{selectedLLMModel.provider} • {selectedLLMModel.contextLength.toLocaleString()} tokens</div>
                                </div>
                                <div className="text-xs text-slate-400">{selectedLLMModel.category}</div>
                              </div>
                            </div>
                          ) : null}
                          {getAvailableModels().length > 1 ? (
                            <div className="space-y-2">
                              {getAvailableModels().map((model) => (
                                <button
                                  key={model.id}
                                  onClick={() => handleModelSelection(model)}
                                  className={`w-full text-left p-3 rounded border transition-colors ${
                                    selectedLLMModel?.id === model.id
                                      ? 'border-violet-500 bg-violet-500/10 text-white'
                                      : 'border-slate-700/60 bg-slate-900/60 text-slate-200 hover:bg-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium">{model.name}</div>
                                      <div className="text-xs text-slate-400">{model.provider} • {model.contextLength.toLocaleString()} tokens</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {model.provider.toLowerCase().includes('uterpi') && (
                                        <span className="text-amber-400 text-xs border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 rounded">Recommended</span>
                                      )}
                                      <span className="text-xs text-slate-400">{model.category}</span>
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1">{model.description}</div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">Only one model available for {providerInfo[currentProvider].name}. It is selected automatically.</p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="advanced">
                      <AccordionTrigger>Advanced</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {(Object.keys(providerInfo) as AIProvider[]).map((provider) => (
                            <div 
                              key={provider}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                provider === currentProvider 
                                  ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20' 
                                  : 'border-gray-200 bg-gray-50 dark:border-slate-700/60 dark:bg-slate-900/60'
                              }`}
                            >
                              <div>
                                <h4 className="font-medium text-slate-900 dark:text-white">{providerInfo[provider].name}</h4>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{providerInfo[provider].status}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {provider === currentProvider && (
                                  <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Active</span>
                                )}
                                <span className={`w-2 h-2 rounded-full ${isProviderConfigured(provider) ? 'bg-green-500' : 'bg-gray-400'}`} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProviderSettingsPage; 