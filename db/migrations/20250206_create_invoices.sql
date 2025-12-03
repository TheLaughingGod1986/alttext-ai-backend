-- Invoices Table
-- Tracks payment invoices and receipts

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  user_email text not null,
  plugin_slug text,
  amount integer not null,
  currency text not null default 'usd',
  hosted_invoice_url text,
  pdf_url text,
  created_at timestamptz default now(),
  paid_at timestamptz,
  receipt_email_sent boolean default false
);

-- Indexes for efficient queries
create index if not exists invoices_invoice_id_idx on invoices (invoice_id);
create index if not exists invoices_email_idx on invoices (user_email);

