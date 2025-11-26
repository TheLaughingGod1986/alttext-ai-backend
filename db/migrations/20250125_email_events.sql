-- Email Events Table
-- Tracks all email sends for logging and de-duplication

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  plugin_slug text null,
  event_type text not null,
  context jsonb default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  email_id text null,
  success boolean not null default true,
  error_message text null
);

-- Indexes for efficient queries
create index if not exists email_events_email_event_type_idx
  on email_events (email, event_type);

create index if not exists email_events_user_event_idx
  on email_events (user_id, event_type);

create index if not exists email_events_sent_at_idx
  on email_events (sent_at);

-- Index for de-duplication queries (email + event_type + time window)
create index if not exists email_events_dedup_idx
  on email_events (email, event_type, sent_at);

