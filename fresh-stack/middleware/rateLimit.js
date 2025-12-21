/**
 * Simple per-license rate limiter.
 * Uses Redis if available, otherwise in-memory fallback.
 */

const { PLAN_LIMITS, AUTH_RATE_LIMITS, CACHE_TTL } = require('../lib/constants');

function rateLimitMiddleware({ redis, perSiteOverride, globalOverride }) {
  const windowMs = CACHE_TTL.RATE_LIMIT_WINDOW;
  const memoryBuckets = new Map();

  return async function rateLimit(req, res, next) {
    const plan = req.license?.plan || 'free';
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const limit = perSiteOverride || planLimits.rateLimit;
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

/**
 * Rate limiter for authentication endpoints (login, register, forgot-password).
 * Uses IP-based rate limiting to prevent brute force attacks.
 */
function authRateLimitMiddleware({ redis }) {
  const memoryBuckets = new Map();
  const { windowMs, maxAttempts } = AUTH_RATE_LIMITS;

  return async function authRateLimit(req, res, next) {
    // Get client IP address (handle proxies)
    const ip = req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.header('x-real-ip') ||
               req.socket.remoteAddress ||
               'unknown';

    const bucketKey = `auth_ratelimit:${ip}:${Math.floor(Date.now() / windowMs)}`;

    if (redis) {
      try {
        const count = await redis.incr(bucketKey);
        await redis.expire(bucketKey, Math.ceil(windowMs / 1000));

        if (count > maxAttempts) {
          return res.status(429).json({
            error: 'TOO_MANY_REQUESTS',
            message: `Too many authentication attempts. Please try again in ${Math.ceil(windowMs / 60000)} minutes.`,
            code: 'TOO_MANY_REQUESTS',
            retry_after: Math.ceil(windowMs / 1000)
          });
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
    const hits = memoryBuckets.get(ip) || [];
    const recent = hits.filter((ts) => ts >= windowStart);
    recent.push(now);
    memoryBuckets.set(ip, recent);

    // Cleanup old entries periodically (1% chance)
    if (Math.random() < 0.01) {
      for (const [key, timestamps] of memoryBuckets.entries()) {
        const recentTimestamps = timestamps.filter((ts) => ts >= windowStart);
        if (recentTimestamps.length === 0) {
          memoryBuckets.delete(key);
        } else {
          memoryBuckets.set(key, recentTimestamps);
        }
      }
    }

    if (recent.length > maxAttempts) {
      return res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: `Too many authentication attempts. Please try again in ${Math.ceil(windowMs / 60000)} minutes.`,
        code: 'TOO_MANY_REQUESTS',
        retry_after: Math.ceil(windowMs / 1000)
      });
    }

    next();
  };
}

module.exports = rateLimitMiddleware;
module.exports.authRateLimitMiddleware = authRateLimitMiddleware;
