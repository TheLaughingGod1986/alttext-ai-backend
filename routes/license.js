/**
 * License Management Routes
 * Handles license key generation, activation, and deactivation for multi-site organizations
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const router = express.Router();
const prisma = new PrismaClient();

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
    const organization = await prisma.organization.findUnique({
      where: { licenseKey },
      include: {
        sites: {
          where: { isActive: true }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Invalid license key'
      });
    }

    // Check if site already exists
    let site = await prisma.site.findUnique({
      where: { siteHash }
    });

    if (site) {
      // Site exists - check if it belongs to this organization
      if (site.organizationId !== organization.id) {
        return res.status(403).json({
          success: false,
          error: 'This site is already registered to a different organization'
        });
      }

      // Reactivate if inactive and update info
      site = await prisma.site.update({
        where: { id: site.id },
        data: {
          isActive: true,
          lastSeen: new Date(),
          siteUrl: siteUrl || site.siteUrl,
          installId: installId || site.installId,
          pluginVersion: pluginVersion || site.pluginVersion,
          wordpressVersion: wordpressVersion || site.wordpressVersion,
          phpVersion: phpVersion || site.phpVersion,
          isMultisite: isMultisite !== undefined ? isMultisite : site.isMultisite
        }
      });

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
          id: site.id,
          siteHash: site.siteHash,
          isActive: site.isActive,
          activeSiteCount: organization.sites.length
        }
      });
    }

    // New site - check if organization has reached site limit
    const activeSiteCount = organization.sites.filter(s => s.isActive).length;
    if (activeSiteCount >= organization.maxSites) {
      return res.status(403).json({
        success: false,
        error: `Site limit reached. This license allows ${organization.maxSites} active site(s). Please deactivate an existing site first.`,
        activeSiteCount,
        maxSites: organization.maxSites
      });
    }

    // Create new site
    site = await prisma.site.create({
      data: {
        organizationId: organization.id,
        siteHash,
        siteUrl,
        installId,
        isActive: true,
        pluginVersion,
        wordpressVersion,
        phpVersion,
        isMultisite: isMultisite || false
      }
    });

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
        id: site.id,
        siteHash: site.siteHash,
        isActive: site.isActive,
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
    const site = await prisma.site.findFirst({
      where: siteId ? { id: siteId } : { siteHash },
      include: {
        organization: {
          include: {
            members: {
              where: {
                userId: req.user.id,
                role: { in: ['owner', 'admin'] }
              }
            }
          }
        }
      }
    });

    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found'
      });
    }

    // Check if user has permission
    if (site.organization.members.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to manage this organization'
      });
    }

    // Deactivate the site
    await prisma.site.update({
      where: { id: site.id },
      data: { isActive: false }
    });

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

    const organization = await prisma.organization.create({
      data: {
        name,
        licenseKey,
        plan,
        maxSites: maxSites || (plan === 'agency' ? 10 : 1),
        tokensRemaining: tokensRemaining || (plan === 'free' ? 50 : plan === 'pro' ? 500 : 10000)
      }
    });

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

    const organization = await prisma.organization.findUnique({
      where: { licenseKey },
      include: {
        sites: {
          where: { isActive: true },
          select: {
            id: true,
            siteUrl: true,
            siteHash: true,
            lastSeen: true,
            pluginVersion: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'License not found'
      });
    }

    res.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
        maxSites: organization.maxSites,
        tokensRemaining: organization.tokensRemaining,
        resetDate: organization.resetDate,
        activeSites: organization.sites.length,
        sites: organization.sites,
        members: organization.members.map(m => ({
          userId: m.user.id,
          email: m.user.email,
          role: m.role
        }))
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
