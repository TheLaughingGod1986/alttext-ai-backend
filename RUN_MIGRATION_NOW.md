# 🚀 Run Migration Now - Quick Guide

## ⚡ Fastest Method: Render Dashboard

### Step 1: Open Render Dashboard
1. Go to https://dashboard.render.com
2. Navigate to your **PostgreSQL database** service
3. Click on the database name

### Step 2: Open SQL Editor
1. Click **"Connect"** or **"Query"** tab
2. Click **"Connect"** or **"Open Query Editor"**
3. You should see a SQL editor interface

### Step 3: Copy & Paste SQL
Copy this entire SQL block:

```sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';
CREATE INDEX IF NOT EXISTS "users_service_idx" ON "users"("service");
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "service" TEXT NOT NULL DEFAULT 'alttext-ai';
CREATE INDEX IF NOT EXISTS "usage_logs_userId_service_idx" ON "usage_logs"("userId", "service");
```

### Step 4: Execute
1. Paste the SQL into the editor
2. Click **"Run"** or **"Execute"**
3. Wait for success message (should say "Success" or show rows affected)

### Step 5: Verify (Optional)
Run this to check it worked:

```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'service';
```

Should return: `service`

---

## ✅ Done!

Once you see the success message, your migration is complete!

**Next:** Wait for Render backend deployment to finish, then test the connection.

---

## Alternative: Command Line (If you have DATABASE_URL)

If you have the DATABASE_URL set, you can run:

```bash
cd alttext-ai-backend-clone
export DATABASE_URL="your-connection-string-from-render"
./run-migration.sh
```

But the **Render Dashboard method is recommended** - it's easier and guaranteed to work!

