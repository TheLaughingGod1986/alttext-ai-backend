/**
 * Authentication routes
 */

const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { generateToken, hashPassword, comparePassword, authenticateToken } = require('./jwt');
const { sendPasswordResetEmail } = require('./email');

const router = express.Router();
const prisma = new PrismaClient();

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
    const { email, password } = req.body;

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

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists with this email',
        code: 'USER_EXISTS'
      });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        plan: 'free',
        tokensRemaining: 10,
        credits: 0
      }
    });

    // Generate JWT token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        tokensRemaining: user.tokensRemaining,
        credits: user.credits,
        resetDate: user.resetDate
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
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
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
        tokensRemaining: user.tokensRemaining,
        credits: user.credits,
        resetDate: user.resetDate
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
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        plan: true,
        tokensRemaining: true,
        credits: true,
        resetDate: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      user
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
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
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
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success to prevent email enumeration
    // We don't want attackers to know if an email exists
    if (!user) {
      // Still return success, but don't send email
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    // Check for recent reset requests (rate limiting - max 3 per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentResets = await prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: oneHourAgo },
        used: false
      }
    });

    if (recentResets >= 3) {
      return res.status(429).json({
        error: 'Too many password reset requests. Please wait 1 hour before requesting another reset.',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        used: false,
        expiresAt: { gt: new Date() }
      },
      data: {
        used: true
      }
    });

    // Generate reset token
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Save token to database
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt
      }
    });

    // Generate reset URL
    // Use siteUrl from request (WordPress site), or fallback to environment variable, or generic reset page
    const frontendUrl = siteUrl || process.env.FRONTEND_URL || null;
    
    // Construct reset URL that points back to WordPress
    // WordPress will detect the token/email params and show reset form
    let resetUrl;
    if (frontendUrl) {
      // Ensure URL ends with /wp-admin/upload.php?page=ai-alt-gpt (or similar)
      const baseUrl = frontendUrl.replace(/\/$/, ''); // Remove trailing slash
      resetUrl = `${baseUrl}?reset-token=${token}&email=${encodeURIComponent(user.email)}`;
    } else {
      // Fallback: just return the token in the response (WordPress can construct URL)
      resetUrl = `?reset-token=${token}&email=${encodeURIComponent(user.email)}`;
    }

    // Send email (mock for now)
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Don't fail the request if email fails - token is still created
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
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
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Invalid reset token or email',
        code: 'INVALID_RESET_TOKEN'
      });
    }

    // Find valid reset token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        token,
        used: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!resetToken) {
      return res.status(400).json({
        error: 'Invalid or expired reset token. Please request a new password reset.',
        code: 'INVALID_RESET_TOKEN'
      });
    }

    // Hash new password
    const passwordHash = await hashPassword(finalPassword);

    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true }
    });

    // Invalidate all other reset tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        used: false
      },
      data: {
        used: true
      }
    });

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
