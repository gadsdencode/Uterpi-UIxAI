import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Settings, ArrowLeft } from 'lucide-react';
import AIProviderSelector, { AIProvider } from './AIProviderSelector';
import LLMModalSelector from './LLMModelSelector';
import { useAIProvider } from '../hooks/useAIProvider';
import { LLMModel } from '../types';

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
      status: 'Always available'
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
      description: 'Use your Hugging Face Inference Endpoint',
      status: isProviderConfigured('huggingface') ? 'Configured' : 'Setup required'
    }
  };

  return (
    <div className="space-y-6">{/* Content starts immediately - header is handled by parent modal */}

      <Tabs defaultValue="providers" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 border-slate-700">
          <TabsTrigger value="providers" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700">Provider Selection</TabsTrigger>
          <TabsTrigger value="models" className="text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700">Model Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-6">
          {/* Current Status */}
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Settings className="w-5 h-5 text-blue-400" />
                Current Configuration
              </CardTitle>
              <CardDescription className="text-slate-400">
                Your current AI provider and its status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div>
                    <h3 className="font-medium text-blue-900 dark:text-blue-100">
                      Active Provider: {providerInfo[currentProvider].name}
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {providerInfo[currentProvider].description}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Status: {providerInfo[currentProvider].status}
                    </p>
                  </div>
                  {selectedLLMModel && (
                    <div className="text-right">
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        {selectedLLMModel.name}
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {selectedLLMModel.provider}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Provider Selector */}
          <AIProviderSelector
            currentProvider={currentProvider}
            onProviderChange={handleProviderChange}
          />
        </TabsContent>

        <TabsContent value="models" className="space-y-6">
          {/* Model Configuration */}
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">Model Selection</CardTitle>
              <CardDescription className="text-slate-400">
                Choose the AI model for your {providerInfo[currentProvider].name} provider
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedLLMModel ? (
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">{selectedLLMModel.name}</h3>
                        <p className="text-sm text-slate-400">
                          {selectedLLMModel.description}
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                            {selectedLLMModel.provider}
                          </span>
                          <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                            {selectedLLMModel.tier}
                          </span>
                          <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">
                            {selectedLLMModel.category}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">Performance: {selectedLLMModel.performance}%</p>
                        <p className="text-xs text-slate-400">
                          {selectedLLMModel.contextLength.toLocaleString()} tokens
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-yellow-800 dark:text-yellow-200">
                      No model selected. Please choose a model to get started.
                    </p>
                  </div>
                )}

                <Button 
                  onClick={() => setShowModelSelector(true)}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {selectedLLMModel ? 'Change Model' : 'Select Model'}
                </Button>

                {/* Available Models Count */}
                <div className="text-center">
                  <p className="text-sm text-slate-400">
                    {getAvailableModels().length} models available for {providerInfo[currentProvider].name}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Provider Status */}
          <Card className="bg-slate-800/30 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">Provider Status</CardTitle>
              <CardDescription className="text-slate-400">
                Current status of all AI providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(Object.keys(providerInfo) as AIProvider[]).map((provider) => (
                  <div 
                    key={provider}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      provider === currentProvider 
                        ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20' 
                        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
                    }`}
                  >
                    <div>
                      <h4 className="font-medium text-white">{providerInfo[provider].name}</h4>
                      <p className="text-sm text-slate-400">
                        {providerInfo[provider].status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {provider === currentProvider && (
                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                          Active
                        </span>
                      )}
                      <span className={`w-2 h-2 rounded-full ${
                        isProviderConfigured(provider) ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Model Selector Modal */}
      <LLMModalSelector
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        onSelect={handleModelSelection}
        selectedModel={selectedLLMModel}
        getAvailableModels={getAvailableModels}
      />
    </div>
  );
};

export default ProviderSettingsPage; 