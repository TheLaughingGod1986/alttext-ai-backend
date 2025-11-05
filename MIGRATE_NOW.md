# 🚀 Run Migration - Choose Your Method

## ⚡ Method 1: Render Dashboard SQL Editor (RECOMMENDED - 2 minutes)

### Steps:
1. **Open Render Dashboard:**
   - Go to https://dashboard.render.com
   - Click on your **PostgreSQL database** service

2. **Open SQL Editor:**
   - Click **"Connect"** or **"Query"** tab
   - Click **"Connect"** or **"Open Query Editor"**

3. **Copy & Paste this SQL:**
   ```sql
   ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';
   CREATE INDEX IF NOT EXISTS "users_service_idx" ON "users"("service");
   ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';
   CREATE INDEX IF NOT EXISTS "usage_logs_userId_service_idx" ON "usage_logs"("userId", "service");
   ```

4. **Click "Run" or "Execute"**

5. **Done!** ✅

---

## 🔧 Method 2: Command Line (If you have production DATABASE_URL)

### Step 1: Get Connection String from Render
1. Go to Render Dashboard → Your Database
2. Click **"Connect"** tab
3. Copy **"External Connection"** string
   - Format: `postgresql://user:password@host:port/database`

### Step 2: Run Migration
```bash
cd "/Users/benjaminoats/Library/CloudStorage/SynologyDrive-File-sync/Coding/wp-alt-text-ai/alttext-ai-backend-clone"

# Set the production DATABASE_URL
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migration
./run-migration.sh
```

---

## 📝 SQL File Ready

I've created `QUICK_MIGRATION.sql` with the exact SQL you need.

**File location:**
```
alttext-ai-backend-clone/QUICK_MIGRATION.sql
```

---

## ✅ Verification

After running, verify it worked:

```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'service';
```

Should return: `service`

---

**Recommendation:** Use **Method 1** (Render Dashboard) - it's the fastest and most reliable!



