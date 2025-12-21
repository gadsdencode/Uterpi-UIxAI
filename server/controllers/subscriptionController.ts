// Subscription Controller - Handles subscription and billing routes
// Plans, status, checkout, credits, Stripe integration

import type { Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { users, subscriptions, subscriptionPlans, subscriptionFeatures, aiCreditsTransactions } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { 
  createStripeCustomer, 
  createSetupIntent, 
  createSubscription, 
  cancelSubscription, 
  reactivateSubscription, 
  createBillingPortalSession, 
  syncSubscriptionFromStripe,
  createSubscriptionCheckoutSession, 
  createCreditsCheckoutSession, 
  getCheckoutSession
} from "../stripe-consolidated";

/**
 * Subscription Controller - Handles all subscription-related routes
 */
export class SubscriptionController {

  /**
   * Get available subscription plans
   */
  async getPlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .orderBy(subscriptionPlans.sortOrder);
      
      res.json({ 
        success: true, 
        plans 
      });
    } catch (error) {
      console.error("Get subscription plans error:", error);
      res.status(500).json({ error: "Failed to get subscription plans" });
    }
  }

  /**
   * Get user's subscription status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Get user's current subscription
      const subscription = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, req.user!.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      const subscriptionData = subscription[0] || null;
      let planData = null;

      if (subscriptionData?.planId) {
        const plan = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, subscriptionData.planId))
          .limit(1);
        planData = plan[0] || null;
      }

      res.json({
        success: true,
        subscription: {
          status: user.subscriptionStatus || 'freemium',
          tier: user.subscriptionTier || 'freemium',
          endsAt: user.subscriptionEndsAt,
          plan: planData,
          details: subscriptionData,
          hasAdminOverride: user.accessOverride || false,
        }
      });
    } catch (error) {
      console.error("Get subscription status error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  }

  /**
   * Get detailed subscription information
   */
  async getDetails(req: Request, res: Response): Promise<void> {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const tier = user.subscriptionTier || 'freemium';
      
      // Get features from subscription_features table
      const [features] = await db.select()
        .from(subscriptionFeatures)
        .where(eq(subscriptionFeatures.tierName, tier));
      
      const monthlyMessageAllowance = features?.monthlyMessageAllowance || 0;
      const messagesUsed = user.messages_used_this_month || 0;
      const messagesRemaining = Math.max(0, monthlyMessageAllowance - messagesUsed);
      
      res.json({
        hasAccess: ['active', 'trialing', 'freemium'].includes(user.subscriptionStatus || tier) || user.accessOverride,
        hasAdminOverride: user.accessOverride || false,
        tier,
        features: {
          unlimitedChat: features?.unlimitedChat || false,
          monthlyMessageAllowance,
          messagesUsedThisMonth: messagesUsed,
          messagesRemaining,
          aiProvidersAccess: features?.aiProvidersAccess || ['basic'],
          monthlyAiCredits: features?.monthlyAiCredits || 0,
          currentCreditsBalance: user.ai_credits_balance || 0,
          maxProjects: features?.maxProjects || 1,
          fullCodebaseContext: features?.fullCodebaseContext || false,
          gitIntegration: features?.gitIntegration || false,
          aiCodeReviewsPerMonth: features?.aiCodeReviewsPerMonth || 0,
          aiCodeReviewsUsed: 0,
          teamFeaturesEnabled: features?.teamFeaturesEnabled || false,
          sharedWorkspaces: features?.sharedWorkspaces || false,
          ssoEnabled: features?.ssoEnabled || false,
          auditLogs: features?.auditLogs || false,
          supportLevel: features?.supportLevel || 'email'
        },
        isGrandfathered: user.is_grandfathered || false,
        grandfatheredFrom: user.grandfathered_from_tier
      });
    } catch (error) {
      console.error("Get subscription details error:", error);
      res.status(500).json({ error: "Failed to get subscription details" });
    }
  }

  /**
   * Get credits balance
   */
  async getCreditsBalance(req: Request, res: Response): Promise<void> {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const currentBalance = user.ai_credits_balance || 0;
      
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const transactions = await db.select()
        .from(aiCreditsTransactions)
        .where(
          and(
            eq(aiCreditsTransactions.userId, req.user!.id),
            gte(aiCreditsTransactions.createdAt, startOfMonth)
          )
        )
        .orderBy(desc(aiCreditsTransactions.createdAt))
        .limit(10);

      res.json({
        balance: currentBalance,
        isTeamPooled: false,
        recentTransactions: transactions,
      });
    } catch (error) {
      console.error("Get credits balance error:", error);
      res.status(500).json({ error: "Failed to get credits balance" });
    }
  }

  /**
   * Create setup intent for payment method
   */
  async createSetupIntent(req: Request, res: Response): Promise<void> {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      let customerId = user.stripeCustomerId;

      if (!customerId) {
        const customer = await createStripeCustomer({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { userId: user.id.toString() }
        });
        
        customerId = customer.id;
        
        await db.update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, user.id));
      }

      const setupIntent = await createSetupIntent(customerId);

      res.json({
        success: true,
        clientSecret: setupIntent.client_secret,
        customerId
      });
    } catch (error) {
      console.error("Create setup intent error:", error);
      res.status(500).json({ error: "Failed to create setup intent" });
    }
  }

  /**
   * Create subscription
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { planId, paymentMethodId } = req.body;
      
      if (!planId) {
        res.status(400).json({ error: "Plan ID is required" });
        return;
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const plan = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);

      if (!plan[0]) {
        res.status(404).json({ error: "Subscription plan not found" });
        return;
      }

      const planData = plan[0];

      // For free plans, just update user status
      if (planData.price === '0.00') {
        await db.update(users)
          .set({
            subscriptionStatus: 'active',
            subscriptionTier: planData.name.toLowerCase(),
            updatedAt: new Date()
          })
          .where(eq(users.id, user.id));

        res.json({
          success: true,
          message: "Free plan activated successfully"
        });
        return;
      }

      if (!paymentMethodId) {
        res.status(400).json({ error: "Payment method is required for paid plans" });
        return;
      }

      let customerId = user.stripeCustomerId;

      if (!customerId) {
        const customer = await createStripeCustomer({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
          metadata: { userId: user.id.toString() }
        });
        
        customerId = customer.id;
        
        await db.update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, user.id));
      }

      const subscription = await createSubscription({
        customerId,
        priceId: planData.stripePriceId,
        paymentMethodId
      });

      await syncSubscriptionFromStripe(subscription.id, user.id);

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          clientSecret: (typeof subscription.latest_invoice === 'object' && subscription.latest_invoice) 
            ? (subscription.latest_invoice as any)?.payment_intent?.client_secret 
            : undefined
        }
      });
    } catch (error) {
      console.error("Create subscription error:", error);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  }

  /**
   * Cancel subscription
   */
  async cancel(req: Request, res: Response): Promise<void> {
    try {
      const { immediate = false } = req.body;
      
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const subscription = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, req.user!.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (!subscription[0]?.stripeSubscriptionId) {
        res.status(404).json({ error: "No active subscription found" });
        return;
      }

      const canceledSubscription = await cancelSubscription(
        subscription[0].stripeSubscriptionId,
        !immediate
      );

      await syncSubscriptionFromStripe(canceledSubscription.id, user.id);

      res.json({
        success: true,
        message: immediate ? "Subscription canceled immediately" : "Subscription will cancel at period end"
      });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  }

  /**
   * Reactivate subscription
   */
  async reactivate(req: Request, res: Response): Promise<void> {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const subscription = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, req.user!.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

      if (!subscription[0]?.stripeSubscriptionId) {
        res.status(404).json({ error: "No subscription found" });
        return;
      }

      const reactivatedSubscription = await reactivateSubscription(
        subscription[0].stripeSubscriptionId
      );

      await syncSubscriptionFromStripe(reactivatedSubscription.id, user.id);

      res.json({
        success: true,
        message: "Subscription reactivated successfully"
      });
    } catch (error) {
      console.error("Reactivate subscription error:", error);
      res.status(500).json({ error: "Failed to reactivate subscription" });
    }
  }

  /**
   * Create billing portal session
   */
  async billingPortal(req: Request, res: Response): Promise<void> {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user?.stripeCustomerId) {
        res.status(404).json({ error: "No Stripe customer found" });
        return;
      }

      const session = await createBillingPortalSession(
        user.stripeCustomerId,
        `${req.protocol}://${req.get('host')}/dashboard`
      );

      res.json({
        success: true,
        url: session.url
      });
    } catch (error) {
      console.error("Create billing portal session error:", error);
      res.status(500).json({ error: "Failed to create billing portal session" });
    }
  }

  /**
   * Create subscription checkout session
   */
  async checkoutSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { tier, interval, teamName, memberEmails } = req.body;
      
      if (!tier || !interval) {
        res.status(400).json({ error: "Tier and interval are required" });
        return;
      }

      if (!['pro', 'team', 'enterprise'].includes(tier)) {
        res.status(400).json({ error: "Invalid subscription tier" });
        return;
      }

      if (!['month', 'year'].includes(interval)) {
        res.status(400).json({ error: "Invalid billing interval" });
        return;
      }

      if (tier === 'enterprise') {
        res.status(400).json({ 
          error: "Enterprise plans require custom pricing. Please contact sales.",
          contactSales: true 
        });
        return;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await createSubscriptionCheckoutSession({
        userId: req.user!.id,
        tier,
        interval,
        successUrl: `${baseUrl}/checkout/success`,
        cancelUrl: `${baseUrl}/checkout/cancel`,
        teamName,
        memberEmails,
      });

      res.json({ 
        success: true, 
        sessionId: session.id,
        url: session.url 
      });
    } catch (error) {
      console.error("Create subscription checkout error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create checkout session" 
      });
    }
  }

  /**
   * Create credits checkout session
   */
  async checkoutCredits(req: Request, res: Response): Promise<void> {
    try {
      const { packageId } = req.body;
      
      if (!packageId) {
        res.status(400).json({ error: "Package ID is required" });
        return;
      }

      const validPackages = ['credits_100', 'credits_500', 'credits_1000', 'credits_5000'];
      if (!validPackages.includes(packageId)) {
        res.status(400).json({ error: "Invalid credit package" });
        return;
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await createCreditsCheckoutSession({
        userId: req.user!.id,
        packageId,
        successUrl: `${baseUrl}/checkout/success`,
        cancelUrl: `${baseUrl}/checkout/cancel`,
      });

      res.json({ 
        success: true, 
        sessionId: session.id,
        url: session.url 
      });
    } catch (error) {
      console.error("Create credits checkout error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create checkout session" 
      });
    }
  }

  /**
   * Get checkout session details
   */
  async getCheckoutSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({ error: "Session ID is required" });
        return;
      }

      const session = await getCheckoutSession(sessionId);
      
      // Verify this session belongs to the authenticated user
      const sessionUserId = parseInt(session.metadata?.userId || '0');
      if (sessionUserId !== req.user!.id) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      res.json({
        success: true,
        session: {
          id: session.id,
          status: session.status,
          mode: session.mode,
          amountTotal: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_details?.email,
          paymentStatus: session.payment_status,
          metadata: session.metadata,
        }
      });
    } catch (error) {
      console.error("Get checkout session error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to retrieve checkout session" 
      });
    }
  }
}

// Export singleton instance
export const subscriptionController = new SubscriptionController();

