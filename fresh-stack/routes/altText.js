const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { validateImagePayload } = require('../lib/validation');
const { generateAltText } = require('../lib/openai');

function hashPayload(base64) {
  return crypto.createHash('md5').update(base64).digest('hex');
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
  getSiteFromHeaders,
  recordUsage
}) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn('[alt-text] invalid payload', parsed.error.issues?.[0]);
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { image, context = {} } = parsed.data;
    const siteKey = req.header('X-Site-Key') || 'default';
    const bypassCache = req.header('X-Bypass-Cache') === 'true' || req.query.no_cache === '1';

    // Get site data and check quota
    const siteData = await getSiteFromHeaders(supabase, req);
    if (siteData.remaining <= 0) {
      return res.status(402).json({
        error: 'Quota exceeded for this billing period',
        code: 'QUOTA_EXCEEDED',
        quota: siteData.quota,
        used: siteData.used,
        remaining: 0,
        plan: siteData.plan
      });
    }

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
      console.info('[usage] attempting to record usage', {
        siteKey,
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens
      });
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

  return router;
}

module.exports = { createAltTextRouter };
