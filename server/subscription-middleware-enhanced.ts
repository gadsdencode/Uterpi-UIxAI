/**
 * Enhanced Subscription Middleware with AI Credits and Feature Flags
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users, subscriptions, subscriptionFeatures, teams, aiCreditsTransactions } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { checkCreditBalance } from './stripe-enhanced';

interface AuthenticatedRequest extends Request {
  user?: any;
}

export interface EnhancedSubscriptionCheck {
  hasAccess: boolean;
  tier: string;
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
 * Get comprehensive subscription details including features and credits
 */
export async function getEnhancedSubscriptionDetails(
  userId: number
): Promise<EnhancedSubscriptionCheck> {
  try {
    // Get user with team info
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      throw new Error('User not found');
    }

    const tier = user.subscriptionTier || 'free';
    
    // Get feature configuration for the tier
    const [features] = await db.select()
      .from(subscriptionFeatures)
      .where(eq(subscriptionFeatures.tierName, tier));

    if (!features) {
      throw new Error(`No features defined for tier: ${tier}`);
    }

    // Get current credits balance
    let creditsBalance = user.ai_credits_balance || 0;
    let teamInfo = undefined;

    // If user is part of a team, get team details
    if (user.teamId) {
      const [team] = await db.select().from(teams).where(eq(teams.id, user.teamId));
      if (team) {
        creditsBalance = team.pooled_ai_credits || 0;
        teamInfo = {
          id: team.id,
          name: team.name,
          role: user.teamRole || 'member',
          members: team.currentMembers || 1,
          maxMembers: team.maxMembers || 3,
        };
      }
    }

    // Calculate AI code reviews used this month
    const aiCodeReviewsUsed = await getMonthlyUsage(userId, 'code_review');

    // Calculate messages remaining for freemium users
    const monthlyMessageAllowance = features.monthlyMessageAllowance || 0;
    const messagesUsed = user.messages_used_this_month || 0;
    const messagesRemaining = Math.max(0, monthlyMessageAllowance - messagesUsed);

    return {
      hasAccess: ['active', 'trialing', 'freemium'].includes(user.subscriptionStatus || tier),
      tier,
      features: {
        unlimitedChat: features.unlimitedChat || false,
        monthlyMessageAllowance,
        messagesUsedThisMonth: messagesUsed,
        messagesRemaining,
        aiProvidersAccess: features.aiProvidersAccess || ['basic'],
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
        supportLevel: features.supportLevel || 'email',
      },
      team: teamInfo,
      isGrandfathered: user.is_grandfathered || false,
      grandfatheredFrom: user.grandfathered_from_tier || undefined,
    };
  } catch (error) {
    console.error('Error getting enhanced subscription details:', error);
    throw error;
  }
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
 * Middleware to check freemium message allowance
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

      const subscriptionDetails = await getEnhancedSubscriptionDetails(req.user.id);
      
      // Only check for freemium users
      if (subscriptionDetails.tier === 'freemium') {
        if (subscriptionDetails.features.messagesRemaining <= 0) {
          return res.status(402).json({
            error: 'Monthly message limit reached',
            code: 'MESSAGE_LIMIT_EXCEEDED',
            messagesUsed: subscriptionDetails.features.messagesUsedThisMonth,
            monthlyAllowance: subscriptionDetails.features.monthlyMessageAllowance,
            upgradeUrl: '/pricing',
            purchaseCreditsUrl: '/settings/billing/credits',
            message: 'You have used all 10 free messages this month. Upgrade to Pro or purchase AI Credits to continue.',
          });
        }
        
        // Track message usage
        await db.update(users)
          .set({
            messages_used_this_month: sql`${users.messages_used_this_month} + 1`,
            messages_reset_at: subscriptionDetails.features.messagesUsedThisMonth === 0 
              ? new Date() 
              : users.messages_reset_at,
          })
          .where(eq(users.id, req.user.id));
      }

      // For paid tiers, check if they have credits
      if (subscriptionDetails.tier !== 'freemium' && subscriptionDetails.features.currentCreditsBalance <= 0) {
        return res.status(402).json({
          error: 'No AI credits available',
          code: 'NO_CREDITS_AVAILABLE',
          currentBalance: 0,
          purchaseUrl: '/settings/billing/credits',
          message: 'Purchase AI Credits to continue using the service.',
        });
      }

      next();
    } catch (error) {
      console.error('Freemium limit check error:', error);
      res.status(500).json({
        error: 'Unable to verify message limits',
        code: 'LIMIT_CHECK_FAILED',
      });
    }
  };
}

/**
 * Middleware to check and consume AI credits
 */
export function requireCredits(creditsRequired: number, operationType: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED',
        });
      }

      const creditCheck = await checkCreditBalance(req.user.id, creditsRequired);

      if (!creditCheck.hasCredits) {
        return res.status(402).json({
          error: 'Insufficient AI credits',
          code: 'INSUFFICIENT_CREDITS',
          creditsRequired,
          currentBalance: creditCheck.currentBalance,
          isTeamPooled: creditCheck.isTeamPooled,
          purchaseUrl: '/settings/billing/credits',
        });
      }

      // Attach credit info to request for consumption after successful operation
      req.user.creditsPending = {
        amount: creditsRequired,
        operationType,
        currentBalance: creditCheck.currentBalance,
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
    free: { requests: 10, window: 60 * 1000 }, // 10 requests per minute
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
      const tier = user.subscriptionTier || 'free';
      const limit = limits[tier] || limits.free;

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

  return result[0]?.count || 0;
}

export {
  requireFeature,
  checkFreemiumLimit,
  requireCredits,
  requireTeamRole,
  requireAIProvider,
  tierBasedRateLimit,
  getEnhancedSubscriptionDetails,
};
