/**
 * AltText AI - Phase 2 API Server
 * Full SaaS backend with user accounts, JWT auth, and Stripe billing
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { supabase } = require('./db/supabase-client');
const { authenticateToken, optionalAuth } = require('./auth/jwt');
const { combinedAuth } = require('./src/middleware/dual-auth');
const { getServiceApiKey, getReviewApiKey } = require('./src/utils/apiKey');
const authRoutes = require('./auth/routes');
const { router: usageRoutes, recordUsage, checkUserLimits, useCredit, resetMonthlyTokens, checkOrganizationLimits, recordOrganizationUsage, useOrganizationCredit, resetOrganizationTokens } = require('./routes/usage');
const billingRoutes = require('./routes/billing');
const licensesRoutes = require('./routes/licenses');
const licenseRoutes = require('./routes/license');
const organizationRoutes = require('./routes/organization');
const emailRoutes = require('./routes/email'); // Legacy routes
const newEmailRoutes = require('./src/routes/email'); // New email routes

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', 1); // Trust proxy for rate limiting behind Render
app.use(helmet());
app.use(cors());

// Stripe webhook needs raw body - must come before express.json()
app.use('/billing/webhook', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes - increased limit to 2MB for image base64 encoding
app.use(express.json({ limit: '2mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Routes
app.use('/auth', authRoutes);
app.use('/usage', usageRoutes);
app.use('/billing', billingRoutes);
app.use('/api/licenses', licensesRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/organization', authenticateToken, organizationRoutes);
app.use('/email', newEmailRoutes); // New email routes (registered first to take precedence)
app.use('/email', emailRoutes); // Legacy routes (for backward compatibility, only used if new routes don't match)

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    phase: 'monetization'
  });
});

// Generate alt text endpoint (Phase 2 with JWT auth + Phase 3 with organization support)
app.post('/api/generate', combinedAuth, async (req, res) => {
  const requestStartTime = Date.now();
  console.log(`[Generate] Request received at ${new Date().toISOString()}`);
  
  try {
    const { image_data, context, regenerate = false, service = 'alttext-ai', type } = req.body;
    console.log(`[Generate] Request parsed, image_id: ${image_data?.image_id || 'unknown'}`);

    // Determine userId based on auth method
    const userId = req.user?.id || null;

    // Log for debugging
    console.log(`[Generate] User ID: ${userId}, Type: ${typeof userId}, Auth Method: ${req.authMethod}`);
    console.log(`[Generate] Service: ${service}, Type: ${type || 'not specified'}, Auth: ${req.authMethod}, Org ID: ${req.organization?.id || 'N/A'}`);

    // Select API key based on service
    const apiKey = getServiceApiKey(service);

    console.log(`[Generate] API Key check - ${service === 'seo-ai-meta' ? 'SEO_META_OPENAI_API_KEY' : 'ALTTEXT_OPENAI_API_KEY'}: ${process.env[service === 'seo-ai-meta' ? 'SEO_META_OPENAI_API_KEY' : 'ALTTEXT_OPENAI_API_KEY'] ? 'SET' : 'NOT SET'}`);
    console.log(`[Generate] Using API key: ${apiKey ? apiKey.substring(0, 7) + '...' : 'NONE'}`);

    // Validate API key is configured
    if (!apiKey) {
      console.error(`Missing OpenAI API key for service: ${service}`);
      return res.status(500).json({
        error: 'Failed to generate content',
        code: 'GENERATION_ERROR',
        message: `Missing OpenAI API key for service: ${service}`
      });
    }
    
    // Check limits - use organization limits if available, otherwise user limits
    let limits;
    if (req.organization) {
      limits = await checkOrganizationLimits(req.organization.id);
      console.log(`[Generate] Using organization ${req.organization.id} quota: ${limits.credits || 0} remaining`);
    } else if (userId) {
      console.log(`[Generate] Checking user limits for userId: ${userId} (type: ${typeof userId})`);
      limits = await checkUserLimits(userId);
      console.log(`[Generate] Using user ${userId} quota: ${limits.credits || 0} remaining`);
    } else {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    
    if (!limits.hasAccess) {
      const planLimit = limits.plan === 'pro'
        ? 1000
        : (limits.plan === 'agency' ? 10000 : 50);
      return res.status(429).json({
        error: 'Monthly limit reached',
        code: 'LIMIT_REACHED',
        usage: {
          used: planLimit - (limits.credits || 0),
          limit: planLimit,
          plan: limits.plan,
          resetDate: getNextResetDate()
        }
      });
    }
    
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
          model: req.body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
          max_tokens: 300,
          temperature: 0.7
        });
      } catch (error) {
        console.error('Meta generation error:', error.response?.data || error.message);
        throw error;
      }

      // Validate OpenAI response structure for meta generation
      if (!openaiResponse?.choices?.[0]?.message?.content) {
        console.error('[Generate] Invalid OpenAI response structure for meta generation:', {
          hasResponse: !!openaiResponse,
          hasChoices: !!openaiResponse?.choices,
          choicesLength: openaiResponse?.choices?.length,
          hasMessage: !!openaiResponse?.choices?.[0]?.message,
          hasContent: !!openaiResponse?.choices?.[0]?.message?.content
        });
        return res.status(500).json({
          error: 'Invalid response from AI service',
          code: 'INVALID_AI_RESPONSE',
          message: 'The AI service returned an unexpected response format'
        });
      }

      const content = openaiResponse.choices[0].message.content.trim();

      // Extract WordPress user info from headers
      const wpUserId = req.headers['x-wp-user-id'] ? parseInt(req.headers['x-wp-user-id']) : null;
      const wpUserName = req.headers['x-wp-user-name'] || null;

      // Record usage - organization or user based
      if (req.organization) {
        if (limits.hasTokens) {
          await recordOrganizationUsage(req.organization.id, userId, null, 'generate', 'seo-ai-meta', wpUserId, wpUserName);
        } else if (limits.hasCredits) {
          await useOrganizationCredit(req.organization.id, userId);
        }
      } else {
      if (limits.hasTokens) {
        await recordUsage(userId, null, 'generate', 'seo-ai-meta', wpUserId, wpUserName);
      } else if (limits.hasCredits) {
        await useCredit(userId);
      }
      }

      // Use limits already calculated from checkUserLimits/checkOrganizationLimits
      // No need to query database again - limits object has all the info we need
      const planLimits = { free: 10, pro: 100, agency: 1000 }; // SEO AI Meta limits
      const limit = planLimits[limits.plan] || 10;
      const remaining = limits.credits || 0; // Use credits from limits (which includes monthly limit calculation)
      const used = limit - remaining;

      // Return the raw content (JSON string) for meta generation
      return res.json({
        success: true,
        alt_text: content, // Reusing alt_text field for backward compatibility
        content: content,  // Also include as content
        usage: {
          used,
          limit,
          remaining: remaining,
          plan: limits.plan,
          credits: limits.credits || 0,
          resetDate: getNextResetDate()
        },
        tokens: openaiResponse.usage
      });
    }

    // Original alt text generation logic
    // Build OpenAI prompt and multimodal payload
    const prompt = buildPrompt(image_data, context, regenerate);
    const userMessage = buildUserMessage(prompt, image_data);
    
    // Call OpenAI API
    const systemMessage = {
      role: 'system',
      content: 'You are an expert at writing concise, WCAG-compliant alternative text for images. Describe what is visually present without guessing. Mention on-screen text verbatim when it is legible. Keep responses to a single sentence in 8-16 words and avoid filler such as "image of".'
    };

    let openaiResponse;
    try {
      console.log(`[Generate] Calling OpenAI API for image_id: ${image_data?.image_id || 'unknown'}`);
      const startTime = Date.now();
      openaiResponse = await requestChatCompletion([systemMessage, userMessage], {
        apiKey
      });
      const duration = Date.now() - startTime;
      console.log(`[Generate] OpenAI API call completed in ${duration}ms`);
    } catch (error) {
      console.error(`[Generate] OpenAI API call failed:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status
      });
      
      if (shouldDisableImageInput(error) && messageHasImage(userMessage)) {
        console.warn('Image fetch failed, retrying without image input...');
        const fallbackMessage = buildUserMessage(prompt, null, { forceTextOnly: true });
        try {
          openaiResponse = await requestChatCompletion([systemMessage, fallbackMessage], {
            apiKey
          });
        } catch (fallbackError) {
          console.error('[Generate] Fallback request also failed:', fallbackError.message);
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
    
    // Validate OpenAI response structure
    if (!openaiResponse?.choices?.[0]?.message?.content) {
      console.error('[Generate] Invalid OpenAI response structure:', {
        hasResponse: !!openaiResponse,
        hasChoices: !!openaiResponse?.choices,
        choicesLength: openaiResponse?.choices?.length,
        hasMessage: !!openaiResponse?.choices?.[0]?.message,
        hasContent: !!openaiResponse?.choices?.[0]?.message?.content,
        response: JSON.stringify(openaiResponse, null, 2)
      });
      return res.status(500).json({
        error: 'Invalid response from AI service',
        code: 'INVALID_AI_RESPONSE',
        message: 'The AI service returned an unexpected response format'
      });
    }
    
    const altText = openaiResponse.choices[0].message.content.trim();

    // Extract WordPress user info from headers
    const wpUserId = req.headers['x-wp-user-id'] ? parseInt(req.headers['x-wp-user-id']) : null;
    const wpUserName = req.headers['x-wp-user-name'] || null;

    // Record usage - organization or user based
    if (req.organization) {
      if (limits.hasTokens) {
        await recordOrganizationUsage(req.organization.id, userId, image_data?.image_id, 'generate', service, wpUserId, wpUserName);
      } else if (limits.hasCredits) {
        await useOrganizationCredit(req.organization.id, userId);
      }
    } else {
    if (limits.hasTokens) {
      await recordUsage(userId, image_data?.image_id, 'generate', service, wpUserId, wpUserName);
    } else if (limits.hasCredits) {
      await useCredit(userId);
    }
    }

    // Use limits already calculated from checkUserLimits/checkOrganizationLimits
    // No need to query database again - limits object has all the info we need
    const planLimits = { free: 50, pro: 1000, agency: 10000 };
    const limit = planLimits[limits.plan] || 50;
    const remaining = limits.credits || 0; // Use credits from limits (which includes monthly limit calculation)
    const used = limit - remaining;
    
    // Return response with usage data
    res.json({
      success: true,
      alt_text: altText,
      usage: {
        used,
        limit,
        remaining: remaining,
        plan: limits.plan,
        credits: limits.credits || 0,
        resetDate: getNextResetDate()
      },
      tokens: openaiResponse.usage
    });
    
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    const { image_data, context, regenerate = false, service = 'alttext-ai', type } = req.body || {};
    
    console.error(`[Generate] Request failed after ${requestDuration}ms:`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      service: service,
      stack: error.stack?.split('\n').slice(0, 5).join('\n')
    });
    
    // Handle rate limiting
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'OpenAI rate limit reached. Please try again later.',
        code: 'OPENAI_RATE_LIMIT'
      });
    }
    
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.error('[Generate] Request timed out - OpenAI API took too long to respond');
      return res.status(504).json({
        error: 'Request timeout',
        code: 'TIMEOUT',
        message: 'The image generation is taking longer than expected. Please try again.'
      });
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
            return process.env.SEO_META_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
          }
          return process.env.ALTTEXT_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        } catch {
          return null;
        }
      })();
      
      console.error('OpenAI API key error - backend configuration issue:', {
        hasKey: !!currentApiKey,
        keyPrefix: currentApiKey ? currentApiKey.substring(0, 7) + '...' : 'missing',
        envVars: {
          ALTTEXT_OPENAI_API_KEY: !!process.env.ALTTEXT_OPENAI_API_KEY,
          OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
          SEO_META_OPENAI_API_KEY: !!process.env.SEO_META_OPENAI_API_KEY
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
      error: 'Failed to generate alt text',
      code: errorCode,
      message: errorMessage
    });
  }
});

// Review existing alt text for accuracy
app.post('/api/review', authenticateToken, async (req, res) => {
  try {
    const { alt_text, image_data, context, service = 'alttext-ai' } = req.body;

    if (!alt_text || typeof alt_text !== 'string') {
      return res.status(400).json({
        error: 'Alt text is required',
        code: 'MISSING_ALT_TEXT'
      });
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
    console.error('Review error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to review alt text',
      code: 'REVIEW_ERROR',
      message: error.response?.data?.error?.message || error.message
    });
  }
});

// Backward compatibility endpoint for Phase 1 domains (temporary)
app.post('/api/generate-legacy', optionalAuth, async (req, res) => {
  try {
    const { domain, image_data, context, regenerate = false } = req.body;
    
    if (!domain) {
      return res.status(400).json({ 
        error: 'Domain is required for legacy endpoint',
        code: 'MISSING_DOMAIN'
      });
    }
    
    // For now, redirect to new auth-required endpoint
    return res.status(410).json({
      error: 'Legacy domain-based authentication is deprecated. Please create an account.',
      code: 'LEGACY_DEPRECATED',
      upgradeUrl: '/auth/register'
    });
    
  } catch (error) {
    console.error('Legacy generate error:', error);
    res.status(500).json({
      error: 'Legacy endpoint error',
      code: 'LEGACY_ERROR'
    });
  }
});

// Monthly reset webhook (protected by secret)
app.post('/api/webhook/reset', async (req, res) => {
  try {
    const { secret } = req.body;
    
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    const resetCount = await resetMonthlyTokens();
    
    res.json({
      success: true,
      message: 'Monthly tokens reset completed',
      usersReset: resetCount
    });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// Helper functions (reused from Phase 1)
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

  // Check for base64-encoded image (from frontend for localhost URLs)
  // Support both 'base64' and 'image_base64' field names for compatibility
  const base64Data = imageData?.base64 || imageData?.image_base64;
  if (allowImage && base64Data && imageData?.mime_type) {
    const dataUrl = `data:${imageData.mime_type};base64,${base64Data}`;
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl, ...imageUrlConfig } }
      ]
    };
  }

  // Check for inline data URL
  if (allowImage && imageData?.inline?.data_url) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageData.inline.data_url, ...imageUrlConfig } }
      ]
    };
  }

  // Check for public URL
  const hasUsableUrl = allowImage && imageData?.url && isLikelyPublicUrl(imageData.url);
  if (hasUsableUrl) {
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
    model = process.env.OPENAI_MODEL || 'gpt-4o-mini',
    max_tokens = 100,
    temperature = 0.2,
    apiKey = process.env.ALTTEXT_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  } = overrides;

  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }

  console.log(`[OpenAI] Making request to OpenAI API with model: ${model}`);
  console.log(`[OpenAI] Messages count: ${messages.length}`);
  console.log(`[OpenAI] API Key present: ${apiKey ? 'YES' : 'NO'}`);

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
    
    console.log(`[OpenAI] Request successful, received response`);
    const payload = response && response.data ? response.data : response || {};
    return {
      choices: payload?.choices || [],
      usage: payload?.usage || null
    };
  } catch (error) {
    console.error('[OpenAI] Request failed:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
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

  const hasInline = Boolean(imageData?.inline?.data_url);
  const hasPublicUrl = imageData?.url && isLikelyPublicUrl(imageData.url);

  if (!hasInline && !hasPublicUrl) {
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
      model: process.env.OPENAI_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
        model: process.env.OPENAI_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
    model: process.env.OPENAI_REVIEW_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
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

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit - let the server continue running
  // Render will restart if needed
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit - let the server continue running
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 AltText AI Phase 2 API running on port ${PORT}`);
    console.log(`📅 Version: 2.0.0 (Monetization)`);
    console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 API Key check - ALTTEXT_OPENAI_API_KEY: ${process.env.ALTTEXT_OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
    console.log(`🔑 API Key check - SEO_META_OPENAI_API_KEY: ${process.env.SEO_META_OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
  });
}

module.exports = app;
