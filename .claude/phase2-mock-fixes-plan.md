# Phase 2: Mock Fixes & Remaining Test Issues - Execution Plan

## Current Status (As of 2025-12-05)

### Completed Fixes ✅
1. **Rate Limiter Mock** (Commit 709ee01)
   - Fixed Jest mock loading by moving to inline factory in jest.setup.js
   - Result: +14 tests passing (189 → 203 out of 380)

2. **Stripe Mock - customers.list()** (Commit 523c29e)
   - Added missing `customers.list()` method to Stripe mock
   - Fixes hanging tests in billing-related test files
   - Result: Awaiting full test run results

### Test Results Summary
- **Before fixes**: 189/380 passing (49.7%)
- **After rate limiter fix**: 203/380 passing (53.4%)
- **After Stripe fix**: Running now...

## Execution Plan

### Step 1: Analyze Current Test Results (IMMEDIATE)
**Goal**: Understand the impact of Stripe mock fix

**Actions**:
1. Wait for current test run to complete (70ca02)
2. Analyze `/tmp/post-stripe-fix-results.log`
3. Categorize remaining failures:
   - Still timing out (missing mock methods)
   - Failing assertions (wrong mock data)
   - Missing test data setup
   - Other errors

**Success Criteria**: Clear categorization of all remaining failures

### Step 2: Fix Remaining Mock Method Issues
**Goal**: Add any other missing mock methods causing timeouts

**Priority Search Areas**:
1. **Stripe mock** - Check for other missing methods:
   - `prices.retrieve()`
   - `subscriptions.list()`
   - `invoices.*`
   - `paymentIntents.*`

2. **Supabase mock** - Verify all query methods work:
   - `update()` returns proper response
   - `delete()` returns proper response
   - `rpc()` handles all database functions

3. **Other mocks** that might need methods:
   - Resend (email service)
   - OpenAI (if used in tests)

**Implementation**:
- Search codebase for Stripe API calls: `grep -r "stripe\." src/`
- Compare with mock implementation
- Add missing methods one by one
- Test after each addition

### Step 3: Fix Mock Data Mismatches
**Goal**: Ensure mock responses match what code expects

**Common Issues**:
1. Mock returns `null` but code expects object
2. Mock returns wrong status code (500 instead of 400)
3. Mock missing required fields in response
4. Mock not simulating error conditions properly

**Actions**:
- For each failing test:
  - Read the test expectations
  - Check actual route/service code
  - Update mock to return matching data structure
  - Verify test passes

### Step 4: Fix Test Data Setup Issues
**Goal**: Ensure tests properly queue mock responses

**Pattern to Follow**:
```javascript
beforeEach(() => {
  // Reset all mocks
  supabaseMock.__reset();
  stripeMock.__resetStripe();

  // Queue responses for THIS test's queries
  supabaseMock.__queueResponse('users', 'select', {
    data: { id: 1, email: 'test@example.com' },
    error: null
  });
});

test('should do something', async () => {
  // Test runs with queued responses
});
```

**Common Problems**:
- Forgot to queue response for a query
- Queued wrong table/method combination
- Queued responses in wrong order
- Multiple tests sharing state (not resetting between tests)

### Step 5: Remove Tests for Non-Existent Endpoints
**Goal**: Delete tests for endpoints that don't exist

**Known Non-Existent**:
- `/api/review` endpoint (already identified)

**Process**:
1. Check if endpoint exists in `src/routes/`
2. If not found, search for route registration in `server-v2.js`
3. If truly doesn't exist, DELETE the test file (not skip)
4. Document removal in git commit message

### Step 6: Fix Individual Test Failures
**Goal**: Fix remaining test failures one by one

**Priority Order**:
1. High-value routes (billing, auth, generate, license)
2. Medium-value routes (usage, dashboard, email)
3. Low-priority routes (waitlist, analytics)

**For Each Failing Test**:
1. Run test in isolation: `npm test -- path/to/test.js`
2. Read error message carefully
3. Identify root cause (mock? data? assertion?)
4. Apply minimal fix
5. Verify test passes
6. Move to next test

### Step 7: Push Fixes to GitHub & Verify CI
**Goal**: Ensure fixes work in CI environment

**Actions**:
1. Commit all fixes with descriptive messages
2. Push to GitHub
3. Monitor GitHub Actions run
4. If CI fails but local passes:
   - Check for missing environment variables
   - Check for platform-specific issues
   - Update CI workflow if needed

## Success Metrics

**Minimum Targets**:
- Integration tests: 85%+ passing (323/380)
- No timeouts (all tests complete within reasonable time)
- CI pipeline passes reliably

**Stretch Targets**:
- Integration tests: 95%+ passing (361/380)
- All critical routes have passing tests
- Test run completes in < 5 minutes

## Estimated Timeline

- **Step 1** (Analyze): 30 minutes
- **Step 2** (Mock methods): 1-2 hours
- **Step 3** (Mock data): 1-2 hours
- **Step 4** (Test setup): 1 hour
- **Step 5** (Remove dead tests): 30 minutes
- **Step 6** (Individual fixes): 2-4 hours
- **Step 7** (CI verification): 30 minutes

**Total**: 6-10 hours

## Next Immediate Actions

1. Wait for test run 70ca02 to complete
2. Analyze results and categorize failures
3. Begin Step 2: Fix remaining mock method issues
4. Continue systematically through the plan
