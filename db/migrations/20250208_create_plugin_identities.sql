-- Plugin Identities Table
-- Stores identities tied to installations + user emails
-- Enables JWT versioning, token invalidation, and plugin-based identity separation

create table if not exists plugin_identities (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plugin_slug text not null,
  site_url text,
  jwt_version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint plugin_identities_email_ck check (email <> '')
);

-- Indexes for efficient queries
create index if not exists plugin_identities_email_idx
  on plugin_identities (email);

create index if not exists plugin_identities_email_plugin_idx
  on plugin_identities (email, plugin_slug);

