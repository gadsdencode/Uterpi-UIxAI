/**
 * Stripe Checkout Sessions Implementation
 * Modern best practice for subscription and one-time payments
 */

import Stripe from 'stripe';
import { db } from './db';
import { users, subscriptions, aiCreditsTransactions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { STRIPE_PRODUCTS, CREDIT_PACKAGES } from './stripe-enhanced';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Using default API version to avoid type conflicts
});

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
    payment_method_collection: 'always',
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
    payment_method_collection: 'always',
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
 * Handle successful AI credits checkout completion
 */
export async function handleCreditsCheckoutSuccess(session: Stripe.Checkout.Session): Promise<void> {
  const userId = parseInt(session.metadata?.userId || '0');
  const credits = parseInt(session.metadata?.credits || '0');
  const amount = parseFloat(session.metadata?.amount || '0');
  const packageId = session.metadata?.packageId;
  
  if (!userId || !credits || !amount) {
    console.error('Missing required metadata in checkout session:', session.id);
    return;
  }

  try {
    // Add credits to user account
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new Error('User not found');
    }

    const newBalance = (user.ai_credits_balance || 0) + credits;
    
    // Update user balance
    await db.update(users)
      .set({ ai_credits_balance: newBalance })
      .where(eq(users.id, userId));

    // Create transaction record
    await db.insert(aiCreditsTransactions).values({
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
      }
    });

    console.log(`${credits} AI credits added to user ${userId}, new balance: ${newBalance}`);
    
  } catch (error) {
    console.error('Error handling credits checkout success:', error);
    throw error;
  }
}