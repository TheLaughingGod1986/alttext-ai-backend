# Legacy Code Cleanup Plan

## Identified Issues

### 1. Legacy Route Files (High Priority)

#### `routes/billing.js` - LEGACY
- **Status:** Marked as LEGACY, duplicate of `src/routes/billing.js`
- **Routes:** `/billing/checkout`, `/billing/portal`, `/billing/subscription`
- **New Routes:** `/billing/create-checkout`, `/billing/create-portal`, `/billing/subscriptions`
- **Action:** Check usage, migrate clients, then remove

#### `routes/email.js` - LEGACY  
- **Status:** Legacy routes, duplicate of `src/routes/email.js`
- **Routes:** `/email/welcome`, `/email/license/activated`, etc.
- **New Routes:** Same paths in `src/routes/email.js`
- **Compatibility:** `src/routes/emailCompatibility.js` handles backward compatibility
- **Action:** Check usage, remove if `emailCompatibility.js` covers all cases

#### Legacy Webhook Route
- **Location:** `server-v2.js` line 504
- **Route:** `/billing/webhook` (DEPRECATED)
- **New Route:** `/stripe/webhook`
- **Action:** Remove after confirming Stripe only uses `/stripe/webhook`

### 2. Console.log Statements (Medium Priority)

#### Files with console.log (should use logger):
- `routes/organization.js` - 6 instances
- `routes/licenses.js` - 3 instances
- `routes/usage.js` - 15+ instances
- `routes/email.js` - 5 instances
- `routes/billing.js` - 20+ instances
- `routes/license.js` - 4 instances
- `src/stripe/checkout.js` - 27 instances
- `src/services/licenseService.js` - 7 instances
- `src/services/dashboardChartsService.js` - 13 instances

**Action:** Migrate to logger utility

### 3. Unused/Deprecated Code

#### `auth/email.js` - DEPRECATED
- **Status:** Already marked as deprecated
- **Action:** Keep for test compatibility, document clearly

#### Duplicate Route Registrations
- Both legacy and new routes registered in `server-v2.js`
- **Action:** Remove legacy registrations after migration period

## Cleanup Priority

### Phase 1: Safe Cleanups (Do Now)
1. ✅ Migrate console.log to logger in `routes/` directory
2. ✅ Migrate console.log to logger in `src/stripe/checkout.js`
3. ✅ Migrate console.log to logger in `src/services/` files
4. ✅ Remove legacy webhook route `/billing/webhook` (if confirmed unused)

### Phase 2: Legacy Route Cleanup (After Verification)
1. Check usage analytics for legacy routes
2. Migrate any active clients
3. Remove `routes/billing.js` if unused
4. Remove `routes/email.js` if `emailCompatibility.js` covers all cases
5. Update `server-v2.js` to remove legacy route registrations

### Phase 3: Documentation
1. Document deprecation timeline
2. Update API documentation
3. Create migration guides


