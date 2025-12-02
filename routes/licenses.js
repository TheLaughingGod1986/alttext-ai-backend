/**
 * License routes for organization and site management
 */

const express = require('express');
const { supabase } = require('../db/supabase-client');
const logger = require('../src/utils/logger');
const { dualAuthenticate, combinedAuth } = require('../src/middleware/dual-auth');
const licenseService = require('../src/services/licenseService');
const siteService = require('../src/services/siteService');
const { errors: httpErrors } = require('../src/utils/http');

const router = express.Router();

/**
 * POST /api/licenses/auto-attach
 * Auto-attach a license to a site
 * 
 * CRITICAL: Links license to site_hash, NOT to user_id
 * All users on the same site (same site_hash) share the same license
 * 
 * Headers:
 * - X-Site-Hash (required) - 32-character site identifier
 * - X-Site-URL (optional) - WordPress site URL
 * - Authorization (optional) - JWT token if user is authenticated
 * 
 * Request body:
 * - siteUrl (optional)
 * - siteHash (optional, can use X-Site-Hash header instead)
 * - installId (optional)
 */
router.post('/auto-attach', async (req, res) => {
  try {
    // X-Site-Hash is REQUIRED (from header or body)
    const siteHash = req.headers['x-site-hash'] || req.body.siteHash;
    const siteUrl = req.headers['x-site-url'] || req.body.siteUrl;
    const installId = req.body.installId;

    if (!siteHash) {
      return httpErrors.missingField(res, 'X-Site-Hash header or siteHash');
    }

    // Check if site already has a license
    const { data: existingSite, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('site_hash', siteHash)
      .single();

    let license = null;
    let site = null;

    if (!siteError && existingSite && existingSite.license_key) {
      // Site already has a license - return existing license
      const { data: licenseData, error: licenseError } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', existingSite.license_key)
        .single();

      if (!licenseError && licenseData) {
        license = licenseData;
        site = existingSite;

        // Update site URL if provided and different
        if (siteUrl && site.site_url !== siteUrl) {
          const { data: updatedSite } = await supabase
            .from('sites')
            .update({
              site_url: siteUrl,
              updated_at: new Date().toISOString()
            })
            .eq('site_hash', siteHash)
            .select()
            .single();

          if (updatedSite) {
            site = updatedSite;
          }
        }
      }
    }

    // If no license exists, create new free license for this site
    if (!license) {
      const result = await siteService.createFreeLicenseForSite(siteHash, siteUrl);
      if (!result || !result.license) {
        throw new Error('Failed to create license for site');
      }
      license = result.license;
      site = result.site;
    }

    // Get usage info
    const usage = await siteService.getSiteUsage(siteHash);

    // Calculate reset timestamp
    const resetDate = usage.resetDate || siteService.getNextResetDate();
    const resetTimestamp = Math.floor(new Date(resetDate).getTime() / 1000);

    // Build response with licenseKey in multiple locations (CRITICAL requirement)
    const licenseKey = license.license_key || site.license_key;

    res.json({
      success: true,
      data: {
        message: 'License attached successfully',
        license: {
          licenseKey: licenseKey, // REQUIRED
          plan: license.plan || 'free',
          tokenLimit: Number(license.token_limit) || 50,
          tokensRemaining: Number(license.tokens_remaining !== undefined ? license.tokens_remaining : usage.remaining),
          tokensUsed: Number(license.tokens_used !== undefined ? license.tokens_used : usage.used),
          resetDate: resetDate,
          reset_timestamp: resetTimestamp,
          autoAttachStatus: license.auto_attach_status || 'attached',
          licenseEmailSentAt: license.license_email_sent_at || null
        },
        site: {
          siteHash: siteHash,
          siteUrl: site.site_url || siteUrl || null,
          licenseKey: licenseKey, // Also include here
          autoAttachStatus: 'attached'
        },
        organization: {
          plan: usage.plan,
          tokenLimit: Number(usage.limit),
          tokensRemaining: Number(usage.remaining),
          tokensUsed: Number(usage.used),
          resetDate: resetDate
        }
      }
    });

  } catch (error) {
    logger.error('Auto-attach error:', { error: error.message, code: error.code });
    return httpErrors.internalError(res, error.message || 'Failed to auto-attach license', { code: 'AUTO_ATTACH_ERROR' });
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
    logger.error('Get license sites error:', { error: error.message });
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
    logger.error('Disconnect site error:', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect site',
      code: 'DISCONNECT_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
