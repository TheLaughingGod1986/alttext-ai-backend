# Backend Structure

## Directory Organization

The backend follows a clean, scalable structure with `/src` as the single source of truth:

```
/
├── src/                      # Main application code
│   ├── auth/                 # Authentication logic
│   │   ├── jwt.js           # JWT token generation/verification
│   │   ├── routes.js        # Auth routes (register, login, etc.)
│   │   └── email.js         # Auth-related emails
│   ├── routes/               # API route handlers
│   │   ├── billing.js       # Stripe billing routes
│   │   ├── license.js       # License management routes
│   │   ├── licenses.js      # Organization license routes
│   │   ├── organization.js  # Organization management
│   │   └── usage.js         # Usage tracking routes
│   ├── services/             # Business logic services
│   │   ├── emailService.js  # Email sending service
│   │   └── licenseService.js # License management service
│   ├── utils/                # Utilities
│   │   ├── apiKey.js        # OpenAI API key selection
│   │   ├── http.js          # HTTP response utilities
│   │   └── logger.js        # Standardized logging
│   ├── validation/           # Input validation layer
│   │   ├── index.js         # Validation exports
│   │   ├── validators.js    # Core validation functions
│   │   ├── auth.js          # Auth route validation
│   │   ├── billing.js       # Billing route validation
│   │   ├── generate.js      # Generate route validation
│   │   └── license.js       # License route validation
│   ├── middleware/           # Express middleware
│   │   └── dual-auth.js     # Dual authentication (JWT/License)
│   ├── stripe/               # Stripe integration
│   │   ├── checkout.js       # Checkout session creation
│   │   └── webhooks.js      # Webhook handling
│   ├── db/                   # Database client
│   │   └── supabase-client.js
│   └── config/               # Configuration
│       ├── env.example      # Environment template
│       ├── env.test          # Test environment
│       └── loadEnv.js        # Environment loading utility
├── tests/                     # Test files
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── mocks/                # Mock implementations
│   └── helpers/              # Test utilities
├── migrations/                # Database migrations
│   └── add_licenses_table.sql
├── docs/                      # Documentation
├── server-v2.js              # Main entry point
├── package.json
├── jest.config.js
└── README.md
```

## File Organization Principles

### Separation of Concerns
- **Routes** (`/src/routes`) - Handle HTTP requests/responses only
- **Services** (`/src/services`) - Business logic, no HTTP concerns
- **Validation** (`/src/validation`) - Input validation and sanitization
- **Middleware** (`/src/middleware`) - Request processing (auth, logging, etc.)

### Single Source of Truth
All application code lives under `/src`:
- `/src/auth` - Authentication
- `/src/routes` - API endpoints
- `/src/services` - Business logic
- `/src/utils` - Shared utilities
- `/src/validation` - Input validation
- `/src/middleware` - Express middleware
- `/src/stripe` - Stripe integration
- `/src/db` - Database client
- `/src/config` - Configuration

### Test Organization
Tests mirror the source structure:
- `tests/unit/` - Unit tests for individual modules
- `tests/integration/` - Integration tests for API endpoints
- `tests/mocks/` - Mock implementations
- `tests/helpers/` - Test utilities

## Import Paths

### Standard Import Patterns

```javascript
// From routes to services
const licenseService = require('../services/licenseService');

// From routes to middleware
const { combinedAuth } = require('../src/middleware/dual-auth');

// From routes to validation
const { validateRegistrationInput } = require('../src/validation/auth');

// From services to database
const { supabase } = require('../db/supabase-client');

// From services to utils
const { getServiceApiKey } = require('../src/utils/apiKey');
```

## Key Files

### Entry Point
- `server-v2.js` - Main Express application, route registration, middleware setup

### Core Services
- `src/services/licenseService.js` - License and organization management
- `src/services/emailService.js` - Email sending via Resend

### Authentication
- `src/auth/jwt.js` - JWT token generation and verification
- `src/auth/routes.js` - Authentication endpoints (register, login, etc.)
- `src/middleware/dual-auth.js` - Dual authentication middleware (JWT/License/Site Hash)

### Validation
- `src/validation/validators.js` - Core validation functions (email, password, domain)
- `src/validation/index.js` - Validation layer with standardized errors
- `src/validation/*.js` - Route-specific validators

## Migration History

### Recent Changes
- Moved `/validation` → `/src/validation`
- Moved `/middleware` → `/src/middleware`
- Moved `/stripe` → `/src/stripe`
- Moved `/utils` → `/src/utils`
- Created `/config` for environment files
- Created `/docs` for documentation

All import paths have been updated to reflect the new structure.

