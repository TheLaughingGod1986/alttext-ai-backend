# Required Columns Status Check

## Tasks to Verify

1. ✅ **Add `auto_attach_status` column to `licenses` table**
2. ✅ **Add `created_at` column to `sites` table**
3. ⚠️ **Update schema cache after migrations** (if applicable)
4. ✅ **Run database migrations to add the columns**

---

## Verification Steps

### Step 1: Check Current Status

Run this SQL file in Supabase SQL Editor:
**`db/migrations/20251201_verify_required_columns.sql`**

This will show:
- Whether `auto_attach_status` exists in `licenses` table (checks both snake_case and camelCase)
- Whether `created_at` exists in `sites` table (checks both snake_case and camelCase)
- Index status for both columns
- Full column listings for both tables

### Step 2: Fix Any Issues

If columns are missing or have wrong naming, run:
**`db/migrations/20251201_fix_column_naming_and_add_missing.sql`**

This migration will:
- ✅ Ensure `auto_attach_status` exists in `licenses` (snake_case)
- ✅ Rename `autoAttachStatus` → `auto_attach_status` if needed
- ✅ Ensure `created_at` exists in `sites` (snake_case)
- ✅ Rename `createdAt` → `created_at` if needed
- ✅ Create/update indexes
- ✅ Update existing records with default values

---

## Expected Results

After running the verification SQL, you should see:

### ✅ Success Status:
```
licenses.auto_attach_status: ✅ EXISTS (snake_case)
sites.created_at: ✅ EXISTS
SUMMARY: ✅ ALL COLUMNS EXIST
```

### ⚠️ If Issues Found:
- Column exists but wrong name (camelCase instead of snake_case)
- Column doesn't exist at all
- Index missing

**Solution:** Run the fix migration SQL file.

---

## Column Specifications

### `licenses.auto_attach_status`
- **Type:** VARCHAR(50)
- **Default:** 'manual'
- **Values:** 'manual', 'pending', 'attached'
- **Index:** `licenses_auto_attach_status_idx`

### `sites.created_at`
- **Type:** TIMESTAMPTZ
- **Default:** NOW()
- **Index:** (optional, but recommended for time-based queries)

---

## Migration History

1. **20251201_add_auto_attach_status_to_licenses.sql** - Initial migration (uses camelCase)
2. **20250207_create_sites_usage_tracking.sql** - Adds `created_at` to sites
3. **20251201_fix_column_naming_and_add_missing.sql** - Ensures correct naming and existence

---

## Next Steps

1. ✅ Run verification SQL to check current status
2. ✅ Run fix migration if needed
3. ✅ Verify again to confirm all columns exist
4. ✅ Update schema cache (if your ORM/tooling requires it)

---

**Last Updated:** 2025-12-01

