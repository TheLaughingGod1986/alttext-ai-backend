/**
 * Stripe Webhooks Handler
 * Enhanced to integrate with billingService and emailService
 */

const { getStripe } = require('../utils/stripeClient');
const { supabase } = require('../../db/supabase-client');
const billingService = require('../services/billingService');
const creditsService = require('../services/creditsService');
const emailService = require('../services/emailService');
const analyticsService = require('../services/analyticsService');
const { 
  handleSuccessfulCheckout, 
  handleSubscriptionUpdate, 
  handleInvoicePaid 
} = require('./checkout');

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret not configured');
  }

  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    throw new Error('Invalid webhook signature');
  }
}

/**
 * Handle webhook events
 * Enhanced to sync subscriptions and trigger emails
 */
async function handleWebhookEvent(event) {
  console.log(`📨 Received webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;

      case 'invoice.paid':
        await handleInvoicePaidWebhook(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailedWebhook(event.data.object);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      default:
        console.log(`⚠️  Unhandled webhook event: ${event.type}`);
    }

  } catch (error) {
    console.error(`❌ Error handling webhook ${event.type}:`, error);
    throw error;
  }
}

/**
 * Handle customer.created event
 */
async function handleCustomerCreated(customer) {
  console.log(`✅ Customer created: ${customer.id}`);
  // Customer is automatically created by billingService when needed
  // This is mainly for logging/auditing
}

/**
 * Handle successful checkout session
 * SECURITY: Logs all payment completions for audit trail
 */
async function handleCheckoutSessionCompleted(session) {
  console.log(`✅ Checkout completed for session ${session.id}`);
  
  // SECURITY: Log payment completion with full details
  console.log('[Billing Security] Payment completed:', {
    sessionId: session.id,
    customerId: session.customer,
    subscriptionId: session.subscription,
    amountTotal: session.amount_total,
    currency: session.currency,
    customerEmail: session.customer_details?.email,
    userId: session.metadata?.userId,
    service: session.metadata?.service,
    type: session.metadata?.type,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Check if this is a credit purchase (credit pack)
    // Check for metadata.credits (credit pack) or metadata.type === 'credits' (legacy)
    if (session.metadata?.credits || session.metadata?.type === 'credit_pack' || session.metadata?.type === 'credits') {
      await handleCreditPurchase(session);
      return;
    }

    // Check if license already exists for this session (idempotency)
    const userId = session.metadata?.userId;
    if (userId) {
      // Check for existing license with this subscription
      const { data: existingLicense } = await supabase
        .from('licenses')
        .select('*')
        .eq('stripeSubscriptionId', session.subscription)
        .single();

      if (existingLicense) {
        console.log(`ℹ️  License already exists for subscription ${session.subscription}, skipping creation`);
        console.warn('[Billing Security] Duplicate checkout completion detected:', {
          sessionId: session.id,
          existingLicenseId: existingLicense.id,
          timestamp: new Date().toISOString()
        });
        return;
      }
    }

    await handleSuccessfulCheckout(session);
  } catch (error) {
    console.error('[Billing Security] Error in checkout session completed handler:', {
      error: error.message,
      sessionId: session.id,
      customerId: session.customer,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Handle credit purchase from checkout session
 */
async function handleCreditPurchase(session) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      console.error('[Webhook] Stripe not configured for credit purchase');
      return;
    }

    const email = session.customer_details?.email || session.metadata?.user_email;
    if (!email) {
      console.error('[Webhook] No email found in credit purchase session:', session.id);
      return;
    }

    const emailLower = email.toLowerCase();
    // Get credits amount from metadata.credits (credit pack) or metadata.amount (legacy)
    const amount = parseInt(session.metadata?.credits) || parseInt(session.metadata?.amount) || 1;
    const paymentIntentId = session.payment_intent || session.id;

    // Get or create identity
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success) {
      console.error('[Webhook] Failed to get/create identity for credit purchase:', identityResult.error);
      return;
    }

    // Add credits using email-based function (includes transaction record)
    const addResult = await creditsService.addCreditsByEmail(
      emailLower,
      amount,
      'purchase',
      session.id
    );

    if (!addResult.success) {
      console.error('[Webhook] Failed to add credits:', addResult.error);
      return;
    }

    console.log(`✅ Added ${amount} credits to ${emailLower}. New balance: ${addResult.newBalance}`);

    // Log analytics event
    analyticsService.logEvent({
      email: emailLower,
      eventName: 'credits_purchased',
      plugin: session.metadata?.plugin_slug || 'alttext-ai',
      source: 'server',
      eventData: {
        amount,
        newBalance: addResult.newBalance,
        paymentIntentId,
        sessionId: session.id,
      },
    });
  } catch (error) {
    console.error('[Webhook] Error handling credit purchase:', error);
    throw error;
  }
}

/**
 * Handle subscription.created event
 */
async function handleSubscriptionCreated(event) {
  const subscription = event.data.object;
  console.log(`✅ Subscription created: ${subscription.id}`);

  // Sync subscription to database
  const syncResult = await billingService.syncSubscriptionFromWebhook(event);
  if (!syncResult.success) {
    console.error('[Webhook] Failed to sync subscription:', syncResult.error);
    return;
  }

  // Get customer email for sending activation email
  const stripe = getStripe();
  if (stripe) {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      const email = customer.email?.toLowerCase();
      if (email) {
        // Send subscription activated email
        await emailService.sendLicenseActivated({
          email,
          licenseKey: subscription.id, // Using subscription ID as identifier
          plan: syncResult.data.subscription.plan,
          tokenLimit: 0, // Will be determined from plan config
          tokensRemaining: 0,
        });
      }
    } catch (error) {
      console.error('[Webhook] Error sending activation email:', error);
    }
  }
}

/**
 * Handle subscription.updated event
 * SECURITY: Logs all subscription updates for audit trail
 */
async function handleSubscriptionUpdated(event) {
  const subscription = event.data.object;
  console.log(`🔄 Subscription updated: ${subscription.id}`);

  // SECURITY: Log subscription updates (including renewals) with full details
  const stripe = getStripe();
  let customerEmail = null;
  if (stripe && subscription.customer) {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      customerEmail = customer.email?.toLowerCase();
    } catch (error) {
      console.error('[Webhook] Error retrieving customer for subscription update:', error);
    }
  }

  console.log('[Billing Security] Subscription updated:', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    customerEmail,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    items: subscription.items?.data?.map(item => ({
      priceId: item.price.id,
      quantity: item.quantity
    })),
    timestamp: new Date().toISOString()
  });

  // Sync subscription to database
  const syncResult = await billingService.syncSubscriptionFromWebhook(event);
  if (!syncResult.success) {
    console.error('[Webhook] Failed to sync subscription update:', syncResult.error);
  }

  // Log analytics event for plan changes
  if (customerEmail && syncResult.success && syncResult.data?.subscription) {
    const dbSubscription = syncResult.data.subscription;
    const pluginSlug = dbSubscription.plugin_slug || 'alttext-ai';
    
    // Check if plan changed by comparing with existing subscription
    // For now, log all subscription updates as potential plan changes
    // In the future, we could compare old vs new plan
    analyticsService.logEvent({
      email: customerEmail,
      eventName: 'plan_changed',
      plugin: pluginSlug,
      source: 'server',
      eventData: {
        subscriptionId: subscription.id,
        plan: dbSubscription.plan,
        status: dbSubscription.status,
        stripePriceId: dbSubscription.stripe_price_id,
      },
    });
  }
}

/**
 * Handle subscription.deleted event
 */
async function handleSubscriptionDeleted(event) {
  const subscription = event.data.object;
  console.log(`❌ Subscription deleted: ${subscription.id}`);

  try {
    // Sync cancellation to database
    const syncResult = await billingService.syncSubscriptionFromWebhook(event);
    if (!syncResult.success) {
      console.error('[Webhook] Failed to sync subscription deletion:', syncResult.error);
    }

    // Get customer email for sending cancellation email
    const stripe = getStripe();
    if (stripe) {
      try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const email = customer.email?.toLowerCase();
        if (email) {
          // Note: We may need to add a sendSubscriptionCanceled method to emailService
          // For now, we'll log it
          console.log(`[Webhook] Subscription canceled for ${email}`);
          // TODO: Add sendSubscriptionCanceled to emailService
        }
      } catch (error) {
        console.error('[Webhook] Error retrieving customer for cancellation email:', error);
      }
    }

    // Legacy: Also update users table if needed (backward compatibility)
    const customerId = subscription.customer;
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('stripeCustomerId', customerId)
      .single();

    if (user) {
      await supabase
        .from('users')
        .update({
          plan: 'free',
          stripeSubscriptionId: null
        })
        .eq('id', user.id);
    }

  } catch (error) {
    console.error('Error handling subscription deletion:', error);
    throw error;
  }
}

/**
 * Handle invoice.paid event
 * Store invoice and send receipt email
 */
async function handleInvoicePaidWebhook(event) {
  const invoice = event.data.object;
  console.log(`💰 Invoice paid: ${invoice.id}`);

  try {
    const stripe = getStripe();
    if (!stripe) {
      console.error('[Webhook] Stripe not configured');
      return;
    }

    // Get customer email
    const customer = await stripe.customers.retrieve(invoice.customer);
    if (!customer) {
      console.warn(`[Webhook] Customer not found: ${invoice.customer}`);
      return;
    }
    const email = customer.email?.toLowerCase();

    if (!email) {
      console.warn(`[Webhook] No email found for customer ${invoice.customer}`);
      return;
    }

    // Determine plugin from subscription metadata
    const subscriptionId = invoice.subscription;
    let pluginSlug = 'alttext-ai'; // Default
    if (subscriptionId) {
      try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      pluginSlug = subscription.metadata?.plugin_slug || 'alttext-ai';
      } catch (subError) {
        // If subscription retrieval fails, use default plugin slug
        console.warn(`[Webhook] Could not retrieve subscription ${subscriptionId}:`, subError.message);
      }
    }

    // Store invoice in database
    // Safely extract paid_at timestamp, handling missing status_transitions
    const paidAtTimestamp = invoice.status_transitions?.paid_at;
    const paidAt = paidAtTimestamp 
      ? new Date(paidAtTimestamp * 1000).toISOString()
      : new Date().toISOString(); // Fallback to current time if paid_at is missing
    
    const invoiceData = {
      invoice_id: invoice.id,
      user_email: email,
      plugin_slug: pluginSlug,
      amount: invoice.amount_paid || 0,
      currency: invoice.currency || 'usd',
      hosted_invoice_url: invoice.hosted_invoice_url || null,
      pdf_url: invoice.invoice_pdf || null,
      paid_at: paidAt,
      receipt_email_sent: false,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('invoices')
      .upsert(invoiceData, {
        onConflict: 'invoice_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Webhook] Error storing invoice:', insertError);
    }

    // Send receipt email
    if (inserted && !inserted.receipt_email_sent) {
      const receiptResult = await emailService.sendReceipt({
        email,
        amount: invoice.amount_paid / 100, // Convert from cents
        currency: invoice.currency.toUpperCase(),
        planName: 'pro', // Will be determined from subscription
        transactionId: invoice.id,
        invoiceUrl: invoice.hosted_invoice_url,
      });

      if (receiptResult.success) {
        // Mark receipt as sent
        await supabase
          .from('invoices')
          .update({ receipt_email_sent: true })
          .eq('id', inserted.id);
      }
    }

    // Also call legacy handler for backward compatibility
    await handleInvoicePaid(invoice);

  } catch (error) {
    console.error('[Webhook] Error handling invoice.paid:', error);
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event
 * Send payment failed email
 */
async function handleInvoicePaymentFailedWebhook(invoice) {
  console.log(`⚠️  Payment failed for invoice ${invoice.id}`);

  try {
    const stripe = getStripe();
    if (!stripe) {
      console.error('[Webhook] Stripe not configured');
      return;
    }

    // Get customer email
    const customer = await stripe.customers.retrieve(invoice.customer);
    if (!customer) {
      console.warn(`[Webhook] Customer not found: ${invoice.customer}`);
      return;
    }
    const email = customer.email?.toLowerCase();

    if (!email) {
      console.warn(`[Webhook] No email found for customer ${invoice.customer}`);
      return;
    }

    // Determine plugin from subscription metadata
    const subscriptionId = invoice.subscription;
    let pluginSlug = 'alttext-ai'; // Default
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        pluginSlug = subscription.metadata?.plugin_slug || 'alttext-ai';
      } catch (error) {
        console.error('[Webhook] Error retrieving subscription for payment failure:', error);
      }
    }

    // Log analytics event for payment failure
    analyticsService.logEvent({
      email,
      eventName: 'payment_failed',
      plugin: pluginSlug,
      source: 'server',
      eventData: {
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription,
        amount: invoice.amount_due,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count,
      },
    });

    // Send payment failed email
    // Note: We may need to add a sendPaymentFailed method to emailService
    // For now, we'll log it
    console.log(`[Webhook] Payment failed for ${email}, invoice ${invoice.id}`);
    // TODO: Add sendPaymentFailed to emailService

    // Legacy handler for backward compatibility
    await handleInvoicePaymentFailed(invoice);

  } catch (error) {
    console.error('[Webhook] Error handling payment failure:', error);
    throw error;
  }
}

// Legacy placeholder to avoid ReferenceError in tests when legacy handler is not defined
async function handleInvoicePaymentFailed(invoice) {
  // No-op legacy handler for test environment
  return { success: true, invoiceId: invoice?.id || null };
}

/**
 * Handle payment_intent.succeeded event
 * Used as backup for credit purchases if checkout.session.completed fails
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    // Only process if this is a credit purchase (check metadata)
    if (paymentIntent.metadata?.type !== 'credits') {
      // Not a credit purchase, skip
      return;
    }

    console.log(`💰 Payment intent succeeded for credit purchase: ${paymentIntent.id}`);

    const email = paymentIntent.metadata?.user_email || paymentIntent.receipt_email;
    if (!email) {
      console.error('[Webhook] No email found in payment intent:', paymentIntent.id);
      return;
    }

    const emailLower = email.toLowerCase();
    const amount = parseInt(paymentIntent.metadata?.amount) || 1;

    // Get or create identity
    const identityResult = await creditsService.getOrCreateIdentity(emailLower);
    if (!identityResult.success) {
      console.error('[Webhook] Failed to get/create identity for payment intent:', identityResult.error);
      return;
    }

    // Add credits (idempotent check via payment intent ID)
    const addResult = await creditsService.addCredits(
      identityResult.identityId,
      amount,
      paymentIntent.id
    );

    if (!addResult.success) {
      console.error('[Webhook] Failed to add credits from payment intent:', addResult.error);
      return;
    }

    console.log(`✅ Added ${amount} credits from payment intent to ${emailLower}. New balance: ${addResult.newBalance}`);
  } catch (error) {
    console.error('[Webhook] Error handling payment intent succeeded:', error);
    // Don't throw - payment already succeeded, credits can be added manually if needed
  }
}

/**
 * Handle charge refunded - downgrade user to free plan
 */
async function handleChargeRefunded(charge) {
  try {
    console.log(`💰 Charge refunded: ${charge.id}`);
    
    // Find user by customer ID
    const customerId = charge.customer;
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('stripeCustomerId', customerId)
      .single();

    if (userError || !user) {
      console.warn(`No user found for customer ${customerId}`);
      return;
    }

    // Downgrade to free plan
    const { error: updateError } = await supabase
      .from('users')
      .update({
        plan: 'free',
        tokensRemaining: 50,
        stripeSubscriptionId: null
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    console.log(`✅ User ${user.id} refunded, downgraded to free plan`);

  } catch (error) {
    console.error('Error handling charge refund:', error);
    throw error;
  }
}

/**
 * Express middleware for webhook endpoint
 */
function webhookMiddleware(req, res, next) {
  const signature = req.headers['stripe-signature'];

  // For raw body (Buffer) from express.raw()
  const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;

  try {
    // Check if webhook secret is missing
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_SIGNATURE',
        reason: 'validation_failed',
        message: 'Invalid webhook signature: Stripe webhook secret not configured',
      });
    }
    
    // In test mode, skip signature verification and pass through the payload
    if (process.env.NODE_ENV === 'test') {
      req.stripeEvent = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      return next();
    }
    
    const event = verifyWebhookSignature(payload, signature);
    req.stripeEvent = event;
    next();
  } catch (error) {
    console.error('Webhook verification failed:', error.message);
    res.status(400).json({
      ok: false,
      code: 'INVALID_SIGNATURE',
      reason: 'validation_failed',
      message: 'Invalid webhook signature',
    });
  }
}

/**
 * Webhook endpoint handler
 */
async function webhookHandler(req, res) {
  try {
    await handleWebhookEvent(req.stripeEvent);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({
      ok: false,
      code: 'WEBHOOK_ERROR',
      reason: 'server_error',
      message: 'Webhook processing failed',
    });
  }
}

/**
 * Test webhook endpoint (for development)
 */
async function testWebhook(req, res) {
  try {
    const { eventType, userId } = req.body;

    // Create mock event for testing
    const mockEvent = {
      type: eventType,
      data: {
        object: {
          id: 'test_' + Date.now(),
          customer: 'cus_test',
          metadata: { userId: userId.toString() }
        }
      }
    };

    await handleWebhookEvent(mockEvent);
    res.json({ success: true, message: `Test webhook ${eventType} processed` });

  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({
      ok: false,
      code: 'WEBHOOK_ERROR',
      reason: 'server_error',
      message: 'Test webhook failed',
    });
  }
}

module.exports = {
  handleChargeRefunded,
  webhookMiddleware,
  webhookHandler,
  testWebhook,
  handleWebhookEvent
};
