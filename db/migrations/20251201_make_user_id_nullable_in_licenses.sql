-- Make user_id nullable in licenses table
-- Date: 2025-12-01
-- Free licenses can be created without a user (site-based authentication)
-- Fixes: "null value in column user_id of relation licenses violates not-null constraint"

DO $$
BEGIN
  -- Check if user_id column exists and is NOT NULL
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'licenses'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    -- Alter column to be nullable
    ALTER TABLE licenses ALTER COLUMN user_id DROP NOT NULL;
    RAISE NOTICE '✅ Altered licenses.user_id to be nullable';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'licenses'
      AND column_name = 'userId'
      AND is_nullable = 'NO'
  ) THEN
    -- First rename to snake_case, then make nullable
    ALTER TABLE licenses RENAME COLUMN "userId" TO user_id;
    ALTER TABLE licenses ALTER COLUMN user_id DROP NOT NULL;
    RAISE NOTICE '✅ Renamed licenses.userId to user_id and made it nullable';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'licenses'
      AND column_name = 'user_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE NOTICE '✅ licenses.user_id is already nullable';
  ELSE
    -- Column doesn't exist, create it as nullable
    ALTER TABLE licenses ADD COLUMN user_id INTEGER;
    -- Add foreign key if users table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    ) THEN
      ALTER TABLE licenses 
      ADD CONSTRAINT licenses_user_id_fkey 
      FOREIGN KEY (user_id) 
      REFERENCES users(id) 
      ON DELETE SET NULL;
      RAISE NOTICE '✅ Added user_id column and foreign key constraint';
    ELSE
      RAISE NOTICE '✅ Added user_id column (users table not found, skipping FK)';
    END IF;
  END IF;
END $$;

-- Verify the change (outside DO block)
SELECT 
  'VERIFICATION' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'licenses' 
      AND (column_name = 'user_id' OR column_name = 'userId')
      AND is_nullable = 'YES'
    ) THEN '✅ licenses.user_id is nullable'
    ELSE '❌ licenses.user_id is NOT nullable'
  END as user_id_nullable_check;

