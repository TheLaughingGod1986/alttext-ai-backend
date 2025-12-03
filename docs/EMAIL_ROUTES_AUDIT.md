# Email Routes Audit

**Date:** 2025-01-15  
**Status:** Documented - Multiple email route files active

## Current State

### Legacy Routes (`routes/email.js`)
Registered in `server-v2.js:596` as fallback

**Endpoints:**
- `POST /email/welcome` - Welcome email
- `POST /email/license/activated` - License activation email
- `POST /email/credits/low` - Low credits warning
- `POST /email/receipt` - Receipt email
- `POST /email/plugin/signup` - Plugin signup email

**Status:** ⚠️ **Active** - Registered as fallback (only used if new routes don't match)

### New Routes (`src/routes/email.js`)
Registered in `server-v2.js:595` with higher priority

**Endpoints:**
- `POST /email/waitlist` - Waitlist email
- `POST /email/dashboard-welcome` - Dashboard welcome email
- `POST /email/plugin-signup` - Plugin signup email
- `POST /email/license-activated` - License activation email (different path from legacy)
- `POST /email/low-credit-warning` - Low credit warning (different path from legacy)
- `POST /email/receipt` - Receipt email

**Status:** ✅ **Active** - Primary routes, registered first

### Compatibility Routes (`src/routes/emailCompatibility.js`)
Registered in `server-v2.js:581` at root level

**Endpoints:**
- `POST /plugin/register` - Plugin registration (backward compatibility)
- `POST /wp-signup` - WordPress signup (backward compatibility)
- `POST /legacy-waitlist` - Legacy waitlist (backward compatibility)
- `POST /dashboard/email` - Dashboard email (backward compatibility)

**Status:** ✅ **Active** - Backward compatibility layer

## Route Overlap Analysis

### Overlapping Functionality

| Legacy Route | New Route | Compatibility Route | Notes |
|-------------|-----------|---------------------|-------|
| `POST /email/welcome` | `POST /email/dashboard-welcome` | `POST /dashboard/email` | Similar functionality, different paths |
| `POST /email/license/activated` | `POST /email/license-activated` | - | Different path format |
| `POST /email/credits/low` | `POST /email/low-credit-warning` | - | Different path format |
| `POST /email/receipt` | `POST /email/receipt` | - | Same path |
| `POST /email/plugin/signup` | `POST /email/plugin-signup` | `POST /plugin/register`, `POST /wp-signup` | Multiple compatibility routes |

### Route Registration Priority

1. **Root level compatibility routes** (`/plugin/register`, `/wp-signup`, etc.) - Registered first
2. **New email routes** (`/email/*`) - Registered second
3. **Legacy email routes** (`/email/*`) - Registered last as fallback

Since Express matches routes in registration order, new routes take precedence over legacy routes.

## Recommendations

### Current State (Safe)
1. ✅ **Keep all route files** - Backward compatibility is maintained
2. ✅ **Current registration order is correct** - New routes override legacy
3. ✅ **Compatibility routes provide legacy path support**

### Future Cleanup (After Migration Period)
1. ⚠️ **Monitor usage** - Check logs to see which routes are actually called
2. ⚠️ **Remove legacy routes** - After confirming no usage
3. ⚠️ **Consolidate compatibility routes** - If possible

## Action Items

- [ ] Monitor route usage in production logs
- [ ] Document which routes frontend/plugins use
- [ ] Create migration timeline if legacy routes need deprecation

## Notes

- Multiple email route files exist for backward compatibility
- Registration order ensures new routes take precedence
- Legacy routes serve as fallback only
- No immediate action needed - current structure supports backward compatibility

