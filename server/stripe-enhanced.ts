/**
 * Enhanced Stripe Integration for Multi-tier Subscriptions with Usage-based Billing
 */

import Stripe from 'stripe';
import { db } from './db';
import { users, subscriptions, subscriptionPlans, aiCreditsTransactions, teams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Stripe Product/Price IDs (replace with actual IDs from Stripe Dashboard)
export const STRIPE_PRODUCTS = {
  PRO: {
    productId: process.env.STRIPE_PRO_PRODUCT_ID || 'prod_pro_v2',
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_v2_monthly',
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || 'price_pro_v2_annual',
  },
  TEAM: {
    productId: process.env.STRIPE_TEAM_PRODUCT_ID || 'prod_team_v2',
    monthlyPriceId: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || 'price_team_v2_monthly',
    annualPriceId: process.env.STRIPE_TEAM_ANNUAL_PRICE_ID || 'price_team_v2_annual',
  },
  ENTERPRISE: {
    productId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID || 'prod_enterprise_v2',
    customPriceId: process.env.STRIPE_ENTERPRISE_CUSTOM_PRICE_ID || 'price_enterprise_v2_custom',
  },
  AI_CREDITS: {
    productId: process.env.STRIPE_AI_CREDITS_PRODUCT_ID || 'prod_ai_credits',
    // Different credit packages
    credits_100: process.env.STRIPE_CREDITS_100_PRICE_ID || 'price_credits_100',
    credits_500: process.env.STRIPE_CREDITS_500_PRICE_ID || 'price_credits_500',
    credits_1000: process.env.STRIPE_CREDITS_1000_PRICE_ID || 'price_credits_1000',
    credits_5000: process.env.STRIPE_CREDITS_5000_PRICE_ID || 'price_credits_5000',
  }
};

// Credit package definitions
export const CREDIT_PACKAGES = [
  { credits: 100, price: 1.99, priceId: STRIPE_PRODUCTS.AI_CREDITS.credits_100 },
  { credits: 500, price: 8.99, priceId: STRIPE_PRODUCTS.AI_CREDITS.credits_500 },
  { credits: 1000, price: 15.99, priceId: STRIPE_PRODUCTS.AI_CREDITS.credits_1000 },
  { credits: 5000, price: 69.99, priceId: STRIPE_PRODUCTS.AI_CREDITS.credits_5000 },
];

/**
 * Create a team subscription (for Team and Enterprise plans)
 */
export async function createTeamSubscription(data: {
  teamName: string;
  ownerId: number;
  tier: 'team' | 'enterprise';
  memberEmails: string[];
  paymentMethodId: string;
  billingEmail: string;
}): Promise<{ subscription: Stripe.Subscription; teamId: number }> {
  try {
    // Validate minimum team size for Team plan
    if (data.tier === 'team' && data.memberEmails.length < 3) {
      throw new Error('Team plan requires minimum 3 members');
    }

    // Create team in database
    const [team] = await db.insert(teams).values({
      name: data.teamName,
      ownerId: data.ownerId,
      subscriptionTier: data.tier,
      maxMembers: data.tier === 'enterprise' ? 999999 : data.memberEmails.length,
      currentMembers: 1, // Owner counts as first member
      pooledAiCredits: data.tier === 'enterprise' ? 999999 : 5000 * data.memberEmails.length,
    }).returning();

    // Update owner's team association
    await db.update(users)
      .set({ 
        teamId: team.id,
        teamRole: 'owner',
        subscriptionTier: data.tier
      })
      .where(eq(users.id, data.ownerId));

    // Get or create Stripe customer
    const owner = await db.select().from(users).where(eq(users.id, data.ownerId)).limit(1);
    let customerId = owner[0].stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: data.billingEmail,
        name: data.teamName,
        metadata: {
          teamId: team.id.toString(),
          ownerId: data.ownerId.toString(),
          teamName: data.teamName,
        }
      });
      customerId = customer.id;
      
      await db.update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, data.ownerId));
    }

    // Attach payment method
    await stripe.paymentMethods.attach(data.paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: data.paymentMethodId,
      },
    });

    // Create subscription with quantity based on team size
    const priceId = data.tier === 'enterprise' 
      ? STRIPE_PRODUCTS.ENTERPRISE.customPriceId
      : STRIPE_PRODUCTS.TEAM.monthlyPriceId;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{
        price: priceId,
        quantity: data.memberEmails.length, // Charge per seat
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: { 
        save_default_payment_method: 'on_subscription' 
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        teamId: team.id.toString(),
        teamName: data.teamName,
        tier: data.tier,
      }
    });

    // Save subscription to database
    await db.insert(subscriptions).values({
      userId: data.ownerId,
      teamId: team.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    // Send invitations to team members
    for (const email of data.memberEmails) {
      if (email !== owner[0].email) {
        // TODO: Send invitation email
        console.log(`Invitation would be sent to ${email} to join team ${data.teamName}`);
      }
    }

    return { subscription, teamId: team.id };

  } catch (error) {
    console.error('Error creating team subscription:', error);
    throw error;
  }
}

/**
 * Purchase additional AI credits
 */
export async function purchaseAICredits(data: {
  userId: number;
  creditPackage: typeof CREDIT_PACKAGES[0];
  paymentMethodId?: string;
}): Promise<Stripe.PaymentIntent> {
  try {
    const user = await db.select().from(users).where(eq(users.id, data.userId)).limit(1);
    if (!user[0]) {
      throw new Error('User not found');
    }

    let customerId = user[0].stripeCustomerId;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user[0].email,
        metadata: { userId: data.userId.toString() }
      });
      customerId = customer.id;
      
      await db.update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, data.userId));
    }

    // Create one-time payment for credits
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(data.creditPackage.price * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      payment_method: data.paymentMethodId,
      confirm: true,
      metadata: {
        userId: data.userId.toString(),
        credits: data.creditPackage.credits.toString(),
        type: 'credit_purchase'
      },
      description: `Purchase of ${data.creditPackage.credits} AI Credits`,
    });

    // If payment successful, add credits to user account
    if (paymentIntent.status === 'succeeded') {
      await addCreditsToUser(
        data.userId,
        data.creditPackage.credits,
        paymentIntent.id,
        data.creditPackage.price
      );
    }

    return paymentIntent;

  } catch (error) {
    console.error('Error purchasing AI credits:', error);
    throw error;
  }
}

/**
 * Add credits to user account and create transaction record
 */
async function addCreditsToUser(
  userId: number,
  credits: number,
  stripePaymentIntentId: string,
  purchaseAmount: number
): Promise<void> {
  await db.transaction(async (tx) => {
    // Get current balance
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    const currentBalance = user.ai_credits_balance || 0;
    const newBalance = currentBalance + credits;

    // Update user balance
    await tx.update(users)
      .set({ 
        ai_credits_balance: newBalance,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    // Create transaction record
    await tx.insert(aiCreditsTransactions).values({
      userId,
      transactionType: 'purchase',
      amount: credits,
      balanceAfter: newBalance,
      stripePaymentIntentId,
      purchaseAmountCents: Math.round(purchaseAmount * 100),
      description: `Purchased ${credits} AI Credits`,
    });
  });
}

/**
 * Update team subscription (add/remove seats)
 */
export async function updateTeamSeats(
  teamId: number,
  newSeatCount: number
): Promise<Stripe.Subscription> {
  try {
    // Get team and subscription info
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      throw new Error('Team not found');
    }

    const [subscription] = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.teamId, teamId));
    
    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new Error('No active subscription found for team');
    }

    // Update subscription quantity in Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [{
          id: stripeSubscription.items.data[0].id,
          quantity: newSeatCount,
        }],
        proration_behavior: 'always_invoice', // Create prorated invoice immediately
      }
    );

    // Update team limits
    await db.update(teams)
      .set({
        maxMembers: newSeatCount,
        pooledAiCredits: 5000 * newSeatCount, // Adjust pooled credits
        updatedAt: new Date()
      })
      .where(eq(teams.id, teamId));

    return updatedSubscription;

  } catch (error) {
    console.error('Error updating team seats:', error);
    throw error;
  }
}

/**
 * Handle usage-based billing for AI operations
 */
export async function trackAIUsage(data: {
  userId: number;
  operationType: 'chat' | 'codebase_analysis' | 'app_generation' | 'code_review' | 'advanced_model';
  modelUsed: string;
  tokensConsumed: number;
}): Promise<{ creditsUsed: number; remainingBalance: number }> {
  // Calculate credits based on operation type and model
  const creditCosts = {
    chat: 1,
    codebase_analysis: 10,
    app_generation: 50,
    code_review: 5,
    advanced_model: 3, // Multiplier for premium models
  };

  let creditsToDeduct = creditCosts[data.operationType] || 1;
  
  // Apply multiplier for premium models
  if (data.modelUsed.includes('gpt-4') || data.modelUsed.includes('claude-3')) {
    creditsToDeduct *= creditCosts.advanced_model;
  }

  // Additional cost for high token usage
  if (data.tokensConsumed > 10000) {
    creditsToDeduct += Math.ceil(data.tokensConsumed / 10000);
  }

  return await db.transaction(async (tx) => {
    // Get user and check if part of a team
    const [user] = await tx.select().from(users).where(eq(users.id, data.userId));
    
    if (!user) {
      throw new Error('User not found');
    }

    let currentBalance: number;
    let newBalance: number;

    if (user.teamId) {
      // Use team pooled credits
      const [team] = await tx.select().from(teams).where(eq(teams.id, user.teamId));
      currentBalance = team.pooled_ai_credits || 0;
      
      if (currentBalance < creditsToDeduct) {
        throw new Error('Insufficient AI credits');
      }

      newBalance = currentBalance - creditsToDeduct;
      
      await tx.update(teams)
        .set({
          pooled_ai_credits: newBalance,
          pooled_credits_used_this_month: (team.pooled_credits_used_this_month || 0) + creditsToDeduct,
        })
        .where(eq(teams.id, user.teamId));

    } else {
      // Use individual credits
      currentBalance = user.ai_credits_balance || 0;
      
      if (currentBalance < creditsToDeduct) {
        throw new Error('Insufficient AI credits');
      }

      newBalance = currentBalance - creditsToDeduct;
      
      await tx.update(users)
        .set({
          ai_credits_balance: newBalance,
          ai_credits_used_this_month: (user.ai_credits_used_this_month || 0) + creditsToDeduct,
        })
        .where(eq(users.id, data.userId));
    }

    // Record transaction
    await tx.insert(aiCreditsTransactions).values({
      userId: data.userId,
      teamId: user.teamId,
      transactionType: 'usage',
      amount: -creditsToDeduct, // Negative for usage
      balanceAfter: newBalance,
      operationType: data.operationType,
      modelUsed: data.modelUsed,
      tokensConsumed: data.tokensConsumed,
      description: `Used ${creditsToDeduct} credits for ${data.operationType}`,
    });

    return {
      creditsUsed: creditsToDeduct,
      remainingBalance: newBalance,
    };
  });
}

/**
 * Check if user has sufficient credits for an operation
 */
export async function checkCreditBalance(
  userId: number,
  requiredCredits: number
): Promise<{ hasCredits: boolean; currentBalance: number; isTeamPooled: boolean }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  
  if (!user) {
    return { hasCredits: false, currentBalance: 0, isTeamPooled: false };
  }

  if (user.teamId) {
    const [team] = await db.select().from(teams).where(eq(teams.id, user.teamId));
    const balance = team?.pooled_ai_credits || 0;
    return {
      hasCredits: balance >= requiredCredits,
      currentBalance: balance,
      isTeamPooled: true,
    };
  }

  const balance = user.ai_credits_balance || 0;
  return {
    hasCredits: balance >= requiredCredits,
    currentBalance: balance,
    isTeamPooled: false,
  };
}

export default {
  createTeamSubscription,
  purchaseAICredits,
  updateTeamSeats,
  trackAIUsage,
  checkCreditBalance,
  STRIPE_PRODUCTS,
  CREDIT_PACKAGES,
};
