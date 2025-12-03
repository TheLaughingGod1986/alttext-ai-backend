/**
 * Billing Route Validation
 */

const { createValidationError } = require('./index');
const { getEnv } = require('../../config/loadEnv');

/**
 * Validate checkout session input
 */
function validateCheckoutInput(data) {
  const { priceId, price_id, service = 'alttext-ai' } = data;
  const errors = [];

  const actualPriceId = price_id || priceId;

  if (!actualPriceId || typeof actualPriceId !== 'string') {
    errors.push({ field: 'priceId', message: 'Price ID is required' });
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
 * Validate price ID against service-specific valid prices
 */
function validatePriceId(priceId, service = 'alttext-ai') {
  const validPrices = {
    'alttext-ai': [
      getEnv('ALTTEXT_AI_STRIPE_PRICE_PRO'),
      getEnv('ALTTEXT_AI_STRIPE_PRICE_AGENCY'),
      getEnv('ALTTEXT_AI_STRIPE_PRICE_CREDITS')
    ].filter(Boolean),
    'seo-ai-meta': [
      getEnv('SEO_AI_META_STRIPE_PRICE_PRO'),
      getEnv('SEO_AI_META_STRIPE_PRICE_AGENCY')
    ].filter(Boolean)
  };

  const servicePrices = validPrices[service] || validPrices['alttext-ai'];

  if (!servicePrices.includes(priceId)) {
    throw createValidationError(
      `Invalid price ID for service ${service}`,
      'priceId',
      { validPrices: servicePrices }
    );
  }

  return true;
}

module.exports = {
  validateCheckoutInput,
  validatePriceId
};

