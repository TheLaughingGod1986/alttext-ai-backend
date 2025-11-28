-- Usage Snapshots Table
-- Stores daily usage snapshots from plugins for cross-platform sync
-- Tracks plugin versions, usage counts, and settings

create table if not exists usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plugin_slug text not null,
  site_url text,
  version text,
  daily_count integer default 0,
  recent_actions jsonb default '[]'::jsonb,
  plan text default 'free',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  snapshot_date date default CURRENT_DATE,
  constraint usage_snapshots_email_ck check (email <> ''),
  constraint usage_snapshots_plugin_slug_ck check (plugin_slug <> '')
);

-- Indexes for efficient queries
create index if not exists usage_snapshots_email_idx on usage_snapshots (email);
create index if not exists usage_snapshots_plugin_slug_idx on usage_snapshots (plugin_slug);
create index if not exists usage_snapshots_snapshot_date_idx on usage_snapshots (snapshot_date desc);
create index if not exists usage_snapshots_email_plugin_date_idx on usage_snapshots (email, plugin_slug, snapshot_date);

-- Unique constraint: one snapshot per email+plugin+date
create unique index if not exists usage_snapshots_email_plugin_date_unique 
  on usage_snapshots (email, plugin_slug, snapshot_date);

