/**
 * Unit tests for billingService
 */

const billingService = require('../../src/services/billingService');
const { supabase } = require('../../db/supabase-client');

// Mock dependencies
jest.mock('../../db/supabase-client');
jest.mock('../../src/utils/stripeClient');
jest.mock('../../services/emailService');

const { getStripe } = require('../../src/utils/stripeClient');
const emailService = require('../../services/emailService');

describe('billingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrGetCustomer', () => {
    it('should return existing customer if found', async () => {
      const mockCustomer = { id: 'cus_123', email: 'test@example.com' };
      const mockStripe = {
        customers: {
          list: jest.fn().mockResolvedValue({ data: [mockCustomer] }),
        },
      };
      getStripe.mockReturnValue(mockStripe);

      const result = await billingService.createOrGetCustomer('test@example.com');

      expect(result.success).toBe(true);
      expect(result.data.customerId).toBe('cus_123');
      expect(mockStripe.customers.list).toHaveBeenCalledWith({
        email: 'test@example.com',
        limit: 1,
      });
    });

    it('should create new customer if not found', async () => {
      const mockCustomer = { id: 'cus_new', email: 'new@example.com' };
      const mockStripe = {
        customers: {
          list: jest.fn().mockResolvedValue({ data: [] }),
          create: jest.fn().mockResolvedValue(mockCustomer),
        },
      };
      getStripe.mockReturnValue(mockStripe);

      const result = await billingService.createOrGetCustomer('new@example.com');

      expect(result.success).toBe(true);
      expect(result.data.customerId).toBe('cus_new');
      expect(mockStripe.customers.create).toHaveBeenCalled();
    });

    it('should return error if Stripe not configured', async () => {
      getStripe.mockReturnValue(null);

      const result = await billingService.createOrGetCustomer('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Stripe not configured');
    });
  });

  describe('createSubscription', () => {
    it('should create subscription successfully', async () => {
      const mockCustomer = { id: 'cus_123' };
      const mockSubscription = {
        id: 'sub_123',
        status: 'active',
        items: { data: [{ quantity: 1 }] },
        current_period_end: Math.floor(Date.now() / 1000) + 86400,
      };
      const mockStripe = {
        customers: {
          list: jest.fn().mockResolvedValue({ data: [mockCustomer] }),
        },
        subscriptions: {
          create: jest.fn().mockResolvedValue(mockSubscription),
        },
      };
      getStripe.mockReturnValue(mockStripe);

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'sub_db_123',
            user_email: 'test@example.com',
            plugin_slug: 'alttext-ai',
            plan: 'pro',
            status: 'active',
          },
        }),
      });

      const result = await billingService.createSubscription({
        email: 'test@example.com',
        plugin: 'alttext-ai',
        priceId: 'price_123',
      });

      expect(result.success).toBe(true);
      expect(result.data.subscription).toBeDefined();
      expect(result.data.isNew).toBe(true);
    });

    it('should return existing subscription if active', async () => {
      const existingSubscription = {
        id: 'sub_existing',
        user_email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        status: 'active',
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: existingSubscription,
          error: null,
        }),
      });

      const result = await billingService.createSubscription({
        email: 'test@example.com',
        plugin: 'alttext-ai',
        priceId: 'price_123',
      });

      expect(result.success).toBe(true);
      expect(result.data.isNew).toBe(false);
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return subscriptions for user', async () => {
      const mockSubscriptions = [
        { id: 'sub_1', user_email: 'test@example.com', plugin_slug: 'alttext-ai' },
        { id: 'sub_2', user_email: 'test@example.com', plugin_slug: 'seo-ai-meta' },
      ];

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null,
        }),
      });

      const result = await billingService.getUserSubscriptions('test@example.com');

      expect(result.success).toBe(true);
      expect(result.subscriptions).toEqual(mockSubscriptions);
    });
  });

  describe('getSubscriptionByPlugin', () => {
    it('should return subscription for plugin', async () => {
      const mockSubscription = {
        id: 'sub_1',
        user_email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        status: 'active',
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSubscription,
          error: null,
        }),
      });

      const result = await billingService.getSubscriptionByPlugin('test@example.com', 'alttext-ai');

      expect(result.success).toBe(true);
      expect(result.subscription).toEqual(mockSubscription);
    });

    it('should return null if no subscription found', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      const result = await billingService.getSubscriptionByPlugin('test@example.com', 'alttext-ai');

      expect(result.success).toBe(true);
      expect(result.subscription).toBeNull();
    });
  });
});

