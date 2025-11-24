/**
 * License Route Validation
 */

const { validateDomain } = require('./validators');
const { createValidationError } = require('./index');

/**
 * Validate license activation input
 */
function validateLicenseActivationInput(data) {
  const { licenseKey, siteHash, siteUrl } = data;
  const errors = [];

  if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim() === '') {
    errors.push({ field: 'licenseKey', message: 'License key is required' });
  }

  if (!siteHash || typeof siteHash !== 'string' || siteHash.trim() === '') {
    errors.push({ field: 'siteHash', message: 'Site hash is required' });
  }

  if (siteUrl && !validateDomain(siteUrl)) {
    errors.push({ field: 'siteUrl', message: 'Invalid site URL format' });
  }

  if (errors.length > 0) {
    const error = createValidationError('Validation failed', null, { errors });
    error.errors = errors;
    throw error;
  }

  return true;
}

/**
 * Validate license auto-attach input
 */
function validateAutoAttachInput(data) {
  const { siteUrl, siteHash, installId } = data;

  if (!siteUrl && !siteHash && !installId) {
    throw createValidationError(
      'At least one of siteUrl, siteHash, or installId is required',
      null,
      { required: ['siteUrl', 'siteHash', 'installId'] }
    );
  }

  if (siteUrl && !validateDomain(siteUrl)) {
    throw createValidationError('Invalid site URL format', 'siteUrl');
  }

  return true;
}

module.exports = {
  validateLicenseActivationInput,
  validateAutoAttachInput
};

