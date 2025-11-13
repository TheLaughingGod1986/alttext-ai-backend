/**
 * Organization Management Routes
 * Handles organization members, sites list, and usage tracking
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/organization/my-organizations
 * Get all organizations the authenticated user belongs to
 *
 * Requires JWT authentication
 */
router.get('/my-organizations', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: req.user.id },
      include: {
        organization: {
          include: {
            sites: {
              where: { isActive: true }
            },
            members: {
              include: {
                user: {
                  select: {
                    email: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const organizations = memberships.map(m => ({
      id: m.organization.id,
      name: m.organization.name,
      licenseKey: m.role === 'owner' ? m.organization.licenseKey : undefined, // Only owners see license key
      plan: m.organization.plan,
      maxSites: m.organization.maxSites,
      tokensRemaining: m.organization.tokensRemaining,
      resetDate: m.organization.resetDate,
      myRole: m.role,
      activeSites: m.organization.sites.length,
      memberCount: m.organization.members.length
    }));

    res.json({
      success: true,
      organizations
    });

  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organizations'
    });
  }
});

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
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id
        }
      }
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this organization'
      });
    }

    const sites = await prisma.site.findMany({
      where: { organizationId: orgId },
      orderBy: { lastSeen: 'desc' }
    });

    res.json({
      success: true,
      sites: sites.map(s => ({
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
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id
        }
      }
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this organization'
      });
    }

    // Get organization details
    const organization = await prisma.organization.findUnique({
      where: { id: orgId }
    });

    // Get usage logs for the current period (since last reset)
    const usageLogs = await prisma.usageLog.findMany({
      where: {
        organizationId: orgId,
        createdAt: {
          gte: organization.resetDate
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Last 100 entries
    });

    const totalUsed = usageLogs.reduce((sum, log) => sum + log.used, 0);

    // Calculate usage by day
    const usageByDay = {};
    usageLogs.forEach(log => {
      const day = log.createdAt.toISOString().split('T')[0];
      usageByDay[day] = (usageByDay[day] || 0) + log.used;
    });

    res.json({
      success: true,
      usage: {
        tokensRemaining: organization.tokensRemaining,
        tokensUsed: totalUsed,
        resetDate: organization.resetDate,
        plan: organization.plan,
        recentLogs: usageLogs.slice(0, 20).map(log => ({
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
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id
        }
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only owners and admins can invite members'
      });
    }

    // Find the user to invite
    const invitedUser = await prisma.user.findUnique({
      where: { email }
    });

    if (!invitedUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found. They need to create an account first.'
      });
    }

    // Check if already a member
    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: invitedUser.id
        }
      }
    });

    if (existingMembership) {
      return res.status(400).json({
        success: false,
        error: 'User is already a member of this organization'
      });
    }

    // Create membership
    await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: invitedUser.id,
        role: role || 'member'
      }
    });

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
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id
        }
      }
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only owners and admins can remove members'
      });
    }

    // Don't allow removing the owner
    const memberToRemove = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: userIdToRemove
        }
      }
    });

    if (memberToRemove?.role === 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Cannot remove the organization owner'
      });
    }

    // Remove the member
    await prisma.organizationMember.delete({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: userIdToRemove
        }
      }
    });

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
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: req.user.id
        }
      }
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this organization'
      });
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true
          }
        }
      }
    });

    res.json({
      success: true,
      members: members.map(m => ({
        userId: m.user.id,
        email: m.user.email,
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

module.exports = router;
