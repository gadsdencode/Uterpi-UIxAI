import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { Mail, CheckCircle, Settings, ArrowRight, Heart } from 'lucide-react';

export function UnsubscribePage() {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'confirm' | 'feedback' | 'complete'>('confirm');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [token, setToken] = useState<string | null>(null);

  // Get token from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    setToken(urlToken);
  }, []);

  const unsubscribeReasons = [
    { value: 'too_frequent', label: 'Emails are too frequent' },
    { value: 'not_relevant', label: 'Content is not relevant to me' },
    { value: 'too_many_emails', label: 'I receive too many emails in general' },
    { value: 'no_longer_interested', label: 'No longer interested in NomadAI' },
    { value: 'never_signed_up', label: 'I never signed up for these emails' },
    { value: 'spam', label: 'These emails feel like spam' },
    { value: 'other', label: 'Other reason' },
  ];

  useEffect(() => {
    if (!token) {
      setError('No unsubscribe token provided. Please use the link from your email.');
    }
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/engagement/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          reason: selectedReason === 'other' ? customReason : selectedReason,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setStep('complete');
        setCompleted(true);
      } else {
        setError(data.error || 'Failed to unsubscribe. Please try again.');
      }
    } catch (error) {
      console.error('Unsubscribe error:', error);
      setError('Failed to unsubscribe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUnsubscribe = () => {
    setStep('feedback');
  };

  const handleSubmitFeedback = () => {
    handleUnsubscribe();
  };

  const handleSkipFeedback = () => {
    handleUnsubscribe();
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Mail className="w-5 h-5" />
              Invalid Link
            </CardTitle>
            <CardDescription>
              This unsubscribe link is invalid or expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Please use the unsubscribe link from your email, or contact support if you continue to have issues.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              Successfully Unsubscribed
            </CardTitle>
            <CardDescription>
              You've been unsubscribed from NomadAI emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              We're sorry to see you go! You will no longer receive marketing emails from NomadAI.
            </p>
            
            <Alert>
              <AlertDescription>
                You may still receive important account-related emails like password resets and security notifications.
              </AlertDescription>
            </Alert>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-800">
                Changed your mind?
              </p>
              <div className="flex flex-col gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/'}
                  className="justify-start"
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Return to NomadAI
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.location.href = '/profile'}
                  className="justify-start text-blue-600 hover:text-blue-700"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Email Preferences Instead
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Unsubscribe from NomadAI Emails
          </CardTitle>
          <CardDescription>
            We're sorry to see you go! Let us know how we can improve.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">
                  Before you unsubscribe...
                </h3>
                <p className="text-sm text-blue-800 mb-3">
                  Did you know you can customize which emails you receive instead of unsubscribing completely?
                </p>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = '/profile'}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Email Preferences
                </Button>
              </div>

              <Separator />

              <div className="text-center space-y-4">
                <p className="text-sm text-gray-600">
                  If you still want to unsubscribe from all emails, we understand.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => window.history.back()}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmUnsubscribe}
                    variant="destructive"
                  >
                    Continue to Unsubscribe
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'feedback' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-3">
                  Help us improve (optional)
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Your feedback helps us create better email experiences for other users.
                </p>
                
                <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
                  {unsubscribeReasons.map((reason) => (
                    <div key={reason.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={reason.value} id={reason.value} />
                      <Label 
                        htmlFor={reason.value} 
                        className="text-sm cursor-pointer"
                      >
                        {reason.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>

                {selectedReason === 'other' && (
                  <div className="mt-3">
                    <Label htmlFor="custom-reason" className="text-sm">
                      Please tell us more:
                    </Label>
                    <Textarea
                      id="custom-reason"
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Your feedback helps us improve..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex gap-3 justify-center">
                <Button
                  variant="ghost"
                  onClick={handleSkipFeedback}
                  disabled={loading}
                >
                  Skip & Unsubscribe
                </Button>
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={loading || (selectedReason === 'other' && !customReason.trim())}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loading ? 'Unsubscribing...' : 'Submit & Unsubscribe'}
                </Button>
              </div>
            </div>
          )}

          <div className="text-center pt-4 border-t">
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
              Made with <Heart className="w-3 h-3 text-red-500" /> by the NomadAI team
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 