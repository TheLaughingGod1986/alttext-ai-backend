# Fresh-Stack API Specification

**Version:** 2.0
**Last Updated:** 2025-12-11
**Status:** Implementation Ready

This document defines the standardized API contract between the WordPress plugin and the fresh-stack backend.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Usage & Quota](#usage--quota)
3. [License Management](#license-management)
4. [Alt Text Generation](#alt-text-generation)
5. [Multi-User & Multi-Site](#multi-user--multi-site)
6. [Billing](#billing)
7. [Error Handling](#error-handling)

---

## Authentication

All API requests require one of the following:

### Option 1: License Key (Recommended for Plugin)
```http
X-License-Key: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Option 2: API Token (Simple Auth)
```http
X-API-Key: your-api-token
```

### Option 3: Session Token (Dashboard Only)
```http
Authorization: Bearer <session_token>
```

---

## Usage & Quota

### GET /usage

Get current usage and quota information for the license.

**Headers:**
```http
X-License-Key: <license_key>
X-Site-Key: <site_hash> (optional, for multi-site)
```

**Response:** `200 OK`
```json
{
  "credits_used": 234,
  "credits_remaining": 766,
  "total_limit": 1000,
  "plan_type": "pro",
  "reset_date": "2025-01-15T00:00:00Z",
  "billing_cycle": "monthly",
  "rate_limit": {
    "requests_per_minute": 120,
    "burst_limit": 200
  }
}
```

**Field Definitions:**
- `credits_used` (integer): Total credits consumed in current billing period
- `credits_remaining` (integer): Credits remaining until quota exhausted
- `total_limit` (integer): Total credits allocated for current billing period
- `plan_type` (string): `"free"`, `"pro"`, or `"agency"`
- `reset_date` (ISO 8601): When quota resets (ALWAYS provided, never null)
- `billing_cycle` (string): `"monthly"`, `"annual"`, etc.
- `rate_limit` (object): API rate limiting info

**Error Response:** `401 Unauthorized`
```json
{
  "error": "invalid_license",
  "message": "License key is invalid or expired",
  "code": "INVALID_LICENSE"
}
```

---

### GET /usage/users

Get usage breakdown by user (for Pro/Agency plans with multiple users).

**Headers:**
```http
X-License-Key: <license_key>
X-Site-Key: <site_hash> (optional)
```

**Response:** `200 OK`
```json
{
  "site_id": "abc123",
  "period_start": "2025-12-01T00:00:00Z",
  "period_end": "2026-01-01T00:00:00Z",
  "total_credits_used": 234,
  "users": [
    {
      "user_id": "wp_user_5",
      "user_email": "admin@example.com",
      "credits_used": 150,
      "last_activity": "2025-12-11T10:30:00Z"
    },
    {
      "user_id": "wp_user_12",
      "user_email": "editor@example.com",
      "credits_used": 84,
      "last_activity": "2025-12-10T15:20:00Z"
    }
  ]
}
```

---

### GET /usage/sites

Get usage breakdown by site (Agency plans only).

**Headers:**
```http
X-License-Key: <license_key>
```

**Response:** `200 OK`
```json
{
  "license_id": "uuid",
  "plan_type": "agency",
  "total_credits_used": 5234,
  "total_limit": 10000,
  "credits_remaining": 4766,
  "reset_date": "2025-01-15T00:00:00Z",
  "sites": [
    {
      "site_id": "abc123",
      "site_url": "https://client1.com",
      "site_name": "Client Site 1",
      "credits_used": 2100,
      "quota_limit": 3000,
      "quota_remaining": 900,
      "status": "active",
      "activated_at": "2025-11-01T00:00:00Z"
    },
    {
      "site_id": "def456",
      "site_url": "https://client2.com",
      "site_name": "Client Site 2",
      "credits_used": 3134,
      "quota_limit": 5000,
      "quota_remaining": 1866,
      "status": "active",
      "activated_at": "2025-11-05T00:00:00Z"
    }
  ]
}
```

**Error Response:** `403 Forbidden` (if not agency plan)
```json
{
  "error": "plan_not_supported",
  "message": "Multi-site usage tracking requires an Agency plan",
  "code": "PLAN_NOT_SUPPORTED"
}
```

---

## License Management

### POST /license/validate

Validate a license key without activating it.

**Request Body:**
```json
{
  "license_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Response:** `200 OK`
```json
{
  "valid": true,
  "license": {
    "id": "uuid",
    "license_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "status": "active",
    "plan_type": "pro",
    "organization_id": "org_uuid",
    "organization_name": "Acme Corp",
    "expires_at": 1735689600,
    "activated_at": 1704153600,
    "max_sites": 1,
    "activated_sites": 0
  }
}
```

**Field Definitions:**
- `status` (string): `"active"`, `"expired"`, `"suspended"`, `"cancelled"`
- `plan_type` (string): `"free"`, `"pro"`, `"agency"`
- `expires_at` (unix timestamp): License expiration date (null for perpetual)
- `max_sites` (integer): Maximum sites allowed (1 for free/pro, unlimited for agency)
- `activated_sites` (integer): Number of currently activated sites

**Error Response:** `401 Unauthorized`
```json
{
  "valid": false,
  "error": "invalid_license",
  "message": "License key not found",
  "code": "LICENSE_NOT_FOUND"
}
```

**Other Status Codes:**
- `410 Gone` - License expired
- `403 Forbidden` - License suspended/cancelled

---

### POST /license/activate

Activate a license on a specific site.

**Request Body:**
```json
{
  "license_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "site_id": "abc123def456",
  "site_url": "https://example.com",
  "site_name": "Example Site",
  "fingerprint": "sha256_hash_of_site_details"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "License activated successfully",
  "license": {
    "id": "uuid",
    "status": "active",
    "plan_type": "pro",
    "organization_id": "org_uuid",
    "site_id": "abc123def456",
    "activated_at": 1734000000,
    "expires_at": 1735689600
  }
}
```

**Error Response:** `409 Conflict` (Already activated on different site)
```json
{
  "success": false,
  "error": "license_already_activated",
  "message": "This license is already activated on another site",
  "code": "LICENSE_ALREADY_ACTIVATED",
  "activated_site": {
    "site_id": "xyz789",
    "site_url": "https://other-site.com",
    "activated_at": 1733000000
  }
}
```

**Error Response:** `403 Forbidden` (Max sites reached)
```json
{
  "success": false,
  "error": "max_sites_reached",
  "message": "Maximum number of sites reached for this license",
  "code": "MAX_SITES_REACHED",
  "max_sites": 1,
  "activated_sites": 1
}
```

---

### POST /license/deactivate

Deactivate a license from a site.

**Request Body:**
```json
{
  "license_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "site_id": "abc123def456"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "License deactivated successfully"
}
```

---

### POST /license/sites/{site_id}/quota

Set quota limit for a specific site (Agency plans only).

**Headers:**
```http
X-License-Key: <agency_license_key>
```

**Request Body:**
```json
{
  "quota_limit": 3000
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Site quota updated successfully",
  "site": {
    "site_id": "abc123",
    "quota_limit": 3000,
    "quota_remaining": 900,
    "credits_used": 2100
  }
}
```

**Error Response:** `403 Forbidden`
```json
{
  "success": false,
  "error": "plan_not_supported",
  "message": "Setting per-site quotas requires an Agency plan",
  "code": "PLAN_NOT_SUPPORTED"
}
```

---

### GET /license/sites

List all sites activated under a license (Agency plans only).

**Headers:**
```http
X-License-Key: <agency_license_key>
```

**Response:** `200 OK`
```json
{
  "license_id": "uuid",
  "plan_type": "agency",
  "total_sites": 3,
  "max_sites": null,
  "sites": [
    {
      "site_id": "abc123",
      "site_url": "https://client1.com",
      "site_name": "Client Site 1",
      "status": "active",
      "quota_limit": 3000,
      "credits_used": 2100,
      "activated_at": "2025-11-01T00:00:00Z",
      "last_activity": "2025-12-11T10:30:00Z"
    }
  ]
}
```

---

## Alt Text Generation

### POST /api/alt-text

Generate alt text for a single image.

**Headers:**
```http
X-License-Key: <license_key>
X-Site-Key: <site_hash>
X-WP-User-ID: <wordpress_user_id> (optional, for per-user tracking)
X-WP-User-Email: <user_email> (optional)
```

**Request Body:**
```json
{
  "image": {
    "url": "https://example.com/image.jpg",
    "width": 512,
    "height": 341,
    "mime_type": "image/jpeg",
    "filename": "hero-banner.jpg"
  },
  "context": {
    "title": "Hero Banner",
    "pageTitle": "Home - Example.com",
    "surroundingText": "Welcome to our homepage"
  }
}
```

**Response:** `200 OK`
```json
{
  "altText": "Professional team collaborating on laptop in modern office",
  "credits_used": 1,
  "credits_remaining": 999,
  "usage": {
    "prompt_tokens": 234,
    "completion_tokens": 18,
    "total_tokens": 252
  },
  "meta": {
    "modelUsed": "gpt-4o-mini",
    "cached": false,
    "generation_time_ms": 1234
  }
}
```

**Error Response:** `402 Payment Required` (Quota exceeded)
```json
{
  "error": "quota_exceeded",
  "message": "Monthly quota exceeded. Upgrade your plan or wait until reset date.",
  "code": "QUOTA_EXCEEDED",
  "credits_used": 1000,
  "total_limit": 1000,
  "reset_date": "2025-01-01T00:00:00Z"
}
```

---

### POST /api/jobs

Create a batch job to process multiple images.

**Headers:**
```http
X-License-Key: <license_key>
X-Site-Key: <site_hash>
X-WP-User-ID: <wordpress_user_id> (optional)
X-WP-User-Email: <user_email> (optional)
```

**Request Body:**
```json
{
  "images": [
    {
      "id": "attachment_123",
      "image": {
        "url": "https://example.com/image1.jpg",
        "width": 512,
        "height": 341
      },
      "context": {
        "title": "Image 1"
      }
    },
    {
      "id": "attachment_124",
      "image": {
        "url": "https://example.com/image2.jpg",
        "width": 800,
        "height": 600
      }
    }
  ],
  "context": {
    "pageTitle": "Gallery Page"
  }
}
```

**Response:** `202 Accepted`
```json
{
  "jobId": "job_abc123",
  "status": "processing",
  "total": 2,
  "completed": 0,
  "failed": 0,
  "estimatedCompletionTime": "2025-12-11T10:35:00Z"
}
```

**Error Response:** `402 Payment Required` (Insufficient quota for batch)
```json
{
  "error": "insufficient_quota",
  "message": "Batch job requires 50 credits, but only 30 remaining",
  "code": "INSUFFICIENT_QUOTA",
  "required_credits": 50,
  "credits_remaining": 30,
  "reset_date": "2025-01-01T00:00:00Z"
}
```

---

### GET /api/jobs/:jobId

Get status of a batch job.

**Response:** `200 OK` (In Progress)
```json
{
  "jobId": "job_abc123",
  "status": "processing",
  "total": 50,
  "completed": 35,
  "failed": 2,
  "progress": 0.74,
  "estimatedCompletionTime": "2025-12-11T10:35:00Z",
  "credits_used": 37
}
```

**Response:** `200 OK` (Completed)
```json
{
  "jobId": "job_abc123",
  "status": "completed",
  "total": 50,
  "completed": 48,
  "failed": 2,
  "progress": 1.0,
  "completedAt": "2025-12-11T10:34:23Z",
  "credits_used": 48,
  "results": [
    {
      "id": "attachment_123",
      "altText": "Professional team meeting",
      "success": true
    },
    {
      "id": "attachment_124",
      "altText": null,
      "success": false,
      "error": "Image too large (>10MB)"
    }
  ]
}
```

---

## Multi-User & Multi-Site

### Tracking Users

To track usage per user, include these headers in alt text generation requests:

```http
X-WP-User-ID: 5
X-WP-User-Email: admin@example.com
```

Backend will automatically log:
- User ID
- User email
- Site ID
- Timestamp
- Credits used

### Agency Multi-Site Setup

1. **Activate license on each site:**
   ```bash
   POST /license/activate
   {
     "license_key": "agency_key",
     "site_id": "site1_hash",
     "site_url": "https://client1.com"
   }
   ```

2. **Set per-site quota limits:**
   ```bash
   POST /license/sites/site1_hash/quota
   {
     "quota_limit": 3000
   }
   ```

3. **Each site uses same license key but different site ID:**
   ```http
   X-License-Key: agency_key
   X-Site-Key: site1_hash
   ```

4. **Agency owner views all sites:**
   ```bash
   GET /license/sites
   GET /usage/sites
   ```

---

## Billing

### GET /billing/plans

Get available plans and pricing.

**Response:** `200 OK`
```json
{
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "price": 0,
      "credits": 50,
      "billing_cycle": "monthly",
      "max_sites": 1,
      "features": [
        "50 credits/month",
        "1 site",
        "Multiple users",
        "Basic support"
      ]
    },
    {
      "id": "pro",
      "name": "Pro",
      "price": 1900,
      "credits": 1000,
      "billing_cycle": "monthly",
      "max_sites": 1,
      "stripe_price_id": "price_1SMrxaJl9Rm418cMM4iikjlJ",
      "features": [
        "1,000 credits/month",
        "1 site",
        "Multiple users",
        "Priority support"
      ]
    },
    {
      "id": "agency",
      "name": "Agency",
      "price": 9900,
      "credits": 10000,
      "billing_cycle": "monthly",
      "max_sites": null,
      "stripe_price_id": "price_1SMrxaJl9Rm418cMnJTShXSY",
      "features": [
        "10,000 credits/month",
        "Unlimited sites",
        "Per-site quotas",
        "Agency dashboard",
        "Priority support"
      ]
    }
  ]
}
```

---

### POST /billing/checkout

Create a Stripe checkout session for plan upgrade.

**Headers:**
```http
X-License-Key: <license_key>
```

**Request Body:**
```json
{
  "plan": "pro",
  "success_url": "https://example.com/success",
  "cancel_url": "https://example.com/cancel"
}
```

**Response:** `200 OK`
```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "session_id": "cs_test_..."
}
```

---

### POST /billing/portal

Create a Stripe customer portal session for managing subscription.

**Headers:**
```http
X-License-Key: <license_key>
```

**Request Body:**
```json
{
  "return_url": "https://example.com/dashboard"
}
```

**Response:** `200 OK`
```json
{
  "portal_url": "https://billing.stripe.com/p/session/test_..."
}
```

---

### GET /billing/subscription

Get current subscription details.

**Headers:**
```http
X-License-Key: <license_key>
```

**Response:** `200 OK`
```json
{
  "status": "active",
  "plan_type": "pro",
  "current_period_start": "2025-12-01T00:00:00Z",
  "current_period_end": "2026-01-01T00:00:00Z",
  "cancel_at_period_end": false,
  "stripe_subscription_id": "sub_...",
  "stripe_customer_id": "cus_..."
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow this format:

```json
{
  "error": "error_type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE_UPPERCASE",
  "details": {
    "field": "additional context if needed"
  }
}
```

### HTTP Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `202 Accepted` - Request accepted (async processing)
- `400 Bad Request` - Invalid request body/parameters
- `401 Unauthorized` - Invalid or missing authentication
- `402 Payment Required` - Quota exceeded
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., license already activated)
- `410 Gone` - Resource expired
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Temporary service disruption

### Common Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `INVALID_LICENSE` | License key invalid or not found | 401 |
| `LICENSE_EXPIRED` | License has expired | 410 |
| `LICENSE_SUSPENDED` | License suspended/cancelled | 403 |
| `LICENSE_ALREADY_ACTIVATED` | License active on different site | 409 |
| `MAX_SITES_REACHED` | Maximum sites activated | 403 |
| `QUOTA_EXCEEDED` | Monthly quota exhausted | 402 |
| `INSUFFICIENT_QUOTA` | Not enough credits for batch | 402 |
| `PLAN_NOT_SUPPORTED` | Feature requires different plan | 403 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `INVALID_REQUEST` | Malformed request body | 400 |
| `SERVER_ERROR` | Internal server error | 500 |

---

## Versioning

API version is included in the response headers:

```http
X-API-Version: 2.0
```

Breaking changes will increment the major version. The API will maintain backward compatibility for at least 6 months after deprecation notices.

---

## Rate Limiting

Rate limits are enforced per license key:

- **Free:** 60 requests/minute
- **Pro:** 120 requests/minute
- **Agency:** 240 requests/minute

Rate limit info is included in response headers:

```http
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1734005400
```

When rate limit is exceeded:

```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit of 120 requests/minute exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 45
}
```

---

## Best Practices for Plugin Integration

1. **Always send user tracking headers** (`X-WP-User-ID`, `X-WP-User-Email`)
2. **Cache license validation** (don't validate on every request)
3. **Handle quota exhaustion gracefully** (show upgrade prompt)
4. **Poll batch jobs with exponential backoff** (start at 2s, max 30s)
5. **Display reset_date prominently** (show when quota refills)
6. **Log errors with request IDs** (for debugging)
7. **Never recalculate quota on client** (trust backend values)
8. **Show rate limit info in UI** (warn before hitting limit)

---

## Migration from Legacy API

### Field Name Mapping

| Legacy Field | New Field (v2.0) |
|-------------|------------------|
| `used` | `credits_used` |
| `remaining` | `credits_remaining` |
| `limit` | `total_limit` |
| `plan` | `plan_type` |
| `resetTimestamp` | `reset_date` |
| `period_end` | `reset_date` |

### Deprecated Endpoints

- `POST /api/generate` → Use `POST /api/alt-text`
- `/usage` (without prefix) → Use `/usage` (standardized)

---

**End of API Specification**
