/**
 * License Management Routes
 * Handles license key generation, activation, and deactivation for multi-site organizations
 */

const express = require('express');
const { supabase } = require('../db/supabase-client');
const logger = require('../src/utils/logger');
const { randomUUID } = require('crypto');
const { authenticateToken } = require('../auth/jwt');
const { errors: httpErrors } = require('../src/utils/http');

const router = express.Router();

/**
 * POST /api/license/activate
 * Activate a license key for a WordPress site
 *
 * Request body:
 * {
 *   licenseKey: string,
 *   siteHash: string,
 *   siteUrl: string,
 *   installId: string,
 *   pluginVersion: string,
 *   wordpressVersion: string,
 *   phpVersion: string,
 *   isMultisite: boolean
 * }
 *
 * Response:
 * {
 *   success: true,
 *   organization: { id, name, plan, tokensRemaining, maxSites },
 *   site: { id, siteHash, isActive }
 * }
 */
router.post('/activate', async (req, res) => {
  try {
    const {
      licenseKey,
      siteHash,
      siteUrl,
      installId,
      pluginVersion,
      wordpressVersion,
      phpVersion,
      isMultisite
    } = req.body;

    // Validate required fields
    if (!licenseKey || !siteHash) {
      return httpErrors.missingField(res, 'licenseKey and siteHash');
    }

    // Find organization by license key
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
        .eq('license_key', licenseKey)
      .single();

    if (orgError || !organization) {
      logger.warn('[License Routes] Invalid license key', { licenseKey: `${licenseKey.substring(0, 8)}...` });
      return httpErrors.notFound(res, 'License key');
    }

    // Get active sites for organization
    const { data: activeSites } = await supabase
      .from('sites')
      .select('*')
      .eq('organizationId', organization.id)
      .eq('isActive', true);

    // Check if site already exists
    const { data: site } = await supabase
      .from('sites')
      .select('*')
      .eq('siteHash', siteHash)
      .single();

    if (site) {
      // Site exists - check if it belongs to this organization
      if (site.organizationId !== organization.id) {
        return httpErrors.forbidden(res, 'This site is already registered to a different organization');
      }

      // Reactivate if inactive and update info
      const { data: updatedSite, error: updateError } = await supabase
        .from('sites')
        .update({
          isActive: true,
          lastSeen: new Date().toISOString(),
          siteUrl: siteUrl || site.siteUrl,
          installId: installId || site.installId,
          pluginVersion: pluginVersion || site.pluginVersion,
          wordpressVersion: wordpressVersion || site.wordpressVersion,
          phpVersion: phpVersion || site.phpVersion,
          isMultisite: isMultisite !== undefined ? isMultisite : site.isMultisite
        })
        .eq('id', site.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return res.json({
        success: true,
        message: 'Site reactivated successfully',
        organization: {
          id: organization.id,
          name: organization.name,
          plan: organization.plan,
          tokensRemaining: organization.tokens_remaining !== undefined ? organization.tokens_remaining : (organization.tokensRemaining !== undefined ? organization.tokensRemaining : 0),
          maxSites: organization.max_sites || organization.maxSites,
          resetDate: organization.reset_date || organization.resetDate
        },
        site: {
          id: updatedSite.id,
          siteHash: updatedSite.siteHash,
          isActive: updatedSite.isActive,
          activeSiteCount: activeSites.length
        }
      });
    }

    // New site - check if organization has reached site limit
    const activeSiteCount = activeSites.length;
    const maxSites = organization.max_sites || organization.maxSites || 1;
    if (activeSiteCount >= maxSites) {
      return httpErrors.quotaExceeded(res, `Site limit reached. This license allows ${maxSites} active site(s). Please deactivate an existing site first.`);
    }

    // Create new site
    const { data: newSite, error: createError } = await supabase
      .from('sites')
      .insert({
        organizationId: organization.id,
        siteHash,
        siteUrl,
        installId,
        isActive: true,
        pluginVersion,
        wordpressVersion,
        phpVersion,
        isMultisite: isMultisite || false
      })
      .select()
      .single();

    if (createError) throw createError;
    if (!newSite) {
      throw new Error('Failed to create site: insert returned no data');
    }

    res.json({
      success: true,
      message: 'License activated successfully',
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        tokensRemaining: organization.tokens_remaining !== undefined ? organization.tokens_remaining : (organization.tokensRemaining !== undefined ? organization.tokensRemaining : 0),
          maxSites: organization.max_sites || organization.maxSites,
        resetDate: organization.reset_date || organization.resetDate
      },
      site: {
        id: newSite.id,
        siteHash: newSite.siteHash,
        isActive: newSite.isActive,
        activeSiteCount: activeSiteCount + 1
      }
    });

  } catch (error) {
    logger.error('Error activating license:', { error: error.message, stack: error.stack, code: error.code });
    return httpErrors.internalError(res, 'Failed to activate license');
  }
});

/**
 * POST /api/license/deactivate
 * Deactivate a site from an organization
 *
 * Requires JWT authentication - user must be owner or admin of the organization
 *
 * Request body:
 * {
 *   siteId: number  // or siteHash: string
 * }
 */
router.post('/deactivate', authenticateToken, async (req, res) => {
  try {
    const { siteId, siteHash } = req.body;

    if (!siteId && !siteHash) {
      return httpErrors.missingField(res, 'siteId or siteHash');
    }

    // Find the site
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq(siteId ? 'id' : 'siteHash', siteId || siteHash)
      .single();

    if (siteError || !site) {
      return httpErrors.notFound(res, 'Site');
    }

    // Get organization and check membership
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organizationId', site.organizationId)
      .eq('userId', req.user.id)
      .in('role', ['owner', 'admin']);

    if (membersError || !members || members.length === 0) {
      return httpErrors.forbidden(res, 'You do not have permission to manage this organization');
    }

    // Deactivate the site
    const { error: updateError } = await supabase
      .from('sites')
      .update({ isActive: false })
      .eq('id', site.id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: 'Site deactivated successfully',
      siteId: site.id
    });

  } catch (error) {
    logger.error('Error deactivating site:', { error: error.message, stack: error.stack });
    return httpErrors.internalError(res, 'Failed to deactivate site');
  }
});

/**
 * POST /api/license/generate
 * Generate a new license key (admin only)
 *
 * Request body:
 * {
 *   name: string,
 *   plan: 'free' | 'pro' | 'agency',
 *   maxSites: number,
 *   tokensRemaining: number
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    // This would require admin authentication
    // For now, accept the request
    const { name, plan, maxSites, tokensRemaining } = req.body;

    if (!name || !plan) {
      return httpErrors.missingField(res, 'name and plan');
    }

    const licenseKey = randomUUID();

    const { data: organization, error: createError } = await supabase
      .from('organizations')
      .insert({
        name,
        licenseKey,
        plan,
        maxSites: maxSites || (plan === 'agency' ? 10 : 1),
        tokensRemaining: tokensRemaining || (plan === 'free' ? 50 : plan === 'pro' ? 500 : 10000)
      })
      .select()
      .single();

    if (createError) throw createError;

    res.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        licenseKey: organization.licenseKey,
        plan: organization.plan,
          maxSites: organization.max_sites || organization.maxSites,
        tokensRemaining: organization.tokensRemaining
      }
    });

  } catch (error) {
    logger.error('Error generating license:', { error: error.message, stack: error.stack });
    return httpErrors.internalError(res, 'Failed to generate license');
  }
});

/**
 * GET /api/license/info/:licenseKey
 * Get information about a license key
 */
router.get('/info/:licenseKey', async (req, res) => {
  try {
    const { licenseKey } = req.params;

    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
        .eq('license_key', licenseKey)
      .single();

    if (orgError || !organization) {
      return httpErrors.notFound(res, 'License');
    }

    // Get active sites
    const { data: sites } = await supabase
      .from('sites')
      .select('id, siteUrl, siteHash, lastSeen, pluginVersion')
      .eq('organizationId', organization.id)
      .eq('isActive', true);

    // Get members
    const { data: membersData } = await supabase
      .from('organization_members')
      .select('userId, role')
      .eq('organizationId', organization.id);

    // Get user emails for members
    const userIds = (membersData || []).map(m => m.userId);
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .in('id', userIds);

    // Format members data
    const userMap = new Map((users || []).map(u => [u.id, u.email]));
    const members = (membersData || []).map(m => ({
      userId: m.userId,
      email: userMap.get(m.userId) || null,
      role: m.role
    }));

    res.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
          maxSites: organization.max_sites || organization.maxSites,
        tokensRemaining: organization.tokensRemaining,
        resetDate: organization.resetDate,
        activeSites: (sites || []).length,
        sites: sites || [],
        members: members
      }
    });

  } catch (error) {
    logger.error('Error fetching license info:', { error: error.message, stack: error.stack, code: error.code });
    return httpErrors.internalError(res, 'Failed to fetch license information');
  }
});

/**
 * POST /api/license/validate
 * Validate a license key (with optional site hash verification)
 * 
 * Request body:
 * {
 *   licenseKey: string (required),
 *   siteHash?: string (optional)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   valid: boolean,
 *   license?: { ... },
 *   organization?: { ... },
 *   siteAssociated?: boolean
 * }
 */
router.post('/validate', async (req, res) => {
  try {
    const { licenseKey, siteHash } = req.body;

    if (!licenseKey) {
      return httpErrors.missingField(res, 'licenseKey');
    }

    // Trim whitespace from license key
    const trimmedLicenseKey = licenseKey.trim();

    logger.info('[License Validate] Validating license key', {
      keyPreview: `${trimmedLicenseKey.substring(0, 8)}...${trimmedLicenseKey.substring(trimmedLicenseKey.length - 4)}`,
      hasSiteHash: !!siteHash
    });

    // First, try to find in organizations table
    let organization = null;
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('license_key', trimmedLicenseKey)
      .single();

    if (!orgError && orgData) {
      organization = orgData;
      logger.info('[License Validate] Found organization', {
        orgId: organization.id,
        orgName: organization.name,
        plan: organization.plan
      });
    }

    // If not found in organizations, try licenses table
    let license = null;
    if (!organization) {
      const { data: licenseData, error: licenseError } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', trimmedLicenseKey)
        .single();

      if (!licenseError && licenseData) {
        license = licenseData;
        logger.info('[License Validate] Found license', {
          licenseId: license.id,
          plan: license.plan,
          status: license.status
        });
      }
    }

    // If neither found, return invalid
    if (!organization && !license) {
      logger.warn('[License Validate] License key not found', {
        keyPreview: `${trimmedLicenseKey.substring(0, 8)}...`
      });
      return res.json({
        success: true,
        valid: false,
        error: 'License key not found in database'
      });
    }

    // If site hash is provided, verify association
    let siteAssociated = null;
    if (siteHash) {
      const trimmedSiteHash = siteHash.trim();
      
      const { data: site, error: siteError } = await supabase
        .from('sites')
        .select('license_key, organizationId')
        .eq('site_hash', trimmedSiteHash)
        .single();

      if (siteError || !site) {
        siteAssociated = false;
        logger.warn('[License Validate] Site not found', {
          siteHash: `${trimmedSiteHash.substring(0, 8)}...`
        });
      } else {
        // Check if license key matches site's license key
        if (site.license_key && site.license_key === trimmedLicenseKey) {
          siteAssociated = true;
        } else if (organization && site.organizationId && site.organizationId === organization.id) {
          siteAssociated = true;
        } else {
          siteAssociated = false;
        }

        logger.info('[License Validate] Site association check', {
          siteHash: `${trimmedSiteHash.substring(0, 8)}...`,
          siteAssociated
        });
      }
    }

    // Build response
    const response = {
      success: true,
      valid: true,
    };

    if (organization) {
      response.organization = {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        licenseKey: organization.license_key
      };
    }

    if (license) {
      response.license = {
        id: license.id,
        plan: license.plan,
        status: license.status,
        licenseKey: license.license_key
      };
    }

    if (siteHash !== undefined) {
      response.siteAssociated = siteAssociated;
    }

    return res.json(response);

  } catch (error) {
    logger.error('Error validating license:', { error: error.message, stack: error.stack });
    return httpErrors.internalError(res, 'Failed to validate license key');
  }
});

module.exports = router;
