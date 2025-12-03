/**
 * Validation utilities for input sanitization and validation
 */

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if valid email format
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email regex pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum password length (default: 8)
 * @param {boolean} options.requireSpecialChars - Require special characters (default: false)
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validatePassword(password, options = {}) {
  const errors = [];
  const { minLength = 8, requireSpecialChars = false } = options;

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }

  if (requireSpecialChars) {
    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>]/;
    if (!specialCharRegex.test(password)) {
      errors.push('Password must contain at least one special character');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate domain format
 * @param {string} domain - Domain to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateDomain(domain) {
  const errors = [];

  if (!domain || typeof domain !== 'string') {
    return { valid: false, errors: ['Domain is required'] };
  }

  const trimmedDomain = domain.trim();

  // Reject IP addresses
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(trimmedDomain)) {
    errors.push('IP addresses are not allowed');
  }

  // Basic domain format validation
  // Allow subdomains (e.g., subdomain.example.com)
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
  if (!domainRegex.test(trimmedDomain)) {
    errors.push('Invalid domain format');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize input to prevent XSS and SQL injection
 * @param {string} input - Input string to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.allowHtml - Allow HTML tags (default: false)
 * @returns {string} - Sanitized string
 */
function sanitizeInput(input, options = {}) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const { allowHtml = false } = options;

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Remove SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /('|(\\')|(;)|(--)|(\/\*)|(\*\/))/g
  ];

  sqlPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Always remove script tags and event handlers (security-critical, even when HTML is allowed)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove all HTML tags if HTML not allowed
  if (!allowHtml) {
    sanitized = sanitized.replace(/<[^>]+>/g, ''); // Remove all HTML tags
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

module.exports = {
  validateEmail,
  validatePassword,
  validateDomain,
  sanitizeInput
};

