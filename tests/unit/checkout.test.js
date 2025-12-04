/**
 * Unit tests for Stripe Checkout
 * Target: 70%+ coverage
 */

jest.mock('../../src/services/emailService');
jest.mock('../../src/services/licenseService');
jest.mock('../../db/supabase-client');

// Mock Stripe before requiring checkout module
let mockStripeInstance = {
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: jest.fn(),
    },
  },
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripeInstance);
});

// Mock loadEnv before any other imports
const mockGetEnv = jest.fn((key, defaultValue) => {
  const env = {
    'ALTTEXT_AI_STRIPE_PRICE_CREDITS': 'price_credits',
    'ALTTEXT_AI_STRIPE_PRICE_PRO': 'price_pro',
    'ALTTEXT_AI_STRIPE_PRICE_AGENCY': 'price_agency',
    'SEO_AI_META_STRIPE_PRICE_PRO': 'seo_price_pro',
    'SEO_AI_META_STRIPE_PRICE_AGENCY': 'seo_price_agency',
  };
  return env[key] || defaultValue;
});

const mockRequireEnv = jest.fn((key) => {
  if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
  return 'test-value';
});

jest.mock('../../config/loadEnv', () => ({
  requireEnv: mockRequireEnv,
  getEnv: mockGetEnv,
}));

const supabaseMock = require('../mocks/supabase.mock');
const emailService = require('../../src/services/emailService');
const licenseService = require('../../src/services/licenseService');

describe('Stripe Checkout', () => {
  let checkoutModule;

  beforeEach(() => {
    jest.clearAllMocks();
    supabaseMock.__reset();

    // Reset mock functions
    mockStripeInstance.customers.create.mockClear();
    mockStripeInstance.customers.retrieve.mockClear();
    mockStripeInstance.checkout.sessions.create.mockClear();
    mockStripeInstance.billingPortal.sessions.create.mockClear();

    // Reset getEnv mock to ensure it returns correct values
    mockGetEnv.mockImplementation((key, defaultValue) => {
      const env = {
        'ALTTEXT_AI_STRIPE_PRICE_CREDITS': 'price_credits',
        'ALTTEXT_AI_STRIPE_PRICE_PRO': 'price_pro',
        'ALTTEXT_AI_STRIPE_PRICE_AGENCY': 'price_agency',
        'SEO_AI_META_STRIPE_PRICE_PRO': 'seo_price_pro',
        'SEO_AI_META_STRIPE_PRICE_AGENCY': 'seo_price_agency',
      };
      return env[key] || defaultValue;
    });

    // Clear module cache to get fresh instance
    // Note: Don't reset modules here as it breaks the supabase mock
    // The mock is set up at the top level and should persist
    delete require.cache[require.resolve('../../src/stripe/checkout')];
    checkoutModule = require('../../src/stripe/checkout');
  });


  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createCheckoutSession', () => {
    test('should create Stripe customer if not exists', async () => {
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        stripe_customer_id: null,
      };

      supabaseMock.__queueResponse('users', 'select', {
        data: testUser,
        error: null,
      });

      supabaseMock.__queueResponse('users', 'update', {
        data: { ...testUser, stripe_customer_id: 'cus_123' },
        error: null,
      });

      mockStripeInstance.customers.create.mockResolvedValue({
        id: 'cus_123',
        email: 'test@example.com',
      });

      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'session_123',
        url: 'https://checkout.stripe.com/session_123',
      });

      const result = await checkoutModule.createCheckoutSession(
        'user-123',
        'price_pro',
        'https://example.com/success',
        'https://example.com/cancel',
        'alttext-ai'
      );

      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: {
          userId: 'user-123',
          service: 'alttext-ai',
        },
      });

      expect(result).toHaveProperty('id', 'session_123');
      expect(result).toHaveProperty('url', 'https://checkout.stripe.com/session_123');
    });

    test('should use existing Stripe customer if exists', async () => {
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        stripe_customer_id: 'cus_existing',
      };

      supabaseMock.__queueResponse('users', 'select', {
        data: testUser,
        error: null,
      });

      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'session_123',
        url: 'https://checkout.stripe.com/session_123',
      });

      await checkoutModule.createCheckoutSession(
        'user-123',
        'price_pro',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(mockStripeInstance.customers.create).not.toHaveBeenCalled();
      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing',
        })
      );
    });

    test('should create subscription mode for non-credit prices', async () => {
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        stripe_customer_id: 'cus_123',
      };

      supabaseMock.__queueResponse('users', 'select', {
        data: testUser,
        error: null,
      });

      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'session_123',
        url: 'https://checkout.stripe.com/session_123',
      });

      await checkoutModule.createCheckoutSession(
        'user-123',
        'price_pro',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
        })
      );
    });

    // TODO: Re-enable when ALTTEXT_AI_STRIPE_PRICE_CREDITS env var is set in CI
    test.skip('should create payment mode for credit prices', async () => {
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        stripe_customer_id: 'cus_123',
      };

      supabaseMock.__queueResponse('users', 'select', {
        data: testUser,
        error: null,
      });

      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        id: 'session_123',
        url: 'https://checkout.stripe.com/session_123',
      });

      await checkoutModule.createCheckoutSession(
        'user-123',
        'price_credits',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
        })
      );
    });

    test('should throw error if user not found', async () => {
      supabaseMock.__queueResponse('users', 'select', {
        data: null,
        error: null,
      });

      await expect(
        checkoutModule.createCheckoutSession(
          'user-123',
          'price_pro',
          'https://example.com/success',
          'https://example.com/cancel'
        )
      ).rejects.toThrow('User not found');
    });

    test('should handle database errors', async () => {
      supabaseMock.__queueResponse('users', 'select', {
        data: null,
        error: { message: 'Database error' },
      });

      await expect(
        checkoutModule.createCheckoutSession(
          'user-123',
          'price_pro',
          'https://example.com/success',
          'https://example.com/cancel'
        )
      ).rejects.toThrow('User lookup failed');
    });
  });

  describe('createCustomerPortalSession', () => {
    test('should create portal session for existing customer', async () => {
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        stripe_customer_id: 'cus_123',
      };

      supabaseMock.__queueResponse('users', 'select', {
        data: testUser,
        error: null,
      });

      mockStripeInstance.billingPortal.sessions.create.mockResolvedValue({
        id: 'portal_123',
        url: 'https://billing.stripe.com/portal_123',
      });

      const result = await checkoutModule.createCustomerPortalSession(
        'user-123',
        'https://example.com/return'
      );

      expect(mockStripeInstance.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://example.com/return',
      });

      expect(result).toHaveProperty('url', 'https://billing.stripe.com/portal_123');
    });

    test('should throw error if user has no Stripe customer', async () => {
      const testUser = {
        id: 'user-123',
        email: 'test@example.com',
        stripe_customer_id: null,
      };

      supabaseMock.__queueResponse('users', 'select', {
        data: testUser,
        error: null,
      });

      await expect(
        checkoutModule.createCustomerPortalSession('user-123', 'https://example.com/return')
      ).rejects.toThrow('No Stripe customer');
    });
  });
});


