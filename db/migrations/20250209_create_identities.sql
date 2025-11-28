-- Unified Identities Table
-- Stores unified user identities based on email
-- Links all user data (installations, subscriptions, usage, email events) via identity_id

create table if not exists identities (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  constraint identities_email_ck check (email <> '')
);

-- Indexes for efficient queries
create index if not exists identities_email_idx on identities (email);
create index if not exists identities_last_seen_idx on identities (last_seen_at);

