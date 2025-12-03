/**
 * Waitlist API routes
 * Handles waitlist signups from website and plugins
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { supabase } = require('../../db/supabase-client');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { isTest } = require('../../config/loadEnv');

const router = express.Router();

// Rate limiting for waitlist endpoint (defensive check for test environment)
let waitlistRateLimiter;
if (rateLimit && typeof rateLimit === 'function') {
  try {
    waitlistRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 waitlist signups per windowMs
      message: 'Too many waitlist requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  } catch (e) {
    // If rateLimit fails, continue without rate limiting
    waitlistRateLimiter = null;
  }
}

// Apply rate limiting (defensive check for test environment)
// Skip rate limiting entirely in test environment to avoid middleware issues
if (!isTest() && waitlistRateLimiter && typeof waitlistRateLimiter === 'function') {
  router.use(waitlistRateLimiter);
}

/**
 * Zod schema for waitlist submission validation
 */
const waitlistSchema = z.object({
  email: z.string().email('Invalid email format'),
  plugin: z.string().optional(),
  source: z.string().optional(),
});

/**
 * POST /waitlist/submit
 * Submit email to waitlist
 * Body: { email, plugin?, source? }
 * 
 * This endpoint:
 * 1. Validates the email address
 * 2. Optionally stores the signup in Supabase
 * 3. Sends a welcome email via emailService
 * 4. Returns success response
 */
router.post('/submit', async (req, res) => {
  try {
    // Validate input with Zod
    const validationResult = waitlistSchema.safeParse(req.body);

    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstIssue = issues[0];
      const errorMessage = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        ok: false,
        error: errorMessage,
      });
    }

    const { email, plugin, source } = validationResult.data;

    // Optionally store in Supabase waitlist_signups table
    // Check if table exists first, if not, just log and continue
    let waitlistRecord = null;
    try {
      const { data, error } = await supabase
        .from('waitlist_signups')
        .insert({
          email: email.toLowerCase(),
          plugin: plugin || null,
          source: source || 'website',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error && !error.message.includes('duplicate') && !error.message.includes('already exists')) {
        logger.warn('[Waitlist] Failed to insert into Supabase (non-critical)', {
          error: error.message,
          email
        });
        // Continue even if Supabase insert fails - email sending is more important
      } else if (data) {
        waitlistRecord = data;
        logger.info('[Waitlist] Signup stored in database', { email });
      }
    } catch (dbError) {
      // Table might not exist yet - that's okay, we'll just send the email
      logger.warn('[Waitlist] Database operation failed (non-critical)', {
        error: dbError.message,
        email
      });
    }

    // Send welcome email
    const emailResult = await emailService.sendWaitlistWelcome({
      email,
      plugin,
      source: source || 'website',
    });

    // Subscribe to Resend audience (non-blocking)
    // This ensures users are added to the audience for marketing emails
    const subscribeResult = await emailService.subscribe({
      email,
      name: email.split('@')[0], // Use email prefix as name
      metadata: {
        plugin: plugin || null,
        source: source || 'website',
        waitlist: true,
      },
    });

    if (!subscribeResult.success && subscribeResult.error !== 'Email service not configured') {
      logger.warn('[Waitlist] Failed to subscribe to audience (non-critical)', {
        error: subscribeResult.error,
        email
      });
    } else if (subscribeResult.success) {
      logger.info('[Waitlist] Subscribed to Resend audience', { email });
    }

    if (!emailResult.success) {
      logger.error('[Waitlist] Failed to send welcome email', {
        error: emailResult.error,
        email
      });
      // Still return success if we stored the record, but log the email failure
      if (waitlistRecord) {
        return res.status(200).json({
          ok: true,
          message: 'Added to waitlist, but welcome email failed to send',
          emailSent: false,
          subscribed: subscribeResult.success || false,
        });
      }
      // If both failed, return error
      return res.status(500).json({
        ok: false,
        error: emailResult.error || 'Failed to process waitlist signup',
      });
    }

    // Success - record stored (if table exists), email sent, and subscribed to audience
    return res.status(200).json({
      ok: true,
      message: 'Successfully added to waitlist',
      emailSent: true,
      subscribed: subscribeResult.success || false,
    });
  } catch (error) {
    logger.error('[Waitlist] Error processing waitlist signup', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
});

module.exports = router;

