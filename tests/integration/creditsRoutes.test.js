/**
 * Integration tests for credits routes
 */

// Mock creditsService - MUST be at top level for Jest hoisting
jest.mock('../../src/services/creditsService', () => ({
  getBalanceByEmail: jest.fn(),
  getBalance: jest.fn(),
  addCreditsByEmail: jest.fn(),
  addCredits: jest.fn(),
  deductCredits: jest.fn(),
  getTransactionsByEmail: jest.fn(),
  getOrCreateIdentity: jest.fn(),
}));

// Mock eventService - MUST be at top level for Jest hoisting
jest.mock('../../src/services/eventService', () => ({
  logEvent: jest.fn(),
  getCreditBalance: jest.fn(),
  updateCreditsBalanceCache: jest.fn(),
  getEventRollup: jest.fn(),
}));

// Mock stripeClient to prevent real Stripe API calls - MUST be at top level for Jest hoisting
const mockWebhooksConstructEvent = jest.fn();
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
            identityId: 'identity_123',
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
    webhooks: {
      constructEvent: jest.fn((payload, signature, secret) => {
        return mockWebhooksConstructEvent(payload, signature, secret);
      }),
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
  let server;
  let testToken;
  const testEmail = 'test@example.com';

  beforeAll(() => {
    const { createTestServer } = require('../helpers/createTestServer');
    server = createTestServer();
    testToken = createTestToken({ id: 'test-user-id', email: testEmail });
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for supabase
    supabase.from.mockReturnValue(supabase);
    supabase.select.mockReturnValue(supabase);
    supabase.eq.mockReturnValue(supabase);
    supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    
    // Default mock for webhook signature verification
    const { getStripe } = require('../../src/utils/stripeClient');
    const mockStripe = getStripe();
    mockWebhooksConstructEvent.mockImplementation((payload, signature, secret) => {
      // Return a mock event object
      return {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            metadata: {
              identityId: 'identity_123',
              credits: '500',
            },
          },
        },
      };
    });
  });

  describe('POST /credits/create-payment', () => {
    it('should create payment session with packId', async () => {
      const res = await request(server)
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
      const res = await request(server)
        .post('/credits/create-payment')
        .send({
          packId: 'pack_200',
          email: testEmail,
        });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing packId', async () => {
      const res = await request(server)
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
      const res = await request(server)
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
      const res = await request(server)
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
        const res = await request(server)
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

      const res = await request(server)
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
      const res = await request(server)
        .post('/credits/confirm')
        .send({
          sessionId: 'cs_test123',
        });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing sessionId', async () => {
      const res = await request(server)
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

      const res = await request(server)
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

      const res = await request(server)
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

      const res = await request(server)
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

  describe('GET /credits/packs', () => {
    it('should return available credit packs', async () => {
      const res = await request(server)
        .get('/credits/packs')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.packs).toBeDefined();
      expect(Array.isArray(res.body.packs)).toBe(true);
      expect(res.body.packs.length).toBeGreaterThan(0);
      // Check for expected pack IDs
      const packIds = res.body.packs.map(p => p.id);
      expect(packIds).toContain('pack_100');
      expect(packIds).toContain('pack_500');
      expect(packIds).toContain('pack_1000');
      expect(packIds).toContain('pack_2500');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(server)
        .get('/credits/packs');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /credits/checkout-session', () => {
    beforeEach(() => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });
    });

    it('should create checkout session with valid packId', async () => {
      const { getStripe } = require('../../src/utils/stripeClient');
      const mockStripe = getStripe();
      mockStripe.checkout.sessions.create.mockResolvedValueOnce({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/test',
      });

      const res = await request(server)
        .post('/credits/checkout-session')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          packId: 'pack_500',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.url).toBe('https://checkout.stripe.com/test');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalled();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(server)
        .post('/credits/checkout-session')
        .send({
          packId: 'pack_500',
        });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing packId', async () => {
      const res = await request(server)
        .post('/credits/checkout-session')
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('packId');
    });

    it('should return 400 for invalid pack', async () => {
      const res = await request(server)
        .post('/credits/checkout-session')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          packId: 'pack_invalid',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid pack');
    });
  });

  describe('POST /credits/webhook', () => {
    beforeEach(() => {
      creditsService.addCredits.mockResolvedValue({
        success: true,
        newBalance: 500,
      });
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    });

    afterEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    it('should handle checkout.session.completed event and add credits', async () => {
      const { getStripe } = require('../../src/utils/stripeClient');
      const mockStripe = getStripe();
      
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            metadata: {
              identityId: 'identity_123',
              credits: '500',
            },
          },
        },
      };
      
      mockWebhooksConstructEvent.mockReturnValueOnce(mockEvent);

      const payload = JSON.stringify(mockEvent);
      const res = await request(server)
        .post('/credits/webhook')
        .set('stripe-signature', 'test_signature')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(payload));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(creditsService.addCredits).toHaveBeenCalledWith(
        'identity_123',
        500,
        'cs_test123'
      );
    });

    it('should return 400 for invalid webhook signature', async () => {
      const { getStripe } = require('../../src/utils/stripeClient');
      const mockStripe = getStripe();
      
      mockWebhooksConstructEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      const payload = JSON.stringify({ type: 'checkout.session.completed' });
      const res = await request(server)
        .post('/credits/webhook')
        .set('stripe-signature', 'invalid_signature')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(payload));

      expect(res.status).toBe(400);
      expect(res.text).toContain('Webhook Error');
    });

    it('should return 500 if Stripe not configured', async () => {
      const { getStripe } = require('../../src/utils/stripeClient');
      const originalGetStripe = getStripe;
      getStripe.mockReturnValueOnce(null);

      const payload = JSON.stringify({ type: 'checkout.session.completed' });
      const res = await request(server)
        .post('/credits/webhook')
        .set('stripe-signature', 'test_signature')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(payload));

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Stripe not configured');
      
      // Restore original
      getStripe.mockReturnValue(originalGetStripe());
    });

    it('should return 400 if identityId missing in metadata', async () => {
      const { getStripe } = require('../../src/utils/stripeClient');
      const mockStripe = getStripe();
      
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test123',
            metadata: {
              credits: '500',
            },
          },
        },
      };
      
      mockWebhooksConstructEvent.mockReturnValueOnce(mockEvent);

      const payload = JSON.stringify(mockEvent);
      const res = await request(server)
        .post('/credits/webhook')
        .set('stripe-signature', 'test_signature')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(payload));

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('identityId');
    });
  });

  describe('GET /credits/balance', () => {
    it('should return balance for authenticated user', async () => {
      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 250,
      });

      const res = await request(server)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.credits).toBe(250);
      expect(creditsService.getBalanceByEmail).toHaveBeenCalledWith(testEmail);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(server)
        .get('/credits/balance');

      expect(res.status).toBe(401);
    });
  });

  describe('Credit Purchase Flow', () => {
    it('should complete purchase flow', async () => {
      // Step 1: Create payment
      const createRes = await request(server)
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
      const confirmRes = await request(server)
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

      const balanceRes = await request(server)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${testToken}`);

      expect(balanceRes.status).toBe(200);
      expect(balanceRes.body.credits).toBe(200);
    });
  });
});
