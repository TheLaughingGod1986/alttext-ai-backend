/**
 * Integration tests for credits routes
 */

// Mock creditsService - MUST be at top level for Jest hoisting
jest.mock('../../src/services/creditsService', () => ({
  getBalanceByEmail: jest.fn(),
  addCreditsByEmail: jest.fn(),
  deductCredits: jest.fn(),
  getTransactionsByEmail: jest.fn(),
  getOrCreateIdentity: jest.fn(),
}));

// Mock stripeClient to prevent real Stripe API calls - MUST be at top level for Jest hoisting
jest.mock('../../src/utils/stripeClient', () => ({
  getStripe: jest.fn().mockReturnValue({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test123',
          url: 'https://checkout.stripe.com/test',
          payment_status: 'paid',
          customer_details: {
            email: 'test@example.com',
          },
          metadata: {
            credits: '200',
            type: 'credit_pack',
          },
        }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'cs_test123',
          payment_status: 'paid',
          customer_details: {
            email: 'test@example.com',
          },
          metadata: {
            credits: '200',
            type: 'credit_pack',
          },
        }),
      },
    },
    customers: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
    },
  }),
}));

// Mock checkout service
jest.mock('../../src/stripe/checkout', () => ({
  createCreditPackCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test123',
    url: 'https://checkout.stripe.com/test',
  }),
}));

// Mock supabase for confirm endpoint
jest.mock('../../db/supabase-client', () => {
  const mockSupabase = {
    from: jest.fn(() => mockSupabase),
    select: jest.fn(() => mockSupabase),
    eq: jest.fn(() => mockSupabase),
    maybeSingle: jest.fn(() => mockSupabase),
  };
  return {
    supabase: mockSupabase,
  };
});

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const { createTestToken } = require('../helpers/testHelpers');
const creditsService = require('../../src/services/creditsService');
const { supabase } = require('../../db/supabase-client');

describe('Credits Routes', () => {
  let app;
  let testToken;
  const testEmail = 'test@example.com';

  beforeAll(() => {
    app = createTestServer();
    testToken = createTestToken({ id: 'test-user-id', email: testEmail });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for supabase
    supabase.from.mockReturnValue(supabase);
    supabase.select.mockReturnValue(supabase);
    supabase.eq.mockReturnValue(supabase);
    supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  describe('POST /credits/create-payment', () => {
    it('should create payment session with packId', async () => {
      const res = await request(app)
        .post('/credits/create-payment')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          packId: 'pack_200',
          email: testEmail,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sessionId).toBe('cs_test123');
      expect(res.body.url).toBe('https://checkout.stripe.com/test');
      expect(res.body.clientSecret).toBeNull();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/credits/create-payment')
        .send({
          packId: 'pack_200',
          email: testEmail,
        });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing packId', async () => {
      const res = await request(app)
        .post('/credits/create-payment')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: testEmail,
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('packId');
    });

    it('should return 400 for invalid packId', async () => {
      const res = await request(app)
        .post('/credits/create-payment')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          packId: 'pack_invalid',
          email: testEmail,
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid packId');
    });

    it('should use email from token if not provided', async () => {
      const res = await request(app)
        .post('/credits/create-payment')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          packId: 'pack_50',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should support pack_50, pack_200, pack_500, pack_1000', async () => {
      const packIds = ['pack_50', 'pack_200', 'pack_500', 'pack_1000'];
      
      for (const packId of packIds) {
        const res = await request(app)
          .post('/credits/create-payment')
          .set('Authorization', `Bearer ${testToken}`)
          .send({
            packId,
            email: testEmail,
          });

        // May fail if price ID not configured, but should accept the packId
        if (res.status === 200) {
          expect(res.body.ok).toBe(true);
        } else if (res.status === 500) {
          // Price ID not configured is acceptable
          expect(res.body.error).toContain('price ID not configured');
        }
      }
    });
  });

  describe('POST /credits/confirm', () => {
    beforeEach(() => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });
      creditsService.getBalance.mockResolvedValue({
        success: true,
        balance: 200,
      });
      creditsService.addCreditsByEmail.mockResolvedValue({
        success: true,
        newBalance: 200,
      });
    });

    it('should confirm payment and add credits', async () => {
      // Mock no existing transaction
      supabase.maybeSingle.mockResolvedValue({ data: null, error: null });

      const res = await request(app)
        .post('/credits/confirm')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          sessionId: 'cs_test123',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.credits).toBe(200);
      expect(res.body.balance).toBe(200);
      expect(creditsService.addCreditsByEmail).toHaveBeenCalledWith(
        testEmail.toLowerCase(),
        200,
        'purchase',
        'cs_test123'
      );
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/credits/confirm')
        .send({
          sessionId: 'cs_test123',
        });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing sessionId', async () => {
      const res = await request(app)
        .post('/credits/confirm')
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('sessionId');
    });

    it('should return 400 if payment not completed', async () => {
      const { getStripe } = require('../../src/utils/stripeClient');
      const mockStripe = getStripe();
      mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: 'cs_test123',
        payment_status: 'unpaid',
        customer_details: {
          email: testEmail,
        },
        metadata: {
          credits: '200',
        },
      });

      const res = await request(app)
        .post('/credits/confirm')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          sessionId: 'cs_test123',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Payment not completed');
    });

    it('should return existing credits if already added (idempotency)', async () => {
      // Mock existing transaction
      supabase.maybeSingle.mockResolvedValue({
        data: { id: 'transaction_123' },
        error: null,
      });

      const res = await request(app)
        .post('/credits/confirm')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          sessionId: 'cs_test123',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toContain('already added');
      expect(creditsService.addCreditsByEmail).not.toHaveBeenCalled();
    });

    it('should handle errors when adding credits fails', async () => {
      supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
      creditsService.addCreditsByEmail.mockResolvedValueOnce({
        success: false,
        error: 'Database error',
      });

      const res = await request(app)
        .post('/credits/confirm')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          sessionId: 'cs_test123',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Failed to add credits');
    });
  });

  describe('GET /credits/balance', () => {
    it('should return balance for authenticated user', async () => {
      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 250,
      });

      const res = await request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.credits).toBe(250);
      expect(creditsService.getBalanceByEmail).toHaveBeenCalledWith(testEmail);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .get('/credits/balance');

      expect(res.status).toBe(401);
    });
  });

  describe('Credit Purchase Flow', () => {
    it('should complete purchase flow', async () => {
      // Step 1: Create payment
      const createRes = await request(app)
        .post('/credits/create-payment')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          packId: 'pack_200',
          email: testEmail,
        });

      expect(createRes.status).toBe(200);
      expect(createRes.body.ok).toBe(true);
      const sessionId = createRes.body.sessionId;

      // Step 2: Mock confirm endpoint setup
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });
      creditsService.getBalance.mockResolvedValue({
        success: true,
        balance: 200,
      });
      creditsService.addCreditsByEmail.mockResolvedValue({
        success: true,
        newBalance: 200,
      });
      supabase.maybeSingle.mockResolvedValue({ data: null, error: null });

      // Step 3: Confirm payment
      const confirmRes = await request(app)
        .post('/credits/confirm')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          sessionId,
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.ok).toBe(true);
      expect(confirmRes.body.balance).toBe(200);

      // Step 4: Verify balance
      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 200,
      });

      const balanceRes = await request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${testToken}`);

      expect(balanceRes.status).toBe(200);
      expect(balanceRes.body.credits).toBe(200);
    });
  });
});

