# Backend Deployment Steps - SEO AI Meta Support

## ✅ Code Updates Complete

All backend code has been updated to support SEO AI Meta. Here's what to do next:

## Step 1: Run Database Migration

### Option A: Using Prisma Migrate (Recommended)
```bash
cd alttext-ai-backend-clone
npx prisma migrate dev --name add_service_support
npx prisma generate
```

### Option B: Manual SQL Migration
If Prisma migrate doesn't work, run this SQL directly on your database:

```sql
-- Add service column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "service" TEXT DEFAULT 'alttext-ai';
CREATE INDEX IF NOT EXISTS "users_service_idx" ON "users"("service");

-- Add service column to usage_logs table
ALTER TABLE "usage_logs" ADD COLUMN IF NOT EXISTS "service" TEXT DEFAULT 'alttext-ai';
CREATE INDEX IF NOT EXISTS "usage_logs_userId_service_idx" ON "usage_logs"("userId", "service");

-- Update existing records (if any)
UPDATE "users" SET "service" = 'alttext-ai' WHERE "service" IS NULL;
UPDATE "usage_logs" SET "service" = 'alttext-ai' WHERE "service" IS NULL;
```

## Step 2: Create Stripe Products

### In Stripe Dashboard:

1. **Go to Products** → Create Product

2. **Create SEO AI Meta Pro**:
   - Name: `SEO AI Meta Pro`
   - Description: `100 AI-generated meta tags per month with GPT-4-turbo`
   - Pricing: 
     - Amount: £12.99
     - Billing period: Monthly (recurring)
   - **Copy the Price ID** (starts with `price_`)

3. **Create SEO AI Meta Agency**:
   - Name: `SEO AI Meta Agency`
   - Description: `1000 AI-generated meta tags per month with GPT-4-turbo`
   - Pricing:
     - Amount: £49.99
     - Billing period: Monthly (recurring)
   - **Copy the Price ID** (starts with `price_`)

4. **Update Backend Code**:
   Edit `routes/billing.js` and replace the placeholder Price IDs:
   ```javascript
   'seo-ai-meta': [
     "price_YOUR_PRO_PRICE_ID",      // Replace with actual Price ID
     "price_YOUR_AGENCY_PRICE_ID"    // Replace with actual Price ID
   ]
   ```

## Step 3: Test Locally (Optional)

```bash
# Start the backend
npm start

# Test registration
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "service": "seo-ai-meta"
  }'

# Test usage endpoint
curl -X GET "http://localhost:3000/usage?service=seo-ai-meta" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test plans endpoint
curl -X GET "http://localhost:3000/billing/plans?service=seo-ai-meta"
```

## Step 4: Deploy to Production

### On Render:

1. **Push to Git Repository**:
   ```bash
   git add .
   git commit -m "Add SEO AI Meta service support"
   git push origin main
   ```

2. **Run Migration on Production**:
   - Connect to production database
   - Run the SQL migration from Step 1 (Option B)
   - OR use Render's database console

3. **Verify Deployment**:
   - Check Render logs for errors
   - Test health endpoint: `https://alttext-ai-backend.onrender.com/health`
   - Test API endpoints

## Step 5: Test WordPress Plugin Connection

1. **Go to WordPress Admin** → Posts → SEO AI Meta
2. **Click "Login"** button
3. **Register/Login** with `service: "seo-ai-meta"`
4. **Verify**:
   - Usage shows correct limits (10 for free)
   - Dashboard displays correctly
   - Plans show SEO AI Meta pricing

## Step 6: Create Stripe Products (If Not Done)

If you haven't created Stripe products yet, the checkout will fail. Make sure to:
1. Create both products in Stripe
2. Update Price IDs in `routes/billing.js`
3. Redeploy backend

## 🎯 Quick Checklist

- [ ] Run database migration
- [ ] Create Stripe products (SEO AI Meta Pro & Agency)
- [ ] Update Price IDs in `routes/billing.js`
- [ ] Test endpoints locally (optional)
- [ ] Deploy to production
- [ ] Test WordPress plugin connection
- [ ] Verify backward compatibility (AltText AI still works)

## 🔍 Verification

After deployment, verify:
1. ✅ `/usage?service=seo-ai-meta` returns correct limits (10/100/1000)
2. ✅ `/billing/plans?service=seo-ai-meta` returns SEO AI Meta plans
3. ✅ Registration with `service: "seo-ai-meta"` works
4. ✅ AltText AI endpoints still work (backward compatibility)

## 📝 Notes

- All changes are backward compatible
- Existing AltText AI users unaffected
- Service parameter is optional everywhere
- Default service is 'alttext-ai' if not specified

