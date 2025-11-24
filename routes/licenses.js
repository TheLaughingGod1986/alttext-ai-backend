/**
 * License routes for organization and site management
 */

const express = require('express');
const { supabase } = require('../db/supabase-client');
const { dualAuthenticate, combinedAuth } = require('../src/middleware/dual-auth');
const licenseService = require('../services/licenseService');

const router = express.Router();

/**
 * POST /licenses/auto-attach
 * Auto-attach a license to a site
 * 
 * Inputs: siteUrl, siteHash, installId
 * Action: Associates license with site, returns licenseKey + snapshot
 * 
 * Authentication:
 * - JWT token (Bearer token in Authorization header)
 * - License key (X-License-Key header)
 * - Site hash (X-Site-Hash header)
 */
router.post('/auto-attach', combinedAuth, async (req, res) => {
  try {
    const { siteUrl, siteHash, installId } = req.body;

    // Validate at least one site identifier
    if (!siteUrl && !siteHash && !installId) {
      return res.status(400).json({
        success: false,
        error: 'At least one of siteUrl, siteHash, or installId is required',
        code: 'MISSING_SITE_INFO'
      });
    }

    // Determine license to attach
    let license = null;
    let licenseId = null;

    // If license key provided in header or body, use it
    const licenseKey = req.headers['x-license-key'] || req.body.licenseKey;

    if (licenseKey) {
      // Find license by key
      const { data: licenseData, error: licenseError } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', licenseKey)
        .single();

      if (licenseError || !licenseData) {
        return res.status(404).json({
          success: false,
          error: 'License not found',
          code: 'LICENSE_NOT_FOUND'
        });
      }

      license = licenseData;
      licenseId = license.id;
    } else if (req.user && req.user.id) {
      // JWT auth - find user's license
      const { data: userLicense, error: userLicenseError } = await supabase
        .from('licenses')
        .select('*')
        .eq('userId', req.user.id)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single();

      if (!userLicenseError && userLicense) {
        license = userLicense;
        licenseId = license.id;
      } else {
        // No license found for user - create one
        const { data: user } = await supabase
          .from('users')
          .select('email, plan, service')
          .eq('id', req.user.id)
          .single();

        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }

        license = await licenseService.createLicense({
          plan: user.plan || 'free',
          service: user.service || 'alttext-ai',
          userId: req.user.id,
          siteUrl,
          siteHash,
          installId
        });

        licenseId = license.id;
      }
    } else if (req.organization && req.organization.id) {
      // Organization auth - find org's license
      const { data: orgLicense, error: orgLicenseError } = await supabase
        .from('licenses')
        .select('*')
        .eq('organization_id', req.organization.id)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single();

      if (!orgLicenseError && orgLicense) {
        license = orgLicense;
        licenseId = license.id;
      } else {
        // No license found for org - create one
        license = await licenseService.createLicense({
          plan: req.organization.plan || 'free',
          service: req.organization.service || 'alttext-ai',
          organizationId: req.organization.id,
          siteUrl,
          siteHash,
          installId
        });

        licenseId = license.id;
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Auto-attach license to site
    const attachResult = await licenseService.autoAttachLicense(licenseId, {
      siteUrl,
      siteHash,
      installId
    });

    // Get license snapshot
    const licenseSnapshot = await licenseService.getLicenseSnapshot(attachResult.license.id);

    res.json({
      success: true,
      message: 'License attached successfully',
      license: licenseSnapshot,
      site: {
        siteUrl: attachResult.site.siteUrl,
        siteHash: attachResult.site.siteHash,
        installId: attachResult.site.installId,
        isActive: attachResult.site.isActive
      }
    });

  } catch (error) {
    console.error('Auto-attach error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to auto-attach license',
      code: 'AUTO_ATTACH_ERROR'
    });
  }
});

/**
 * Get all sites using the authenticated user's license or organization
 * Returns sites (installations) with their generation counts
 * 
 * Authentication: 
 * - JWT token (Bearer token in Authorization header) - for user accounts
 * - License key (X-License-Key header) - for organization-based licenses
 */
router.get('/sites', dualAuthenticate, async (req, res) => {
  try {
    let userId = null;
    let organizationId = null;
    let plan = 'free';
    
    // Determine authentication method
    if (req.user && req.user.id) {
      // JWT authentication - get user's organization
      userId = req.user.id;
      
      // Get user to check plan
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, plan, service')
        .eq('id', userId)
        .single();
      
      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      plan = user.plan;
      
      // Get user's organization if available
      const { data: memberships, error: membershipError } = await supabase
        .from('organization_members')
        .select('organizationId, role')
        .eq('userId', userId)
        .order('role', { ascending: true }) // Owner first
        .limit(1);

      if (!membershipError && memberships && memberships.length > 0) {
        const membership = memberships[0];
        const { data: organization, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', membership.organizationId)
          .single();

        if (!orgError && organization) {
          organizationId = organization.id;
          // Use organization plan if it's higher than user plan
          if (organization.plan === 'agency' || organization.plan === 'pro') {
            plan = organization.plan;
          }
        }
      }
      
    } else if (req.organization && req.organization.id) {
      // License key authentication
      organizationId = req.organization.id;
      plan = req.organization.plan || 'agency';
      
      // Get organization owner for userId lookup
      const { data: ownerMembership, error: ownerError } = await supabase
        .from('organization_members')
        .select('userId')
        .eq('organizationId', organizationId)
        .eq('role', 'owner')
        .limit(1)
        .single();
      
      if (!ownerError && ownerMembership) {
        userId = ownerMembership.userId;
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Only agency and pro plans have multiple sites
    const allowedPlans = ['agency', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for Agency and Pro plans',
        code: 'PLAN_NOT_ALLOWED',
        plan: plan
      });
    }
    
    // Build where clause - prioritize organization if available
    let allowedUserIds = [];
    if (organizationId) {
      // Get all installations for this organization
      // Installations are linked to users, and users are members of organizations
      const { data: orgMembers, error: orgMembersError } = await supabase
        .from('organization_members')
        .select('userId')
        .eq('organizationId', organizationId);
      
      if (!orgMembersError && orgMembers && orgMembers.length > 0) {
        allowedUserIds = orgMembers.map(m => m.userId);
      } else if (userId) {
        // Fallback to userId if no org members found
        allowedUserIds = [userId];
      } else {
        // No users found for this organization
        return res.json({
          success: true,
          data: []
        });
      }
    } else if (userId) {
      allowedUserIds = [userId];
    } else {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Get all installations (sites) for this user/organization
    const { data: installations, error: installationsError } = await supabase
      .from('installations')
      .select('id, installId, siteHash, plan, firstSeen, lastSeen, pluginVersion, wordpressVersion, metadata')
      .in('userId', allowedUserIds)
      .order('lastSeen', { ascending: false });

    if (installationsError) throw installationsError;
    
    // Get generation counts for each installation
    // Use UsageMonthlySummary for current month, or UsageEvent count as fallback
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    
    const sitesWithUsage = await Promise.all(
      (installations || []).map(async (installation) => {
        // Get current month's summary if available
        const { data: monthlySummary, error: summaryError } = await supabase
          .from('usage_monthly_summary')
          .select('totalRequests, totalTokens')
          .eq('installationId', installation.id)
          .eq('month', currentMonth)
          .limit(1)
          .single();
        
        // If no monthly summary, count events for current month
        let generationCount = 0;
        if (!summaryError && monthlySummary) {
          generationCount = monthlySummary.totalRequests || 0;
        } else {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);
          
          const { count, error: countError } = await supabase
            .from('usage_events')
            .select('*', { count: 'exact', head: true })
            .eq('installationId', installation.id)
            .gte('createdAt', startOfMonth.toISOString());

          if (!countError) {
            generationCount = count || 0;
          }
        }
        
        // Get site name from metadata or use installId
        const metadata = installation.metadata || {};
        const siteName = metadata.siteUrl || metadata.siteName || installation.installId;
        
        // Get last used date from most recent event or lastSeen
        let lastUsed = installation.lastSeen;
        const { data: lastEvent, error: eventError } = await supabase
          .from('usage_events')
          .select('createdAt')
          .eq('installationId', installation.id)
          .order('createdAt', { ascending: false })
          .limit(1)
          .single();
        
        if (!eventError && lastEvent && new Date(lastEvent.createdAt) > new Date(lastUsed)) {
          lastUsed = lastEvent.createdAt;
        }
        
        return {
          // Primary fields
          siteId: installation.installId,
          siteHash: installation.siteHash,
          siteName: siteName,
          generations: generationCount,
          lastUsed: lastUsed ? new Date(lastUsed).toISOString() : null,
          firstSeen: new Date(installation.firstSeen).toISOString(),
          pluginVersion: installation.pluginVersion,
          wordpressVersion: installation.wordpressVersion,
          // Alias fields for frontend compatibility
          install_id: installation.installId,
          site_name: siteName,
          total_generations: generationCount
        };
      })
    );
    
    res.json({
      success: true,
      data: sitesWithUsage
    });
    
  } catch (error) {
    console.error('Get license sites error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch license sites',
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
});

/**
 * Disconnect a site from the authenticated user's license
 * This removes the installation, effectively disconnecting the site
 */
router.delete('/sites/:siteId', dualAuthenticate, async (req, res) => {
  try {
    const { siteId } = req.params;
    
    let userId = null;
    let organizationId = null;
    let plan = 'free';
    let allowedUserIds = [];
    
    // Determine authentication method
    if (req.user && req.user.id) {
      userId = req.user.id;
      
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, plan, service')
        .eq('id', userId)
        .single();
      
      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      plan = user.plan;
      
      // Get user's organization if available
      const { data: memberships, error: membershipError } = await supabase
        .from('organization_members')
        .select('organizationId, role')
        .eq('userId', userId)
        .order('role', { ascending: true })
        .limit(1);

      if (!membershipError && memberships) {
        const { data: organization, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', memberships.organizationId)
          .single();

        if (!orgError && organization) {
          organizationId = organization.id;
          if (organization.plan === 'agency' || organization.plan === 'pro') {
            plan = organization.plan;
          }
          
          // Get all user IDs in this organization
          const { data: orgMembers, error: orgMembersError } = await supabase
            .from('organization_members')
            .select('userId')
            .eq('organizationId', organizationId);
          
          if (!orgMembersError && orgMembers) {
            allowedUserIds = orgMembers.map(m => m.userId);
          }
        }
      }
      
      if (allowedUserIds.length === 0) {
        allowedUserIds = [userId];
      }
      
    } else if (req.organization && req.organization.id) {
      organizationId = req.organization.id;
      plan = req.organization.plan || 'agency';
      
      // Get all user IDs in this organization
      const { data: orgMembers, error: orgMembersError } = await supabase
        .from('organization_members')
        .select('userId')
        .eq('organizationId', organizationId);
      
      if (!orgMembersError && orgMembers) {
        allowedUserIds = orgMembers.map(m => m.userId);
      }
      
      if (allowedUserIds.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No users found for this organization',
          code: 'NO_USERS_FOUND'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Only agency and pro plans can disconnect sites
    const allowedPlans = ['agency', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for Agency and Pro plans',
        code: 'PLAN_NOT_ALLOWED',
        plan: plan
      });
    }
    
    // Find the installation to ensure it belongs to this user/organization
    const { data: installation, error: installationError } = await supabase
      .from('installations')
      .select('id, installId, siteHash')
      .eq('installId', siteId)
      .in('userId', allowedUserIds)
      .limit(1)
      .single();
    
    if (installationError || !installation) {
      return res.status(404).json({
        success: false,
        error: 'Site not found or does not belong to your license',
        code: 'SITE_NOT_FOUND'
      });
    }
    
    // Delete the installation (this will cascade delete related usage events and summaries)
    const { error: deleteError } = await supabase
      .from('installations')
      .delete()
      .eq('id', installation.id);

    if (deleteError) throw deleteError;
    
    res.json({
      success: true,
      message: 'Site disconnected successfully',
      data: {
        siteId: installation.installId,
        siteHash: installation.siteHash
      }
    });
    
  } catch (error) {
    console.error('Disconnect site error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect site',
      code: 'DISCONNECT_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
