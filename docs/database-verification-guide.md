# Database Verification Guide

## Overview
This guide helps you verify that all database optimizations have been applied correctly and identify any remaining improvements.

## Verification Queries (Run in Supabase SQL Editor)

### ✅ What You've Already Verified
- **Orphaned Licenses**: 0 orphaned records (good!)

### 🔍 What to Check Next

#### 1. Table Name Status (Query 1)
**Expected Result**: `✅ sites table exists`
- If you see `⚠️ license_sites exists`, the rename didn't complete
- If you see `❌ Neither table exists`, there's a schema issue

#### 2. Performance Indexes (Query 2)
**What to Look For**:
- `licenses` table should have multiple indexes (at least 5-6)
- `usage_logs` should have indexes on `license_id`, `user_id`, `created_at`
- `subscriptions` should have indexes on `user_id`, `stripe_subscription_id`
- `credits` should have indexes on `user_id`, `created_at`

**Expected**: Each table should show several `idx_*` indexes

#### 3. Unused Tables Cleanup (Query 3)
**Expected Result**: 
- `generation_requests`, `queue_jobs`, `sessions` should NOT appear (dropped)
- OR if they appear, they should be empty

#### 4. Missing Foreign Key Indexes (Query 4)
**What to Look For**: All rows should show `✅ Indexed`
- If you see `⚠️ Missing index`, add indexes for those foreign keys

#### 5. Tables Without Primary Keys (Query 5)
**Expected Result**: Should return 0 rows
- If any tables appear, they need primary keys added

#### 6. Missing Unique Constraints (Query 6)
**What to Check**:
- `users.email` - should be unique
- `licenses.license_key` - should be unique
- `subscriptions.stripe_subscription_id` - should be unique
- `password_reset_tokens.token_hash` - should be unique

**Expected**: Should return 0 rows (all have unique constraints)

#### 7. Table Sizes (Query 7)
**What to Monitor**:
- Tables > 1GB: Consider partitioning
- Tables > 512MB: Monitor growth
- Tables < 100MB: OK

#### 8. Orphaned Records (Queries 8-10)
**Expected Results**: All should return `0` orphaned records
- Orphaned `usage_logs` by `license_id`: 0
- Orphaned `usage_logs` by `user_id`: 0
- Orphaned `licenses` by `user_id`: 0 ✅ (already verified)

#### 9. Large Tables (Query 11)
**What to Look For**:
- Tables > 1GB: `⚠️ Consider partitioning`
- Tables > 512MB: `💡 Monitor size`
- Smaller tables: `✅ OK`

## Next Steps

1. **Run all verification queries** in the SQL editor
2. **Review results** against expected outcomes above
3. **If issues found**: Run `20251201_final_optimizations.sql` (if created)
4. **Document findings**: Note any warnings or recommendations

## Common Issues & Fixes

### Issue: Missing Unique Constraints
**Fix**: Run the unique constraint section in `20251201_verify_and_additional_optimizations.sql` (uncomment lines 121-173)

### Issue: Missing Foreign Key Indexes
**Fix**: Create indexes for any foreign keys showing as missing

### Issue: Large Tables
**Fix**: 
- Monitor growth
- Consider partitioning for tables > 1GB
- Archive old data if applicable

### Issue: Orphaned Records
**Fix**: Clean up orphaned records before adding foreign key constraints

## Production Readiness Checklist

- [ ] All performance indexes created
- [ ] Unused tables dropped
- [ ] All foreign keys have indexes
- [ ] All tables have primary keys
- [ ] Critical columns have unique constraints
- [ ] No orphaned records
- [ ] Table sizes are reasonable
- [ ] Statistics updated (ANALYZE run)

