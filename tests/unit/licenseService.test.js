jest.mock('../../src/services/emailService', () => ({
  sendLicenseIssuedEmail: jest.fn().mockResolvedValue({ success: true })
}));

const licenseService = jest.requireActual('../../src/services/licenseService');
const supabaseMock = require('../mocks/supabase.mock');

describe('licenseService', () => {
  beforeEach(() => {
    supabaseMock.__reset();
  });

  test('createLicense returns inserted license', async () => {
    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 1,
        licenseKey: 'test-key',
        plan: 'pro',
        tokenLimit: 1000,
        tokensRemaining: 1000
      },
      error: null
    });

    const license = await licenseService.createLicense({ plan: 'pro', service: 'alttext-ai' });
    expect(license.licenseKey).toBe('test-key');
    expect(license.tokenLimit).toBe(1000);
  });

  test('createLicense throws on invalid plan', async () => {
    await expect(
      licenseService.createLicense({ plan: 'invalid' })
    ).rejects.toThrow('Invalid plan');
  });

  test('autoAttachLicense throws when license not found', async () => {
    await expect(licenseService.autoAttachLicense(999, {})).rejects.toThrow('License not found');
  });

  test('getLicenseSnapshot returns license data', async () => {
    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 1,
        licenseKey: 'snapshot-key',
        plan: 'free',
        tokenLimit: 50,
        tokensRemaining: 25,
        siteHash: 'site-hash',
        autoAttachStatus: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      error: null
    });

    supabaseMock.__queueResponse('sites', 'select', {
      data: {
        siteUrl: 'https://example.com',
        siteHash: 'site-hash',
        installId: 'install-1',
        isActive: true
      },
      error: null
    });

    const snapshot = await licenseService.getLicenseSnapshot('snapshot-key');
    expect(snapshot.licenseKey).toBe('snapshot-key');
    expect(snapshot.siteUrl).toBe('https://example.com');
  });

  test('autoAttachLicense rejects when site belongs to another organization', async () => {
    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 1,
        licenseKey: 'conflict-license',
        organizationId: 1,
        plan: 'agency',
        service: 'alttext-ai',
        tokenLimit: 1000,
        userId: null
      },
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'select', {
      data: {
        id: 1,
        plan: 'agency',
        service: 'alttext-ai',
        maxSites: 10,
        tokensRemaining: 5000
      },
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: {
        id: 99,
        organizationId: 2,
        siteHash: 'site-conflict',
        siteUrl: 'https://other.com'
      },
      error: null
    });

    await expect(
      licenseService.autoAttachLicense('conflict-license', { siteHash: 'site-conflict' })
    ).rejects.toThrow('Site already registered to different organization');
  });

  test('autoAttachLicense enforces site limits', async () => {
    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 5,
        licenseKey: 'limit-license',
        organizationId: 3,
        plan: 'agency',
        service: 'alttext-ai',
        tokenLimit: 1000,
        userId: null
      },
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'select', {
      data: {
        id: 3,
        plan: 'agency',
        service: 'alttext-ai',
        maxSites: 1,
        tokensRemaining: 0
      },
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: [{ id: 1 }],
      error: null
    });

    await expect(
      licenseService.autoAttachLicense('limit-license', { siteHash: 'new-hash' })
    ).rejects.toThrow('Site limit reached');
  });

  test('autoAttachLicense throws when organization creation fails', async () => {
    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 6,
        licenseKey: 'org-create-license',
        organizationId: null,
        plan: 'pro',
        service: 'alttext-ai',
        tokenLimit: 1000,
        userId: 10
      },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: null,
      error: { code: 'PGRST116' }
    });
    supabaseMock.__queueResponse('users', 'select', {
      data: { email: 'user@example.com' },
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'insert', {
      data: null,
      error: { message: 'Organization creation failed' }
    });

    await expect(
      licenseService.autoAttachLicense('org-create-license', { siteHash: 'new-site' })
    ).rejects.toThrow();
  });

  test('autoAttachLicense throws when user not found during org creation', async () => {
    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 7,
        licenseKey: 'user-not-found-license',
        organizationId: null,
        plan: 'pro',
        service: 'alttext-ai',
        tokenLimit: 1000,
        userId: 999
      },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: null,
      error: { code: 'PGRST116' }
    });
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'User not found' }
    });

    await expect(
      licenseService.autoAttachLicense('user-not-found-license', { siteHash: 'new-site' })
    ).rejects.toThrow('User not found');
  });

  test('createLicense continues when email sending fails', async () => {
    const emailService = require('../../src/services/emailService');
    emailService.sendLicenseIssuedEmail.mockRejectedValueOnce(new Error('Email service down'));

    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 8,
        licenseKey: 'email-fail-license',
        plan: 'pro',
        tokenLimit: 1000,
        tokensRemaining: 1000
      },
      error: null
    });

    const license = await licenseService.createLicense({
      plan: 'pro',
      service: 'alttext-ai',
      email: 'test@example.com',
      name: 'Test User'
    });

    expect(license.licenseKey).toBe('email-fail-license');
    // License should still be created even if email fails
  });

  test('getLicenseSnapshot handles missing site gracefully', async () => {
    supabaseMock.__queueResponse('licenses', 'select', {
      data: {
        id: 9,
        licenseKey: 'no-site-license',
        plan: 'free',
        tokenLimit: 50,
        tokensRemaining: 50,
        siteHash: 'missing-hash',
        autoAttachStatus: 'attached',
        siteUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: { code: 'PGRST116' }
    });

    const snapshot = await licenseService.getLicenseSnapshot('no-site-license');
    expect(snapshot.licenseKey).toBe('no-site-license');
    expect(snapshot.siteUrl).toBeNull();
  });

});

