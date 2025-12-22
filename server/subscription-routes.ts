/**
 * API Routes for Enhanced Subscription System
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from './auth';
import { 
  requireFeature, 
  requireCredits, 
  requireTeamRole,
  getEnhancedSubscriptionDetails 
} from './subscription-middleware';
import { db } from './db';
import { 
  users, 
  teams, 
  subscriptionPlans, 
  subscriptionFeatures,
  aiCreditsTransactions 
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { grandfatherExistingUsers, verifyGrandfatherStatus } from './grandfather-users-migration';
import { 
  createTeamSubscription,
  purchaseAICredits,
  updateTeamSeats,
  trackAIUsage,
  checkCreditBalance,
  CREDIT_PACKAGES,
  STRIPE_PRODUCTS
} from './stripe';

const router = Router();

// Extend Express User interface to include team properties
declare global {
  namespace Express {
    interface User {
      teamId?: number;
      teamRole?: string;
    }
  }
}

// =============================================================================
// SUBSCRIPTION INFORMATION ENDPOINTS
// =============================================================================

/**
 * Get current subscription details with features and credits
 */
router.get('/subscription/details', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const details = await getEnhancedSubscriptionDetails(req.user.id);
    
    // Add grandfather status if applicable
    const grandfatherStatus = await verifyGrandfatherStatus(req.user.id);
    
    res.json({
      ...details,
      grandfather: grandfatherStatus,
    });
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    res.status(500).json({ error: 'Failed to fetch subscription details' });
  }
});

/**
 * Get available subscription plans
 */
router.get('/subscription/plans', async (req, res) => {
  try {
    const plans = await db.select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(subscriptionPlans.sortOrder);

    // Get feature details for each plan
    const plansWithFeatures = await Promise.all(plans.map(async (plan) => {
      const tierName = plan.name.toLowerCase().replace(' ', '_');
      const [features] = await db.select()
        .from(subscriptionFeatures)
        .where(eq(subscriptionFeatures.tierName, tierName));

      return {
        ...plan,
        features: features || {},
      };
    }));

    res.json({ plans: plansWithFeatures });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

// =============================================================================
// AI CREDITS ENDPOINTS
// =============================================================================

/**
 * Get current AI credits balance and usage
 */
router.get('/credits/balance', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const creditCheck = await checkCreditBalance(req.user.id, 0);
    
    // Get usage history for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const transactions = await db.select()
      .from(aiCreditsTransactions)
      .where(
        and(
          eq(aiCreditsTransactions.userId, req.user.id!),
          gte(aiCreditsTransactions.createdAt, startOfMonth)
        )
      )
      .orderBy(desc(aiCreditsTransactions.createdAt))
      .limit(10);

    res.json({
      balance: creditCheck.currentBalance,
      isTeamPooled: creditCheck.isTeamPooled,
      recentTransactions: transactions,
    });
  } catch (error) {
    console.error('Error fetching credit balance:', error);
    res.status(500).json({ error: 'Failed to fetch credit balance' });
  }
});

/**
 * Get available credit packages for purchase
 */
router.get('/credits/packages', requireAuth, async (req: Request, res: Response) => {
  res.json({ packages: CREDIT_PACKAGES });
});

/**
 * Purchase additional AI credits
 */
router.post('/credits/purchase', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { packageId, paymentMethodId } = req.body;
    
    const creditPackage = CREDIT_PACKAGES.find(p => p.priceId === packageId);
    if (!creditPackage) {
      return res.status(400).json({ error: 'Invalid credit package' });
    }

    const paymentIntent = await purchaseAICredits({
      userId: req.user.id,
      creditPackage,
      paymentMethodId,
    });

    res.json({
      success: true,
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
      },
      creditsAdded: creditPackage.credits,
    });
  } catch (error) {
    console.error('Error purchasing credits:', error);
    res.status(500).json({ error: 'Failed to purchase credits' });
  }
});

/**
 * Track AI usage (called internally by AI operations)
 */
router.post('/credits/track-usage', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { operationType, modelUsed, tokensConsumed } = req.body;

    const result = await trackAIUsage({
      userId: req.user.id,
      operationType,
      modelUsed,
      tokensConsumed: tokensConsumed || 0,
    });

    res.json(result);
  } catch (error: unknown) {
    console.error('Error tracking AI usage:', error);
    if (error instanceof Error && error.message === 'Insufficient AI credits') {
      res.status(402).json({ 
        error: 'Insufficient AI credits',
        code: 'INSUFFICIENT_CREDITS',
      });
    } else {
      res.status(500).json({ error: 'Failed to track AI usage' });
    }
  }
});

// =============================================================================
// TEAM MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * Create a new team subscription
 */
router.post('/team/create', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id || !req.user?.email) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { 
      teamName, 
      tier, 
      memberEmails, 
      paymentMethodId,
      billingEmail 
    } = req.body;

    if (!['team', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid team tier' });
    }

    const result = await createTeamSubscription({
      teamName,
      ownerId: req.user.id,
      tier,
      memberEmails,
      paymentMethodId,
      billingEmail: billingEmail || req.user.email,
    });

    res.json({
      success: true,
      teamId: result.teamId,
      subscription: {
        id: result.subscription.id,
        status: result.subscription.status,
      },
    });
  } catch (error: unknown) {
    console.error('Error creating team:', error);
    const message = error instanceof Error ? error.message : 'Failed to create team';
    res.status(500).json({ error: message });
  }
});

/**
 * Get team details
 */
router.get('/team/details', requireAuth, requireTeamRole(['owner', 'admin', 'member']), async (req: Request, res: Response) => {
  try {
    if (!req.user?.teamId) {
      return res.status(400).json({ error: 'No team associated with user' });
    }
    
    const [team] = await db.select()
      .from(teams)
      .where(eq(teams.id, req.user.teamId));

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get team members
    const members = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.teamRole,
      joinedAt: users.updatedAt,
    })
      .from(users)
      .where(eq(users.teamId, team.id));

    res.json({
      team: {
        ...team,
        members,
      },
    });
  } catch (error) {
    console.error('Error fetching team details:', error);
    res.status(500).json({ error: 'Failed to fetch team details' });
  }
});

/**
 * Update team seats (add/remove members)
 */
router.post('/team/update-seats', requireAuth, requireTeamRole(['owner']), async (req: Request, res: Response) => {
  try {
    if (!req.user?.teamId) {
      return res.status(400).json({ error: 'No team associated with user' });
    }
    
    const { newSeatCount } = req.body;

    if (newSeatCount < 3) {
      return res.status(400).json({ error: 'Team plan requires minimum 3 seats' });
    }

    const subscription = await updateTeamSeats(req.user.teamId, newSeatCount);

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        quantity: subscription.items.data[0].quantity,
      },
    });
  } catch (error) {
    console.error('Error updating team seats:', error);
    res.status(500).json({ error: 'Failed to update team seats' });
  }
});

/**
 * Invite team member
 */
router.post('/team/invite', requireAuth, requireTeamRole(['owner', 'admin']), async (req: Request, res: Response) => {
  try {
    if (!req.user?.teamId) {
      return res.status(400).json({ error: 'No team associated with user' });
    }
    
    const { email, role = 'member' } = req.body;

    const [team] = await db.select()
      .from(teams)
      .where(eq(teams.id, req.user.teamId));

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if ((team.currentMembers || 0) >= (team.maxMembers || 3)) {
      return res.status(400).json({ 
        error: 'Team has reached maximum member limit',
        currentMembers: team.currentMembers || 0,
        maxMembers: team.maxMembers || 3,
      });
    }

    // TODO: Send invitation email
    // For now, just return success
    res.json({
      success: true,
      message: `Invitation sent to ${email}`,
    });
  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({ error: 'Failed to invite team member' });
  }
});

// =============================================================================
// USAGE ANALYTICS ENDPOINTS
// =============================================================================

/**
 * Get usage analytics for the current month
 */
router.get('/usage/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get credit usage by operation type
    const usageByType = await db.select({
      operationType: aiCreditsTransactions.operationType,
      totalCredits: sql`SUM(ABS(${aiCreditsTransactions.amount}))::int`,
      count: sql`COUNT(*)::int`,
    })
      .from(aiCreditsTransactions)
      .where(
        and(
          eq(aiCreditsTransactions.userId, req.user.id),
          eq(aiCreditsTransactions.transactionType, 'usage'),
          gte(aiCreditsTransactions.createdAt, startOfMonth)
        )
      )
      .groupBy(aiCreditsTransactions.operationType);

    // Get daily usage trend
    const dailyUsage = await db.select({
      date: sql`DATE(${aiCreditsTransactions.createdAt})`,
      credits: sql`SUM(ABS(${aiCreditsTransactions.amount}))::int`,
    })
      .from(aiCreditsTransactions)
      .where(
        and(
          eq(aiCreditsTransactions.userId, req.user.id),
          eq(aiCreditsTransactions.transactionType, 'usage'),
          gte(aiCreditsTransactions.createdAt, startOfMonth)
        )
      )
      .groupBy(sql`DATE(${aiCreditsTransactions.createdAt})`)
      .orderBy(sql`DATE(${aiCreditsTransactions.createdAt})`);

    res.json({
      usageByType,
      dailyUsage,
      period: {
        start: startOfMonth.toISOString(),
        end: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching usage analytics:', error);
    res.status(500).json({ error: 'Failed to fetch usage analytics' });
  }
});

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * Run grandfather migration (admin only)
 */
router.post('/admin/grandfather-migration', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user is admin (you should implement proper admin check)
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // For now, check if user email is admin email
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    if (!adminEmails.includes(user.email)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await grandfatherExistingUsers();
    
    res.json(result);
  } catch (error) {
    console.error('Error running grandfather migration:', error);
    res.status(500).json({ error: 'Failed to run migration' });
  }
});

export default router;
