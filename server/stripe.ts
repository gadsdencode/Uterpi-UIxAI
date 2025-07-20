import Stripe from 'stripe';
import { db } from './db';
import { users, subscriptions, subscriptionPlans } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { User, SubscriptionPlan } from '@shared/schema';

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

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
    const tier = plan[0]?.name.toLowerCase() || 'free';
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
export function verifyWebhookSignature(payload: string, signature: string, secret: string): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error('Invalid webhook signature');
  }
}

export { stripe }; 