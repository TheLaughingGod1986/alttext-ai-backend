/**
 * Plan Configuration
 * Defines token quotas and Stripe price IDs for each plugin and plan tier
 * This config enables:
 * - Plugin UI upgrade modals
 * - Backend quota enforcement
 * - Dashboard usage displays
 */

module.exports = {
  'alttext-ai': {
    free: { tokens: 50 },
    pro: { tokens: 1000, priceId: process.env.ALTTEXT_AI_STRIPE_PRICE_PRO },
    agency: { tokens: 10000, priceId: process.env.ALTTEXT_AI_STRIPE_PRICE_AGENCY },
  },
  'seo-ai-meta': {
    free: { tokens: 10 },
    pro: { tokens: 100, priceId: process.env.SEO_AI_META_STRIPE_PRICE_PRO },
    agency: { tokens: 1000, priceId: process.env.SEO_AI_META_STRIPE_PRICE_AGENCY },
  },
  'beepbeep-ai': {
    free: { tokens: 25 },
    pro: { tokens: 2500, priceId: process.env.BEEPBEEP_AI_STRIPE_PRICE_PRO },
    agency: { tokens: 15000, priceId: process.env.BEEPBEEP_AI_STRIPE_PRICE_AGENCY },
  },
};

