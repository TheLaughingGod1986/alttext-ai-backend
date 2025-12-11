const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { getRedis } = require('./lib/redis');
const { validateLicenseKey, getSiteFromHeaders } = require('./lib/auth');
// Supabase (for usage/credits). If unavailable, usage endpoint will return minimal data.
let supabase = null;
try {
  const supabaseClient = require('../db/supabase-client');
  supabase = supabaseClient.supabase || supabaseClient;
  if (supabase) {
    console.info('[usage] Supabase client initialized');
  }
} catch (e) {
  console.warn('[usage] Supabase client not available; /api/usage will return minimal data');
}

// Stripe helper
let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

const { createBillingRouter } = require('./routes/billing');
const { createUsageRouter } = require('./routes/usage');
const { createAltTextRouter } = require('./routes/altText');
const { createJobsRouter } = require('./routes/jobs');

const app = express();
const redis = getRedis();

// Stripe price IDs (defaults map to current Render env)
const priceIds = {
  pro: process.env.ALTTEXT_AI_STRIPE_PRICE_PRO || 'price_1SMrxaJl9Rm418cMM4iikjlJ',
  agency: process.env.ALTTEXT_AI_STRIPE_PRICE_AGENCY || 'price_1SMrxaJl9Rm418cMnJTShXSY',
  credits: process.env.ALTTEXT_AI_STRIPE_PRICE_CREDITS || 'price_1SMrxbJl9Rm418cM0gkzZQZt'
};

// CORS: lock to allowed origins if provided, otherwise default permissive
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: false
}));
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';

// License key authentication middleware (optional - allows license OR API token OR free tier)
app.use(validateLicenseKey(supabase));

// Simple shared secret auth: require header X-API-Key to match ALT_API_TOKEN when set
// NOTE: If license key is valid, this is skipped
const requiredToken = process.env.ALT_API_TOKEN || process.env.API_TOKEN;
app.use((req, res, next) => {
  if (!requiredToken) return next();
  if (req.authMethod === 'license') return next(); // License key already validated
  const token = req.header('X-API-Key') || req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    if (token === requiredToken) return next();
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API token' });
  });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '8mb' }));

// Rate limiting (per-site and global), sliding window per minute
const rateWindowMs = 60_000;
const rateLimitPerSite = Number(process.env.RATE_LIMIT_PER_SITE || 120); // requests/minute/site
const rateLimitGlobal = Number(process.env.RATE_LIMIT_GLOBAL || 0); // 0 = disabled
const siteHits = new Map(); // key -> array of timestamps (in-memory fallback)
const globalHits = [];

async function checkRateLimit(siteKey) {
  if (redis) {
    const pipe = redis.multi();
    const siteKeyName = `alttext:rate:${siteKey}:${Math.floor(Date.now() / rateWindowMs)}`;
    pipe.incr(siteKeyName).expire(siteKeyName, rateWindowMs / 1000);
    if (rateLimitGlobal > 0) {
      const globalKey = `alttext:rate:global:${Math.floor(Date.now() / rateWindowMs)}`;
      pipe.incr(globalKey).expire(globalKey, rateWindowMs / 1000);
    }
    const results = await pipe.exec().catch(() => null);
    if (!results) return true; // fail-open on redis errors
    const siteCount = Number(results[0][1] || 0);
    const globalCount = rateLimitGlobal > 0 ? Number(results[2]?.[1] || 0) : 0;
    if (siteCount > rateLimitPerSite) return false;
    if (rateLimitGlobal > 0 && globalCount > rateLimitGlobal) return false;
    return true;
  }

  // In-memory fallback
  const now = Date.now();
  const windowStart = now - rateWindowMs;
  const list = siteHits.get(siteKey) || [];
  const recent = list.filter(ts => ts >= windowStart);
  recent.push(now);
  siteHits.set(siteKey, recent);

  if (recent.length > rateLimitPerSite) return false;

  if (rateLimitGlobal > 0) {
    const recentGlobal = globalHits.filter(ts => ts >= windowStart);
    recentGlobal.push(now);
    globalHits.length = 0;
    globalHits.push(...recentGlobal);
    if (globalHits.length > rateLimitGlobal) return false;
  }

  return true;
}

const requestSchema = z.object({
  image: z
    .object({
      base64: z.string().optional(),
      image_base64: z.string().optional(),
      url: z.string().url().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      mime_type: z.string().optional(),
      filename: z.string().optional()
    })
    .refine(
      data => Boolean(data.base64 || data.image_base64 || data.url),
      'Send base64/image_base64 or url.'
    ),
  context: z
    .object({
      title: z.string().optional(),
      caption: z.string().optional(),
      pageTitle: z.string().optional(),
      altTextSuggestion: z.string().optional()
    })
    .optional()
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'alttext-fresh', time: new Date().toISOString() });
});

// Usage + billing routers
app.use('/api/usage', createUsageRouter({ supabase, requiredToken }));
app.use('/billing', createBillingRouter({ supabase, requiredToken, getStripe, priceIds }));

async function recordUsage({ siteKey, usage, supabaseClient, headers }) {
  if (!siteKey) return;
  if (!supabaseClient) {
    console.warn('[usage] Supabase not configured; skipping usage log');
    return;
  }
  const promptTokens = Number(usage?.prompt_tokens || 0);
  const completionTokens = Number(usage?.completion_tokens || 0);
  const totalTokens = promptTokens + completionTokens;
  const userId = headers['x-wp-user-id'] || headers['x-user-id'] || null;
  const userEmail = headers['x-wp-user-email'] || headers['x-user-email'] || null;

  // 1) Write usage log
  try {
    console.info('[usage] logging usage', { siteKey, promptTokens, completionTokens, totalTokens });
    await supabaseClient.from('usage_logs').insert({
      site_hash: siteKey,
      images: 1,
      images_used: 1,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      tokens: totalTokens,
      user_id: userId,
      user_email: userEmail
    });
  } catch (e) {
    console.warn('[usage] failed to insert usage log', e.message);
  }

  // 2) Increment credits counters (best-effort)
  try {
    const { data: creditsRow } = await supabaseClient
      .from('credits')
      .select('*')
      .eq('site_hash', siteKey)
      .single();

    const nextUsedThisMonth = Number(creditsRow?.used_this_month || creditsRow?.used_total || 0) + 1;
    const nextUsedTotal = Number(creditsRow?.used_total || 0) + 1;

    if (creditsRow) {
      console.info('[usage] updating credits', { siteKey, nextUsedThisMonth, nextUsedTotal });
      await supabaseClient
        .from('credits')
        .update({ used_this_month: nextUsedThisMonth, used_total: nextUsedTotal })
        .eq('site_hash', siteKey);
    } else {
      console.info('[usage] creating credits row', { siteKey });
      await supabaseClient
        .from('credits')
        .insert({ site_hash: siteKey, used_this_month: 1, used_total: 1 });
    }
  } catch (e) {
    console.warn('[usage] failed to update credits', e.message);
  }
}

app.post('/api/alt-text', async (req, res) => {
// Mount alt-text and jobs routers
const altTextRouter = createAltTextRouter({
  supabase,
  redis,
  resultCache,
  checkRateLimit,
  getSiteFromHeaders,
  recordUsage
});
app.use('/api/alt-text', altTextRouter);

const jobsRouter = createJobsRouter({
  checkRateLimit,
  getSiteFromHeaders,
  createJob,
  getJobRecord
});
app.use('/api/jobs', jobsRouter);

app.listen(PORT, HOST, () => {
  console.log(`Fresh alt-text service running on http://${HOST}:${PORT}`);
});
