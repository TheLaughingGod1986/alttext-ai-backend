# Best Practice Solution for Route Loading Issue

## Problem Analysis

**Root Cause:**
- Route files are loaded at the **top level** of `server-v2.js` (lines 58-167)
- When route files load, they execute **immediately** (e.g., `router.get('/me', rateLimitByUser(...), ...)`)
- This happens **before** Jest mocks are applied, causing `rateLimit()` to be undefined
- Result: `rateLimitByUser()` returns `undefined`, causing "Router.use() requires a middleware function but got a undefined"

## Best Practice Solutions

### Option 1: Lazy Loading (Recommended) ⭐
**Move route loading inside `createApp()` so mocks are applied first**

**Pros:**
- ✅ Mocks are guaranteed to be applied before routes load
- ✅ Better test isolation (fresh routes for each test)
- ✅ Follows factory pattern already established
- ✅ No changes needed to route files

**Cons:**
- ⚠️ Requires refactoring route loading logic
- ⚠️ Slightly more complex initialization

### Option 2: Dependency Injection
**Pass dependencies to route modules instead of having them import directly**

**Pros:**
- ✅ Complete control over dependencies
- ✅ Easy to mock in tests
- ✅ Explicit dependencies

**Cons:**
- ⚠️ Requires significant refactoring of all route files
- ⚠️ More boilerplate code

### Option 3: Lazy Route Registration
**Don't call route methods at module load time, register them later**

**Pros:**
- ✅ Minimal changes to route files
- ✅ Routes defined but not executed until needed

**Cons:**
- ⚠️ Requires changing route file structure
- ⚠️ Less intuitive code flow

## Recommended Solution: Lazy Loading

Move all route file `require()` calls inside `createApp()` function so they execute after mocks are applied.

