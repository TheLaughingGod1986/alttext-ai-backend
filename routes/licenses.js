/**
 * License routes for organization and site management
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { dualAuthenticate } = require('../auth/dual-auth');

const router = express.Router();
const prisma = new PrismaClient();

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
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          plan: true,
          service: true
        }
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      plan = user.plan;
      
      // Get user's organization if available
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: userId },
        include: {
          organization: true
        },
        orderBy: { role: 'asc' } // Owner first
      });
      
      if (membership && membership.organization) {
        organizationId = membership.organization.id;
        // Use organization plan if it's higher than user plan
        if (membership.organization.plan === 'agency' || membership.organization.plan === 'pro') {
          plan = membership.organization.plan;
        }
      }
      
    } else if (req.organization && req.organization.id) {
      // License key authentication
      organizationId = req.organization.id;
      plan = req.organization.plan || 'agency';
      
      // Get organization owner for userId lookup
      const ownerMembership = await prisma.organizationMember.findFirst({
        where: { 
          organizationId: organizationId,
          role: 'owner'
        }
      });
      
      if (ownerMembership) {
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
    const whereClause = {};
    if (organizationId) {
      // Get all installations for this organization
      // Installations are linked to users, and users are members of organizations
      const orgUserIds = await prisma.organizationMember.findMany({
        where: { organizationId: organizationId },
        select: { userId: true }
      }).then(members => members.map(m => m.userId));
      
      if (orgUserIds.length > 0) {
        whereClause.userId = { in: orgUserIds };
      } else if (userId) {
        // Fallback to userId if no org members found
        whereClause.userId = userId;
      } else {
        // No users found for this organization
        return res.json({
          success: true,
          data: []
        });
      }
    } else if (userId) {
      whereClause.userId = userId;
    } else {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Get all installations (sites) for this user/organization
    const installations = await prisma.installation.findMany({
      where: whereClause,
      select: {
        id: true,
        installId: true,
        siteHash: true,
        plan: true,
        firstSeen: true,
        lastSeen: true,
        pluginVersion: true,
        wordpressVersion: true,
        metadata: true
      },
      orderBy: {
        lastSeen: 'desc'
      }
    });
    
    // Get generation counts for each installation
    // Use UsageMonthlySummary for current month, or UsageEvent count as fallback
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    
    const sitesWithUsage = await Promise.all(
      installations.map(async (installation) => {
        // Get current month's summary if available
        const monthlySummary = await prisma.usageMonthlySummary.findFirst({
          where: {
            installationId: installation.id,
            month: currentMonth
          },
          select: {
            totalRequests: true,
            totalTokens: true
          }
        });
        
        // If no monthly summary, count events for current month
        let generationCount = 0;
        if (monthlySummary) {
          generationCount = monthlySummary.totalRequests || 0;
        } else {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);
          
          generationCount = await prisma.usageEvent.count({
            where: {
              installationId: installation.id,
              createdAt: {
                gte: startOfMonth
              }
            }
          });
        }
        
        // Get site name from metadata or use installId
        const metadata = installation.metadata || {};
        const siteName = metadata.siteUrl || metadata.siteName || installation.installId;
        
        // Get last used date from most recent event or lastSeen
        let lastUsed = installation.lastSeen;
        const lastEvent = await prisma.usageEvent.findFirst({
          where: {
            installationId: installation.id
          },
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            createdAt: true
          }
        });
        
        if (lastEvent && lastEvent.createdAt > lastUsed) {
          lastUsed = lastEvent.createdAt;
        }
        
        return {
          // Primary fields
          siteId: installation.installId,
          siteHash: installation.siteHash,
          siteName: siteName,
          generations: generationCount,
          lastUsed: lastUsed ? lastUsed.toISOString() : null,
          firstSeen: installation.firstSeen.toISOString(),
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
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          plan: true,
          service: true
        }
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      plan = user.plan;
      
      // Get user's organization if available
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: userId },
        include: {
          organization: true
        }
      });
      
      if (membership && membership.organization) {
        organizationId = membership.organization.id;
        if (membership.organization.plan === 'agency' || membership.organization.plan === 'pro') {
          plan = membership.organization.plan;
        }
        
        // Get all user IDs in this organization
        const orgMembers = await prisma.organizationMember.findMany({
          where: { organizationId: organizationId },
          select: { userId: true }
        });
        allowedUserIds = orgMembers.map(m => m.userId);
      } else {
        allowedUserIds = [userId];
      }
      
    } else if (req.organization && req.organization.id) {
      organizationId = req.organization.id;
      plan = req.organization.plan || 'agency';
      
      // Get all user IDs in this organization
      const orgMembers = await prisma.organizationMember.findMany({
        where: { organizationId: organizationId },
        select: { userId: true }
      });
      allowedUserIds = orgMembers.map(m => m.userId);
      
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
    const installation = await prisma.installation.findFirst({
      where: {
        installId: siteId,
        userId: { in: allowedUserIds }
      },
      select: {
        id: true,
        installId: true,
        siteHash: true
      }
    });
    
    if (!installation) {
      return res.status(404).json({
        success: false,
        error: 'Site not found or does not belong to your license',
        code: 'SITE_NOT_FOUND'
      });
    }
    
    // Delete the installation (this will cascade delete related usage events and summaries)
    await prisma.installation.delete({
      where: {
        id: installation.id
      }
    });
    
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
