/**
 * Account Validation Schemas
 * Zod schemas for validating account-related API requests
 */

const { z } = require('zod');

/**
 * Schema for email-based account requests
 */
const accountEmailSchema = z.object({
  email: z.string().email('Invalid email'),
});

module.exports = { accountEmailSchema };

