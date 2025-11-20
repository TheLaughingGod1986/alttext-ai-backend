# Multi-User Organization Licensing System - Implementation Summary

## Overview
This document summarizes the implementation of a multi-user license sharing system for the Alt Text AI plugin. The system supports both personal accounts and team/agency licenses with site-based quota sharing.

## Implementation Status: Backend Complete ✅

### Phases Completed
- ✅ Phase 1: Database Schema & Migration
- ✅ Phase 2: License Management API & Authentication
- ✅ Phase 3: Organization-Based Quota System
- ⏳ Phase 4: WordPress Plugin Updates (Next)
- ⏳ Phase 5: Stripe Integration Updates
- ⏳ Phase 6: Testing & Rollout

---

## Phase 1: Database Schema ✅

### New Models Added

#### Organization Model
```prisma
model Organization {
  id                   Int       @id @default(autoincrement())
  name                 String
  licenseKey           String    @unique @default(uuid())
  plan                 String    @default("free")  // free, pro, agency
  service              String    @default("alttext-ai")
  maxSites             Int       @default(1)       // 1 for free/pro, 10 for agency
  tokensRemaining      Int       @default(50)
  credits              Int       @default(0)
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?
  resetDate            DateTime  @default(now())
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  members              OrganizationMember[]
  sites                Site[]
  usageLogs            UsageLog[]
}
```

#### OrganizationMember Model
```prisma
model OrganizationMember {
  id             Int      @id @default(autoincrement())
  organizationId Int
  userId         Int
  role           String   @default("member")  // owner, admin, member
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(...)
  user           User @relation(...)
}
```

#### Site Model
```prisma
model Site {
  id               Int      @id @default(autoincrement())
  organizationId   Int
  siteHash         String   @unique
  siteUrl          String?
  installId        String?  @unique
  isActive         Boolean  @default(true)
  firstSeen        DateTime @default(now())
  lastSeen         DateTime @default(now())
  pluginVersion    String?
  wordpressVersion String?
  phpVersion       String?
  isMultisite      Boolean  @default(false)
  metadata         Json?

  organization     Organization @relation(...)
}
```

### Migration Files
- **SQL Migration**: `/prisma/migrations/20251113114859_add_organization_models/migration.sql`
- **Data Migration Script**: `/migrate-users-to-orgs.js`

### Data Migration Script Features
- Creates personal organization for each existing user
- Transfers user's plan, tokens, credits, and Stripe info to organization
- Links existing installations to organization as sites
- Creates owner membership for each user
- Updates usage logs to reference organization
- Idempotent - can be run multiple times safely

---

## Phase 2: License Management API ✅

### New Routes

#### License Routes (`/routes/license.js`)

**POST /api/license/activate**
- Activate a license key for a WordPress site
- Checks site limit before activation
- Creates or reactivates site record
- Returns organization details and quota

**POST /api/license/deactivate**
- Deactivate a site (requires JWT auth + owner/admin role)
- Allows agencies to self-service manage their active sites

**POST /api/license/generate** (Admin only)
- Generate new license keys
- For creating agency licenses

**GET /api/license/info/:licenseKey**
- Get license details, active sites, and members
- Public endpoint for license validation

#### Organization Routes (`/routes/organization.js`)

**GET /api/organization/my-organizations** (JWT required)
- Returns all organizations user belongs to
- Shows role, quota, and site count

**GET /api/organization/:orgId/sites** (JWT required)
- List all sites for an organization
- Shows active/inactive status

**GET /api/organization/:orgId/usage** (JWT required)
- Get usage statistics for organization
- Shows daily breakdown and recent logs

**POST /api/organization/:orgId/invite** (Owner/Admin only)
- Invite user to organization by email
- User must have existing account

**DELETE /api/organization/:orgId/members/:userId** (Owner/Admin only)
- Remove member from organization
- Cannot remove owner

**GET /api/organization/:orgId/members** (JWT required)
- List all organization members with roles

### Dual Authentication System (`/auth/dual-auth.js`)

The system now supports three authentication methods:

1. **JWT Token** (Personal account login)
   - Header: `Authorization: Bearer <token>`
   - Looks up user's primary organization

2. **License Key** (Agency license)
   - Header: `X-License-Key: <uuid>`
   - Directly authenticates to organization

3. **Site Hash** (Site-based sharing for Free/Pro)
   - Header: `X-Site-Hash: <hash>`
   - Looks up site and organization
   - All WordPress users on same site share quota

#### Authentication Middleware Functions

- `dualAuthenticate` - Requires JWT OR license key
- `optionalDualAuth` - Optional authentication
- `authenticateBySiteHash` - Authenticate via site hash only
- `combinedAuth` - Try all methods (used by /api/generate)

---

## Phase 3: Organization-Based Quota System ✅

### Updated Usage Functions (`/routes/usage.js`)

**New Functions:**
- `checkOrganizationLimits(organizationId)` - Check org quota
- `recordOrganizationUsage(orgId, userId, imageId, endpoint, service)` - Record usage
- `useOrganizationCredit(orgId, userId)` - Use org credit
- `resetOrganizationTokens()` - Monthly reset for all orgs

### Updated /api/generate Endpoint

**Before:**
```javascript
app.post('/api/generate', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const limits = await checkUserLimits(userId);
  // ...
  await recordUsage(userId, imageId, 'generate', service);
}
```

**After:**
```javascript
app.post('/api/generate', combinedAuth, async (req, res) => {
  const userId = req.user?.id || null;

  // Use organization limits if available, otherwise user limits
  if (req.organization) {
    limits = await checkOrganizationLimits(req.organization.id);
  } else {
    limits = await checkUserLimits(userId);
  }

  // Record to organization or user
  if (req.organization) {
    await recordOrganizationUsage(req.organization.id, userId, ...);
  } else {
    await recordUsage(userId, ...);
  }
}
```

### Backward Compatibility

The system maintains full backward compatibility:
- Users with JWT tokens continue to work (personal organization)
- Old user-based quota checking still works
- Usage logs support both userId and organizationId

---

## How It Works

### Free/Pro Plans (Site-Based Sharing)

1. User logs into WordPress with their account (JWT token)
2. Plugin sends JWT token + site hash to backend
3. Backend looks up user's organization AND verifies site
4. All users logging into same WordPress site share that site's quota
5. Quota is tracked per organization, not per user

**Example:**
- Bob (owner) creates account → Personal org created
- Alice logs into Bob's WordPress site
- Alice creates account → Separate personal org
- Alice's generation on Bob's site uses Bob's org quota
- Alice's generation on Alice's own site uses Alice's org quota

### Agency Plans (Multi-Site License Key)

1. Agency purchases license → License key generated
2. Agency activates key on Site A → Site A added to org
3. Agency activates same key on Site B → Site B added (max 10 sites)
4. All sites share the agency's 10,000/month quota
5. Agency can deactivate Site A and activate Site C

**License Key Benefits:**
- No personal login required (just paste license key)
- Works across multiple WordPress sites
- Self-service site activation/deactivation
- Shared quota across all sites

### Team Members (Dual Auth)

Team members can use EITHER:
1. **Personal JWT login** - Access their personal org + any org they're a member of
2. **Agency license key** - Direct access to agency org without personal login

**Example:**
- Agency has license key `abc-123`
- Developer Sarah is added as member to agency org
- Sarah can:
  - Use license key directly on client sites
  - OR login with her personal account (JWT) and access agency org

---

## API Examples

### Activate License Key
```bash
POST /api/license/activate
{
  "licenseKey": "abc-def-ghi-123",
  "siteHash": "site123hash",
  "siteUrl": "https://example.com",
  "installId": "install_456",
  "pluginVersion": "1.0.0",
  "wordpressVersion": "6.4.0",
  "phpVersion": "8.1"
}

# Response
{
  "success": true,
  "organization": {
    "id": 5,
    "name": "Agency XYZ",
    "plan": "agency",
    "tokensRemaining": 9847,
    "maxSites": 10
  },
  "site": {
    "id": 12,
    "siteHash": "site123hash",
    "isActive": true,
    "activeSiteCount": 3
  }
}
```

### Generate Alt Text (License Key Auth)
```bash
POST /api/generate
Headers:
  X-License-Key: abc-def-ghi-123
Body:
{
  "image_data": {...},
  "context": {...}
}

# Response uses agency's shared quota
{
  "success": true,
  "alt_text": "A professional team meeting...",
  "usage": {
    "used": 153,
    "limit": 10000,
    "remaining": 9847,
    "plan": "agency"
  }
}
```

### Generate Alt Text (JWT Auth)
```bash
POST /api/generate
Headers:
  Authorization: Bearer <jwt_token>
Body:
{
  "image_data": {...},
  "context": {...}
}

# Response uses user's personal org quota
{
  "success": true,
  "alt_text": "A professional team meeting...",
  "usage": {
    "used": 23,
    "limit": 1000,
    "remaining": 977,
    "plan": "pro"
  }
}
```

---

## Next Steps

### Phase 4: WordPress Plugin Updates (Next)
- Add License Key settings tab
- Implement license activation UI
- Update authentication to support license keys
- Display organization usage in dashboard
- Show active sites for agency licenses

### Phase 5: Stripe Integration Updates
- Update webhooks to handle organization subscriptions
- Migrate existing subscriptions to organizations
- Handle subscription changes for organizations

### Phase 6: Testing & Rollout
- Test migration script with production snapshot
- Test multi-site activation and limits
- Test dual authentication flows
- Verify site-based quota sharing
- Gradual rollout with monitoring

---

## Deployment Checklist

Before deploying to production:

1. **Database Migration**
   ```bash
   # On production database
   npx prisma migrate deploy

   # Run data migration
   node migrate-users-to-orgs.js
   ```

2. **Update Server Code**
   - Deploy updated server-v2.js
   - Deploy new route files (license.js, organization.js)
   - Deploy new auth middleware (dual-auth.js)

3. **Verify Environment Variables**
   - Ensure DATABASE_URL is set
   - Verify JWT_SECRET is configured
   - Check OpenAI API keys

4. **Test Endpoints**
   ```bash
   # Test license activation
   curl -X POST https://api.example.com/api/license/activate -H "Content-Type: application/json" -d '{"licenseKey":"...","siteHash":"..."}'

   # Test JWT auth still works
   curl -X POST https://api.example.com/api/generate -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"image_data":{...}}'

   # Test license key auth
   curl -X POST https://api.example.com/api/generate -H "X-License-Key: <key>" -H "Content-Type: application/json" -d '{"image_data":{...}}'
   ```

---

## Benefits of This Implementation

1. **Flexible Authentication** - Three methods (JWT, license key, site hash)
2. **Site-Based Sharing** - Free/Pro users automatically share quota on same WordPress site
3. **Multi-Site Licenses** - Agencies can use one license across multiple client sites
4. **Self-Service Management** - Agencies can activate/deactivate sites without support
5. **Team Collaboration** - Multiple members can access organization quota
6. **Backward Compatible** - Existing users continue to work without changes
7. **Scalable Architecture** - Clean separation of organizations, sites, and users

---

## Technical Notes

- License keys are UUIDs (universally unique)
- Site hashes are MD5 hashes of site URL + timestamp
- Organization IDs are auto-incrementing integers
- All timestamps use ISO 8601 format
- Quota resets are handled by monthly cron job
- Usage logs track both userId and organizationId for analytics
