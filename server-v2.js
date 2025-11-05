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
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, optionalAuth } = require('./auth/jwt');
const authRoutes = require('./auth/routes');
const { router: usageRoutes, recordUsage, checkUserLimits, useCredit, resetMonthlyTokens } = require('./routes/usage');
const billingRoutes = require('./routes/billing');

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Middleware
app.set('trust proxy', 1); // Trust proxy for rate limiting behind Render
app.use(helmet());
app.use(cors());

// Stripe webhook needs raw body - must come before express.json()
app.use('/billing/webhook', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes
app.use(express.json());

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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    phase: 'monetization'
  });
});

// Generate alt text endpoint (Phase 2 with JWT auth)
app.post('/api/generate', authenticateToken, async (req, res) => {
  try {
    const { image_data, context, regenerate = false } = req.body;
    const userId = req.user.id;
    
    // Check user limits
    const limits = await checkUserLimits(userId);
    
    if (!limits.hasAccess) {
      const planLimit = limits.plan === 'pro'
        ? 1000
        : (limits.plan === 'agency' ? 10000 : 50);
      return res.status(429).json({
        error: 'Monthly limit reached',
        code: 'LIMIT_REACHED',
        usage: {
          used: planLimit - limits.tokensRemaining,
          limit: planLimit,
          plan: limits.plan,
          resetDate: getNextResetDate()
        }
      });
    }
    
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
      openaiResponse = await requestChatCompletion([systemMessage, userMessage], {
        apiKey: process.env.OPENAI_API_KEY
      });
    } catch (error) {
      if (shouldDisableImageInput(error) && messageHasImage(userMessage)) {
        console.warn('Image fetch failed, retrying without image input...');
        const fallbackMessage = buildUserMessage(prompt, null, { forceTextOnly: true });
        openaiResponse = await requestChatCompletion([systemMessage, fallbackMessage], {
          apiKey: process.env.OPENAI_API_KEY
        });
      } else {
        throw error;
      }
    }
    
    const altText = openaiResponse.choices[0].message.content.trim();

    // Record usage (use credit if no monthly tokens, otherwise use token)
    if (limits.hasTokens) {
      await recordUsage(userId, image_data?.image_id, 'generate');
    } else if (limits.hasCredits) {
      await useCredit(userId);
    }

    // Get updated user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        tokensRemaining: true,
        credits: true,
        resetDate: true
      }
    });

    const planLimits = { free: 50, pro: 1000, agency: 10000 };
    const limit = planLimits[user.plan] || 50;
    const used = limit - user.tokensRemaining;
    
    // Return response with usage data
    res.json({
      success: true,
      alt_text: altText,
      usage: {
        used,
        limit,
        remaining: user.tokensRemaining,
        plan: user.plan,
        credits: user.credits,
        resetDate: getNextResetDate()
      },
      tokens: openaiResponse.usage
    });
    
  } catch (error) {
    console.error('Generate error:', error);
    
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'OpenAI rate limit reached. Please try again later.',
        code: 'OPENAI_RATE_LIMIT'
      });
    }

    const openaiMessage = error.response?.data?.error?.message;
    const fallbackMessage = error.response?.data?.error || error.message || 'Failed to generate alt text';
    const errorMessage = typeof openaiMessage === 'string' && openaiMessage.trim() !== ''
      ? openaiMessage
      : fallbackMessage;

    res.status(500).json({
      error: 'Failed to generate alt text',
      code: 'GENERATION_ERROR',
      message: errorMessage
    });
  }
});

// Review existing alt text for accuracy
app.post('/api/review', authenticateToken, async (req, res) => {
  try {
    const { alt_text, image_data, context } = req.body;

    if (!alt_text || typeof alt_text !== 'string') {
      return res.status(400).json({
        error: 'Alt text is required',
        code: 'MISSING_ALT_TEXT'
      });
    }

    const review = await reviewAltText(alt_text, image_data, context);

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

  if (allowImage && imageData?.inline?.data_url) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageData.inline.data_url } }
      ]
    };
  }

  const hasUsableUrl = allowImage && imageData?.url && isLikelyPublicUrl(imageData.url);

  if (hasUsableUrl) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageData.url } }
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
    apiKey = process.env.OPENAI_API_KEY
  } = overrides;

  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }

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
      }
    }
  );

  return {
    choices: response.data.choices,
    usage: response.data.usage
  };
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

async function reviewAltText(altText, imageData, context) {
  if (!altText || typeof altText !== 'string') {
    return null;
  }

  const hasInline = Boolean(imageData?.inline?.data_url);
  const hasPublicUrl = imageData?.url && isLikelyPublicUrl(imageData.url);

  if (!hasInline && !hasPublicUrl) {
    return null;
  }

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
      apiKey: process.env.OPENAI_REVIEW_API_KEY || process.env.OPENAI_API_KEY
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
        apiKey: process.env.OPENAI_REVIEW_API_KEY || process.env.OPENAI_API_KEY
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AltText AI Phase 2 API running on port ${PORT}`);
  console.log(`📅 Version: 2.0.0 (Monetization)`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
