# API Versioning Strategy

## Overview

This document outlines the API versioning strategy for the AltText AI backend API. The goal is to provide a clear path for API evolution while maintaining backward compatibility.

## Versioning Approach

### Path-Based Versioning (Recommended)

We use **path-based versioning** where the API version is included in the URL path:

```
/api/v1/generate
/api/v2/generate
```

**Benefits:**
- Clear and explicit
- Easy to route different versions
- Allows gradual migration
- Frontend can target specific versions

**Current Status:**
- Most endpoints are currently unversioned (implicitly v1)
- New endpoints should use `/api/v2/` prefix
- Legacy endpoints remain at root level for backward compatibility

## Version Lifecycle

### Version States

1. **Current** - Active development, new features added
2. **Stable** - Feature-complete, only bug fixes
3. **Deprecated** - Still supported but scheduled for removal
4. **Removed** - No longer available

### Deprecation Process

1. **Announcement** (3 months before deprecation)
   - Add `X-API-Deprecated: true` header to responses
   - Include deprecation notice in response body
   - Update documentation

2. **Migration Period** (3-6 months)
   - Keep deprecated version functional
   - Provide migration guides
   - Monitor usage metrics

3. **Removal**
   - Remove deprecated endpoints
   - Update changelog
   - Notify users via email/documentation

## Version Numbering

### Semantic Versioning for API

- **Major (v1, v2, v3)**: Breaking changes
  - Response format changes
  - Required parameter changes
  - Authentication changes
  - Endpoint removal

- **Minor (v1.1, v1.2)**: Backward-compatible additions
  - New optional parameters
  - New endpoints
  - New response fields (optional)

- **Patch**: Bug fixes only (no URL changes)

## Current API Structure

### Unversioned Endpoints (Legacy - Implicitly v1)

These endpoints are currently unversioned but should be considered v1:

- `/api/generate` - Image alt text generation
- `/api/review` - Alt text review
- `/api/health` - Health check
- `/auth/*` - Authentication endpoints
- `/billing/*` - Billing endpoints
- `/email/*` - Email endpoints

### Versioned Endpoints (Future)

New endpoints should use versioning:

- `/api/v2/generate` - Enhanced generation with new features
- `/api/v2/analytics` - Analytics endpoints
- `/api/v2/dashboard/*` - Dashboard endpoints

## Migration Strategy

### For New Features

1. Add new versioned endpoint (`/api/v2/...`)
2. Keep old endpoint functional
3. Document differences
4. Provide migration guide

### For Breaking Changes

1. Create new version (`/api/v2/...`)
2. Deprecate old version
3. Provide migration guide
4. Set removal date (6+ months)

## Response Headers

### Version Information

```
X-API-Version: v2
X-API-Deprecated: false
X-API-Sunset: 2025-12-31 (if deprecated)
```

### Deprecation Notice

When an endpoint is deprecated, include in response:

```json
{
  "ok": true,
  "data": { ... },
  "deprecation": {
    "version": "v1",
    "sunset_date": "2025-12-31",
    "migration_guide": "https://docs.alttextai.com/api/migration/v1-to-v2"
  }
}
```

## Best Practices

### Adding New Endpoints

1. Use `/api/v2/` prefix for new endpoints
2. Document in API documentation
3. Include version in response headers
4. Add to changelog

### Modifying Existing Endpoints

1. **Non-breaking changes**: Add to current version
   - New optional parameters
   - New optional response fields

2. **Breaking changes**: Create new version
   - Required parameter changes
   - Response format changes
   - Authentication changes

### Removing Endpoints

1. Deprecate with 3+ months notice
2. Provide migration path
3. Monitor usage
4. Remove after sunset date

## Version Compatibility

### Client Requirements

- Clients should specify desired API version
- Use `Accept: application/vnd.alttextai.v2+json` header (future)
- Or use versioned URL paths (current)

### Server Behavior

- Support multiple versions simultaneously
- Route requests to appropriate version handler
- Return appropriate version headers

## Examples

### Versioned Endpoint

```javascript
// v1 (legacy)
POST /api/generate
{
  "image_data": { "url": "..." },
  "context": "..."
}

// v2 (new)
POST /api/v2/generate
{
  "image_data": { "url": "..." },
  "context": "...",
  "options": {
    "style": "detailed",
    "language": "en"
  }
}
```

### Deprecation Notice

```javascript
// Response from deprecated endpoint
{
  "ok": true,
  "data": { ... },
  "deprecation": {
    "version": "v1",
    "sunset_date": "2025-12-31",
    "message": "This endpoint will be removed on 2025-12-31. Please migrate to /api/v2/generate"
  }
}
```

## Implementation Plan

### Phase 1: Current (Q1 2025)
- Document current unversioned endpoints as v1
- Add version headers to responses
- Create versioning infrastructure

### Phase 2: New Endpoints (Q2 2025)
- All new endpoints use `/api/v2/` prefix
- Maintain backward compatibility
- Provide migration guides

### Phase 3: Deprecation (Q3-Q4 2025)
- Deprecate v1 endpoints with notice
- Provide migration tools
- Monitor adoption

### Phase 4: Cleanup (2026)
- Remove deprecated v1 endpoints
- Consolidate to v2
- Update documentation

## Changelog

See [API_CHANGELOG.md](./API_CHANGELOG.md) for detailed version history and changes.


