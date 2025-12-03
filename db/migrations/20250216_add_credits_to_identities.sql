-- Add credits_balance column to identities table
-- Tracks current credit balance for each user identity

alter table identities
add column if not exists credits_balance integer not null default 0;

-- Index for efficient balance queries
create index if not exists identities_credits_balance_idx on identities (credits_balance);

