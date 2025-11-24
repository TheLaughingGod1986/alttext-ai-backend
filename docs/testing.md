# Testing

## Test Structure

The test suite is organized into:
- `/tests/unit` - Unit tests for individual modules
- `/tests/integration` - Integration tests for API endpoints
- `/tests/mocks` - Mock implementations for external dependencies
- `/tests/helpers` - Test utilities and helpers

## Test Coverage

### Current Status
- **Tests:** 287 passing, 14 test suites
- **Coverage:** 63.91% statements, 54.13% branches, 62.67% functions, 65.16% lines
- **Coverage threshold:** Maintained above 60% requirement

### Coverage by Module

**High Coverage:**
- `auth/jwt.js` - 96.55% statements
- `routes/license.js` - 96.2% statements
- `routes/usage.js` - 95.73% statements

**Low Coverage (Needs Improvement):**
- `routes/organization.js` - 6.99% statements, 0% branches
- `src/stripe/checkout.js` - 33.76% statements
- `services/emailService.js` - 65.13% statements (some untested paths)

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/unit/validation.test.js

# Run in watch mode
npm test -- --watch
```

## Test Mocks

### Supabase Mock
Located in `tests/mocks/supabase.mock.js`
- Mocks database queries (select, insert, update, delete)
- Supports queued responses for complex test scenarios
- Handles authentication methods

### Stripe Mock
Located in `tests/mocks/stripe.mock.js`
- Mocks checkout sessions, billing portal, subscriptions
- Supports subscription state transitions
- Handles webhook events

### Resend Mock
Located in `tests/mocks/resend.mock.js`
- Mocks email sending
- Supports success/failure scenarios
- Handles rate limiting

## Test Helpers

### createTestServer.js
Creates a fresh Express app instance for each test, ensuring isolation.

### testHelpers.js
Provides utilities for:
- Creating test users
- Generating JWT tokens
- Creating test licenses
- Waiting for async operations

## Writing Tests

### Unit Test Example
```javascript
const { validateEmail } = require('../../src/validation/validators');

describe('validateEmail', () => {
  test('validates correct email formats', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });
});
```

### Integration Test Example
```javascript
const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');

describe('POST /auth/register', () => {
  test('registers a new user', async () => {
    const app = createTestServer();
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!' });
    
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
  });
});
```

## CI/CD

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Via GitHub Actions workflow (`.github/workflows/tests.yml`)

The CI pipeline:
1. Installs dependencies
2. Runs linter
3. Runs full test suite
4. Generates coverage report
5. Fails if coverage drops below 60%

