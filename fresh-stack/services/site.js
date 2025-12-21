const { getLimits } = require('./license');

async function createSite(supabase, { licenseKey, siteHash, siteUrl, siteName, fingerprint, plan }) {
  const { data, error } = await supabase
    .from('sites')
    .insert({
      license_key: licenseKey,
      site_hash: siteHash,
      site_url: siteUrl,
      site_name: siteName,
      fingerprint,
      plan,
      status: 'active'
    })
    .select()
    .single();
  return { data, error };
}

async function getSites(supabase, { licenseKey }) {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('license_key', licenseKey)
    .order('activated_at', { ascending: false });
  return { data, error };
}

async function setSiteQuota(supabase, { licenseKey, siteHash, quotaLimit }) {
  const { data: license } = await supabase
    .from('licenses')
    .select('plan')
    .eq('license_key', licenseKey)
    .single();

  if (!license) {
    return { error: 'INVALID_LICENSE', status: 401, message: 'License not found' };
  }
  if (license.plan !== 'agency') {
    return { error: 'PLAN_NOT_SUPPORTED', status: 403, message: 'Per-site quotas require agency plan' };
  }

  const { data, error } = await supabase
    .from('sites')
    .update({ quota_limit: quotaLimit })
    .eq('site_hash', siteHash)
    .eq('license_key', licenseKey)
    .select()
    .single();

  return { data, error };
}

async function updateSiteActivity(supabase, { siteHash }) {
  const { error } = await supabase
    .from('sites')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('site_hash', siteHash);
  return { error };
}

/**
 * Get site information from request headers
 * @param {Object} supabase - Supabase client
 * @param {Object} req - Express request object
 * @returns {Promise<Object|null>} Site data or null if not found
 */
async function getSiteFromHeaders(supabase, req) {
  const siteHash = req.header('X-Site-Hash') || req.header('X-Site-Key');
  if (!siteHash) return null;

  try {
    const { data } = await supabase
      .from('sites')
      .select('*')
      .eq('site_hash', siteHash)
      .single();
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * In-memory rate limiter for per-site requests
 * Used for alt-text endpoint rate limiting
 */
class SiteRateLimiter {
  constructor() {
    this.rateLimits = new Map();
    this.windowMs = 60_000; // 1 minute
    this.defaultLimit = 60; // 60 requests per minute
  }

  /**
   * Check if a site is within rate limits
   * @param {string} siteKey - Site identifier
   * @returns {boolean} True if within limits, false if exceeded
   */
  checkRateLimit(siteKey) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const hits = this.rateLimits.get(siteKey) || [];
    const recent = hits.filter((ts) => ts >= windowStart);
    recent.push(now);
    this.rateLimits.set(siteKey, recent);

    // Clean up old entries periodically (1% chance)
    if (Math.random() < 0.01) {
      for (const [key, times] of this.rateLimits.entries()) {
        const filtered = times.filter((ts) => ts >= windowStart);
        if (filtered.length === 0) {
          this.rateLimits.delete(key);
        } else {
          this.rateLimits.set(key, filtered);
        }
      }
    }

    return recent.length <= this.defaultLimit;
  }
}

module.exports = {
  createSite,
  getSites,
  setSiteQuota,
  updateSiteActivity,
  getSiteFromHeaders,
  SiteRateLimiter
};
