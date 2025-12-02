/**
 * Production Database Optimization
 * Fixes issues, adds indexes, and optimizes for production
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { requireEnv, getEnv } = require('../config/loadEnv');

async function optimizeDatabase() {
  console.log('🚀 Production Database Optimization');
  console.log('='.repeat(70));
  console.log('');

  // Try to get DATABASE_URL or construct from Supabase
  let databaseUrl = getEnv('DATABASE_URL');
  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!databaseUrl && supabaseUrl && supabaseServiceKey) {
    // Try to construct connection string
    const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (projectRef) {
      console.log('⚠️  DATABASE_URL not found.');
      console.log('   Please set DATABASE_URL in your .env file.');
      console.log('   Get it from: Supabase Dashboard > Settings > Database > Connection String');
      console.log('');
      console.log('   Or run the SQL manually from: db/migrations/20251201_execute_optimization_steps.sql');
      process.exit(1);
    }
  }

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('');

    // Step 1: Check and fix table name mismatch
    console.log('📋 Step 1: Checking table name mismatch...');
    const sitesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sites'
      ) as exists;
    `);
    const licenseSitesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'license_sites'
      ) as exists;
    `);

    const sitesExists = sitesCheck.rows[0].exists;
    const licenseSitesExists = licenseSitesCheck.rows[0].exists;

    console.log(`   sites table: ${sitesExists ? '✅ exists' : '❌ missing'}`);
    console.log(`   license_sites table: ${licenseSitesExists ? '✅ exists' : '❌ missing'}`);

    if (!sitesExists && licenseSitesExists) {
      console.log('   🔧 Fixing: Renaming license_sites to sites...');
      await client.query('ALTER TABLE license_sites RENAME TO sites;');
      console.log('   ✅ Fixed: license_sites renamed to sites');
    } else if (sitesExists && !licenseSitesExists) {
      console.log('   ✅ Table name is correct');
    } else if (!sitesExists && !licenseSitesExists) {
      console.log('   ⚠️  Warning: Neither sites nor license_sites table exists');
    }
    console.log('');

    // Step 2: Check unused tables
    console.log('📋 Step 2: Analyzing unused tables...');
    const unusedTables = ['generation_requests', 'queue_jobs', 'sessions'];
    const tableCounts = {};

    for (const table of unusedTables) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${table};`);
        tableCounts[table] = result.rows[0].count;
        console.log(`   ${table}: ${result.rows[0].count} rows`);
      } catch (error) {
        console.log(`   ${table}: ❌ Error checking (may not exist)`);
      }
    }
    console.log('');

    // Step 3: Add all performance indexes
    console.log('📋 Step 3: Adding performance indexes...');
    
    const indexes = [
      // Licenses
      { table: 'licenses', column: 'license_key', name: 'idx_licenses_license_key' },
      { table: 'licenses', column: 'user_id', name: 'idx_licenses_user_id' },
      
      // Usage logs
      { table: 'usage_logs', column: 'user_id', name: 'idx_usage_logs_user_id' },
      { table: 'usage_logs', column: 'license_id', name: 'idx_usage_logs_license_id' },
      { table: 'usage_logs', column: 'site_hash', name: 'idx_usage_logs_site_hash' },
      { table: 'usage_logs', column: 'created_at', name: 'idx_usage_logs_created_at' },
      
      // Credits
      { table: 'credits', column: 'user_id', name: 'idx_credits_user_id' },
      
      // Subscriptions
      { table: 'subscriptions', column: 'user_id', name: 'idx_subscriptions_user_id' },
      { table: 'subscriptions', column: 'stripe_subscription_id', name: 'idx_subscriptions_stripe_subscription_id' },
      { table: 'subscriptions', column: 'status', name: 'idx_subscriptions_status' },
      
      // Password reset tokens
      { table: 'password_reset_tokens', column: 'user_id', name: 'idx_password_reset_tokens_user_id' },
      { table: 'password_reset_tokens', column: 'token_hash', name: 'idx_password_reset_tokens_token_hash' },
      { table: 'password_reset_tokens', column: 'expires_at', name: 'idx_password_reset_tokens_expires_at' },
    ];

    // Add sites table indexes if it exists
    const finalSitesTable = sitesExists ? 'sites' : (licenseSitesExists ? 'license_sites' : null);
    if (finalSitesTable) {
      indexes.push(
        { table: finalSitesTable, column: 'license_id', name: `idx_${finalSitesTable}_license_id` },
        { table: finalSitesTable, column: 'site_hash', name: `idx_${finalSitesTable}_site_hash` }
      );
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const idx of indexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.column});
        `);
        createdCount++;
        console.log(`   ✅ ${idx.name}`);
      } catch (error) {
        if (error.message.includes('does not exist')) {
          console.log(`   ⚠️  ${idx.name} - table ${idx.table} doesn't exist, skipping`);
          skippedCount++;
        } else {
          console.log(`   ⚠️  ${idx.name} - ${error.message}`);
          skippedCount++;
        }
      }
    }

    console.log(`\n   Created: ${createdCount} indexes`);
    if (skippedCount > 0) {
      console.log(`   Skipped: ${skippedCount} indexes`);
    }
    console.log('');

    // Step 4: Verify indexes
    console.log('📋 Step 4: Verifying indexes...');
    const indexResult = await client.query(`
      SELECT 
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);

    console.log(`   ✅ Found ${indexResult.rows.length} performance indexes`);
    const indexesByTable = {};
    indexResult.rows.forEach(row => {
      if (!indexesByTable[row.tablename]) {
        indexesByTable[row.tablename] = [];
      }
      indexesByTable[row.tablename].push(row.indexname);
    });

    Object.keys(indexesByTable).sort().forEach(table => {
      console.log(`   ${table}: ${indexesByTable[table].length} indexes`);
    });
    console.log('');

    // Step 5: Clean up empty unused tables
    console.log('📋 Step 5: Cleaning up unused tables...');
    let droppedCount = 0;

    for (const table of unusedTables) {
      if (tableCounts[table] === 0) {
        try {
          await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
          console.log(`   ✅ Dropped ${table} (was empty)`);
          droppedCount++;
        } catch (error) {
          console.log(`   ⚠️  Could not drop ${table}: ${error.message}`);
        }
      } else if (tableCounts[table] > 0) {
        console.log(`   ⏭️  Skipped ${table} (has ${tableCounts[table]} rows)`);
      }
    }

    if (droppedCount === 0) {
      console.log('   No empty tables to drop');
    }
    console.log('');

    // Step 6: Table size analysis
    console.log('📋 Step 6: Table size analysis...');
    const sizes = await client.query(`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size,
        pg_total_relation_size('public.'||tablename) AS size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size('public.'||tablename) DESC
      LIMIT 10;
    `);

    console.log('   Top tables by size:');
    sizes.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.tablename}: ${row.size}`);
    });
    console.log('');

    // Step 7: Verify foreign key constraints
    console.log('📋 Step 7: Verifying foreign key constraints...');
    const fkResult = await client.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);

    console.log(`   ✅ Found ${fkResult.rows.length} foreign key constraints`);
    console.log('');

    // Summary
    console.log('='.repeat(70));
    console.log('✅ PRODUCTION OPTIMIZATION COMPLETE!');
    console.log('='.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log(`  - Indexes created: ${createdCount}`);
    console.log(`  - Tables cleaned: ${droppedCount}`);
    console.log(`  - Foreign keys verified: ${fkResult.rows.length}`);
    console.log('');
    console.log('🎉 Database is now production-ready!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('');
    console.log('🔌 Database connection closed');
  }
}

optimizeDatabase().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

