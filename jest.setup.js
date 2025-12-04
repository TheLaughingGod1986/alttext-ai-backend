/**
 * Jest setup file - runs before all tests (in setupFiles, before setupFilesAfterEnv)
 * This ensures mocks are set up before any modules are loaded
 */

// Ensure NODE_ENV is test BEFORE any modules load
process.env.NODE_ENV = 'test';

// Mock @supabase/supabase-js directly to prevent storage-js from loading
// This prevents the "Class extends value" error from @supabase/storage-js
// This MUST be in setupFiles (not setupFilesAfterEnv) to be hoisted before module loading
jest.mock('@supabase/supabase-js', () => {
  // Return a mock createClient that returns the supabase mock
  // We can't require the mock here as it might cause circular issues
  // Instead, return a factory that will be called later
  return {
    createClient: jest.fn(() => {
      // When createClient is called, return the mocked supabase instance
      const supabaseMock = require('./tests/mocks/supabase.mock');
      return supabaseMock.supabase;
    })
  };
});

// Mock db/supabase-client globally to prevent real Supabase client from loading
// This prevents the "Class extends value" error from @supabase/storage-js
// This must be here (not in setupFilesAfterEnv) to ensure it's applied before server-v2 loads
jest.mock('./db/supabase-client', () => {
  // Return the mock directly - don't require it here to avoid circular issues
  const mock = require('./tests/mocks/supabase.mock');
  return mock;
});

