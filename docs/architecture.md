# Architecture

## System Overview

Production-ready Node.js backend API for the AltText AI WordPress plugin. Features user authentication, usage tracking, Stripe billing, and organization licensing.

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** Supabase (PostgreSQL)
- **Authentication:** JWT
- **Payment:** Stripe
- **Email:** Resend
- **AI:** OpenAI API

## Design Decisions

### Directory Structure

The backend follows a clean, scalable structure with `/src` as the single source of truth:

```
/src
  /auth          # Authentication logic (jwt, routes, email)
  /routes        # API route handlers
  /services      # Business logic services
  /utils         # Utilities (apiKey, logger, http)
  /validation    # Input validation layer
  /middleware    # Express middleware
  /stripe        # Stripe integration (checkout, webhooks)
  /db            # Database client
  /config        # Configuration files
```

### Authentication

The backend supports multiple authentication methods:
- **JWT tokens** for personal accounts
- **License keys** for agency licenses
- **Site hashes** for site-based quota sharing

The `combinedAuth` middleware handles all three methods, allowing flexible authentication across different use cases.

### Organization-Based Quota System

Quota is tracked per organization, allowing multiple users/sites to share a single pool of tokens/credits. This enables:
- Agency plans with multiple sites
- Team collaboration
- Centralized billing

### Service Architecture

Services are organized by domain:
- `licenseService.js` - License and organization management
- `emailService.js` - Email sending via Resend
- `usageService.js` - Usage tracking and quota management

## Technical Debt

### High Priority
1. **routes/organization.js** - Very low test coverage (6.99% statements, 0% branches)
   - Action needed: Add comprehensive test coverage

2. **src/stripe/checkout.js** - Low test coverage (33.76% statements)
   - Action needed: Add tests for untested code paths

3. **services/emailService.js** - Some untested code paths (lines 803-984)
   - Action needed: Add tests for email template generation

### Medium Priority
1. **Adopt new utilities** - Gradually migrate to:
   - `src/utils/logger.js` for standardized logging (replace console.log/error/warn)
   - `src/utils/http.js` for standardized HTTP responses
   - `config/loadEnv.js` for environment variable management

2. **Validation layer** - Route-specific validators created and ready for adoption:
   - `src/validation/auth.js` - Ready to use in `auth/routes.js`
   - `src/validation/license.js` - Ready to use in `routes/license.js` and `routes/licenses.js`
   - `src/validation/billing.js` - Ready to use in `routes/billing.js`
   - `src/validation/generate.js` - Ready to use in `server-v2.js` generate endpoint

### Low Priority
1. **migrations/** - Consider documenting migration process or adding automated migration runner
2. **Performance optimizations** - Consider caching, batching, and memoization opportunities

## Security

- OpenAI API key stored server-side only
- Domains are hashed for privacy
- Rate limiting enabled
- CORS configured
- Helmet security headers
- JWT tokens with expiration
- Input validation and sanitization

## Backward Compatibility

All public APIs remain unchanged:
- Service methods maintain identical signatures
- Route endpoints unchanged
- Response formats unchanged
- Authentication mechanisms unchanged

