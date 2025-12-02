/**
 * Organization Management Routes
 * Handles organization members, sites list, and usage tracking
 */

const express = require('express');
const { supabase } = require('../db/supabase-client');

const router = express.Router();

/**
 * Shared handler for getting user organizations
 */
async function getMyOrganizations(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get memberships
    const { data: memberships, error: membershipsError } = await supabase
      .from('organization_members')
      .select('organizationId, role')
      .eq('userId', req.user.id);

    if (membershipsError) throw membershipsError;

    if (!memberships || memberships.length === 0) {
      return res.json({
        success: true,
        organizations: []
      });
    }

    // Get organization IDs
    const orgIds = memberships.map(m => m.organizationId);

    // Get organizations with sites and members
    const { data: organizations, error: orgsError } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds);

    if (orgsError) throw orgsError;

    // Get active sites for all organizations
    const { data: allSites, error: sitesError } = await supabase
      .from('sites')
      .select('organizationId, id')
      .in('organizationId', orgIds)
      .eq('isActive', true);

    if (sitesError) throw sitesError;

    // Get all members for all organizations
    const { data: allMembers, error: membersError } = await supabase
      .from('organization_members')
      .select('organizationId, userId, role')
      .in('organizationId', orgIds);

    if (membersError) throw membersError;

    // Get user emails for members
    const userIds = [...new Set(allMembers.map(m => m.userId))];
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email')
      .in('id', userIds);

    if (usersError) throw usersError;

    // Format response
    const userMap = new Map((users || []).map(u => [u.id, u.email]));
    const formattedOrgs = (organizations || []).map(org => {
      const orgSites = (allSites || []).filter(s => s.organizationId === org.id);
      const orgMembers = (allMembers || []).filter(m => m.organizationId === org.id);
      
      return {
        ...org,
        activeSites: orgSites.length,
        members: orgMembers.map(m => ({
          userId: m.userId,
          email: userMap.get(m.userId) || null,
          role: m.role
        }))
      };
    });

    return res.json({
      success: true,
      organizations: formattedOrgs
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch organizations'
    });
  }
}

/**
 * GET /organizations
 * Get all organizations the authenticated user belongs to
 * Alias for /api/organization/my-organizations
 */
router.get('/organizations', getMyOrganizations);

/**
 * GET /api/organization/my-organizations
 * Get all organizations the authenticated user belongs to
 *
 * Requires JWT authentication
 */
router.get('/my-organizations', getMyOrganizations);

/**
 * GET /api/organization/:orgId/sites
 * Get all sites for an organization
 *
 * Requires JWT authentication and membership in the organization
 */
router.get('/:orgId/sites', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const orgId = parseInt(req.params.orgId);

    // Check if user is a member
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organizationId', orgId)
      .eq('userId', req.user.id)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this organization'
      });
    }

    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('*')
      .eq('organizationId', orgId)
      .order('lastSeen', { ascending: false });

    if (sitesError) throw sitesError;

    res.json({
      success: true,
      sites: (sites || []).map(s => ({
        id: s.id,
        siteUrl: s.siteUrl,
        siteHash: s.siteHash,
        isActive: s.isActive,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        pluginVersion: s.pluginVersion,
        wordpressVersion: s.wordpressVersion,
        phpVersion: s.phpVersion,
        isMultisite: s.isMultisite
      }))
    });

  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sites'
    });
  }
});

/**
 * GET /api/organization/:orgId/usage
 * Get usage statistics for an organization
 *
 * Requires JWT authentication and membership in the organization
 */
router.get('/:orgId/usage', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const orgId = parseInt(req.params.orgId);

    // Check if user is a member
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organizationId', orgId)
      .eq('userId', req.user.id)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this organization'
      });
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError || !organization) {
      throw orgError || new Error('Organization not found');
    }

    // Get usage logs for the current period (since last reset)
    const { data: usageLogs, error: logsError } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('organizationId', orgId)
      .gte('created_at', organization.reset_date || organization.resetDate)
      .order('createdAt', { ascending: false })
      .limit(100); // Last 100 entries

    if (logsError) throw logsError;

    const totalUsed = (usageLogs || []).reduce((sum, log) => sum + (log.used || 0), 0);

    // Calculate usage by day
    const usageByDay = {};
    (usageLogs || []).forEach(log => {
      const day = new Date(log.createdAt).toISOString().split('T')[0];
      usageByDay[day] = (usageByDay[day] || 0) + (log.used || 0);
    });

    res.json({
      success: true,
      usage: {
        tokensRemaining: organization.tokens_remaining !== undefined ? organization.tokens_remaining : (organization.tokensRemaining !== undefined ? organization.tokensRemaining : 0),
        tokensUsed: totalUsed,
        resetDate: organization.reset_date || organization.resetDate,
        plan: organization.plan,
        recentLogs: (usageLogs || []).slice(0, 20).map(log => ({
          imageId: log.imageId,
          used: log.used,
          createdAt: log.createdAt
        })),
        dailyUsage: Object.entries(usageByDay).map(([date, count]) => ({
          date,
          count
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage'
    });
  }
});

/**
 * POST /api/organization/:orgId/invite
 * Invite a user to join an organization
 *
 * Requires JWT authentication and owner/admin role
 *
 * Request body:
 * {
 *   email: string,
 *   role: 'admin' | 'member'
 * }
 */
router.post('/:orgId/invite', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const orgId = parseInt(req.params.orgId);
    const { email, role } = req.body;

    // Check if user is owner or admin
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organizationId', orgId)
      .eq('userId', req.user.id)
      .single();

    if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only owners and admins can invite members'
      });
    }

    // Find the user to invite
    const { data: invitedUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !invitedUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found. They need to create an account first.'
      });
    }

    // Check if already a member
    const { data: existingMembership, error: existingError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organizationId', orgId)
      .eq('userId', invitedUser.id)
      .single();

    if (existingMembership) {
      return res.status(400).json({
        success: false,
        error: 'User is already a member of this organization'
      });
    }

    // Create membership
    const { error: createError } = await supabase
      .from('organization_members')
      .insert({
        organizationId: orgId,
        userId: invitedUser.id,
        role: role || 'member'
      });

    if (createError) throw createError;

    res.json({
      success: true,
      message: `${email} has been added to the organization`
    });

  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invite member'
    });
  }
});

/**
 * DELETE /api/organization/:orgId/members/:userId
 * Remove a member from an organization
 *
 * Requires JWT authentication and owner/admin role
 */
router.delete('/:orgId/members/:userId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const orgId = parseInt(req.params.orgId);
    const userIdToRemove = parseInt(req.params.userId);

    // Check if user is owner or admin
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organizationId', orgId)
      .eq('userId', req.user.id)
      .single();

    if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only owners and admins can remove members'
      });
    }

    // Don't allow removing the owner
    const { data: memberToRemove, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organizationId', orgId)
      .eq('userId', userIdToRemove)
      .single();

    if (memberToRemove?.role === 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Cannot remove the organization owner'
      });
    }

    // Remove the member
    const { error: deleteError } = await supabase
      .from('organization_members')
      .delete()
      .eq('organizationId', orgId)
      .eq('userId', userIdToRemove);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Member removed successfully'
    });

  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove member'
    });
  }
});

/**
 * GET /api/organization/:orgId/members
 * Get all members of an organization
 *
 * Requires JWT authentication and membership in the organization
 */
router.get('/:orgId/members', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const orgId = parseInt(req.params.orgId);

    // Check if user is a member
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organizationId', orgId)
      .eq('userId', req.user.id)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this organization'
      });
    }

    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('userId, role, createdAt')
      .eq('organizationId', orgId);

    if (membersError) throw membersError;

    // Get user details
    const userIds = (members || []).map(m => m.userId);
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, createdAt')
      .in('id', userIds);

    if (usersError) throw usersError;

    // Build user map
    const userMap = new Map((users || []).map(u => [u.id, u]));

    res.json({
      success: true,
      members: (members || []).map(m => ({
        userId: m.userId,
        email: userMap.get(m.userId)?.email || null,
        role: m.role,
        joinedAt: m.createdAt
      }))
    });

  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch members'
    });
  }
});

module.exports = {
  router,
  getMyOrganizations, // Export handler for use in root-level route
};
