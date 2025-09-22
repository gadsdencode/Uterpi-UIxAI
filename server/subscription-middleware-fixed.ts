import { Request, Response, NextFunction } from 'express';
import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from './db';
import { users, subscriptionFeatures, teams, aiCreditsTransactions } from '../shared/schema';

interface AuthenticatedRequest extends Request {
  user?: any & {
    creditsPending?: {
      amount: number;
      operationType: string;
      currentBalance: number;
    };
  };
}

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
    monthlyAICredits: number;
    currentCreditsBalance: number;
    maxProjects: number;
    fullCodebaseContext: boolean;
    gitIntegration: boolean;
    aiCodeReviewsPerMonth: number;
    aiCodeReviewsUsed: number;
    teamFeaturesEnabled: boolean;
    supportLevel: string;
  };
  team?: {
    id: number;
    name: string;
    role: string;
    members: number;
    maxMembers: number;
  };
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
          updated_at: now
        })
        .where(eq(users.id, userId));
    }
  });
}

/**
 * Get comprehensive subscription details including features and credits
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
    
    // Get feature configuration for the tier
    const [features] = await db.select()
      .from(subscriptionFeatures)
      .where(eq(subscriptionFeatures.tierName, tier));

    if (!features) {
      // Create default freemium features if not found
      const defaultFeatures = {
        tierName: 'freemium',
        unlimitedChat: false,
        monthlyMessageAllowance: 10,
        aiProvidersAccess: ['basic'],
        monthlyAICredits: 0,
        maxProjects: 1,
        fullCodebaseContext: false,
        gitIntegration: false,
        aiCodeReviewsPerMonth: 0,
        teamFeaturesEnabled: false,
        supportLevel: 'community'
      };

      await db.insert(subscriptionFeatures).values(defaultFeatures).onConflictDoNothing();
      
      throw new Error(`No features defined for tier: ${tier}. Default features created.`);
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
      hasAccess: ['active', 'trialing', 'freemium'].includes(user.subscriptionStatus || 'freemium'),
      tier,
      status: user.subscriptionStatus || 'freemium',
      features: {
        unlimitedChat: features.unlimitedChat || false,
        monthlyMessageAllowance,
        messagesUsedThisMonth: messagesUsed,
        messagesRemaining,
        aiProvidersAccess: Array.isArray(features.aiProvidersAccess) ? features.aiProvidersAccess : ['basic'],
        monthlyAICredits: features.monthlyAICredits || 0,
        currentCreditsBalance: creditsBalance,
        maxProjects: features.maxProjects || 1,
        fullCodebaseContext: features.fullCodebaseContext || false,
        gitIntegration: features.gitIntegration || false,
        aiCodeReviewsPerMonth: features.aiCodeReviewsPerMonth || 0,
        aiCodeReviewsUsed,
        teamFeaturesEnabled: features.teamFeaturesEnabled || false,
        supportLevel: features.supportLevel || 'community',
      },
      team: teamInfo,
      grandfatheredFrom: user.grandfatheredFrom,
    };
  } catch (error) {
    console.error('Error getting subscription details:', error);
    throw error;
  }
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
          // Check if user has reached their limit BEFORE incrementing
          if (subscriptionDetails.features.messagesRemaining <= 0) {
            return {
              success: false,
              error: {
                error: 'Monthly message limit reached',
                code: 'MESSAGE_LIMIT_EXCEEDED',
                messagesUsed: subscriptionDetails.features.messagesUsedThisMonth,
                monthlyAllowance: subscriptionDetails.features.monthlyMessageAllowance,
                upgradeUrl: '/pricing',
                purchaseCreditsUrl: '/settings/billing/credits',
                message: 'You have used all your free messages this month. Upgrade to Pro or purchase AI Credits to continue.',
              }
            };
          }
          
          // Atomically increment message usage
          await tx.update(users)
            .set({
              messages_used_this_month: sql`${users.messages_used_this_month} + 1`,
              updated_at: new Date(),
            })
            .where(eq(users.id, req.user.id));
        }

        // For paid tiers, check if they have credits
        if (subscriptionDetails.tier !== 'freemium' && subscriptionDetails.features.currentCreditsBalance <= 0) {
          return {
            success: false,
            error: {
              error: 'No AI credits available',
              code: 'NO_CREDITS_AVAILABLE',
              currentBalance: 0,
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
        updated_at: new Date()
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
