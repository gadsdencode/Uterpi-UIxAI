import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users, subscriptions } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { storage } from './storage';

// Extend Request type to include user
interface AuthenticatedRequest extends Request {
  user?: any; // Use any to avoid type conflicts with existing auth system
}

export interface SubscriptionCheckResult {
  hasAccess: boolean;
  reason: 'active_subscription' | 'trial_period' | 'admin_override' | 'no_subscription' | 'expired' | 'payment_failed';
  tier?: string;
  expiresAt?: Date;
  upgradeRequired?: boolean;
}

/**
 * Check if a user has valid subscription access
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
          tier: user.subscriptionTier || 'premium'
        };
      }
    }

    // Check subscription status
    const validStatuses = ['active', 'trialing'];
    if (user.subscriptionStatus && validStatuses.includes(user.subscriptionStatus)) {
      return {
        hasAccess: true,
        reason: user.subscriptionStatus === 'trialing' ? 'trial_period' : 'active_subscription',
        tier: user.subscriptionTier || 'basic',
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
        tier: user.subscriptionTier || 'basic'
      };
    }

    return {
      hasAccess: false,
      reason: 'expired',
      upgradeRequired: true,
      tier: user.subscriptionTier || 'basic'
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
 * Middleware to require active subscription for access
 */
export function requireActiveSubscription(options: {
  allowTrial?: boolean;
  requiredTier?: 'basic' | 'premium';
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
        const tierHierarchy = { basic: 1, premium: 2, friends_family: 2 }; // Friends & Family gets premium access
        const userTierLevel = tierHierarchy[accessCheck.tier as keyof typeof tierHierarchy] || 0;
        const requiredTierLevel = tierHierarchy[requiredTier];

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
        subscriptionTier: accessCheck.tier || 'free',
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