/**
 * Stripe Checkout and Customer Portal
 */

const { requireEnv, getEnv } = require('../../config/loadEnv');
const Stripe = require('stripe');
const { supabase } = require('../../db/supabase-client');
const emailService = require('../services/emailService');
const licenseService = require('../services/licenseService');
const logger = require('../utils/logger');

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));

/**
 * Create Stripe Checkout Session
 */
async function createCheckoutSession(userId, priceId, successUrl, cancelUrl, service = 'alttext-ai') {
  try {
    logger.info('createCheckoutSession called', { userId, priceId, service, successUrl, cancelUrl });
    
    // Validate userId exists
    if (!userId) {
      logger.error('Invalid userId provided', { userId });
      throw new Error('Invalid user ID');
    }

    // Query user - only select columns that exist in the database
    logger.info('Querying Supabase for user', { userId });
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError) {
      logger.error('Supabase query error', {
        message: userError.message,
        code: userError.code,
        details: userError.details,
        hint: userError.hint,
        userId: userId
      });
      throw new Error(`User lookup failed: ${userError.message}`);
    }

    if (!user) {
      logger.error('User not found in database', { userId: userId });
      throw new Error('User not found');
    }

    logger.info('User found', { id: user.id, email: user.email, hasStripeCustomer: !!user.stripe_customer_id });

    // Use service from request (users table doesn't have service column)
    const userService = service || 'alttext-ai';

    // Get Stripe customer ID (column is snake_case: stripe_customer_id)
    let customerId = user.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: userId.toString(),
          service: userService
        }
      });

      customerId = customer.id;

      // Update user with customer ID (column is snake_case: stripe_customer_id)
      const updateData = { 
        stripe_customer_id: customerId
      };
      
      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

      if (updateError) throw updateError;
      logger.info('Stripe customer created and user updated', { customerId, userId });
    } else {
      logger.info('Using existing Stripe customer', { customerId });
    }

    // Create checkout session
    logger.info('Creating Stripe checkout session', { customerId, priceId, mode: priceId === getEnv('ALTTEXT_AI_STRIPE_PRICE_CREDITS') ? 'payment' : 'subscription' });
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: priceId === getEnv('ALTTEXT_AI_STRIPE_PRICE_CREDITS') ? 'payment' : 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId.toString(),
        service: userService
      },
      subscription_data: priceId !== getEnv('ALTTEXT_AI_STRIPE_PRICE_CREDITS') ? {
        metadata: {
          service: userService
        }
      } : undefined
    });

    logger.info('Stripe checkout session created successfully', { sessionId: session.id, url: session.url });
    return session;

  } catch (error) {
    logger.error('Error creating checkout session', {
      message: error.message,
      stack: error.stack,
      type: error.type,
      code: error.code,
      userId,
      priceId,
      service
    });
    throw error;
  }
}

/**
 * Create Customer Portal Session
 */
async function createCustomerPortalSession(userId, returnUrl) {
  try {
    // Validate userId exists
    if (!userId) {
      throw new Error('Invalid user ID');
    }

    // Query user for Stripe customer ID (column is snake_case: stripe_customer_id)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError) {
      logger.error('Supabase query error in portal session', {
        message: userError.message,
        code: userError.code,
        userId: userId
      });
      throw new Error(`User lookup failed: ${userError.message}`);
    }

    // Get Stripe customer ID (column is snake_case: stripe_customer_id)
    const customerId = user?.stripe_customer_id;

    if (!user || !customerId) {
      throw new Error('No Stripe customer found for user');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;

  } catch (error) {
    logger.error('Error creating customer portal session', { error: error.message });
    throw error;
  }
}

/**
 * Handle successful checkout
 */
async function handleSuccessfulCheckout(session) {
  try {
    const userId = session.metadata.userId;
    
    if (!userId) {
      throw new Error('User ID not found in session metadata');
    }

    // Retrieve session with line_items expanded if not already present
    let sessionWithItems = session;
    if (!session.line_items) {
      try {
        sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items.data.price']
        });
      } catch (error) {
        logger.error('[Checkout] Error retrieving session with line_items', { error: error.message });
        throw new Error('Failed to retrieve checkout session details');
      }
    }

    // Validate line_items exist
    if (!sessionWithItems?.line_items?.data || sessionWithItems.line_items.data.length === 0) {
      throw new Error('No line items found in checkout session');
    }

    const priceId = sessionWithItems.line_items.data[0].price.id;

    // Determine plan type based on price ID and service
    let plan = 'free';
    let creditsToAdd = 0;

    // AltText AI products
    if (priceId === getEnv('ALTTEXT_AI_STRIPE_PRICE_PRO')) {
      plan = 'pro';
    } else if (priceId === getEnv('ALTTEXT_AI_STRIPE_PRICE_AGENCY')) {
      plan = 'agency';
    } else if (priceId === getEnv('ALTTEXT_AI_STRIPE_PRICE_CREDITS')) {
      creditsToAdd = 100; // 100 credits for £9.99
    }
    // SEO AI Meta products
    else if (priceId === getEnv('SEO_AI_META_STRIPE_PRICE_PRO')) {
      plan = 'pro';
    } else if (priceId === getEnv('SEO_AI_META_STRIPE_PRICE_AGENCY')) {
      plan = 'agency';
    }

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

    const service = session.metadata.service || 'alttext-ai';
    const serviceLimits = planLimits[service] || planLimits['alttext-ai'];

    // Get current user data
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // Update user
    const updateData = {
      service: service // Update service if not set
    };
    if (plan !== 'free') {
      updateData.plan = plan;
      updateData.tokensRemaining = serviceLimits[plan] || serviceLimits.free;
      updateData.stripeSubscriptionId = sessionWithItems.subscription;
    }
    if (creditsToAdd > 0) {
      updateData.credits = (currentUser.credits || 0) + creditsToAdd;
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) throw updateError;
    if (!updatedUser) {
      throw new Error(`User ${userId} not found after update`);
    }

    logger.info(`User ${userId} (${service}) upgraded to ${plan} plan${creditsToAdd > 0 ? ` with ${creditsToAdd} credits` : ''}`);

    // Create license for all paid plans (pro, agency) and free if needed
    // Extract site metadata from session metadata if provided
    const siteUrl = session.metadata.siteUrl || null;
    const siteHash = session.metadata.siteHash || null;
    const installId = session.metadata.installId || null;

    let license = null;
    if (plan !== 'free' || session.metadata.createFreeLicense === 'true') {
      try {
        logger.info(`Creating license for user ${userId}`, { plan });

        // Get user's organization if exists (for agency plans)
        let organizationId = null;
        if (plan === 'agency') {
          const { data: membership } = await supabase
            .from('organization_members')
            .select('organizationId')
            .eq('userId', userId)
            .eq('role', 'owner')
            .limit(1)
            .single();

          if (membership) {
            organizationId = membership.organizationId;
          } else {
            // Create organization for agency plan
            const { data: organization, error: orgError } = await supabase
              .from('organizations')
              .insert({
                name: `${updatedUser.email.split('@')[0]}'s Agency`,
                plan: 'agency',
                service: service,
                maxSites: 10,
                tokensRemaining: serviceLimits.agency,
                stripeCustomerId: updatedUser.stripe_customer_id,
                stripeSubscriptionId: sessionWithItems.subscription,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              })
              .select()
              .single();

            if (orgError) throw orgError;

            // Create organization member (owner role)
            const { error: memberError } = await supabase
              .from('organization_members')
              .insert({
                organizationId: organization.id,
                userId: userId,
                role: 'owner',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });

            if (memberError) throw memberError;

            organizationId = organization.id;
            logger.info(`Organization created`, { organizationId: organization.id });
          }
        }

        // Create license via license service
        license = await licenseService.createLicense({
          plan,
          service,
          userId: plan === 'agency' ? null : userId, // Agency licenses are org-based
          organizationId,
          siteUrl,
          siteHash,
          installId,
          stripeCustomerId: updatedUser.stripe_customer_id,
          stripeSubscriptionId: sessionWithItems.subscription,
          email: updatedUser.email,
          name: updatedUser.email.split('@')[0]
        });

        logger.info(`License created`, { licenseKey: license.licenseKey });

        // If site info was provided, auto-attach should have been attempted
        // Get updated license snapshot
        const licenseSnapshot = await licenseService.getLicenseSnapshot(license.id);
        license = { ...license, ...licenseSnapshot };

      } catch (licenseError) {
        logger.error('Error creating license', { error: licenseError.message });
        // Don't fail the whole checkout if license creation fails
        // User still gets their plan upgrade
      }
    }

    // Return license info for webhook response (if needed)
    return {
      userId,
      plan,
      service,
      license: license ? await licenseService.getLicenseSnapshot(license.id) : null
    };

  } catch (error) {
    logger.error('Error handling successful checkout', { error: error.message });
    throw error;
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription) {
  try {
    const customerId = subscription.customer;
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('stripeCustomerId', customerId)
      .single();

    if (userError || !user) {
      logger.warn(`No user found for customer`, { customerId });
      return;
    }

    const status = subscription.status;
    const priceId = subscription.items.data[0].price.id;

    if (status === 'active') {
      // Determine plan from price ID (supports both services)
      let plan = 'free';
      if (priceId === getEnv('ALTTEXT_AI_STRIPE_PRICE_PRO') ||
          priceId === getEnv('SEO_AI_META_STRIPE_PRICE_PRO')) {
        plan = 'pro';
      } else if (priceId === getEnv('ALTTEXT_AI_STRIPE_PRICE_AGENCY') ||
                 priceId === getEnv('SEO_AI_META_STRIPE_PRICE_AGENCY')) {
        plan = 'agency';
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan,
          stripeSubscriptionId: subscription.id
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

    } else if (status === 'canceled' || status === 'incomplete_expired') {
      // Downgrade to free
      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'free',
          stripeSubscriptionId: null
        })
        .eq('id', user.id);

      if (updateError) throw updateError;
    }

  } catch (error) {
    logger.error('Error handling subscription update', { error: error.message });
    throw error;
  }
}

/**
 * Handle invoice payment (monthly reset)
 */
async function handleInvoicePaid(invoice) {
  try {
    const customerId = invoice.customer;
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('service, plan')
      .eq('stripeCustomerId', customerId)
      .single();

    if (userError || !user) {
      logger.warn(`No user found for customer`, { customerId });
      return;
    }

    // Service-specific plan limits
    const planLimits = {
      'alttext-ai': { free: 50, pro: 1000, agency: 10000 },
      'seo-ai-meta': { free: 10, pro: 100, agency: 1000 }
    };

    const serviceLimits = planLimits[user.service] || planLimits['alttext-ai'];
    const limit = serviceLimits[user.plan] || serviceLimits.free;

    const { error: updateError } = await supabase
      .from('users')
      .update({
        tokensRemaining: limit,
        resetDate: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    logger.info(`User monthly tokens reset`, { userId: user.id, service: user.service, limit });

  } catch (error) {
    logger.error('Error handling invoice payment', { error: error.message });
    throw error;
  }
}

/**
 * Create Stripe checkout session for credit pack purchase
 * @param {string} email - User email address
 * @param {string} priceId - Stripe price ID for the credit pack
 * @param {number} credits - Number of credits in the pack
 * @param {string} successUrl - URL to redirect after successful payment
 * @param {string} cancelUrl - URL to redirect if payment is cancelled
 * @returns {Promise<Object>} Stripe checkout session
 */
async function createCreditPackCheckoutSession(email, priceId, credits, successUrl, cancelUrl) {
  try {
    if (!email || !priceId || !credits || credits <= 0) {
      throw new Error('Invalid parameters: email, priceId, and positive credits amount required');
    }

    // Get or create Stripe customer by email
    const customers = await stripe.customers.list({
      email: email.toLowerCase(),
      limit: 1,
    });

    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: email.toLowerCase(),
        metadata: {
          user_email: email.toLowerCase(),
        },
      });
      customerId = customer.id;
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
      mode: 'payment', // Credit packs are one-time payments
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        credits: credits.toString(),
        type: 'credit_pack',
      },
    });

    logger.info(`Created credit pack checkout session`, { sessionId: session.id, email, credits });
    return session;

  } catch (error) {
    logger.error('[Checkout] Error creating credit pack checkout session', { error: error.message });
    throw error;
  }
}

module.exports = {
  createCheckoutSession,
  createCustomerPortalSession,
  handleSuccessfulCheckout,
  handleSubscriptionUpdate,
  handleInvoicePaid,
  createCreditPackCheckoutSession,
};
