/**
 * AI Credits Display Component
 * Shows current balance, usage, and allows purchasing more credits
 */

import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  ShoppingCart,
  Activity,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { navigateTo } from './Router';
import { useAuth } from '@/hooks/useAuth';

interface CreditTransaction {
  id: number;
  transactionType: 'usage' | 'purchase' | 'monthly_reset' | 'bonus';
  amount: number;
  operationType?: string;
  description: string;
  createdAt: string;
}

interface CreditPackage {
  credits: number;
  price: number;
  priceId: string;
}

interface AICreditsDisplayProps {
  compact?: boolean;
  showPurchaseOption?: boolean;
  onCreditsUpdate?: (balance: number) => void;
}

export const AICreditsDisplay: React.FC<AICreditsDisplayProps> = ({
  compact = false,
  showPurchaseOption = true,
  onCreditsUpdate,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [monthlyLimit, setMonthlyLimit] = useState(1000);
  const [isTeamPooled, setIsTeamPooled] = useState(false);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [purchasingPackage, setPurchasingPackage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchCreditBalance();
      fetchCreditPackages();
      fetchSubscriptionDetails();
    }
  }, [user]);

  const fetchCreditBalance = async () => {
    try {
      const response = await fetch('/api/credits/balance', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance || 0);
        setIsTeamPooled(data.isTeamPooled || false);
        setTransactions(data.recentTransactions || []);
        onCreditsUpdate?.(data.balance || 0);
      } else {
        // If credits/balance fails, try subscription details
        const subResponse = await fetch('/api/subscription/details', {
          credentials: 'include',
        });
        
        if (subResponse.ok) {
          const subData = await subResponse.json();
          const credits = subData.features?.currentCreditsBalance || 0;
          setBalance(credits);
          onCreditsUpdate?.(credits);
        }
      }
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptionDetails = async () => {
    if (!user) {
      return; // Don't fetch if user is not authenticated
    }

    try {
      const response = await fetch('/api/subscription/details', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setMonthlyLimit(data.features.monthlyAiCredits);
      } else if (response.status === 401) {
        // User not authenticated, just return without error
        console.log('User not authenticated for subscription details');
        return;
      }
    } catch (error) {
      console.error('Error fetching subscription details:', error);
    }
  };

  const fetchCreditPackages = async () => {
    try {
      const response = await fetch('/api/credits/packages', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCreditPackages(data.packages);
      }
    } catch (error) {
      console.error('Error fetching credit packages:', error);
    }
  };

  const handlePurchaseCredits = async (packageId: string) => {
    setPurchasingPackage(packageId);
    try {
      // In a real implementation, this would open Stripe checkout
      navigateTo(`/checkout/credits?package=${packageId}`);
    } catch (error) {
      console.error('Error purchasing credits:', error);
      toast({
        title: 'Purchase Failed',
        description: 'Unable to process credit purchase. Please try again.',
      });
    } finally {
      setPurchasingPackage(null);
    }
  };

  const getUsagePercentage = () => {
    if (monthlyLimit === 0) return 0;
    return Math.min(100, ((monthlyLimit - balance) / monthlyLimit) * 100);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'usage':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'purchase':
        return <ShoppingCart className="w-4 h-4 text-green-500" />;
      case 'monthly_reset':
        return <TrendingUp className="w-4 h-4 text-blue-500" />;
      case 'bonus':
        return <Sparkles className="w-4 h-4 text-purple-500" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const formatOperationType = (type?: string) => {
    if (!type) return '';
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (loading) {
    return (
      <Card className={compact ? 'w-full' : ''}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-8 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact view for header/sidebar
  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <Coins className="w-5 h-5 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {balance.toLocaleString()} Credits
          </span>
          {isTeamPooled && (
            <span className="text-xs text-muted-foreground">Team Pool</span>
          )}
        </div>
        {balance < 100 && (
          <Badge variant="destructive" className="ml-2">Low</Badge>
        )}
      </div>
    );
  }

  // Full view for settings/dashboard
  return (
    <div className="space-y-6">
      {/* Main Balance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Coins className="w-5 h-5 mr-2" />
              AI Credits Balance
            </span>
            {isTeamPooled && (
              <Badge variant="secondary">Team Pool</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Manage your AI credits and track usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Balance Display */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold">
                {balance.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                of {monthlyLimit.toLocaleString()} monthly credits
              </p>
            </div>
            
            {showPurchaseOption && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Buy Credits
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Purchase AI Credits</DialogTitle>
                    <DialogDescription>
                      Select a credit package. Credits never expire.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {creditPackages.map((pkg) => (
                      <Card 
                        key={pkg.priceId}
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => handlePurchaseCredits(pkg.priceId)}
                      >
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold">
                            {pkg.credits.toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground">credits</p>
                          <p className="text-lg font-semibold mt-2">
                            ${pkg.price}
                          </p>
                          <Button 
                            size="sm" 
                            className="mt-2 w-full"
                            disabled={purchasingPackage === pkg.priceId}
                          >
                            {purchasingPackage === pkg.priceId ? 'Processing...' : 'Purchase'}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Usage Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Monthly Usage</span>
              <span>{getUsagePercentage().toFixed(0)}%</span>
            </div>
            <Progress value={getUsagePercentage()} className="h-2" />
          </div>

          {/* Low Balance Warning */}
          {balance < 100 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your credit balance is running low. Consider purchasing more credits to avoid interruptions.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>
            Your recent credit activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent transactions
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <div 
                  key={transaction.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    {getTransactionIcon(transaction.transactionType)}
                    <div>
                      <p className="text-sm font-medium">
                        {transaction.description}
                      </p>
                      {transaction.operationType && (
                        <p className="text-xs text-muted-foreground">
                          {formatOperationType(transaction.operationType)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(transaction.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Tips */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Usage Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <span className="text-muted-foreground mr-2">•</span>
              <span>Basic chat messages use 1 credit each</span>
            </li>
            <li className="flex items-start">
              <span className="text-muted-foreground mr-2">•</span>
              <span>Codebase analysis uses 10 credits per operation</span>
            </li>
            <li className="flex items-start">
              <span className="text-muted-foreground mr-2">•</span>
              <span>App generation uses 50 credits</span>
            </li>
            <li className="flex items-start">
              <span className="text-muted-foreground mr-2">•</span>
              <span>Premium models (GPT-4, Claude-3) use 3x credits</span>
            </li>
            <li className="flex items-start">
              <span className="text-muted-foreground mr-2">•</span>
              <span>Credits reset on the 1st of each month</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default AICreditsDisplay;
