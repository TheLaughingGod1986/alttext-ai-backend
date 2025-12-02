# API Changelog

All notable changes to the API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Standardized error response format (`src/utils/http.js`)
- Error response utilities for consistent error handling
- API error codes documentation (`docs/API_ERROR_CODES.md`)

### Changed
- Migrated environment variable access to centralized `loadEnv` utility
- Standardized error responses across all endpoints
- Improved validation layer integration with Zod schemas

### Fixed
- Fixed duplicate email service implementation
- Consolidated services directory structure
- Optimized organization routes query patterns

## [v1.0.0] - 2025-01-15

### Added
- `/api/generate` - Image alt text generation endpoint
- `/api/review` - Alt text review endpoint
- `/api/health` - Health check endpoint
- `/auth/register` - User registration
- `/auth/login` - User authentication
- `/auth/password-reset` - Password reset flow
- `/billing/*` - Billing and subscription management
- `/email/*` - Email sending endpoints
- `/api/organization/*` - Organization management
- `/api/license/*` - License management
- `/me/licenses` - Get user licenses
- `/me/sites` - Get user sites
- `/me/subscriptions` - Get user subscriptions
- `/me/invoices` - Get user invoices
- `/billing/history` - Get billing history
- `/organizations` - Get user organizations

### Changed
- Improved error handling and response formats
- Enhanced validation with Zod schemas
- Optimized database queries

### Fixed
- Fixed dashboard chart bugs (column name mismatches)
- Fixed rate limiting for authenticated requests
- Fixed site-based authentication for free-tier users

## Version History

### v1 (Current - Unversioned)
- All current endpoints are implicitly v1
- No breaking changes planned
- Backward compatible

### v2 (Planned)
- Enhanced generation options
- Improved analytics endpoints
- Better error handling
- Standardized response formats

## Migration Guides

### v1 to v2 (When Available)

See [API_VERSIONING.md](./API_VERSIONING.md) for detailed migration guides.

## Deprecation Schedule

No endpoints are currently deprecated.

## Breaking Changes

None in current version.

## Security Updates

- Enhanced authentication middleware
- Improved rate limiting
- Better input validation


