/**
 * Unit tests for plans configuration
 */

const plansConfig = require('../../src/config/plans');

describe('plans config', () => {
  it('should export plan configuration for all plugins', () => {
    expect(plansConfig).toBeDefined();
    expect(plansConfig['alttext-ai']).toBeDefined();
    expect(plansConfig['seo-ai-meta']).toBeDefined();
    expect(plansConfig['beepbeep-ai']).toBeDefined();
  });

  it('should have free, pro, and agency tiers for each plugin', () => {
    Object.keys(plansConfig).forEach((plugin) => {
      expect(plansConfig[plugin].free).toBeDefined();
      expect(plansConfig[plugin].pro).toBeDefined();
      expect(plansConfig[plugin].agency).toBeDefined();
    });
  });

  it('should have token quotas defined', () => {
    Object.keys(plansConfig).forEach((plugin) => {
      expect(plansConfig[plugin].free.tokens).toBeGreaterThan(0);
      expect(plansConfig[plugin].pro.tokens).toBeGreaterThan(0);
      expect(plansConfig[plugin].agency.tokens).toBeGreaterThan(0);
    });
  });
});

