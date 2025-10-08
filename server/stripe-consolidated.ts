/**
 * Consolidated Stripe Integration Module
 * 
 * This module consolidates all Stripe-related functionality from:
 * - stripe.ts (core operations)
 * - stripe-checkout.ts (checkout sessions)
 * - stripe-enhanced.ts (advanced features)
 * 
 * Organized into logical sections for better maintainability and clarity.
 */

import Stripe from 'stripe';
import { db } from './db';
import { 
  users, 
  subscriptions, 
  subscriptionPlans, 
  aiCreditsTransactions, 
  subscriptionFeatures,
  teams 
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { User, SubscriptionPlan } from '@shared/schema';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
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

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CreateCustomerData {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionData {
  customerId: string;
  priceId: string;
  paymentMethodId?: string;
  trialPeriodDays?: number;
}

// ============================================================================
// CORE STRIPE OPERATIONS
// ============================================================================

/**
 * Create a Stripe customer
 */
export async function createStripeCustomer(data: CreateCustomerData): Promise<Stripe.Customer> {
  try {
    const customer = await stripe.customers.create({
      email: data.email,
      name: data.name,
      metadata: data.metadata || {},
    });
    
    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw new Error('Failed to create customer in Stripe');
  }
}

/**
 * Create a subscription setup intent for collecting payment method
 */
export async function createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    });
    
    return setupIntent;
  } catch (error) {
    console.error('Error creating setup intent:', error);
    throw new Error('Failed to create setup intent');
  }
}

/**
 * Create a subscription
 */
export async function createSubscription(data: CreateSubscriptionData): Promise<Stripe.Subscription> {
  try {
    const subscriptionData: Stripe.SubscriptionCreateParams = {
      customer: data.customerId,
      items: [{ price: data.priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    };

    // Add payment method if provided
    if (data.paymentMethodId) {
      subscriptionData.default_payment_method = data.paymentMethodId;
    }

    // Add trial period if specified
    if (data.trialPeriodDays) {
      subscriptionData.trial_period_days = data.trialPeriodDays;
    }

    const subscription = await stripe.subscriptions.create(subscriptionData);
    
    return subscription;
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw new Error('Failed to create subscription');
  }
}

/**
 * Retrieve a subscription from Stripe
 */
export async function getStripeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    throw new Error('Failed to retrieve subscription');
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string, atPeriodEnd: boolean = true): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: atPeriodEnd,
    });
    
    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

/**
 * Reactivate a subscription
 */
export async function reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    
    return subscription;
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    throw new Error('Failed to reactivate subscription');
  }
}

/**
 * Create a billing portal session for customer self-service
 */
export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    return session;
  } catch (error) {
    console.error('Error creating billing portal session:', error);
    throw new Error('Failed to create billing portal session');
  }
}

/**
 * Sync subscription data from Stripe to database
 */
export async function syncSubscriptionFromStripe(stripeSubscriptionId: string, userId: number): Promise<void> {
  try {
    const stripeSubscription = await getStripeSubscription(stripeSubscriptionId);
    const priceId = stripeSubscription.items.data[0]?.price.id;
    
    // Find the plan in our database
    const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.stripePriceId, priceId)).limit(1);
    
    const subscriptionData = {
      userId,
      planId: plan[0]?.id || null,
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: priceId,
      status: stripeSubscription.status,
      currentPeriodStart: stripeSubscription.items.data[0]?.current_period_start ? new Date(stripeSubscription.items.data[0].current_period_start * 1000) : null,
      currentPeriodEnd: stripeSubscription.items.data[0]?.current_period_end ? new Date(stripeSubscription.items.data[0].current_period_end * 1000) : null,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
      trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
      trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
      updatedAt: new Date(),
    };

    // Check if subscription already exists
    const existingSubscription = await db.select().from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);

    if (existingSubscription.length > 0) {
      // Update existing subscription
      await db.update(subscriptions)
        .set(subscriptionData)
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    } else {
      // Create new subscription record
      await db.insert(subscriptions).values(subscriptionData);
    }

    // Update user subscription status
    const tier = plan[0]?.name.toLowerCase() || 'freemium';
    await db.update(users)
      .set({
        subscriptionStatus: stripeSubscription.status,
        subscriptionTier: tier,
        subscriptionEndsAt: stripeSubscription.items.data[0]?.current_period_end ? new Date(stripeSubscription.items.data[0].current_period_end * 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

  } catch (error) {
    console.error('Error syncing subscription from Stripe:', error);
    throw new Error('Failed to sync subscription data');
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error('Invalid webhook signature');
  }
}

// ============================================================================
// CHECKOUT SESSIONS
// ============================================================================

/**
 * Create Checkout Session for Subscription Plans
 */
export async function createSubscriptionCheckoutSession(params: {
  userId: number;
  tier: 'pro' | 'team' | 'enterprise';
  interval: 'month' | 'year';
  successUrl: string;
  cancelUrl: string;
  teamName?: string;
  memberEmails?: string[];
}): Promise<Stripe.Checkout.Session> {
  
  // Get user from database
  const [user] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) {
    throw new Error('User not found');
  }

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.username || user.email.split('@')[0],
      metadata: {
        userId: params.userId.toString(),
        tier: params.tier,
      }
    });
    customerId = customer.id;
    
    // Update user with Stripe customer ID
    await db.update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, params.userId));
  }

  // Get the correct price ID based on tier and interval
  let priceId: string;
  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  
  switch (params.tier) {
    case 'pro':
      priceId = params.interval === 'year' 
        ? STRIPE_PRODUCTS.PRO.annualPriceId 
        : STRIPE_PRODUCTS.PRO.monthlyPriceId;
      lineItems = [{ price: priceId, quantity: 1 }];
      break;
      
    case 'team':
      priceId = params.interval === 'year' 
        ? STRIPE_PRODUCTS.TEAM.annualPriceId 
        : STRIPE_PRODUCTS.TEAM.monthlyPriceId;
      // Default to minimum 3 members for team plan (users can add more members later)
      const teamSize = Math.max(params.memberEmails?.length || 3, 3);
      lineItems = [{ price: priceId, quantity: teamSize }];
      break;
      
    case 'enterprise':
      // Enterprise uses custom pricing - redirect to contact sales
      throw new Error('Enterprise plans require custom pricing. Please contact sales.');
      
    default:
      throw new Error('Invalid subscription tier');
  }

  // Create checkout session
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    success_url: params.successUrl + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: params.cancelUrl,
    
    // Subscription-specific settings  
    billing_address_collection: 'auto',
    
    // Allow coupon codes
    allow_promotion_codes: true,
    
    // Metadata for webhook processing
    metadata: {
      userId: params.userId.toString(),
      tier: params.tier,
      interval: params.interval,
      teamName: params.teamName || '',
      memberEmails: params.memberEmails?.join(',') || '',
    },
    
    // Tax collection disabled to prevent customer_tax_location_invalid errors
    // Enable this after implementing proper address validation
    // automatic_tax: { enabled: true },
    
    // Customer update options
    customer_update: {
      address: 'auto',
      name: 'auto',
    }
  };

  return await stripe.checkout.sessions.create(sessionParams);
}

/**
 * Create Checkout Session for AI Credit Packages
 */
export async function createCreditsCheckoutSession(params: {
  userId: number;
  packageId: string; // e.g., 'credits_500'
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  
  // Get user from database
  const [user] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user) {
    throw new Error('User not found');
  }

  // Find the credit package
  const creditPackage = CREDIT_PACKAGES.find(pkg => 
    pkg.priceId === STRIPE_PRODUCTS.AI_CREDITS[params.packageId as keyof typeof STRIPE_PRODUCTS.AI_CREDITS]
  );
  
  if (!creditPackage) {
    throw new Error('Invalid credit package');
  }

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.username || user.email.split('@')[0],
      metadata: {
        userId: params.userId.toString(),
      }
    });
    customerId = customer.id;
    
    // Update user with Stripe customer ID
    await db.update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, params.userId));
  }

  // Create checkout session for one-time payment
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    customer: customerId,
    line_items: [{
      price: creditPackage.priceId,
      quantity: 1,
    }],
    success_url: params.successUrl + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: params.cancelUrl,
    
    // One-time payment settings
    billing_address_collection: 'auto',
    
    // Allow coupon codes
    allow_promotion_codes: true,
    
    // Metadata for webhook processing
    metadata: {
      userId: params.userId.toString(),
      type: 'ai_credits',
      packageId: params.packageId,
      credits: creditPackage.credits.toString(),
      amount: creditPackage.price.toString(),
    },
    
    // Tax collection disabled to prevent customer_tax_location_invalid errors
    // Enable this after implementing proper address validation  
    // automatic_tax: { enabled: true },
  };

  return await stripe.checkout.sessions.create(sessionParams);
}

/**
 * Retrieve checkout session details
 */
export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'payment_intent']
  });
}

// ============================================================================
// CHECKOUT SUCCESS HANDLERS
// ============================================================================

/**
 * Handle successful subscription checkout completion
 */
export async function handleSubscriptionCheckoutSuccess(session: Stripe.Checkout.Session): Promise<void> {
  const userId = parseInt(session.metadata?.userId || '0');
  const tier = session.metadata?.tier;
  const interval = session.metadata?.interval;
  const teamName = session.metadata?.teamName;
  const memberEmails = session.metadata?.memberEmails?.split(',') || [];
  
  if (!userId || !tier) {
    console.error('Missing required metadata in checkout session:', session.id);
    return;
  }

  try {
    // Create subscription record in database
    const subscriptionData = {
      userId,
      stripeSubscriptionId: session.subscription as string,
      stripeCustomerId: session.customer as string,
      stripePriceId: (session as any).line_items?.data[0]?.price?.id || '',
      status: 'active',
      tier,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + (interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000),
      metadata: {
        checkoutSessionId: session.id,
        teamName,
        memberCount: memberEmails.length,
        interval,
      }
    };

    await db.insert(subscriptions).values(subscriptionData);

    // Update user subscription status
    await db.update(users)
      .set({
        subscriptionStatus: 'active',
        subscriptionTier: tier,
        stripeCustomerId: session.customer as string,
      })
      .where(eq(users.id, userId));

    // Grant initial monthly credits for this tier (idempotent by subscription id)
    try {
      await grantMonthlyCreditsForTier({
        userId,
        tier,
        source: 'activation',
        subscriptionId: (session.subscription as string) || undefined,
      });
    } catch (grantError) {
      console.error('Granting initial monthly credits failed:', grantError);
    }

    // Handle team-specific setup if it's a team plan
    if (tier === 'team' && teamName && memberEmails.length >= 3) {
      // TODO: Create team and send invites to members
      // This would integrate with your existing team creation logic
    }

    console.log(`Subscription created successfully for user ${userId}, tier: ${tier}`);
    
  } catch (error) {
    console.error('Error handling subscription checkout success:', error);
    throw error;
  }
}

/**
 * Grant monthly credits for a user's tier. Idempotent based on a deterministic description key.
 */
export async function grantMonthlyCreditsForTier(params: {
  userId: number;
  tier: string;
  source: 'activation' | 'invoice';
  subscriptionId?: string;
  invoiceId?: string;
  periodStart?: number; // unix seconds
}): Promise<void> {
  // Determine description key for idempotency
  const descriptorParts = [
    'Monthly', params.source === 'activation' ? 'activation' : 'renewal', 'credits',
    `tier:${params.tier.toLowerCase()}`,
  ];
  if (params.subscriptionId) descriptorParts.push(`sub:${params.subscriptionId}`);
  if (params.invoiceId) descriptorParts.push(`inv:${params.invoiceId}`);
  if (params.periodStart) descriptorParts.push(`periodStart:${params.periodStart}`);
  const descriptionKey = descriptorParts.join(' ');

  await db.transaction(async (tx) => {
    // Check if already granted (idempotency via exact description match)
    const existing = await tx.select().from(aiCreditsTransactions)
      .where(eq(aiCreditsTransactions.userId, params.userId))
      .limit(50); // small window scan
    const alreadyExists = existing.some(r => (r.description || '') === descriptionKey);
    if (alreadyExists) {
      return; // already granted
    }

    // Look up monthly credits for the tier
    const [features] = await tx.select().from(subscriptionFeatures)
      .where(eq(subscriptionFeatures.tierName, params.tier.toLowerCase()));
    const monthlyCredits = Number(features?.monthlyAiCredits || 0);
    if (!monthlyCredits || monthlyCredits <= 0) {
      return; // nothing to grant
    }

    // Get current balance
    const [user] = await tx.select().from(users).where(eq(users.id, params.userId));
    if (!user) return;
    const currentBalance = user.ai_credits_balance || 0;
    const newBalance = currentBalance + monthlyCredits;

    // Update balance
    await tx.update(users)
      .set({ ai_credits_balance: newBalance, updatedAt: new Date() })
      .where(eq(users.id, params.userId));

    // Record transaction
    await tx.insert(aiCreditsTransactions).values({
      userId: params.userId,
      transactionType: 'bonus',
      amount: monthlyCredits,
      balanceAfter: newBalance,
      description: descriptionKey,
      metadata: {
        type: 'monthly_grant',
        source: params.source,
        tier: params.tier,
        subscriptionId: params.subscriptionId,
        invoiceId: params.invoiceId,
        periodStart: params.periodStart,
      } as any,
    });
  });
}

/**
 * Handle successful AI credits checkout completion
 */
export async function handleCreditsCheckoutSuccess(session: Stripe.Checkout.Session): Promise<void> {
  const userId = parseInt(session.metadata?.userId || '0');
  const credits = parseInt(session.metadata?.credits || '0');
  const amount = parseFloat(session.metadata?.amount || '0');
  const packageId = session.metadata?.packageId;
  
  if (!userId || !credits || !amount) {
    console.error('Missing required metadata in checkout session:', session.id, {
      userId,
      credits,
      amount,
      packageId,
      metadata: session.metadata
    });
    throw new Error(`Invalid checkout session metadata for session ${session.id}`);
  }

  try {
    // Check if this transaction has already been processed
    const existingTransaction = await db.select()
      .from(aiCreditsTransactions)
      .where(
        and(
          eq(aiCreditsTransactions.userId, userId),
          eq(aiCreditsTransactions.stripePaymentIntentId, session.payment_intent as string)
        )
      )
      .limit(1);

    if (existingTransaction.length > 0) {
      console.log(`Credits checkout already processed for session ${session.id}, skipping duplicate processing`);
      return;
    }

    // Execute both operations atomically within a transaction
    await db.transaction(async (tx) => {
      // Get user and calculate new balance
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        throw new Error(`User ${userId} not found for checkout session ${session.id}`);
      }

      const newBalance = (user.ai_credits_balance || 0) + credits;
      
      // Update user balance
      await tx.update(users)
        .set({ ai_credits_balance: newBalance, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Create transaction record
      await tx.insert(aiCreditsTransactions).values({
        userId,
        transactionType: 'purchase',
        amount: credits,
        balanceAfter: newBalance,
        stripePaymentIntentId: session.payment_intent as string,
        description: `Purchased ${credits} AI credits`,
        metadata: {
          checkoutSessionId: session.id,
          packageId,
          priceUsd: amount,
          processedAt: new Date().toISOString(),
        }
      });
    });

    const finalBalance = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]?.ai_credits_balance || 0;
    console.log(`✅ Successfully added ${credits} AI credits to user ${userId}, new balance: ${finalBalance}`);
    
  } catch (error) {
    console.error(`❌ Error handling credits checkout success for session ${session.id}:`, error);
    
    // Log detailed error information for debugging
    console.error('Checkout session details:', {
      sessionId: session.id,
      userId,
      credits,
      amount,
      packageId,
      paymentIntent: session.payment_intent,
      metadata: session.metadata
    });
    
    throw error;
  }
}

// ============================================================================
// TEAM SUBSCRIPTIONS
// ============================================================================

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
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
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

// ============================================================================
// AI CREDITS & USAGE TRACKING
// ============================================================================

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
 * Handle usage-based billing for AI operations
 */
export async function trackAIUsage(data: {
  userId: number;
  operationType: 'chat' | 'codebase_analysis' | 'app_generation' | 'code_review' | 'advanced_model';
  modelUsed: string;
  tokensConsumed: number;
}): Promise<{ creditsUsed: number; remainingBalance: number }> {
  console.log(`💳 Calculating credits for user ${data.userId}: ${data.tokensConsumed} tokens consumed for ${data.operationType} with model ${data.modelUsed}`);
  
  // Base calculation: 1 credit per 100 tokens (adjust this ratio as needed)
  const tokensPerCredit = 100;
  let creditsToDeduct = Math.max(1, Math.ceil(data.tokensConsumed / tokensPerCredit));
  
  // Operation type multipliers for different complexity levels
  const operationMultipliers = {
    chat: 1.0,                    // Standard chat - 1x
    codebase_analysis: 2.0,       // Complex analysis - 2x
    app_generation: 3.0,          // App generation - 3x
    code_review: 1.5,             // Code review - 1.5x
    advanced_model: 1.0,          // Handled by model multiplier below
  };

  // Apply operation multiplier
  creditsToDeduct = Math.ceil(creditsToDeduct * (operationMultipliers[data.operationType] || 1.0));
  
  // Apply premium model multipliers
  let modelMultiplier = 1.0;
  if (data.modelUsed.includes('gpt-4') || data.modelUsed.includes('claude-3-opus')) {
    modelMultiplier = 2.0; // Premium models cost 2x
  } else if (data.modelUsed.includes('claude-3-sonnet') || data.modelUsed.includes('gpt-3.5-turbo-16k')) {
    modelMultiplier = 1.5; // Mid-tier models cost 1.5x
  }
  
  creditsToDeduct = Math.ceil(creditsToDeduct * modelMultiplier);
  
  // Ensure minimum credit usage of 1
  creditsToDeduct = Math.max(1, creditsToDeduct);
  
  console.log(`💳 Credit calculation for user ${data.userId}: ${data.tokensConsumed} tokens → ${creditsToDeduct} credits (${data.operationType} ${operationMultipliers[data.operationType]}x, ${data.modelUsed} ${modelMultiplier}x)`);

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
      currentBalance = team.pooledAiCredits || 0;
      
      if (currentBalance < creditsToDeduct) {
        throw new Error('Insufficient AI credits');
      }

      newBalance = currentBalance - creditsToDeduct;
      
      await tx.update(teams)
        .set({
          pooledAiCredits: newBalance,
          pooledCreditsUsedThisMonth: (team.pooledCreditsUsedThisMonth || 0) + creditsToDeduct,
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
    const balance = team?.pooledAiCredits || 0;
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

// ============================================================================
// EXPORTS
// ============================================================================

// Export the Stripe instance for direct access if needed
export { stripe };

// Export all functions and constants for easy importing
export default {
  // Core operations
  createStripeCustomer,
  createSetupIntent,
  createSubscription,
  getStripeSubscription,
  cancelSubscription,
  reactivateSubscription,
  createBillingPortalSession,
  syncSubscriptionFromStripe,
  verifyWebhookSignature,
  
  // Checkout sessions
  createSubscriptionCheckoutSession,
  createCreditsCheckoutSession,
  getCheckoutSession,
  
  // Checkout success handlers
  handleSubscriptionCheckoutSuccess,
  grantMonthlyCreditsForTier,
  handleCreditsCheckoutSuccess,
  
  // Team subscriptions
  createTeamSubscription,
  updateTeamSeats,
  
  // AI credits & usage tracking
  purchaseAICredits,
  trackAIUsage,
  checkCreditBalance,
  
  // Constants
  STRIPE_PRODUCTS,
  CREDIT_PACKAGES,
};
