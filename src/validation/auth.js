/**
 * Authentication Route Validation
 */

const { validateEmail, validatePassword } = require('./validators');
const { createValidationError } = require('./index');

/**
 * Validate registration input
 */
function validateRegistrationInput(data) {
  const { email, password, service } = data;
  const errors = [];

  if (!email || typeof email !== 'string' || email.trim() === '') {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!validateEmail(email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  } else {
    const passwordValidation = validatePassword(password, { minLength: 8 });
    if (!passwordValidation.valid) {
      errors.push({ field: 'password', message: passwordValidation.errors.join(', ') });
    }
  }

  if (service && !['alttext-ai', 'seo-ai-meta'].includes(service)) {
    errors.push({ field: 'service', message: 'Invalid service. Must be alttext-ai or seo-ai-meta' });
  }

  if (errors.length > 0) {
    const error = createValidationError('Validation failed', null, { errors });
    error.errors = errors;
    throw error;
  }

  return true;
}

/**
 * Validate login input
 */
function validateLoginInput(data) {
  const { email, password } = data;
  const errors = [];

  if (!email || typeof email !== 'string' || email.trim() === '') {
    errors.push({ field: 'email', message: 'Email is required' });
  }

  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) {
    const error = createValidationError('Email and password are required', null, { errors });
    error.errors = errors;
    throw error;
  }

  return true;
}

module.exports = {
  validateRegistrationInput,
  validateLoginInput
};

