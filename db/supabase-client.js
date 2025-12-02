/**
 * Supabase Client Configuration
 * 
 * This file provides a configured Supabase client instance for database operations.
 * Replace all Prisma calls with Supabase client calls using this instance.
 * 
 * Environment Variables Required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_ANON_KEY: Your Supabase anonymous/public key
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for server-side operations)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../src/utils/logger');

// In tests, use the Jest mock and expose the same helpers to keep imports consistent.
if (process.env.NODE_ENV === 'test') {
  const mock = require('../tests/mocks/supabase.mock');

  function handleSupabaseError(error, context = '') {
    if (error) {
      throw new Error(error.message || `Supabase error ${context}`.trim());
    }
  }

  function handleSupabaseResponse({ data, error }, context = '') {
    if (error) {
      handleSupabaseError(error, context);
    }
    return data;
  }

  module.exports = {
    supabase: mock.supabase,
    handleSupabaseError,
    handleSupabaseResponse,
    __queueResponse: mock.__queueResponse,
    __reset: mock.__reset,
    __getInsertedData: mock.__getInsertedData,
    __clearInsertedData: mock.__clearInsertedData
  };
} else {
  // Validate required environment variables
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL environment variable is required');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  }

  // Create Supabase client with service role key for server-side operations
  // This bypasses Row Level Security (RLS) policies - use with caution
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

// Supabase query examples:
// Find user: supabase.from('users').select('*').eq('id', 1).single()
// Insert: supabase.from('users').insert({...}).select().single()
// Update: supabase.from('users').update({...}).eq('id', 1)

  /**
   * Detect if a Supabase error is a database schema error
   * @param {Object} error - Supabase error object
   * @returns {Object|null} - Schema error details or null if not a schema error
   */
  function detectSchemaError(error) {
    if (!error || !error.message) {
      return null;
    }

    const message = error.message.toLowerCase();
    const code = error.code || '';

    // Common schema error patterns
    const schemaErrorPatterns = [
      {
        pattern: /relation\s+"?(\w+)"?\s+does not exist/i,
        type: 'missing_table',
        extract: (msg) => {
          const match = msg.match(/relation\s+"?(\w+)"?\s+does not exist/i);
          return match ? match[1] : null;
        }
      },
      {
        pattern: /column\s+"?(\w+)"?\s+does not exist/i,
        type: 'missing_column',
        extract: (msg) => {
          const match = msg.match(/column\s+"?(\w+)"?\s+does not exist/i);
          return match ? match[1] : null;
        }
      },
      {
        pattern: /permission denied for (?:table|relation)\s+"?(\w+)"?/i,
        type: 'permission_denied',
        extract: (msg) => {
          const match = msg.match(/permission denied for (?:table|relation)\s+"?(\w+)"?/i);
          return match ? match[1] : null;
        }
      },
      {
        pattern: /syntax error/i,
        type: 'syntax_error',
        extract: () => null
      }
    ];

    for (const pattern of schemaErrorPatterns) {
      if (pattern.pattern.test(message)) {
        const resource = pattern.extract ? pattern.extract(message) : null;
        return {
          isSchemaError: true,
          type: pattern.type,
          resource,
          originalMessage: error.message,
          code: code || 'SCHEMA_ERROR',
          hint: error.hint || null
        };
      }
    }

    // Check for specific PostgreSQL error codes
    if (code === '42P01') { // undefined_table
      return {
        isSchemaError: true,
        type: 'missing_table',
        resource: null,
        originalMessage: error.message,
        code: 'UNDEFINED_TABLE',
        hint: error.hint || null
      };
    }

    if (code === '42703') { // undefined_column
      return {
        isSchemaError: true,
        type: 'missing_column',
        resource: null,
        originalMessage: error.message,
        code: 'UNDEFINED_COLUMN',
        hint: error.hint || null
      };
    }

    return null;
  }

  /**
   * Helper function to handle Supabase errors consistently
   * Detects schema errors and provides detailed information
   */
  function handleSupabaseError(error, context = '') {
    if (error) {
      const schemaError = detectSchemaError(error);
      
      if (schemaError) {
        logger.error(`Database schema error ${context}:`, {
          type: schemaError.type,
          resource: schemaError.resource,
          code: schemaError.code,
          hint: schemaError.hint,
          originalMessage: schemaError.originalMessage
        });

        // Create a more informative error with schema details
        const errorMessage = schemaError.resource
          ? `Database schema error: ${schemaError.type} - ${schemaError.resource}`
          : `Database schema error: ${schemaError.type}`;
        
        const enhancedError = new Error(errorMessage);
        enhancedError.isSchemaError = true;
        enhancedError.schemaErrorDetails = schemaError;
        enhancedError.originalError = error;
        throw enhancedError;
      }

      logger.error(`Supabase error ${context}:`, {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw new Error(error.message || 'Database operation failed');
    }
  }

  /**
   * Helper function to convert Supabase response to standard format
   */
  function handleSupabaseResponse({ data, error }, context = '') {
    if (error) {
      handleSupabaseError(error, context);
    }
    return data;
  }

  module.exports = {
    supabase,
    handleSupabaseError,
    handleSupabaseResponse,
    detectSchemaError
  };
}
