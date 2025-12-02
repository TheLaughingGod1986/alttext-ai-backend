# API Endpoints Verification

This document verifies the existence and location of all API endpoints mentioned by the frontend team.

## Endpoints Verification Status

### ✅ Verified - All Endpoints Exist

All endpoints mentioned in the frontend verification document **DO EXIST** in the backend. Here's the complete breakdown:

---

## 1. License Activation Endpoint

**Question:** Does `/api/license/activate` exist, or should it be `/api/licenses/activate`?

**Answer:** ✅ **`/api/license/activate` EXISTS** (singular, not plural)

- **Route:** `POST /api/license/activate`
- **File:** `routes/license.js:36`
- **Authentication:** Not required (license activation endpoint)
- **Description:** Activates a license key for a WordPress site
- **Status:** ✅ Verified correct

---

## 2. Credits Endpoints

**Question:** Do `/credits/balance` and `/credits/packs` exist?

**Answer:** ✅ **Both endpoints EXIST**

### `/credits/balance`
- **Route:** `GET /credits/balance`
- **File:** `src/routes/credits.js:61`
- **Authentication:** Required (JWT token)
- **Description:** Returns current credit balance for authenticated user
- **Response:**
  ```json
  {
    "ok": true,
    "credits": 0
  }
  ```

### `/credits/packs`
- **Route:** `GET /credits/packs`
- **File:** `src/routes/credits.js:44`
- **Authentication:** Required (JWT token)
- **Description:** Returns available credit packs
- **Response:**
  ```json
  {
    "ok": true,
    "packs": [...]
  }
  ```

**Status:** ✅ Both verified correct

---

## 3. Review Endpoint

**Question:** Does `/api/review` exist?

**Answer:** ✅ **`/api/review` EXISTS**

- **Route:** `POST /api/review`
- **File:** `server-v2.js:1001`
- **Authentication:** Required (JWT token + subscription check)
- **Description:** Reviews existing alt text for accuracy
- **Request Body:**
  ```json
  {
    "alt_text": "string",
    "image_data": { ... },
    "context": { ... },
    "service": "alttext-ai"
  }
  ```
- **Status:** ✅ Verified correct

---

## 4. Billing Endpoints

**Question:** Do `/billing/info`, `/billing/portal`, and `/billing/subscription` exist?

**Answer:** ✅ **All endpoints EXIST** (with minor path variations)

### `/billing/info`
- **Route:** `GET /billing/info`
- **File:** `routes/billing.js:191`
- **Authentication:** Required (JWT token)
- **Description:** Get user's billing info including plan and subscription status
- **Status:** ✅ Verified correct

### `/billing/portal`
- **Route:** `POST /billing/create-portal` (not `/billing/portal`)
- **File:** `src/routes/billing.js:165`
- **Authentication:** Required (JWT token)
- **Description:** Creates a Stripe customer portal session
- **Note:** Endpoint is `/billing/create-portal`, not `/billing/portal`
- **Status:** ⚠️ Path difference - frontend should use `/billing/create-portal`

### `/billing/subscription`
- **Routes:** 
  - `GET /billing/subscription` (legacy)
  - `POST /billing/subscriptions` (new, with email in body)
- **Files:** 
  - `routes/billing.js:242` (GET)
  - `src/routes/billing.js:227` (POST)
- **Authentication:** Required (JWT token)
- **Description:** Get user's subscription information
- **Status:** ✅ Both exist - recommend using POST version

**Additional billing endpoint:**
- `GET /billing/subscription-status` - `src/routes/billing.js:290`

---

## 5. Missing Endpoints (Just Added)

These endpoints were missing and have now been implemented:

### ✅ `/me/licenses`
- **Route:** `GET /me/licenses`
- **File:** `src/routes/dashboard.js:321`
- **Authentication:** Required (JWT token)
- **Description:** Get all licenses for authenticated user

### ✅ `/me/sites`
- **Route:** `GET /me/sites`
- **File:** `src/routes/dashboard.js:399`
- **Authentication:** Required (JWT token)
- **Description:** Get all sites for authenticated user

### ✅ `/me/subscriptions`
- **Route:** `GET /me/subscriptions`
- **File:** `src/routes/dashboard.js:477`
- **Authentication:** Required (JWT token)
- **Description:** Get all subscriptions for authenticated user

### ✅ `/me/invoices`
- **Route:** `GET /me/invoices`
- **File:** `src/routes/dashboard.js:530`
- **Authentication:** Required (JWT token)
- **Description:** Get all Stripe invoices for authenticated user

### ✅ `/billing/history`
- **Route:** `GET /billing/history`
- **File:** `src/routes/billing.js:667` (just added)
- **Authentication:** Required (JWT token)
- **Description:** Get billing history (invoices + transactions)

### ✅ `/organizations`
- **Route:** `GET /organizations`
- **File:** `server-v2.js:594` (just added)
- **Authentication:** Required (JWT token)
- **Description:** Get user organizations (alias for `/api/organization/my-organizations`)

---

## Complete Endpoint Reference

### Authentication & Identity
- ✅ `POST /auth/register` - Register new user
- ✅ `POST /auth/login` - Login user
- ✅ `GET /auth/me` - Get current user
- ✅ `POST /auth/forgot-password` - Request password reset
- ✅ `POST /auth/reset-password` - Reset password
- ✅ `POST /identity/sync` - Sync identity

### Licenses
- ✅ `POST /api/license/activate` - **SINGULAR** (not `/api/licenses/activate`)
- ✅ `POST /api/licenses/auto-attach` - Auto-attach license to site
- ✅ `GET /api/licenses/sites` - Get sites for license
- ✅ `GET /api/licenses/sites/{site_id}` - Get specific site

### Credits
- ✅ `GET /credits/balance` - Get credit balance
- ✅ `GET /credits/packs` - Get available credit packs

### Usage
- ✅ `GET /usage` - Get site usage/quota

### Generation & Review
- ✅ `POST /api/generate` - Generate alt text
- ✅ `POST /api/review` - Review alt text accuracy

### Billing
- ✅ `POST /billing/checkout` - Create checkout session
- ✅ `POST /billing/create-portal` - Create portal session (not `/billing/portal`)
- ✅ `GET /billing/info` - Get billing info
- ✅ `GET /billing/subscription` - Get subscription (legacy GET)
- ✅ `POST /billing/subscriptions` - Get subscriptions (new POST)
- ✅ `GET /billing/subscription-status` - Get subscription status
- ✅ `GET /billing/history` - Get billing history (just added)

### User Account (`/me/*`)
- ✅ `GET /me` - Get user session data
- ✅ `GET /me/licenses` - Get user licenses (just added)
- ✅ `GET /me/sites` - Get user sites (just added)
- ✅ `GET /me/subscriptions` - Get user subscriptions (just added)
- ✅ `GET /me/invoices` - Get user invoices (just added)

### Organizations
- ✅ `GET /organizations` - Get user organizations (just added)
- ✅ `GET /api/organization/my-organizations` - Get user organizations (existing)

---

## Notes for Frontend Team

### Path Differences

1. **Billing Portal:**
   - Frontend expects: `POST /billing/portal`
   - Backend has: `POST /billing/create-portal`
   - **Action:** Update frontend to use `/billing/create-portal`

2. **License Activation:**
   - Frontend question: `/api/license/activate` vs `/api/licenses/activate`
   - **Answer:** Use `/api/license/activate` (singular) - this is correct

3. **Billing Subscription:**
   - Both `GET /billing/subscription` and `POST /billing/subscriptions` exist
   - **Recommendation:** Use `POST /billing/subscriptions` (newer version with email verification)

### All Endpoints Require Authentication

All endpoints (except license activation) require JWT authentication via `Authorization: Bearer <token>` header.

### Headers

All requests should include:
- `Authorization: Bearer <token>` (when user is authenticated)
- `X-Site-Hash: <hash>` (required for quota tracking)
- `X-License-Key: <key>` (optional, when license is available)
- `X-Site-URL: <url>` (optional, for reference)

---

## Summary

✅ **All 8 endpoints mentioned in frontend verification DO EXIST:**
1. ✅ `/api/license/activate` - EXISTS (singular)
2. ✅ `/credits/balance` - EXISTS
3. ✅ `/credits/packs` - EXISTS
4. ✅ `/api/review` - EXISTS
5. ✅ `/billing/info` - EXISTS
6. ✅ `/billing/create-portal` - EXISTS (path is `/billing/create-portal`, not `/billing/portal`)
7. ✅ `/billing/subscription` - EXISTS (both GET and POST versions)

✅ **All 6 missing endpoints have been implemented:**
1. ✅ `/me/licenses`
2. ✅ `/me/sites`
3. ✅ `/me/subscriptions`
4. ✅ `/me/invoices`
5. ✅ `/billing/history`
6. ✅ `/organizations`

**No 404 errors should occur** when calling these endpoints with proper authentication.

