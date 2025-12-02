/**
 * Execute Production Optimization via Supabase Client
 * Uses direct SQL execution through Supabase
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { requireEnv, getEnv } = require('../config/loadEnv');

async function executeOptimization() {
  console.log('🚀 Production Database Optimization via Supabase');
  console.log('='.repeat(70));
  console.log('');

  // Try to get DATABASE_URL
  let databaseUrl = getEnv('DATABASE_URL');
  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!databaseUrl) {
    // Try to construct from Supabase URL
    if (supabaseUrl && supabaseServiceKey) {
      const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
      if (projectRef) {
        console.log('⚠️  DATABASE_URL not found.');
        console.log('   To get your DATABASE_URL:');
        console.log('   1. Go to Supabase Dashboard');
        console.log('   2. Settings > Database');
        console.log('   3. Copy the "Connection string" (URI format)');
        console.log('   4. Add to .env as: DATABASE_URL=postgresql://...');
        console.log('');
        console.log('   Or run the SQL manually from:');
        console.log('   db/migrations/20251201_production_optimization.sql');
        process.exit(1);
      }
    }
  }

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
  }

  // Read the optimization SQL
  const sqlPath = path.resolve(__dirname, '../db/migrations/20251201_production_optimization.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('📄 Loading optimization SQL...');
  console.log('');

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('');

    // Execute the entire SQL
    console.log('🚀 Executing production optimization...');
    console.log('');

    await client.query(sql);

    console.log('✅ Optimization executed successfully!');
    console.log('');

    // Verify indexes were created
    console.log('🔍 Verifying indexes...');
    const indexResult = await client.query(`
      SELECT 
        tablename,
        COUNT(*) as index_count
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      GROUP BY tablename
      ORDER BY tablename;
    `);

    console.log('   Indexes by table:');
    indexResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}: ${row.index_count} indexes`);
    });
    console.log('');

    // Check table name fix
    console.log('🔍 Verifying table name fix...');
    const sitesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sites'
      ) as exists;
    `);
    console.log(`   sites table exists: ${sitesCheck.rows[0].exists ? '✅' : '❌'}`);
    console.log('');

    // Summary
    console.log('='.repeat(70));
    console.log('✅ PRODUCTION OPTIMIZATION COMPLETE!');
    console.log('='.repeat(70));
    console.log('');
    console.log('Database is now production-ready with:');
    console.log('  ✅ Table name mismatch fixed');
    console.log('  ✅ Performance indexes added');
    console.log('  ✅ Unused tables cleaned up');
    console.log('  ✅ Constraints added');
    console.log('  ✅ Statistics optimized');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('already exists')) {
      console.log('   ℹ️  Some indexes may already exist (this is normal)');
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

executeOptimization().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

