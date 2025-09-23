import React, { useState } from 'react';
import { Message } from '../types';
import { AICreditsQuickPurchase } from './AICreditsQuickPurchase';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { CreditCard, Zap, Clock, ArrowUp, AlertTriangle, ChevronDown, Sparkles } from 'lucide-react';

interface CreditPackage {
  credits: number;
  price: number;
  priceId: string;
  popular?: boolean;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { credits: 100, price: 1.99, priceId: 'price_credits_100' },
  { credits: 500, price: 8.99, priceId: 'price_credits_500', popular: true },
  { credits: 1000, price: 15.99, priceId: 'price_credits_1000' },
  { credits: 5000, price: 69.99, priceId: 'price_credits_5000' },
];

interface CreditLimitMessageProps {
  message: Message;
  onUpgrade?: () => void;
  onPurchaseCredits?: (packageId: string) => void;
}

export const CreditLimitMessage: React.FC<CreditLimitMessageProps> = ({
  message,
  onUpgrade,
  onPurchaseCredits,
}) => {
  const { code, currentBalance, messagesUsed, monthlyAllowance, isFreemium, creditsRequired } = message.metadata || {};
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage>(CREDIT_PACKAGES[1]); // Default to 500 credits (popular)
  
  const isFreemiumLimit = code === 'MESSAGE_LIMIT_EXCEEDED';
  const isCreditLimit = code === 'INSUFFICIENT_CREDITS' || code === 'NO_CREDITS_AVAILABLE';

  const getTitle = () => {
    if (isFreemiumLimit) return 'Monthly Limit Reached';
    if (isCreditLimit) return 'AI Credits Depleted';
    return 'Access Limited';
  };

  const getDescription = () => {
    if (isFreemiumLimit) {
      return `You've used all ${monthlyAllowance || 10} free messages this month.`;
    }
    if (isCreditLimit) {
      return `You have ${currentBalance || 0} credits remaining.`;
    }
    return 'You need more credits to continue.';
  };

  const getIcon = () => {
    if (isFreemiumLimit) return <Clock className="h-5 w-5 text-amber-600" />;
    if (isCreditLimit) return <Zap className="h-5 w-5 text-red-600" />;
    return <AlertTriangle className="h-5 w-5 text-orange-600" />;
  };

  const getCardStyles = () => {
    if (isFreemiumLimit) {
      return "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20";
    }
    if (isCreditLimit) {
      return "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20";
    }
    return "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20";
  };

  const getTextStyles = () => {
    if (isFreemiumLimit) {
      return {
        title: "text-amber-800 dark:text-amber-200",
        description: "text-amber-700 dark:text-amber-300",
        button: "bg-blue-600 hover:bg-blue-700",
        outlineButton: "border-amber-300 text-amber-700 hover:bg-amber-100"
      };
    }
    if (isCreditLimit) {
      return {
        title: "text-red-800 dark:text-red-200",
        description: "text-red-700 dark:text-red-300",
        button: "bg-blue-600 hover:bg-blue-700",
        outlineButton: "border-red-300 text-red-700 hover:bg-red-100"
      };
    }
    return {
      title: "text-orange-800 dark:text-orange-200",
      description: "text-orange-700 dark:text-orange-300",
      button: "bg-blue-600 hover:bg-blue-700",
      outlineButton: "border-orange-300 text-orange-700 hover:bg-orange-100"
    };
  };

  const styles = getTextStyles();

  return (
    <Card className={getCardStyles()}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {getIcon()}
          <CardTitle className={styles.title}>
            {getTitle()}
          </CardTitle>
        </div>
        <CardDescription className={styles.description}>
          {getDescription()}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isFreemiumLimit ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <Clock className="h-4 w-4" />
              <span>Your limit resets on the 1st of next month</span>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={onUpgrade}
                className={`flex-1 ${styles.button}`}
              >
                <ArrowUp className="h-4 w-4 mr-2" />
                Upgrade to Pro ($19/mo)
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className={`flex-1 ${styles.outlineButton}`}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Buy {selectedPackage.credits.toLocaleString()} Credits (${selectedPackage.price})
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 bg-slate-900 border-slate-700 text-white">
                  <DropdownMenuLabel className="text-slate-300">Select Credit Package</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  {CREDIT_PACKAGES.map((pkg) => (
                    <DropdownMenuItem
                      key={pkg.priceId}
                      className={`cursor-pointer p-3 hover:bg-slate-800/50 focus:bg-slate-800/50 ${
                        pkg.popular ? 'border border-violet-400/20 bg-violet-500/5' : ''
                      }`}
                      onSelect={() => {
                        setSelectedPackage(pkg);
                        if (onPurchaseCredits) {
                          // Map priceId to packageId for the API
                          const packageMap: { [key: string]: string } = {
                            'price_credits_100': 'credits_100',
                            'price_credits_500': 'credits_500',
                            'price_credits_1000': 'credits_1000',
                            'price_credits_5000': 'credits_5000',
                          };
                          const packageId = packageMap[pkg.priceId] || 'credits_500';
                          onPurchaseCredits(packageId);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            pkg.popular 
                              ? 'bg-violet-500/10 border border-violet-400/20' 
                              : 'bg-slate-800/50 border border-slate-600/50'
                          }`}>
                            <Sparkles className={`w-4 h-4 ${
                              pkg.popular ? 'text-violet-400' : 'text-slate-400'
                            }`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">
                                {pkg.credits.toLocaleString()} Credits
                              </p>
                              {pkg.popular && (
                                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                                  Popular
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">
                              {(pkg.price / pkg.credits * 100).toFixed(1)}¢ per credit
                            </p>
                          </div>
                        </div>
                        <div className="text-sm font-bold">
                          ${pkg.price}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <AICreditsQuickPurchase 
              currentBalance={currentBalance || 0}
              isCompact={true}
              onPurchaseComplete={() => {
                // Refresh the page to update credit balance
                window.location.reload();
              }}
            />
            
            <div className="text-center">
              <Button 
                variant="link" 
                onClick={onUpgrade}
                className="text-blue-600 hover:text-blue-700"
              >
                Or upgrade to Pro for unlimited messages
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
