import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Eye, EyeOff, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { OpenAIService } from '../lib/openAI';

interface OpenAISettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface APIKeyStatus {
  valid?: boolean;
  testing?: boolean;
  error?: string;
}

const OpenAISettingsModal: React.FC<OpenAISettingsModalProps> = ({
  open,
  onOpenChange,
  onComplete
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [status, setStatus] = useState<APIKeyStatus>({});

  // Load existing API key when modal opens
  useEffect(() => {
    if (open) {
      const savedKey = localStorage.getItem('openai-api-key');
      if (savedKey) {
        setApiKey(savedKey);
      }
    }
  }, [open]);

  // Test API key connection
  const testConnection = async () => {
    if (!apiKey.trim()) {
      setStatus({ error: 'Please enter an API key' });
      return;
    }

    setStatus({ testing: true });
    
    try {
      const service = new OpenAIService({ 
        apiKey: apiKey.trim(), 
        modelName: 'gpt-4o-mini' 
      });
      
      // Test with a simple request
      await service.sendChatCompletion([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 5 });

      setStatus({ valid: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setStatus({ valid: false, error: errorMessage });
    }
  };

  // Save API key and complete setup
  const handleSave = () => {
    if (!apiKey.trim()) {
      setStatus({ error: 'Please enter an API key' });
      return;
    }

    localStorage.setItem('openai-api-key', apiKey.trim());
    onComplete();
  };

  // Handle modal close
  const handleClose = () => {
    setApiKey('');
    setStatus({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
              <span className="text-green-600 font-bold text-sm">AI</span>
            </div>
            OpenAI Setup
          </DialogTitle>
          <DialogDescription>
            Configure your OpenAI API key to access GPT models directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="openai-api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Get your API key from{' '}
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                OpenAI Platform
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          {/* Status Messages */}
          {status.error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          )}

          {status.valid === true && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Connection successful! Your OpenAI API key is working.
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={!apiKey.trim() || status.testing}
              className="flex-1"
            >
              {status.testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="flex-1"
            >
              Save & Continue
            </Button>
          </div>

          {/* Security Note */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Security:</strong> Your API key is stored locally in your browser and only used for direct requests to OpenAI's servers.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OpenAISettingsModal; 