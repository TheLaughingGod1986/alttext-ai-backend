const express = require('express');

function createUsageRouter({ supabase, requiredToken }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const siteKey = req.header('X-Site-Key');
    if (!siteKey) {
      return res.status(400).json({ error: 'Missing X-Site-Key header' });
    }
    if (requiredToken) {
      const token = req.header('Authorization')?.replace(/^Bearer\\s+/i, '') || req.header('X-API-Key');
      if (token !== requiredToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    if (!supabase) {
      return res.json({
        success: true,
        siteId: siteKey,
        subscription: {
          plan: 'unknown',
          status: 'unknown',
          quota: null,
          used: null,
          remaining: null,
          periodStart: null,
          periodEnd: null,
          scope: 'unknown'
        },
        credits: {
          total: null,
          used: null,
          remaining: null,
          scope: 'unknown'
        },
        users: []
      });
    }

    try {
      const userIdFilter = req.header('X-WP-User-ID') || null;
      const userEmailFilter = req.header('X-WP-User-Email') || null;

      const { data: site } = await supabase.from('sites').select('*').eq('site_hash', siteKey).single();
      const siteCreatedAt = site?.created_at ? new Date(site.created_at) : null;
      const plan = site?.plan || 'free';

      const planScopes = { pro: 'site', agency: 'shared', free: 'site', credits: 'site' };
      const defaultQuotas = { pro: 1000, agency: 10000, free: 50, credits: 0 };

      const { data: subscription } = supabase
        ? await supabase.from('subscriptions').select('*').eq('site_hash', siteKey).single()
        : { data: null };

      const subscriptionPlan = subscription?.plan || plan || 'free';
      const quota = site?.monthly_limit || defaultQuotas[subscriptionPlan] || 0;
      const scope = planScopes[subscriptionPlan] || 'site';

      const now = new Date();
      let periodStart = siteCreatedAt || now;
      if (subscription?.current_period_start && subscription?.current_period_end) {
        periodStart = new Date(subscription.current_period_start);
      }
      if (siteCreatedAt) {
        const start = new Date(now);
        start.setDate(siteCreatedAt.getDate());
        start.setHours(0, 0, 0, 0);
        if (start > now) {
          start.setMonth(start.getMonth() - 1);
        }
        periodStart = start;
      }
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      let usedImages = 0;
      let usedPromptTokens = 0;
      let usedCompletionTokens = 0;
      let usersBreakdown = [];

      const { data: logs } = await supabase
        .from('usage_logs')
        .select('*')
        .eq('site_hash', siteKey)
        .gte('created_at', periodStart.toISOString());

      if (logs) {
        logs.forEach((log) => {
          usedImages += Number(log.images || log.images_used || 0);
          usedPromptTokens += Number(log.prompt_tokens || log.tokens || 0);
          usedCompletionTokens += Number(log.completion_tokens || 0);
        });
        if (userIdFilter || userEmailFilter) {
          const byUser = {};
          logs.forEach((log) => {
            const uid = log.user_id || log.user || 'unknown';
            if (userIdFilter && String(uid) !== String(userIdFilter)) return;
            if (!byUser[uid]) {
              byUser[uid] = { images: 0, prompt_tokens: 0, completion_tokens: 0 };
            }
            byUser[uid].images += Number(log.images || log.images_used || 0);
            byUser[uid].prompt_tokens += Number(log.prompt_tokens || log.tokens || 0);
            byUser[uid].completion_tokens += Number(log.completion_tokens || 0);
          });
          usersBreakdown = Object.entries(byUser).map(([userId, usage]) => ({ userId, used: usage }));
        }
      }

      let creditsTotal = null;
      let creditsUsed = null;
      let creditsRemaining = null;
      const { data: credits } = await supabase.from('credits').select('*').eq('site_hash', siteKey).single();
      if (credits) {
        creditsTotal = Number(credits.monthly_limit || credits.total || credits.credits || 0);
        creditsUsed = Number(credits.used_this_month || credits.used_total || 0);
        creditsRemaining = Math.max(creditsTotal - creditsUsed, 0);
      }

      const subscriptionStatus = subscription?.status || site?.plan || 'free';
      const subscriptionUsed = usedImages;
      const subscriptionRemaining = quota ? Math.max(quota - subscriptionUsed, 0) : null;

      res.json({
        success: true,
        siteId: siteKey,
        subscription: {
          plan: subscriptionPlan,
          status: subscriptionStatus,
          quota,
          used: subscriptionUsed,
          remaining: subscriptionRemaining,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          scope
        },
        credits: {
          total: creditsTotal,
          used: creditsUsed,
          remaining: creditsRemaining,
          scope: 'site'
        },
        users: usersBreakdown
      });
    } catch (error) {
      console.error('[usage] error', error.message);
      res.status(500).json({ error: 'Failed to fetch usage' });
    }
  });

  return router;
}

module.exports = { createUsageRouter };
