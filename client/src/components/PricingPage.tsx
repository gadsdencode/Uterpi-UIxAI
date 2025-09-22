/**
 * Multi-tier Pricing Page Component
 */

import React, { useState, useEffect } from 'react';
import { Check, X, Sparkles, Users, Building2, CreditCard, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { navigateTo } from './Router';

interface PlanFeature {
  name: string;
  included: boolean;
  value?: string | number;
  tooltip?: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year';
  popular?: boolean;
  features: PlanFeature[];
  aiCredits: number;
  maxProjects: number;
  teamSize?: number;
  supportLevel: string;
  ctaText: string;
  disabled?: boolean;
}

const PricingPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [isGrandfathered, setIsGrandfathered] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch current subscription details
  useEffect(() => {
    fetchSubscriptionDetails();
  }, []);

  const fetchSubscriptionDetails = async () => {
    try {
      const response = await fetch('/api/subscription/details', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentPlan(data.tier);
        setIsGrandfathered(data.grandfather?.isGrandfathered || false);
      }
    } catch (error) {
      console.error('Error fetching subscription details:', error);
    }
  };

  const plans: SubscriptionPlan[] = [
    {
      id: 'free',
      name: 'Free',
      description: 'Get started with basic AI assistance',
      price: 0,
      interval: billingInterval,
      aiCredits: 100,
      maxProjects: 1,
      supportLevel: 'Community',
      ctaText: currentPlan === 'free' ? 'Current Plan' : 'Downgrade',
      disabled: currentPlan === 'free',
      features: [
        { name: 'Basic Chat Access', included: true },
        { name: 'AI Credits per Month', included: true, value: '100' },
        { name: 'Projects', included: true, value: '1' },
        { name: 'Full Codebase Context', included: false },
        { name: 'Git Integration', included: false },
        { name: 'AI Code Reviews', included: false },
        { name: 'Team Features', included: false },
        { name: 'Priority Support', included: false },
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'Perfect for individual developers',
      price: billingInterval === 'month' ? 19 : 190,
      interval: billingInterval,
      popular: true,
      aiCredits: 1000,
      maxProjects: 1,
      supportLevel: 'Email',
      ctaText: currentPlan === 'pro' ? 'Current Plan' : 'Upgrade to Pro',
      disabled: currentPlan === 'pro',
      features: [
        { name: 'Unlimited Chat & AI Providers', included: true },
        { name: 'AI Credits per Month', included: true, value: '1,000' },
        { name: 'Projects with Full Context', included: true, value: '1' },
        { name: 'Full Codebase Context', included: true },
        { name: 'Git Integration', included: true },
        { name: 'AI Code Reviews', included: true, value: '10/month' },
        { name: 'Team Features', included: false },
        { name: 'Priority Support', included: false },
      ],
    },
    {
      id: 'team',
      name: 'Team',
      description: 'Built for growing teams',
      price: billingInterval === 'month' ? 49 : 490,
      interval: billingInterval,
      aiCredits: 5000,
      maxProjects: 10,
      teamSize: 3,
      supportLevel: 'Priority Email',
      ctaText: 'Upgrade to Team',
      features: [
        { name: 'Everything in Pro', included: true },
        { name: 'AI Credits per User', included: true, value: '5,000/month' },
        { name: 'Projects per User', included: true, value: '10' },
        { name: 'Shared Workspaces', included: true },
        { name: 'Team Personas', included: true },
        { name: 'AI Code Reviews', included: true, value: '100/user/month' },
        { name: 'Team Admin Dashboard', included: true },
        { name: 'Priority Email Support', included: true },
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Advanced features for organizations',
      price: 0, // Custom pricing
      interval: billingInterval,
      aiCredits: 999999,
      maxProjects: 999999,
      supportLevel: 'Dedicated',
      ctaText: 'Contact Sales',
      features: [
        { name: 'Everything in Team', included: true },
        { name: 'Custom AI Credits Pool', included: true },
        { name: 'Unlimited Projects', included: true },
        { name: 'SAML SSO', included: true },
        { name: 'Audit Logs', included: true },
        { name: 'Data Residency Options', included: true },
        { name: 'Custom Integrations', included: true },
        { name: 'Dedicated Account Manager', included: true },
      ],
    },
  ];

  const handleSelectPlan = async (planId: string) => {
    if (!user) {
      navigateTo('/');
      return;
    }

    if (planId === 'enterprise') {
      // Redirect to contact form for enterprise
      window.location.href = 'mailto:sales@nomadai.com?subject=Enterprise Plan Inquiry';
      return;
    }

    setLoading(true);
    try {
      // Create checkout session
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          plan: planId,
          interval: billingInterval,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      
      if (data.success && data.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('Invalid checkout response');
      }
    } catch (error) {
      console.error('Error selecting plan:', error);
      toast({
        title: 'Error',
        description: 'Failed to process plan selection. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-12">
      <div className="container mx-auto px-4">
        {/* Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigateTo('/')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to NomadAI
          </Button>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-xl text-muted-foreground mb-6">
            Unlock the full potential of AI-powered development
          </p>
          
          {isGrandfathered && (
            <Badge variant="secondary" className="mb-6">
              <Sparkles className="w-4 h-4 mr-2" />
              You're grandfathered into special pricing!
            </Badge>
          )}

          {/* Billing Toggle */}
          <Tabs value={billingInterval} onValueChange={(v) => setBillingInterval(v as 'month' | 'year')}>
            <TabsList className="mx-auto">
              <TabsTrigger value="month">Monthly</TabsTrigger>
              <TabsTrigger value="year">
                Annual
                <Badge className="ml-2" variant="secondary">Save 20%</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''} 
                         ${currentPlan === plan.id ? 'ring-2 ring-primary' : ''}`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              
              {currentPlan === plan.id && (
                <Badge variant="secondary" className="absolute -top-3 right-4">
                  Current Plan
                </Badge>
              )}

              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {plan.id === 'team' && <Users className="w-5 h-5" />}
                  {plan.id === 'enterprise' && <Building2 className="w-5 h-5" />}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                
                <div className="mt-4">
                  {plan.price === 0 && plan.id !== 'enterprise' ? (
                    <div className="text-3xl font-bold">Free</div>
                  ) : plan.id === 'enterprise' ? (
                    <div className="text-2xl font-bold">Custom Pricing</div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold">
                        ${plan.price}
                        {plan.teamSize && <span className="text-sm font-normal">/user</span>}
                        <span className="text-sm font-normal">/{plan.interval}</span>
                      </div>
                      {plan.teamSize && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Minimum {plan.teamSize} users
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {/* AI Credits Highlight */}
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">AI Credits</span>
                    <Badge variant="outline">
                      {plan.aiCredits === 999999 ? 'Unlimited' : plan.aiCredits.toLocaleString()}
                    </Badge>
                  </div>
                </div>

                {/* Features List */}
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start text-sm">
                      {feature.included ? (
                        <Check className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/50 mr-2 mt-0.5 flex-shrink-0" />
                      )}
                      <span className={!feature.included ? 'text-muted-foreground/50' : ''}>
                        {feature.name}
                        {feature.value && <span className="font-medium"> - {feature.value}</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Support Level */}
                <div className="text-sm text-muted-foreground mb-4">
                  Support: <span className="font-medium">{plan.supportLevel}</span>
                </div>

                {/* CTA Button */}
                <Button 
                  className="w-full"
                  variant={plan.popular ? 'default' : 'outline'}
                  disabled={plan.disabled || loading}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {plan.ctaText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* AI Credits Add-ons Section */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="w-5 h-5 mr-2" />
              Need More AI Credits?
            </CardTitle>
            <CardDescription>
              Purchase additional credits anytime. Credits never expire.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" onClick={() => navigateTo('/settings/billing/credits')}>
                100 Credits - $1.99
              </Button>
              <Button variant="outline" onClick={() => navigateTo('/settings/billing/credits')}>
                500 Credits - $8.99
              </Button>
              <Button variant="outline" onClick={() => navigateTo('/settings/billing/credits')}>
                1,000 Credits - $15.99
              </Button>
              <Button variant="outline" onClick={() => navigateTo('/settings/billing/credits')}>
                5,000 Credits - $69.99
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feature Comparison Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Feature Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Feature</th>
                    <th className="text-center py-2">Free</th>
                    <th className="text-center py-2">Pro</th>
                    <th className="text-center py-2">Team</th>
                    <th className="text-center py-2">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['AI Credits/month', '100', '1,000', '5,000/user', 'Custom'],
                    ['Projects', '1', '1', '10/user', 'Unlimited'],
                    ['Full Codebase Context', '❌', '✅', '✅', '✅'],
                    ['Git Integration', '❌', '✅', '✅', '✅'],
                    ['AI Code Reviews', '❌', '10/month', '100/user', 'Unlimited'],
                    ['Team Workspaces', '❌', '❌', '✅', '✅'],
                    ['SSO & Audit Logs', '❌', '❌', '❌', '✅'],
                    ['Support', 'Community', 'Email', 'Priority', 'Dedicated'],
                  ].map(([feature, ...values]) => (
                    <tr key={feature} className="border-b">
                      <td className="py-2 font-medium">{feature}</td>
                      {values.map((value, idx) => (
                        <td key={idx} className="text-center py-2">
                          {value === '✅' ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : value === '❌' ? (
                            <X className="w-4 h-4 text-muted-foreground/50 mx-auto" />
                          ) : (
                            value
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PricingPage;
