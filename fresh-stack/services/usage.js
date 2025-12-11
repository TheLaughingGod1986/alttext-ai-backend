const { computePeriodStart } = require('./quota');

/**
 * Record usage with per-user and per-site tracking.
 */
async function recordUsage(supabase, {
  licenseKey,
  licenseId,
  siteHash,
  userId,
  userEmail,
  creditsUsed = 1,
  promptTokens,
  completionTokens,
  totalTokens,
  cached = false,
  modelUsed = 'gpt-4o-mini',
  generationTimeMs,
  imageUrl,
  imageFilename,
  pluginVersion,
  endpoint = 'api/alt-text',
  status = 'success',
  errorMessage = null
}) {
  const payload = {
    license_id: licenseId || null,
    site_hash: siteHash,
    user_id: userId || null,
    user_email: userEmail || null,
    credits_used: creditsUsed,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens ?? (promptTokens && completionTokens ? promptTokens + completionTokens : null),
    cached,
    model_used: modelUsed,
    generation_time_ms: generationTimeMs,
    image_url: imageUrl,
    image_filename: imageFilename,
    plugin_version: pluginVersion,
    endpoint,
    status,
    error_message: errorMessage
  };

  const { error } = await supabase.from('usage_logs').insert(payload);
  return { error };
}

/**
 * Get usage breakdown by user for a given period.
 */
async function getUserUsage(supabase, { licenseKey, siteHash, periodStart, periodEnd }) {
  const { data, error } = await supabase
    .from('usage_logs')
    .select('user_email, user_id, credits_used, created_at')
    .eq('site_hash', siteHash)
    .gte('created_at', periodStart.toISOString())
    .lt('created_at', periodEnd.toISOString());

  if (error) return { error };

  const map = {};
  for (const row of data || []) {
    const key = row.user_email || row.user_id || 'unknown';
    if (!map[key]) {
      map[key] = { user_email: row.user_email, user_id: row.user_id, credits_used: 0, last_activity: null };
    }
    map[key].credits_used += Number(row.credits_used || 0);
    const ts = new Date(row.created_at);
    if (!map[key].last_activity || ts > new Date(map[key].last_activity)) {
      map[key].last_activity = ts.toISOString();
    }
  }

  return { users: Object.values(map) };
}

/**
 * Get usage breakdown by site (agency).
 */
async function getSiteUsage(supabase, { licenseKey, periodStart, periodEnd }) {
  let licenseId = null;
  if (licenseKey) {
    const { data: lic } = await supabase
      .from('licenses')
      .select('id')
      .eq('license_key', licenseKey)
      .single();
    licenseId = lic?.id || null;
  }

  const query = supabase
    .from('usage_logs')
    .select('site_hash, credits_used, created_at')
    .gte('created_at', periodStart.toISOString())
    .lt('created_at', periodEnd.toISOString());

  if (licenseId) query.eq('license_id', licenseId);

  const { data, error } = await query;

  if (error) return { error };

  const map = {};
  for (const row of data || []) {
    const key = row.site_hash || 'unknown';
    if (!map[key]) {
      map[key] = { site_hash: key, credits_used: 0, last_activity: null };
    }
    map[key].credits_used += Number(row.credits_used || 0);
    const ts = new Date(row.created_at);
    if (!map[key].last_activity || ts > new Date(map[key].last_activity)) {
      map[key].last_activity = ts.toISOString();
    }
  }

  return { sites: Object.values(map) };
}

/**
 * Get usage logs with optional filters.
 */
async function getUsageLogs(supabase, { licenseKey, siteHash, limit = 100 }) {
  const query = supabase
    .from('usage_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (siteHash) query.eq('site_hash', siteHash);
  if (licenseKey) {
    // If license_id not present in usage_logs, rely on sites join
    // For now we filter by site_hash if licenseKey provided via sites table
    const { data: siteRows } = await supabase
      .from('sites')
      .select('site_hash')
      .eq('license_key', licenseKey);
    const hashes = (siteRows || []).map((s) => s.site_hash);
    if (hashes.length > 0) query.in('site_hash', hashes);
  }

  const { data, error } = await query;
  return { data, error };
}

function getPeriodBounds(billingDay) {
  const start = computePeriodStart(billingDay, new Date());
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { periodStart: start, periodEnd: end };
}

module.exports = {
  recordUsage,
  getUserUsage,
  getSiteUsage,
  getUsageLogs,
  getPeriodBounds
};
