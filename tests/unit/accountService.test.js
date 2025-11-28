/**
 * Unit tests for accountService
 */

const accountService = require('../../src/services/accountService');

// Mock dependencies
jest.mock('../../src/services/userAccountService');
jest.mock('../../src/services/billingService');
jest.mock('../../src/services/usageService');
jest.mock('../../src/config/plans');

const userAccountService = require('../../src/services/userAccountService');
const billingService = require('../../src/services/billingService');
const usageService = require('../../src/services/usageService');
const plansConfig = require('../../src/config/plans');

describe('accountService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock plans config
    plansConfig['alttext-ai'] = {
      free: { tokens: 50 },
      pro: { tokens: 1000 },
      agency: { tokens: 10000 },
    };
    plansConfig['beepbeep-ai'] = {
      free: { tokens: 25 },
      pro: { tokens: 2500 },
      agency: { tokens: 15000 },
    };
  });

  describe('getAccountSummary', () => {
    it('should aggregate all data sources successfully', async () => {
      const mockInstallations = [
        { id: '1', plugin_slug: 'alttext-ai', site_url: 'https://example.com' },
        { id: '2', plugin_slug: 'beepbeep-ai', site_url: 'https://example2.com' },
      ];
      const mockSubscriptions = [
        { id: 'sub1', plugin_slug: 'alttext-ai', plan: 'pro', status: 'active' },
      ];
      const mockUsage = {
        monthlyImages: 450,
        dailyImages: 15,
        totalImages: 2000,
      };

      userAccountService.getUserInstallations.mockResolvedValue({
        success: true,
        installations: mockInstallations,
      });
      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: mockSubscriptions,
      });
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: mockUsage,
      });

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(true);
      expect(result.data.email).toBe('test@example.com');
      expect(result.data.installations).toEqual(mockInstallations);
      expect(result.data.subscriptions).toEqual(mockSubscriptions);
      expect(result.data.usage).toBeDefined();
      expect(result.data.plans).toBeDefined();
    });

    it('should handle missing subscriptions (defaults to free plan)', async () => {
      const mockInstallations = [
        { id: '1', plugin_slug: 'alttext-ai', site_url: 'https://example.com' },
      ];
      const mockUsage = {
        monthlyImages: 30,
        dailyImages: 5,
        totalImages: 100,
      };

      userAccountService.getUserInstallations.mockResolvedValue({
        success: true,
        installations: mockInstallations,
      });
      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: [], // No subscriptions
      });
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: mockUsage,
      });

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(true);
      expect(result.data.plans['alttext-ai'].currentPlan).toBe('free');
      expect(result.data.plans['alttext-ai'].tokens).toBe(50); // Free plan quota
    });

    it('should handle missing usage (returns 0 usage)', async () => {
      const mockInstallations = [
        { id: '1', plugin_slug: 'alttext-ai', site_url: 'https://example.com' },
      ];
      const mockSubscriptions = [
        { id: 'sub1', plugin_slug: 'alttext-ai', plan: 'pro', status: 'active' },
      ];

      userAccountService.getUserInstallations.mockResolvedValue({
        success: true,
        installations: mockInstallations,
      });
      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: mockSubscriptions,
      });
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: { monthlyImages: 0, dailyImages: 0, totalImages: 0 },
      });

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(true);
      expect(result.data.usage['alttext-ai'].monthlyImages).toBe(0);
      expect(result.data.usage['alttext-ai'].remaining).toBe(1000); // Full quota available
    });

    it('should calculate remaining quota correctly', async () => {
      const mockInstallations = [
        { id: '1', plugin_slug: 'alttext-ai', site_url: 'https://example.com' },
      ];
      const mockSubscriptions = [
        { id: 'sub1', plugin_slug: 'alttext-ai', plan: 'pro', status: 'active' },
      ];
      const mockUsage = {
        monthlyImages: 450,
        dailyImages: 15,
        totalImages: 2000,
      };

      userAccountService.getUserInstallations.mockResolvedValue({
        success: true,
        installations: mockInstallations,
      });
      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: mockSubscriptions,
      });
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: mockUsage,
      });

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(true);
      expect(result.data.usage['alttext-ai'].quota).toBe(1000); // Pro plan
      expect(result.data.usage['alttext-ai'].monthlyImages).toBe(450);
      expect(result.data.usage['alttext-ai'].remaining).toBe(550); // 1000 - 450
    });

    it('should handle errors gracefully', async () => {
      userAccountService.getUserInstallations.mockRejectedValue(
        new Error('Database error')
      );

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.data.installations).toEqual([]);
    });

    it('should distribute usage evenly across multiple plugins', async () => {
      const mockInstallations = [
        { id: '1', plugin_slug: 'alttext-ai', site_url: 'https://example.com' },
        { id: '2', plugin_slug: 'beepbeep-ai', site_url: 'https://example2.com' },
      ];
      const mockSubscriptions = [];
      const mockUsage = {
        monthlyImages: 100,
        dailyImages: 10,
        totalImages: 500,
      };

      userAccountService.getUserInstallations.mockResolvedValue({
        success: true,
        installations: mockInstallations,
      });
      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: mockSubscriptions,
      });
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: mockUsage,
      });

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(true);
      // Usage should be distributed evenly (100 / 2 = 50 per plugin)
      expect(result.data.usage['alttext-ai'].monthlyImages).toBe(50);
      expect(result.data.usage['beepbeep-ai'].monthlyImages).toBe(50);
    });

    it('should use subscriptions to determine plugins if no installations', async () => {
      const mockSubscriptions = [
        { id: 'sub1', plugin_slug: 'beepbeep-ai', plan: 'pro', status: 'active' },
      ];
      const mockUsage = {
        monthlyImages: 100,
        dailyImages: 10,
        totalImages: 500,
      };

      userAccountService.getUserInstallations.mockResolvedValue({
        success: true,
        installations: [],
      });
      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: mockSubscriptions,
      });
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: mockUsage,
      });

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(true);
      expect(result.data.usage['beepbeep-ai']).toBeDefined();
      expect(result.data.plans['beepbeep-ai'].currentPlan).toBe('pro');
    });

    it('should default to alttext-ai if no plugins found', async () => {
      const mockUsage = {
        monthlyImages: 30,
        dailyImages: 5,
        totalImages: 100,
      };

      userAccountService.getUserInstallations.mockResolvedValue({
        success: true,
        installations: [],
      });
      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: [],
      });
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: mockUsage,
      });

      const result = await accountService.getAccountSummary('test@example.com');

      expect(result.ok).toBe(true);
      expect(result.data.usage['alttext-ai']).toBeDefined();
      expect(result.data.plans['alttext-ai'].currentPlan).toBe('free');
    });
  });
});

