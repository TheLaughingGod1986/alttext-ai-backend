/**
 * Jest setup file - runs before all tests
 * This ensures mocks are set up before any modules are loaded
 */

// Ensure NODE_ENV is test
process.env.NODE_ENV = 'test';

// Mock db/supabase-client globally to prevent real Supabase client from loading
// This prevents the "Class extends value" error from @supabase/storage-js
jest.mock('./db/supabase-client', () => {
  return require('./tests/mocks/supabase.mock');
});

