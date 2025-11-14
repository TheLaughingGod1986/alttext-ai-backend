/**
 * License routes for organization and site management
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../auth/jwt');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Get all sites using the authenticated user's license
 * Returns sites (installations) with their generation counts
 * 
 * Authentication: Requires JWT token (Bearer token in Authorization header)
 * For now, license key authentication (X-License-Key header) is not yet implemented
 */
router.get('/sites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
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
    
    // Only agency and pro plans have multiple sites
    const allowedPlans = ['agency', 'pro'];
    if (!allowedPlans.includes(user.plan)) {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for Agency and Pro plans',
        code: 'PLAN_NOT_ALLOWED',
        plan: user.plan
      });
    }
    
    // Get all installations (sites) for this user
    const installations = await prisma.installation.findMany({
      where: { 
        userId: userId 
      },
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
router.delete('/sites/:siteId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { siteId } = req.params;
    
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
    
    // Only agency and pro plans can disconnect sites
    const allowedPlans = ['agency', 'pro'];
    if (!allowedPlans.includes(user.plan)) {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available for Agency and Pro plans',
        code: 'PLAN_NOT_ALLOWED',
        plan: user.plan
      });
    }
    
    // Find the installation to ensure it belongs to this user
    const installation = await prisma.installation.findFirst({
      where: {
        installId: siteId,
        userId: userId
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
