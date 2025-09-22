import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Eye, EyeOff, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { GeminiService } from '../lib/gemini';

interface GeminiSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface APIKeyStatus {
  valid?: boolean;
  testing?: boolean;
  error?: string;
}

const GeminiSettingsModal: React.FC<GeminiSettingsModalProps> = ({
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
      const savedKey = localStorage.getItem('gemini-api-key');
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
      console.log('🔧 Testing Gemini connection with API key:', apiKey.substring(0, 10) + '...');
      
      const service = new GeminiService({ 
        apiKey: apiKey.trim(), 
        modelName: 'gemini-1.5-flash' // Use a stable model for testing
      });
      
      // Test with a simple request (Gemini needs more tokens even for simple responses)
      const response = await service.sendChatCompletion([
        { role: 'user', content: 'Say "test successful" in 3 words or less' }
      ], { maxTokens: 100 }); // Gemini needs more tokens even for short responses
      
      console.log('✅ Gemini test response:', response);
      setStatus({ valid: true });
    } catch (error) {
      console.error('❌ Gemini test failed:', error);
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

    localStorage.setItem('gemini-api-key', apiKey.trim());
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
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 font-bold text-sm">G</span>
            </div>
            Gemini Setup
          </DialogTitle>
          <DialogDescription>
            Configure your Google AI API key to access Gemini models directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gemini-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="gemini-api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder="AI..."
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
                href="https://ai.google.dev/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Google AI Studio
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
                Connection successful! Your Gemini API key is working.
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
              <strong>Security:</strong> Your API key is stored locally in your browser and only used for direct requests to Google's servers.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GeminiSettingsModal; 