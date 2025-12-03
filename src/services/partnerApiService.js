/**
 * Partner API Service
 * Handles API key management, validation, rate limiting, and usage logging
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { supabase } = require('../../db/supabase-client');
const logger = require('../utils/logger');
const { isTest } = require('../../config/loadEnv');

// In-memory rate limit store (key: apiKeyId, value: { count: number, resetAt: timestamp })
// In production, this should be replaced with Redis
const rateLimitStore = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL = 60 * 1000; // Clean up every minute

// Clean up expired rate limit entries (skip in tests to avoid open handles)
if (!isTest()) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, RATE_LIMIT_CLEANUP_INTERVAL);
}

/**
 * Generate a secure random API key
 * Format: opk_live_<random 32-byte hex string>
 * @returns {string} API key
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `opk_live_${randomBytes}`;
}

/**
 * Hash an API key using bcrypt
 * @param {string} apiKey - Plain text API key
 * @returns {Promise<string>} Hashed API key
 */
async function hashApiKey(apiKey) {
  const saltRounds = 10;
  return bcrypt.hash(apiKey, saltRounds);
}

/**
 * Compare a plain text API key with a hash
 * @param {string} apiKey - Plain text API key
 * @param {string} hash - Hashed API key
 * @returns {Promise<boolean>} True if matches
 */
async function compareApiKey(apiKey, hash) {
  return bcrypt.compare(apiKey, hash);
}

/**
 * Create a new API key for an identity
 * @param {string} identityId - Identity UUID
 * @param {string} name - API key name/description
 * @param {number} rateLimit - Rate limit per minute (default: 60)
 * @returns {Promise<Object>} Result with success status and API key data
 */
async function createApiKey(identityId, name, rateLimit = 60) {
  try {
    if (!identityId || !name) {
      return { success: false, error: 'identityId and name are required' };
    }

    if (rateLimit <= 0) {
      return { success: false, error: 'rateLimit must be positive' };
    }

    // Generate API key
    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(apiKey);

    // Store in database
    const { data: inserted, error } = await supabase
      .from('partner_api_keys')
      .insert({
        key_hash: keyHash,
        identity_id: identityId,
        name: name.trim(),
        rate_limit_per_minute: rateLimit,
        is_active: true,
      })
      .select('id, name, is_active, rate_limit_per_minute, created_at')
      .single();

    if (error) {
      logger.error('[PartnerApiService] Error creating API key', {
        error: error.message,
        stack: error.stack,
        identityId
      });
      return { success: false, error: error.message };
    }

    logger.info('[PartnerApiService] Created API key', {
      apiKeyId: inserted.id,
      identityId
    });

    // Return the plain text key only once (for display to user)
    // In production, this should be shown only once and never stored
    return {
      success: true,
      apiKey: apiKey, // Plain text key - show only once!
      apiKeyData: {
        id: inserted.id,
        name: inserted.name,
        isActive: inserted.is_active,
        rateLimitPerMinute: inserted.rate_limit_per_minute,
        createdAt: inserted.created_at,
      },
    };
  } catch (error) {
    logger.error('[PartnerApiService] Exception creating API key', {
      error: error.message,
      stack: error.stack,
      identityId
    });
    return { success: false, error: error.message || 'Failed to create API key' };
  }
}

/**
 * Validate an API key and return key info
 * @param {string} apiKey - Plain text API key
 * @returns {Promise<Object>} Result with success status and API key data
 */
async function validateApiKey(apiKey) {
  try {
    if (!apiKey || !apiKey.startsWith('opk_live_')) {
      return { success: false, error: 'Invalid API key format' };
    }

    // Get all active API keys (we need to check each hash)
    // In production with many keys, consider using a lookup table or Redis
    const { data: allKeys, error: fetchError } = await supabase
      .from('partner_api_keys')
      .select('id, key_hash, identity_id, name, is_active, rate_limit_per_minute')
      .eq('is_active', true);

    if (fetchError) {
      logger.error('[PartnerApiService] Error fetching API keys', {
        error: fetchError.message,
        stack: fetchError.stack
      });
      return { success: false, error: 'Failed to validate API key' };
    }

    // Compare with each key hash
    for (const keyData of allKeys || []) {
      const matches = await compareApiKey(apiKey, keyData.key_hash);
      if (matches) {
        // Update last_used_at
        await supabase
          .from('partner_api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', keyData.id);

        return {
          success: true,
          apiKeyId: keyData.id,
          identityId: keyData.identity_id,
          name: keyData.name,
          rateLimitPerMinute: keyData.rate_limit_per_minute,
        };
      }
    }

    return { success: false, error: 'Invalid API key' };
  } catch (error) {
    logger.error('[PartnerApiService] Exception validating API key', {
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message || 'Failed to validate API key' };
  }
}

/**
 * Check rate limit for an API key
 * @param {string} apiKeyId - API key UUID
 * @param {number} rateLimitPerMinute - Rate limit per minute
 * @returns {Promise<Object>} Result with allowed status and reset time
 */
async function checkRateLimit(apiKeyId, rateLimitPerMinute) {
  try {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const key = `api_key:${apiKeyId}`;

    let rateLimitData = rateLimitStore.get(key);

    // Initialize or reset if window expired
    if (!rateLimitData || rateLimitData.resetAt < now) {
      rateLimitData = {
        count: 0,
        resetAt: now + windowMs,
      };
    }

    // Check if limit exceeded
    if (rateLimitData.count >= rateLimitPerMinute) {
      return {
        allowed: false,
        resetAt: rateLimitData.resetAt,
        remaining: 0,
      };
    }

    // Increment count
    rateLimitData.count++;
    rateLimitStore.set(key, rateLimitData);

    return {
      allowed: true,
      resetAt: rateLimitData.resetAt,
      remaining: rateLimitPerMinute - rateLimitData.count,
    };
  } catch (error) {
    logger.error('[PartnerApiService] Exception checking rate limit', {
      error: error.message,
      stack: error.stack,
      apiKeyId
    });
    // On error, allow the request (fail open)
    return {
      allowed: true,
      resetAt: Date.now() + 60 * 1000,
      remaining: rateLimitPerMinute,
    };
  }
}

/**
 * Log API usage
 * @param {string} apiKeyId - API key UUID
 * @param {string} endpoint - Endpoint path
 * @param {number} statusCode - HTTP status code
 * @param {number} responseTimeMs - Response time in milliseconds
 * @param {string} ipAddress - Client IP address
 * @returns {Promise<Object>} Result with success status
 */
async function logUsage(apiKeyId, endpoint, statusCode, responseTimeMs, ipAddress) {
  try {
    const { error } = await supabase
      .from('partner_api_usage_logs')
      .insert({
        api_key_id: apiKeyId,
        endpoint: endpoint,
        status_code: statusCode,
        response_time_ms: responseTimeMs,
        ip_address: ipAddress || null,
      });

    if (error) {
      logger.error('[PartnerApiService] Error logging usage', {
        error: error.message,
        stack: error.stack,
        apiKeyId,
        endpoint
      });
      // Don't fail the request if logging fails
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logger.error('[PartnerApiService] Exception logging usage', {
      error: error.message,
      stack: error.stack,
      apiKeyId,
      endpoint
    });
    // Don't fail the request if logging fails
    return { success: false, error: error.message };
  }
}

/**
 * Get usage analytics for an API key
 * @param {string} apiKeyId - API key UUID
 * @param {Date} startDate - Start date (optional)
 * @param {Date} endDate - End date (optional)
 * @returns {Promise<Object>} Result with success status and analytics data
 */
async function getUsageAnalytics(apiKeyId, startDate = null, endDate = null) {
  try {
    let query = supabase
      .from('partner_api_usage_logs')
      .select('*')
      .eq('api_key_id', apiKeyId);

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: logs, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.error('[PartnerApiService] Error fetching usage analytics', {
        error: error.message,
        stack: error.stack,
        apiKeyId
      });
      return { success: false, error: error.message, analytics: null };
    }

    // Calculate statistics
    const totalRequests = logs?.length || 0;
    const successRequests = logs?.filter((log) => log.status_code >= 200 && log.status_code < 300).length || 0;
    const errorRequests = logs?.filter((log) => log.status_code >= 400).length || 0;
    const avgResponseTime =
      logs && logs.length > 0
        ? logs.reduce((sum, log) => sum + (log.response_time_ms || 0), 0) / logs.length
        : 0;

    // Group by endpoint
    const endpointStats = {};
    logs?.forEach((log) => {
      if (!endpointStats[log.endpoint]) {
        endpointStats[log.endpoint] = { count: 0, success: 0, errors: 0 };
      }
      endpointStats[log.endpoint].count++;
      if (log.status_code >= 200 && log.status_code < 300) {
        endpointStats[log.endpoint].success++;
      } else if (log.status_code >= 400) {
        endpointStats[log.endpoint].errors++;
      }
    });

    return {
      success: true,
      analytics: {
        totalRequests,
        successRequests,
        errorRequests,
        successRate: totalRequests > 0 ? (successRequests / totalRequests) * 100 : 0,
        avgResponseTimeMs: Math.round(avgResponseTime),
        endpointStats,
        logs: logs?.slice(0, 100) || [], // Return last 100 logs
      },
    };
  } catch (error) {
    logger.error('[PartnerApiService] Exception getting usage analytics', {
      error: error.message,
      stack: error.stack,
      apiKeyId
    });
    return { success: false, error: error.message || 'Failed to get usage analytics' };
  }
}

/**
 * List all API keys for an identity
 * @param {string} identityId - Identity UUID
 * @returns {Promise<Object>} Result with success status and API keys array
 */
async function listApiKeys(identityId) {
  try {
    const { data, error } = await supabase
      .from('partner_api_keys')
      .select('id, name, is_active, rate_limit_per_minute, created_at, last_used_at, rotated_from')
      .eq('identity_id', identityId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[PartnerApiService] Error listing API keys', {
        error: error.message,
        stack: error.stack,
        identityId
      });
      return { success: false, error: error.message, apiKeys: [] };
    }

    return {
      success: true,
      apiKeys: (data || []).map((key) => ({
        id: key.id,
        name: key.name,
        isActive: key.is_active,
        rateLimitPerMinute: key.rate_limit_per_minute,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        rotatedFrom: key.rotated_from,
        maskedKey: `opk_live_****${key.id.substring(0, 8)}`, // Masked key for display
      })),
    };
  } catch (error) {
    logger.error('[PartnerApiService] Exception listing API keys', {
      error: error.message,
      stack: error.stack,
      identityId
    });
    return { success: false, error: error.message || 'Failed to list API keys', apiKeys: [] };
  }
}

/**
 * Deactivate an API key
 * @param {string} apiKeyId - API key UUID
 * @param {string} identityId - Identity UUID (for ownership verification)
 * @returns {Promise<Object>} Result with success status
 */
async function deactivateApiKey(apiKeyId, identityId) {
  try {
    // Verify ownership
    const { data: keyData, error: fetchError } = await supabase
      .from('partner_api_keys')
      .select('identity_id')
      .eq('id', apiKeyId)
      .single();

    if (fetchError || !keyData) {
      return { success: false, error: 'API key not found' };
    }

    if (keyData.identity_id !== identityId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Deactivate
    const { error: updateError } = await supabase
      .from('partner_api_keys')
      .update({ is_active: false })
      .eq('id', apiKeyId);

    if (updateError) {
      logger.error('[PartnerApiService] Error deactivating API key', {
        error: updateError.message,
        stack: updateError.stack,
        apiKeyId,
        identityId
      });
      return { success: false, error: updateError.message };
    }

    // Remove from rate limit store
    rateLimitStore.delete(`api_key:${apiKeyId}`);

    logger.info('[PartnerApiService] Deactivated API key', { apiKeyId, identityId });
    return { success: true };
  } catch (error) {
    logger.error('[PartnerApiService] Exception deactivating API key', {
      error: error.message,
      stack: error.stack,
      apiKeyId,
      identityId
    });
    return { success: false, error: error.message || 'Failed to deactivate API key' };
  }
}

/**
 * Rotate an API key (create new, deactivate old)
 * @param {string} apiKeyId - Old API key UUID
 * @param {string} identityId - Identity UUID (for ownership verification)
 * @returns {Promise<Object>} Result with success status and new API key
 */
async function rotateApiKey(apiKeyId, identityId) {
  try {
    // Get old key info
    const { data: oldKey, error: fetchError } = await supabase
      .from('partner_api_keys')
      .select('name, rate_limit_per_minute')
      .eq('id', apiKeyId)
      .eq('identity_id', identityId)
      .single();

    if (fetchError || !oldKey) {
      return { success: false, error: 'API key not found or unauthorized' };
    }

    // Create new key
    const createResult = await createApiKey(identityId, `${oldKey.name} (rotated)`, oldKey.rate_limit_per_minute);
    if (!createResult.success) {
      return createResult;
    }

    // Deactivate old key and link to new
    const { error: updateError } = await supabase
      .from('partner_api_keys')
      .update({
        is_active: false,
        rotated_from: createResult.apiKeyData.id,
      })
      .eq('id', apiKeyId);

    if (updateError) {
      logger.error('[PartnerApiService] Error updating old API key', {
        error: updateError.message,
        stack: updateError.stack,
        apiKeyId,
        identityId
      });
      // New key was created, so return success but log the error
    }

    // Remove old key from rate limit store
    rateLimitStore.delete(`api_key:${apiKeyId}`);

    logger.info('[PartnerApiService] Rotated API key', {
      oldApiKeyId: apiKeyId,
      newApiKeyId: createResult.apiKeyData.id,
      identityId
    });
    return {
      success: true,
      apiKey: createResult.apiKey, // Plain text key - show only once!
      apiKeyData: createResult.apiKeyData,
    };
  } catch (error) {
    logger.error('[PartnerApiService] Exception rotating API key', {
      error: error.message,
      stack: error.stack,
      apiKeyId,
      identityId
    });
    return { success: false, error: error.message || 'Failed to rotate API key' };
  }
}

module.exports = {
  createApiKey,
  validateApiKey,
  checkRateLimit,
  logUsage,
  getUsageAnalytics,
  listApiKeys,
  deactivateApiKey,
  rotateApiKey,
};
