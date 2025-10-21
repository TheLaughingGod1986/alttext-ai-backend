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
async function createCheckoutSession(userId, priceId, successUrl, cancelUrl) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    let customerId = user.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: userId.toString()
        }
      });

      customerId = customer.id;

      // Update user with customer ID
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId }
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
        userId: userId.toString()
      }
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

    // Retrieve session with line_items expanded if not already present
    let sessionWithItems = session;
    if (!session.line_items) {
      sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price']
      });
    }

    const priceId = sessionWithItems.line_items.data[0].price.id;

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
    const updateData = {};
    if (plan !== 'free') {
      updateData.plan = plan;
      updateData.tokensRemaining = plan === 'pro' ? 1000 : 10000;
      updateData.stripeSubscriptionId = sessionWithItems.subscription;
    }
    if (creditsToAdd > 0) {
      updateData.credits = { increment: creditsToAdd };
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    console.log(`✅ User ${userId} upgraded to ${plan} plan${creditsToAdd > 0 ? ` with ${creditsToAdd} credits` : ''}`);

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
          tokensRemaining: plan === 'pro' ? 1000 : 10000,
          stripeSubscriptionId: subscription.id
        }
      });

      console.log(`✅ User ${user.id} subscription updated to ${plan}`);
    } else if (status === 'canceled' || status === 'incomplete_expired') {
      // Downgrade to free
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: 'free',
          tokensRemaining: 10,
          stripeSubscriptionId: null
        }
      });

      console.log(`✅ User ${user.id} downgraded to free plan`);
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

    // Reset monthly tokens based on plan
    const planLimits = { free: 10, pro: 1000, agency: 10000 };
    const limit = planLimits[user.plan] || 10;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        tokensRemaining: limit,
        resetDate: new Date()
      }
    });

    console.log(`✅ User ${user.id} monthly tokens reset to ${limit}`);

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
