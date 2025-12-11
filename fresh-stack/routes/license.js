const express = require('express');
const { validateLicense, activateLicense, deactivateLicense, transferLicense, getLicenseDetails } = require('../services/license');
const { setSiteQuota, getSites } = require('../services/site');

function createLicenseRouter({ supabase }) {
  const router = express.Router();

  router.post('/validate', async (req, res) => {
    const { license_key } = req.body || {};
    const result = await validateLicense(supabase, license_key);
    if (result.error) {
      return res.status(result.status || 401).json({
        valid: false,
        error: result.error.toLowerCase(),
        message: result.message,
        code: result.error
      });
    }
    return res.json({ valid: true, license: result.license });
  });

  router.post('/activate', async (req, res) => {
    const { license_key, site_id, site_url, site_name, fingerprint } = req.body || {};
    const result = await activateLicense(supabase, {
      licenseKey: license_key,
      siteHash: site_id,
      siteUrl: site_url,
      siteName: site_name,
      fingerprint
    });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error.toLowerCase(),
        message: result.message,
        code: result.error,
        activated_site: result.activated_site,
        max_sites: result.max_sites,
        activated_sites: result.activated_sites
      });
    }
    return res.json({ success: true, message: 'License activated successfully', license: result.license, site: result.site });
  });

  router.post('/deactivate', async (req, res) => {
    const { license_key, site_id } = req.body || {};
    const result = await deactivateLicense(supabase, { licenseKey: license_key, siteHash: site_id });
    if (result.error) {
      return res.status(result.status || 400).json(result);
    }
    return res.json({ success: true, message: 'License deactivated successfully' });
  });

  router.post('/transfer', async (req, res) => {
    const { license_key, old_site_id, new_site_id, new_fingerprint, new_site_url, new_site_name } = req.body || {};
    const result = await transferLicense(supabase, {
      licenseKey: license_key,
      oldSiteId: old_site_id,
      newSiteId: new_site_id,
      newFingerprint: new_fingerprint,
      newSiteUrl: new_site_url,
      newSiteName: new_site_name
    });
    if (result.error) {
      return res.status(result.status || 400).json(result);
    }
    return res.json({ success: true, message: 'License transferred', license: result.license, site: result.site });
  });

  router.get('/sites', async (req, res) => {
    const licenseKey = req.header('X-License-Key');
    const result = await getSites(supabase, { licenseKey });
    if (result.error) return res.status(500).json({ error: 'SERVER_ERROR', message: result.error.message });
    return res.json({
      license_key: licenseKey,
      sites: result.data || []
    });
  });

  router.post('/sites/:site_id/quota', async (req, res) => {
    const licenseKey = req.header('X-License-Key') || req.body?.license_key;
    const siteHash = req.params.site_id;
    const { quota_limit } = req.body || {};
    const result = await setSiteQuota(supabase, { licenseKey, siteHash, quotaLimit: quota_limit });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error,
        message: result.message,
        code: result.error
      });
    }
    return res.json({
      success: true,
      message: 'Site quota updated successfully',
      site: result.data
    });
  });

  return router;
}

module.exports = { createLicenseRouter };
