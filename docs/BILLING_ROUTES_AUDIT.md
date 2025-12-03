# Billing Routes Audit

**Date:** 2025-01-15  
**Status:** Documented - Both legacy and new routes active

## Current State

### Legacy Routes (`routes/billing.js`)
Active and registered in `server-v2.js:585`

**Endpoints:**
- `POST /billing/checkout` - Create checkout session
- `POST /billing/portal` - Create portal session
- `GET /billing/info` - Get billing info
- `GET /billing/subscription` - Get subscription status
- `POST /billing/webhook` - Stripe webhook handler (also at `/stripe/webhook`)
- `POST /billing/webhook/test` - Test webhook endpoint
- `GET /billing/plans` - Get available plans

**Status:** ⚠️ **In use** - Referenced in tests (`tests/integration/billing.test.js`)

### New Routes (`src/routes/billing.js`)
Active and registered in `server-v2.js:584`

**Endpoints:**
- `POST /billing/create-checkout` - Create checkout session
- `POST /billing/create-portal` - Create portal session
- `POST /billing/subscriptions` - Get subscriptions (POST)
- `GET /billing/subscription-status` - Get subscription status
- `POST /billing/credits/add` - Add credits
- `POST /billing/credits/spend` - Spend credits
- `GET /billing/credits/balance` - Get credit balance
- `GET /billing/credits/transactions` - Get credit transactions
- `GET /billing/history` - Get billing history

**Status:** ✅ **In use** - Referenced in tests (`tests/integration/billingRoutes.test.js`)

## Route Overlap Analysis

### Overlapping Functionality

| Legacy Route | New Route | Status |
|-------------|-----------|--------|
| `POST /billing/checkout` | `POST /billing/create-checkout` | Different paths, similar functionality |
| `POST /billing/portal` | `POST /billing/create-portal` | Different paths, similar functionality |
| `GET /billing/subscription` | `GET /billing/subscription-status` | Similar functionality, different response format |
| `GET /billing/subscription` | `POST /billing/subscriptions` | Different methods, similar functionality |

### Unique Legacy Routes
- `GET /billing/info` - Not present in new routes (functionality may be elsewhere)
- `GET /billing/plans` - Not present in new routes
- `POST /billing/webhook/test` - Test endpoint

### Unique New Routes
- `POST /billing/credits/add` - Credits functionality
- `POST /billing/credits/spend` - Credits functionality
- `GET /billing/credits/balance` - Credits functionality
- `GET /billing/credits/transactions` - Credits functionality
- `GET /billing/history` - Billing history

## Recommendations

### Short Term (Safe)
1. ✅ **Keep both route sets active** - Both are in use
2. ✅ **Add deprecation notices** to legacy routes
3. ✅ **Document migration path** for frontend/plugins

### Medium Term (After Frontend Migration)
1. ⚠️ **Verify frontend uses new routes** - Check frontend codebase
2. ⚠️ **Update tests** - Migrate tests to new routes
3. ⚠️ **Remove legacy routes** - After migration confirmed

### Migration Path

For frontend/plugins migrating from legacy to new routes:

1. `POST /billing/checkout` → `POST /billing/create-checkout`
2. `POST /billing/portal` → `POST /billing/create-portal`
3. `GET /billing/subscription` → `POST /billing/subscriptions` or `GET /billing/subscription-status`
4. `GET /billing/info` → Check if functionality moved to `/dashboard` or other endpoint
5. `GET /billing/plans` → Check if plans info is available elsewhere

## Action Items

- [ ] Verify which routes frontend/plugin actually uses
- [ ] Create migration guide for frontend team
- [ ] Set deprecation timeline for legacy routes
- [ ] Update API documentation to mark legacy routes as deprecated

## Notes

- Both route sets are currently active and tested
- Legacy routes may be used by existing frontend/plugin code
- Do not remove legacy routes until frontend migration is confirmed
- Webhook handler is duplicated (`/billing/webhook` and `/stripe/webhook`) - both use same handler

