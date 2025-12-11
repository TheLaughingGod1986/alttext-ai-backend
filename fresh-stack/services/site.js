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

module.exports = {
  createSite,
  getSites,
  setSiteQuota,
  updateSiteActivity
};
