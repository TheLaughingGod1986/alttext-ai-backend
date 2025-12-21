const { getLimits } = require('./license');
const { QUOTA_WARNING_THRESHOLD } = require('../lib/constants');

/**
 * Calculate reset date and quota status for a license
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Options object
 * @param {string} options.licenseKey - License key to check
 * @param {string} [options.siteHash] - Optional site hash for site-specific quotas
 * @returns {Promise<Object>} Quota status object with credits_used, credits_remaining, reset_date, etc.
 */
async function getQuotaStatus(supabase, { licenseKey, siteHash }) {
  const now = new Date();
  const { data: license, error: licenseError } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_key', licenseKey)
    .single();

  if (licenseError || !license) {
    return { error: 'INVALID_LICENSE', status: 401, message: 'License not found' };
  }

  const limits = getLimits(license.plan);
  const periodStart = computePeriodStart(license.billing_day_of_month, now);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Prefer quota_summaries if present
  const { data: summary } = await supabase
    .from('quota_summaries')
    .select('*')
    .eq('license_key', license.license_key)
    .eq('period_start', periodStart.toISOString())
    .maybeSingle();

  const totalLimit = limits.credits;
  const creditsUsed = summary?.total_credits_used || 0;
  const creditsRemaining = Math.max(totalLimit - creditsUsed, 0);

  let siteQuota = null;
  if (siteHash) {
    const siteUsage = summary?.site_usage || {};
    const usedBySite = Number(siteUsage[siteHash] || 0);
    siteQuota = {
      site_hash: siteHash,
      credits_used: usedBySite,
      quota_limit: null,
      quota_remaining: null
    };
    if (license.plan === 'agency') {
      const { data: site } = await supabase
        .from('sites')
        .select('quota_limit')
        .eq('site_hash', siteHash)
        .maybeSingle();
      const limit = site?.quota_limit || null;
      siteQuota.quota_limit = limit;
      siteQuota.quota_remaining = limit != null ? Math.max(limit - usedBySite, 0) : null;
    }
  }

  const isNearLimit = creditsUsed / totalLimit >= QUOTA_WARNING_THRESHOLD;

  return {
    plan_type: license.plan,
    license_status: license.status,
    credits_used: creditsUsed,
    credits_remaining: creditsRemaining,
    total_limit: totalLimit,
    reset_date: periodEnd.toISOString(),
    warning_threshold: QUOTA_WARNING_THRESHOLD,
    is_near_limit: isNearLimit,
    site_quota: siteQuota
  };
}

/**
 * Check if enough credits remain for an operation (does not mutate)
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Options object
 * @param {string} options.licenseKey - License key to check
 * @param {string} [options.siteHash] - Optional site hash
 * @param {number} [options.creditsNeeded=1] - Credits needed for the operation
 * @returns {Promise<Object>} Quota status or error object if quota exceeded
 */
async function checkQuotaAvailable(supabase, { licenseKey, siteHash, creditsNeeded = 1 }) {
  const status = await getQuotaStatus(supabase, { licenseKey, siteHash });
  if (status.error) return status;
  if (status.credits_remaining < creditsNeeded) {
    return {
      error: 'QUOTA_EXCEEDED',
      status: 402,
      message: 'Quota exceeded',
      credits_used: status.credits_used,
      total_limit: status.total_limit,
      reset_date: status.reset_date
    };
  }
  return status;
}

/**
 * Enforce quota check and throw error if quota exceeded
 * Simplifies route handlers by throwing instead of returning error objects
 * @param {Object} supabase - Supabase client
 * @param {Object} options - Options object
 * @param {string} options.licenseKey - License key to check
 * @param {string} [options.siteHash] - Optional site hash (can be skipped via env config)
 * @param {number} [options.creditsNeeded=1] - Credits needed for the operation
 * @returns {Promise<Object>} Quota status if check passes
 * @throws {Error} Throws error with status and payload if quota exceeded
 */
async function enforceQuota(supabase, { licenseKey, siteHash, creditsNeeded = 1 }) {
  const skipList = (process.env.SKIP_QUOTA_CHECK_SITE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (siteHash && skipList.includes(siteHash)) {
    return {
      plan_type: 'skip',
      license_status: 'active',
      credits_used: 0,
      credits_remaining: Number.MAX_SAFE_INTEGER,
      total_limit: Number.MAX_SAFE_INTEGER,
      reset_date: null,
      warning_threshold: 0,
      is_near_limit: false,
      site_quota: { site_hash: siteHash, credits_used: 0 }
    };
  }

  const result = await checkQuotaAvailable(supabase, { licenseKey, siteHash, creditsNeeded });
  if (result.error) {
    const err = new Error(result.message);
    err.status = result.status;
    err.code = result.error;
    err.payload = result;
    throw err;
  }
  return result;
}

/**
 * Compute the billing period start date based on billing day of month
 * @param {number} [billingDay=1] - Day of month billing cycle starts (1-31)
 * @param {Date} [now=new Date()] - Current date for calculation
 * @returns {Date} Start date of the current billing period
 */
function computePeriodStart(billingDay = 1, now = new Date()) {
  const day = Math.max(1, Math.min(31, Number(billingDay) || 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 0, 0, 0));
  if (now < start) {
    start.setUTCMonth(start.getUTCMonth() - 1);
  }
  return start;
}

module.exports = {
  getQuotaStatus,
  checkQuotaAvailable,
  enforceQuota,
  computePeriodStart
};
