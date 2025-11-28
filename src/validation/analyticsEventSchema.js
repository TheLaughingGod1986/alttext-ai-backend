/**
 * Analytics Event Validation Schema
 * Zod schema for validating analytics event data
 */

const { z } = require('zod');

/**
 * Schema for analytics event logging
 * email and eventName are required, other fields are optional
 */
const analyticsEventSchema = z.object({
  email: z.string().email('Invalid email format'),
  eventName: z.string().min(1, 'Event name is required'),
  plugin: z.string().optional(),
  source: z.enum(['plugin', 'website', 'server']).optional(),
  eventData: z.any().optional(), // Use z.any() instead of z.record(z.any()) for Zod v4 compatibility
  identityId: z.string().uuid('Invalid identity ID format').optional(),
});

/**
 * Schema for array of analytics events
 */
const analyticsEventArraySchema = z.array(analyticsEventSchema).min(1, 'At least one event is required').max(100, 'Maximum 100 events per batch');

/**
 * Schema that accepts both single event and array of events
 */
const analyticsEventOrArraySchema = z.union([analyticsEventSchema, analyticsEventArraySchema]);

module.exports = {
  analyticsEventSchema,
  analyticsEventArraySchema,
  analyticsEventOrArraySchema,
};

