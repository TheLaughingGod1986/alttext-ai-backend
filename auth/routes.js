/**
 * Authentication routes
 */

const express = require('express');
const crypto = require('crypto');
const { supabase } = require('../supabase-client');
const { generateToken, hashPassword, comparePassword, authenticateToken } = require('./jwt');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('./email');

const router = express.Router();

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
    const { email, password, service = 'alttext-ai' } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'MISSING_FIELDS'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters',
        code: 'WEAK_PASSWORD'
      });
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
      return res.status(409).json({
        error: 'User already exists with this email',
        code: 'USER_EXISTS'
      });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    
    // Build insert object - only include columns that exist
    const userData = {
      email: email.toLowerCase(),
      password_hash: passwordHash,
      plan: 'free',
      service: userService
    };
    
    // Try to add tokens_remaining if column exists (will fail gracefully if it doesn't)
    // The database might have a default value
    const { data: user, error: createError } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (createError || !user) {
      throw createError || new Error('Failed to create user');
    }

    // Generate JWT token
    const token = generateToken(user);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.email).catch(err => {
      console.error('Failed to send welcome email (non-critical):', err);
      // Don't fail registration if email fails
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        tokensRemaining: user.tokens_remaining || user.tokensRemaining || initialLimits[userService] || 50,
        credits: user.credits || 0,
        resetDate: user.reset_date || user.resetDate
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Failed to create account',
      code: 'REGISTRATION_ERROR'
    });
  }
});

/**
 * Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        tokensRemaining: user.tokens_remaining || user.tokensRemaining || initialLimits[userService] || 50,
        credits: user.credits || 0,
        resetDate: user.reset_date || user.resetDate
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Failed to login',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * Get current user info
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, plan, tokens_remaining, reset_date, created_at')
      .eq('id', req.user.id)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      user: {
        ...user,
        credits: user.credits || 0
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      code: 'USER_INFO_ERROR'
    });
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
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Failed to refresh token',
      code: 'REFRESH_ERROR'
    });
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
      return res.status(400).json({
        error: 'Email is required',
        code: 'MISSING_EMAIL'
      });
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
      return res.status(429).json({
        error: 'Too many password reset requests. Please wait 1 hour before requesting another reset.',
        code: 'RATE_LIMIT_EXCEEDED'
      });
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
    const frontendUrl = siteUrl || process.env.FRONTEND_URL || null;
    
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

    // Send email (mock for now)
    try {
      await sendPasswordResetEmail(email.toLowerCase(), resetUrl);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Don't fail the request if email fails - token is still created
    }

    // For testing/development: include reset link in response
    // In production with real email, this would be omitted for security
    const isDevelopment = process.env.NODE_ENV !== 'production' || process.env.DEBUG_EMAIL === 'true';
    
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
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Failed to process password reset request',
      code: 'RESET_REQUEST_ERROR'
    });
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
      return res.status(400).json({
        error: 'Email, token, and new password are required',
        code: 'MISSING_FIELDS'
      });
    }

    if (finalPassword.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: 'Invalid reset token or email',
        code: 'INVALID_RESET_TOKEN'
      });
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
      return res.status(400).json({
        error: 'Invalid or expired reset token. Please request a new password reset.',
        code: 'INVALID_RESET_TOKEN'
      });
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
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Failed to reset password',
      code: 'RESET_PASSWORD_ERROR'
    });
  }
});

module.exports = router;
