const jestMock = require('jest-mock');
const {
  createLicenseSnapshot,
  createLicenseCreationResponse,
  createAutoAttachResponse
} = require('./createLicenseMock');

// Default license snapshot using standardized mock
const defaultSnapshot = createLicenseSnapshot({
  licenseKey: 'test-license',
  plan: 'free'
});

const defaultCreationResponse = createLicenseCreationResponse({
  id: 1,
  licenseKey: 'test-license',
  plan: 'free'
});

const defaultAutoAttachResponse = createAutoAttachResponse({
  licenseKey: 'test-license',
  plan: 'free'
});

const mock = {
  createLicense: jestMock.fn().mockResolvedValue(defaultCreationResponse),
  autoAttachLicense: jestMock.fn().mockResolvedValue(defaultAutoAttachResponse),
  getLicenseSnapshot: jestMock.fn().mockResolvedValue(defaultSnapshot),
  PLAN_LIMITS: {
    'alttext-ai': { free: 50, pro: 1000, agency: 10000 },
    'seo-ai-meta': { free: 10, pro: 100, agency: 1000 }
  }
};

mock.__reset = () => {
  mock.createLicense.mockClear();
  mock.autoAttachLicense.mockClear();
  mock.getLicenseSnapshot.mockClear();
  
  // Reset to default values using standardized mocks
  mock.createLicense.mockResolvedValue(defaultCreationResponse);
  mock.autoAttachLicense.mockResolvedValue(defaultAutoAttachResponse);
  mock.getLicenseSnapshot.mockResolvedValue(defaultSnapshot);
};

module.exports = mock;

