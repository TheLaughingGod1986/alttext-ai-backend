-- Add identity_id columns to all connected tables
-- These are foreign keys, not required but very helpful for linking records to identities

alter table plugin_installations
add column if not exists identity_id uuid references identities(id);

alter table subscriptions
add column if not exists identity_id uuid references identities(id);

alter table usage_logs
add column if not exists identity_id uuid references identities(id);

alter table email_events
add column if not exists identity_id uuid references identities(id);

-- Add indexes for efficient lookups
create index if not exists plugin_installations_identity_id_idx on plugin_installations (identity_id);
create index if not exists subscriptions_identity_id_idx on subscriptions (identity_id);
create index if not exists usage_logs_identity_id_idx on usage_logs (identity_id);
create index if not exists email_events_identity_id_idx on email_events (identity_id);

