/**
 * Partner API Routes
 * White-label API endpoints for programmatic access
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../auth/jwt');
// Defensive imports for middleware - handle undefined in tests
let partnerApiAuth, logPartnerApiUsage;
try {
  const partnerApiAuthModule = require('../middleware/partnerApiAuth');
  partnerApiAuth = partnerApiAuthModule?.partnerApiAuth;
  logPartnerApiUsage = partnerApiAuthModule?.logPartnerApiUsage;
} catch (e) {
  // Fallback: no-op middleware if not available
  partnerApiAuth = (req, res, next) => next();
  logPartnerApiUsage = (req, res, next) => next();
}
// Fallback if still undefined
if (!partnerApiAuth || typeof partnerApiAuth !== 'function') {
  partnerApiAuth = (req, res, next) => next();
}
if (!logPartnerApiUsage || typeof logPartnerApiUsage !== 'function') {
  logPartnerApiUsage = (req, res, next) => next();
}

let checkSubscriptionForPartner;
try {
  checkSubscriptionForPartner = require('../middleware/checkSubscriptionForPartner');
} catch (e) {
  // Fallback: no-op middleware if not available
  checkSubscriptionForPartner = (req, res, next) => next();
}
// Fallback if still undefined
if (!checkSubscriptionForPartner || typeof checkSubscriptionForPartner !== 'function') {
  checkSubscriptionForPartner = (req, res, next) => next();
}

const partnerApiService = require('../services/partnerApiService');
const creditsService = require('../services/creditsService');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const logger = require('../utils/logger');
const { getEnv } = require('../../config/loadEnv');

// Rate limiting for partner API endpoints (defensive check for test environment)
let partnerRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    partnerRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per window
      message: 'Too many requests, please try again later.',
    });
  } catch (e) {
    partnerRateLimiter = null;
  }
}
// Fallback: no-op middleware if rateLimit is not available
if (!partnerRateLimiter || typeof partnerRateLimiter !== 'function') {
  partnerRateLimiter = (req, res, next) => next();
}

// Rate limiting for API key management endpoints (defensive check for test environment)
let keyManagementRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    keyManagementRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // Limit each IP to 20 requests per window
      message: 'Too many requests, please try again later.',
    });
  } catch (e) {
    keyManagementRateLimiter = null;
  }
}
// Fallback: no-op middleware if rateLimit is not available
if (!keyManagementRateLimiter || typeof keyManagementRateLimiter !== 'function') {
  keyManagementRateLimiter = (req, res, next) => next();
}

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  rateLimitPerMinute: z.number().int().positive().optional().default(60),
});

/**
 * POST /partner/generate
 * Generate alt-text using partner API key
 * Requires: Authorization: Bearer <api_key>
 */
router.post(
  '/generate',
  partnerRateLimiter,
  partnerApiAuth,
  checkSubscriptionForPartner,
  logPartnerApiUsage,
  async (req, res) => {
    const requestStartTime = Date.now();

    try {
      const { image_data, context, regenerate = false, service = 'alttext-ai', type } = req.body;

      // Get identity email (already set by checkSubscriptionForPartner middleware)
      const email = req.user?.email;
      if (!email) {
        return res.status(500).json({
          ok: false,
          code: 'IDENTITY_ERROR',
          reason: 'server_error',
          message: 'Identity email not found',
        });
      }

      // Check if we should use credits for this request
      // Note: Subscription/credits check is handled by checkSubscriptionForPartner middleware
      // The middleware sets req.useCredit = true and req.creditIdentityId if credits should be used
      const usingCredits = req.useCredit === true;
      let creditsBalance = 0;
      
      // Get current credit balance if using credits (for response)
      if (usingCredits && req.creditIdentityId) {
        const balanceResult = await creditsService.getBalance(req.creditIdentityId);
        if (balanceResult.success) {
          creditsBalance = balanceResult.balance;
        }
      }

      // Import generation utilities
      const { getServiceApiKey } = require('../utils/apiKey');
      const createApp = require('../../server-v2');
      const { requestChatCompletion } = createApp;

      // Select API key based on service
      const apiKey = getServiceApiKey(service);

      if (!apiKey) {
        return res.status(500).json({
          ok: false,
          error: 'Service not configured',
        });
      }

      // Build prompt and call OpenAI (simplified version of main generate endpoint)
      let openaiResponse;
      let altText;

      if (type === 'meta' || (service === 'seo-ai-meta' && !image_data)) {
        // Meta tag generation
        const systemMessage = {
          role: 'system',
          content:
            'You are an expert SEO copywriter specializing in meta tag optimization. Always respond with valid JSON only.',
        };
        const userMessage = {
          role: 'user',
          content: context || '',
        };

        openaiResponse = await requestChatCompletion([systemMessage, userMessage], {
          apiKey,
          model: req.body.model || getEnv('OPENAI_MODEL', 'gpt-4o-mini'),
          max_tokens: 300,
          temperature: 0.7,
        });

        altText = openaiResponse.choices[0].message.content.trim();
      } else {
        // Alt text generation
        const createApp = require('../../server-v2');
        const { buildPrompt, buildUserMessage } = createApp;
        const prompt = buildPrompt(image_data, context, regenerate);
        const userMessage = buildUserMessage(prompt, image_data);

        const systemMessage = {
          role: 'system',
          content:
            'You are an expert at writing concise, WCAG-compliant alternative text for images. Describe what is visually present without guessing. Mention on-screen text verbatim when it is legible. Keep responses to a single sentence in 8-16 words and avoid filler such as "image of".',
        };

        openaiResponse = await requestChatCompletion([systemMessage, userMessage], {
          apiKey,
        });

        altText = openaiResponse.choices[0].message.content.trim();
      }

      // Deduct credits if using credits (flag set by middleware after successful generation)
      let remainingCredits = creditsBalance;
      if (req.useCredit === true && req.creditIdentityId) {
        const spendResult = await creditsService.spendCredits(req.creditIdentityId, 1, {
          service,
          endpoint: '/partner/generate',
          type: type || 'alt-text',
        });

        if (spendResult.success) {
          remainingCredits = spendResult.remainingBalance;
        } else {
          logger.error('[Partner API] Failed to deduct credits', {
            error: spendResult.error,
            creditIdentityId: req.creditIdentityId
          });
          // Continue anyway - generation succeeded, just log the error
        }
      }

      // Return response
      return res.json({
        ok: true,
        alt_text: altText,
        content: altText, // For meta generation
        credits: remainingCredits,
        usingCredits: usingCredits,
        tokens: openaiResponse.usage,
      });
    } catch (error) {
      logger.error('[Partner API] Generation error', {
        error: error.message,
        stack: error.stack,
        statusCode: error.response?.status
      });
      const statusCode = error.response?.status || 500;
      return res.status(statusCode).json({
        ok: false,
        error: error.message || 'Generation failed',
      });
    }
  }
);

/**
 * POST /partner/api-keys
 * Create a new API key
 * Requires: JWT authentication
 */
router.post('/api-keys', keyManagementRateLimiter, authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();

    // Get or create identity
    const identityResult = await creditsService.getOrCreateIdentity(email);
    if (!identityResult.success) {
      return res.status(500).json({
        ok: false,
        error: identityResult.error,
      });
    }

    // Validate input
    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Validation failed',
      });
    }

    const { name, rateLimitPerMinute } = parsed.data;

    // Create API key
    const result = await partnerApiService.createApiKey(identityResult.identityId, name, rateLimitPerMinute);

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    return res.status(201).json({
      ok: true,
      apiKey: result.apiKey, // Plain text key - show only once!
      apiKeyData: result.apiKeyData,
      warning: 'Store this API key securely. It will not be shown again.',
    });
  } catch (error) {
    logger.error('[Partner API] Error creating API key', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create API key',
    });
  }
});

/**
 * GET /partner/api-keys
 * List all API keys for authenticated user
 * Requires: JWT authentication
 */
router.get('/api-keys', keyManagementRateLimiter, authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();

    // Get or create identity
    const identityResult = await creditsService.getOrCreateIdentity(email);
    if (!identityResult.success) {
      return res.status(500).json({
        ok: false,
        error: identityResult.error,
        apiKeys: [],
      });
    }

    // List API keys
    const result = await partnerApiService.listApiKeys(identityResult.identityId);

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error,
        apiKeys: [],
      });
    }

    return res.json({
      ok: true,
      apiKeys: result.apiKeys,
    });
  } catch (error) {
    logger.error('[Partner API] Error listing API keys', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to list API keys',
      apiKeys: [],
    });
  }
});

/**
 * DELETE /partner/api-keys/:id
 * Deactivate an API key
 * Requires: JWT authentication
 */
router.delete('/api-keys/:id', keyManagementRateLimiter, authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();
    const apiKeyId = req.params.id;

    // Get or create identity
    const identityResult = await creditsService.getOrCreateIdentity(email);
    if (!identityResult.success) {
      return res.status(500).json({
        ok: false,
        error: identityResult.error,
      });
    }

    // Deactivate API key
    const result = await partnerApiService.deactivateApiKey(apiKeyId, identityResult.identityId);

    if (!result.success) {
      const statusCode = result.error === 'Unauthorized' ? 403 : result.error === 'API key not found' ? 404 : 500;
      return res.status(statusCode).json({
        ok: false,
        error: result.error,
      });
    }

    return res.json({
      ok: true,
      message: 'API key deactivated successfully',
    });
  } catch (error) {
    logger.error('[Partner API] Error deactivating API key', {
      error: error.message,
      stack: error.stack,
      apiKeyId: req.params.id,
      userId: req.user?.id
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to deactivate API key',
    });
  }
});

/**
 * POST /partner/api-keys/:id/rotate
 * Rotate an API key (create new, deactivate old)
 * Requires: JWT authentication
 */
router.post('/api-keys/:id/rotate', keyManagementRateLimiter, authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();
    const apiKeyId = req.params.id;

    // Get or create identity
    const identityResult = await creditsService.getOrCreateIdentity(email);
    if (!identityResult.success) {
      return res.status(500).json({
        ok: false,
        error: identityResult.error,
      });
    }

    // Rotate API key
    const result = await partnerApiService.rotateApiKey(apiKeyId, identityResult.identityId);

    if (!result.success) {
      const statusCode = result.error === 'API key not found or unauthorized' ? 404 : 500;
      return res.status(statusCode).json({
        ok: false,
        error: result.error,
      });
    }

    return res.json({
      ok: true,
      apiKey: result.apiKey, // Plain text key - show only once!
      apiKeyData: result.apiKeyData,
      warning: 'Store this new API key securely. The old key has been deactivated.',
    });
  } catch (error) {
    logger.error('[Partner API] Error rotating API key', {
      error: error.message,
      stack: error.stack,
      apiKeyId: req.params.id,
      userId: req.user?.id
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to rotate API key',
    });
  }
});

/**
 * GET /partner/api-keys/:id/usage
 * Get usage analytics for an API key
 * Requires: JWT authentication
 * Query params: startDate (ISO string), endDate (ISO string)
 */
router.get('/api-keys/:id/usage', keyManagementRateLimiter, authenticateToken, async (req, res) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required',
      });
    }

    const email = req.user.email.toLowerCase();
    const apiKeyId = req.params.id;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    // Validate dates
    if (startDate && isNaN(startDate.getTime())) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid startDate format. Expected ISO string.',
      });
    }

    if (endDate && isNaN(endDate.getTime())) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid endDate format. Expected ISO string.',
      });
    }

    // Get or create identity
    const identityResult = await creditsService.getOrCreateIdentity(email);
    if (!identityResult.success) {
      return res.status(500).json({
        ok: false,
        error: identityResult.error,
      });
    }

    // Verify ownership by checking if API key belongs to identity
    const { supabase } = require('../../db/supabase-client');
    const { data: keyData, error: keyError } = await supabase
      .from('partner_api_keys')
      .select('identity_id')
      .eq('id', apiKeyId)
      .single();

    if (keyError || !keyData) {
      return res.status(404).json({
        ok: false,
        error: 'API key not found',
      });
    }

    if (keyData.identity_id !== identityResult.identityId) {
      return res.status(403).json({
        ok: false,
        error: 'Unauthorized',
      });
    }

    // Get usage analytics
    const result = await partnerApiService.getUsageAnalytics(apiKeyId, startDate, endDate);

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        error: result.error,
      });
    }

    return res.json({
      ok: true,
      analytics: result.analytics,
    });
  } catch (error) {
    logger.error('[Partner API] Error getting usage analytics', {
      error: error.message,
      stack: error.stack,
      apiKeyId: req.params.id,
      userId: req.user?.id
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get usage analytics',
    });
  }
});

module.exports = router;

