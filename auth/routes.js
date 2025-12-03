/**
 * Authentication routes
 */

const express = require('express');
const crypto = require('crypto');
const { supabase } = require('../db/supabase-client');
const { generateToken, hashPassword, comparePassword, authenticateToken, generateRefreshToken, verifyRefreshToken, REFRESH_TOKEN_EXPIRES_IN } = require('./jwt');
const emailService = require('../src/services/emailService');
const licenseService = require('../src/services/licenseService');
const { getOrCreateIdentity } = require('../src/services/identityService');
const billingService = require('../src/services/billingService');
const { rateLimitByUser } = require('../src/middleware/rateLimiter');
const logger = require('../src/utils/logger');
const { getEnv, isProduction } = require('../config/loadEnv');
const { errors: httpErrors } = require('../src/utils/http');

const router = express.Router();

// Simple in-memory cache for /auth/me responses
// Key: user email, Value: { data, timestamp }
const authMeCache = new Map();
const AUTH_ME_CACHE_TTL = 5000; // 5 seconds - short cache to reduce duplicate requests

function getCachedAuthMe(email) {
  const cached = authMeCache.get(email);
  if (cached && Date.now() - cached.timestamp < AUTH_ME_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedAuthMe(email, data) {
  authMeCache.set(email, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Generate a secure random token for password reset
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Register new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, service = 'alttext-ai', siteUrl, siteHash, installId } = req.body;

    // Validate input
    if (!email || !password) {
      return httpErrors.missingField(res, 'email and password');
    }

    if (password.length < 8) {
      return httpErrors.invalidInput(res, 'Password must be at least 8 characters', { code: 'WEAK_PASSWORD' });
    }

    // Validate service
    const validServices = ['alttext-ai', 'seo-ai-meta'];
    const userService = validServices.includes(service) ? service : 'alttext-ai';

    // Service-specific initial limits
    const initialLimits = {
      'alttext-ai': 50,
      'seo-ai-meta': 10
    };

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return httpErrors.conflict(res, 'User already exists with this email', { code: 'USER_EXISTS' });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    
    // Build insert object - only include columns that exist in Supabase
    // Supabase schema may not have all columns from Prisma schema
    const userData = {
      email: email.toLowerCase(),
      password_hash: passwordHash,
      plan: 'free'
    };
    
    // Note: service and tokens_remaining columns don't exist in Supabase
    // They may need to be added via migration or are handled differently
    
    const { data: user, error: createError } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (createError) {
      logger.error('Registration error details', {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint
      });
      throw createError;
    }
    
    if (!user) {
      throw new Error('User creation returned no data');
    }

    // Generate JWT token
    const token = generateToken(user);

    // Create free-tier license
    let license = null;
    let licenseSnapshot = null;
    try {
      logger.info('Creating free license for user', { userId: user.id });

      license = await licenseService.createLicense({
        plan: 'free',
        service: userService,
        userId: user.id,
        siteUrl: siteUrl || null,
        siteHash: siteHash || null,
        installId: installId || null,
        email: user.email,
        name: user.email.split('@')[0]
      });

      // Get license snapshot
      licenseSnapshot = await licenseService.getLicenseSnapshot(license.id);

      logger.info('Free license created', { userId: user.id, licenseKey: license.licenseKey });
    } catch (licenseError) {
      logger.error('Error creating free license (non-critical)', {
        error: licenseError.message,
        stack: licenseError.stack,
        userId: user.id
      });
      // Don't fail registration if license creation fails
      // User can still use the system
    }

    // Send welcome email (non-blocking)
    emailService.sendDashboardWelcome({ email: user.email }).catch(err => {
      logger.error('Failed to send welcome email (non-critical)', {
        error: err.message,
        stack: err.stack,
        email: user.email
      });
      // Don't fail registration if email fails
    });

    // Build response with license info if available
    const response = {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        tokensRemaining: licenseSnapshot?.tokensRemaining || initialLimits[userService] || 50,
        credits: user.credits || 0,
        resetDate: user.reset_date || user.resetDate,
        service: user.service || userService
      }
    };

    // Include license in response if created
    if (licenseSnapshot) {
      response.license = licenseSnapshot;
    }

    res.status(201).json(response);

  } catch (error) {
    logger.error('Registration error', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    return httpErrors.internalError(res, error.message || 'Failed to create account', { code: 'REGISTRATION_ERROR', details: error.details || null });
  }
});

/**
 * Login user
 * Supports both password and magic link flows
 * - If password is provided: traditional password login
 * - If only email is provided: send magic link email
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, redirectUrl } = req.body;

    // Validate input
    if (!email) {
      return httpErrors.missingField(res, 'email');
    }

    const emailLower = email.toLowerCase();

    // Magic link flow (no password provided)
    if (!password) {
      // Generate magic link token
      const token = generateResetToken(); // Reuse reset token generator
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store token in password_reset_tokens table (reuse for magic links)
      // We'll use a special type or just reuse the table
      // For now, store it and we'll check in verify endpoint
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('email', emailLower)
        .single();

      // Always return success to prevent email enumeration
      if (user) {
        // Invalidate any existing unused tokens
        await supabase
          .from('password_reset_tokens')
          .update({ used: true })
          .eq('userId', user.id)
          .eq('used', false);

        // Store new token
        await supabase
          .from('password_reset_tokens')
          .insert({
            userId: user.id,
            token,
            expiresAt: expiresAt.toISOString(),
            used: false
          });

        // Send magic link email
        emailService.sendMagicLink({
          email: emailLower,
          token,
          redirectUrl
        }).catch(err => {
          logger.error('Failed to send magic link email', {
            error: err.message,
            stack: err.stack,
            email: emailLower
          });
        });
      }

      return res.json({
        success: true,
        message: 'If an account exists with this email, a magic link has been sent.',
        method: 'magic_link'
      });
    }

    // Password login flow
    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', emailLower)
      .single();

    if (userError || !user) {
      return httpErrors.authenticationRequired(res, 'Invalid email or password', { code: 'INVALID_CREDENTIALS' });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return httpErrors.authenticationRequired(res, 'Invalid email or password', { code: 'INVALID_CREDENTIALS' });
    }

    // Get or create identity
    const identity = await getOrCreateIdentity(emailLower, 'alttext-ai', null);
    
    // Get subscription plan
    const subscriptionCheck = await billingService.checkSubscription(emailLower, 'alttext-ai');
    const plan = subscriptionCheck.plan || 'free';

    // Generate JWT token with identityId
    const tokenPayload = {
      id: user.id,
      identityId: identity?.id || user.id,
      email: user.email,
      plan: plan
    };
    const token = generateToken(tokenPayload);

    // Generate and store refresh token
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days

    if (identity) {
      await supabase
        .from('identities')
        .update({
          refresh_token: refreshToken,
          refresh_token_expires_at: refreshExpiresAt.toISOString(),
          last_seen_at: new Date().toISOString()
        })
        .eq('id', identity.id);
    }

    // Service-specific default limits
    const defaultLimits = {
      'alttext-ai': 50,
      'seo-ai-meta': 10
    };
    const userService = user.service || 'alttext-ai';

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        identityId: identity?.id || user.id,
        email: user.email,
        plan: plan,
        tokensRemaining: user.tokens_remaining || user.tokensRemaining || defaultLimits[userService] || 50,
        credits: user.credits || 0,
        resetDate: user.reset_date || user.resetDate,
        service: userService
      }
    });

  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to login', { code: 'LOGIN_ERROR' });
  }
});

/**
 * Verify magic link token
 * POST /auth/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const { email, token, redirectUrl } = req.body;

    // Validate input
    if (!email || !token) {
      return httpErrors.missingField(res, 'email and token');
    }

    const emailLower = email.toLowerCase();

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailLower)
      .single();

    if (userError || !user) {
      return httpErrors.notFound(res, 'User', { code: 'INVALID_TOKEN', message: 'Invalid verification token' });
    }

    // Find valid token
    const { data: resetToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('userId', user.id)
      .eq('token', token)
      .eq('used', false)
      .gt('expiresAt', new Date().toISOString())
      .single();

    if (tokenError || !resetToken) {
      return httpErrors.invalidInput(res, 'Invalid or expired verification token', { code: 'INVALID_TOKEN' });
    }

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', resetToken.id);

    // Get or create identity
    const identity = await getOrCreateIdentity(emailLower, 'alttext-ai', null);
    
    // Get subscription plan
    const subscriptionCheck = await billingService.checkSubscription(emailLower, 'alttext-ai');
    const plan = subscriptionCheck.plan || 'free';

    // Generate JWT token with identityId
    const tokenPayload = {
      id: user.id,
      identityId: identity?.id || user.id,
      email: emailLower,
      plan: plan
    };
    const jwtToken = generateToken(tokenPayload);

    // Generate and store refresh token
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days

    if (identity) {
      await supabase
        .from('identities')
        .update({
          refresh_token: refreshToken,
          refresh_token_expires_at: refreshExpiresAt.toISOString(),
          last_seen_at: new Date().toISOString()
        })
        .eq('id', identity.id);
    }

    res.json({
      success: true,
      token: jwtToken,
      refreshToken,
      user: {
        id: user.id,
        identityId: identity?.id || user.id,
        email: emailLower,
        plan: plan
      },
      redirectUrl: redirectUrl || null
    });

  } catch (error) {
    logger.error('Verify error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to verify token', { code: 'VERIFY_ERROR' });
  }
});

/**
 * Get current user info
 * Returns full profile from identities table with subscription and installations
 */
// Rate limit /auth/me: 30 requests per 15 minutes per authenticated user
// This prevents abuse while allowing legitimate authenticated requests
router.get('/me', rateLimitByUser(15 * 60 * 1000, 30, 'Too many requests to /auth/me. Limit: 30 requests per 15 minutes.'), authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    if (!email) {
      return httpErrors.validationFailed(res, 'Email not found in token');
    }

    const emailLower = email.toLowerCase();
    
    // Check cache first (5 second TTL to reduce duplicate requests during plugin initialization)
    const cached = getCachedAuthMe(emailLower);
    if (cached) {
      return res.json(cached);
    }

    const identityId = req.user.identityId || req.user.id;

    // Fetch all data in parallel
    const [identityResult, userResult, subscriptionResult, installationsResult] = await Promise.all([
      // Get identity
      supabase
        .from('identities')
        .select('*')
        .eq('id', identityId)
        .single(),
      
      // Get user (legacy support)
      supabase
        .from('users')
        .select('id, email, plan, created_at')
        .eq('email', emailLower)
        .single(),
      
      // Get subscription
      billingService.checkSubscription(emailLower, 'alttext-ai'),
      
      // Get installations
      supabase
        .from('plugin_installations')
        .select('*')
        .eq('email', emailLower)
        .order('last_seen_at', { ascending: false }),
    ]);

    const identity = identityResult.data;
    const user = userResult.data;
    const subscription = subscriptionResult.subscription;
    const installations = installationsResult.data || [];

    // Build response
    const response = {
      success: true,
      user: {
        id: user?.id || identityId,
        identityId: identity?.id || identityId,
        email: emailLower,
        plan: subscriptionResult.plan || user?.plan || 'free',
        subscription: subscription || null,
        installations: installations,
        createdAt: identity?.created_at || user?.created_at,
        lastSeenAt: identity?.last_seen_at,
      }
    };

    // Cache response for 5 seconds to reduce duplicate requests
    setCachedAuthMe(emailLower, response);

    res.json(response);

  } catch (error) {
    logger.error('Get user error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to get user info', { code: 'USER_INFO_ERROR' });
  }
});

/**
 * Refresh token (if needed in future)
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (userError || !user) {
      return httpErrors.notFound(res, 'User');
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token
    });

  } catch (error) {
    logger.error('Token refresh error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to refresh token', { code: 'REFRESH_ERROR' });
  }
});

/**
 * Request password reset (forgot password)
 * POST /auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, siteUrl } = req.body;

    // Validate input
    if (!email) {
      return httpErrors.missingField(res, 'email', 'MISSING_EMAIL');
    }

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    // Always return success to prevent email enumeration
    // We don't want attackers to know if an email exists
    if (userError || !user) {
      // Still return success, but don't send email
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    // Check for recent reset requests (rate limiting - max 3 per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentResets, error: countError } = await supabase
      .from('password_reset_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('userId', user.id)
      .gte('createdAt', oneHourAgo)
      .eq('used', false);

    if (countError) {
      throw countError;
    }

    if (recentResets >= 3) {
      return httpErrors.rateLimitExceeded(res, 'Too many password reset requests. Please wait 1 hour before requesting another reset.');
    }

    // Invalidate any existing unused tokens for this user
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('userId', user.id)
      .eq('used', false)
      .gt('expiresAt', new Date().toISOString());

    // Generate reset token
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Save token to database
    const { error: tokenError } = await supabase
      .from('password_reset_tokens')
      .insert({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString()
      });

    if (tokenError) {
      throw tokenError;
    }

    // Generate reset URL
    // Use siteUrl from request (WordPress site), or fallback to environment variable, or generic reset page
    const frontendUrl = siteUrl || getEnv('FRONTEND_URL') || null;
    
    // Construct reset URL that points back to WordPress
    // WordPress will detect the token/email params and show reset form
    let resetUrl;
    if (frontendUrl) {
      // Ensure URL ends with /wp-admin/upload.php?page=ai-alt-gpt (or similar)
      const baseUrl = frontendUrl.replace(/\/$/, ''); // Remove trailing slash
      resetUrl = `${baseUrl}?reset-token=${token}&email=${encodeURIComponent(email.toLowerCase())}`;
    } else {
      // Fallback: just return the token in the response (WordPress can construct URL)
      resetUrl = `?reset-token=${token}&email=${encodeURIComponent(email.toLowerCase())}`;
    }

    // Send password reset email (non-blocking)
    try {
      await emailService.sendPasswordReset({
        email: email.toLowerCase(),
        resetUrl,
      });
    } catch (emailError) {
      logger.error('Failed to send password reset email', {
        error: emailError.message,
        stack: emailError.stack,
        email: email.toLowerCase()
      });
      // Don't fail the request if email fails - token is still created
    }

    // For testing/development: include reset link in response
    // In production with real email, this would be omitted for security
    const isDevelopment = !isProduction() || getEnv('DEBUG_EMAIL') === 'true';
    
    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
      // Include reset link in development mode or when DEBUG_EMAIL is enabled
      // This allows testing without email service configured
      ...(isDevelopment && {
        data: {
          resetLink: resetUrl,
          note: 'Email service is in development mode. Use this link to reset your password.'
        }
      })
    });

  } catch (error) {
    logger.error('Forgot password error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to process password reset request', { code: 'RESET_REQUEST_ERROR' });
  }
});

/**
 * Reset password with token
 * POST /auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  try {
    // Support both 'newPassword' and 'password' for compatibility
    const { email, token, newPassword, password } = req.body;
    const finalPassword = newPassword || password;

    // Validate input
    if (!email || !token || !finalPassword) {
      return httpErrors.missingField(res, 'email, token, and new password', 'MISSING_FIELDS');
    }

    if (finalPassword.length < 8) {
      return httpErrors.invalidInput(res, 'Password must be at least 8 characters', { code: 'WEAK_PASSWORD' });
    }

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return httpErrors.notFound(res, 'User', { code: 'INVALID_RESET_TOKEN', message: 'Invalid reset token or email' });
    }

    // Find valid reset token
    const { data: resetToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('userId', user.id)
      .eq('token', token)
      .eq('used', false)
      .gt('expiresAt', new Date().toISOString())
      .single();

    if (tokenError || !resetToken) {
      return httpErrors.invalidInput(res, 'Invalid or expired reset token. Please request a new password reset.', { code: 'INVALID_RESET_TOKEN' });
    }

    // Hash new password
    const passwordHash = await hashPassword(finalPassword);

    // Update user password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', user.id);

    if (updateError) {
      throw updateError;
    }

    // Mark token as used
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', resetToken.id);

    // Invalidate all other reset tokens for this user
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('userId', user.id)
      .eq('used', false);

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    logger.error('Reset password error', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, 'Failed to reset password', { code: 'RESET_PASSWORD_ERROR' });
  }
});

module.exports = router;
