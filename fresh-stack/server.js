const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { z } = require('zod');
const crypto = require('crypto');
const { validateImagePayload } = require('./lib/validation');
const { generateAltText } = require('./lib/openai');
const { getRedis } = require('./lib/redis');
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

// Simple shared secret auth: require header X-API-Key to match ALT_API_TOKEN when set
const requiredToken = process.env.ALT_API_TOKEN || process.env.API_TOKEN;
app.use((req, res, next) => {
  if (!requiredToken) return next();
  const token = req.header('X-API-Key') || req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    if (token === requiredToken) return next();
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API token' });
  });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '8mb' }));

// In-memory cache for deduplication: hash -> { altText, usage, meta, warnings }
const resultCache = new Map();

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

function hashPayload(base64) {
  return crypto.createHash('md5').update(base64).digest('hex');
}

// Minimal job queue (Redis if available, otherwise in-memory)
const jobStore = new Map(); // in-memory job records
const jobQueue = [];
const JOB_CONCURRENCY = Number(process.env.JOB_CONCURRENCY || 2);
let activeWorkers = 0;
const JOB_TTL_SECONDS = 60 * 60 * 24 * 7;
const queueKey = 'alttext:queue';

async function setJobRecord(jobId, record) {
  record.updatedAt = new Date().toISOString();
  if (redis) {
    await redis.set(`alttext:job:${jobId}`, JSON.stringify(record), 'EX', JOB_TTL_SECONDS);
  } else {
    jobStore.set(jobId, record);
  }
}

async function getJobRecord(jobId) {
  if (redis) {
    const val = await redis.get(`alttext:job:${jobId}`);
    return val ? JSON.parse(val) : null;
  }
  return jobStore.get(jobId) || null;
}

async function enqueueJob(job) {
  if (redis) {
    await redis.lpush(queueKey, JSON.stringify(job));
    startRedisWorkers();
  } else {
    jobQueue.push(job);
    processQueueInMemory();
  }
}

async function processQueueInMemory() {
  if (activeWorkers >= JOB_CONCURRENCY) return;
  const next = jobQueue.shift();
  if (!next) return;
  activeWorkers += 1;
  try {
    await processJob(next);
  } finally {
    activeWorkers -= 1;
    if (jobQueue.length) processQueueInMemory();
  }
}

let redisWorkersStarted = false;
function startRedisWorkers() {
  if (redisWorkersStarted || !redis) return;
  redisWorkersStarted = true;
  for (let i = 0; i < JOB_CONCURRENCY; i += 1) {
    redisWorkerLoop();
  }
}

async function redisWorkerLoop() {
  while (true) {
    try {
      const res = await redis.brpop(queueKey, 5);
      if (!res) continue;
      const [, payload] = res;
      const job = JSON.parse(payload);
      await processJob(job);
    } catch (err) {
      console.error('[jobs] worker error', err.message);
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

async function processJob(job) {
  const { jobId, items, context } = job;
  const record = await getJobRecord(jobId);
  if (!record) return;
  record.status = 'running';
  await setJobRecord(jobId, record);

  for (const item of items) {
    try {
      const { image, context: itemContext } = item;
      const mergedContext = { ...context, ...itemContext };
      const { altText, usage, meta } = await generateAltText({ image, context: mergedContext });
      record.results.push({ altText, usage, meta });
    } catch (e) {
      record.errors.push(e.message || 'Job item failed');
    }
    await setJobRecord(jobId, record);
  }
  record.status = 'completed';
  await setJobRecord(jobId, record);
}

async function createJob(items, context, siteKey) {
  const jobId = crypto.randomUUID();
  const jobRecord = {
    status: 'queued',
    results: [],
    errors: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await setJobRecord(jobId, jobRecord);
  await enqueueJob({ jobId, items, context, siteKey });
  return jobId;
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
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn('[alt-text] invalid payload', parsed.error.issues?.[0]);
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const { image, context = {} } = parsed.data;
  const siteKey = req.header('X-Site-Key') || 'default';
  const bypassCache = req.header('X-Bypass-Cache') === 'true' || req.query.no_cache === '1';

  // Rate limit per site
  if (!(await checkRateLimit(siteKey))) {
    return res.status(429).json({ error: 'Rate limit exceeded for this site. Please retry later.' });
  }

  // Deduplication via hash
  const base64Data = image.base64 || image.image_base64 || '';
  const cacheKey = base64Data ? hashPayload(base64Data) : null;
  if (cacheKey && !bypassCache) {
    if (redis) {
      try {
        const cached = await redis.get(`alttext:cache:${cacheKey}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          console.info('[alt-text] cache hit', {
            width: image.width,
            height: image.height,
            cached: true,
            prompt_tokens: parsed?.usage?.prompt_tokens,
            completion_tokens: parsed?.usage?.completion_tokens,
            model: parsed?.meta?.modelUsed
          });
          return res.json({ ...parsed, cached: true });
        }
      } catch (e) {
        // fall through on cache errors
      }
    } else if (resultCache.has(cacheKey)) {
      const cached = resultCache.get(cacheKey);
      console.info('[alt-text] cache hit', {
        width: image.width,
        height: image.height,
        cached: true,
        prompt_tokens: cached?.usage?.prompt_tokens,
        completion_tokens: cached?.usage?.completion_tokens,
        model: cached?.meta?.modelUsed
      });
      return res.json({ ...cached, cached: true });
    }
  }

  console.info('[alt-text] request received', {
    hasBase64: Boolean(image.base64 || image.image_base64),
    hasUrl: Boolean(image.url),
    width: image.width,
    height: image.height
  });
  const { errors, warnings, normalized } = validateImagePayload(image);
  if (normalized?.base64) {
    const sizeKb = Math.round((normalized.base64.length * 3) / 4096);
    const bpp = normalized.width && normalized.height
      ? Math.round(((normalized.base64.length * 0.75) / (normalized.width * normalized.height)) * 10000) / 10000
      : null;
    console.info('[alt-text] base64 meta', { kb: sizeKb, width: normalized.width, height: normalized.height, bpp });
  }

  if (errors.length) {
    console.warn('[alt-text] validation failed', { errors, warnings });
    return res.status(400).json({ error: 'Image validation failed', errors, warnings });
  }

  const { altText, usage, meta } = await generateAltText({
    image: normalized,
    context: { ...context, filename: normalized.filename }
  });

  // Record usage/credits for successful, non-cached generations
  if (!bypassCache && usage) {
    await recordUsage({
      siteKey,
      usage,
      supabaseClient: supabase,
      headers: req.headers
    });
  }

  if (cacheKey && !bypassCache) {
    const payload = { altText, warnings, usage, meta };
    if (redis) {
      redis.set(`alttext:cache:${cacheKey}`, JSON.stringify(payload), 'EX', 60 * 60 * 24 * 7).catch(() => {});
    } else {
      resultCache.set(cacheKey, payload);
    }
  }

  console.info('[alt-text] usage', {
    width: normalized.width,
    height: normalized.height,
    prompt_tokens: usage?.prompt_tokens,
    completion_tokens: usage?.completion_tokens,
    model: meta?.modelUsed,
    cached: false
  });

  res.json({
    altText,
    warnings,
    usage,
    meta
  });
});

// Batch endpoint: accepts an array of images, enqueues a job, returns jobId
const batchSchema = z.object({
  images: z.array(z.object({
    image: requestSchema.shape.image,
    context: requestSchema.shape.context.optional()
  })).min(1),
  context: requestSchema.shape.context.optional()
});

app.post('/api/jobs', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const siteKey = req.header('X-Site-Key') || 'default';
  if (!(await checkRateLimit(siteKey))) {
    return res.status(429).json({ error: 'Rate limit exceeded for this site. Please retry later.' });
  }
  const { images, context = {} } = parsed.data;
  const items = images.map(item => ({ image: item.image, context: item.context || {} }));
  const jobId = await createJob(items, context, siteKey);
  res.json({ jobId, status: 'queued' });
});

app.get('/api/jobs/:jobId', async (req, res) => {
  const job = await getJobRecord(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.listen(PORT, HOST, () => {
  console.log(`Fresh alt-text service running on http://${HOST}:${PORT}`);
});
