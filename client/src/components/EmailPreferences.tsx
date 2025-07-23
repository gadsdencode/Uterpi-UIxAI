import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Loader2, Mail, CheckCircle, Settings, Clock, Users, Lightbulb, BarChart3 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface EmailPreferences {
  id: number;
  userId: number;
  welcomeEmails: boolean;
  reengagementEmails: boolean;
  featureUpdates: boolean;
  productTips: boolean;
  usageInsights: boolean;
  communityHighlights: boolean;
  emailFrequency: 'daily' | 'weekly' | 'monthly';
  isUnsubscribed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EngagementStats {
  engagement: {
    id: number;
    totalLogins: number;
    totalSessions: number;
    filesAnalyzed: number;
    chatMessagesCount: number;
    engagementScore: number;
    userSegment: string;
    lastActivityAt: string;
  };
  recentActivity: Array<{
    activityType: string;
    timestamp: string;
    activityData?: any;
  }>;
}

export function EmailPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      loadPreferences();
      loadStats();
    }
  }, [user]);

  const loadPreferences = async () => {
    try {
      const response = await fetch('/api/engagement/email-preferences', {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        setPreferences(data.preferences);
      } else {
        console.error('API error:', data.error);
        setMessage({ 
          type: 'error', 
          text: data.error || 'Failed to load email preferences' 
        });
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      setMessage({ 
        type: 'error', 
        text: 'Unable to load email preferences. Please try refreshing the page.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/engagement/stats', {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const updatePreferences = async (updates: Partial<EmailPreferences>) => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('/api/engagement/email-preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (data.success) {
        setPreferences(prev => prev ? { ...prev, ...updates } : null);
        setMessage({ type: 'success', text: 'Email preferences updated successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update preferences' });
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      setMessage({ type: 'error', text: 'Failed to update email preferences' });
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async (emailType: string) => {
    try {
      setMessage({ type: 'info', text: 'Sending test email...' });
      
      const response = await fetch('/api/engagement/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ emailType }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Test email sent! Check your inbox.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send test email' });
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      setMessage({ type: 'error', text: 'Failed to send test email' });
    }
  };

  const getSegmentBadge = (segment: string) => {
    const variants: Record<string, { variant: any; label: string; icon: React.ReactNode }> = {
      new: { variant: 'secondary', label: 'New User', icon: <Users className="w-3 h-3" /> },
      active: { variant: 'default', label: 'Active User', icon: <CheckCircle className="w-3 h-3" /> },
      at_risk: { variant: 'destructive', label: 'At Risk', icon: <Clock className="w-3 h-3" /> },
      dormant: { variant: 'outline', label: 'Dormant', icon: <Clock className="w-3 h-3" /> },
    };

    const config = variants[segment] || variants.new;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading email preferences...</span>
      </div>
    );
  }

  if (!preferences) {
    return (
      <Alert>
        <AlertDescription>
          Unable to load email preferences. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  const emailTypes = [
    {
      id: 'welcomeEmails',
      title: 'Welcome Emails',
      description: 'Get started guides and tips for new users',
      icon: <Mail className="w-5 h-5" />,
      enabled: preferences.welcomeEmails,
      testType: 'welcome'
    },
    {
      id: 'reengagementEmails',
      title: 'Re-engagement Emails',
      description: 'Reminders to come back when you\'ve been away',
      icon: <Users className="w-5 h-5" />,
      enabled: preferences.reengagementEmails,
      testType: 'reengagement'
    },
    {
      id: 'featureUpdates',
      title: 'Feature Updates',
      description: 'Learn about new features and improvements',
      icon: <Settings className="w-5 h-5" />,
      enabled: preferences.featureUpdates,
      testType: 'feature_discovery'
    },
    {
      id: 'productTips',
      title: 'Product Tips',
      description: 'AI productivity tips and best practices',
      icon: <Lightbulb className="w-5 h-5" />,
      enabled: preferences.productTips,
      testType: 'product_tips'
    },
    {
      id: 'usageInsights',
      title: 'Usage Insights',
      description: 'Weekly/monthly reports on your AI usage',
      icon: <BarChart3 className="w-5 h-5" />,
      enabled: preferences.usageInsights,
      testType: 'usage_insights'
    },
    {
      id: 'communityHighlights',
      title: 'Community Highlights',
      description: 'Success stories and community showcases',
      icon: <Users className="w-5 h-5" />,
      enabled: preferences.communityHighlights,
      testType: 'community'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Engagement Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Your Engagement Overview
            </CardTitle>
            <CardDescription>
              Your activity and engagement with Uterpi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.engagement?.totalSessions || 0}</div>
                <div className="text-sm text-gray-600">Sessions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.engagement?.chatMessagesCount || 0}</div>
                <div className="text-sm text-gray-600">AI Messages</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.engagement?.filesAnalyzed || 0}</div>
                <div className="text-sm text-gray-600">Files Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.engagement?.engagementScore || 0}</div>
                <div className="text-sm text-gray-600">Engagement Score</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-600">User Segment: </span>
                {getSegmentBadge(stats.engagement?.userSegment || 'new')}
              </div>
              <div className="text-sm text-gray-600">
                Last active: {stats.engagement?.lastActivityAt 
                  ? new Date(stats.engagement.lastActivityAt).toLocaleDateString()
                  : 'Never'
                }
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Message Display */}
      {message.text && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Email Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Preferences
          </CardTitle>
          <CardDescription>
            Control what emails you receive from Uterpi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Unsubscribe */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
            <div>
              <Label className="text-base font-medium">All Emails</Label>
              <p className="text-sm text-gray-600">
                {preferences.isUnsubscribed ? 'Unsubscribed from all emails' : 'Subscribed to emails'}
              </p>
            </div>
            <Switch
              checked={!preferences.isUnsubscribed}
              onCheckedChange={(checked) => 
                updatePreferences({ isUnsubscribed: !checked })
              }
              disabled={saving}
            />
          </div>

          {/* Email Frequency */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Email Frequency</Label>
              <p className="text-sm text-gray-600">How often you want to receive emails</p>
            </div>
            <Select
              value={preferences.emailFrequency}
              onValueChange={(value: 'daily' | 'weekly' | 'monthly') =>
                updatePreferences({ emailFrequency: value })
              }
              disabled={saving || preferences.isUnsubscribed}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Individual Email Types */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Email Types</h4>
            {emailTypes.map((emailType) => (
              <div key={emailType.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="text-gray-600 mt-1">{emailType.icon}</div>
                  <div>
                    <Label className="text-base font-medium">{emailType.title}</Label>
                    <p className="text-sm text-gray-600">{emailType.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => sendTestEmail(emailType.testType)}
                    disabled={!emailType.enabled || preferences.isUnsubscribed}
                    className="text-xs"
                  >
                    Test
                  </Button>
                  <Switch
                    checked={emailType.enabled && !preferences.isUnsubscribed}
                    onCheckedChange={(checked) =>
                      updatePreferences({ [emailType.id]: checked })
                    }
                    disabled={saving || preferences.isUnsubscribed}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={() => loadPreferences()}
              variant="outline"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Refresh'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Your recent interactions with NomadAI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentActivity.slice(0, 10).map((activity, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{activity.activityType.replace('_', ' ')}</span>
                  <span className="text-gray-500">
                    {new Date(activity.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 