/**
 * Unit tests for creditsService
 */

const creditsService = require('../../src/services/creditsService');
const { supabase } = require('../../db/supabase-client');

// Mock dependencies
jest.mock('../../db/supabase-client');
const eventService = require('../../src/services/eventService');
jest.mock('../../src/services/eventService', () => ({
  logEvent: jest.fn(),
  getCreditBalance: jest.fn(),
  updateCreditsBalanceCache: jest.fn(),
}));

describe('creditsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalanceByEmail', () => {
    it('should return balance for existing identity', async () => {
      const mockIdentity = { id: 'identity_123', credits_balance: 250 };
      
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
            single: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      // Mock eventService.getCreditBalance
      eventService.getCreditBalance.mockResolvedValue({ 
        success: true, 
        balance: 250 
      });

      const result = await creditsService.getBalanceByEmail('test@example.com');

      expect(result.success).toBe(true);
      expect(result.balance).toBe(250);
    });

    it('should return 0 balance for new identity', async () => {
      const mockIdentity = { id: 'identity_new', credits_balance: 0 };
      
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn()
              .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
              .mockResolvedValueOnce({ data: mockIdentity, error: null }),
            insert: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      // Mock eventService.getCreditBalance for new identity
      eventService.getCreditBalance.mockResolvedValue({ 
        success: true, 
        balance: 0 
      });

      const result = await creditsService.getBalanceByEmail('new@example.com');

      expect(result.success).toBe(true);
      expect(result.balance).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ 
              data: null, 
              error: { message: 'Database error' } 
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      const result = await creditsService.getBalanceByEmail('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('addCreditsByEmail', () => {
    it('should add credits to existing identity', async () => {
      const mockIdentity = { id: 'identity_123', credits_balance: 100 };
      const updatedIdentity = { id: 'identity_123', credits_balance: 250 };
      
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
            single: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
            update: jest.fn().mockReturnThis(),
          };
        }
        if (table === 'credits_transactions') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ 
              data: { id: 'transaction_123' }, 
              error: null 
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      // Mock eventService
      eventService.logEvent.mockResolvedValue({ 
        success: true, 
        eventId: 'event_123' 
      });
      eventService.getCreditBalance.mockResolvedValue({ 
        success: true, 
        balance: 250 
      });

      const result = await creditsService.addCreditsByEmail('test@example.com', 150, 'purchase', 'session_123');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(250);
    });

    it('should handle invalid amount', async () => {
      const result = await creditsService.addCreditsByEmail('test@example.com', -10);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits successfully', async () => {
      const mockIdentity = { id: 'identity_123', credits_balance: 250 };
      
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
            single: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      // Mock eventService
      eventService.getCreditBalance
        .mockResolvedValueOnce({ success: true, balance: 250 }) // Initial balance check
        .mockResolvedValueOnce({ success: true, balance: 200 }); // Updated balance after spend
      eventService.logEvent.mockResolvedValue({ 
        success: true, 
        eventId: 'event_123' 
      });

      const result = await creditsService.deductCredits('test@example.com', 50);

      expect(result.ok).toBe(true);
    });

    it('should return INSUFFICIENT_CREDITS when balance is too low', async () => {
      const mockIdentity = { id: 'identity_123', credits_balance: 10 };
      
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
            single: jest.fn().mockResolvedValue({ data: mockIdentity, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      // Mock eventService to return low balance
      eventService.getCreditBalance.mockResolvedValue({ 
        success: true, 
        balance: 10 
      });

      const result = await creditsService.deductCredits('test@example.com', 50);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_CREDITS');
    });

    it('should handle errors gracefully', async () => {
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ 
              data: null, 
              error: { message: 'Database error' } 
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      const result = await creditsService.deductCredits('test@example.com', 10);

      expect(result.ok).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('getBalance', () => {
    it('should return balance for identity', async () => {
      // Mock eventService.getCreditBalance
      eventService.getCreditBalance.mockResolvedValue({ 
        success: true, 
        balance: 100 
      });

      const result = await creditsService.getBalance('identity_123');

      expect(result.success).toBe(true);
      expect(result.balance).toBe(100);
    });

    it('should return error for missing identity', async () => {
      // Mock eventService.getCreditBalance to fail, then fallback to Supabase
      eventService.getCreditBalance.mockResolvedValue({ 
        success: false, 
        error: 'Failed to get balance' 
      });
      
      supabase.from = jest.fn((table) => {
        if (table === 'identities') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ 
              data: null, 
              error: { code: 'PGRST116' } 
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });

      const result = await creditsService.getBalance('identity_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Identity not found');
    });
  });

  describe('addCredits', () => {
    it('should add credits and create transaction record', async () => {
      // Mock eventService to return success
      eventService.logEvent.mockResolvedValue({ 
        success: true, 
        eventId: 'event_123' 
      });
      eventService.getCreditBalance.mockResolvedValue({ 
        success: true, 
        balance: 150 
      });

      const result = await creditsService.addCredits('identity_123', 50, 'payment_intent_123');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(150);
      expect(eventService.logEvent).toHaveBeenCalledWith(
        'identity_123',
        'credit_purchase',
        50,
        expect.objectContaining({
          stripe_payment_intent_id: 'payment_intent_123',
          source: 'purchase'
        })
      );
    });

    it('should handle invalid parameters', async () => {
      const result = await creditsService.addCredits(null, 50);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid parameters');
    });
  });

  describe('spendCredits', () => {
    it('should spend credits successfully', async () => {
      // Mock eventService to return success
      eventService.getCreditBalance
        .mockResolvedValueOnce({ success: true, balance: 100 }) // Initial balance check
        .mockResolvedValueOnce({ success: true, balance: 75 }); // Updated balance after spend
      eventService.logEvent.mockResolvedValue({ 
        success: true, 
        eventId: 'event_123' 
      });

      const result = await creditsService.spendCredits('identity_123', 25);

      expect(result.success).toBe(true);
      expect(result.remainingBalance).toBe(75);
      expect(eventService.logEvent).toHaveBeenCalledWith(
        'identity_123',
        'credit_used',
        -25,
        {}
      );
    });

    it('should return INSUFFICIENT_CREDITS when balance is too low', async () => {
      // Mock eventService to return low balance
      eventService.getCreditBalance.mockResolvedValue({ 
        success: true, 
        balance: 10 
      });

      const result = await creditsService.spendCredits('identity_123', 25);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_CREDITS');
      expect(result.currentBalance).toBe(10);
      expect(result.requested).toBe(25);
      expect(eventService.logEvent).not.toHaveBeenCalled();
    });
  });
});

