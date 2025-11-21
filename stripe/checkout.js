/**
 * Stripe Checkout and Customer Portal
 */

const Stripe = require('stripe');
const { supabase } = require('../supabase-client');
const emailService = require('../services/emailService');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create Stripe Checkout Session
 */
async function createCheckoutSession(userId, priceId, successUrl, cancelUrl, service = 'alttext-ai') {
  try {
    console.log('createCheckoutSession called with:', { userId, priceId, service, successUrl, cancelUrl });
    
    // Validate userId exists
    if (!userId) {
      console.error('Invalid userId provided:', userId);
      throw new Error('Invalid user ID');
    }

    // Query user - only select columns that exist in the database
    console.log('Querying Supabase for user:', userId);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Supabase query error:', {
        message: userError.message,
        code: userError.code,
        details: userError.details,
        hint: userError.hint,
        userId: userId
      });
      throw new Error(`User lookup failed: ${userError.message}`);
    }

    if (!user) {
      console.error('User not found in database:', { userId: userId });
      throw new Error('User not found');
    }

    console.log('User found:', { id: user.id, email: user.email, hasStripeCustomer: !!user.stripe_customer_id });

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
      console.log('Stripe customer created and user updated:', { customerId, userId });
    } else {
      console.log('Using existing Stripe customer:', customerId);
    }

    // Create checkout session
    console.log('Creating Stripe checkout session with:', { customerId, priceId, mode: priceId === process.env.ALTTEXT_AI_STRIPE_PRICE_CREDITS ? 'payment' : 'subscription' });
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: priceId === process.env.ALTTEXT_AI_STRIPE_PRICE_CREDITS ? 'payment' : 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId.toString(),
        service: userService
      },
      subscription_data: priceId !== process.env.ALTTEXT_AI_STRIPE_PRICE_CREDITS ? {
        metadata: {
          service: userService
        }
      } : undefined
    });

    console.log('Stripe checkout session created successfully:', { sessionId: session.id, url: session.url });
    return session;

  } catch (error) {
    console.error('Error creating checkout session:', {
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
      console.error('Supabase query error in portal session:', {
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
    console.error('Error creating customer portal session:', error);
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
      sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items.data.price']
      });
    }

    const priceId = sessionWithItems.line_items.data[0].price.id;

    // Determine plan type based on price ID and service
    let plan = 'free';
    let creditsToAdd = 0;

    // AltText AI products
    if (priceId === process.env.ALTTEXT_AI_STRIPE_PRICE_PRO) {
      plan = 'pro';
    } else if (priceId === process.env.ALTTEXT_AI_STRIPE_PRICE_AGENCY) {
      plan = 'agency';
    } else if (priceId === process.env.ALTTEXT_AI_STRIPE_PRICE_CREDITS) {
      creditsToAdd = 100; // 100 credits for £9.99
    }
    // SEO AI Meta products
    else if (priceId === process.env.SEO_AI_META_STRIPE_PRICE_PRO) {
      plan = 'pro';
    } else if (priceId === process.env.SEO_AI_META_STRIPE_PRICE_AGENCY) {
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

    console.log(`✅ User ${userId} (${service}) upgraded to ${plan} plan${creditsToAdd > 0 ? ` with ${creditsToAdd} credits` : ''}`);

    // If agency plan, create organization and send license key email
    if (plan === 'agency') {
      try {
        console.log(`📋 Creating agency organization for user ${userId}`);

        // Create organization with generated license key
        const { data: organization, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: `${updatedUser.email.split('@')[0]}'s Agency`,
            plan: 'agency',
            service: service,
            maxSites: 10,
            tokensRemaining: serviceLimits.agency,
            stripeCustomerId: updatedUser.stripeCustomerId,
            stripeSubscriptionId: sessionWithItems.subscription,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
          .select()
          .single();

        if (orgError) throw orgError;

        console.log(`✅ Organization created: ${organization.id}, License: ${organization.licenseKey}`);

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

        console.log(`✅ Organization owner added: user ${userId}`);

        // Send license key email
        const emailResult = await emailService.sendLicenseKey({
          email: updatedUser.email,
          name: updatedUser.email.split('@')[0],
          licenseKey: organization.licenseKey,
          plan: 'agency',
          maxSites: 10,
          monthlyQuota: serviceLimits.agency
        });

        if (emailResult.success) {
          console.log(`✅ License key email sent to ${updatedUser.email}`);
        } else {
          console.error(`❌ Failed to send license email: ${emailResult.error}`);
        }

      } catch (orgError) {
        console.error('Error creating organization/sending email:', orgError);
        // Don't fail the whole checkout if organization creation fails
        // User still gets their plan upgrade
      }
    }

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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('stripeCustomerId', customerId)
      .single();

    if (userError || !user) {
      console.warn(`No user found for customer ${customerId}`);
      return;
    }

    const status = subscription.status;
    const priceId = subscription.items.data[0].price.id;

    if (status === 'active') {
      // Determine plan from price ID (supports both services)
      let plan = 'free';
      if (priceId === process.env.ALTTEXT_AI_STRIPE_PRICE_PRO ||
          priceId === process.env.SEO_AI_META_STRIPE_PRICE_PRO) {
        plan = 'pro';
      } else if (priceId === process.env.ALTTEXT_AI_STRIPE_PRICE_AGENCY ||
                 priceId === process.env.SEO_AI_META_STRIPE_PRICE_AGENCY) {
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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('service, plan')
      .eq('stripeCustomerId', customerId)
      .single();

    if (userError || !user) {
      console.warn(`No user found for customer ${customerId}`);
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

    console.log(`✅ User ${user.id} (${user.service}) monthly tokens reset to ${limit}`);

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
