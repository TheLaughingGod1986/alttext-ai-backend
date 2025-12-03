-- Analytics Events Table
-- Stores analytics events for tracking user behavior across the platform
-- Links to identities table via identity_id for unified user tracking

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  identity_id uuid references identities(id),
  plugin_slug text,
  event_name text not null,
  event_data jsonb default '{}'::jsonb,
  source text default 'plugin',
  created_at timestamptz default now(),
  constraint analytics_events_email_ck check (email <> '')
);

-- Indexes for efficient queries
create index if not exists analytics_events_email_idx on analytics_events (email);
create index if not exists analytics_events_event_name_idx on analytics_events (event_name);
create index if not exists analytics_events_created_at_idx on analytics_events (created_at desc);
create index if not exists analytics_events_plugin_slug_idx on analytics_events (plugin_slug);

-- Composite index for summary queries (email, event_name, created_at)
-- This optimizes queries that filter by email and event_name with date range
create index if not exists analytics_events_email_event_created_idx on analytics_events (email, event_name, created_at desc);

