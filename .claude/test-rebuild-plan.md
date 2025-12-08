# Test Suite Rebuild Plan

## Executive Summary

**Current State:**
- 45 test files total
- Unit tests: 322/323 passing (99.7%) ✅
- Integration tests: 189/380 passing (49.7%) ❌
- Tests were working on Dec 2nd, broke over 55+ commits
- Multiple fix attempts have failed to resolve 174 failing integration tests

**Recommendation:** Incremental rebuild rather than complete rewrite

## Analysis of Current Problems

### What's Working Well
1. **Unit tests are nearly perfect** (322/323 passing)
   - Test infrastructure for unit tests is solid
   - Mocking strategy works well
   - Should be preserved as-is with minimal changes

### Root Causes of Integration Test Failures
1. **Test Infrastructure Issues:**
   - Server connection cleanup was fixed (no longer timing out)
   - Rate limiting bypass added but didn't fix failures
   - 174 failures suggest deeper issues than rate limiting

2. **Likely Real Issues:**
   - Missing environment variables in CI
   - Mock data doesn't match actual API contracts
   - Tests for endpoints that don't exist or changed
   - Database/Supabase state management between tests
   - OpenAI API mock returning wrong status codes

## Proposed Approach: Incremental Rebuild

### Phase 1: Diagnose & Categorize Failures (1-2 hours)
**Goal:** Understand exactly why each test is failing

1. Run integration tests locally with verbose output
2. Categorize failures by type:
   - Mock configuration issues (wrong return values)
   - Missing endpoints
   - Environment variable issues
   - Assertion failures (expected vs actual)
   - Database state issues
3. Document findings in categorized list

### Phase 2: Fix Test Infrastructure (2-3 hours)
**Goal:** Fix systemic issues affecting multiple tests

1. **Mock Configuration Review:**
   - Review supabase.mock.js, stripe.mock.js, resend.mock.js
   - Ensure mocks return realistic data matching actual APIs
   - Fix OpenAI mock to return correct status codes

2. **Environment Setup:**
   - Document all required environment variables
   - Add missing vars to GitHub Actions workflow
   - Create .env.test template

3. **Test Helpers:**
   - Review createTestServer.js (already fixed)
   - Add helper for creating test users with full setup
   - Add helper for cleaning database state between tests

### Phase 3: Fix Integration Tests by Category (4-6 hours)
**Goal:** Systematically fix tests in order of impact

**Priority Order:**
1. **High Value Routes** (fix first):
   - /api/generate (core functionality)
   - /api/auth/* (authentication)
   - /api/billing/* (revenue critical)
   - /api/license/* (core product)

2. **Medium Value Routes:**
   - /api/usage
   - /api/dashboard
   - /api/email

3. **Low Priority Routes:**
   - /api/waitlist
   - /api/analytics
   - Legacy routes

**For Each Category:**
1. Run specific test file: `npm test -- tests/integration/[file].test.js`
2. Read actual failure messages
3. Compare test expectations with actual code behavior
4. Fix test to match current implementation OR fix implementation if broken
5. Verify test passes
6. Move to next test file

### Phase 4: Remove Dead Code (1 hour)
**Goal:** Delete tests for non-existent endpoints

1. Identify endpoints that don't exist (like /api/review)
2. Remove tests completely (not skip)
3. Document removed tests in changelog

### Phase 5: Add Missing Coverage (2-3 hours)
**Goal:** Ensure core functionality is tested

1. Review routes/ directory for untested endpoints
2. Write minimal integration tests for critical paths:
   - Happy path (200 success)
   - Auth failure (401/403)
   - Validation failure (400)
3. Focus on testing what matters, not 100% coverage

## Alternative: Complete Rewrite

**IF** Phase 1 reveals that >50% of tests need complete rewrites, then:

### Rewrite Strategy
1. **Keep Unit Tests** - they work fine
2. **Start Fresh on Integration Tests:**
   - Delete tests/integration/*
   - Create new test files following consistent pattern
   - Test one route at a time starting with core functionality

### Integration Test Template
```javascript
const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');

describe('/api/[route]', () => {
  let server;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('GET /api/[route]', () => {
    it('should return 200 for valid request', async () => {
      const res = await request(server)
        .get('/api/[route]')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        // expected structure
      });
    });

    it('should return 401 without auth', async () => {
      const res = await request(server).get('/api/[route]');
      expect(res.status).toBe(401);
    });
  });
});
```

### Priority Routes for Rewrite
1. /api/generate (main product feature)
2. /api/auth/login, /api/auth/register, /api/auth/verify
3. /api/billing/checkout, /api/billing/portal
4. /api/license/create, /api/license/verify
5. /api/usage (current user usage)

## Estimated Time

**Incremental Fix Approach:** 8-12 hours
- Phase 1: 1-2 hours
- Phase 2: 2-3 hours
- Phase 3: 4-6 hours
- Phase 4: 1 hour
- Phase 5: 2-3 hours

**Complete Rewrite Approach:** 12-20 hours
- Planning: 2 hours
- Core routes (5 routes × 1hr): 5 hours
- Secondary routes (10 routes × 30min): 5 hours
- Testing & debugging: 3-5 hours
- Documentation: 1 hour

## Recommendation

**Start with Incremental Approach (Phase 1)**

Reasons:
1. Unit tests prove the infrastructure can work
2. 189 integration tests are already passing
3. Faster to fix than rewrite
4. Preserves existing good tests
5. Can always pivot to rewrite if Phase 1 shows it's needed

**Decision Point:** After Phase 1, if >50% of tests need complete rewrites, switch to complete rewrite strategy.

## Next Steps

1. User approves this plan
2. Execute Phase 1: Run tests and categorize all 174 failures
3. Present findings to user with time estimate
4. User decides: continue incremental fixes OR pivot to rewrite
5. Execute chosen approach

## Success Criteria

- All critical routes have passing integration tests
- CI/CD pipeline passes reliably
- Tests run in <5 minutes total
- Test failures are clear and actionable
- New tests follow consistent patterns
