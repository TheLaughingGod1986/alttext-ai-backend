const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { validateImagePayload } = require('../lib/validation');
const { generateAltText } = require('../lib/openai');
const { enforceQuota } = require('../services/quota');
const { recordUsage } = require('../services/usage');
const { extractUserInfo } = require('../middleware/auth');
const logger = require('../lib/logger');
const { CACHE_TTL } = require('../lib/constants');

/**
 * Hash a base64 payload for cache key generation
 * @param {string} base64 - Base64 encoded image data
 * @returns {string} MD5 hash of the payload
 */
function hashPayload(base64) {
  return crypto.createHash('md5').update(base64).digest('hex');
}

/**
 * Check cache for existing alt text result
 * @param {Object} options - Cache check options
 * @param {string} options.cacheKey - Cache key to check
 * @param {Object} options.redis - Redis client
 * @param {Map} options.resultCache - In-memory cache fallback
 * @returns {Promise<Object|null>} Cached result or null
 */
async function checkCache({ cacheKey, redis, resultCache }) {
  if (!cacheKey) return null;

  if (redis) {
    try {
      const cached = await redis.get(`alttext:cache:${cacheKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      logger.warn('[altText] Cache read error', { error: e.message });
    }
  } else if (resultCache.has(cacheKey)) {
    return resultCache.get(cacheKey);
  }

  return null;
}

/**
 * Store result in cache
 * @param {Object} options - Cache storage options
 * @param {string} options.cacheKey - Cache key
 * @param {Object} options.payload - Data to cache
 * @param {Object} options.redis - Redis client
 * @param {Map} options.resultCache - In-memory cache fallback
 */
async function storeInCache({ cacheKey, payload, redis, resultCache }) {
  if (!cacheKey) return;

  if (redis) {
    redis.set(
      `alttext:cache:${cacheKey}`,
      JSON.stringify(payload),
      'EX',
      CACHE_TTL.ALT_TEXT_RESULT
    ).catch((e) => {
      logger.warn('[altText] Cache write error', { error: e.message });
    });
  } else {
    resultCache.set(cacheKey, payload);
  }
}

/**
 * Record usage statistics for alt text generation
 * @param {Object} options - Usage recording options
 * @returns {Promise<void>}
 */
async function recordAltTextUsage({
  supabase,
  licenseKey,
  siteKey,
  userInfo,
  usage,
  meta,
  normalized
}) {
  logger.info('[altText] Recording usage', {
    licenseKey: licenseKey ? `${licenseKey.substring(0, 8)}...` : 'missing',
    siteKey,
    userId: userInfo.user_id,
    creditsUsed: 1
  });

  const usageResult = await recordUsage(supabase, {
    licenseKey,
    siteHash: siteKey,
    userId: userInfo.user_id,
    userEmail: userInfo.user_email,
    pluginVersion: userInfo.plugin_version,
    creditsUsed: 1,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
    cached: false,
    modelUsed: meta?.modelUsed,
    generationTimeMs: meta?.generation_time_ms,
    imageUrl: normalized.url,
    imageFilename: normalized.filename,
    endpoint: 'api/alt-text',
    status: 'success'
  });

  if (usageResult.error) {
    logger.error('[altText] Failed to record usage', { error: usageResult.error });
  } else {
    logger.info('[altText] Usage recorded successfully');
  }
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

function createAltTextRouter({
  supabase,
  redis,
  resultCache,
  checkRateLimit,
  getSiteFromHeaders
}) {
  const router = express.Router();

  /**
   * POST /api/alt-text
   * Generate alt text for an image
   */
  router.post('/', async (req, res) => {
    // 1. Validate request
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid payload',
        details: parsed.error.flatten()
      });
    }

    const { image, context = {} } = parsed.data;
    const siteKey = req.header('X-Site-Key') || 'default';
    const licenseKey = req.header('X-License-Key') || req.license?.license_key;
    const userInfo = extractUserInfo(req);
    const bypassCache = req.header('X-Bypass-Cache') === 'true' || req.query.no_cache === '1';

    // 2. Enforce quota
    try {
      await enforceQuota(supabase, { licenseKey, siteHash: siteKey, creditsNeeded: 1 });
    } catch (err) {
      return res.status(err.status || 402).json({
        error: err.code || 'QUOTA_EXCEEDED',
        message: err.message,
        code: err.code || 'QUOTA_EXCEEDED',
        credits_used: err.payload?.credits_used,
        total_limit: err.payload?.total_limit,
        reset_date: err.payload?.reset_date
      });
    }

    // 3. Check rate limit
    if (!(await checkRateLimit(siteKey))) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded for this site. Please retry later.',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // 4. Check cache for existing result
    const base64Data = image.base64 || image.image_base64 || '';
    const cacheKey = base64Data ? hashPayload(base64Data) : null;

    if (!bypassCache) {
      const cached = await checkCache({ cacheKey, redis, resultCache });
      if (cached) {
        return res.json({ ...cached, cached: true });
      }
    }

    // 5. Validate image payload
    const { errors, warnings, normalized } = validateImagePayload(image);
    if (errors.length) {
      return res.status(400).json({ error: 'INVALID_REQUEST', errors, warnings });
    }

    // 6. Generate alt text
    const { altText, usage, meta } = await generateAltText({
      image: normalized,
      context: { ...context, filename: normalized.filename }
    });

    // 7. Record usage
    await recordAltTextUsage({
      supabase,
      licenseKey,
      siteKey,
      userInfo,
      usage,
      meta,
      normalized
    });

    // 8. Cache the result
    if (!bypassCache) {
      await storeInCache({
        cacheKey,
        payload: { altText, warnings, usage, meta },
        redis,
        resultCache
      });
    }

    // 9. Return response
    res.json({
      altText,
      credits_used: 1,
      credits_remaining: usage?.credits_remaining,
      usage: {
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        total_tokens: usage?.total_tokens
      },
      meta: {
        modelUsed: meta?.modelUsed,
        cached: false,
        generation_time_ms: meta?.generation_time_ms
      }
    });
  });

  return router;
}

module.exports = { createAltTextRouter };
