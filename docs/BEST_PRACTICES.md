# Codebase Best Practices & Recommendations

## Overview

This document outlines best practices that should be applied across the entire codebase to improve maintainability, security, performance, and developer experience.

## Priority Levels

- 🔴 **HIGH**: Critical for security, stability, or maintainability
- 🟡 **MEDIUM**: Important for code quality and developer experience
- 🟢 **LOW**: Nice-to-have improvements

---

## 1. Logging Standardization 🔴 HIGH

### Current State
- **854 instances** of `console.log/error/warn/info` across 58 files
- Inconsistent logging format
- No structured logging in many places

### Best Practice
**Use the standardized logger (`src/utils/logger.js`) everywhere**

```javascript
// ❌ BAD
console.log('User registered:', email);
console.error('Error:', error);

// ✅ GOOD
const logger = require('../src/utils/logger');
logger.info('User registered', { email });
logger.error('Registration failed', { error: error.message, stack: error.stack });
```

### Migration Strategy
1. Create a script to find all `console.*` usage
2. Replace with appropriate logger methods
3. Ensure structured metadata is included
4. Test that logs are properly formatted

### Files to Prioritize
- `auth/routes.js` (15 instances)
- `routes/usage.js` (18 instances)
- `src/services/partnerApiService.js` (18 instances)
- `src/services/billingService.js` (26 instances)

---

## 2. Environment Variable Management 🔴 HIGH

### Current State
- **21 instances** of direct `process.env.*` access
- Inconsistent fallback handling
- No validation of required variables

### Best Practice
**Always use `config/loadEnv.js` utilities**

```javascript
// ❌ BAD
const apiKey = process.env.OPENAI_API_KEY;
const port = process.env.PORT || 3000;

// ✅ GOOD
const { getEnv, requireEnv } = require('./config/loadEnv');
const apiKey = requireEnv('OPENAI_API_KEY'); // Throws if missing
const port = getEnv('PORT', 3000); // Uses default if missing
```

### Benefits
- Centralized validation
- Type-safe defaults
- Better error messages
- Consistent behavior

### Files to Fix
- `tests/unit/jwt.test.js` (7 instances)
- `src/routes/billing.js` (5 instances)
- `src/routes/credits.js` (8 instances)

---

## 3. Code Quality Tools 🟡 MEDIUM

### Current State
- ❌ No ESLint configuration
- ❌ No Prettier configuration
- ❌ No pre-commit hooks

### Best Practice
**Add ESLint and Prettier for consistent code style**

```json
// .eslintrc.js
module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
  },
};
```

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

### Implementation
1. Install ESLint and Prettier
2. Create configuration files
3. Add `npm run lint` and `npm run format` scripts
4. Add pre-commit hooks (husky + lint-staged)

---

## 4. Error Handling Consistency 🟡 MEDIUM

### Current State
- Mixed error handling patterns
- Some routes missing try-catch blocks
- Inconsistent error response formats

### Best Practice
**Use standardized error handling**

```javascript
// ✅ GOOD - Use errorHandler middleware
const { errors: httpErrors } = require('../src/utils/http');

try {
  // ... code ...
} catch (error) {
  logger.error('Operation failed', { error: error.message, stack: error.stack });
  return httpErrors.internalError(res, 'Operation failed', { code: 'OPERATION_ERROR' });
}
```

### Standard Error Format
All errors should follow:
```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "reason": "machine_readable_reason"
}
```

### Files to Review
- All route files should use `asyncHandler` or try-catch
- Ensure all errors use `httpErrors` utilities

---

## 5. Input Validation 🟡 MEDIUM

### Current State
- Some routes have validation, others don't
- Inconsistent validation patterns
- Zod schemas exist but not used everywhere

### Best Practice
**Use Zod validation for all user inputs**

```javascript
// ✅ GOOD
const { z } = require('zod');
const validateGenerateInput = require('../validation/generate');

router.post('/generate', async (req, res) => {
  try {
    const validated = validateGenerateInput(req.body);
    // ... use validated data ...
  } catch (error) {
    return httpErrors.badRequest(res, error.message, { code: 'VALIDATION_ERROR' });
  }
});
```

### Validation Files Available
- `src/validation/auth.js`
- `src/validation/license.js`
- `src/validation/billing.js`
- `src/validation/generate.js`

### Action Items
1. Ensure all POST/PUT endpoints use validation
2. Create missing validation schemas
3. Add validation to query parameters where needed

---

## 6. Security Best Practices 🔴 HIGH

### Current State
- ✅ Good: Authentication middleware in place
- ✅ Good: Rate limiting implemented
- ✅ Good: Input validation in critical paths
- ⚠️ Needs improvement: Some direct database queries without parameterization

### Best Practices

#### A. SQL Injection Prevention
```javascript
// ✅ GOOD - Supabase handles parameterization
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', email); // Safe - Supabase parameterizes

// ❌ BAD - Never do this (not applicable with Supabase, but good to know)
// const query = `SELECT * FROM users WHERE email = '${email}'`;
```

#### B. Authentication & Authorization
- ✅ All protected routes use `authenticateToken` or `combinedAuth`
- ✅ User ownership validation in billing routes
- ✅ Rate limiting on sensitive endpoints

#### C. Secrets Management
- ✅ Environment variables for secrets
- ⚠️ Consider: Use secrets manager in production (AWS Secrets Manager, etc.)

#### D. CORS Configuration
- ✅ CORS properly configured
- ✅ Credentials handling correct

---

## 7. Code Organization 🟢 LOW

### Current State
- ✅ Good directory structure
- ⚠️ Some files in root that could be organized better
- ⚠️ Mixed route locations (`routes/` and `src/routes/`)

### Recommendations

#### A. Consolidate Route Locations
- Migrate all routes from `routes/` to `src/routes/`
- Update imports accordingly
- Document migration plan

#### B. Script Organization
- Move utility scripts to `scripts/utils/`
- Keep only executable scripts in `scripts/`

#### C. Documentation
- Move all `.md` files to `docs/` (except README)
- Create `docs/guides/` for how-to guides
- Create `docs/api/` for API documentation

---

## 8. Testing Best Practices 🟡 MEDIUM

### Current State
- ✅ Good test coverage (63.91%)
- ✅ Unit and integration tests separated
- ⚠️ Some areas need more coverage

### Best Practices

#### A. Test Coverage Targets
- **Minimum**: 60% (currently met ✅)
- **Target**: 80% for critical paths
- **Focus areas**:
  - `routes/organization.js` (6.99% - needs work)
  - `stripe/checkout.js` (33.76% - needs work)

#### B. Test Organization
```javascript
// ✅ GOOD - Descriptive test names
describe('POST /api/generate', () => {
  it('should return 401 when authentication token is missing', async () => {
    // ...
  });
  
  it('should return 429 when rate limit exceeded', async () => {
    // ...
  });
});
```

#### C. Test Data Management
- Use factories for test data
- Clean up test data in `afterAll` hooks
- Use mocks for external services

---

## 9. Performance Optimization 🟡 MEDIUM

### Current State
- ✅ Caching implemented for `/auth/me` and `/usage`
- ✅ Rate limiting prevents abuse
- ⚠️ Some N+1 query patterns possible

### Best Practices

#### A. Database Queries
```javascript
// ❌ BAD - N+1 queries
for (const user of users) {
  const sites = await supabase.from('sites').select('*').eq('user_id', user.id);
}

// ✅ GOOD - Batch query
const userIds = users.map(u => u.id);
const sites = await supabase.from('sites').select('*').in('user_id', userIds);
```

#### B. Caching Strategy
- ✅ In-memory cache for frequently accessed data
- ⚠️ Consider: Redis for distributed caching in production
- ⚠️ Consider: Cache invalidation strategy

#### C. Response Optimization
- Use pagination for large datasets
- Limit response payload sizes
- Use compression middleware

---

## 10. Documentation 🟢 LOW

### Current State
- ✅ Good documentation structure
- ✅ API documentation exists
- ⚠️ Some functions lack JSDoc comments

### Best Practice
**Add JSDoc comments to all public functions**

```javascript
/**
 * Creates a Stripe checkout session for a user
 * 
 * @param {string} userId - The user ID
 * @param {string} priceId - The Stripe price ID
 * @param {Object} options - Additional options
 * @param {string} options.successUrl - URL to redirect on success
 * @param {string} options.cancelUrl - URL to redirect on cancel
 * @returns {Promise<Object>} The checkout session object
 * @throws {Error} If user not found or Stripe API fails
 */
async function createCheckoutSession(userId, priceId, options = {}) {
  // ...
}
```

---

## 11. Dependency Management 🟡 MEDIUM

### Current State
- ✅ Dependencies are up to date
- ⚠️ No automated dependency updates

### Best Practices

#### A. Regular Updates
- Run `npm audit` regularly
- Update dependencies quarterly
- Test thoroughly after updates

#### B. Security Scanning
```bash
# Add to CI/CD
npm audit --audit-level=moderate
```

#### C. Lock File
- ✅ `package-lock.json` committed (good)
- Never commit `node_modules/`

---

## 12. Type Safety 🟢 LOW

### Current State
- ❌ No TypeScript
- ⚠️ No JSDoc type annotations

### Options

#### A. Add JSDoc Type Annotations (Easier)
```javascript
/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{token: string, user: Object}>}
 */
async function login(email, password) {
  // ...
}
```

#### B. Migrate to TypeScript (Long-term)
- Gradual migration possible
- Start with new files
- Add `tsconfig.json` with `allowJs: true`

---

## Implementation Priority

### Phase 1: Critical (Next Sprint)
1. 🔴 Replace `console.*` with logger (high-impact files first)
2. 🔴 Replace `process.env.*` with `loadEnv` utilities
3. 🔴 Add ESLint and Prettier

### Phase 2: Important (Next Month)
4. 🟡 Standardize error handling
5. 🟡 Add input validation to all endpoints
6. 🟡 Improve test coverage for low-coverage files

### Phase 3: Nice-to-Have (Next Quarter)
7. 🟢 Add JSDoc comments
8. 🟢 Consolidate route locations
9. 🟢 Add pre-commit hooks

---

## Tools & Scripts Needed

### 1. Logging Migration Script
```bash
# Find all console.* usage
grep -r "console\." --include="*.js" | wc -l

# Replace with logger (manual or script)
```

### 2. Environment Variable Migration Script
```bash
# Find all process.env usage
grep -r "process\.env\." --include="*.js"
```

### 3. ESLint Configuration
```bash
npm install --save-dev eslint prettier eslint-config-prettier
```

### 4. Pre-commit Hooks
```bash
npm install --save-dev husky lint-staged
```

---

## Metrics to Track

1. **Code Quality**
   - ESLint warnings/errors count
   - Test coverage percentage
   - Console.log usage count (should decrease)

2. **Security**
   - npm audit vulnerabilities
   - Rate limit violations
   - Authentication failures

3. **Performance**
   - API response times
   - Cache hit rates
   - Database query counts

---

## Conclusion

Implementing these best practices will:
- ✅ Improve code maintainability
- ✅ Reduce bugs and security vulnerabilities
- ✅ Enhance developer experience
- ✅ Make onboarding easier
- ✅ Improve production reliability

**Start with Phase 1 (Critical) items for maximum impact.**

