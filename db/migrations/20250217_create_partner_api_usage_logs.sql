-- Partner API Usage Logs Table
-- Tracks all API calls made with partner API keys
-- Used for analytics, rate limiting, and auditing

create table if not exists partner_api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references partner_api_keys(id) on delete cascade,
  endpoint text not null,
  status_code integer not null,
  response_time_ms integer,
  ip_address text,
  created_at timestamptz default now(),
  constraint partner_api_usage_logs_status_code_ck check (status_code >= 100 and status_code < 600)
);

-- Indexes for efficient queries
create index if not exists partner_api_usage_logs_api_key_id_idx on partner_api_usage_logs (api_key_id);
create index if not exists partner_api_usage_logs_created_at_idx on partner_api_usage_logs (created_at);
create index if not exists partner_api_usage_logs_api_key_created_idx on partner_api_usage_logs (api_key_id, created_at);

-- Composite index for analytics queries
create index if not exists partner_api_usage_logs_analytics_idx on partner_api_usage_logs (api_key_id, status_code, created_at);

