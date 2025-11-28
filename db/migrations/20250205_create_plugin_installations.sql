-- Plugin Installations Table
-- Tracks plugin installations across all Optti plugins

create table if not exists plugin_installations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plugin_slug text not null,
  site_url text,
  version text,
  wp_version text,
  php_version text,
  language text,
  timezone text,
  install_source text default 'plugin',
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint plugin_installations_email_ck check (email <> '')
);

-- Indexes for efficient queries
create index if not exists plugin_installations_email_idx
  on plugin_installations (email);

create index if not exists plugin_installations_plugin_slug_idx
  on plugin_installations (plugin_slug);

create index if not exists plugin_installations_email_plugin_idx
  on plugin_installations (email, plugin_slug);

create index if not exists plugin_installations_site_url_idx
  on plugin_installations (site_url);

create index if not exists plugin_installations_last_seen_at_idx
  on plugin_installations (last_seen_at);

