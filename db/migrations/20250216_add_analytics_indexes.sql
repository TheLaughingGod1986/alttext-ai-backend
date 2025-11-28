-- Additional Analytics Indexes
-- Performance optimization for dashboard chart queries
-- Adds composite indexes for time-series aggregation queries

-- Composite index for email + created_at queries (for time-series data)
-- Optimizes queries that filter by email and date range
create index if not exists analytics_events_email_created_at_idx 
  on analytics_events (email, created_at desc);

-- Composite index for plugin_slug + created_at queries (for plugin-specific analytics)
-- Optimizes queries that filter by plugin and date range
create index if not exists analytics_events_plugin_created_at_idx 
  on analytics_events (plugin_slug, created_at desc);

-- Composite index for email + plugin_slug + created_at (for per-plugin user analytics)
-- Optimizes queries that filter by email, plugin, and date range
create index if not exists analytics_events_email_plugin_created_idx 
  on analytics_events (email, plugin_slug, created_at desc);

