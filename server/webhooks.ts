import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { 
  verifyWebhookSignature,
  handleSubscriptionCheckoutSuccess, 
  handleCreditsCheckoutSuccess, 
  grantMonthlyCreditsForTier,
  syncSubscriptionFromStripe,
} from './stripe';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Handle Stripe webhooks for subscription events
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  console.log(`🟣 [handleStripeWebhook] Received webhook request`);
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('❌ [handleStripeWebhook] Stripe webhook secret not configured');
    res.status(500).json({ error: 'Webhook configuration error' });
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    console.log(`🟣 [handleStripeWebhook] Verifying webhook signature`);
    event = verifyWebhookSignature(req.body, sig, webhookSecret);
    console.log(`✅ [handleStripeWebhook] Signature verified successfully`);
  } catch (error) {
    console.error('❌ [handleStripeWebhook] Webhook signature verification failed:', error);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  console.log(`🟣 [handleStripeWebhook] Processing webhook event: ${event.type}, ID: ${event.id}`);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      default:
        console.log(`⚠️ [handleStripeWebhook] Unhandled event type: ${event.type}`);
    }

    console.log(`✅ [handleStripeWebhook] Successfully processed webhook event: ${event.type}`);
    res.json({ received: true });
  } catch (error) {
    console.error(`❌ [handleStripeWebhook] Error processing webhook ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  console.log(`Subscription created: ${subscription.id}`);
  
  try {
    const userId = await getUserIdFromCustomer(subscription.customer as string);
    if (userId) {
      await syncSubscriptionFromStripe(subscription.id, userId);
      console.log(`Synced new subscription for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription created:', error);
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  console.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);
  
  try {
    const userId = await getUserIdFromCustomer(subscription.customer as string);
    if (userId) {
      await syncSubscriptionFromStripe(subscription.id, userId);
      console.log(`Synced updated subscription for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  console.log(`Subscription deleted: ${subscription.id}`);
  
  try {
    const userId = await getUserIdFromCustomer(subscription.customer as string);
    if (userId) {
      // Update user status to free/canceled
      await db.update(users)
        .set({
          subscriptionStatus: 'canceled',
          subscriptionTier: 'freemium',
          subscriptionEndsAt: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      console.log(`Updated user ${userId} to freemium tier after subscription deletion`);
    }
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

/**
 * Handle successful payment event
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Payment succeeded for invoice: ${invoice.id}`);
  
  try {
    if ((invoice as any).subscription) {
      const userId = await getUserIdFromCustomer(invoice.customer as string);
      if (userId) {
        // Sync subscription to ensure status is current
        await syncSubscriptionFromStripe((invoice as any).subscription as string, userId);
        
        // If this was a recovery from past_due, update status
        await db.update(users)
          .set({
            subscriptionStatus: 'active',
            updatedAt: new Date()
          })
          .where(eq(users.id, userId));

        console.log(`Payment recovery completed for user ${userId}`);

        // Grant monthly credits on successful invoice for active paid tiers
        try {
          // We need the tier; fetch from users table after sync
          const [user] = await db.select().from(users).where(eq(users.id, userId));
          const tier = (user?.subscriptionTier || '').toLowerCase();
          if (tier && tier !== 'freemium' && tier !== 'free') {
            await grantMonthlyCreditsForTier({
              userId,
              tier,
              source: 'invoice',
              invoiceId: invoice.id,
              subscriptionId: (invoice as any).subscription as string,
              periodStart: (invoice?.period_start as any) || undefined,
            });
          }
        } catch (grantErr) {
          console.error('Error granting monthly credits on invoice:', grantErr);
        }
      }
    }
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

/**
 * Handle failed payment event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Payment failed for invoice: ${invoice.id}`);
  
  try {
    if ((invoice as any).subscription) {
      const userId = await getUserIdFromCustomer(invoice.customer as string);
      if (userId) {
        // Update user status to past_due
        await db.update(users)
          .set({
            subscriptionStatus: 'past_due',
            updatedAt: new Date()
          })
          .where(eq(users.id, userId));

        console.log(`Updated user ${userId} to past_due status after payment failure`);
        
        // TODO: Send email notification to user about failed payment
        // TODO: Implement retry logic or grace period
      }
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

/**
 * Handle trial will end event
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  console.log(`Trial will end for subscription: ${subscription.id}`);
  
  try {
    const userId = await getUserIdFromCustomer(subscription.customer as string);
    if (userId) {
      // TODO: Send email notification about trial ending
      // TODO: Prompt user to add payment method if not already added
      console.log(`Trial ending notification needed for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling trial will end:', error);
  }
}

/**
 * Handle customer updated event
 */
async function handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
  console.log(`Customer updated: ${customer.id}`);
  
  try {
    // Update user information if email or other details changed
    const user = await db.select().from(users)
      .where(eq(users.stripeCustomerId, customer.id))
      .limit(1);

    if (user[0]) {
      const updates: any = {
        updatedAt: new Date()
      };

      // Update email if it changed in Stripe
      if (customer.email && customer.email !== user[0].email) {
        updates.email = customer.email;
      }

      await db.update(users)
        .set(updates)
        .where(eq(users.id, user[0].id));

      console.log(`Synced customer updates for user ${user[0].id}`);
    }
  } catch (error) {
    console.error('Error handling customer updated:', error);
  }
}

/**
 * Get user ID from Stripe customer ID
 */
async function getUserIdFromCustomer(customerId: string): Promise<number | null> {
  try {
    const user = await db.select().from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);

    return user[0]?.id || null;
  } catch (error) {
    console.error('Error getting user from customer ID:', error);
    return null;
  }
}

/**
 * Handle checkout session completed event (for Checkout Sessions)
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  console.log(`🟢 [handleCheckoutSessionCompleted] Checkout session completed: ${session.id}, mode: ${session.mode}`);
  console.log(`🟢 [handleCheckoutSessionCompleted] Session metadata:`, session.metadata);
  console.log(`🟢 [handleCheckoutSessionCompleted] Payment status: ${session.payment_status}, Customer: ${session.customer}`);
  
  try {
    // Check if this is a subscription or one-time payment
    if (session.mode === 'subscription') {
      // Handle subscription checkout completion
      console.log(`🟢 [handleCheckoutSessionCompleted] Processing subscription checkout`);
      await handleSubscriptionCheckoutSuccess(session);
      console.log(`✅ [handleCheckoutSessionCompleted] Processed subscription checkout for session ${session.id}`);
    } else if (session.mode === 'payment') {
      // Handle AI credits checkout completion
      const isCreditsPayment = session.metadata?.type === 'ai_credits';
      console.log(`🟢 [handleCheckoutSessionCompleted] Mode is 'payment', isCreditsPayment: ${isCreditsPayment}, metadata.type: ${session.metadata?.type}`);
      
      if (isCreditsPayment) {
        console.log(`🟢 [handleCheckoutSessionCompleted] Calling handleCreditsCheckoutSuccess`);
        await handleCreditsCheckoutSuccess(session);
        console.log(`✅ [handleCheckoutSessionCompleted] Processed AI credits checkout for session ${session.id}`);
      } else {
        console.log(`⚠️ [handleCheckoutSessionCompleted] One-time payment completed but not recognized as credits: ${session.id}`);
        console.log(`⚠️ [handleCheckoutSessionCompleted] Metadata:`, JSON.stringify(session.metadata, null, 2));
      }
    } else {
      console.log(`⚠️ [handleCheckoutSessionCompleted] Unknown checkout session mode: ${session.mode} for session ${session.id}`);
    }
  } catch (error) {
    console.error(`❌ [handleCheckoutSessionCompleted] Error handling checkout session completed for ${session.id}:`, error);
    throw error;
  }
}

/**
 * Raw body parser middleware for Stripe webhooks
 * This needs to be applied before any other body parsing
 */
export function rawBodyParser() {
  return (req: Request, res: Response, next: any) => {
    if (req.path === '/api/webhooks/stripe') {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        req.body = data;
        next();
      });
    } else {
      next();
    }
  };
} 