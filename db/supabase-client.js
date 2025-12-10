/**
 * Supabase Client Configuration
 *
 * Production uses platform-provided env vars (Render, Vercel, etc). For local
 * development, we load .env only when needed so we never depend on a file
 * existing in production containers.
 *
 * Required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (service role, server-side only)
 */

// Load .env only when not already provided (e.g., local dev). In production,
// platform env vars are injected and we must not rely on a .env file.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    require('dotenv').config();
  } catch (e) {
    // ignore if dotenv is unavailable
  }
}
const { createClient } = require('@supabase/supabase-js');

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
   * Helper function to handle Supabase errors consistently
   */
  function handleSupabaseError(error, context = '') {
    if (error) {
      console.error(`Supabase error ${context}:`, error);
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
    handleSupabaseResponse
  };
}
