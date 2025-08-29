import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Eye, EyeOff, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { HuggingFaceService } from '../lib/huggingface';

interface HuggingFaceSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface StatusState {
  valid?: boolean;
  testing?: boolean;
  error?: string;
}

const HuggingFaceSettingsModal: React.FC<HuggingFaceSettingsModalProps> = ({ open, onOpenChange, onComplete }) => {
  const [apiToken, setApiToken] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<StatusState>({});

  useEffect(() => {
    if (open) {
      const savedToken = localStorage.getItem('hf-api-token');
      const savedUrl = localStorage.getItem('hf-endpoint-url');
      if (savedToken) setApiToken(savedToken);
      if (savedUrl) setEndpointUrl(savedUrl);
    }
  }, [open]);

  const testConnection = async () => {
    if (!apiToken.trim() || !endpointUrl.trim()) {
      setStatus({ error: 'Please enter both API Token and Endpoint URL' });
      return;
    }
    setStatus({ testing: true });
    try {
      const service = new HuggingFaceService({ apiToken: apiToken.trim(), endpointUrl: endpointUrl.trim(), modelName: 'hf-endpoint' });
      await service.sendChatCompletion([{ role: 'user', content: 'Hello' }], { maxTokens: 5 });
      setStatus({ valid: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      setStatus({ valid: false, error: msg });
    }
  };

  const handleSave = () => {
    if (!apiToken.trim() || !endpointUrl.trim()) {
      setStatus({ error: 'Please enter both API Token and Endpoint URL' });
      return;
    }
    localStorage.setItem('hf-api-token', apiToken.trim());
    localStorage.setItem('hf-endpoint-url', endpointUrl.trim());
    onComplete();
  };

  const handleClose = () => {
    setApiToken('');
    setEndpointUrl('');
    setStatus({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
              <span className="text-orange-600 font-bold text-sm">HF</span>
            </div>
            Hugging Face Setup
          </DialogTitle>
          <DialogDescription>
            Configure your Hugging Face API token and Inference Endpoint URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hf-api-token">API Token</Label>
            <div className="relative">
              <Input
                id="hf-api-token"
                type={showToken ? 'text' : 'password'}
                placeholder="hf_xxx..."
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Create a token on{' '}
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Hugging Face Tokens
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hf-endpoint-url">Inference Endpoint URL</Label>
            <Input
              id="hf-endpoint-url"
              type="text"
              placeholder="https://your-endpoint-url..."
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              See{' '}
              <a
                href="https://huggingface.co/docs/huggingface_hub/guides/inference_endpoints"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Inference Endpoints Docs
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

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
                Connection successful! Your HuggingFace Inference Endpoint responded.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={!apiToken.trim() || !endpointUrl.trim() || status.testing}
              className="flex-1"
            >
              {status.testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button onClick={handleSave} disabled={!apiToken.trim() || !endpointUrl.trim()} className="flex-1">
              Save & Continue
            </Button>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Security:</strong> Your token and endpoint URL are stored locally in your browser and only used for direct requests to your HuggingFace Inference Endpoint.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HuggingFaceSettingsModal;


