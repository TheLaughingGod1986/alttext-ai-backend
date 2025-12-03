/**
 * Run Database Optimization
 * Executes the optimization SQL using Supabase client
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { requireEnv, getEnv } = require('../config/loadEnv');

async function runOptimization() {
  // Get database connection
  const databaseUrl = getEnv('DATABASE_URL');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found.');
    console.log('   Please set DATABASE_URL in your .env file.');
    console.log('   Or run the SQL manually in Supabase SQL Editor.');
    process.exit(1);
  }

  // Read optimization SQL
  const sqlPath = path.resolve(__dirname, '../db/migrations/20251201_execute_optimization_steps.sql');
  const fullSQL = fs.readFileSync(sqlPath, 'utf8');

  // Extract just the index creation part (safe DDL)
  const indexSQL = fullSQL.split('-- STEP 3: ADD PERFORMANCE INDEXES')[1]
    .split('-- ============================================')[0]
    .replace(/^--.*$/gm, '') // Remove comments
    .trim();

  console.log('🚀 Running Database Optimization');
  console.log('='.repeat(70));
  console.log('');

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('');

    // Execute index creation
    console.log('📊 Creating performance indexes...');
    await client.query(indexSQL);
    console.log('✅ All indexes created successfully!');
    console.log('');

    // Verify indexes
    console.log('🔍 Verifying indexes...');
    const indexResult = await client.query(`
      SELECT 
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);

    console.log(`✅ Found ${indexResult.rows.length} indexes:`);
    indexResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}.${row.indexname}`);
    });
    console.log('');

    // Check table name mismatch
    console.log('🔍 Checking table name mismatch...');
    const sitesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sites'
      ) as sites_table_exists;
    `);
    const licenseSitesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'license_sites'
      ) as license_sites_table_exists;
    `);

    console.log(`   sites table exists: ${sitesCheck.rows[0].sites_table_exists}`);
    console.log(`   license_sites table exists: ${licenseSitesCheck.rows[0].license_sites_table_exists}`);
    if (!sitesCheck.rows[0].sites_table_exists && licenseSitesCheck.rows[0].license_sites_table_exists) {
      console.log('   ⚠️  WARNING: Code references "sites" but database has "license_sites"');
    }
    console.log('');

    // Check unused tables row counts
    console.log('🔍 Checking unused tables...');
    const rowCounts = await client.query(`
      SELECT 
        'generation_requests' as table_name,
        COUNT(*) as row_count
      FROM generation_requests
      UNION ALL
      SELECT 
        'queue_jobs' as table_name,
        COUNT(*) as row_count
      FROM queue_jobs
      UNION ALL
      SELECT 
        'sessions' as table_name,
        COUNT(*) as row_count
      FROM sessions
      UNION ALL
      SELECT 
        'license_sites' as table_name,
        COUNT(*) as row_count
      FROM license_sites;
    `);

    console.log('   Row counts for potentially unused tables:');
    rowCounts.rows.forEach(row => {
      console.log(`   - ${row.table_name}: ${row.row_count} rows`);
    });
    console.log('');

    // Table size analysis
    console.log('📊 Table size analysis...');
    const sizes = await client.query(`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size('public.'||tablename) DESC;
    `);

    console.log('   Table sizes:');
    sizes.rows.forEach(row => {
      console.log(`   - ${row.tablename}: ${row.size}`);
    });

    console.log('');
    console.log('✅ Optimization complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('already exists')) {
      console.log('   ℹ️  Some indexes may already exist (this is normal)');
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('');
    console.log('🔌 Database connection closed');
  }
}

runOptimization().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

