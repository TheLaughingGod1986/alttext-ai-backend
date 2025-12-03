-- Aggregation Views for User Account Dashboard
-- These views prevent constantly running expensive SQL from Node

-- View: All installations for a user (normalized email)
create or replace view vw_user_installations as
select
  lower(email) as email,
  plugin_slug,
  site_url,
  version,
  wp_version,
  php_version,
  language,
  timezone,
  install_source,
  last_seen_at,
  created_at
from plugin_installations;

-- View: Group installations by plugin (overview)
-- Shows: plugin_slug, install_count, last_active, first_seen, sites array
create or replace view vw_user_plugins_overview as
select
  lower(email) as email,
  plugin_slug,
  count(*) as install_count,
  max(last_seen_at) as last_active,
  min(created_at) as first_seen,
  array_agg(distinct site_url) filter (where site_url is not null) as sites
from plugin_installations
group by lower(email), plugin_slug;

-- View: Group installations by site
-- Shows: Which sites is this email active on, and with which plugins?
create or replace view vw_user_sites_overview as
select
  lower(email) as email,
  site_url,
  array_agg(distinct plugin_slug) as plugins,
  max(last_seen_at) as last_seen
from plugin_installations
where site_url is not null
group by lower(email), site_url;

