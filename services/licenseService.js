/**
 * License Service
 * Centralizes license creation, assignment, quota management, and email delivery
 */

const { supabase } = require('../db/supabase-client');
const { randomUUID } = require('crypto');
const emailService = require('./emailService');

/**
 * Service-specific plan limits
 */
const PLAN_LIMITS = {
  'alttext-ai': {
    free: 50,
    pro: 1000,
    agency: 10000
  },
  'seo-ai-meta': {
    free: 10,
    pro: 100,
    agency: 1000
  }
};

/**
 * Get token limit for a plan and service
 */
function getTokenLimit(plan, service) {
  const serviceLimits = PLAN_LIMITS[service] || PLAN_LIMITS['alttext-ai'];
  return serviceLimits[plan] || serviceLimits.free;
}

/**
 * Find license by ID or key
 */
async function findLicenseByIdOrKey(licenseId) {
  const isLicenseKey = typeof licenseId === 'string' && licenseId.includes('-');
  const query = isLicenseKey
    ? supabase.from('licenses').select('*').eq('licenseKey', licenseId)
    : supabase.from('licenses').select('*').eq('id', licenseId);

  const { data: licenseData, error: licenseError } = await query.single();

  if (licenseError || !licenseData) {
    throw new Error('License not found');
  }

  return licenseData;
}

/**
 * Get or create organization for user
 */
async function getOrCreateUserOrganization(userId, license) {
  // Check for existing organization membership
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organizationId')
    .eq('userId', userId)
    .order('role', { ascending: true })
    .limit(1)
    .single();

  if (!membershipError && membership) {
    return membership.organizationId;
  }

  // Create personal organization for user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new Error('User not found');
  }

  const orgName = `${user.email.split('@')[0]}'s Organization`;
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: orgName,
      licenseKey: randomUUID(),
      plan: license.plan,
      service: license.service,
      maxSites: license.plan === 'agency' ? 10 : 1,
      tokensRemaining: license.tokenLimit,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .select()
    .single();

  if (orgError) throw orgError;

  // Create owner membership
  await supabase
    .from('organization_members')
    .insert({
      organizationId: org.id,
      userId,
      role: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

  return org.id;
}

/**
 * Find existing site by hash or install ID
 */
async function findExistingSite(siteHash, installId, organizationId) {
  if (siteHash) {
    const { data: existingSite } = await supabase
      .from('sites')
      .select('*')
      .eq('siteHash', siteHash)
      .single();

    if (existingSite) {
      if (existingSite.organizationId !== organizationId) {
        throw new Error('Site already registered to different organization');
      }
      return existingSite;
    }
  }

  if (installId) {
    const { data: existingSite } = await supabase
      .from('sites')
      .select('*')
      .eq('installId', installId)
      .single();

    if (existingSite) {
      if (existingSite.organizationId !== organizationId) {
        throw new Error('Site already registered to different organization');
      }
      return existingSite;
    }
  }

  return null;
}

/**
 * Check if organization can add more sites
 */
async function canAddSite(organizationId, organization, existingSite) {
  if (existingSite && !existingSite.isActive) {
    // Reactivating existing site - allowed
    return true;
  }

  if (existingSite) {
    // Site already active - no need to check limit
    return true;
  }

  const { data: activeSites } = await supabase
    .from('sites')
    .select('id')
    .eq('organizationId', organizationId)
    .eq('isActive', true);

  const activeSiteCount = (activeSites || []).length;
  return activeSiteCount < organization.maxSites;
}

/**
 * Create or update site
 */
async function createOrUpdateSite(site, organizationId, siteInfo) {
  const { siteUrl, siteHash, installId } = siteInfo;
  const now = new Date().toISOString();

  if (site) {
    // Reactivate and update existing site
    const { data: updatedSite, error: updateError } = await supabase
      .from('sites')
      .update({
        isActive: true,
        siteUrl: siteUrl || site.siteUrl,
        installId: installId || site.installId,
        lastSeen: now
      })
      .eq('id', site.id)
      .select()
      .single();

    if (updateError) throw updateError;
    return updatedSite;
  }

  // Create new site
  const { data: newSite, error: createError } = await supabase
    .from('sites')
    .insert({
      organizationId,
      siteHash: siteHash || randomUUID(),
      siteUrl,
      installId,
      isActive: true,
      firstSeen: now,
      lastSeen: now
    })
    .select()
    .single();

  if (createError) throw createError;
  return newSite;
}

/**
 * Create a new license record
 * @param {Object} options - License creation options
 * @param {string} options.plan - Plan type (free, pro, agency)
 * @param {string} options.service - Service name (alttext-ai, seo-ai-meta)
 * @param {number} [options.userId] - User ID if user-based license
 * @param {number} [options.organizationId] - Organization ID if org-based license
 * @param {string} [options.siteUrl] - Site URL for auto-attach
 * @param {string} [options.siteHash] - Site hash for auto-attach
 * @param {string} [options.installId] - Install ID for auto-attach
 * @param {string} [options.stripeCustomerId] - Stripe customer ID
 * @param {string} [options.stripeSubscriptionId] - Stripe subscription ID
 * @param {string} [options.email] - Email for license delivery
 * @param {string} [options.name] - Name for license delivery
 * @returns {Promise<Object>} Created license record
 */
async function createLicense(options = {}) {
  const {
    plan = 'free',
    service = 'alttext-ai',
    userId = null,
    organizationId = null,
    siteUrl = null,
    siteHash = null,
    installId = null,
    stripeCustomerId = null,
    stripeSubscriptionId = null,
    email = null,
    name = null
  } = options;

  // Validate plan
  if (!['free', 'pro', 'agency'].includes(plan)) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  const tokenLimit = getTokenLimit(plan, service);
  const licenseKey = randomUUID();
  const autoAttachStatus = (siteUrl || siteHash || installId) ? 'pending' : 'manual';
  const now = new Date().toISOString();

  const licenseData = {
    licenseKey,
    plan,
    service,
    tokenLimit,
    tokensRemaining: tokenLimit,
    siteUrl,
    siteHash,
    installId,
    autoAttachStatus,
    userId,
    organizationId,
    stripeCustomerId,
    stripeSubscriptionId,
    licenseEmailSentAt: null,
    emailStatus: 'pending',
    createdAt: now,
    updatedAt: now
  };

  const { data: license, error } = await supabase
    .from('licenses')
    .insert(licenseData)
    .select()
    .single();

  if (error) {
    console.error('Error creating license:', error);
    throw new Error(`Failed to create license: ${error.message}`);
  }

  console.log(`✅ License created: ${licenseKey} (plan: ${plan}, service: ${service})`);

  // Attempt auto-attach if site info provided
  if (siteUrl || siteHash || installId) {
    try {
      await autoAttachLicense(license.id, { siteUrl, siteHash, installId });
    } catch (attachError) {
      console.warn('Auto-attach failed during license creation:', attachError.message);
    }
  }

  // Send license email if email provided
  if (email) {
    try {
      await sendLicenseEmail(license, { email, name });
    } catch (emailError) {
      console.warn('License email failed during creation:', emailError.message);
    }
  }

  return license;
}

/**
 * Auto-attach a license to a site
 * @param {number|string} licenseId - License ID or license key
 * @param {Object} siteInfo - Site information
 * @param {string} [siteInfo.siteUrl] - Site URL
 * @param {string} [siteInfo.siteHash] - Site hash
 * @param {string} [siteInfo.installId] - Install ID
 * @returns {Promise<Object>} Updated license and site info
 */
async function autoAttachLicense(licenseId, siteInfo = {}) {
  const { siteUrl, siteHash, installId } = siteInfo;

  // Get license
  const license = await findLicenseByIdOrKey(licenseId);

  // Determine organization ID
  let organizationId = license.organizationId;

  if (!organizationId && license.userId) {
    organizationId = await getOrCreateUserOrganization(license.userId, license);
  }

  if (!organizationId) {
    throw new Error('Cannot determine organization for license');
  }

  // Get organization to check site limits
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();

  if (orgError || !organization) {
    throw new Error('Organization not found');
  }

  // Find existing site
  const existingSite = await findExistingSite(siteHash, installId, organizationId);

  // Check site limit
  if (!(await canAddSite(organizationId, organization, existingSite))) {
    throw new Error(`Site limit reached. This license allows ${organization.maxSites} active site(s).`);
  }

  // Create or update site
  const site = await createOrUpdateSite(existingSite, organizationId, { siteUrl, siteHash, installId });

  // Update license with site info
  const { data: updatedLicense, error: licenseUpdateError } = await supabase
    .from('licenses')
    .update({
      siteUrl: siteUrl || site.siteUrl,
      siteHash: site.siteHash,
      installId: installId || site.installId,
      autoAttachStatus: 'attached',
      updatedAt: new Date().toISOString()
    })
    .eq('id', license.id)
    .select()
    .single();

  if (licenseUpdateError) throw licenseUpdateError;

  console.log(`✅ License ${license.licenseKey} attached to site ${site.siteHash}`);

  return {
    license: updatedLicense,
    site,
    organization
  };
}

/**
 * Send license email
 * @param {Object} license - License record
 * @param {Object} recipient - Email recipient info
 * @param {string} recipient.email - Email address
 * @param {string} [recipient.name] - Recipient name
 * @returns {Promise<Object>} Email send result
 */
async function sendLicenseEmail(license, recipient) {
  const { email, name } = recipient;

  if (!email) {
    throw new Error('Email address required');
  }

  // Get site info if attached
  let attachedSite = null;
  if (license.siteHash) {
    const { data: site } = await supabase
      .from('sites')
      .select('siteUrl, siteHash')
      .eq('siteHash', license.siteHash)
      .single();

    attachedSite = site;
  }

  // Send email via email service
  const emailResult = await emailService.sendLicenseIssuedEmail({
    email,
    name: name || email.split('@')[0],
    licenseKey: license.licenseKey,
    plan: license.plan,
    tokenLimit: license.tokenLimit,
    tokensRemaining: license.tokensRemaining,
    siteUrl: attachedSite?.siteUrl || license.siteUrl,
    isAttached: !!attachedSite
  });

  // Update license with email status
  const updateData = {
    emailStatus: emailResult.success ? 'sent' : 'failed',
    updatedAt: new Date().toISOString()
  };

  if (emailResult.success) {
    updateData.licenseEmailSentAt = new Date().toISOString();
  }

  await supabase
    .from('licenses')
    .update(updateData)
    .eq('id', license.id);

  return emailResult;
}

/**
 * Get license snapshot (standardized response format)
 * @param {Object|string} license - License record or license key
 * @returns {Promise<Object>} License snapshot
 */
async function getLicenseSnapshot(license) {
  let licenseRecord = license;

  // If string, assume it's a license key
  if (typeof license === 'string') {
    const { data: licenseData, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('licenseKey', license)
      .single();

    if (error || !licenseData) {
      throw new Error('License not found');
    }
    licenseRecord = licenseData;
  }

  // Get site info if attached
  let siteInfo = null;
  if (licenseRecord.siteHash) {
    const { data: site } = await supabase
      .from('sites')
      .select('siteUrl, siteHash, installId, isActive')
      .eq('siteHash', licenseRecord.siteHash)
      .single();

    if (site) {
      siteInfo = {
        siteUrl: site.siteUrl,
        siteHash: site.siteHash,
        installId: site.installId,
        isActive: site.isActive
      };
    }
  }

  return {
    licenseKey: licenseRecord.licenseKey,
    plan: licenseRecord.plan,
    tokenLimit: licenseRecord.tokenLimit,
    tokensRemaining: licenseRecord.tokensRemaining,
    siteUrl: siteInfo?.siteUrl || licenseRecord.siteUrl,
    siteHash: siteInfo?.siteHash || licenseRecord.siteHash,
    autoAttachStatus: licenseRecord.autoAttachStatus,
    createdAt: licenseRecord.createdAt,
    updatedAt: licenseRecord.updatedAt,
    licenseEmailSentAt: licenseRecord.licenseEmailSentAt
  };
}

module.exports = {
  createLicense,
  autoAttachLicense,
  sendLicenseEmail,
  getLicenseSnapshot,
  PLAN_LIMITS
};
