/**
 * Stripe Client Abstraction
 * Single gateway for all Stripe API calls
 * Similar to resendClient - allows easy mocking in tests
 */

const Stripe = require('stripe');
const { getEnv } = require('../../config/loadEnv');
const logger = require('../utils/logger');

let stripeInstance = null;
let cachedApiKey = null;

/**
 * Initialize Stripe client (lazy initialization)
 * @returns {Stripe|null} Stripe client instance or null if not configured
 */
function initStripe() {
  const apiKey = getEnv('STRIPE_SECRET_KEY');
  
  // If API key changed or instance doesn't exist, recreate
  if (!stripeInstance || cachedApiKey !== apiKey) {
    stripeInstance = null;
    cachedApiKey = apiKey;
    if (!apiKey) {
      logger.error('[Stripe Client] STRIPE_SECRET_KEY not configured');
      return null;
    }
    stripeInstance = new Stripe(apiKey, {
      apiVersion: '2023-10-16',
    });
  }
  return stripeInstance;
}

/**
 * Get Stripe client instance
 * @returns {Stripe|null} Stripe client or null if not configured
 */
function getStripe() {
  return initStripe();
}

// Export getter function instead of calling at module load time
// This allows lazy initialization and proper mocking in tests
module.exports = {
  getStripe,
  initStripe,
};

