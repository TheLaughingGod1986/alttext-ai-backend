/**
 * Single source of truth for LicenseService mocks
 * Returns consistent license snapshots with all required properties
 */

function createLicenseMock(overrides = {}) {
  const now = new Date().toISOString();
  
  const defaultLicense = {
    id: overrides.id || 1,
    licenseKey: overrides.licenseKey || 'test-license-key',
    plan: overrides.plan || 'free',
    service: overrides.service || 'alttext-ai',
    tokenLimit: overrides.tokenLimit || (overrides.plan === 'pro' ? 1000 : overrides.plan === 'agency' ? 10000 : 50),
    tokensRemaining: overrides.tokensRemaining !== undefined 
      ? overrides.tokensRemaining 
      : (overrides.plan === 'pro' ? 1000 : overrides.plan === 'agency' ? 10000 : 50),
    siteUrl: overrides.siteUrl !== undefined ? overrides.siteUrl : null,
    siteHash: overrides.siteHash !== undefined ? overrides.siteHash : null,
    installId: overrides.installId !== undefined ? overrides.installId : null,
    autoAttachStatus: overrides.autoAttachStatus || 'manual',
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    licenseEmailSentAt: overrides.licenseEmailSentAt !== undefined ? overrides.licenseEmailSentAt : null,
    userId: overrides.userId !== undefined ? overrides.userId : null,
    organizationId: overrides.organizationId !== undefined ? overrides.organizationId : null
  };

  return { ...defaultLicense, ...overrides };
}

/**
 * Create a license snapshot (what getLicenseSnapshot returns)
 */
function createLicenseSnapshot(overrides = {}) {
  const license = createLicenseMock(overrides);
  
  return {
    licenseKey: license.licenseKey,
    plan: license.plan,
    tokenLimit: license.tokenLimit,
    tokensRemaining: license.tokensRemaining,
    siteUrl: license.siteUrl,
    siteHash: license.siteHash,
    autoAttachStatus: license.autoAttachStatus,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
    licenseEmailSentAt: license.licenseEmailSentAt
  };
}

/**
 * Create a license creation response (what createLicense returns)
 */
function createLicenseCreationResponse(overrides = {}) {
  const license = createLicenseMock(overrides);
  
  return {
    id: license.id,
    licenseKey: license.licenseKey,
    plan: license.plan,
    service: license.service,
    tokenLimit: license.tokenLimit,
    tokensRemaining: license.tokensRemaining,
    userId: license.userId,
    organizationId: license.organizationId
  };
}

/**
 * Create an auto-attach response (what autoAttachLicense returns)
 */
function createAutoAttachResponse(overrides = {}) {
  const license = createLicenseMock(overrides);
  
  return {
    license: {
      id: license.id,
      licenseKey: license.licenseKey,
      plan: license.plan,
      service: license.service,
      tokenLimit: license.tokenLimit,
      tokensRemaining: license.tokensRemaining
    },
    site: {
      id: overrides.siteId || 1,
      siteUrl: license.siteUrl || 'https://example.com',
      siteHash: license.siteHash || 'test-site-hash',
      installId: license.installId || 'test-install-id',
      isActive: overrides.siteIsActive !== undefined ? overrides.siteIsActive : true
    },
    organization: {
      id: license.organizationId || 1,
      plan: license.plan,
      maxSites: overrides.maxSites || (license.plan === 'agency' ? 10 : 1),
      tokensRemaining: license.tokensRemaining
    }
  };
}

module.exports = {
  createLicenseMock,
  createLicenseSnapshot,
  createLicenseCreationResponse,
  createAutoAttachResponse
};

