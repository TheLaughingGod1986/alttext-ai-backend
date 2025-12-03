# API Error Codes

This document lists all standardized error codes returned by the API.

## Error Response Format

All error responses follow this standard format:

```json
{
  "ok": false,
  "code": "ERROR_CODE",
  "reason": "error_category",
  "message": "Human-readable error message",
  "details": {} // Optional additional details
}
```

## Error Categories

- `validation_failed` - Request validation errors (400)
- `authentication_required` - Authentication errors (401)
- `authorization_failed` - Authorization/permission errors (403)
- `resource_not_found` - Resource not found (404)
- `resource_conflict` - Resource conflicts (409)
- `rate_limit_exceeded` - Rate limiting errors (429)
- `server_error` - Internal server errors (500)
- `gateway_error` - Gateway errors (502)
- `service_unavailable` - Service unavailable (503)
- `gateway_timeout` - Gateway timeout (504)

## Error Codes

### Validation Errors (400)

| Code | Message | Details |
|------|---------|---------|
| `VALIDATION_ERROR` | Request validation failed | Validation error details |
| `MISSING_FIELD` | {field} is required | Field name |
| `INVALID_INPUT` | Invalid input provided | Input validation details |
| `MISSING_SITE_HASH` | X-Site-Hash header is required | - |

### Authentication Errors (401)

| Code | Message | Details |
|------|---------|---------|
| `AUTHENTICATION_REQUIRED` | Authentication required | - |
| `INVALID_TOKEN` | Invalid or expired token | - |

### Authorization Errors (403)

| Code | Message | Details |
|------|---------|---------|
| `FORBIDDEN` | Access forbidden | - |
| `NO_ACCESS` | No active subscription found. Please subscribe to continue. | - |
| `QUOTA_EXCEEDED` | Quota limit reached | - |
| `INVALID_SECRET` | Invalid secret | - |
| `EMAIL_MISMATCH` | You can only create checkout sessions for your own account | - |

### Not Found Errors (404)

| Code | Message | Details |
|------|---------|---------|
| `NOT_FOUND` | {resource} not found | Resource type |

### Conflict Errors (409)

| Code | Message | Details |
|------|---------|---------|
| `CONFLICT` | Resource conflict | - |

### Rate Limiting Errors (429)

| Code | Message | Details |
|------|---------|---------|
| `RATE_LIMIT_EXCEEDED` | Too many requests, please try again later | - |
| `OPENAI_RATE_LIMIT` | OpenAI rate limit reached. Please try again later. | - |

### Server Errors (500)

| Code | Message | Details |
|------|---------|---------|
| `INTERNAL_ERROR` | Internal server error | Error details |
| `METRICS_ERROR` | Failed to collect metrics | - |
| `GENERATION_ERROR` | Missing OpenAI API key for service: {service} | Service name |
| `INVALID_AI_RESPONSE` | The AI service returned an unexpected response format | - |
| `REVIEW_ERROR` | Failed to review alt text | Error message |
| `RESET_ERROR` | Reset failed | - |

### Gateway Errors (502)

| Code | Message | Details |
|------|---------|---------|
| `BAD_GATEWAY` | Bad gateway | - |

### Service Unavailable (503)

| Code | Message | Details |
|------|---------|---------|
| `SERVICE_UNAVAILABLE` | Service temporarily unavailable | - |

### Gateway Timeout (504)

| Code | Message | Details |
|------|---------|---------|
| `GATEWAY_TIMEOUT` | Gateway timeout | - |
| `TIMEOUT` | The image generation is taking longer than expected. Please try again. | - |

## Success Response Format

All success responses follow this standard format:

```json
{
  "ok": true,
  "data": {}, // Response data (optional)
  "message": "Success message" // Optional success message
}
```

## Migration Notes

- Legacy error formats may still exist in some routes
- All new endpoints should use the standardized format
- Existing endpoints are being migrated gradually


