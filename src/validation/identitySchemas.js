/**
 * Identity Validation Schemas
 * Zod schemas for validating identity-related API requests
 */

const { z } = require('zod');

/**
 * Schema for /identity/sync endpoint
 * email is required, other fields are optional
 */
const identitySyncSchema = z.object({
  email: z.string().email('Invalid email format'),
  plugin: z.string().min(1).optional(),
  site: z.string().url().optional().or(z.literal('')),
  version: z.string().optional(),
  wpVersion: z.string().optional(),
  phpVersion: z.string().optional(),
  installationId: z.string().uuid('Invalid installation ID format').optional(),
});

module.exports = {
  identitySyncSchema,
};

