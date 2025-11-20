# Backend Migration Guide: Prisma to Supabase

This guide walks through migrating the backend from Prisma ORM to Supabase client.

## Prerequisites

1. ✅ Supabase project created
2. ✅ Database schema migrated to Supabase
3. ✅ Environment variables configured
4. ✅ `@supabase/supabase-js` package installed

## Environment Variables

Add these to your `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Keep existing DATABASE_URL for reference during migration
# DATABASE_URL=postgresql://... (can be removed after migration)
```

## Migration Steps

### Step 1: Install Dependencies

```bash
npm install @supabase/supabase-js
```

### Step 2: Import Supabase Client

Replace Prisma imports with Supabase:

**Before:**
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
```

**After:**
```javascript
const { supabase, handleSupabaseResponse } = require('./supabase-client');
```

### Step 3: Replace Database Operations

#### Find Operations

**Prisma:**
```javascript
const user = await prisma.user.findUnique({
  where: { id: userId }
});
```

**Supabase:**
```javascript
const { data: user, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single();

if (error) throw error;
```

#### Find Many Operations

**Prisma:**
```javascript
const users = await prisma.user.findMany({
  where: { plan: 'pro' },
  orderBy: { createdAt: 'desc' },
  take: 10
});
```

**Supabase:**
```javascript
const { data: users, error } = await supabase
  .from('users')
  .select('*')
  .eq('plan', 'pro')
  .order('createdAt', { ascending: false })
  .limit(10);

if (error) throw error;
```

#### Create Operations

**Prisma:**
```javascript
const user = await prisma.user.create({
  data: {
    email: 'user@example.com',
    passwordHash: 'hashed',
    plan: 'free'
  }
});
```

**Supabase:**
```javascript
const { data: user, error } = await supabase
  .from('users')
  .insert({
    email: 'user@example.com',
    passwordHash: 'hashed',
    plan: 'free'
  })
  .select()
  .single();

if (error) throw error;
```

#### Update Operations

**Prisma:**
```javascript
const user = await prisma.user.update({
  where: { id: userId },
  data: { plan: 'pro' }
});
```

**Supabase:**
```javascript
const { data: user, error } = await supabase
  .from('users')
  .update({ plan: 'pro' })
  .eq('id', userId)
  .select()
  .single();

if (error) throw error;
```

#### Delete Operations

**Prisma:**
```javascript
await prisma.user.delete({
  where: { id: userId }
});
```

**Supabase:**
```javascript
const { error } = await supabase
  .from('users')
  .delete()
  .eq('id', userId);

if (error) throw error;
```

#### Count Operations

**Prisma:**
```javascript
const count = await prisma.user.count({
  where: { plan: 'pro' }
});
```

**Supabase:**
```javascript
const { count, error } = await supabase
  .from('users')
  .select('*', { count: 'exact', head: true })
  .eq('plan', 'pro');

if (error) throw error;
```

#### Increment/Decrement Operations

**Prisma:**
```javascript
await prisma.user.update({
  where: { id: userId },
  data: {
    tokensRemaining: { decrement: 1 }
  }
});
```

**Supabase:**
```javascript
// First get current value
const { data: user } = await supabase
  .from('users')
  .select('tokensRemaining')
  .eq('id', userId)
  .single();

// Then update
const { error } = await supabase
  .from('users')
  .update({ tokensRemaining: user.tokensRemaining - 1 })
  .eq('id', userId);

if (error) throw error;
```

#### Relations/Joins

**Prisma:**
```javascript
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    usageLogs: true,
    organizationMembers: true
  }
});
```

**Supabase:**
```javascript
// Get user
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single();

// Get related data separately
const { data: usageLogs } = await supabase
  .from('usage_logs')
  .select('*')
  .eq('userId', userId);

const { data: organizationMembers } = await supabase
  .from('organization_members')
  .select('*')
  .eq('userId', userId);

// Or use Supabase's foreign key syntax (if RLS allows)
const { data: userWithRelations } = await supabase
  .from('users')
  .select(`
    *,
    usage_logs (*),
    organization_members (*)
  `)
  .eq('id', userId)
  .single();
```

### Step 4: Update Route Files

Files to update:
- `routes/usage.js`
- `routes/license.js`
- `routes/licenses.js`
- `routes/organization.js`
- `routes/billing.js`
- `auth/routes.js`
- `auth/dual-auth.js`
- `stripe/checkout.js`
- `stripe/webhooks.js`
- `server-v2.js`

### Step 5: Update Error Handling

Supabase returns errors differently than Prisma. Always check for errors:

```javascript
const { data, error } = await supabase.from('users').select('*');

if (error) {
  console.error('Database error:', error);
  return res.status(500).json({ error: error.message });
}
```

### Step 6: Testing

1. Test all API endpoints
2. Verify database operations work correctly
3. Check error handling
4. Test authentication flows
5. Test billing/webhook flows

### Step 7: Cleanup

After successful migration:
1. Remove Prisma dependencies from `package.json`
2. Remove `prisma/` directory (or keep for reference)
3. Remove `DATABASE_URL` if no longer needed
4. Update documentation

## Common Patterns

### Transaction-like Operations

Supabase doesn't have built-in transactions like Prisma. For multi-step operations:

```javascript
// Option 1: Use Supabase RPC (stored procedures)
const { data, error } = await supabase.rpc('update_user_and_log', {
  user_id: userId,
  new_plan: 'pro'
});

// Option 2: Handle rollback manually
try {
  const { error: updateError } = await supabase
    .from('users')
    .update({ plan: 'pro' })
    .eq('id', userId);
  
  if (updateError) throw updateError;
  
  const { error: logError } = await supabase
    .from('usage_logs')
    .insert({ userId, action: 'upgrade' });
  
  if (logError) {
    // Rollback update
    await supabase
      .from('users')
      .update({ plan: 'free' })
      .eq('id', userId);
    throw logError;
  }
} catch (error) {
  // Handle error
}
```

### Date Handling

Supabase returns dates as strings. Convert if needed:

```javascript
const { data } = await supabase.from('users').select('*');
const users = data.map(user => ({
  ...user,
  createdAt: new Date(user.createdAt),
  updatedAt: new Date(user.updatedAt)
}));
```

## Notes

- Supabase uses snake_case for column names by default, but you can use camelCase if configured
- Row Level Security (RLS) is enabled by default in Supabase - ensure your service role key bypasses it
- Supabase queries are case-sensitive for column names
- Use `.select()` explicitly to avoid fetching unnecessary data
- Use `.single()` when expecting one result, `.maybeSingle()` when result might not exist

## Troubleshooting

### Error: "relation does not exist"
- Check table names match exactly (case-sensitive)
- Verify schema is migrated to Supabase

### Error: "permission denied"
- Check RLS policies
- Verify service role key is being used

### Error: "column does not exist"
- Check column names match exactly
- Verify migrations ran successfully

