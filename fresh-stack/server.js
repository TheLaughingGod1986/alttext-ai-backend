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
} catch (e) {
  console.warn('[usage] Supabase client not available; /api/usage will return minimal data');
}

const app = express();
const redis = getRedis();

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

// Usage endpoint (site summary and optional per-user breakdown)
app.get('/api/usage', async (req, res) => {
  const siteKey = req.header('X-Site-Key');
  if (!siteKey) {
    return res.status(400).json({ error: 'Missing X-Site-Key header' });
  }
  if (requiredToken) {
    const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '') || req.header('X-API-Key');
    if (token !== requiredToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Minimal fallback if Supabase is not configured
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

    // Get site record if exists
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('site_hash', siteKey)
      .single();

    const siteCreatedAt = site?.created_at ? new Date(site.created_at) : null;
    const plan = site?.plan || 'free';

    // Determine billing scope and quota
    const planScopes = {
      pro: 'site',
      agency: 'shared',
      free: 'site',
      credits: 'site'
    };
    const defaultQuotas = {
      pro: 1000,
      agency: 10000,
      free: 50,
      credits: 0
    };

    // Subscription info
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('site_hash', siteKey)
      .single();

    const subscriptionPlan = subscription?.plan || plan || 'free';
    const quota = site?.monthly_limit || defaultQuotas[subscriptionPlan] || 0;
    const scope = planScopes[subscriptionPlan] || 'site';

    // Period based on signup date (site created_at) or subscription period
    const now = new Date();
    let periodStart = siteCreatedAt || now;
    if (subscription?.current_period_start && subscription?.current_period_end) {
      periodStart = new Date(subscription.current_period_start);
    }
    // Align to monthly anniversary of signup date
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

    // Usage aggregation from usage_logs within period
    let usedImages = 0;
    let usedPromptTokens = 0;
    let usedCompletionTokens = 0;
    let usersBreakdown = [];

    const { data: logs, error: logsError } = await supabase
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

    // Credits (site-wide)
    let creditsTotal = null;
    let creditsUsed = null;
    let creditsRemaining = null;
    const { data: credits, error: creditsError } = await supabase
      .from('credits')
      .select('*')
      .eq('site_hash', siteKey)
      .single();
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
