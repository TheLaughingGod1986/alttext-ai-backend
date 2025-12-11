const express = require('express');

function createBillingRouter({ supabase, requiredToken, getStripe, priceIds }) {
  const router = express.Router();

  const plans = [
    {
      id: 'pro',
      name: 'Pro Plan',
      price: 14.99,
      currency: 'usd',
      interval: 'month',
      quota: 1000,
      sites: 1,
      features: [
        '1,000 AI-generated alt texts per month',
        'WCAG-compliant descriptions',
        'Bulk generate for media library',
        'Priority email support',
        'Use on one WordPress site'
      ],
      priceId: priceIds.pro,
      trialDays: 0,
      scope: 'site'
    },
    {
      id: 'agency',
      name: 'Agency Plan',
      price: 59.99,
      currency: 'usd',
      interval: 'month',
      quota: 10000,
      sites: 'unlimited',
      features: [
        '10,000 AI-generated alt texts per month',
        'WCAG 2.1 AA for all client sites',
        'Bulk generate across multiple sites',
        'Dedicated account manager and priority support',
        'Use on unlimited WordPress sites'
      ],
      priceId: priceIds.agency,
      trialDays: 0,
      scope: 'shared'
    },
    {
      id: 'credits',
      name: 'Credit Pack',
      price: 11.99,
      currency: 'usd',
      interval: 'one-time',
      quota: 100,
      sites: 'any',
      features: [
        '100 credits for alt text generation',
        'Credits never expire',
        'No subscription required',
        'Use on any WordPress site'
      ],
      priceId: priceIds.credits,
      trialDays: 0,
      scope: 'site'
    }
  ];

  function requireBillingAuth(req, res) {
    if (requiredToken) {
      const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '') || req.header('X-API-Key');
      if (token !== requiredToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
      }
    }
    const siteKey = req.header('X-Site-Key');
    if (!siteKey) {
      res.status(400).json({ error: 'Missing X-Site-Key header' });
      return false;
    }
    return true;
  }

  router.get('/plans', (_req, res) => {
    res.json({ success: true, plans });
  });

  router.post('/checkout', async (req, res) => {
    if (!requireBillingAuth(req, res)) return;
    const { priceId, successUrl, cancelUrl } = req.body || {};
    const siteKey = req.header('X-Site-Key');

    if (!priceId || !Object.values(priceIds).includes(priceId)) {
      return res.status(400).json({ error: 'Invalid or missing priceId', valid: priceIds });
    }
    // Enforce site limit for PRO: only 1 site per subscription
    // IMPORTANT: Only check for Pro subscriptions, not Agency or Credit packs
    // This allows users to have multiple plan types (e.g., Agency + Pro, or Credits + Pro)
    if (priceId === priceIds.pro && supabase) {
      try {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('site_hash', siteKey)
          .eq('plan', 'pro') // Only check Pro subscriptions, not all plans
          .in('status', ['active', 'trial', 'past_due']);
        if (subs && subs.length > 0) {
          return res.status(403).json({
            error: 'SITE_LIMIT_EXCEEDED',
            message: 'Pro plan is limited to 1 site per subscription.',
            plan: 'pro'
          });
        }
      } catch (e) {
        // fail-open
      }
    }

    const stripeClient = getStripe();
    if (!stripeClient) {
      return res.status(501).json({ error: 'Stripe not configured' });
    }
    try {
      const session = await stripeClient.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl || `${process.env.FRONTEND_URL || 'https://example.com'}/billing/success`,
        cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'https://example.com'}/billing/cancel`,
        metadata: { site_id: siteKey }
      });
      res.json({ success: true, url: session.url, sessionId: session.id });
    } catch (error) {
      console.error('[billing] checkout error', error.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  router.post('/portal', async (req, res) => {
    if (!requireBillingAuth(req, res)) return;
    const { returnUrl, customerId } = req.body || {};
    const stripeClient = getStripe();
    if (!stripeClient) {
      return res.status(501).json({ error: 'Stripe not configured' });
    }
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required for portal' });
    }
    try {
      const session = await stripeClient.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || `${process.env.FRONTEND_URL || 'https://example.com'}/billing`
      });
      res.json({ success: true, url: session.url });
    } catch (error) {
      console.error('[billing] portal error', error.message);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  router.get('/subscription', async (req, res) => {
    if (!requireBillingAuth(req, res)) return;
    const siteKey = req.header('X-Site-Key');
    try {
      const { data: subscription } = supabase
        ? await supabase.from('subscriptions').select('*').eq('site_hash', siteKey).single()
        : { data: null };
      if (!subscription) {
        return res.json({
          success: true,
          data: {
            plan: 'free',
            status: 'free',
            billingCycle: null,
            nextBillingDate: null,
            subscriptionId: null,
            cancelAtPeriodEnd: false
          }
        });
      }
      res.json({
        success: true,
        data: {
          plan: subscription.plan || 'free',
          status: subscription.status || 'active',
          billingCycle: 'month',
          nextBillingDate: subscription.current_period_end || null,
          subscriptionId: subscription.stripe_subscription_id || null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false
        }
      });
    } catch (error) {
      console.error('[billing] subscription fetch error', error.message);
      res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  });

  return router;
}

module.exports = { createBillingRouter };
