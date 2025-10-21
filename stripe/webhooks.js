/**
 * Stripe Webhooks Handler
 */

const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');
const { 
  handleSuccessfulCheckout, 
  handleSubscriptionUpdate, 
  handleInvoicePaid 
} = require('./checkout');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret not configured');
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
 */
async function handleWebhookEvent(event) {
  console.log(`📨 Received webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
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
 * Handle successful checkout session
 */
async function handleCheckoutSessionCompleted(session) {
  console.log(`✅ Checkout completed for session ${session.id}`);
  await handleSuccessfulCheckout(session);
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription) {
  try {
    const customerId = subscription.customer;
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId }
    });

    if (!user) {
      console.warn(`No user found for customer ${customerId}`);
      return;
    }

    // Downgrade to free plan
    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: 'free',
        tokensRemaining: 10,
        stripeSubscriptionId: null
      }
    });

    console.log(`✅ User ${user.id} subscription canceled, downgraded to free`);

  } catch (error) {
    console.error('Error handling subscription deletion:', error);
    throw error;
  }
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice) {
  try {
    const customerId = invoice.customer;
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId }
    });

    if (!user) {
      console.warn(`No user found for customer ${customerId}`);
      return;
    }

    // Optionally downgrade to free or send notification
    console.log(`⚠️  Payment failed for user ${user.id}, invoice ${invoice.id}`);

    // For now, just log - in production you might want to:
    // 1. Send email notification
    // 2. Give grace period before downgrading
    // 3. Update user status

  } catch (error) {
    console.error('Error handling payment failure:', error);
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
    const event = verifyWebhookSignature(payload, signature);
    req.stripeEvent = event;
    next();
  } catch (error) {
    console.error('Webhook verification failed:', error.message);
    res.status(400).json({ error: 'Invalid webhook signature' });
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
    res.status(500).json({ error: 'Webhook processing failed' });
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
    res.status(500).json({ error: 'Test webhook failed' });
  }
}

module.exports = {
  webhookMiddleware,
  webhookHandler,
  testWebhook,
  handleWebhookEvent
};
