/**
 * Generate Route Validation
 * Uses Zod for schema validation
 */

const { z } = require('zod');

/**
 * Zod schema for image_data object
 */
const imageDataSchema = z.object({
  url: z.string().url().optional(),
  image_id: z.string().optional(),
  title: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mime_type: z.string().optional(),
  base64: z.string().optional(),
  image_base64: z.string().optional(),
  inline: z.object({
    data_url: z.string().url(),
  }).optional(),
}).refine(
  (data) => {
    // At least one of url, base64, image_base64, or inline.data_url must be present
    return data.url || data.base64 || data.image_base64 || data.inline?.data_url;
  },
  {
    message: 'At least one image source (url, base64, or inline.data_url) is required',
  }
);

/**
 * Zod schema for generate request
 */
const generateRequestSchema = z.object({
  image_data: imageDataSchema.optional(),
  context: z.union([
    z.string(),
    z.object({
      post_title: z.string().optional(),
      filename: z.string().optional(),
    }).passthrough() // Allow additional properties
  ]).optional(),
  regenerate: z.boolean().optional().default(false),
  service: z.enum(['alttext-ai', 'seo-ai-meta']).optional().default('alttext-ai'),
  type: z.enum(['alt-text', 'meta']).optional(),
  siteHash: z.string().optional(),
  siteUrl: z.string().url().optional(),
  model: z.string().optional(),
}).refine(
  (data) => {
    // For meta generation, context is required (as string)
    if (data.type === 'meta' || (data.service === 'seo-ai-meta' && !data.image_data)) {
      if (typeof data.context === 'string') {
        return data.context.trim().length > 0;
      }
      return !!data.context;
    }
    // For alt text generation, image_data is required
    return !!data.image_data;
  },
  {
    message: 'Either image_data (for alt text) or context (for meta) is required',
    path: ['image_data'],
  }
);

/**
 * Validate generate request input using Zod
 */
function validateGenerateInput(data) {
  return generateRequestSchema.parse(data);
}

/**
 * Safe parse generate request input
 */
function safeParseGenerateInput(data) {
  return generateRequestSchema.safeParse(data);
}

module.exports = {
  validateGenerateInput,
  safeParseGenerateInput,
  generateRequestSchema,
};

