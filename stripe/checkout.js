/**
 * Stripe Checkout and Customer Portal
 */

const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

/**
 * Create Stripe Checkout Session
 */
<<<<<<< HEAD
async function createCheckoutSession(userId, priceId, successUrl, cancelUrl, service = 'alttext-ai') {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true, service: true }
=======
async function createCheckoutSession(userId, priceId, successUrl, cancelUrl) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true }
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    });

    if (!user) {
      throw new Error('User not found');
    }

<<<<<<< HEAD
    // Use service from request or user's stored service
    const userService = service || user.service || 'alttext-ai';

=======
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    let customerId = user.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
<<<<<<< HEAD
          userId: userId.toString(),
          service: userService
=======
          userId: userId.toString()
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
        }
      });

      customerId = customer.id;

      // Update user with customer ID
      await prisma.user.update({
        where: { id: userId },
<<<<<<< HEAD
        data: { 
          stripeCustomerId: customerId,
          service: userService // Update service if not set
        }
=======
        data: { stripeCustomerId: customerId }
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: priceId === process.env.STRIPE_PRICE_CREDITS ? 'payment' : 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
<<<<<<< HEAD
        userId: userId.toString(),
        service: userService
      },
      subscription_data: priceId !== process.env.STRIPE_PRICE_CREDITS ? {
        metadata: {
          service: userService
        }
      } : undefined
=======
        userId: userId.toString()
      }
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    });

    return session;

  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Create Customer Portal Session
 */
async function createCustomerPortalSession(userId, returnUrl) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true }
    });

    if (!user || !user.stripeCustomerId) {
      throw new Error('No Stripe customer found for user');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return session;

  } catch (error) {
    console.error('Error creating customer portal session:', error);
    throw error;
  }
}

/**
 * Handle successful checkout
 */
async function handleSuccessfulCheckout(session) {
  try {
    const userId = parseInt(session.metadata.userId);
<<<<<<< HEAD
    const service = session.metadata.service || 'alttext-ai';
=======
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac

    // Retrieve session with line_items expanded if not already present
    let sessionWithItems = session;
    if (!session.line_items) {
      sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price']
      });
    }

    const priceId = sessionWithItems.line_items.data[0].price.id;

<<<<<<< HEAD
    // Service-specific plan limits
    const planLimits = {
      'alttext-ai': {
        free: 50,
        pro: 1000,
        agency: 10000
      },
      'seo-ai-meta': {
        free: 10,
        pro: 100,
        agency: 1000
      }
    };

    const serviceLimits = planLimits[service] || planLimits['alttext-ai'];

=======
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    // Determine plan type based on price ID
    let plan = 'free';
    let creditsToAdd = 0;

    if (priceId === process.env.STRIPE_PRICE_PRO) {
      plan = 'pro';
    } else if (priceId === process.env.STRIPE_PRICE_AGENCY) {
      plan = 'agency';
    } else if (priceId === process.env.STRIPE_PRICE_CREDITS) {
      creditsToAdd = 100; // 100 credits for £9.99
    }

    // Update user
<<<<<<< HEAD
    const updateData = {
      service: service // Update service if not set
    };
    if (plan !== 'free') {
      updateData.plan = plan;
      updateData.tokensRemaining = serviceLimits[plan] || serviceLimits.free;
=======
    const updateData = {};
    if (plan !== 'free') {
      updateData.plan = plan;
      updateData.tokensRemaining = plan === 'pro' ? 1000 : 10000;
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
      updateData.stripeSubscriptionId = sessionWithItems.subscription;
    }
    if (creditsToAdd > 0) {
      updateData.credits = { increment: creditsToAdd };
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

<<<<<<< HEAD
    console.log(`✅ User ${userId} (${service}) upgraded to ${plan} plan${creditsToAdd > 0 ? ` with ${creditsToAdd} credits` : ''}`);
=======
    console.log(`✅ User ${userId} upgraded to ${plan} plan${creditsToAdd > 0 ? ` with ${creditsToAdd} credits` : ''}`);
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac

  } catch (error) {
    console.error('Error handling successful checkout:', error);
    throw error;
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription) {
  try {
    const customerId = subscription.customer;
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId }
    });

    if (!user) {
      console.warn(`No user found for customer ${customerId}`);
      return;
    }

    const status = subscription.status;
    const priceId = subscription.items.data[0].price.id;
<<<<<<< HEAD
    
    // Get service from subscription metadata or user
    const service = subscription.metadata?.service || user.service || 'alttext-ai';

    // Service-specific plan limits
    const planLimits = {
      'alttext-ai': { free: 50, pro: 1000, agency: 10000 },
      'seo-ai-meta': { free: 10, pro: 100, agency: 1000 }
    };

    const serviceLimits = planLimits[service] || planLimits['alttext-ai'];
=======
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac

    if (status === 'active') {
      // Determine plan from price ID
      let plan = 'free';
      if (priceId === process.env.STRIPE_PRICE_PRO) {
        plan = 'pro';
      } else if (priceId === process.env.STRIPE_PRICE_AGENCY) {
        plan = 'agency';
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan,
<<<<<<< HEAD
          service: service, // Update service if changed
          tokensRemaining: serviceLimits[plan] || serviceLimits.free,
=======
          tokensRemaining: plan === 'pro' ? 1000 : 10000,
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
          stripeSubscriptionId: subscription.id
        }
      });

<<<<<<< HEAD
      console.log(`✅ User ${user.id} (${service}) subscription updated to ${plan}`);
=======
      console.log(`✅ User ${user.id} subscription updated to ${plan}`);
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    } else if (status === 'canceled' || status === 'incomplete_expired') {
      // Downgrade to free
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: 'free',
<<<<<<< HEAD
          tokensRemaining: serviceLimits.free,
=======
          tokensRemaining: 50,
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
          stripeSubscriptionId: null
        }
      });

<<<<<<< HEAD
      console.log(`✅ User ${user.id} (${service}) downgraded to free plan`);
=======
      console.log(`✅ User ${user.id} downgraded to free plan`);
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac
    }

  } catch (error) {
    console.error('Error handling subscription update:', error);
    throw error;
  }
}

/**
 * Handle invoice payment (monthly reset)
 */
async function handleInvoicePaid(invoice) {
  try {
    const customerId = invoice.customer;
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId }
    });

    if (!user) {
      console.warn(`No user found for customer ${customerId}`);
      return;
    }

<<<<<<< HEAD
    // Service-specific plan limits
    const planLimits = {
      'alttext-ai': { free: 50, pro: 1000, agency: 10000 },
      'seo-ai-meta': { free: 10, pro: 100, agency: 1000 }
    };

    const serviceLimits = planLimits[user.service] || planLimits['alttext-ai'];
    const limit = serviceLimits[user.plan] || serviceLimits.free;
=======
    // Reset monthly tokens based on plan
    const planLimits = { free: 50, pro: 1000, agency: 10000 };
    const limit = planLimits[user.plan] || 50;
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac

    await prisma.user.update({
      where: { id: user.id },
      data: {
        tokensRemaining: limit,
        resetDate: new Date()
      }
    });

<<<<<<< HEAD
    console.log(`✅ User ${user.id} (${user.service}) monthly tokens reset to ${limit}`);
=======
    console.log(`✅ User ${user.id} monthly tokens reset to ${limit}`);
>>>>>>> 7f9cd0cfac2850ea0b3e11dcdd510dd57af3bbac

  } catch (error) {
    console.error('Error handling invoice payment:', error);
    throw error;
  }
}

module.exports = {
  createCheckoutSession,
  createCustomerPortalSession,
  handleSuccessfulCheckout,
  handleSubscriptionUpdate,
  handleInvoicePaid
};
