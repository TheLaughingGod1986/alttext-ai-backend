-- Credits Transactions Table
-- Tracks all credit transactions: purchases, spending, and refunds
-- Links to identities table via identity_id

create table if not exists credits_transactions (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references identities(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('purchase', 'spend', 'refund')),
  amount integer not null,
  balance_after integer not null,
  stripe_payment_intent_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint credits_transactions_amount_ck check (amount > 0),
  constraint credits_transactions_balance_ck check (balance_after >= 0)
);

-- Indexes for efficient queries
create index if not exists credits_transactions_identity_id_idx on credits_transactions (identity_id);
create index if not exists credits_transactions_created_at_idx on credits_transactions (created_at);
create index if not exists credits_transactions_stripe_payment_intent_id_idx on credits_transactions (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists credits_transactions_type_idx on credits_transactions (transaction_type);

