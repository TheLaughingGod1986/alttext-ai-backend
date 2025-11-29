-- Migrate existing data from credits_transactions and analytics_events to unified events table
-- Preserves historical data while consolidating into single table
-- Old tables remain for historical reference (deprecated)

-- Migrate credits_transactions to events
-- Map transaction_type to event_type:
--   'purchase' -> 'credit_purchase'
--   'spend' -> 'credit_used'
--   'refund' -> 'credit_refund'
insert into events (identity_id, event_type, credits_delta, metadata, created_at)
select 
  identity_id,
  case 
    when transaction_type = 'purchase' then 'credit_purchase'
    when transaction_type = 'spend' then 'credit_used'
    when transaction_type = 'refund' then 'credit_refund'
    else 'credit_transaction'
  end as event_type,
  case
    when transaction_type = 'purchase' then amount
    when transaction_type = 'spend' then -amount
    when transaction_type = 'refund' then amount
    else 0
  end as credits_delta,
  jsonb_build_object(
    'transaction_type', transaction_type,
    'balance_after', balance_after,
    'stripe_payment_intent_id', stripe_payment_intent_id,
    'original_table', 'credits_transactions',
    'original_id', id
  ) || coalesce(metadata, '{}'::jsonb) as metadata,
  created_at
from credits_transactions
where identity_id is not null;

-- Migrate analytics_events to events
-- Map event_name to event_type (preserve most event names as-is)
-- Extract identity_id from email lookup or use null if not found
insert into events (identity_id, event_type, credits_delta, metadata, created_at)
select 
  coalesce(
    (select id from identities where email = analytics_events.email limit 1),
    null
  ) as identity_id,
  event_name as event_type,
  0 as credits_delta, -- Analytics events don't affect credits
  jsonb_build_object(
    'plugin_slug', plugin_slug,
    'source', source,
    'original_table', 'analytics_events',
    'original_id', id,
    'email', email
  ) || coalesce(event_data, '{}'::jsonb) as metadata,
  created_at
from analytics_events
where email is not null;

-- Add comment to old tables indicating they are deprecated
comment on table credits_transactions is 'DEPRECATED: Use events table instead. Kept for historical reference.';
comment on table analytics_events is 'DEPRECATED: Use events table instead. Kept for historical reference.';

