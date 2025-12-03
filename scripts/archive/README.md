# Archived Migration Scripts

This directory contains one-time migration and optimization scripts that have been completed and are no longer actively used.

## Scripts

### Migration Execution Scripts
These scripts were used to execute database migrations via various methods:
- `execute-migration-mcp.js` - Migration execution via MCP (Managed Cloud Platform)
- `execute-migration-rest-api.js` - Migration execution via REST API
- `execute-migration-via-supabase.js` - Migration execution via Supabase client
- `run-migration-direct.js` - Direct database migration execution
- `run-migration-supabase.js` - Supabase-specific migration execution
- `run-migration.js` - General migration runner
- `get-and-run-migration.js` - Fetch and execute migration script

### Database Optimization Scripts
These scripts were used for one-time database optimizations:
- `execute-production-optimization.js` - Production database optimization
- `execute-optimization-via-mcp.js` - Optimization via MCP
- `database-cleanup-mcp.js` - Database cleanup via MCP
- `execute-via-supabase-client.js` - Execution via Supabase client
- `production-database-optimization.js` - Production optimization script

## Status

All scripts in this directory have completed their intended purpose. They are kept for historical reference and potential future use if similar migrations are needed.

## Note

If you need to run migrations in the future, use the standard migration process defined in the main documentation. These scripts were one-time utilities for specific migration scenarios.

## Archive Date

2025-01-15

