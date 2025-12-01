-- Ensure events table exists
-- Date: 2025-12-01
-- The EventService requires this table for credit balance calculations and event logging

-- Create events table if it doesn't exist
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  credits_delta INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND constraint_name = 'events_identity_id_fkey'
  ) THEN
    -- First ensure identities table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'identities'
    ) THEN
      ALTER TABLE events 
      ADD CONSTRAINT events_identity_id_fkey 
      FOREIGN KEY (identity_id) 
      REFERENCES identities(id) 
      ON DELETE CASCADE;
      RAISE NOTICE '✅ Added foreign key constraint events_identity_id_fkey';
    ELSE
      RAISE NOTICE '⚠️  identities table does not exist - skipping foreign key constraint';
    END IF;
  ELSE
    RAISE NOTICE '✅ Foreign key constraint events_identity_id_fkey already exists';
  END IF;
END $$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_events_identity_id ON events (identity_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_identity_type_created ON events (identity_id, event_type, created_at DESC);

-- Add table and column comments for documentation
COMMENT ON TABLE events IS 'Unified event system - replaces analytics_events and credits_transactions';
COMMENT ON COLUMN events.identity_id IS 'Foreign key to identities table - unified user tracking';
COMMENT ON COLUMN events.event_type IS 'Event type: alttext_generated, credit_used, credit_purchase, signup_submitted, etc.';
COMMENT ON COLUMN events.credits_delta IS 'Credit change: negative for usage, positive for purchases';
COMMENT ON COLUMN events.metadata IS 'Flexible JSON payload: image count, origin, plugin version, etc.';

-- Verify the table was created
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'events'
    ) THEN '✅ events table exists'
    ELSE '❌ events table MISSING'
  END as events_table_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'identity_id'
    ) THEN '✅ events.identity_id column exists'
    ELSE '❌ events.identity_id MISSING'
  END as identity_id_check,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'credits_delta'
    ) THEN '✅ events.credits_delta column exists'
    ELSE '❌ events.credits_delta MISSING'
  END as credits_delta_check;

