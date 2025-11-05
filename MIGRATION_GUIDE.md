# 🗄️ Database Migration Guide

## Option 1: Using Render Dashboard (Easiest) ⭐

1. **Go to Render Dashboard:**
   - https://dashboard.render.com
   - Navigate to your database service

2. **Connect to Database:**
   - Click on your database
   - Go to "Connect" or "Query" tab
   - Click "Connect" or "Open Query Editor"

3. **Run SQL:**
   Copy and paste this SQL:

```sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';
CREATE INDEX IF NOT EXISTS "users_service_idx" ON "users"("service");
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';
CREATE INDEX IF NOT EXISTS "usage_logs_userId_service_idx" ON "usage_logs"("userId", "service");
```

4. **Execute:**
   - Click "Run" or "Execute"
   - Wait for success message

5. **Verify:**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'users' AND column_name = 'service';
   ```
   Should return: `service`

## Option 2: Using Prisma (If DATABASE_URL is set)

```bash
cd alttext-ai-backend-clone

# Set DATABASE_URL from Render
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migration
./run-migration.sh
```

## Option 3: Using psql Directly

```bash
cd alttext-ai-backend-clone

# Set DATABASE_URL from Render
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run SQL file
./run-migration-sql.sh
```

## Option 4: Using psql Command Line

1. **Get connection string from Render:**
   - Render Dashboard → Database → Connect
   - Copy "External Connection" string

2. **Run psql:**
   ```bash
   psql "postgresql://user:password@host:port/database" -f prisma/migrations/20250101000000_add_service_support/migration.sql
   ```

## Getting DATABASE_URL from Render

1. Go to Render Dashboard
2. Click on your database service
3. Go to "Connect" tab
4. Copy the connection string (Internal or External)
5. Use it as `DATABASE_URL`

**Format:**
```
postgresql://user:password@hostname:port/database
```

## Verification

After running migration, verify it worked:

```sql
-- Check users table
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'service';

-- Check usage_logs table
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'usage_logs' AND column_name = 'service';

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'users' AND indexname LIKE '%service%';
```

## Troubleshooting

### "relation already exists"
- Migration already ran, you're good!

### "permission denied"
- Check database user has ALTER TABLE permissions
- Use Render dashboard SQL editor (has admin access)

### "connection refused"
- Check DATABASE_URL is correct
- Verify database is accessible from your IP
- Use Render's Internal connection string if on Render

### "column does not exist" after migration
- Re-run migration
- Check table names are correct (might be lowercase)
- Verify you're connected to the right database

## Quick Check

Run this to see if migration is needed:

```sql
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'service'
    ) THEN '✅ Migration already applied'
    ELSE '⚠️  Migration needed'
  END as status;
```

---

**Recommended:** Use Option 1 (Render Dashboard) - it's the easiest and most reliable!

