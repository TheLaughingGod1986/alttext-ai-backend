/**
 * Identity Validation Schemas
 * Zod schemas for validating identity-related API requests
 */

const { z } = require('zod');

/**
 * Schema for /identity/sync endpoint
 * email is required, plugin, site, and installationId are optional
 */
const identitySyncSchema = z.object({
  email: z.string().email('Invalid email format'),
  plugin: z.string().min(1).optional(),
  site: z.string().url().optional().or(z.literal('')),
  installationId: z.string().uuid('Invalid installation ID format').optional(),
});

module.exports = {
  identitySyncSchema,
};

