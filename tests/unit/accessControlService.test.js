/**
 * Unit tests for accessControlService
 */

const accessControlService = require('../../src/services/accessControlService');
const billingService = require('../../src/services/billingService');
const creditsService = require('../../src/services/creditsService');
const errorCodes = require('../../src/constants/errorCodes');

// Mock dependencies
jest.mock('../../src/services/billingService');
jest.mock('../../src/services/creditsService');

describe('accessControlService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateAccess', () => {
    it('should allow access for active subscription', async () => {
      // Mock identity creation
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });

      // Mock subscription status (active pro plan)
      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'pro',
        status: 'active',
        renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        canceledAt: null,
        trialEndsAt: null,
        raw: {},
      });

      // Mock credits (0 balance, but subscription is active)
      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(true);
    });

    it('should deny access for inactive subscription', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'pro',
        status: 'cancelled',
        renewsAt: null,
        canceledAt: new Date().toISOString(),
        trialEndsAt: null,
        raw: {},
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(errorCodes.NO_ACCESS);
      expect(result.reason).toBe(errorCodes.REASONS.SUBSCRIPTION_INACTIVE);
    });

    it('should deny access for free plan with no credits', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'free',
        status: 'inactive',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: null,
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(errorCodes.NO_ACCESS);
      expect(result.reason).toBe(errorCodes.REASONS.NO_SUBSCRIPTION);
    });

    it('should allow access when credits > 0 (override)', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });

      // Even with inactive subscription
      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'free',
        status: 'inactive',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: null,
      });

      // But user has credits
      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 10,
      });

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(true);
    });

    it('should allow access for active subscription even with 0 credits', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'pro',
        status: 'active',
        renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        canceledAt: null,
        trialEndsAt: null,
        raw: {},
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(true);
    });

    it('should deny access when identity creation fails', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: false,
        error: 'Failed to create identity',
      });

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(errorCodes.NO_ACCESS);
      expect(result.reason).toBe(errorCodes.REASONS.NO_SUBSCRIPTION);
    });

    it('should deny access on errors (fail-safe)', async () => {
      creditsService.getOrCreateIdentity.mockRejectedValue(new Error('Database error'));

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(errorCodes.NO_ACCESS);
      expect(result.reason).toBe(errorCodes.REASONS.SUBSCRIPTION_INACTIVE);
    });

    it('should deny access when email is missing', async () => {
      const result = await accessControlService.evaluateAccess(null);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(errorCodes.NO_ACCESS);
      expect(result.reason).toBe(errorCodes.REASONS.NO_IDENTITY);
    });

    it('should allow access for past_due subscription if credits > 0', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'identity_123',
      });

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'pro',
        status: 'past_due',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: {},
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 5,
      });

      const result = await accessControlService.evaluateAccess('test@example.com');

      expect(result.allowed).toBe(true);
    });
  });
});

