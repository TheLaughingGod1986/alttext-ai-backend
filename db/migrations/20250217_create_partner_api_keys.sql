-- Partner API Keys Table
-- Stores API keys for partner/white-label API access
-- Keys are hashed using bcrypt for security

create table if not exists partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  identity_id uuid not null references identities(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  rate_limit_per_minute integer not null default 60,
  created_at timestamptz default now(),
  last_used_at timestamptz,
  rotated_from uuid references partner_api_keys(id),
  metadata jsonb default '{}'::jsonb,
  constraint partner_api_keys_name_ck check (name <> ''),
  constraint partner_api_keys_rate_limit_ck check (rate_limit_per_minute > 0)
);

-- Indexes for efficient queries
create index if not exists partner_api_keys_key_hash_idx on partner_api_keys (key_hash);
create index if not exists partner_api_keys_identity_id_idx on partner_api_keys (identity_id);
create index if not exists partner_api_keys_is_active_idx on partner_api_keys (is_active);
create index if not exists partner_api_keys_last_used_idx on partner_api_keys (last_used_at);

