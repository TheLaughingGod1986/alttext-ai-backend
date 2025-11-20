# Codebase Cleanup Plan

## Files to Remove

### 1. Old Server Files (Not Used)
- ❌ `server.js` - Old v1 server, replaced by `server-v2.js`

### 2. Prisma Files (No Longer Needed)
- ❌ `prisma/` - Entire directory (migrations, schema.prisma)
  - Migration complete, using Supabase now

### 3. Test/Utility Scripts (Can Remove or Move to `/tests`)
- ❌ `test-db.js` - Old database test (uses Prisma)
- ❌ `test-password-reset.js` - Test file
- ❌ `check-table.js` - Utility script
- ❌ `check-user-reset.js` - Utility script
- ❌ `migrate-users-to-orgs.js` - Migration utility (migration done)
- ⚠️ `check-supabase-schema.js` - Keep for debugging (useful diagnostic tool)

### 4. Old Migration Scripts (Migration Complete)
- ❌ `run-migration.sh` - Old migration script
- ❌ `run-migration-sql.sh` - Old migration script
- ❌ `QUICK_MIGRATION.sql` - Old SQL migration
- ⚠️ `sql-license-commands.sql` - Review if still needed

### 5. Setup Scripts (One-time Use, Now Done)
- ❌ `setup-resend.sh` - Setup script (already configured)
- ❌ `setup-resend-auto.sh` - Setup script
- ❌ `setup-separate-keys.sh` - Setup script
- ❌ `deploy-seo-ai-meta.sh` - Deployment script
- ⚠️ `fetch-render-env.sh` - Keep (useful utility)

### 6. Old Test Scripts
- ❌ `test-api.sh` - Old test script
- ❌ `test-seo-ai-meta-api.sh` - Old test script

### 7. Temporary/Runtime Files
- ❌ `server.log` - Log file (should be in .gitignore)
- ❌ `server.pid` - Process ID file (should be in .gitignore)
- ⚠️ `test-results.json` - Test output (can regenerate, but useful)

### 8. Unused Route Files (Not Registered in server-v2.js)
- ❌ `routes/provider.js` - Not imported/used
- ❌ `routes/email.js` - Not imported/used
- ❌ `auth/provider.js` - Only used by unused routes/provider.js
- ⚠️ `services/providerUsageService.js` - Uses Prisma, needs migration if used

### 9. Old Documentation (Consolidate)
Keep only essential:
- ✅ `README.md` - Main readme
- ✅ `SUPABASE_MIGRATION_COMPLETE.md` - Migration summary
- ✅ `VERIFICATION_CHECKLIST.md` - Deployment checklist
- ✅ `RENDER_SUPABASE_MIGRATION.md` - Render setup guide

Remove/Archive:
- ❌ `BACKEND_AUDIT_REPORT.md` - Old audit
- ❌ `BACKEND_UPDATES_SUMMARY.md` - Old summary
- ❌ `BACKEND_MIGRATION_STEPS.md` - Migration done
- ❌ `MIGRATE_NOW.md` - Migration done
- ❌ `RUN_MIGRATION_NOW.md` - Migration done
- ❌ `MIGRATION_GUIDE.md` - Migration done
- ❌ `MIGRATION_TEST_REPORT.md` - Old test report
- ❌ `DEPLOY_TO_RENDER.md` - Consolidated into RENDER_SUPABASE_MIGRATION.md
- ❌ `DEPLOYMENT_STEPS.md` - Old deployment guide
- ❌ `PHASE-2-README.md` - Old phase docs
- ❌ `PHASE-2-COMPLETION-REPORT.md` - Old report
- ❌ `RENDER-DEPLOYMENT-GUIDE.md` - Consolidated
- ❌ `RENDER_ENV_SETUP.md` - Consolidated
- ❌ `RENDER_ENV_SETUP_STEPS.md` - Consolidated
- ❌ `RENDER_ENV_VARS_CHECKLIST.md` - Consolidated
- ❌ `ENVIRONMENT_VARIABLES_AUDIT.md` - Old audit
- ❌ `LOCAL_TESTING_SETUP.md` - Consolidated
- ❌ `SETUP_ENV_INSTRUCTIONS.md` - Consolidated
- ❌ `FETCH_RENDER_ENV.md` - Consolidated
- ❌ `TROUBLESHOOTING_500_ERRORS.md` - Old troubleshooting
- ❌ `FIX_EMAIL_NOT_SENDING.md` - Old fix doc
- ❌ `RESEND_DOMAIN_FIX.md` - Old fix doc
- ❌ `EMAIL_SETUP_GUIDE.md` - Old setup
- ❌ `PASSWORD_RESET_SETUP.md` - Old setup
- ❌ `SETUP_RESEND_CLI.md` - Old setup
- ❌ `SEPARATE_API_KEYS_SETUP.md` - Old setup
- ❌ `QUICK_START_SEPARATE_KEYS.md` - Old setup
- ❌ `SERVICE_SPECIFIC_API_KEY_UPDATE.md` - Old update doc
- ❌ `STRIPE_ENV_VAR_MIGRATION.md` - Old migration doc
- ❌ `AUTOMATED_LICENSE_DELIVERY.md` - Review if still relevant
- ❌ `ORGANIZATION_LICENSING_IMPLEMENTATION.md` - Review if still relevant

### 10. Other Files
- ⚠️ `ai-alt-gpt-direct.php` - Review if used
- ❌ `railway.json` - Not using Railway
- ❌ `.railway.toml` - Not using Railway
- ❌ `render-phase2.yaml` - Old render config
- ⚠️ `render.yaml` - Keep if using Render Blueprint

## Summary

**Files to Remove:** ~50+ files
**Space Saved:** Significant reduction in clutter
**Risk:** Low - only removing unused/test/old files

## Action Plan

1. Create `/archive` folder for old docs (optional)
2. Delete unused code files
3. Remove Prisma directory
4. Clean up temporary files
5. Update .gitignore
6. Consolidate documentation

