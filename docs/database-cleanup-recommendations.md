# Database Cleanup and Optimization Recommendations

**Date:** 2025-12-01  
**Status:** Analysis Complete

## Executive Summary

Analysis of the database schema and codebase usage reveals:
- **6 actively used tables** that should be kept and optimized
- **4 potentially unused tables** that may be candidates for removal
- **Missing indexes** that should be added for performance

## Table Usage Analysis

### ✅ Actively Used Tables (Keep)

1. **`users`** - Core user accounts
   - 86 SELECT, 68 INSERT, 74 UPDATE operations
   - Used in 12 files
   - **Action:** Keep and optimize

2. **`licenses`** - License management
   - 28 SELECT, 18 INSERT, 22 UPDATE operations
   - Used in 8 files
   - **Action:** Keep and optimize (already has `auto_attach_status` column)

3. **`credits`** - Credit tracking system
   - 16 SELECT, 8 INSERT, 14 UPDATE operations
   - Used in 4 files
   - **Action:** Keep and optimize

4. **`subscriptions`** - Stripe subscription management
   - 27 SELECT, 20 UPDATE, 20 DELETE operations
   - Used in 3 files
   - **Action:** Keep and optimize

5. **`usage_logs`** - Usage tracking and analytics
   - 28 SELECT, 17 INSERT, 15 UPDATE, 8 DELETE operations
   - Used in 7 files
   - **Action:** Keep and optimize (consider partitioning for large datasets)

6. **`password_reset_tokens`** - Authentication tokens
   - 20 SELECT, 20 INSERT, 20 UPDATE operations
   - Used in 1 file (auth/routes.js)
   - **Action:** Keep and optimize

### ⚠️ Potentially Unused Tables (Review Before Removal)

1. **`generation_requests`**
   - **Status:** No code references found
   - **Recommendation:** 
     - Check if it's used by external services
     - Verify if it's planned for future features
     - If empty and unused, can be dropped

2. **`queue_jobs`**
   - **Status:** No code references found
   - **Recommendation:**
     - May be for batch processing (not yet implemented)
     - Check if it's used by background jobs
     - If empty and unused, can be dropped

3. **`sessions`**
   - **Status:** No code references found
   - **Recommendation:**
     - App uses JWT tokens instead of session-based auth
     - Likely legacy from previous implementation
     - If empty and unused, can be dropped

4. **`license_sites`** ⚠️ **SPECIAL CASE**
   - **Status:** Code references `sites` table, but database has `license_sites`
   - **Issue:** Mismatch between code and database schema
   - **Recommendation:**
     - **Option A:** Rename `license_sites` to `sites` to match code
     - **Option B:** Update code to use `license_sites` instead of `sites`
     - **Action Required:** Fix this mismatch before cleanup

## Optimization Recommendations

### 1. Add Missing Indexes

Created migration: `db/migrations/20251201_database_optimization.sql`

**Indexes to add:**
- `licenses`: license_key, user_id (auto_attach_status already indexed)
- `usage_logs`: user_id, license_id, site_hash, created_at
- `credits`: user_id
- `subscriptions`: user_id, stripe_subscription_id, status
- `password_reset_tokens`: user_id, token_hash, expires_at
- `license_sites`: license_id, site_hash (if keeping this table)

### 2. Table Size Optimization

- **`usage_logs`**: Consider partitioning by date for large datasets
- **`generation_requests`**: If keeping, add indexes on user_id, license_id, created_at

### 3. Foreign Key Constraints

Verify all foreign key constraints are properly set up:
- `licenses.user_id` → `users.id`
- `usage_logs.user_id` → `users.id`
- `usage_logs.license_id` → `licenses.id`
- `credits.user_id` → `users.id`
- `subscriptions.user_id` → `users.id`
- `password_reset_tokens.user_id` → `users.id`
- `license_sites.license_id` → `licenses.id`

## Cleanup Steps

### Step 1: Fix Table Name Mismatch
**CRITICAL:** Resolve the `sites` vs `license_sites` mismatch first.

```sql
-- Option A: Rename license_sites to sites
ALTER TABLE license_sites RENAME TO sites;

-- OR Option B: Verify if 'sites' table exists separately
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'sites'
);
```

### Step 2: Add Indexes
Run: `db/migrations/20251201_database_optimization.sql`

### Step 3: Verify Unused Tables
Check row counts before dropping:

```sql
SELECT 
  'generation_requests' as table_name,
  COUNT(*) as row_count
FROM generation_requests
UNION ALL
SELECT 
  'queue_jobs' as table_name,
  COUNT(*) as row_count
FROM queue_jobs
UNION ALL
SELECT 
  'sessions' as table_name,
  COUNT(*) as row_count
FROM sessions;
```

### Step 4: Drop Unused Tables (After Verification)
**Only if tables are empty and confirmed unused:**

```sql
DROP TABLE IF EXISTS generation_requests CASCADE;
DROP TABLE IF EXISTS queue_jobs CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
```

## Files Created

1. `scripts/analyze-database.js` - Codebase analysis script
2. `scripts/database-cleanup-mcp.js` - Cleanup SQL generator
3. `db/migrations/20251201_database_optimization.sql` - Optimization migration
4. `database-analysis-report.json` - Detailed usage report

## Next Steps

1. ✅ **Fix `sites` vs `license_sites` mismatch** (HIGH PRIORITY)
2. ✅ **Run optimization migration** to add indexes
3. ⚠️ **Verify unused tables** have no data before dropping
4. ⚠️ **Test application** after any table drops
5. 📊 **Monitor performance** after index additions

## Notes

- All migrations use `IF NOT EXISTS` for idempotency
- Index creation is safe and can be run multiple times
- Table drops are commented out - uncomment only after verification
- Foreign key constraints will prevent dropping tables with dependencies

