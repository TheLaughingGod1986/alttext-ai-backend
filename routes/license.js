/**
 * License Management Routes
 * Handles license key generation, activation, and deactivation for multi-site organizations
 */

const express = require('express');
const { supabase } = require('../supabase-client');
const { randomUUID } = require('crypto');

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
      return res.status(400).json({
        success: false,
        error: 'License key and site hash are required'
      });
    }

    // Find organization by license key
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('licenseKey', licenseKey)
      .single();

    if (orgError || !organization) {
      return res.status(404).json({
        success: false,
        error: 'Invalid license key'
      });
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
        return res.status(403).json({
          success: false,
          error: 'This site is already registered to a different organization'
        });
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
          tokensRemaining: organization.tokensRemaining,
          maxSites: organization.maxSites,
          resetDate: organization.resetDate
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
    if (activeSiteCount >= organization.maxSites) {
      return res.status(403).json({
        success: false,
        error: `Site limit reached. This license allows ${organization.maxSites} active site(s). Please deactivate an existing site first.`,
        activeSiteCount,
        maxSites: organization.maxSites
      });
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

    res.json({
      success: true,
      message: 'License activated successfully',
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        tokensRemaining: organization.tokensRemaining,
        maxSites: organization.maxSites,
        resetDate: organization.resetDate
      },
      site: {
        id: newSite.id,
        siteHash: newSite.siteHash,
        isActive: newSite.isActive,
        activeSiteCount: activeSiteCount + 1
      }
    });

  } catch (error) {
    console.error('Error activating license:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate license'
    });
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
router.post('/deactivate', async (req, res) => {
  try {
    const { siteId, siteHash } = req.body;

    // This endpoint requires authentication (middleware will be added)
    // For now, we'll assume req.user is populated by auth middleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!siteId && !siteHash) {
      return res.status(400).json({
        success: false,
        error: 'Site ID or site hash is required'
      });
    }

    // Find the site
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq(siteId ? 'id' : 'siteHash', siteId || siteHash)
      .single();

    if (siteError || !site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found'
      });
    }

    // Get organization and check membership
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organizationId', site.organizationId)
      .eq('userId', req.user.id)
      .in('role', ['owner', 'admin']);

    if (membersError || !members || members.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to manage this organization'
      });
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
    console.error('Error deactivating site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate site'
    });
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
      return res.status(400).json({
        success: false,
        error: 'Name and plan are required'
      });
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
        maxSites: organization.maxSites,
        tokensRemaining: organization.tokensRemaining
      }
    });

  } catch (error) {
    console.error('Error generating license:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate license'
    });
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
      .eq('licenseKey', licenseKey)
      .single();

    if (orgError || !organization) {
      return res.status(404).json({
        success: false,
        error: 'License not found'
      });
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
        maxSites: organization.maxSites,
        tokensRemaining: organization.tokensRemaining,
        resetDate: organization.resetDate,
        activeSites: (sites || []).length,
        sites: sites || [],
        members: members
      }
    });

  } catch (error) {
    console.error('Error fetching license info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch license information'
    });
  }
});

module.exports = router;
