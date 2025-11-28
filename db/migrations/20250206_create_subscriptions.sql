-- Subscriptions Table
-- Tracks user subscriptions per plugin

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  plugin_slug text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan text not null,
  status text not null default 'active',
  quantity int default 1,
  renews_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint subscriptions_email_plugin_unique unique (user_email, plugin_slug)
);

-- Indexes for efficient queries
create index if not exists subscriptions_email_idx on subscriptions (user_email);
create index if not exists subscriptions_subscription_idx on subscriptions (stripe_subscription_id);
create index if not exists subscriptions_plugin_idx on subscriptions (plugin_slug);

