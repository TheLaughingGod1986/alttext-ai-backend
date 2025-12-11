/**
 * Simple per-license rate limiter.
 * Uses Redis if available, otherwise in-memory fallback.
 */

const PLAN_LIMITS = {
  free: 60,
  pro: 120,
  agency: 240
};

function rateLimitMiddleware({ redis, perSiteOverride, globalOverride }) {
  const windowMs = 60_000;
  const memoryBuckets = new Map();

  return async function rateLimit(req, res, next) {
    const plan = req.license?.plan || 'free';
    const limit = perSiteOverride || PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const globalLimit = globalOverride || 0;
    const key = req.license?.license_key || req.header('X-License-Key') || 'anon';
    const bucketKey = `ratelimit:${key}:${Math.floor(Date.now() / windowMs)}`;

    if (redis) {
      try {
        const count = await redis.incr(bucketKey);
        await redis.expire(bucketKey, windowMs / 1000);
        if (count > limit) {
          return res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit of ${limit} requests/minute exceeded`,
            code: 'RATE_LIMIT_EXCEEDED',
            retry_after: 60
          });
        }
        if (globalLimit > 0) {
          const globalKey = `ratelimit:global:${Math.floor(Date.now() / windowMs)}`;
          const globalCount = await redis.incr(globalKey);
          await redis.expire(globalKey, windowMs / 1000);
          if (globalCount > globalLimit) {
            return res.status(429).json({
              error: 'RATE_LIMIT_EXCEEDED',
              message: `Rate limit of ${globalLimit} requests/minute exceeded`,
              code: 'RATE_LIMIT_EXCEEDED',
              retry_after: 60
            });
          }
        }
        return next();
      } catch (e) {
        // Fail-open to avoid blocking traffic on redis errors
        return next();
      }
    }

    // In-memory fallback
    const now = Date.now();
    const windowStart = now - windowMs;
    const hits = memoryBuckets.get(key) || [];
    const recent = hits.filter((ts) => ts >= windowStart);
    recent.push(now);
    memoryBuckets.set(key, recent);
    if (recent.length > limit) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit of ${limit} requests/minute exceeded`,
        code: 'RATE_LIMIT_EXCEEDED',
        retry_after: 60
      });
    }
    if (globalOverride && globalOverride > 0) {
      const globalHits = memoryBuckets.get('global') || [];
      const recentGlobal = globalHits.filter((ts) => ts >= windowStart);
      recentGlobal.push(now);
      memoryBuckets.set('global', recentGlobal);
      if (recentGlobal.length > globalOverride) {
        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit of ${globalOverride} requests/minute exceeded`,
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after: 60
        });
      }
    }
    next();
  };
}

module.exports = rateLimitMiddleware;
