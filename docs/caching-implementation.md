# Caching Implementation Guide

This guide shows how to add caching to reduce costs by 30-50% for duplicate images.

## Option 1: In-Memory Cache (Simplest - No Dependencies)

### Implementation (15 minutes)

```javascript
// Add to top of server-v2.js
const altTextCache = new Map();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE = 10000; // Limit memory usage

// Helper: Generate cache key from image
function getImageCacheKey(base64Data) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(base64Data).digest('hex');
}

// Helper: Clean old cache entries
function cleanCache() {
  const now = Date.now();
  let removed = 0;

  for (const [key, value] of altTextCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      altTextCache.delete(key);
      removed++;
    }
  }

  // If still too large, remove oldest entries
  if (altTextCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(altTextCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, altTextCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => altTextCache.delete(key));
    removed += toRemove.length;
  }

  if (removed > 0) {
    logger.info(`[Cache] Cleaned ${removed} expired entries, size: ${altTextCache.size}`);
  }
}

// Run cleanup every hour
setInterval(cleanCache, 60 * 60 * 1000);
```

### Usage in Generate Endpoint

```javascript
// In the /generate endpoint, before calling OpenAI:

const base64Data = image_data?.base64 || image_data?.image_base64;
if (base64Data) {
  const cacheKey = getImageCacheKey(base64Data);
  const cached = altTextCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.info('[Cache] HIT - Returning cached alt text', {
      cacheKey: cacheKey.substring(0, 8) + '...',
      age: Math.round((Date.now() - cached.timestamp) / 1000 / 60) + ' minutes'
    });

    // Return cached result immediately
    return res.status(200).json({
      alt_text: cached.altText,
      cached: true,
      site: {
        siteHash: site_hash,
        plan: siteUsage.plan,
        credits: siteUsage.remaining,
        tokensRemaining: siteUsage.remaining
      }
    });
  }

  logger.info('[Cache] MISS - Generating new alt text', {
    cacheKey: cacheKey.substring(0, 8) + '...'
  });
}

// ... existing OpenAI call ...

// After successful generation, cache the result:
if (base64Data && altText) {
  const cacheKey = getImageCacheKey(base64Data);
  altTextCache.set(cacheKey, {
    altText,
    timestamp: Date.now()
  });
  logger.info('[Cache] STORED alt text', {
    cacheKey: cacheKey.substring(0, 8) + '...',
    cacheSize: altTextCache.size
  });
}
```

### Pros
- ✅ Zero dependencies
- ✅ Works immediately
- ✅ No external services needed
- ✅ Fast lookups

### Cons
- ❌ Cache lost on server restart
- ❌ Not shared across multiple server instances
- ❌ Limited by server memory

---

## Option 2: Redis Cache (Production-Ready)

### Prerequisites
```bash
npm install ioredis
```

### Implementation

```javascript
// config/redis.js
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

redis.on('error', (err) => {
  logger.error('[Redis] Connection error', { error: err.message });
});

redis.on('connect', () => {
  logger.info('[Redis] Connected successfully');
});

module.exports = redis;
```

### Usage

```javascript
// In server-v2.js
const redis = require('./config/redis');
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Helper functions
async function getCachedAltText(imageHash) {
  try {
    const cached = await redis.get(`alttext:${imageHash}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.error('[Cache] GET error', { error: error.message });
  }
  return null;
}

async function setCachedAltText(imageHash, altText, metadata = {}) {
  try {
    const value = JSON.stringify({
      altText,
      metadata,
      cachedAt: Date.now()
    });
    await redis.setex(`alttext:${imageHash}`, CACHE_TTL_SECONDS, value);
  } catch (error) {
    logger.error('[Cache] SET error', { error: error.message });
  }
}

// In /generate endpoint:
const base64Data = image_data?.base64 || image_data?.image_base64;
if (base64Data) {
  const imageHash = getImageCacheKey(base64Data);
  const cached = await getCachedAltText(imageHash);

  if (cached) {
    logger.info('[Cache] HIT - Redis', {
      imageHash: imageHash.substring(0, 8),
      age: Math.round((Date.now() - cached.cachedAt) / 1000 / 60) + ' minutes'
    });

    return res.status(200).json({
      alt_text: cached.altText,
      cached: true,
      site: {
        siteHash: site_hash,
        plan: siteUsage.plan,
        credits: siteUsage.remaining,
        tokensRemaining: siteUsage.remaining
      }
    });
  }
}

// After OpenAI generation:
if (base64Data && altText) {
  await setCachedAltText(imageHash, altText, {
    siteHash: site_hash,
    dimensions: `${image_data?.width}x${image_data?.height}`
  });
}
```

### Pros
- ✅ Persistent across restarts
- ✅ Shared across multiple servers
- ✅ Automatic expiration
- ✅ Can handle millions of entries
- ✅ Production-grade

### Cons
- ❌ Requires Redis server
- ❌ Additional infrastructure cost

---

## Option 3: Supabase Cache Table (Use Existing DB)

### Migration

```sql
-- db/migrations/create_alttext_cache.sql
CREATE TABLE IF NOT EXISTS public.alttext_cache (
  image_hash VARCHAR(32) PRIMARY KEY,
  alt_text TEXT NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  hit_count INTEGER DEFAULT 0
);

-- Index for cleanup
CREATE INDEX idx_alttext_cache_expires
  ON public.alttext_cache(expires_at);

-- Auto-cleanup old entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM public.alttext_cache
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

### Usage

```javascript
async function getCachedAltTextDB(imageHash) {
  try {
    const { data, error } = await supabase
      .from('alttext_cache')
      .select('alt_text, cached_at, hit_count')
      .eq('image_hash', imageHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error) return null;

    // Increment hit count
    await supabase
      .from('alttext_cache')
      .update({ hit_count: data.hit_count + 1 })
      .eq('image_hash', imageHash);

    return data;
  } catch (error) {
    logger.error('[Cache] DB GET error', { error: error.message });
    return null;
  }
}

async function setCachedAltTextDB(imageHash, altText) {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await supabase
      .from('alttext_cache')
      .upsert({
        image_hash: imageHash,
        alt_text: altText,
        cached_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        hit_count: 0
      });
  } catch (error) {
    logger.error('[Cache] DB SET error', { error: error.message });
  }
}
```

### Pros
- ✅ Uses existing Supabase infrastructure
- ✅ No new dependencies
- ✅ Queryable for analytics
- ✅ Track cache hit rates

### Cons
- ❌ Slower than Redis (DB queries)
- ❌ Uses database connections
- ❌ Cleanup requires cron job

---

## Recommendation

**For immediate savings:** Use **Option 1 (In-Memory)**
**For production at scale:** Use **Option 2 (Redis)**
**For simplicity with existing stack:** Use **Option 3 (Supabase)**

---

## Expected Results

### Cache Hit Rate Expectations
- **First week:** 10-20% (building cache)
- **After 1 month:** 30-40% (stable)
- **Mature cache:** 40-50% (common images reused)

### Cost Savings
- **30% cache hit rate:** Save $0.11/month per 10k images
- **40% cache hit rate:** Save $0.15/month per 10k images
- **50% cache hit rate:** Save $0.18/month per 10k images

### Monitoring Metrics
```javascript
// Track these in your logs:
{
  totalRequests: 10000,
  cacheHits: 3500,
  cacheMisses: 6500,
  hitRate: '35%',
  costSaved: '$0.13',
  avgResponseTime: {
    cached: '15ms',
    uncached: '850ms'
  }
}
```

---

## Testing

```bash
# Test cache is working
curl -X POST http://localhost:10000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "site_hash": "test123",
    "image_data": {
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "width": 1,
      "height": 1
    }
  }'

# Run again - should see [Cache] HIT in logs
# Response should have "cached": true
```

---

## Next Steps

1. Choose your cache strategy
2. Implement the code
3. Deploy to production
4. Monitor cache hit rates
5. Adjust TTL based on usage patterns
