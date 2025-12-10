/**
 * Simple license key authentication for fresh-stack
 * Much simpler than server-v2.js - just validates license key and sets quota
 */

/**
 * License key middleware - validates X-License-Key header
 * Sets req.license with license data for quota tracking
 */
async function validateLicenseKey(supabase) {
  return async (req, res, next) => {
    const licenseKey = req.header('X-License-Key');

    if (!licenseKey) {
      // No license key - continue with free tier via X-Site-Key
      return next();
    }

    if (!supabase) {
      console.warn('[Auth] Supabase not configured; skipping license validation');
      return next();
    }

    try {
      const trimmedKey = licenseKey.trim();

      console.info('[Auth] Validating license key', {
        keyPreview: `${trimmedKey.substring(0, 8)}...${trimmedKey.substring(trimmedKey.length - 4)}`
      });

      // Check licenses table
      const { data: license, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', trimmedKey)
        .single();

      if (error || !license) {
        console.warn('[Auth] License key not found', {
          keyPreview: `${trimmedKey.substring(0, 8)}...`
        });
        return res.status(401).json({
          error: 'Invalid license key',
          code: 'INVALID_LICENSE_KEY'
        });
      }

      // Check if license is active
      if (license.status !== 'active') {
        console.warn('[Auth] License key inactive', {
          status: license.status,
          keyPreview: `${trimmedKey.substring(0, 8)}...`
        });
        return res.status(403).json({
          error: 'License key is not active',
          code: 'INACTIVE_LICENSE',
          status: license.status
        });
      }

      // Attach license to request for quota tracking
      req.license = license;
      req.authMethod = 'license';

      console.info('[Auth] License key validated', {
        licenseId: license.id,
        plan: license.plan || 'unknown',
        status: license.status
      });

      next();

    } catch (err) {
      console.error('[Auth] License validation error', { error: err.message });
      return res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR'
      });
    }
  };
}

/**
 * Get site data from X-Site-Key header and license (if provided)
 * Creates site if doesn't exist
 */
async function getSiteFromHeaders(supabase, req) {
  const siteKey = req.header('X-Site-Key') || 'default';
  const licenseKey = req.license?.license_key || null;

  if (!supabase) {
    return {
      siteKey,
      plan: 'free',
      quota: 50,
      used: 0,
      remaining: 50
    };
  }

  try {
    // Get or create site
    let { data: site } = await supabase
      .from('sites')
      .select('*')
      .eq('site_hash', siteKey)
      .single();

    if (!site) {
      // Auto-create site
      const { data: newSite } = await supabase
        .from('sites')
        .insert({
          site_hash: siteKey,
          license_key: licenseKey,
          plan: licenseKey ? (req.license?.plan || 'pro') : 'free'
        })
        .select()
        .single();

      site = newSite;
      console.info('[Auth] Auto-created site', { siteKey: siteKey.substring(0, 8) });
    } else if (licenseKey && site.license_key !== licenseKey) {
      // Update site with license key
      const { data: updated } = await supabase
        .from('sites')
        .update({
          license_key: licenseKey,
          plan: req.license?.plan || 'pro'
        })
        .eq('site_hash', siteKey)
        .select()
        .single();

      site = updated;
      console.info('[Auth] Associated license with site', { siteKey: siteKey.substring(0, 8) });
    }

    // Get usage for this billing period
    const plan = site?.plan || 'free';
    const quotas = { free: 50, pro: 1000, agency: 10000 };
    const quota = quotas[plan] || 50;

    // Calculate period start (1st of current month)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: logs } = await supabase
      .from('usage_logs')
      .select('images, images_used')
      .eq('site_hash', siteKey)
      .gte('created_at', periodStart.toISOString());

    const used = (logs || []).reduce((sum, log) => {
      return sum + (Number(log.images || log.images_used || 0));
    }, 0);

    const remaining = Math.max(quota - used, 0);

    return {
      siteKey,
      plan,
      quota,
      used,
      remaining,
      site
    };

  } catch (err) {
    console.error('[Auth] Error fetching site data', { error: err.message });
    return {
      siteKey,
      plan: 'free',
      quota: 50,
      used: 0,
      remaining: 50
    };
  }
}

module.exports = {
  validateLicenseKey,
  getSiteFromHeaders
};
