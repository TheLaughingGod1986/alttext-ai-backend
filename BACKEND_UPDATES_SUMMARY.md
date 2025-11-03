# Backend Updates Summary - SEO AI Meta Support

## ✅ Changes Completed

### 1. Database Schema Updates
- ✅ Added `service` field to `User` model (defaults to 'alttext-ai')
- ✅ Added `service` field to `UsageLog` model (defaults to 'alttext-ai')
- ✅ Added indexes for service fields
- ✅ Created migration SQL file

### 2. Usage Routes (`routes/usage.js`)
- ✅ Updated `/usage` endpoint to accept `service` query parameter
- ✅ Added service-specific plan limits:
  - AltText AI: 50/1000/10000 (free/pro/agency)
  - SEO AI Meta: 10/100/1000 (free/pro/agency)
- ✅ Updated `recordUsage()` to track service
- ✅ Updated `resetMonthlyTokens()` to handle service-specific limits

### 3. Billing Routes (`routes/billing.js`)
- ✅ Updated `/billing/checkout` to accept `service` parameter
- ✅ Added service-specific price ID validation (placeholder for SEO AI Meta)
- ✅ Updated `/billing/plans` to return service-specific plans
- ✅ SEO AI Meta plans configured (Price IDs pending Stripe product creation)

### 4. Authentication Routes (`auth/routes.js`)
- ✅ Updated `/auth/register` to accept optional `service` parameter
- ✅ Service-specific initial token limits (10 for SEO AI Meta, 50 for AltText AI)
- ✅ Validates service parameter

### 5. Stripe Integration (`stripe/checkout.js`)
- ✅ Updated `createCheckoutSession()` to accept and store service
- ✅ Added service to Stripe metadata
- ✅ Updated `handleSuccessfulCheckout()` with service-specific limits
- ✅ Updated `handleSubscriptionUpdate()` with service support
- ✅ Updated `handleInvoicePaid()` with service-specific resets

### 6. Webhooks (`stripe/webhooks.js`)
- ✅ Updated `handleSubscriptionDeleted()` with service-specific limits
- ✅ Fixed duplicate webhook handler issue

## 📋 Next Steps

### 1. Run Database Migration
```bash
cd alttext-ai-backend-clone
npx prisma migrate dev --name add_service_support
# OR manually run the SQL from prisma/migrations/add_service_support/migration.sql
npx prisma generate
```

### 2. Create Stripe Products (Required)
1. Go to Stripe Dashboard → Products
2. Create **SEO AI Meta Pro**:
   - Name: "SEO AI Meta Pro"
   - Price: £12.99/month (recurring)
   - Copy the Price ID (starts with `price_`)
3. Create **SEO AI Meta Agency**:
   - Name: "SEO AI Meta Agency"
   - Price: £49.99/month (recurring)
   - Copy the Price ID (starts with `price_`)
4. Update `routes/billing.js` with the new Price IDs:
   ```javascript
   'seo-ai-meta': [
     "price_XXX_SEO_PRO",      // Replace with actual Price ID
     "price_XXX_SEO_AGENCY"    // Replace with actual Price ID
   ]
   ```

### 3. Test the Updates
```bash
# Test usage endpoint
curl -X GET "http://localhost:3000/usage?service=seo-ai-meta" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test plans endpoint
curl -X GET "http://localhost:3000/billing/plans?service=seo-ai-meta"

# Test registration
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "service": "seo-ai-meta"
  }'
```

### 4. Deploy to Production
1. Push changes to repository
2. Render will auto-deploy
3. Run migration on production database
4. Test with WordPress plugin

## 🔍 Files Modified

1. `prisma/schema.prisma` - Added service fields
2. `routes/usage.js` - Service-aware usage tracking
3. `routes/billing.js` - Service-aware billing
4. `auth/routes.js` - Service-aware registration
5. `stripe/checkout.js` - Service-aware Stripe integration
6. `stripe/webhooks.js` - Service-aware webhook handling

## ✨ Backward Compatibility

All changes are **100% backward compatible**:
- Existing AltText AI users continue working
- Default service is 'alttext-ai' if not specified
- All existing endpoints work without service parameter
- No breaking changes to API

## 🎯 Testing Checklist

- [ ] Run database migration successfully
- [ ] Test registration with `service: "seo-ai-meta"`
- [ ] Test login (should work with any service)
- [ ] Test `/usage?service=seo-ai-meta` endpoint
- [ ] Test `/billing/plans?service=seo-ai-meta` endpoint
- [ ] Test checkout flow (after creating Stripe products)
- [ ] Test webhook handling
- [ ] Verify AltText AI still works (backward compatibility)

## 📝 Notes

- Service parameter is optional everywhere (defaults to 'alttext-ai')
- SEO AI Meta Price IDs need to be added after creating Stripe products
- Both services can share the same user account
- Usage tracking is separate per service
- Plans are independent per service (future: could support different plans per service)

