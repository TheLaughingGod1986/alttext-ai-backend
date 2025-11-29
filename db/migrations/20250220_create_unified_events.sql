-- Unified Events Table
-- Replaces scattered analytics_events and credits_transactions tables
-- Single source of truth for all platform events: subscriptions, credits, usage analytics, dashboard charts, plugin tracking, etc.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references identities(id) on delete cascade,
  event_type text not null,
  credits_delta integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

-- Indexes for efficient queries
-- Identity-based queries (most common)
create index if not exists idx_events_identity_id on events (identity_id);

-- Event type filtering (for analytics)
create index if not exists idx_events_event_type on events (event_type);

-- Time-based queries (for dashboards and timelines)
create index if not exists idx_events_created_at on events (created_at desc);

-- Composite index for ultra-fast dashboard queries
-- Optimizes: WHERE identity_id = X AND event_type = Y AND created_at >= Z
create index if not exists idx_events_identity_type_created on events (identity_id, event_type, created_at desc);

-- Comments for documentation
comment on table events is 'Unified event system - replaces analytics_events and credits_transactions';
comment on column events.identity_id is 'Foreign key to identities table - unified user tracking';
comment on column events.event_type is 'Event type: alttext_generated, credit_used, credit_purchase, signup_submitted, signup_deduped, dashboard_loaded, settings_changed, plugin_activated, etc.';
comment on column events.credits_delta is 'Credit change: negative for usage, positive for purchases';
comment on column events.metadata is 'Flexible JSON payload: image count, origin, plugin version, etc.';

