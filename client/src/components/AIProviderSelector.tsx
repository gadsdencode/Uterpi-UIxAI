import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Settings, Cloud, Key, CheckCircle, AlertCircle } from 'lucide-react';
import { OpenAIService } from '../lib/openAI';
import { GeminiService } from '../lib/gemini';
import { HuggingFaceService } from '../lib/huggingface';
import { LMStudioService } from '../lib/lmstudio';

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
  connection?: 'unknown' | 'ok' | 'fail';
  connectionMessage?: string;
}

const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({
  currentProvider,
  onProviderChange
}) => {
  
  // Provider status tracking
  const [providerStatus, setProviderStatus] = useState<Record<AIProvider, ProviderStatus>>({
    azure: { configured: true }, // Azure is always configured via env vars
    openai: { configured: false },
    gemini: { configured: false },
    huggingface: { configured: false },
    uterpi: { configured: false },
    lmstudio: { configured: true }
  });

  // Inline config inputs
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [hfUrl, setHfUrl] = useState('');
  const [lmstudioUrl, setLmstudioUrl] = useState('');
  const [lmstudioApiKey, setLmstudioApiKey] = useState('');

  // Load stored values and compute status on mount
  useEffect(() => {
    const savedOpenaiKey = localStorage.getItem('openai-api-key') || '';
    const savedGeminiKey = localStorage.getItem('gemini-api-key') || '';
    const savedHfToken = localStorage.getItem('hf-api-token') || '';
    const savedHfUrl = localStorage.getItem('hf-endpoint-url') || '';
    const savedLmstudioUrl = localStorage.getItem('lmstudio-base-url') || '';
    const savedLmstudioApiKey = localStorage.getItem('lmstudio-api-key') || '';

    setOpenaiKey(savedOpenaiKey);
    setGeminiKey(savedGeminiKey);
    setHfToken(savedHfToken);
    setHfUrl(savedHfUrl);
    setLmstudioUrl(savedLmstudioUrl);
    setLmstudioApiKey(savedLmstudioApiKey);

    const updateStatus = () => {
      const uterpiConfigured = !!(import.meta as any).env?.VITE_UTERPI_API_TOKEN && !!(import.meta as any).env?.VITE_UTERPI_ENDPOINT_URL;
      setProviderStatus({
        azure: { configured: true, connection: 'unknown' },
        openai: { configured: !!savedOpenaiKey, hasApiKey: !!savedOpenaiKey, connection: 'unknown' },
        gemini: { configured: !!savedGeminiKey, hasApiKey: !!savedGeminiKey, connection: 'unknown' },
        huggingface: { configured: !!savedHfToken && !!savedHfUrl, hasApiKey: !!savedHfToken, hasEndpoint: !!savedHfUrl, connection: 'unknown' },
        uterpi: { configured: uterpiConfigured, connection: 'unknown' },
        lmstudio: { configured: true, hasEndpoint: !!savedLmstudioUrl, connection: 'unknown' }
      });
    };
    updateStatus();

    const handleStorageChange = () => updateStatus();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleProviderSelect = (provider: AIProvider) => {
    onProviderChange(provider);
  };

  // Persist helper
  const persist = (key: string, value: string) => {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  };

  // Debounced connection test
  const [pendingTestProvider, setPendingTestProvider] = useState<AIProvider | null>(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!pendingTestProvider) return;
      const p = pendingTestProvider;
      setPendingTestProvider(null);
      try {
        if (p === 'openai' && openaiKey) {
          setProviderStatus(prev => ({ ...prev, openai: { ...prev.openai, connection: 'unknown', connectionMessage: 'Testing…' } }));
          const svc = new OpenAIService({ apiKey: openaiKey.trim(), modelName: 'gpt-4o-mini' });
          await svc.sendChatCompletion([
            { role: 'system', content: 'Connectivity test' },
            { role: 'user', content: 'ping' }
          ], { maxTokens: 5 });
          setProviderStatus(prev => ({ ...prev, openai: { ...prev.openai, connection: 'ok', connectionMessage: 'Connected' } }));
        }
        if (p === 'gemini' && geminiKey) {
          setProviderStatus(prev => ({ ...prev, gemini: { ...prev.gemini, connection: 'unknown', connectionMessage: 'Testing…' } }));
          const svc = new GeminiService({ apiKey: geminiKey.trim(), modelName: 'gemini-2.5-flash' });
          await svc.sendChatCompletion([
            { role: 'system', content: 'Connectivity test' },
            { role: 'user', content: 'ping' }
          ], { maxTokens: 5 });
          setProviderStatus(prev => ({ ...prev, gemini: { ...prev.gemini, connection: 'ok', connectionMessage: 'Connected' } }));
        }
        if (p === 'huggingface' && hfToken && hfUrl) {
          setProviderStatus(prev => ({ ...prev, huggingface: { ...prev.huggingface, connection: 'unknown', connectionMessage: 'Testing…' } }));
          const svc = new HuggingFaceService({ endpointUrl: hfUrl.trim(), apiToken: hfToken.trim(), modelName: 'hf-endpoint' });
          await svc.sendChatCompletion([
            { role: 'system', content: 'Connectivity test' },
            { role: 'user', content: 'ping' }
          ], { maxTokens: 5 });
          setProviderStatus(prev => ({ ...prev, huggingface: { ...prev.huggingface, connection: 'ok', connectionMessage: 'Connected' } }));
        }
        if (p === 'lmstudio') {
          setProviderStatus(prev => ({ ...prev, lmstudio: { ...prev.lmstudio, connection: 'unknown', connectionMessage: 'Testing…' } }));
          const cfg = LMStudioService.createWithModel(LMStudioService.getAvailableModels()[0].id);
          const baseUrl = (lmstudioUrl || cfg.baseUrl) as string | undefined;
          const apiKey = (lmstudioApiKey || cfg.apiKey) as string;
          const svc = new LMStudioService({ ...cfg, baseUrl, apiKey });
          await svc.sendChatCompletion([
            { role: 'system', content: 'Connectivity test' },
            { role: 'user', content: 'ping' }
          ], { maxTokens: 5 });
          setProviderStatus(prev => ({ ...prev, lmstudio: { ...prev.lmstudio, connection: 'ok', connectionMessage: 'Connected' } }));
        }
      } catch (err: any) {
        const msg = err?.message || 'Connection failed';
        if (p === 'openai') setProviderStatus(prev => ({ ...prev, openai: { ...prev.openai, connection: 'fail', connectionMessage: msg } }));
        if (p === 'gemini') setProviderStatus(prev => ({ ...prev, gemini: { ...prev.gemini, connection: 'fail', connectionMessage: msg } }));
        if (p === 'huggingface') setProviderStatus(prev => ({ ...prev, huggingface: { ...prev.huggingface, connection: 'fail', connectionMessage: msg } }));
        if (p === 'lmstudio') setProviderStatus(prev => ({ ...prev, lmstudio: { ...prev.lmstudio, connection: 'fail', connectionMessage: msg } }));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [pendingTestProvider, openaiKey, geminiKey, hfToken, hfUrl, lmstudioUrl, lmstudioApiKey]);

  const StatusBadge: React.FC<{ status: ProviderStatus; isActive: boolean }> = ({ status, isActive }) => {
    if (isActive) {
      return <Badge className="bg-green-600 text-white"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
    }
    if (status.configured) {
      return <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
    }
    return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Setup Required</Badge>;
  };

  const ConnectionNote: React.FC<{ status?: ProviderStatus }> = ({ status }) => {
    if (!status) return null;
    if (status.connection === 'ok') return <p role="status" aria-live="polite" className="text-xs text-emerald-500">{status.connectionMessage || 'Connected'}</p>;
    if (status.connection === 'fail') return <p role="status" aria-live="polite" className="text-xs text-red-500">{status.connectionMessage || 'Connection failed'}</p>;
    if (status.connectionMessage) return <p role="status" aria-live="polite" className="text-xs text-slate-400">{status.connectionMessage}</p>;
    return null;
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
      description: 'Uterpi AI via LM Studio (Recommended)',
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
            Choose your preferred AI provider. Uterpi via LM Studio is recommended and works out-of-the-box. OpenAI and Gemini require API keys; Hugging Face requires both an API token and endpoint URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="AI providers" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
                  role="radio"
                  aria-checked={isActive}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleProviderSelect(provider.id);
                    }
                  }}
                  onClick={() => handleProviderSelect(provider.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-2 rounded-lg ${colorMap[provider.color]}`}>
                        {provider.icon}
                      </div>
                      <div className="flex items-center gap-2">
                        {provider.id === 'lmstudio' && (
                          <Badge className="bg-amber-500 text-white">Recommended</Badge>
                        )}
                        <StatusBadge status={status} isActive={isActive} />
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-lg mb-2">{provider.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      {provider.description}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {provider.id === 'azure' && 'Ready to use.'}
                      {provider.id === 'lmstudio' && 'Ready to use. Recommended.'}
                      {provider.id === 'uterpi' && 'Ready to use. Managed.'}
                      {provider.id === 'openai' && 'Enter API key to start.'}
                      {provider.id === 'gemini' && 'Enter API key to start.'}
                      {provider.id === 'huggingface' && 'Enter endpoint URL and API token.'}
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
                    
                    <div className="mt-4" aria-label={`${provider.name} configuration`}>
                      {isActive && (
                        <div className="space-y-3 p-3 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-slate-700/60">
                          {provider.id === 'azure' && (
                            <p className="text-sm text-slate-500">Azure AI is pre-configured. No setup needed.</p>
                          )}
                          {provider.id === 'openai' && (
                            <div className="space-y-2">
                              <Label htmlFor="openai-key" className="text-sm">OpenAI API Key</Label>
                              <Input id="openai-key" type="password" placeholder="sk-..." value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} onBlur={() => {
                                const v = openaiKey.trim();
                                persist('openai-api-key', v);
                                setProviderStatus(prev => ({ ...prev, openai: { ...prev.openai, configured: !!v, hasApiKey: !!v } }));
                                setPendingTestProvider('openai');
                              }} />
                              <ConnectionNote status={providerStatus.openai} />
                            </div>
                          )}
                          {provider.id === 'gemini' && (
                            <div className="space-y-2">
                              <Label htmlFor="gemini-key" className="text-sm">Gemini API Key</Label>
                              <Input id="gemini-key" type="password" placeholder="AI..." value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} onBlur={() => {
                                const v = geminiKey.trim();
                                persist('gemini-api-key', v);
                                setProviderStatus(prev => ({ ...prev, gemini: { ...prev.gemini, configured: !!v, hasApiKey: !!v } }));
                                setPendingTestProvider('gemini');
                              }} />
                              <ConnectionNote status={providerStatus.gemini} />
                            </div>
                          )}
                          {provider.id === 'huggingface' && (
                            <div className="space-y-2">
                              <div className="space-y-2">
                                <Label htmlFor="hf-url" className="text-sm">Endpoint URL</Label>
                                <Input id="hf-url" type="text" placeholder="https://..." value={hfUrl} onChange={(e) => setHfUrl(e.target.value)} onBlur={() => {
                                  const v = hfUrl.trim();
                                  persist('hf-endpoint-url', v);
                                  setProviderStatus(prev => ({ ...prev, huggingface: { ...prev.huggingface, hasEndpoint: !!v, configured: !!v && !!hfToken.trim() } }));
                                  setPendingTestProvider('huggingface');
                                }} />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="hf-token" className="text-sm">API Token</Label>
                                <Input id="hf-token" type="password" placeholder="hf_..." value={hfToken} onChange={(e) => setHfToken(e.target.value)} onBlur={() => {
                                  const v = hfToken.trim();
                                  persist('hf-api-token', v);
                                  setProviderStatus(prev => ({ ...prev, huggingface: { ...prev.huggingface, hasApiKey: !!v, configured: !!v && !!hfUrl.trim() } }));
                                  setPendingTestProvider('huggingface');
                                }} />
                              </div>
                              <ConnectionNote status={providerStatus.huggingface} />
                            </div>
                          )}
                          {provider.id === 'lmstudio' && (
                            <div className="space-y-2">
                              <div className="space-y-2">
                                <Label htmlFor="lmstudio-url" className="text-sm">Base URL (optional)</Label>
                                <Input id="lmstudio-url" type="text" placeholder="/lmstudio or https://lmstudio.uterpi.com" value={lmstudioUrl} onChange={(e) => setLmstudioUrl(e.target.value)} onBlur={() => {
                                  const v = lmstudioUrl.trim();
                                  persist('lmstudio-base-url', v);
                                  setProviderStatus(prev => ({ ...prev, lmstudio: { ...prev.lmstudio, hasEndpoint: !!v } }));
                                  setPendingTestProvider('lmstudio');
                                }} />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="lmstudio-key" className="text-sm">API Key (optional)</Label>
                                <Input id="lmstudio-key" type="password" placeholder="lm-studio" value={lmstudioApiKey} onChange={(e) => setLmstudioApiKey(e.target.value)} onBlur={() => {
                                  const v = lmstudioApiKey.trim();
                                  persist('lmstudio-api-key', v);
                                  setPendingTestProvider('lmstudio');
                                }} />
                              </div>
                              <ConnectionNote status={providerStatus.lmstudio} />
                              <p className="text-xs text-slate-500">Uterpi AI runs locally via LM Studio. This is the default and recommended setup.</p>
                            </div>
                          )}
                          {provider.id === 'uterpi' && (
                            <p className="text-sm text-slate-500">Managed Uterpi endpoint. Credentials are provided by the app environment.</p>
                          )}
                        </div>
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
              {currentProvider === 'lmstudio' 
                ? ' Uterpi via LM Studio is recommended and ready to use.' 
                : currentProvider === 'azure' ? ' Azure AI is pre-configured and ready to use.' : ' If required, configure credentials above.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default AIProviderSelector; 