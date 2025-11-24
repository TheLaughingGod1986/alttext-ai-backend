/**
 * Generate Route Validation
 */

const { createValidationError } = require('./index');

/**
 * Validate generate request input
 */
function validateGenerateInput(data) {
  const { image_data, context, service = 'alttext-ai', type } = data;
  const errors = [];

  // For meta generation, context is required instead of image_data
  if (type === 'meta' || (service === 'seo-ai-meta' && !image_data)) {
    if (!context || typeof context !== 'string' || context.trim() === '') {
      errors.push({ field: 'context', message: 'Context is required for meta generation' });
    }
  } else {
    // For alt text generation, image_data.url is required
    if (!image_data || !image_data.url || typeof image_data.url !== 'string' || image_data.url.trim() === '') {
      errors.push({ field: 'image_data.url', message: 'Image URL is required for alt text generation' });
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

module.exports = {
  validateGenerateInput
};

