const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '30d';

function createAuthRouter({ supabase }) {
  const router = express.Router();

  // Register new user
  router.post('/register', async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid request data',
        details: parsed.error.flatten(),
      });
    }

    const { email, password, name } = parsed.data;

    try {
      // Check if user already exists
      const { data: existing } = await supabase
        .from('licenses')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({
          error: 'USER_EXISTS',
          message: 'An account with this email already exists',
        });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Create user account (stored as a license with plan='free')
      const { data: user, error } = await supabase
        .from('licenses')
        .insert({
          email,
          password_hash,
          plan: 'free',
          status: 'active',
          max_sites: 1,
          billing_day_of_month: new Date().getUTCDate(),
        })
        .select()
        .single();

      if (error) {
        console.error('[Auth] Registration error:', error);
        return res.status(500).json({
          error: 'REGISTRATION_FAILED',
          message: 'Failed to create account',
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          user_id: user.id,
          email: user.email,
          license_key: user.license_key,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user: {
          id: user.id,
          email: user.email,
          license_key: user.license_key,
          plan: user.plan,
          status: user.status,
        },
      });
    } catch (err) {
      console.error('[Auth] Registration error:', err);
      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'An error occurred during registration',
      });
    }
  });

  // Login
  router.post('/login', async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid request data',
        details: parsed.error.flatten(),
      });
    }

    const { email, password } = parsed.data;

    try {
      // Find user by email
      const { data: user, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error || !user) {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }

      // Check if user has a password (not a license-only account)
      if (!user.password_hash) {
        return res.status(401).json({
          error: 'NO_PASSWORD',
          message: 'This account uses license key authentication. Please contact your administrator for the license key.',
        });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }

      // Check account status
      if (user.status !== 'active') {
        return res.status(403).json({
          error: 'ACCOUNT_INACTIVE',
          message: 'Your account is not active',
          status: user.status,
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          user_id: user.id,
          email: user.email,
          license_key: user.license_key,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          license_key: user.license_key,
          plan: user.plan,
          status: user.status,
        },
      });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'An error occurred during login',
      });
    }
  });

  // Get current user info
  router.get('/me', async (req, res) => {
    try {
      // Get token from Authorization header
      const authHeader = req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'No authentication token provided',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer '

      // Verify token
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res.status(401).json({
          error: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        });
      }

      // Get user from database
      const { data: user, error } = await supabase
        .from('licenses')
        .select('id, email, license_key, plan, status, max_sites, billing_day_of_month, created_at')
        .eq('id', decoded.user_id)
        .maybeSingle();

      if (error || !user) {
        return res.status(404).json({
          error: 'USER_NOT_FOUND',
          message: 'User account not found',
        });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          license_key: user.license_key,
          plan: user.plan,
          status: user.status,
          max_sites: user.max_sites,
          created_at: user.created_at,
        },
      });
    } catch (err) {
      console.error('[Auth] Get user error:', err);
      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'An error occurred',
      });
    }
  });

  // Forgot password (placeholder - would send email in production)
  router.post('/forgot-password', async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid email address',
      });
    }

    const { email } = parsed.data;

    // In production, you would:
    // 1. Generate a password reset token
    // 2. Store it in the database with expiration
    // 3. Send an email with the reset link

    // For now, just return success (don't reveal if email exists)
    return res.json({
      success: true,
      message: 'If an account exists with this email, you will receive password reset instructions',
    });
  });

  return router;
}

module.exports = { createAuthRouter };
