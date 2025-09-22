import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Eye, EyeOff, CheckCircle, XCircle, Key, Settings } from 'lucide-react';
import { OpenAIService } from '../lib/openAI';
import { GeminiService } from '../lib/gemini';

interface APIKeyStatus {
  configured: boolean;
  valid?: boolean;
  error?: string;
}

const AIProviderSettings: React.FC = () => {
  // OpenAI state
  const [openaiKey, setOpenaiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [openaiStatus, setOpenaiStatus] = useState<APIKeyStatus>({ configured: false });
  const [testingOpenai, setTestingOpenai] = useState(false);

  // Gemini state
  const [geminiKey, setGeminiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<APIKeyStatus>({ configured: false });
  const [testingGemini, setTestingGemini] = useState(false);

  // Load saved API keys on mount
  useEffect(() => {
    const savedOpenaiKey = localStorage.getItem('openai-api-key');
    const savedGeminiKey = localStorage.getItem('gemini-api-key');

    if (savedOpenaiKey) {
      setOpenaiKey(savedOpenaiKey);
      setOpenaiStatus({ configured: true });
    }

    if (savedGeminiKey) {
      setGeminiKey(savedGeminiKey);
      setGeminiStatus({ configured: true });
    }
  }, []);

  // Save OpenAI API key
  const saveOpenaiKey = () => {
    if (openaiKey.trim()) {
      localStorage.setItem('openai-api-key', openaiKey.trim());
      setOpenaiStatus({ configured: true });
    } else {
      localStorage.removeItem('openai-api-key');
      setOpenaiStatus({ configured: false });
    }
  };

  // Save Gemini API key
  const saveGeminiKey = () => {
    if (geminiKey.trim()) {
      localStorage.setItem('gemini-api-key', geminiKey.trim());
      setGeminiStatus({ configured: true });
    } else {
      localStorage.removeItem('gemini-api-key');
      setGeminiStatus({ configured: false });
    }
  };

  // Test OpenAI connection
  const testOpenaiConnection = async () => {
    if (!openaiKey.trim()) {
      setOpenaiStatus({ configured: false, error: 'API key is required' });
      return;
    }

    setTestingOpenai(true);
    try {
      const service = new OpenAIService({ apiKey: openaiKey.trim(), modelName: 'gpt-4o-mini' });
      
      // Test with a simple message
      await service.sendChatCompletion([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "hello" if you can read this.' }
      ], { maxTokens: 100 }); // Increased for Gemini compatibility

      setOpenaiStatus({ configured: true, valid: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setOpenaiStatus({ configured: true, valid: false, error: errorMessage });
    } finally {
      setTestingOpenai(false);
    }
  };

  // Test Gemini connection
  const testGeminiConnection = async () => {
    if (!geminiKey.trim()) {
      setGeminiStatus({ configured: false, error: 'API key is required' });
      return;
    }

    setTestingGemini(true);
    try {
      const service = new GeminiService({ apiKey: geminiKey.trim(), modelName: 'gemini-2.5-flash' });
      
      // Test with a simple message
      await service.sendChatCompletion([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "hello" if you can read this.' }
      ], { maxTokens: 100 }); // Increased for Gemini compatibility

      setGeminiStatus({ configured: true, valid: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setGeminiStatus({ configured: true, valid: false, error: errorMessage });
    } finally {
      setTestingGemini(false);
    }
  };

  // Clear OpenAI settings
  const clearOpenaiSettings = () => {
    setOpenaiKey('');
    localStorage.removeItem('openai-api-key');
    setOpenaiStatus({ configured: false });
  };

  // Clear Gemini settings
  const clearGeminiSettings = () => {
    setGeminiKey('');
    localStorage.removeItem('gemini-api-key');
    setGeminiStatus({ configured: false });
  };

  const StatusBadge: React.FC<{ status: APIKeyStatus }> = ({ status }) => {
    if (!status.configured) {
      return <Badge variant="outline">Not Configured</Badge>;
    }
    if (status.valid === true) {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Valid</Badge>;
    }
    if (status.valid === false) {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Invalid</Badge>;
    }
    return <Badge variant="secondary">Configured</Badge>;
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          <CardTitle>AI Provider Settings</CardTitle>
        </div>
        <CardDescription>
          Configure your API keys for OpenAI and Gemini providers. These keys are stored securely in your browser's local storage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="openai" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="openai" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              OpenAI
              <StatusBadge status={openaiStatus} />
            </TabsTrigger>
            <TabsTrigger value="gemini" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Gemini
              <StatusBadge status={geminiStatus} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="openai" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openai-key">OpenAI API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="openai-key"
                      type={showOpenaiKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    >
                      {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button onClick={saveOpenaiKey} disabled={!openaiKey.trim()}>
                    Save
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenAI Platform</a>
                </p>
              </div>

              {openaiStatus.configured && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={testOpenaiConnection}
                      disabled={testingOpenai || !openaiKey.trim()}
                    >
                      {testingOpenai ? 'Testing...' : 'Test Connection'}
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={clearOpenaiSettings}
                    >
                      Clear Settings
                    </Button>
                  </div>

                  {openaiStatus.error && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>{openaiStatus.error}</AlertDescription>
                    </Alert>
                  )}

                  {openaiStatus.valid === true && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        OpenAI connection successful! You can now use OpenAI models.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="gemini" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gemini-key">Gemini API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="gemini-key"
                      type={showGeminiKey ? 'text' : 'password'}
                      placeholder="AI..."
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                    >
                      {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button onClick={saveGeminiKey} disabled={!geminiKey.trim()}>
                    Save
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Get your API key from <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>
                </p>
              </div>

              {geminiStatus.configured && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={testGeminiConnection}
                      disabled={testingGemini || !geminiKey.trim()}
                    >
                      {testingGemini ? 'Testing...' : 'Test Connection'}
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={clearGeminiSettings}
                    >
                      Clear Settings
                    </Button>
                  </div>

                  {geminiStatus.error && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>{geminiStatus.error}</AlertDescription>
                    </Alert>
                  )}

                  {geminiStatus.valid === true && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        Gemini connection successful! You can now use Gemini models.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Security Note</h4>
          <p className="text-sm text-gray-600">
            Your API keys are stored locally in your browser and never sent to our servers. 
            They are only used to make direct requests to OpenAI and Google's APIs from your browser.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AIProviderSettings; 