-- Daily Usage Summary Table
-- Pre-computed daily rollups for instant dashboard loads
-- Updated daily via cron job

create table if not exists daily_usage_summary (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references identities(id) on delete cascade,
  date date not null,
  credits_purchased integer not null default 0,
  credits_used integer not null default 0,
  events_count integer not null default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint daily_usage_summary_identity_date_unique unique (identity_id, date)
);

-- Indexes for efficient queries
create index if not exists idx_daily_usage_summary_identity_id on daily_usage_summary (identity_id);
create index if not exists idx_daily_usage_summary_date on daily_usage_summary (date desc);
create index if not exists idx_daily_usage_summary_identity_date on daily_usage_summary (identity_id, date desc);

-- Comments for documentation
comment on table daily_usage_summary is 'Pre-computed daily rollups from events table for instant dashboard loads';
comment on column daily_usage_summary.identity_id is 'Foreign key to identities table';
comment on column daily_usage_summary.date is 'Date of the summary (YYYY-MM-DD)';
comment on column daily_usage_summary.credits_purchased is 'Total credits purchased on this date';
comment on column daily_usage_summary.credits_used is 'Total credits used on this date';
comment on column daily_usage_summary.events_count is 'Total number of events on this date';

