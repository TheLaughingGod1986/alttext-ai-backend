/**
 * Validation Layer
 * Centralized input validation with consistent error objects
 */

const {
  validateEmail,
  validatePassword,
  validateDomain,
  sanitizeInput
} = require('./validators');

/**
 * Create standardized validation error object
 */
function createValidationError(message, field = null, details = null) {
  return {
    code: 'VALIDATION_ERROR',
    message,
    field,
    details
  };
}

/**
 * Validate email with standardized error
 */
function validateEmailInput(email, fieldName = 'email') {
  if (!validateEmail(email)) {
    throw createValidationError('Invalid email format', fieldName);
  }
  return true;
}

/**
 * Validate password with standardized error
 */
function validatePasswordInput(password, options = {}) {
  const result = validatePassword(password, options);
  if (!result.valid) {
    throw createValidationError(
      result.errors.join(', '),
      'password',
      { errors: result.errors }
    );
  }
  return true;
}

/**
 * Validate domain with standardized error
 */
function validateDomainInput(domain, fieldName = 'domain') {
  if (!validateDomain(domain)) {
    throw createValidationError('Invalid domain format', fieldName);
  }
  return true;
}

// Route-specific validators
const authValidation = require('./auth');
const licenseValidation = require('./license');
const billingValidation = require('./billing');
const generateValidation = require('./generate');

module.exports = {
  // Validators
  validateEmail,
  validatePassword,
  validateDomain,
  sanitizeInput,
  // Validation helpers with standardized errors
  validateEmailInput,
  validatePasswordInput,
  validateDomainInput,
  createValidationError,
  // Route-specific validators
  auth: authValidation,
  license: licenseValidation,
  billing: billingValidation,
  generate: generateValidation
};

