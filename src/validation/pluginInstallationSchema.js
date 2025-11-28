/**
 * Plugin Installation Validation Schema
 * Zod schema for validating plugin installation data
 */

const { z } = require('zod');

const pluginInstallationSchema = z.object({
  email: z.string().email('Invalid email format'),
  plugin: z.string().min(1, 'Plugin name is required'),
  site: z.string().url('Invalid site URL format').optional().or(z.literal('')),
  version: z.string().optional(),
  wpVersion: z.string().optional(),
  phpVersion: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  installSource: z.string().optional(),
});

module.exports = { pluginInstallationSchema };

