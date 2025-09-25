/**
 * Consolidated Subscription Middleware
 * Combines all subscription-related middleware functionality in one file
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users, subscriptions, subscriptionFeatures, teams, aiCreditsTransactions } from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { storage } from './storage';
import { checkCreditBalance } from './stripe-enhanced';

// Estimate required credits based on message complexity and context
export function estimateRequiredCredits(messages: any[], enableContext: boolean = false, hasAttachments: boolean = false, model: string = ''): number {
  if (!messages || messages.length === 0) {
    return 2; // Minimum for any request
  }

  // Get the latest user message for analysis
  const latestMessage = messages[messages.length - 1];
  const content = typeof latestMessage?.content === 'string' ? latestMessage.content : '';
  
  // Base estimation on message length and complexity
  let estimatedCredits = 2; // Base minimum
  
  // Message length analysis
  if (content.length < 50) {
    // Short messages like "Hi", "Thanks", "Yes" - very low cost
    estimatedCredits = 2;
  } else if (content.length < 200) {
    // Medium messages - moderate cost
    estimatedCredits = 3;
  } else if (content.length < 500) {
    // Longer messages - higher cost
    estimatedCredits = 5;
  } else {
    // Very long messages - highest cost
    estimatedCredits = 8;
  }

  // Add buffer for context enhancement (but not for very simple messages)
  if (enableContext && content.length > 10) {
    estimatedCredits += 2;
  }

  // Add buffer for attachments
  if (hasAttachments) {
    estimatedCredits += 3;
  }

  // Add buffer for premium models
  if (model.includes('gpt-4') || model.includes('claude-3-opus')) {
    estimatedCredits = Math.ceil(estimatedCredits * 1.5);
  }

  // Consider conversation history length (more context = more tokens)
  if (messages.length > 10) {
    estimatedCredits += 2;
  } else if (messages.length > 5) {
    estimatedCredits += 1;
  }

  // Cap the maximum to prevent excessive requirements
  return Math.min(estimatedCredits, 10);
}

// Extend Request type to include user
interface AuthenticatedRequest extends Request {
  user?: any & {
    creditsPending?: {
      amount: number;
      operationType: string;
      currentBalance: number;
    };
    /**
     * Flag set by checkFreemiumLimit() when this request consumed a free message.
     * When true, downstream credit checks must be skipped for this request only.
     */
    freeMessageUsed?: boolean;
    /**
     * Flag set by requireMinimumCredits() when this request needs credit deduction after completion.
     * Contains info needed for post-completion credit tracking.
     */
    needsCreditDeduction?: {
      operationType: string;
      currentBalance: number;
      isTeamPooled: boolean;
    };
  };
}

// Basic subscription check result
export interface SubscriptionCheckResult {
  hasAccess: boolean;
  reason: 'active_subscription' | 'trial_period' | 'admin_override' | 'no_subscription' | 'expired' | 'payment_failed';
  tier?: string;
  expiresAt?: Date;
  upgradeRequired?: boolean;
}

// Enhanced subscription check with detailed features
export interface EnhancedSubscriptionCheck {
  hasAccess: boolean;
  tier: string;
  status: string;
  features: {
    unlimitedChat: boolean;
    monthlyMessageAllowance: number;
    messagesUsedThisMonth: number;
    messagesRemaining: number;
    aiProvidersAccess: string[];
    monthlyAiCredits: number;
    currentCreditsBalance: number;
    maxProjects: number;
    fullCodebaseContext: boolean;
    gitIntegration: boolean;
    aiCodeReviewsPerMonth: number;
    aiCodeReviewsUsed: number;
    teamFeaturesEnabled: boolean;
    sharedWorkspaces: boolean;
    ssoEnabled: boolean;
    auditLogs: boolean;
    supportLevel: string;
  };
  team?: {
    id: number;
    name: string;
    role: string;
    members: number;
    maxMembers: number;
  };
  isGrandfathered: boolean;
  grandfatheredFrom?: string;
}

/**
 * Check if monthly reset is needed and perform it atomically
 */
async function checkAndPerformMonthlyReset(userId: number): Promise<void> {
  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Use a transaction to atomically check and reset if needed
  await db.transaction(async (tx) => {
    const [user] = await tx.select({
      id: users.id,
      messagesResetAt: users.messages_reset_at,
      messagesUsedThisMonth: users.messages_used_this_month
    }).from(users).where(eq(users.id, userId));

    if (!user) return;

    // If messages_reset_at is null or before the start of current month, reset
    if (!user.messagesResetAt || user.messagesResetAt < startOfCurrentMonth) {
      await tx.update(users)
        .set({
          messages_used_this_month: 0,
          messages_reset_at: startOfCurrentMonth,
          updatedAt: now
        })
        .where(eq(users.id, userId));
    }
  });
}

/**
 * Helper function to get monthly usage for a specific operation type
 */
async function getMonthlyUsage(userId: number, operationType: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const result = await db
    .select({
      count: sql`COUNT(*)::int`
    })
    .from(aiCreditsTransactions)
    .where(
      and(
        eq(aiCreditsTransactions.userId, userId),
        eq(aiCreditsTransactions.operationType, operationType),
        gte(aiCreditsTransactions.createdAt, startOfMonth)
      )
    );

  return Number(result[0]?.count) || 0;
}

/**
 * Check if a user has valid subscription access (basic check)
 */
export async function checkSubscriptionAccess(userId: number): Promise<SubscriptionCheckResult> {
  try {
    // Get user with current subscription status
    const user = await storage.getUser(userId);
    if (!user) {
      return {
        hasAccess: false,
        reason: 'no_subscription',
        upgradeRequired: true
      };
    }

    // Check for admin override first
    if (user.accessOverride) {
      // Check if override has expired
      if (user.overrideExpiresAt && new Date() > user.overrideExpiresAt) {
        // Override expired, remove it
        await db.update(users)
          .set({ 
            accessOverride: false,
            overrideReason: null,
            overrideExpiresAt: null 
          })
          .where(eq(users.id, userId));
      } else {
        return {
          hasAccess: true,
          reason: 'admin_override',
          tier: user.subscriptionTier || 'pro'
        };
      }
    }

    // Check for grandfathered users - they always have access
    if (user.is_grandfathered && user.grandfathered_from_tier) {
      return {
        hasAccess: true,
        reason: 'admin_override', // Treat as admin override since they have special status
        tier: user.subscriptionTier || 'pro' // Default to pro for grandfathered users
      };
    }

    // Check subscription status
    const validStatuses = ['active', 'trialing'];
    if (user.subscriptionStatus && validStatuses.includes(user.subscriptionStatus)) {
      return {
        hasAccess: true,
        reason: user.subscriptionStatus === 'trialing' ? 'trial_period' : 'active_subscription',
        tier: user.subscriptionTier || 'freemium',
        expiresAt: user.subscriptionEndsAt || undefined
      };
    }

    // Get detailed subscription info for more specific error handling
    const subscription = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    const currentSubscription = subscription[0];
    
    // Determine specific failure reason
    if (!currentSubscription) {
      return {
        hasAccess: false,
        reason: 'no_subscription',
        upgradeRequired: true
      };
    }

    if (currentSubscription.status === 'past_due') {
      return {
        hasAccess: false,
        reason: 'payment_failed',
        upgradeRequired: true,
        tier: user.subscriptionTier || 'freemium'
      };
    }

    return {
      hasAccess: false,
      reason: 'expired',
      upgradeRequired: true,
      tier: user.subscriptionTier || 'freemium'
    };

  } catch (error) {
    console.error('Error checking subscription access:', error);
    // In case of error, deny access but don't indicate upgrade requirement
    // This might be a temporary issue
    return {
      hasAccess: false,
      reason: 'no_subscription',
      upgradeRequired: false
    };
  }
}

/**
 * Get comprehensive subscription details including features and credits
 * 
 * This function handles special cases for grandfathered users:
 * - Grandfathered users get Pro tier features regardless of their current subscription tier
 * - They maintain their original pricing (e.g., $5/month for NomadAI Pro users)
 * - They receive enhanced credit benefits and minimum credit guarantees
 * - Friends & Family users get Pro tier features as a special benefit
 * 
 * The function uses an "effective tier" concept where grandfathered users
 * get Pro tier features while maintaining their original tier for billing purposes.
 */
export async function getEnhancedSubscriptionDetails(
  userId: number
): Promise<EnhancedSubscriptionCheck> {
  try {
    // First, check and perform monthly reset if needed
    await checkAndPerformMonthlyReset(userId);

    // Get user with team info
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      throw new Error('User not found');
    }

    const tier = user.subscriptionTier || 'freemium';
    
    // Handle grandfathered plans - they get enhanced features regardless of current tier
    let effectiveTier = tier;
    if (user.is_grandfathered && user.grandfathered_from_tier) {
      // Grandfathered users get Pro tier features regardless of their original tier
      // This includes:
      // - NomadAI Pro users ($5/month) -> Pro tier features at original pricing
      // - Friends & Family users -> Pro tier features as a benefit
      // - Other legacy users -> Enhanced features based on migration logic
      effectiveTier = 'pro';
    }
    
    // Get feature configuration for the effective tier
    const [features] = await db.select()
      .from(subscriptionFeatures)
      .where(eq(subscriptionFeatures.tierName, effectiveTier));

    if (!features) {
      // Create default features based on effective tier
      const defaultFeatures = effectiveTier === 'pro' ? {
        tierName: 'pro',
        unlimitedChat: true,
        monthlyMessageAllowance: 1000,
        aiProvidersAccess: ['openai', 'anthropic', 'azure'],
        monthlyAiCredits: 100,
        maxProjects: 10,
        fullCodebaseContext: true,
        gitIntegration: true,
        aiCodeReviewsPerMonth: 50,
        teamFeaturesEnabled: false,
        sharedWorkspaces: false,
        ssoEnabled: false,
        auditLogs: false,
        supportLevel: 'email'
      } : {
        tierName: 'freemium',
        unlimitedChat: false,
        monthlyMessageAllowance: 10,
        aiProvidersAccess: ['basic'],
        monthlyAiCredits: 0,
        maxProjects: 1,
        fullCodebaseContext: false,
        gitIntegration: false,
        aiCodeReviewsPerMonth: 0,
        teamFeaturesEnabled: false,
        sharedWorkspaces: false,
        ssoEnabled: false,
        auditLogs: false,
        supportLevel: 'community'
      };

      await db.insert(subscriptionFeatures).values(defaultFeatures).onConflictDoNothing();
      
      throw new Error(`No features defined for tier: ${effectiveTier}. Default features created.`);
    }

    // Get current credits balance
    let creditsBalance = user.ai_credits_balance || 0;
    let teamInfo = undefined;

    // If user is part of a team, get team details
    if (user.teamId) {
      const [team] = await db.select().from(teams).where(eq(teams.id, user.teamId));
      if (team) {
        creditsBalance = team.pooledAiCredits || 0;
        teamInfo = {
          id: team.id,
          name: team.name,
          role: user.teamRole || 'member',
          members: team.currentMembers || 1,
          maxMembers: team.maxMembers || 3,
        };
      }
    }

    // Handle special grandfathered user benefits
    if (user.is_grandfathered && user.grandfathered_from_tier) {
      // Grandfathered users get enhanced credit benefits
      // Based on migration logic, they received bonus credits during migration
      // and maintain Pro tier features at their original pricing
      
      // Ensure grandfathered users have minimum credit balance for Pro features
      // This is a safety net to ensure they can use Pro features even if credits run low
      const minGrandfatheredCredits = 50; // Minimum credits for grandfathered users
      if (creditsBalance < minGrandfatheredCredits && !user.teamId) {
        creditsBalance = Math.max(creditsBalance, minGrandfatheredCredits);
      }
    }

    // Calculate AI code reviews used this month
    const aiCodeReviewsUsed = await getMonthlyUsage(userId, 'code_review');

    // Calculate messages remaining for freemium users
    const monthlyMessageAllowance = features.monthlyMessageAllowance || 0;
    const messagesUsed = user.messages_used_this_month || 0;
    const messagesRemaining = Math.max(0, monthlyMessageAllowance - messagesUsed);

    // Determine access - grandfathered users always have access
    const hasAccess = user.is_grandfathered || 
                     ['active', 'trialing', 'freemium'].includes(user.subscriptionStatus || 'freemium');

    return {
      hasAccess,
      tier,
      status: user.subscriptionStatus || 'freemium',
      features: {
        unlimitedChat: features.unlimitedChat || false,
        monthlyMessageAllowance,
        messagesUsedThisMonth: messagesUsed,
        messagesRemaining,
        aiProvidersAccess: Array.isArray(features.aiProvidersAccess) ? features.aiProvidersAccess : ['basic'],
          monthlyAiCredits: features.monthlyAiCredits || 0,
        currentCreditsBalance: creditsBalance,
        maxProjects: features.maxProjects || 1,
        fullCodebaseContext: features.fullCodebaseContext || false,
        gitIntegration: features.gitIntegration || false,
        aiCodeReviewsPerMonth: features.aiCodeReviewsPerMonth || 0,
        aiCodeReviewsUsed,
        teamFeaturesEnabled: features.teamFeaturesEnabled || false,
        sharedWorkspaces: features.sharedWorkspaces || false,
        ssoEnabled: features.ssoEnabled || false,
        auditLogs: features.auditLogs || false,
        supportLevel: features.supportLevel || 'community',
      },
      team: teamInfo,
      isGrandfathered: user.is_grandfathered || false,
      grandfatheredFrom: user.grandfathered_from_tier || undefined,
    };
  } catch (error) {
    console.error('Error getting subscription details:', error);
    throw error;
  }
}

/**
 * Middleware to require active subscription for access
 */
export function requireActiveSubscription(options: {
  allowTrial?: boolean;
  requiredTier?: 'freemium' | 'pro' | 'team' | 'enterprise';
  customMessage?: string;
} = {}) {
  const { allowTrial = true, requiredTier, customMessage } = options;

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // First check if user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
          redirectTo: '/login'
        });
      }

      // Check subscription access
      const accessCheck = await checkSubscriptionAccess(req.user.id);

      if (!accessCheck.hasAccess) {
        const responses: Record<string, any> = {
          no_subscription: {
            status: 402,
            error: customMessage || 'Subscription required to access this feature',
            code: 'SUBSCRIPTION_REQUIRED',
            redirectTo: '/subscribe',
            reason: 'no_subscription'
          },
          expired: {
            status: 402,
            error: customMessage || 'Your subscription has expired',
            code: 'SUBSCRIPTION_EXPIRED',
            redirectTo: '/subscribe',
            reason: 'expired'
          },
          payment_failed: {
            status: 402,
            error: customMessage || 'Please update your payment method',
            code: 'PAYMENT_FAILED',
            redirectTo: '/billing',
            reason: 'payment_failed'
          }
        };

        const response = responses[accessCheck.reason as string] || responses.no_subscription;
        return res.status(response.status).json(response);
      }

      // Check if trial access is allowed
      if (accessCheck.reason === 'trial_period' && !allowTrial) {
        return res.status(402).json({
          error: customMessage || 'This feature requires a paid subscription',
          code: 'PAID_SUBSCRIPTION_REQUIRED',
          redirectTo: '/subscribe',
          reason: 'trial_not_allowed'
        });
      }

      // Check tier requirements
      if (requiredTier) {
        // Canonical mapping with legacy aliases for backward compatibility
        const tierHierarchy: Record<string, number> = {
          freemium: 0,
          pro: 2,
          team: 3,
          enterprise: 4,
          // legacy aliases
          basic: 0,
          premium: 2,
          friends_family: 2,
          nomadai_pro: 2,
          'nomadai pro': 2,
        };

        const userTierLevel = tierHierarchy[(accessCheck.tier || '').toLowerCase()] || 0;
        const requiredTierLevel = tierHierarchy[requiredTier.toLowerCase()] || 0;

        if (userTierLevel < requiredTierLevel) {
          return res.status(402).json({
            error: customMessage || `This feature requires a ${requiredTier} subscription`,
            code: 'TIER_UPGRADE_REQUIRED',
            redirectTo: '/subscribe',
            reason: 'tier_insufficient',
            currentTier: accessCheck.tier,
            requiredTier
          });
        }
      }

      // Access granted - attach subscription info to request
      req.user = {
        ...req.user,
        subscriptionStatus: accessCheck.reason,
        subscriptionTier: accessCheck.tier,
      };

      next();
    } catch (error) {
      console.error('Subscription middleware error:', error);
      res.status(500).json({
        error: 'Unable to verify subscription status',
        code: 'SUBSCRIPTION_CHECK_FAILED'
      });
    }
  };
}

/**
 * Middleware for features that have different behavior based on subscription
 * (e.g., rate limiting, feature access)
 */
export function enhanceWithSubscription() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return next(); // Continue without subscription info if not authenticated
    }

    try {
      const accessCheck = await checkSubscriptionAccess(req.user.id);
      
      // Attach subscription info to request for use in route handlers
      req.user = {
        ...req.user,
        subscriptionStatus: accessCheck.hasAccess ? accessCheck.reason : 'none',
        subscriptionTier: accessCheck.tier || 'freemium',
      };
      
      next();
    } catch (error) {
      console.error('Subscription enhancement error:', error);
      // Continue without subscription info rather than failing the request
      next();
    }
  };
}

/**
 * Middleware to check freemium message allowance with atomic increment
 */
export function checkFreemiumLimit() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      // Use database transaction to atomically check and increment
      const result = await db.transaction(async (tx) => {
        // First, check and perform monthly reset if needed
        await checkAndPerformMonthlyReset(req.user.id);

        // Get fresh subscription details after potential reset
        const subscriptionDetails = await getEnhancedSubscriptionDetails(req.user.id);
        
        // Check for freemium users
        if (subscriptionDetails.tier === 'freemium') {
          const { messagesRemaining, currentCreditsBalance } = subscriptionDetails.features;

          console.log(`🔍 Freemium limit check for user ${req.user.id}:`, {
            messagesRemaining,
            currentCreditsBalance,
            messagesUsed: subscriptionDetails.features.messagesUsedThisMonth,
            monthlyAllowance: subscriptionDetails.features.monthlyMessageAllowance
          });

          // If free messages remain, consume one and mark flag to skip credit deduction for this request
          if (messagesRemaining > 0) {
            console.log(`✅ Using free message for user ${req.user.id} (${messagesRemaining} remaining)`);
            
            // Atomically increment message usage
            await tx.update(users)
              .set({
                messages_used_this_month: sql`${users.messages_used_this_month} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(users.id, req.user.id));

            // Signal downstream middleware to skip credit checks for this request
            req.user.freeMessageUsed = true;

            return { success: true };
          }

          // If no free messages remain, check if user has purchased AI credits
          if (currentCreditsBalance > 0) {
            console.log(`💳 Free messages exhausted for user ${req.user.id}, using AI credits (${currentCreditsBalance} available)`);
            // Allow the request to continue to requireCredits() middleware which will deduct credits
            // DO NOT set freeMessageUsed flag - we want credits to be deducted
            return { success: true };
          }

          // No free messages and no credits - block the request
          console.log(`🚫 Blocking user ${req.user.id}: no free messages (${messagesRemaining}) and no credits (${currentCreditsBalance})`);
          return {
            success: false,
            error: {
              error: 'Monthly message limit reached',
              code: 'MESSAGE_LIMIT_EXCEEDED',
              messagesUsed: subscriptionDetails.features.messagesUsedThisMonth,
              monthlyAllowance: subscriptionDetails.features.monthlyMessageAllowance,
              currentCreditsBalance: currentCreditsBalance,
              upgradeUrl: '/pricing',
              purchaseCreditsUrl: '/settings/billing/credits',
              message: 'You have used all your free messages this month. Upgrade to Pro or purchase AI Credits to continue.',
            }
          };
        }

        // For paid tiers, check if they have credits
        if (subscriptionDetails.tier !== 'freemium' && subscriptionDetails.features.currentCreditsBalance <= 0) {
          console.log(`🚫 Paid tier user ${req.user.id} has no credits: ${subscriptionDetails.features.currentCreditsBalance}`);
          return {
            success: false,
            error: {
              error: 'No AI credits available',
              code: 'NO_CREDITS_AVAILABLE',
              currentBalance: subscriptionDetails.features.currentCreditsBalance,
              purchaseUrl: '/settings/billing/credits',
              message: 'Purchase AI Credits to continue using the service.',
            }
          };
        }

        return { success: true };
      });

      if (!result.success) {
        return res.status(402).json(result.error);
      }

      next();
    } catch (error) {
      console.error('Freemium limit check error:', error);
      res.status(500).json({
        error: 'Unable to verify message allowance',
        code: 'LIMIT_CHECK_FAILED',
      });
    }
  };
}

/**
 * Middleware to check for specific feature access
 */
export function requireFeature(featureName: keyof EnhancedSubscriptionCheck['features']) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      const subscriptionDetails = await getEnhancedSubscriptionDetails(req.user.id);

      // Check if user has access to the feature
      const featureValue = subscriptionDetails.features[featureName];
      
      // Handle boolean features
      if (typeof featureValue === 'boolean' && !featureValue) {
        return res.status(403).json({
          error: `This feature requires a higher subscription tier`,
          code: 'FEATURE_NOT_AVAILABLE',
          feature: featureName,
          currentTier: subscriptionDetails.tier,
          upgradeUrl: '/pricing',
        });
      }

      // Handle numeric limits (e.g., maxProjects)
      if (typeof featureValue === 'number' && featureValue === 0) {
        return res.status(403).json({
          error: `You have reached the limit for this feature`,
          code: 'FEATURE_LIMIT_REACHED',
          feature: featureName,
          limit: featureValue,
          currentTier: subscriptionDetails.tier,
          upgradeUrl: '/pricing',
        });
      }

      // Attach subscription details to request
      req.user.subscription = subscriptionDetails;
      next();

    } catch (error) {
      console.error('Feature check error:', error);
      res.status(500).json({
        error: 'Unable to verify feature access',
        code: 'FEATURE_CHECK_FAILED',
      });
    }
  };
}

/**
 * Middleware to check minimum credit threshold (does not pre-allocate credits)
 * Credits will be deducted after AI response based on actual token usage
 */
export function requireMinimumCredits(minimumCredits: number = 10, operationType: string = 'chat') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      // If a free message was consumed upstream (freemium), skip credit check for this request
      if (req.user.freeMessageUsed) {
        console.log(`⏭️ Skipping credit check for user ${req.user.id} - free message was used`);
        return next();
      }

      console.log(`💳 Checking minimum credits for user ${req.user.id}: ${minimumCredits} minimum required for ${operationType}`);
      const creditCheck = await checkCreditBalance(req.user.id, minimumCredits);

      if (!creditCheck.hasCredits) {
        console.log(`🚫 Insufficient credits for user ${req.user.id}: has ${creditCheck.currentBalance}, needs minimum ${minimumCredits}`);
        return res.status(402).json({
          error: 'Insufficient AI credits',
          code: 'INSUFFICIENT_CREDITS',
          creditsRequired: minimumCredits,
          currentBalance: creditCheck.currentBalance,
          isTeamPooled: creditCheck.isTeamPooled,
          purchaseUrl: '/settings/billing/credits',
          message: `You need at least ${minimumCredits} AI credits to start this operation. You currently have ${creditCheck.currentBalance} credits.`,
        });
      }

      console.log(`✅ Minimum credit check passed for user ${req.user.id}: has ${creditCheck.currentBalance}, minimum ${minimumCredits} required for ${operationType}`);

      // Mark that this user will need credit deduction after the operation
      req.user.needsCreditDeduction = {
        operationType,
        currentBalance: creditCheck.currentBalance,
        isTeamPooled: creditCheck.isTeamPooled,
      };

      next();

    } catch (error) {
      console.error('Credit check error:', error);
      res.status(500).json({
        error: 'Unable to verify credit balance',
        code: 'CREDIT_CHECK_FAILED',
      });
    }
  };
}

/**
 * Dynamic middleware to check minimum credit threshold based on message analysis
 * Credits will be deducted after AI response based on actual token usage
 */
export function requireDynamicCredits(estimateFunction: (req: any) => number, operationType: string = 'chat') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      // If a free message was consumed upstream (freemium), skip credit check for this request
      if (req.user.freeMessageUsed) {
        console.log(`⏭️ Skipping credit check for user ${req.user.id} - free message was used`);
        return next();
      }

      // Calculate dynamic minimum based on message analysis
      const minimumCredits = estimateFunction(req);
      
      console.log(`💳 Checking dynamic credits for user ${req.user.id}: ${minimumCredits} minimum required for ${operationType}`);
      const creditCheck = await checkCreditBalance(req.user.id, minimumCredits);

      if (!creditCheck.hasCredits) {
        console.log(`🚫 Insufficient credits for user ${req.user.id}: has ${creditCheck.currentBalance}, needs minimum ${minimumCredits}`);
        return res.status(402).json({
          error: 'Insufficient AI credits',
          code: 'INSUFFICIENT_CREDITS',
          creditsRequired: minimumCredits,
          currentBalance: creditCheck.currentBalance,
          isTeamPooled: creditCheck.isTeamPooled,
          purchaseUrl: '/settings/billing/credits',
          message: `You need at least ${minimumCredits} AI credits to start this operation. You currently have ${creditCheck.currentBalance} credits.`,
        });
      }

      console.log(`✅ Dynamic credit check passed for user ${req.user.id}: has ${creditCheck.currentBalance}, minimum ${minimumCredits} required for ${operationType}`);

      // Mark that this user will need credit deduction after the operation
      req.user.needsCreditDeduction = {
        operationType,
        currentBalance: creditCheck.currentBalance,
        isTeamPooled: creditCheck.isTeamPooled,
      };

      next();

    } catch (error) {
      console.error('Dynamic credit check error:', error);
      res.status(500).json({
        error: 'Unable to verify credit balance',
        code: 'CREDIT_CHECK_FAILED',
      });
    }
  };
}

/**
 * Legacy middleware for backward compatibility - now just checks minimum credits
 * @deprecated Use requireMinimumCredits instead
 */
export function requireCredits(creditsRequired: number, operationType: string) {
  return requireMinimumCredits(creditsRequired, operationType);
}

/**
 * Middleware to check team permissions
 */
export function requireTeamRole(allowedRoles: Array<'owner' | 'admin' | 'member'>) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      const [user] = await db.select().from(users).where(eq(users.id, req.user.id));

      if (!user.teamId) {
        return res.status(403).json({
          error: 'This feature requires team membership',
          code: 'TEAM_REQUIRED',
        });
      }

      const userRole = user.teamRole || 'member';
      
      if (!allowedRoles.includes(userRole as any)) {
        return res.status(403).json({
          error: 'Insufficient team permissions',
          code: 'INSUFFICIENT_TEAM_PERMISSIONS',
          requiredRoles: allowedRoles,
          currentRole: userRole,
        });
      }

      req.user.teamId = user.teamId;
      req.user.teamRole = userRole;
      next();

    } catch (error) {
      console.error('Team role check error:', error);
      res.status(500).json({
        error: 'Unable to verify team permissions',
        code: 'TEAM_CHECK_FAILED',
      });
    }
  };
}

/**
 * Check if user has access to a specific AI provider
 */
export function requireAIProvider(provider: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      const subscriptionDetails = await getEnhancedSubscriptionDetails(req.user.id);
      const allowedProviders = subscriptionDetails.features.aiProvidersAccess;

      if (!allowedProviders.includes(provider) && !allowedProviders.includes('all')) {
        return res.status(403).json({
          error: `Access to ${provider} requires a higher subscription tier`,
          code: 'AI_PROVIDER_NOT_AVAILABLE',
          provider,
          allowedProviders,
          currentTier: subscriptionDetails.tier,
          upgradeUrl: '/pricing',
        });
      }

      next();

    } catch (error) {
      console.error('AI provider check error:', error);
      res.status(500).json({
        error: 'Unable to verify AI provider access',
        code: 'PROVIDER_CHECK_FAILED',
      });
    }
  };
}

/**
 * Rate limiting based on subscription tier
 */
export function tierBasedRateLimit() {
  const limits: Record<string, { requests: number; window: number }> = {
    freemium: { requests: 10, window: 60 * 1000 }, // 10 requests per minute
    pro: { requests: 60, window: 60 * 1000 }, // 60 requests per minute
    team: { requests: 120, window: 60 * 1000 }, // 120 requests per minute
    enterprise: { requests: 999999, window: 60 * 1000 }, // Effectively unlimited
  };

  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return next(); // Skip rate limiting for unauthenticated requests
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
      const tier = user.subscriptionTier || 'freemium';
      const limit = limits[tier] || limits.freemium;

      const key = `${req.user.id}-${req.path}`;
      const now = Date.now();
      
      let requestData = requestCounts.get(key);
      
      if (!requestData || requestData.resetTime < now) {
        requestData = { count: 0, resetTime: now + limit.window };
        requestCounts.set(key, requestData);
      }

      requestData.count++;

      if (requestData.count > limit.requests) {
        const retryAfter = Math.ceil((requestData.resetTime - now) / 1000);
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          tier,
          limit: limit.requests,
          window: limit.window / 1000,
          retryAfter,
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', limit.requests.toString());
      res.setHeader('X-RateLimit-Remaining', (limit.requests - requestData.count).toString());
      res.setHeader('X-RateLimit-Reset', requestData.resetTime.toString());

      next();

    } catch (error) {
      console.error('Rate limit check error:', error);
      next(); // Continue on error rather than blocking
    }
  };
}

/**
 * Grant admin override for a user
 */
export async function grantAccessOverride(
  userId: number, 
  grantedBy: number, 
  reason: string, 
  expiresAt?: Date
): Promise<void> {
  try {
    await db.update(users)
      .set({
        accessOverride: true,
        overrideReason: reason,
        overrideGrantedBy: grantedBy,
        overrideGrantedAt: new Date(),
        overrideExpiresAt: expiresAt || null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('Error granting access override:', error);
    throw new Error('Failed to grant access override');
  }
}

/**
 * Remove admin override for a user
 */
export async function removeAccessOverride(userId: number): Promise<void> {
  try {
    await db.update(users)
      .set({
        accessOverride: false,
        overrideReason: null,
        overrideGrantedBy: null,
        overrideGrantedAt: null,
        overrideExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('Error removing access override:', error);
    throw new Error('Failed to remove access override');
  }
}

/**
 * Scheduled task to reset monthly message counters (should be run via cron)
 */
export async function resetMonthlyMessageCounters(): Promise<void> {
  try {
    const startOfCurrentMonth = new Date();
    startOfCurrentMonth.setDate(1);
    startOfCurrentMonth.setHours(0, 0, 0, 0);

    // Reset all users whose reset date is before the current month
    const result = await db.update(users)
      .set({
        messages_used_this_month: 0,
        messages_reset_at: startOfCurrentMonth,
        updatedAt: new Date()
      })
      .where(
        sql`${users.messages_reset_at} < ${startOfCurrentMonth} OR ${users.messages_reset_at} IS NULL`
      );

    console.log(`Monthly reset completed. Updated users: ${result.rowCount}`);
  } catch (error) {
    console.error('Error during monthly reset:', error);
    throw error;
  }
}