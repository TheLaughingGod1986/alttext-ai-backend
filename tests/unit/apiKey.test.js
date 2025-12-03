const { getServiceApiKey, getReviewApiKey } = require('../../src/utils/apiKey');

describe('apiKey utilities', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('getServiceApiKey returns service specific key', () => {
    process.env.ALTTEXT_OPENAI_API_KEY = 'altkey';
    process.env.SEO_META_OPENAI_API_KEY = 'seokey';
    const alt = getServiceApiKey('alttext-ai');
    const seo = getServiceApiKey('seo-ai-meta');
    expect(alt).toBe('altkey');
    expect(seo).toBe('seokey');
  });

  test('getServiceApiKey falls back to OPENAI_API_KEY', () => {
    delete process.env.ALTTEXT_OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'fallback';
    expect(getServiceApiKey('alttext-ai')).toBe('fallback');
  });

  test('getReviewApiKey uses review specific key', () => {
    process.env.OPENAI_REVIEW_API_KEY = 'review';
    process.env.ALTTEXT_OPENAI_API_KEY = 'alt';
    const result = getReviewApiKey('alttext-ai');
    expect(result).toBe('review');
  });

  test('getReviewApiKey falls back across chain', () => {
    delete process.env.OPENAI_REVIEW_API_KEY;
    delete process.env.ALTTEXT_OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'final';
    expect(getReviewApiKey('alttext-ai')).toBe('final');
  });

  test('getServiceApiKey returns null when no keys available', () => {
    delete process.env.ALTTEXT_OPENAI_API_KEY;
    delete process.env.SEO_META_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(getServiceApiKey('alttext-ai')).toBeNull();
    expect(getServiceApiKey('seo-ai-meta')).toBeNull();
  });

  test('getReviewApiKey returns null when no keys available', () => {
    delete process.env.OPENAI_REVIEW_API_KEY;
    delete process.env.ALTTEXT_OPENAI_API_KEY;
    delete process.env.SEO_META_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(getReviewApiKey('alttext-ai')).toBeNull();
    expect(getReviewApiKey('seo-ai-meta')).toBeNull();
  });

  test('getServiceApiKey handles seo-ai-meta service fallback', () => {
    delete process.env.SEO_META_OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'fallback-key';
    expect(getServiceApiKey('seo-ai-meta')).toBe('fallback-key');
  });

  test('getReviewApiKey falls back to SEO_META_OPENAI_API_KEY for seo-ai-meta', () => {
    delete process.env.OPENAI_REVIEW_API_KEY;
    process.env.SEO_META_OPENAI_API_KEY = 'seo-key';
    expect(getReviewApiKey('seo-ai-meta')).toBe('seo-key');
  });
});

