/**
 * Plugin Init Validation Schema
 * Zod schema for validating plugin-init endpoint data
 */

const { z } = require('zod');

const pluginInitSchema = z.object({
  email: z.string().email(),
  plugin: z.string().min(1),
  site: z.string().url().optional().or(z.literal('')),
  version: z.string().optional(),
  wpVersion: z.string().optional(),
  phpVersion: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
});

module.exports = { pluginInitSchema };

