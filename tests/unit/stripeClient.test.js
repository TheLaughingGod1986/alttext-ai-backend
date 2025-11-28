/**
 * Unit tests for stripeClient
 */

describe('stripeClient', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.STRIPE_SECRET_KEY;
    jest.resetModules();
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalEnv;
  });

  it('should initialize Stripe with API key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    const { getStripe } = require('../../src/utils/stripeClient');

    const stripe = getStripe();
    expect(stripe).toBeDefined();
  });

  it('should return null if API key not configured', () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { getStripe } = require('../../src/utils/stripeClient');

    const stripe = getStripe();
    expect(stripe).toBeNull();
  });
});

