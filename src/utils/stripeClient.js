/**
 * Stripe Client Abstraction
 * Single gateway for all Stripe API calls
 * Similar to resendClient - allows easy mocking in tests
 */

const Stripe = require('stripe');

let stripeInstance = null;

/**
 * Initialize Stripe client (lazy initialization)
 * @returns {Stripe} Stripe client instance
 */
function initStripe() {
  if (!stripeInstance) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      console.error('[Stripe Client] STRIPE_SECRET_KEY not configured');
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

