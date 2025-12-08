/**
 * AltText AI - Phase 2 API Server
 * Full SaaS backend with user accounts, JWT auth, and Stripe billing
 */

const { getEnv, requireEnv, isProduction, isDevelopment } = require('./config/loadEnv');
const httpModule = require('./src/utils/http');
const httpErrors = httpModule.errors || httpModule;
const sendSuccess = httpModule.sendSuccess || ((res, data) => res.json(data));
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
// Rate limit - will be loaded conditionally in createApp() to avoid test issues
let rateLimit;
const axios = require('axios');

// Safely import supabase - handle dependency loading issues
let supabase;
try {
  const supabaseClient = require('./db/supabase-client');
  supabase = supabaseClient.supabase;
} catch (error) {
  const logger = require('./src/utils/logger');
  logger.error('Failed to load Supabase client:', error.message);
  // Create a mock supabase object to prevent crashes
  supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Supabase not available' } }) }) }),
      insert: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'Supabase not available' } }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'Supabase not available' } }) })
    })
  };
}
// Authentication middleware - will be loaded inside createApp() to avoid Jest module loading issues
// DO NOT load at top level - this causes Jest module caching issues
// All auth middleware will be loaded fresh inside createApp() function
let authenticateToken, optionalAuth, combinedAuth;
const requireSubscription = require('./src/middleware/requireSubscription');
const { getServiceApiKey, getReviewApiKey } = require('./src/utils/apiKey');
const logger = require('./src/utils/logger');

// CRITICAL: Load auth/jwt BEFORE requiring route modules that use it
// This ensures authenticateToken is available when route modules are loaded
// In Jest, this prevents module loading order issues
let authJwtModule;
try {
  authJwtModule = require('./auth/jwt');
  // Verify authenticateToken is available
  if (!authJwtModule || typeof authJwtModule.authenticateToken !== 'function') {
    logger.warn('auth/jwt module loaded but authenticateToken is not a function', {
      moduleKeys: Object.keys(authJwtModule || {}),
      authenticateTokenType: typeof authJwtModule?.authenticateToken
    });
  }
} catch (e) {
  logger.warn('Failed to pre-load auth/jwt module', { error: e.message });
  // Continue anyway - it will be loaded in createApp()
}

// BEST PRACTICE: Route files are now loaded INSIDE createApp() to ensure mocks are applied first
// This prevents "Router.use() requires a middleware function" errors in tests
// Routes are loaded lazily when createApp() is called, not at module top level
//
// Variables declared here for scope, but routes are loaded inside createApp()
let authRoutes, usageRoutes, billingRoutes, legacyBillingRoutes, licensesRoutes, licenseRoutes;
let emailRoutes, newEmailRoutes, emailCompatibilityRoutes, waitlistRoutes, accountRoutes;
let dashboardRoutes, dashboardChartsRoutes, pluginAuthRoutes, identityRoutes, analyticsRoutes;
let recordUsage, checkUserLimits, useCredit, resetMonthlyTokens, checkOrganizationLimits;
let recordOrganizationUsage, useOrganizationCredit, resetOrganizationTokens, clearCachedUsage;

const siteService = require('./src/services/siteService');
const billingService = require('./src/services/billingService'); // Billing service for quota enforcement
const creditsService = require('./src/services/creditsService'); // Credits service for credit transactions
const plansConfig = require('./src/config/plans'); // Plan configuration

const PORT = getEnv('PORT', 3000);

// Initialize Sentry if available (module-level for process handlers)
let Sentry = null;
try {
  const sentryDsn = getEnv('SENTRY_DSN');
  if (sentryDsn) {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: sentryDsn,
      environment: getEnv('NODE_ENV', 'development'),
      tracesSampleRate: isProduction() ? 0.1 : 1.0,
    });
    logger.info('Sentry initialized for error tracking');
  }
} catch (error) {
  logger.warn('Sentry package not installed or configuration invalid', { error: error.message });
}

// Helper functions (reused from Phase 1) - defined at module level for export
function buildPrompt(imageData, context, regenerate = false) {
  const lines = [
    'Write accurate alternative text for the provided image.',
    'Focus on the primary subject, notable actions, setting, colors, and any visible text.',
    'If the image is a logo or icon, state the text or shape that appears.'
  ];

  if (regenerate) {
    lines.push('This is a regeneration request - provide a fresh, alternative description using different wording while maintaining accuracy.');
    lines.push('Use varied vocabulary and sentence structure to create a new but equally descriptive alt text.');
  }

  const contextLines = [];

  if (imageData?.title) {
    contextLines.push(`Media library title: ${imageData.title}`);
  }
  if (imageData?.caption) {
    contextLines.push(`Attachment caption: ${imageData.caption}`);
  }
  if (context?.post_title) {
    contextLines.push(`Appears on page/post titled: ${context.post_title}`);
  }
  if (context?.filename || imageData?.filename) {
    const filename = context?.filename || imageData?.filename;
    contextLines.push(`Filename: ${filename}`);
  }
  if (imageData?.width && imageData?.height) {
    contextLines.push(`Image dimensions: ${imageData.width}x${imageData.height}px`);
  }

  if (contextLines.length > 0) {
    lines.push('\nAdditional context:');
    lines.push(...contextLines);
  }

  lines.push('\nReturn just the alt text.');
  return lines.join('\n');
}

function buildUserMessage(prompt, imageData, options = {}) {
  const allowImage = !options.forceTextOnly;
  
  // Use detail: high for better AI analysis and more accurate descriptions
  // This uses more tokens (~170 vs 85) but provides much better quality
  const imageUrlConfig = { detail: 'high' };

  // PRIORITY 1: Check for base64-encoded image (from WordPress plugin - resized to max 1024px)
  // When image_base64 is present, ALWAYS use it and ignore image_url to avoid processing full-resolution images
  // Support both 'base64' and 'image_base64' field names for compatibility
  const base64Data = imageData?.base64 || imageData?.image_base64;
  if (allowImage && base64Data) {
    // CRITICAL: Require dimensions when base64 is present for validation
    if (!imageData?.width || !imageData?.height) {
      logger.error('[Image Processing] ⚠️ CRITICAL: Base64 image missing dimensions!', {
        hasWidth: !!imageData?.width,
        hasHeight: !!imageData?.height,
        base64Length: base64Data.length,
        warning: 'Cannot validate base64 size without dimensions. Plugin MUST send width and height with base64 images.'
      });
      throw new Error('Base64 image data requires width and height dimensions for validation. Please include width and height in the image_data payload.');
    }
    
    // Validate base64 is actually base64 (not a URL or other data)
    // Base64 should only contain A-Z, a-z, 0-9, +, /, and = (padding)
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    const cleanBase64 = base64Data.trim();
    if (!base64Pattern.test(cleanBase64)) {
      logger.error('[Image Processing] ⚠️ CRITICAL: Invalid base64 data detected!', {
        base64Preview: cleanBase64.substring(0, 100),
        looksLikeUrl: cleanBase64.startsWith('http'),
        warning: 'Base64 data appears to be invalid. It may be a URL or corrupted data.'
      });
      throw new Error('Invalid base64 image data. The base64 string contains invalid characters. Please ensure the image is properly encoded to base64.');
    }
    
    // Use provided mime_type or default to image/jpeg (most common)
    const mimeType = imageData?.mime_type || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    
    // Log image source and dimensions for token cost tracking
    const dimensions = `${imageData.width}x${imageData.height}`;
    const base64Field = imageData?.base64 ? 'base64' : 'image_base64';
    
    // Validate base64 size against reported dimensions
    // A properly resized 1024x1024 JPEG should be ~50-150KB base64
    // A full-res 4000x3000 JPEG could be 2-5MB base64
    const base64SizeKB = Math.round(base64Data.length * 0.75 / 1024); // Approximate decoded size
    const reportedMaxDim = imageData?.width && imageData?.height 
      ? Math.max(imageData.width, imageData.height) 
      : null;
    const pixelCount = imageData?.width && imageData?.height 
      ? imageData.width * imageData.height 
      : null;
    
    // Calculate expected size range based on pixel count
    // Properly resized/compressed JPEG: ~0.1-0.3 bits per pixel (0.0125-0.0375 bytes per pixel)
    // For 1024x1024 (1MP): ~130-400KB raw = ~170-530KB base64
    // But with good compression: ~50-150KB base64 is more realistic
    // For 1164x1473 (1.7MP): ~220-660KB raw = ~290-880KB base64
    // But properly resized: ~85-255KB base64 is expected
    
    let expectedMinSizeKB = 5; // Minimum reasonable size (very compressed small image)
    let expectedMaxSizeKB = 200; // Default conservative limit
    if (pixelCount) {
      // Calculate based on pixel count with conservative compression estimate
      // Using 0.15 bits per pixel (0.01875 bytes per pixel) for well-compressed resized images
      const expectedRawKB = (pixelCount * 0.01875) / 1024;
      expectedMaxSizeKB = Math.round(expectedRawKB * 1.33); // Base64 is ~33% larger than raw
      // Add 50% buffer for variation, but cap at reasonable limits
      expectedMaxSizeKB = Math.min(expectedMaxSizeKB * 1.5, reportedMaxDim && reportedMaxDim <= 1024 ? 200 : 500);
      
      // Calculate minimum expected size (very aggressive compression)
      // Minimum: 0.05 bits per pixel (0.00625 bytes per pixel) for extremely compressed images
      const expectedMinRawKB = (pixelCount * 0.00625) / 1024;
      expectedMinSizeKB = Math.round(expectedMinRawKB * 1.33);
      // Ensure minimum is reasonable (at least 2KB for any image)
      expectedMinSizeKB = Math.max(expectedMinSizeKB, 2);
    } else if (reportedMaxDim) {
      // Fallback to dimension-based estimate
      expectedMaxSizeKB = reportedMaxDim <= 1024 ? 200 : 500;
      expectedMinSizeKB = Math.max(Math.round((reportedMaxDim * reportedMaxDim * 0.00625 * 1.33) / 1024), 2);
    }
    
    // Check for suspiciously small base64 (might be truncated, corrupted, or placeholder)
    const isSuspiciouslySmall = base64SizeKB < expectedMinSizeKB;
    const isSuspiciouslyLarge = base64SizeKB > expectedMaxSizeKB;
    
    if (isSuspiciouslySmall) {
      logger.error('[Image Processing] ⚠️ CRITICAL: Base64 image is suspiciously SMALL for reported dimensions!', {
        source: base64Field,
        reportedDimensions: dimensions,
        pixelCount,
        base64SizeKB,
        expectedMinSizeKB,
        expectedMaxSizeKB,
        ratio: (base64SizeKB / expectedMinSizeKB).toFixed(2),
        warning: 'This base64 is too small for the reported dimensions. It may be truncated, corrupted, or a placeholder. OpenAI may process it incorrectly, causing unexpected token costs!',
        recommendation: 'Plugin MUST send complete, valid base64 image data. Current base64 size suggests incomplete or corrupted data.',
        action: 'REJECTING REQUEST to prevent unexpected token costs'
      });
      
      throw new Error(`Base64 image size (${base64SizeKB}KB) is too small for reported dimensions (${dimensions}). Expected minimum ${expectedMinSizeKB}KB. This suggests the base64 data is incomplete, truncated, or corrupted. Please ensure the image is properly encoded to base64.`);
    }
    
    if (isSuspiciouslyLarge) {
      logger.error('[Image Processing] ⚠️ CRITICAL: Base64 image is suspiciously large for reported dimensions!', {
        source: base64Field,
        reportedDimensions: dimensions,
        pixelCount,
        base64SizeKB,
        expectedMaxSizeKB,
        ratio: (base64SizeKB / expectedMaxSizeKB).toFixed(2),
        warning: 'This base64 likely contains a FULL-RESOLUTION image despite metadata. OpenAI will tokenize it as full-res, causing high token costs!',
        recommendation: 'Plugin MUST resize image BEFORE encoding to base64. Current base64 size suggests full-res image was encoded.',
        action: 'REJECTING REQUEST to prevent high token costs'
      });
      
      // REJECT the request to prevent high token costs
      // This forces the plugin to fix the issue
      throw new Error(`Base64 image size (${base64SizeKB}KB) exceeds expected maximum (${expectedMaxSizeKB}KB) for reported dimensions (${dimensions}). This suggests a full-resolution image was encoded instead of a resized one. Please resize the image before encoding to base64.`);
    } else {
      logger.info('[Image Processing] ✅ Using base64 image (resized)', { 
        source: base64Field,
        dimensions,
        mimeType,
        base64Length: base64Data.length,
        base64SizeKB,
        hasImageUrl: !!imageData?.url,
        ignoredImageUrl: !!imageData?.url, // Log that URL is being ignored
        urlPreview: imageData?.url ? imageData.url.substring(0, 100) + '...' : null
      });
    }
    
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl, ...imageUrlConfig } }
      ]
    };
  }

  // PRIORITY 2: Check for inline data URL
  if (allowImage && imageData?.inline?.data_url) {
    logger.info('[Image Processing] Using inline data URL', { source: 'inline.data_url' });
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageData.inline.data_url, ...imageUrlConfig } }
      ]
    };
  }

  // PRIORITY 3: Check for public URL (only if base64 is NOT present)
  // This ensures we never download full-resolution images when resized base64 is available
  const hasUsableUrl = allowImage && imageData?.url && isLikelyPublicUrl(imageData.url);
  if (hasUsableUrl) {
    logger.warn('[Image Processing] ⚠️ Using public URL (fallback - no base64 provided)', { 
      source: 'image_url',
      url: imageData.url.substring(0, 100), // Log first 100 chars of URL
      dimensions: imageData?.width && imageData?.height ? `${imageData.width}x${imageData.height}` : 'unknown',
      warning: 'This will process full-resolution image and use high tokens!'
    });
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageData.url, ...imageUrlConfig } }
      ]
    };
  }

  return {
    role: 'user',
    content: prompt
  };
}

function getNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

function isLikelyPublicUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();

    const privatePatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[0-1])\./,
      /^192\.168\./,
      /\.local$/,
      /\.test$/,
      /\.internal$/
    ];

    if (privatePatterns.some(pattern => pattern.test(hostname))) {
      return false;
    }

    if (protocol === 'http:') {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

async function requestChatCompletion(messages, overrides = {}) {
  const {
    model = getEnv('OPENAI_MODEL', 'gpt-4o-mini'),
    max_tokens = 100,
    temperature = 0.2,
    apiKey = getEnv('ALTTEXT_OPENAI_API_KEY') || getEnv('OPENAI_API_KEY')
  } = overrides;

  if (!apiKey) {
    const error = new Error('OpenAI API key is not configured. Please set ALTTEXT_OPENAI_API_KEY or OPENAI_API_KEY environment variable.');
    error.code = 'BACKEND_CONFIG_ERROR';
    logger.error('[OpenAI] Missing API key', { code: error.code });
    throw error;
  }

  logger.info(`[OpenAI] Making request to OpenAI API with model: ${model}`, { model });
  logger.info(`[OpenAI] Messages count: ${messages.length}`, { messageCount: messages.length });
  logger.info(`[OpenAI] API Key present: ${apiKey ? 'YES' : 'NO'}`, { hasApiKey: !!apiKey });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages,
        max_tokens,
        temperature
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 75000 // 75 second timeout for OpenAI API calls (frontend waits 90s)
      }
    );
    
    logger.info(`[OpenAI] Request successful, received response`);
    const payload = response && response.data ? response.data : response || {};
    return {
      choices: payload?.choices || [],
      usage: payload?.usage || null
    };
  } catch (error) {
    // Handle timeout errors first (network-level errors, no response object)
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = error.code || 'ETIMEDOUT';
      logger.error('[OpenAI] Request timeout', { code: timeoutError.code });
      throw timeoutError;
    }

    // Handle specific OpenAI API errors
    const status = error.response?.status;
    const errorData = error.response?.data;
    const errorMessage = errorData?.error?.message || error.message;

    // Log detailed error information
    logger.error('[OpenAI] Request failed', {
      message: errorMessage,
      code: error.code,
      status,
      statusText: error.response?.statusText,
      openaiErrorType: errorData?.error?.type,
      openaiErrorCode: errorData?.error?.code
    });

    // Handle specific HTTP status codes
    if (status === 401) {
      const apiKeyError = new Error('OpenAI API key is invalid or expired. Please check your API key configuration.');
      apiKeyError.code = 'BACKEND_CONFIG_ERROR';
      apiKeyError.status = 401;
      logger.error('[OpenAI] API key validation failed', { code: apiKeyError.code });
      throw apiKeyError;
    }

    if (status === 403) {
      const forbiddenError = new Error('OpenAI API access forbidden. Your API key may not have permission for this operation or your account may have been suspended.');
      forbiddenError.code = 'BACKEND_CONFIG_ERROR';
      forbiddenError.status = 403;
      logger.error('[OpenAI] API access forbidden', { code: forbiddenError.code });
      throw forbiddenError;
    }

    if (status === 429) {
      const rateLimitError = new Error('OpenAI API rate limit exceeded. Please try again later.');
      rateLimitError.code = 'RATE_LIMIT_EXCEEDED';
      rateLimitError.status = 429;
      logger.warn('[OpenAI] Rate limit exceeded', { code: rateLimitError.code });
      throw rateLimitError;
    }

    if (status === 500 || status === 502 || status === 503 || status === 504) {
      const serverError = new Error('OpenAI API service is temporarily unavailable. Please try again later.');
      serverError.code = 'AI_SERVICE_UNAVAILABLE';
      serverError.status = status;
      logger.error('[OpenAI] OpenAI service error', { code: serverError.code, status });
      throw serverError;
    }

    // For other errors, preserve the original error but add code if missing
    if (!error.code) {
      error.code = 'AI_SERVICE_ERROR';
    }
    throw error;
  }
}

function shouldDisableImageInput(error) {
  const status = error?.response?.status;
  if (!status || status >= 500) {
    return false;
  }

  const message = error?.response?.data?.error?.message || '';
  return (
    status === 400 ||
    status === 422 ||
    /image_url/i.test(message) ||
    /fetch/i.test(message) ||
    /unable to load image/i.test(message)
  );
}

function messageHasImage(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }
  if (Array.isArray(message.content)) {
    return message.content.some(part => part?.type === 'image_url');
  }
  return false;
}

async function reviewAltText(altText, imageData, context, apiKey = null) {
  if (!altText || typeof altText !== 'string') {
    return null;
  }

  // Prioritize base64 image (resized) over URL to avoid processing full-resolution images
  const base64Data = imageData?.base64 || imageData?.image_base64;
  const hasBase64 = Boolean(base64Data);
  const hasInline = Boolean(imageData?.inline?.data_url);
  // Only check for public URL if base64 is NOT present (to avoid downloading full-res images)
  const hasPublicUrl = !hasBase64 && imageData?.url && isLikelyPublicUrl(imageData.url);

  if (!hasBase64 && !hasInline && !hasPublicUrl) {
    return null;
  }

    // Use provided API key or get review API key for the service
    const service = imageData?.service || 'alttext-ai';
    const effectiveApiKey = apiKey || getReviewApiKey(service);

  const systemMessage = {
    role: 'system',
    content: 'You are an accessibility QA reviewer. When given an image and a candidate alternative text, you evaluate how well the text represents the image content. Respond strictly with a JSON object containing the fields: score (integer 0-100), status (one of: great, good, review, critical), grade (short human-readable label), summary (<=120 characters), and issues (array of short issue strings). Penalize hallucinations, missing key subjects, incorrect genders, colors, text, or context. Score 0 for placeholder or irrelevant descriptions.'
  };

  const prompt = buildReviewPrompt(altText, imageData, context);
  const userMessage = buildUserMessage(prompt, imageData);

  let response;
  try {
    response = await requestChatCompletion([
      systemMessage,
      userMessage
    ], {
      model: getEnv('OPENAI_REVIEW_MODEL') || getEnv('OPENAI_MODEL', 'gpt-4o-mini'),
      max_tokens: 220,
      temperature: 0,
      apiKey: effectiveApiKey
    });
  } catch (error) {
    if (shouldDisableImageInput(error) && messageHasImage(userMessage)) {
      const fallbackMessage = buildUserMessage(prompt, null, { forceTextOnly: true });
      response = await requestChatCompletion([
        systemMessage,
        fallbackMessage
      ], {
        model: getEnv('OPENAI_REVIEW_MODEL') || getEnv('OPENAI_MODEL', 'gpt-4o-mini'),
        max_tokens: 220,
        temperature: 0,
        apiKey: effectiveApiKey
      });
    } else {
      throw error;
    }
  }

  const content = response.choices[0].message.content.trim();
  const parsed = parseReviewResponse(content);

  if (!parsed) {
    return null;
  }

  const score = clampScore(parsed.score);
  const status = normalizeStatus(parsed.status, score);
  const grade = parsed.grade || gradeFromStatus(status);
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .filter(item => typeof item === 'string' && item.trim() !== '')
        .map(item => item.trim())
        .slice(0, 6)
    : [];

  return {
    score,
    status,
    grade,
    summary,
    issues,
    model: getEnv('OPENAI_REVIEW_MODEL') || getEnv('OPENAI_MODEL', 'gpt-4o-mini'),
    usage: response.usage
  };
}

function buildReviewPrompt(altText, imageData, context) {
  const lines = [
    'Evaluate whether the provided alternative text accurately describes the attached image.',
    'Respond ONLY with a JSON object containing these keys: score, status, grade, summary, issues.',
    'Score rules: 100 is a precise, specific match including essential context and any visible text. 0 is completely wrong, irrelevant, or placeholder text.',
    `Alt text candidate: "${altText}".`
  ];

  if (imageData?.title) {
    lines.push(`Media library title: ${imageData.title}`);
  }
  if (imageData?.caption) {
    lines.push(`Caption: ${imageData.caption}`);
  }
  if (context?.post_title) {
    lines.push(`Appears on page: ${context.post_title}`);
  }
  if (imageData?.filename) {
    lines.push(`Filename: ${imageData.filename}`);
  }
  if (imageData?.width && imageData?.height) {
    lines.push(`Dimensions: ${imageData.width}x${imageData.height}px`);
  }

  lines.push('Remember: return valid JSON only, without markdown fencing.');
  return lines.join('\n');
}

function parseReviewResponse(content) {
  if (!content) {
    return null;
  }

  const trimmed = content.trim();
  const directParse = tryParseJson(trimmed);
  if (directParse) {
    return directParse;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    return tryParseJson(match[0]);
  }
  return null;
}

function tryParseJson(payload) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeStatus(status, score) {
  const lookup = {
    great: 'great',
    excellent: 'great',
    good: 'good',
    ok: 'review',
    needs_review: 'review',
    review: 'review',
    poor: 'critical',
    critical: 'critical',
    fail: 'critical'
  };

  if (typeof status === 'string') {
    const key = status.toLowerCase().replace(/[^a-z]/g, '_');
    if (lookup[key]) {
      return lookup[key];
    }
  }

  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score >= 90) return 'great';
    if (score >= 75) return 'good';
    if (score >= 55) return 'review';
    return 'critical';
  }

  return 'review';
}

function gradeFromStatus(status) {
  switch (status) {
    case 'great':
      return 'Excellent';
    case 'good':
      return 'Strong';
    case 'review':
      return 'Needs review';
    default:
      return 'Critical';
  }
}

/**
 * Create and configure Express app instance
 * This factory function allows creating fresh app instances for testing
 */
function createApp() {
  // Always reload auth modules inside createApp() to ensure they're available
  // This is critical for test isolation - each call to createApp() needs fresh auth modules
  const logger = require('./src/utils/logger');
  
  // Always require fresh - don't clear cache as it can cause issues
  let jwtModule, dualAuthModule;
  try {
    jwtModule = require('./auth/jwt');
  } catch (e) {
    logger.error('Failed to require ./auth/jwt', { error: e.message, stack: e.stack });
    throw new Error(`Failed to load auth/jwt module: ${e.message}`);
  }
  
  try {
    dualAuthModule = require('./src/middleware/dual-auth');
  } catch (e) {
    logger.error('Failed to require ./src/middleware/dual-auth', { error: e.message, stack: e.stack });
    throw new Error(`Failed to load dual-auth module: ${e.message}`);
  }
  
  // Extract functions from modules
  if (!jwtModule || typeof jwtModule.authenticateToken !== 'function') {
    throw new Error(`jwtModule.authenticateToken is not a function. Module: ${JSON.stringify(Object.keys(jwtModule || {}))}`);
  }
  if (!jwtModule || typeof jwtModule.optionalAuth !== 'function') {
    throw new Error(`jwtModule.optionalAuth is not a function. Module: ${JSON.stringify(Object.keys(jwtModule || {}))}`);
  }
  if (!dualAuthModule || typeof dualAuthModule.combinedAuth !== 'function') {
    throw new Error(`dualAuthModule.combinedAuth is not a function. Module: ${JSON.stringify(Object.keys(dualAuthModule || {}))}`);
  }
  
  // Assign to module-level variables AND create local consts for use in this function
  authenticateToken = jwtModule.authenticateToken;
  optionalAuth = jwtModule.optionalAuth;
  combinedAuth = dualAuthModule.combinedAuth;
  
  // Create local consts to ensure they're always available in this function scope
  const localAuthenticateToken = jwtModule.authenticateToken;
  const localOptionalAuth = jwtModule.optionalAuth;
  const localCombinedAuth = dualAuthModule.combinedAuth;
  
  // Final verification - throw immediately if any are invalid
  if (!localAuthenticateToken || typeof localAuthenticateToken !== 'function') {
    const error = new Error(`localAuthenticateToken is not a function after assignment. Type: ${typeof localAuthenticateToken}, jwtModule keys: ${Object.keys(jwtModule || {}).join(', ')}`);
    logger.error(error.message, { jwtModuleKeys: Object.keys(jwtModule || {}) });
    throw error;
  }
  if (!localOptionalAuth || typeof localOptionalAuth !== 'function') {
    throw new Error(`localOptionalAuth is not a function after assignment. Type: ${typeof localOptionalAuth}`);
  }
  if (!localCombinedAuth || typeof localCombinedAuth !== 'function') {
    throw new Error(`localCombinedAuth is not a function after assignment. Type: ${typeof localCombinedAuth}`);
  }
  
  // Create safe wrapper functions that will always be valid, even if something weird happens
  // These capture the original functions in closure and validate them at call time
  const safeAuthenticateToken = function(req, res, next) {
    if (typeof localAuthenticateToken === 'function') {
      return localAuthenticateToken(req, res, next);
    }
    logger.error('safeAuthenticateToken: localAuthenticateToken became invalid', {
      type: typeof localAuthenticateToken,
      value: localAuthenticateToken
    });
    return httpErrors.authenticationRequired(res, 'Authentication middleware not available');
  };
  
  const safeCombinedAuth = function(req, res, next) {
    if (typeof localCombinedAuth === 'function') {
      return localCombinedAuth(req, res, next);
    }
    logger.error('safeCombinedAuth: localCombinedAuth became invalid', {
      type: typeof localCombinedAuth,
      value: localCombinedAuth
    });
    return httpErrors.authenticationRequired(res, 'Authentication middleware not available');
  };
  
  // Verify safe wrappers are functions
  if (typeof safeAuthenticateToken !== 'function') {
    throw new Error(`safeAuthenticateToken is not a function. Type: ${typeof safeAuthenticateToken}`);
  }
  if (typeof safeCombinedAuth !== 'function') {
    throw new Error(`safeCombinedAuth is not a function. Type: ${typeof safeCombinedAuth}`);
  }
  
  const app = express();

  // BEST PRACTICE: Load route files INSIDE createApp() to ensure mocks are applied first
  // This prevents "Router.use() requires a middleware function" errors in tests
  // Routes are loaded lazily here instead of at module top level
  let authRoutes, usageRoutes, billingRoutes, legacyBillingRoutes, licensesRoutes, licenseRoutes;
  let emailRoutes, newEmailRoutes, emailCompatibilityRoutes, waitlistRoutes, accountRoutes;
  let dashboardRoutes, dashboardChartsRoutes, pluginAuthRoutes, identityRoutes, analyticsRoutes;
  let recordUsage, checkUserLimits, useCredit, resetMonthlyTokens, checkOrganizationLimits;
  let recordOrganizationUsage, useOrganizationCredit, resetOrganizationTokens, clearCachedUsage;
  
  try {
    authRoutes = require('./auth/routes');
  } catch (e) {
    logger.warn('Failed to load authRoutes', { error: e.message });
    authRoutes = null;
  }
  
  try {
    const usageModule = require('./routes/usage');
    usageRoutes = usageModule.router;
    recordUsage = usageModule.recordUsage;
    checkUserLimits = usageModule.checkUserLimits;
    useCredit = usageModule.useCredit;
    resetMonthlyTokens = usageModule.resetMonthlyTokens;
    checkOrganizationLimits = usageModule.checkOrganizationLimits;
    recordOrganizationUsage = usageModule.recordOrganizationUsage;
    useOrganizationCredit = usageModule.useOrganizationCredit;
    resetOrganizationTokens = usageModule.resetOrganizationTokens;
    clearCachedUsage = usageModule.clearCachedUsage;
  } catch (e) {
    logger.warn('Failed to load usage routes', { error: e.message });
    usageRoutes = null;
  }
  
  try {
    billingRoutes = require('./src/routes/billing');
  } catch (e) {
    logger.warn('Failed to load billingRoutes', { error: e.message });
    billingRoutes = null;
  }
  
  try {
    legacyBillingRoutes = require('./routes/billing');
  } catch (e) {
    logger.warn('Failed to load legacyBillingRoutes', { error: e.message });
    legacyBillingRoutes = null;
  }
  
  try {
    licensesRoutes = require('./routes/licenses');
  } catch (e) {
    logger.warn('Failed to load licensesRoutes', { error: e.message });
    licensesRoutes = null;
  }
  
  try {
    licenseRoutes = require('./routes/license');
  } catch (e) {
    logger.warn('Failed to load licenseRoutes', { error: e.message });
    licenseRoutes = null;
  }
  
  try {
    emailRoutes = require('./routes/email');
  } catch (e) {
    logger.warn('Failed to load emailRoutes', { error: e.message });
    emailRoutes = null;
  }
  
  try {
    newEmailRoutes = require('./src/routes/email');
  } catch (e) {
    logger.warn('Failed to load newEmailRoutes', { error: e.message });
    newEmailRoutes = null;
  }
  
  try {
    logger.debug('Loading emailCompatibilityRoutes...');
    emailCompatibilityRoutes = require('./src/routes/emailCompatibility');
    logger.debug('Successfully loaded emailCompatibilityRoutes', {
      type: typeof emailCompatibilityRoutes,
      hasStack: emailCompatibilityRoutes?.stack !== undefined
    });
  } catch (e) {
    logger.error('Failed to load emailCompatibilityRoutes', {
      error: e.message,
      stack: e.stack
    });
    emailCompatibilityRoutes = null;
  }
  
  try {
    waitlistRoutes = require('./src/routes/waitlist');
  } catch (e) {
    logger.warn('Failed to load waitlistRoutes', { error: e.message });
    waitlistRoutes = null;
  }
  
  try {
    accountRoutes = require('./src/routes/account');
  } catch (e) {
    logger.warn('Failed to load accountRoutes', { error: e.message });
    accountRoutes = null;
  }
  
  try {
    const dashboardModule = require('./src/routes/dashboard');
    dashboardRoutes = dashboardModule.router;
  } catch (e) {
    logger.warn('Failed to load dashboard routes', { error: e.message });
    dashboardRoutes = null;
  }
  
  try {
    dashboardChartsRoutes = require('./src/routes/dashboardCharts');
  } catch (e) {
    logger.warn('Failed to load dashboardChartsRoutes', { error: e.message });
    dashboardChartsRoutes = null;
  }
  
  try {
    pluginAuthRoutes = require('./src/routes/pluginAuth');
  } catch (e) {
    logger.warn('Failed to load pluginAuthRoutes', { error: e.message });
    pluginAuthRoutes = null;
  }
  
  try {
    identityRoutes = require('./src/routes/identity');
  } catch (e) {
    logger.warn('Failed to load identityRoutes', { error: e.message });
    identityRoutes = null;
  }
  
  try {
    analyticsRoutes = require('./src/routes/analytics');
  } catch (e) {
    logger.warn('Failed to load analyticsRoutes', { error: e.message });
    analyticsRoutes = null;
  }

// Middleware
app.set('trust proxy', 1); // Trust proxy for rate limiting behind Render
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  getEnv('FRONTEND_URL'),
  getEnv('FRONTEND_DASHBOARD_URL'),
  'https://oppti.dev',
  'https://app.optti.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173', // Vite default
  'http://localhost:5174', // Vite alternate
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In development, allow all origins for easier testing
      if (isDevelopment()) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));

// Stripe webhook needs raw body - must come before express.json()
app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
// Legacy webhook route - DEPRECATED: Use /stripe/webhook instead
// NOTE: Keeping /billing/webhook for backward compatibility but it's deprecated
// Remove after confirming all Stripe webhook configurations use /stripe/webhook
app.use('/billing/webhook', express.raw({ type: 'application/json' })); // Legacy webhook route (DEPRECATED)
app.use('/credits/webhook', express.raw({ type: 'application/json' })); // Credits webhook route

// JSON parsing for all other routes - increased limit to 2MB for image base64 encoding
app.use(express.json({ limit: '2mb' }));

  // Request ID middleware (add early for tracing)
  const { requestIdMiddleware } = require('./src/middleware/requestId');
  app.use(requestIdMiddleware);

// Health check - MUST be before rate limiting to avoid 429 errors on health checks
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    phase: 'monetization',
  };

  // Check database connectivity
  try {
    const { error: dbError } = await supabase.from('identities').select('id').limit(1);
    health.database = dbError ? { status: 'error', error: dbError.message } : { status: 'ok' };
  } catch (error) {
    health.database = { status: 'error', error: error.message };
  }

  // Check Stripe connectivity (if configured)
  const { getStripe } = require('./src/utils/stripeClient');
  const stripe = getStripe();
  if (stripe) {
    try {
      await stripe.customers.list({ limit: 1 });
      health.stripe = { status: 'ok' };
    } catch (error) {
      health.stripe = { status: 'error', error: error.message };
    }
  } else {
    health.stripe = { status: 'not_configured' };
  }

  // Always return 200 OK for health check - Render needs this to mark deployment as successful
  // Individual service statuses (database, stripe) are reported in the response body
  // but don't affect the HTTP status code
  res.status(200).json(health);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const os = require('os');
    const metrics = {
      timestamp: new Date().toISOString(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
        system: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024), // MB
      },
      uptime: Math.round(process.uptime()), // seconds
      nodeVersion: process.version,
      platform: process.platform,
    };

    res.json(metrics);
  } catch (error) {
    httpErrors.internalError(res, 'Failed to collect metrics', { code: 'METRICS_ERROR' });
  }
});

// Rate limiting - use enhanced rate limiter factory
const { rateLimitByIp, strictRateLimit } = require('./src/middleware/rateLimiter');

// General API rate limiting
app.use('/api/', rateLimitByIp(15 * 60 * 1000, 100));

// Routes
// Backward compatibility routes (registered first at root level)
// Wrap each route registration in try-catch to identify which one is failing
try {
  logger.debug('Registering emailCompatibilityRoutes');
  if (!emailCompatibilityRoutes) throw new Error('emailCompatibilityRoutes is undefined');
  if (typeof emailCompatibilityRoutes !== 'function' && !emailCompatibilityRoutes.stack) {
    throw new Error(`emailCompatibilityRoutes is not a valid router. Type: ${typeof emailCompatibilityRoutes}`);
  }
  app.use('/', emailCompatibilityRoutes);
  logger.debug('Successfully registered emailCompatibilityRoutes');
} catch (e) {
  logger.error('Failed to register emailCompatibilityRoutes', { error: e.message, stack: e.stack });
  throw e;
}

try {
  logger.debug('Registering authRoutes');
  if (!authRoutes) throw new Error('authRoutes is undefined');
  if (typeof authRoutes !== 'function' && !authRoutes.stack) {
    throw new Error(`authRoutes is not a valid router. Type: ${typeof authRoutes}`);
  }
  app.use('/auth', authRoutes);
  logger.debug('Successfully registered authRoutes');
} catch (e) {
  logger.error('Failed to register authRoutes', { error: e.message, stack: e.stack });
  throw e;
}

try {
  if (!usageRoutes) {
    logger.warn('usageRoutes is undefined, skipping registration');
  } else {
    app.use('/usage', usageRoutes);
  }
} catch (e) {
  logger.error('Failed to register usageRoutes', { error: e.message });
  throw e;
}

try {
  if (!billingRoutes) throw new Error('billingRoutes is undefined');
  if (typeof billingRoutes !== 'function' && !billingRoutes.stack) {
    throw new Error(`billingRoutes is not a valid router. Type: ${typeof billingRoutes}`);
  }
  app.use('/billing', billingRoutes); // New billing routes (create-checkout, create-portal, subscriptions)
} catch (e) {
  logger.error('Failed to register billingRoutes', { error: e.message, stack: e.stack });
  throw e;
}

try {
  if (!legacyBillingRoutes) throw new Error('legacyBillingRoutes is undefined');
  if (typeof legacyBillingRoutes !== 'function' && !legacyBillingRoutes.stack) {
    throw new Error(`legacyBillingRoutes is not a valid router. Type: ${typeof legacyBillingRoutes}`);
  }
  app.use('/billing', legacyBillingRoutes); // Legacy billing routes (for backward compatibility)
} catch (e) {
  logger.error('Failed to register legacyBillingRoutes', { error: e.message, stack: e.stack });
  throw e;
}

// Stripe webhook route
try {
  logger.debug('Registering Stripe webhook');
  const { webhookMiddleware, webhookHandler } = require('./src/stripe/webhooks');
  if (!webhookMiddleware || !webhookHandler) throw new Error('webhookMiddleware or webhookHandler is undefined');
  if (typeof webhookMiddleware !== 'function') throw new Error(`webhookMiddleware is not a function. Type: ${typeof webhookMiddleware}`);
  if (typeof webhookHandler !== 'function') throw new Error(`webhookHandler is not a function. Type: ${typeof webhookHandler}`);
  app.post('/stripe/webhook', webhookMiddleware, webhookHandler);
  logger.debug('Successfully registered Stripe webhook');
} catch (e) {
  logger.error('Failed to register Stripe webhook', { error: e.message, stack: e.stack });
  throw e;
}

try {
  if (!licensesRoutes) throw new Error('licensesRoutes is undefined');
  app.use('/api/licenses', licensesRoutes);
} catch (e) {
  logger.error('Failed to register licensesRoutes', { error: e.message });
  throw e;
}

try {
  if (!licenseRoutes) throw new Error('licenseRoutes is undefined');
  app.use('/api/license', licenseRoutes);
} catch (e) {
  logger.error('Failed to register licenseRoutes', { error: e.message });
  throw e;
}
  // Organization routes - tables have been created, enabling routes
  // Load organization routes with error handling
  try {
    // First, verify localAuthenticateToken and safeAuthenticateToken are available BEFORE requiring organization routes
    // This prevents any potential issues if organization routes module tries to use it
    if (!localAuthenticateToken || typeof localAuthenticateToken !== 'function') {
      const errorMsg = `localAuthenticateToken is not a function BEFORE requiring organization routes. Type: ${typeof localAuthenticateToken}`;
      logger.error(errorMsg, {
        localAuthType: typeof localAuthenticateToken,
        localAuthValue: localAuthenticateToken,
        authenticateTokenType: typeof authenticateToken,
        authenticateTokenValue: authenticateToken
      });
      throw new Error(errorMsg);
    }

    // Verify safeAuthenticateToken is available (it should be since it's defined earlier in the function)
    if (!safeAuthenticateToken || typeof safeAuthenticateToken !== 'function') {
      const errorMsg = `safeAuthenticateToken is not a function BEFORE requiring organization routes. Type: ${typeof safeAuthenticateToken}`;
      logger.error(errorMsg, {
        safeAuthType: typeof safeAuthenticateToken,
        safeAuthValue: safeAuthenticateToken
      });
      throw new Error(errorMsg);
    }

    // localAuthenticateToken and safeAuthenticateToken are valid, proceed with loading organization routes
    const orgModule = require('./routes/organization');
    const organizationRouter = orgModule?.router;
    const getMyOrganizations = orgModule?.getMyOrganizations;

    // Validate organization router - Express Router can be an object or function with router methods
    if (!organizationRouter) {
      logger.warn('Skipping organization routes - router is undefined');
    } else if ((typeof organizationRouter !== 'object' && typeof organizationRouter !== 'function') ||
        (organizationRouter.stack === undefined && typeof organizationRouter.get !== 'function' && typeof organizationRouter.use !== 'function')) {
      // Invalid router - doesn't have expected Express Router properties
      logger.warn('Skipping organization routes - router validation failed', {
        hasRouter: !!organizationRouter,
        routerType: typeof organizationRouter,
        hasStack: organizationRouter?.stack !== undefined,
        hasGet: typeof organizationRouter?.get === 'function',
        hasUse: typeof organizationRouter?.use === 'function'
      });
    } else {
      // Valid Express Router - has stack property or router methods
      // All validations passed - register routes
      // Final check right before app.use() to be absolutely sure
      if (typeof localAuthenticateToken !== 'function') {
        throw new Error(`localAuthenticateToken is not a function right before app.use(). Type: ${typeof localAuthenticateToken}`);
      }
      if (!organizationRouter) {
        throw new Error('organizationRouter is undefined when trying to register routes');
      }
      if (!safeAuthenticateToken || typeof safeAuthenticateToken !== 'function') {
        throw new Error(`safeAuthenticateToken is not a function right before app.use(). Type: ${typeof safeAuthenticateToken}`);
      }

      // Log what we're about to register for debugging
      logger.debug('Registering organization routes', {
        hasLocalAuth: !!localAuthenticateToken,
        localAuthType: typeof localAuthenticateToken,
        hasSafeAuth: !!safeAuthenticateToken,
        safeAuthType: typeof safeAuthenticateToken,
        hasRouter: !!organizationRouter,
        routerType: typeof organizationRouter,
        routerHasStack: organizationRouter.stack !== undefined,
        routerHasGet: typeof organizationRouter.get === 'function'
      });

      // Use the safe wrapper - ensure it's accessible
      const orgAuthMiddleware = safeAuthenticateToken;

      // Verify the middleware function is valid
      if (typeof orgAuthMiddleware !== 'function') {
        throw new Error(`orgAuthMiddleware is not a function. Type: ${typeof orgAuthMiddleware}, safeAuthenticateToken type: ${typeof safeAuthenticateToken}`);
      }

      try {
        // Final validation right before app.use() - log everything for debugging
        const middlewareArgs = [orgAuthMiddleware, organizationRouter];
        const invalidArg = middlewareArgs.find((arg, idx) => {
          if (idx === 0) {
            // First arg should be middleware function
            return !arg || typeof arg !== 'function';
          } else {
            // Second arg should be router
            return !arg || (typeof arg !== 'function' && !arg.stack);
          }
        });

        if (invalidArg !== undefined) {
          const argIndex = middlewareArgs.indexOf(invalidArg);
          const argName = argIndex === 0 ? 'orgAuthMiddleware' : 'organizationRouter';
          throw new Error(`Invalid ${argName} argument to app.use(). Index: ${argIndex}, Type: ${typeof invalidArg}, Value: ${invalidArg}, safeAuthenticateToken type: ${typeof safeAuthenticateToken}`);
        }

        logger.debug('About to register organization routes', {
          orgAuthMiddlewareType: typeof orgAuthMiddleware,
          orgAuthMiddlewareIsFunction: typeof orgAuthMiddleware === 'function',
          organizationRouterType: typeof organizationRouter,
          organizationRouterIsRouter: organizationRouter && typeof organizationRouter === 'function',
          safeAuthenticateTokenType: typeof safeAuthenticateToken,
          safeAuthenticateTokenIsFunction: typeof safeAuthenticateToken === 'function'
        });

        // CRITICAL: Validate one final time right before app.use() call
        // This is the last chance to catch undefined middleware before Express throws the error
        if (typeof orgAuthMiddleware !== 'function') {
          throw new Error(`orgAuthMiddleware is undefined right before app.use() call. Type: ${typeof orgAuthMiddleware}, safeAuthenticateToken type: ${typeof safeAuthenticateToken}`);
        }
        if (!organizationRouter || (typeof organizationRouter !== 'function' && !organizationRouter.stack)) {
          throw new Error(`organizationRouter is invalid right before app.use() call. Type: ${typeof organizationRouter}`);
        }

        // Use try-catch around the actual app.use() to catch Express's error and provide better context
        try {
          app.use('/api/organization', orgAuthMiddleware, organizationRouter);
        } catch (expressError) {
          logger.error('Express threw error during app.use() for organization routes', {
            expressError: expressError.message,
            orgAuthMiddlewareType: typeof orgAuthMiddleware,
            orgAuthMiddlewareValue: orgAuthMiddleware,
            organizationRouterType: typeof organizationRouter,
            organizationRouterValue: organizationRouter,
            safeAuthenticateTokenType: typeof safeAuthenticateToken,
            safeAuthenticateTokenValue: safeAuthenticateToken
          });
          throw expressError;
        }

        if (getMyOrganizations && typeof getMyOrganizations === 'function') {
          // Validate orgAuthMiddleware again before app.get()
          if (typeof orgAuthMiddleware !== 'function') {
            throw new Error(`orgAuthMiddleware is undefined right before app.get() call. Type: ${typeof orgAuthMiddleware}`);
          }
          app.get('/organizations', orgAuthMiddleware, getMyOrganizations);
        }

        logger.debug('Successfully registered organization routes');
      } catch (useError) {
        logger.error('Error registering organization routes', {
          error: useError.message,
          stack: useError.stack,
          safeAuthType: typeof safeAuthenticateToken,
          safeAuthValue: safeAuthenticateToken,
          middlewareType: typeof orgAuthMiddleware,
          middlewareValue: orgAuthMiddleware,
          routerType: typeof organizationRouter,
          routerValue: organizationRouter,
          NODE_ENV: getEnv('NODE_ENV', 'development')
        });
        throw useError;
      }
    }
  } catch (error) {
    logger.error('Failed to load organization routes', { error: error.message, stack: error.stack });
    throw error;
  }

  // Register routes with defensive checks to prevent undefined middleware errors
try {
  if (newEmailRoutes) {
    if (typeof newEmailRoutes !== 'function' && !newEmailRoutes.stack) {
      logger.warn('Skipping newEmailRoutes - invalid router');
    } else {
      app.use('/email', newEmailRoutes); // New email routes (registered first to take precedence)
    }
  }
} catch (e) {
  logger.error('Failed to register newEmailRoutes', { error: e.message });
}
try {
  if (emailRoutes) {
    if (typeof emailRoutes !== 'function' && !emailRoutes.stack) {
      logger.warn('Skipping emailRoutes - invalid router');
    } else {
      app.use('/email', emailRoutes); // Legacy routes (DEPRECATED - for backward compatibility only, only used if new routes don't match)
    }
  }
} catch (e) {
  logger.error('Failed to register emailRoutes', { error: e.message });
}
try {
  if (waitlistRoutes) {
    if (typeof waitlistRoutes !== 'function' && !waitlistRoutes.stack) {
      logger.warn('Skipping waitlistRoutes - invalid router');
    } else {
      app.use('/waitlist', waitlistRoutes); // Waitlist routes
    }
  }
} catch (e) {
  logger.error('Failed to register waitlistRoutes', { error: e.message });
}
try {
  if (accountRoutes) {
    if (typeof accountRoutes !== 'function' && !accountRoutes.stack) {
      logger.warn('Skipping accountRoutes - invalid router');
    } else {
      app.use('/account', accountRoutes); // Account routes
    }
  }
} catch (e) {
  logger.error('Failed to register accountRoutes', { error: e.message });
}
try {
  if (dashboardRoutes) {
    if (typeof dashboardRoutes !== 'function' && !dashboardRoutes.stack) {
      logger.warn('Skipping dashboardRoutes - invalid router');
    } else {
      app.use('/', dashboardRoutes); // Dashboard routes (/, /me, /dashboard)
    }
  }
} catch (e) {
  logger.error('Failed to register dashboardRoutes', { error: e.message });
}
try {
  if (dashboardChartsRoutes) {
    if (typeof dashboardChartsRoutes !== 'function' && !dashboardChartsRoutes.stack) {
      logger.warn('Skipping dashboardChartsRoutes - invalid router');
    } else {
      app.use('/', dashboardChartsRoutes); // Dashboard charts routes (/dashboard/usage/daily, /dashboard/usage/monthly, etc.)
    }
  }
} catch (e) {
  logger.error('Failed to register dashboardChartsRoutes', { error: e.message });
}
try {
  if (pluginAuthRoutes) {
    if (typeof pluginAuthRoutes !== 'function' && !pluginAuthRoutes.stack) {
      logger.warn('Skipping pluginAuthRoutes - invalid router');
    } else {
      app.use('/', pluginAuthRoutes); // Plugin authentication routes (/auth/plugin-init, /auth/refresh-token, /auth/me)
    }
  }
} catch (e) {
  logger.error('Failed to register pluginAuthRoutes', { error: e.message });
}
try {
  if (identityRoutes) {
    if (typeof identityRoutes !== 'function' && !identityRoutes.stack) {
      logger.warn('Skipping identityRoutes - invalid router');
    } else {
      app.use('/identity', identityRoutes); // Identity routes (/identity/sync, /identity/me)
    }
  }
} catch (e) {
  logger.error('Failed to register identityRoutes', { error: e.message });
}
try {
  if (analyticsRoutes) {
    if (typeof analyticsRoutes !== 'function' && !analyticsRoutes.stack) {
      logger.warn('Skipping analyticsRoutes - invalid router');
    } else {
      app.use('/analytics', analyticsRoutes); // Analytics routes (/analytics/log)
    }
  }
} catch (e) {
  logger.error('Failed to register analyticsRoutes', { error: e.message });
}
try {
  const eventsRoutes = require('./src/routes/events');
  if (eventsRoutes) app.use('/events', eventsRoutes); // Unified events routes (/events/log)
} catch (e) {
  logger.warn('Failed to load events routes', { error: e.message });
}
try {
  const partnerRoutes = require('./src/routes/partner');
  if (partnerRoutes) app.use('/partner', partnerRoutes); // Partner API routes
} catch (e) {
  logger.warn('Failed to load partner routes', { error: e.message });
}
// Credits webhook route (no auth required - called by Stripe)
try {
  const creditsRoutes = require('./src/routes/credits');
  if (creditsRoutes) app.use('/credits', creditsRoutes); // Credits routes (includes webhook without auth, other routes use authenticateToken)
} catch (e) {
  logger.warn('Failed to load credits routes', { error: e.message });
}

  // Generate alt text endpoint (Phase 2 with JWT auth + Phase 3 with organization support)
  // Use safe wrapper to ensure middleware is always valid
  // Validate safeCombinedAuth and requireSubscription before using them
  try {
    logger.debug('Registering /api/generate route');
    if (!safeCombinedAuth || typeof safeCombinedAuth !== 'function') {
      throw new Error(`safeCombinedAuth is not a function. Type: ${typeof safeCombinedAuth}`);
    }
    if (!requireSubscription || typeof requireSubscription !== 'function') {
      throw new Error(`requireSubscription is not a function. Type: ${typeof requireSubscription}`);
    }
    app.post('/api/generate', safeCombinedAuth, requireSubscription, async (req, res) => {
      const requestStartTime = Date.now();
      logger.info(`[Generate] Request received`, { timestamp: new Date().toISOString() });
      
      try {
        // Validate request payload with Zod
        const { safeParseGenerateInput } = require('./src/validation/generate');
        const validation = safeParseGenerateInput(req.body);

        if (!validation.success) {
          return httpErrors.validationFailed(res, 'Request validation failed', validation.error.flatten());
        }

        const { image_data, context, regenerate = false, service = 'alttext-ai', type } = validation.data;
        
        // Log detailed image data info for debugging token costs
        const hasBase64 = !!(image_data?.base64 || image_data?.image_base64);
        const hasUrl = !!image_data?.url;
        const imageDimensions = image_data?.width && image_data?.height 
          ? `${image_data.width}x${image_data.height}` 
          : 'unknown';
        const base64Length = image_data?.base64?.length || image_data?.image_base64?.length || 0;
        const base64SizeKB = base64Length ? Math.round(base64Length * 0.75 / 1024) : 0;
        
        logger.info(`[Generate] Request parsed`, { 
          imageId: image_data?.image_id || 'unknown',
          hasBase64,
          hasUrl,
          imageDimensions,
          base64Length,
          base64SizeKB,
          urlPreview: image_data?.url ? image_data.url.substring(0, 100) + '...' : null
        });

        // CRITICAL: Use X-Site-Hash for quota tracking, NOT X-WP-User-ID
        // X-WP-User-ID is only for analytics, not for quota tracking
        const siteHash = req.headers['x-site-hash'] || req.body?.siteHash;
        
        if (!siteHash) {
          return httpErrors.missingField(res, 'X-Site-Hash header');
        }

        // Extract WordPress user info from headers (for analytics only, NOT for quota)
        const wpUserId = req.headers['x-wp-user-id'] ? parseInt(req.headers['x-wp-user-id']) : null;
        const wpUserName = req.headers['x-wp-user-name'] || null;

        // Determine userId based on auth method (for analytics/logging only)
        const userId = req.user?.id || null;

        // Log for debugging
        logger.info(`[Generate] Request details`, { siteHash, userId, authMethod: req.authMethod });
        logger.info(`[Generate] Service details`, { service, type: type || 'not specified', wpUserId: wpUserId || 'N/A' });

        // Select API key based on service
        const apiKey = getServiceApiKey(service);

        const apiKeyEnvVar = service === 'seo-ai-meta' ? 'SEO_META_OPENAI_API_KEY' : 'ALTTEXT_OPENAI_API_KEY';
        logger.info(`[Generate] API Key check`, { 
          service, 
          envVar: apiKeyEnvVar, 
          isSet: !!process.env[apiKeyEnvVar] 
        });
        logger.info(`[Generate] Using API key`, { hasKey: !!apiKey });

        // Validate API key is configured
        if (!apiKey) {
          logger.error(`Missing OpenAI API key for service`, { service });
          return httpErrors.internalError(res, `Missing OpenAI API key for service: ${service}`, { code: 'GENERATION_ERROR' });
        }
        
        // Check if user should use credits for this request
        // Note: Subscription/credits check is handled by requireSubscription middleware
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
        
        // Site and quota are already validated by requireSubscription middleware
        // Use req.siteUsage which was set by combinedAuth/authenticateBySiteHashForQuota
        // If missing, fetch; also enforce remaining > 0 for site-based quota
        const siteUsage = req.siteUsage || await siteService.getSiteUsage(siteHash);
        if (!usingCredits && siteUsage?.remaining <= 0) {
          return httpErrors.rateLimitExceeded(
            res,
            'No credits remaining for this site. Please upgrade or wait for monthly reset.',
            { code: 'NO_ACCESS', reason: 'no_credits' }
          );
        }
        
        // Prepare limits object for compatibility with existing code
        const limits = {
          hasAccess: true,
          hasTokens: true,
          hasCredits: false,
          plan: siteUsage.plan,
          credits: siteUsage.remaining,
          tokensRemaining: siteUsage.remaining
        };
        
        // Handle meta generation differently from alt text
        if (type === 'meta' || (service === 'seo-ai-meta' && !image_data)) {
          // Meta tag generation - use the context directly as the prompt
          const systemMessage = {
            role: 'system',
            content: 'You are an expert SEO copywriter specializing in meta tag optimization. Always respond with valid JSON only.'
          };

          const userMessage = {
            role: 'user',
            content: context || ''
          };

          let openaiResponse;
          try {
            openaiResponse = await requestChatCompletion([systemMessage, userMessage], {
              apiKey,
              model: req.body.model || getEnv('OPENAI_MODEL', 'gpt-4o-mini'),
              max_tokens: 300,
              temperature: 0.7
            });
          } catch (error) {
            logger.error('Meta generation error', { error: error.response?.data || error.message });
            throw error;
          }

          // Validate OpenAI response structure for meta generation
          if (!openaiResponse?.choices?.[0]?.message?.content) {
            logger.error('[Generate] Invalid OpenAI response structure for meta generation', {
              hasResponse: !!openaiResponse,
              hasChoices: !!openaiResponse?.choices,
              choicesLength: openaiResponse?.choices?.length,
              hasMessage: !!openaiResponse?.choices?.[0]?.message,
              hasContent: !!openaiResponse?.choices?.[0]?.message?.content
            });
            return httpErrors.internalError(res, 'The AI service returned an unexpected response format', { code: 'INVALID_AI_RESPONSE' });
          }

          const content = openaiResponse.choices[0].message.content.trim();

          // Deduct credits if using credits (flag set by middleware), otherwise deduct from site quota
          let remainingCredits = creditsBalance;
          if (req.useCredit === true && req.creditIdentityId) {
            const spendResult = await creditsService.spendCredits(req.creditIdentityId, 1, {
              service,
              type: 'meta',
              site_hash: siteHash,
            });
            
            if (spendResult.success) {
              remainingCredits = spendResult.remainingBalance;
              logger.info(`[Generate] Deducted 1 credit for meta generation`, { remainingCredits });
            } else {
              logger.error(`[Generate] Failed to deduct credits`, { error: spendResult.error });
              // Fail the request if credit deduction fails
              throw new Error(`Failed to record credit usage: ${spendResult.error || 'Unknown error'}`);
            }
          } else {
            // CRITICAL: Deduct quota from site's quota (tracked by site_hash)
            // Do NOT deduct per user - all users on the same site share the quota
            try {
              // Ensure site exists before quota deduction
              logger.info('[Generate] Ensuring site exists before quota deduction (meta)', { siteHash: siteHash.substring(0, 8) + '...' });
              const site = await siteService.getOrCreateSite(siteHash);
              
              // Deduct quota
              logger.info('[Generate] Deducting quota from site (meta)', { 
                siteHash: siteHash.substring(0, 8) + '...',
                currentUsed: site.tokens_used || 0,
                currentRemaining: site.tokens_remaining || 0
              });
              await siteService.deductSiteQuota(siteHash, 1);
              logger.info('[Generate] Successfully deducted quota (meta)', { 
                siteHash: siteHash.substring(0, 8) + '...'
              });
              
              // Clear usage cache so plugin gets fresh data immediately
              if (clearCachedUsage) {
                clearCachedUsage(siteHash);
              }
            } catch (deductionError) {
              logger.error('[Generate] Failed to deduct quota (meta)', { 
                error: deductionError.message,
                stack: deductionError.stack,
                siteHash: siteHash.substring(0, 8) + '...'
              });
              // Fail the request if deduction fails (per user requirement)
              throw new Error(`Failed to record usage: ${deductionError.message}`);
            }
          }
          
          // Get updated usage after deduction (only if not using credits)
          const updatedUsage = usingCredits ? null : await siteService.getSiteUsage(siteHash);
          
          const planLimits = { free: 10, pro: 100, agency: 1000 }; // SEO AI Meta limits
          const limit = updatedUsage ? (planLimits[updatedUsage.plan] || 10) : null;
          const remaining = updatedUsage ? updatedUsage.remaining : null;
          const used = updatedUsage ? updatedUsage.used : 0;
          const resetDate = updatedUsage?.resetDate || getNextResetDate();
          const resetTimestamp = updatedUsage?.resetTimestamp || Math.floor(new Date(resetDate).getTime() / 1000);

          // Return the raw content (JSON string) for meta generation
          return res.json({
            success: true,
            alt_text: content, // Reusing alt_text field for backward compatibility
            content: content,  // Also include as content
            usage: {
              used: used !== null && used !== undefined ? used : 0,
              limit: limit !== null && limit !== undefined ? limit : 10,
              remaining: usingCredits ? null : (remaining !== null && remaining !== undefined ? remaining : 10),
              plan: limits.plan || 'free',
              credits: remainingCredits,
              usingCredits: usingCredits,
              resetDate: resetDate,
              resetTimestamp: resetTimestamp
            },
            tokens: openaiResponse.usage
          });
        }

        // Original alt text generation logic
        // Build OpenAI prompt and multimodal payload
        const prompt = buildPrompt(image_data, context, regenerate);
        
        // Build user message - this will validate base64 size and throw if oversized
        let userMessage;
        try {
          userMessage = buildUserMessage(prompt, image_data);
        } catch (base64Error) {
          // Base64 validation failed - return error to client
          logger.error('[Generate] Base64 validation failed', {
            error: base64Error.message,
            imageId: image_data?.image_id || 'unknown',
            dimensions: image_data?.width && image_data?.height ? `${image_data.width}x${image_data.height}` : 'unknown'
          });
          return httpErrors.validationFailed(res, base64Error.message, {
            code: 'INVALID_IMAGE_SIZE',
            field: 'image_data.base64',
            message: base64Error.message
          });
        }
        
        // Call OpenAI API
        const systemMessage = {
          role: 'system',
          content: 'You are an expert at writing concise, WCAG-compliant alternative text for images. Describe what is visually present without guessing. Mention on-screen text verbatim when it is legible. Keep responses to a single sentence in 8-16 words and avoid filler such as "image of".'
        };

        let openaiResponse;
        try {
          logger.info(`[Generate] Calling OpenAI API`, { imageId: image_data?.image_id || 'unknown' });
          const startTime = Date.now();
          openaiResponse = await requestChatCompletion([systemMessage, userMessage], {
            apiKey
          });
          const duration = Date.now() - startTime;
          const tokenUsage = openaiResponse?.usage;
          const totalTokens = tokenUsage?.total_tokens || 0;
          const promptTokens = tokenUsage?.prompt_tokens || 0;
          const completionTokens = tokenUsage?.completion_tokens || 0;
          
          // Log token usage with image dimensions for cost tracking
          const imageDimensions = image_data?.width && image_data?.height 
            ? `${image_data.width}x${image_data.height}` 
            : 'unknown';
          const imageSource = (image_data?.base64 || image_data?.image_base64) ? 'base64 (resized)' 
            : image_data?.inline?.data_url ? 'inline' 
            : image_data?.url ? 'url' 
            : 'none';
          
          // Calculate expected token range based on image dimensions
          let expectedTokens = null;
          if (image_data?.width && image_data?.height) {
            const maxDim = Math.max(image_data.width, image_data.height);
            if (maxDim <= 512) {
              expectedTokens = '~85';
            } else if (maxDim <= 1024) {
              expectedTokens = '~170';
            } else if (maxDim <= 2048) {
              expectedTokens = '~340';
            } else {
              expectedTokens = '~25,000+ (full-res)';
            }
          }
          
          // Warn if token count is unexpectedly high (suggests full-res image was processed)
          const isHighTokenUsage = totalTokens > 1000;
          const base64Data = image_data?.base64 || image_data?.image_base64;
          const base64SizeKB = base64Data ? Math.round(base64Data.length * 0.75 / 1024) : 0;
          const reportedMaxDim = image_data?.width && image_data?.height 
            ? Math.max(image_data.width, image_data.height) 
            : null;
          
          const tokenWarning = isHighTokenUsage 
            ? `⚠️ CRITICAL: High token usage (${totalTokens}). Expected ${expectedTokens || '~170-340'} for resized images. This suggests a full-resolution image was processed!` 
            : null;
          
          if (isHighTokenUsage) {
            logger.error(`[Generate] ⚠️ HIGH TOKEN USAGE DETECTED`, { 
              totalTokens,
              expectedTokens,
              imageDimensions,
              imageSource,
              hasBase64: !!base64Data,
              hasUrl: !!image_data?.url,
              base64Length: base64Data?.length || 0,
              base64SizeKB,
              reportedMaxDim,
              rootCause: base64SizeKB > 500 && reportedMaxDim && reportedMaxDim <= 1024
                ? 'Base64 contains full-resolution image despite metadata claiming resized dimensions. Plugin needs to resize BEFORE encoding to base64.'
                : 'Unknown - investigate base64 encoding or image dimensions',
              warning: tokenWarning
            });
          } else {
            logger.info(`[Generate] OpenAI API call completed`, { 
              duration: `${duration}ms`,
              totalTokens,
              promptTokens,
              completionTokens,
              imageDimensions,
              imageSource,
              expectedTokens
            });
          }
        } catch (error) {
          logger.error(`[Generate] OpenAI API call failed`, {
            message: error.message,
            code: error.code,
            status: error.response?.status
          });
          
          if (shouldDisableImageInput(error) && messageHasImage(userMessage)) {
            logger.warn('Image fetch failed, retrying without image input');
            const fallbackMessage = buildUserMessage(prompt, null, { forceTextOnly: true });
            try {
              openaiResponse = await requestChatCompletion([systemMessage, fallbackMessage], {
                apiKey
              });
            } catch (fallbackError) {
              logger.error('[Generate] Fallback request also failed', { error: fallbackError.message });
              throw fallbackError;
            }
          } else {
            throw error;
          }
        }
        
        // Validate OpenAI response structure
        if (!openaiResponse?.choices?.[0]?.message?.content) {
          logger.error('[Generate] Invalid OpenAI response structure', {
            hasResponse: !!openaiResponse,
            hasChoices: !!openaiResponse?.choices,
            choicesLength: openaiResponse?.choices?.length,
            hasMessage: !!openaiResponse?.choices?.[0]?.message,
            hasContent: !!openaiResponse?.choices?.[0]?.message?.content,
            response: JSON.stringify(openaiResponse, null, 2)
          });
          return httpErrors.internalError(res, 'The AI service returned an unexpected response format', { code: 'INVALID_AI_RESPONSE' });
        }
        
        const altText = openaiResponse.choices[0].message.content.trim();

        // Deduct credits if using credits (flag set by middleware), otherwise deduct from site quota
        let remainingCredits = creditsBalance;
        if (req.useCredit === true && req.creditIdentityId) {
          const spendResult = await creditsService.spendCredits(req.creditIdentityId, 1, {
            image_id: image_data?.image_id || null,
            service,
            site_hash: siteHash,
            type: 'alt-text',
          });
          
          if (spendResult.success) {
            remainingCredits = spendResult.remainingBalance;
            logger.info(`[Generate] Deducted 1 credit`, { remainingCredits });
          } else {
            logger.error(`[Generate] Failed to deduct credits`, { error: spendResult.error });
            // Fail the request if credit deduction fails
            throw new Error(`Failed to record credit usage: ${spendResult.error || 'Unknown error'}`);
          }
        } else {
          // CRITICAL: Deduct quota from site's quota (tracked by site_hash)
          // Do NOT deduct per user - all users on the same site share the quota
          try {
            // Ensure site exists (should already exist from middleware, but double-check)
            logger.info('[Generate] Ensuring site exists before quota deduction', { siteHash: siteHash.substring(0, 8) + '...' });
            const site = await siteService.getOrCreateSite(siteHash);
            
            // Deduct quota
            logger.info('[Generate] Deducting quota from site', { 
              siteHash: siteHash.substring(0, 8) + '...',
              currentUsed: site.tokens_used || 0,
              currentRemaining: site.tokens_remaining || 0
            });
            await siteService.deductSiteQuota(siteHash, 1);
            logger.info('[Generate] Successfully deducted quota', { 
              siteHash: siteHash.substring(0, 8) + '...'
            });
            
            // Clear usage cache so plugin gets fresh data immediately
            if (clearCachedUsage) {
              clearCachedUsage(siteHash);
            }
          } catch (deductionError) {
            logger.error('[Generate] Failed to deduct quota', { 
              error: deductionError.message,
              stack: deductionError.stack,
              siteHash: siteHash.substring(0, 8) + '...'
            });
            // Fail the request if deduction fails (per user requirement)
            throw new Error(`Failed to record usage: ${deductionError.message}`);
          }
        }
        
        // Get updated usage after deduction (only if not using credits)
        const updatedUsage = usingCredits ? null : await siteService.getSiteUsage(siteHash);
        
        const planLimits = { free: 50, pro: 1000, agency: 10000 };
        const limit = updatedUsage ? (planLimits[updatedUsage.plan] || 50) : null;
        const remaining = updatedUsage ? updatedUsage.remaining : null;
        const used = updatedUsage ? updatedUsage.used : null;
        const resetDate = updatedUsage?.resetDate || getNextResetDate();
        const resetTimestamp = updatedUsage?.resetTimestamp || Math.floor(new Date(resetDate).getTime() / 1000);
        
        // Return response with usage data
        res.json({
          success: true,
          alt_text: altText,
          usage: {
            used: used !== null && used !== undefined ? used : 0,
            limit: limit !== null && limit !== undefined ? limit : 50,
            remaining: usingCredits ? null : (remaining !== null && remaining !== undefined ? remaining : 50),
            plan: limits.plan || 'free',
            credits: remainingCredits,
            usingCredits: usingCredits,
            resetDate: resetDate,
            resetTimestamp: resetTimestamp
          },
          tokens: openaiResponse.usage
        });
        
      } catch (error) {
        const requestDuration = Date.now() - requestStartTime;
        const { image_data, context, regenerate = false, service = 'alttext-ai', type } = req.body || {};
        
        logger.error(`[Generate] Request failed after ${requestDuration}ms`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          service: service,
          duration: `${requestDuration}ms`,
          stack: error.stack?.split('\n').slice(0, 5).join('\n')
        });
        
        // Handle rate limiting
        if (error.response?.status === 429 || error.status === 429 || error.code === 'RATE_LIMIT_EXCEEDED') {
          return httpErrors.rateLimitExceeded(res, 'OpenAI rate limit reached. Please try again later.', { code: 'OPENAI_RATE_LIMIT' });
        }
        
        // Handle timeout errors
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          logger.error('[Generate] Request timed out - OpenAI API took too long to respond');
          return httpErrors.gatewayTimeout(res, 'The image generation is taking longer than expected. Please try again.', { code: 'TIMEOUT' });
        }

        // Extract error message from OpenAI response
        const openaiError = error.response?.data?.error;
        const openaiMessage = openaiError?.message || '';
        const openaiType = openaiError?.type || '';
        const openaiCode = openaiError?.code || '';
        
        // Check for API key errors specifically
        const isApiKeyError = openaiMessage?.toLowerCase().includes('incorrect api key') ||
                             openaiMessage?.toLowerCase().includes('invalid api key') ||
                             openaiMessage?.toLowerCase().includes('api key provided') ||
                             openaiType === 'invalid_request_error' && openaiCode === 'invalid_api_key';
        
        // Determine error message
        let errorMessage;
        let errorCode = 'GENERATION_ERROR';
        
        if (isApiKeyError) {
          // API key is invalid - this is a backend configuration issue
          errorMessage = 'The backend service has an invalid or expired OpenAI API key configured. Please contact support to update the API key.';
          errorCode = 'INVALID_API_KEY';
          // Get API key from closure or environment for logging
          const currentApiKey = (() => {
            try {
              // Try to get from the service-specific logic
              if (service === 'seo-ai-meta') {
                return getEnv('SEO_META_OPENAI_API_KEY') || getEnv('OPENAI_API_KEY');
              }
              return getEnv('ALTTEXT_OPENAI_API_KEY') || getEnv('OPENAI_API_KEY');
            } catch {
              return null;
            }
          })();
          
          logger.error('OpenAI API key error - backend configuration issue', {
            hasKey: !!currentApiKey,
            keyPrefix: currentApiKey ? currentApiKey.substring(0, 7) + '...' : 'missing',
            envVars: {
              ALTTEXT_OPENAI_API_KEY: !!getEnv('ALTTEXT_OPENAI_API_KEY'),
              OPENAI_API_KEY: !!getEnv('OPENAI_API_KEY'),
              SEO_META_OPENAI_API_KEY: !!getEnv('SEO_META_OPENAI_API_KEY')
            },
            service: service || 'unknown'
          });
        } else if (openaiMessage) {
          // Use OpenAI's error message
          errorMessage = openaiMessage;
        } else {
          // Fallback to generic message
          errorMessage = error.response?.data?.error || error.message || 'Failed to generate alt text';
        }

        res.status(500).json({
          ok: false,
          code: errorCode,
          reason: 'server_error',
          message: errorMessage,
        });
      }
    });
    logger.debug('Successfully registered /api/generate route');
  } catch (e) {
    logger.error('Failed to register /api/generate route', { error: e.message, stack: e.stack });
    throw e;
  }

  // Review existing alt text for accuracy
  // Use safe wrapper to ensure middleware is always valid
  // Validate safeAuthenticateToken and requireSubscription before using them
  try {
    logger.debug('Registering /api/review route');
    if (!safeAuthenticateToken || typeof safeAuthenticateToken !== 'function') {
      throw new Error(`safeAuthenticateToken is not a function. Type: ${typeof safeAuthenticateToken}`);
    }
    if (!requireSubscription || typeof requireSubscription !== 'function') {
      throw new Error(`requireSubscription is not a function. Type: ${typeof requireSubscription}`);
    }
    app.post('/api/review', safeAuthenticateToken, requireSubscription, async (req, res) => {
      try {
        const { alt_text, image_data, context, service = 'alttext-ai' } = req.body;

        if (!alt_text || typeof alt_text !== 'string') {
          return httpErrors.missingField(res, 'alt_text');
        }

        // Select API key based on service
        const apiKey = getReviewApiKey(service);

        const review = await reviewAltText(alt_text, image_data, context, apiKey);

        res.json({
          success: true,
          review,
          tokens: review?.usage
        });
      } catch (error) {
        logger.error('Review error', { error: error.response?.data || error.message });
        httpErrors.internalError(res, error.response?.data?.error?.message || error.message || 'Failed to review alt text', { code: 'REVIEW_ERROR' });
      }
    });
    logger.debug('Successfully registered /api/review route');
  } catch (e) {
    logger.error('Failed to register /api/review route', { error: e.message, stack: e.stack });
    throw e;
  }

  // Monthly reset webhook (protected by secret)
  app.post('/api/webhook/reset', async (req, res) => {
    try {
      const { secret } = req.body;
      
      if (secret !== getEnv('WEBHOOK_SECRET')) {
        return httpErrors.forbidden(res, 'Invalid secret', 'INVALID_SECRET');
      }
      
      const resetCount = await resetMonthlyTokens();
      
      res.json({
        success: true,
        message: 'Monthly tokens reset completed',
        usersReset: resetCount
      });
    } catch (error) {
      logger.error('Reset error', { error: error.message });
      httpErrors.internalError(res, 'Reset failed', { code: 'RESET_ERROR' });
    }
  });

  // Global error handler (must be last middleware)
  const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
  app.use(notFoundHandler); // 404 handler
  app.use(errorHandler); // Error handler

  // Capture unhandled errors with Sentry if available
  if (Sentry) {
    app.use(Sentry.Handlers.errorHandler());
  }

  // Final validation (works for both test and non-test mode)
  if (!app || typeof app.listen !== 'function') {
    const error = new Error(`[server-v2] Invalid app created: type=${typeof app}, hasListen=${typeof app?.listen}`);
    logger.error(error.message);
    throw error;
  }

  return app;
}

// ===== Export helpers ======================================================
// Export factory function as default and named for compatibility
module.exports = createApp;
module.exports.createApp = createApp;
module.exports.requestChatCompletion = requestChatCompletion;
module.exports.buildPrompt = buildPrompt;
module.exports.buildUserMessage = buildUserMessage;

// ============================================================================
// PROCESS-LEVEL ERROR HANDLERS
// ============================================================================
// These handlers run ONLY when the server is started via CLI (require.main === module)
// They do NOT run during Jest tests, keeping tests isolated and predictable
// ============================================================================
if (require.main === module) {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    
    // Send to Sentry if available
    if (Sentry) {
      Sentry.captureException(error);
    }
    
    // Exit process for uncaught exceptions (they're usually fatal)
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { promise: String(promise), reason: String(reason) });
    
    // Send to Sentry if available
    if (Sentry) {
      Sentry.captureException(reason);
    }
    
    // Don't exit - let the server continue running
  });

  // Start HTTP server
  const app = createApp();
  app.listen(PORT, () => {
    logger.info(`AltText AI Phase 2 API running on port ${PORT}`, { port: PORT });
    logger.info(`Version: 2.0.0 (Monetization)`);
    logger.info(`Environment: ${getEnv('NODE_ENV', 'development')}`, { 
      environment: getEnv('NODE_ENV', 'development') 
    });
    logger.info(`API Key check`, { 
      ALTTEXT_OPENAI_API_KEY: getEnv('ALTTEXT_OPENAI_API_KEY') ? 'SET' : 'NOT SET',
      SEO_META_OPENAI_API_KEY: getEnv('SEO_META_OPENAI_API_KEY') ? 'SET' : 'NOT SET'
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    process.exit(0);
  });
}

