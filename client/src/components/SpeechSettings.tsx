// Speech Settings Component - Configure TTS/STT options

import React, { useState, useEffect } from 'react';
import { Volume2, Mic, Settings, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { useSpeech } from '../hooks/useSpeech';
import { VoiceInfo } from '../types/speech';
import { requestMicrophonePermission } from '../lib/speech/speechUtils';

interface SpeechSettingsProps {
  onClose?: () => void;
}

const SpeechSettings: React.FC<SpeechSettingsProps> = ({ onClose }) => {
  const {
    voices,
    selectedVoice,
    setVoice,
    isAvailable,
    capabilities,
    currentProvider,
    isHTTPS,
    microphonePermission
  } = useSpeech();

  // Settings state
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [speechVolume, setSpeechVolume] = useState(1.0);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');

  // Load saved settings
  useEffect(() => {
    const savedAutoSpeak = localStorage.getItem('auto-speak-responses') === 'true';
    const savedRate = parseFloat(localStorage.getItem('speech-rate') || '1.0');
    const savedPitch = parseFloat(localStorage.getItem('speech-pitch') || '1.0');
    const savedVolume = parseFloat(localStorage.getItem('speech-volume') || '1.0');
    const savedLanguage = localStorage.getItem('speech-language') || 'en-US';
    const savedVoiceId = localStorage.getItem('speech-voice-id');

    setAutoSpeak(savedAutoSpeak);
    setSpeechRate(savedRate);
    setSpeechPitch(savedPitch);
    setSpeechVolume(savedVolume);
    setSelectedLanguage(savedLanguage);

    if (savedVoiceId && voices.length > 0) {
      const voice = voices.find(v => v.id === savedVoiceId);
      if (voice) {
        setVoice(voice);
      }
    }
  }, [voices, setVoice]);

  // Save settings
  const saveSettings = () => {
    localStorage.setItem('auto-speak-responses', autoSpeak.toString());
    localStorage.setItem('speech-rate', speechRate.toString());
    localStorage.setItem('speech-pitch', speechPitch.toString());
    localStorage.setItem('speech-volume', speechVolume.toString());
    localStorage.setItem('speech-language', selectedLanguage);
    
    if (selectedVoice) {
      localStorage.setItem('speech-voice-id', selectedVoice.id);
    }

    toast.success('Speech settings saved!');
    if (onClose) {
      onClose();
    }
  };

  // Group voices by language
  const voicesByLanguage = voices.reduce((acc, voice) => {
    const lang = voice.language || 'Unknown';
    if (!acc[lang]) {
      acc[lang] = [];
    }
    acc[lang].push(voice);
    return acc;
  }, {} as Record<string, VoiceInfo[]>);

  if (!isAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Speech Settings
          </CardTitle>
          <CardDescription>
            Speech functionality is not available in your browser or with the current AI provider.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Speech Settings
        </CardTitle>
        <CardDescription>
          Configure text-to-speech and speech-to-text options. Currently using {currentProvider} speech provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto-speak AI Responses */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-speak">Auto-speak AI Responses</Label>
            <p className="text-sm text-muted-foreground">
              Automatically read aloud AI responses
            </p>
          </div>
          <Switch
            id="auto-speak"
            checked={autoSpeak}
            onCheckedChange={setAutoSpeak}
          />
        </div>

        {/* Microphone Permission Status */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Microphone Access</Label>
            <p className="text-sm text-muted-foreground">
              {microphonePermission === 'granted' ? 'Granted' : microphonePermission === 'denied' ? 'Denied' : 'Prompt'}
              {!isHTTPS && microphonePermission !== 'granted' && (
                <span className="ml-2 text-yellow-500">HTTPS recommended</span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await requestMicrophonePermission();
              if (ok) {
                toast.success('Microphone permission granted');
              } else {
                toast.error('Microphone permission denied');
              }
            }}
          >
            {microphonePermission === 'granted' ? 'Recheck' : 'Request'}
          </Button>
        </div>

        {/* Voice Selection */}
        {voices.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="voice-select">Voice</Label>
            <Select
              value={selectedVoice?.id || ''}
              onValueChange={(value) => {
                const voice = voices.find(v => v.id === value);
                if (voice) {
                  setVoice(voice);
                }
              }}
            >
              <SelectTrigger id="voice-select">
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(voicesByLanguage).map(([language, langVoices]) => (
                  <div key={language}>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {language}
                    </div>
                    {langVoices.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name} {voice.gender && `(${voice.gender})`}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Speech Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="speech-rate">Speech Rate</Label>
            <span className="text-sm text-muted-foreground">{speechRate.toFixed(1)}x</span>
          </div>
          <Slider
            id="speech-rate"
            min={0.5}
            max={2.0}
            step={0.1}
            value={[speechRate]}
            onValueChange={([value]) => setSpeechRate(value)}
            className="w-full"
          />
        </div>

        {/* Speech Pitch */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="speech-pitch">Pitch</Label>
            <span className="text-sm text-muted-foreground">{speechPitch.toFixed(1)}</span>
          </div>
          <Slider
            id="speech-pitch"
            min={0.5}
            max={2.0}
            step={0.1}
            value={[speechPitch]}
            onValueChange={([value]) => setSpeechPitch(value)}
            className="w-full"
          />
        </div>

        {/* Speech Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="speech-volume">Volume</Label>
            <span className="text-sm text-muted-foreground">{Math.round(speechVolume * 100)}%</span>
          </div>
          <Slider
            id="speech-volume"
            min={0}
            max={1}
            step={0.1}
            value={[speechVolume]}
            onValueChange={([value]) => setSpeechVolume(value)}
            className="w-full"
          />
        </div>

        {/* Language Selection */}
        <div className="space-y-2">
          <Label htmlFor="language-select">Language</Label>
          <Select
            value={selectedLanguage}
            onValueChange={setSelectedLanguage}
          >
            <SelectTrigger id="language-select">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="en-GB">English (UK)</SelectItem>
              <SelectItem value="es-ES">Spanish</SelectItem>
              <SelectItem value="fr-FR">French</SelectItem>
              <SelectItem value="de-DE">German</SelectItem>
              <SelectItem value="it-IT">Italian</SelectItem>
              <SelectItem value="pt-BR">Portuguese (Brazil)</SelectItem>
              <SelectItem value="ru-RU">Russian</SelectItem>
              <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
              <SelectItem value="ja-JP">Japanese</SelectItem>
              <SelectItem value="ko-KR">Korean</SelectItem>
              <SelectItem value="ar-SA">Arabic</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Capabilities Info */}
        {capabilities && (
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <h4 className="text-sm font-medium">Provider Capabilities</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${capabilities.supportsTTS ? 'bg-green-500' : 'bg-red-500'}`} />
                Text-to-Speech
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${capabilities.supportsSTT ? 'bg-green-500' : 'bg-red-500'}`} />
                Speech-to-Text
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${capabilities.supportsStreaming ? 'bg-green-500' : 'bg-red-500'}`} />
                Streaming
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${capabilities.supportsMultiLanguage ? 'bg-green-500' : 'bg-red-500'}`} />
                Multi-language
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={saveSettings}>
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SpeechSettings;
