-- Add auto_attach_status column to licenses table
-- This column tracks the status of license auto-attachment to sites
-- Values: 'manual', 'pending', 'attached'

alter table licenses
add column if not exists "autoAttachStatus" varchar(50) default 'manual';

-- Update existing licenses that have site information to 'attached' status
-- This handles licenses that were created before this column existed
-- Note: Column names are camelCase with quotes as per original schema
update licenses
set "autoAttachStatus" = 'attached'
where ("siteUrl" is not null or "siteHash" is not null or "installId" is not null)
  and "autoAttachStatus" = 'manual';

-- Index for efficient queries on autoAttachStatus
create index if not exists licenses_auto_attach_status_idx on licenses ("autoAttachStatus");

