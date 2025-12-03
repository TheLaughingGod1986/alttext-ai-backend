/**
 * Database Health Verification Script
 * Runs comprehensive checks to verify database is in good shape
 */

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Please set it in your .env file');
  console.error('   Format: postgresql://user:password@host:port/database');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false
});

async function runQuery(query, description) {
  try {
    const result = await pool.query(query);
    return { success: true, data: result.rows, description };
  } catch (error) {
    return { success: false, error: error.message, description };
  }
}

async function verifyDatabase() {
  console.log('🔍 Starting Database Health Verification...\n');
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  // 1. Check table name fix
  console.log('1️⃣  Checking table name fix...');
  const tableCheck = await runQuery(`
    SELECT 
      CASE 
        WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sites') 
        THEN '✅ sites table exists' 
        WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'license_sites') 
        THEN '⚠️  license_sites exists (should be renamed to sites)' 
        ELSE '❌ Neither table exists' 
      END as table_status;
  `, 'Table name check');
  
  if (tableCheck.success) {
    const status = tableCheck.data[0]?.table_status;
    console.log(`   ${status}`);
    if (status.includes('✅')) {
      results.passed.push('Table name is correct (sites exists)');
    } else {
      results.warnings.push(status);
    }
  } else {
    results.errors.push(`Table check failed: ${tableCheck.error}`);
  }

  // 2. Verify performance indexes
  console.log('\n2️⃣  Checking performance indexes...');
  const indexCheck = await runQuery(`
    SELECT 
      tablename,
      COUNT(*) as index_count,
      string_agg(indexname, ', ' ORDER BY indexname) as indexes
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
    GROUP BY tablename
    ORDER BY tablename;
  `, 'Performance indexes');
  
  if (indexCheck.success) {
    console.log(`   Found indexes on ${indexCheck.data.length} tables:`);
    indexCheck.data.forEach(row => {
      console.log(`   - ${row.tablename}: ${row.index_count} indexes`);
    });
    const totalIndexes = indexCheck.data.reduce((sum, row) => sum + parseInt(row.index_count), 0);
    if (totalIndexes >= 10) {
      results.passed.push(`Performance indexes: ${totalIndexes} indexes found`);
    } else {
      results.warnings.push(`Only ${totalIndexes} performance indexes found (expected more)`);
    }
  } else {
    results.errors.push(`Index check failed: ${indexCheck.error}`);
  }

  // 3. Check unused tables
  console.log('\n3️⃣  Checking unused tables cleanup...');
  const unusedTablesCheck = await runQuery(`
    SELECT 
      table_name,
      CASE 
        WHEN table_name IN ('generation_requests', 'queue_jobs', 'sessions') 
        THEN '⚠️  Still exists (should be dropped if empty)'
        ELSE '✅ Active table'
      END as status
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name IN ('generation_requests', 'queue_jobs', 'sessions', 'credits', 'licenses', 'password_reset_tokens', 'subscriptions', 'usage_logs', 'users', 'sites', 'license_sites')
    ORDER BY table_name;
  `, 'Unused tables check');
  
  if (unusedTablesCheck.success) {
    const unusedTables = unusedTablesCheck.data.filter(row => row.status.includes('⚠️'));
    if (unusedTables.length === 0) {
      console.log('   ✅ All unused tables have been cleaned up');
      results.passed.push('Unused tables cleaned up');
    } else {
      console.log(`   ⚠️  Found ${unusedTables.length} unused tables still present:`);
      unusedTables.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
      results.warnings.push(`${unusedTables.length} unused tables still exist`);
    }
  } else {
    results.errors.push(`Unused tables check failed: ${unusedTablesCheck.error}`);
  }

  // 4. Check foreign key indexes
  console.log('\n4️⃣  Checking foreign key indexes...');
  const fkIndexCheck = await runQuery(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND tablename = tc.table_name 
          AND (indexdef LIKE '%' || kcu.column_name || '%' OR indexname LIKE '%' || kcu.column_name || '%')
        ) THEN '✅ Indexed'
        ELSE '⚠️  Missing index'
      END as index_status
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
  `, 'Foreign key indexes');
  
  if (fkIndexCheck.success) {
    const missingIndexes = fkIndexCheck.data.filter(row => row.index_status.includes('⚠️'));
    if (missingIndexes.length === 0) {
      console.log('   ✅ All foreign keys have indexes');
      results.passed.push('All foreign keys indexed');
    } else {
      console.log(`   ⚠️  Found ${missingIndexes.length} foreign keys without indexes:`);
      missingIndexes.forEach(row => {
        console.log(`   - ${row.table_name}.${row.column_name} → ${row.foreign_table_name}`);
      });
      results.warnings.push(`${missingIndexes.length} foreign keys missing indexes`);
    }
  } else {
    results.errors.push(`Foreign key index check failed: ${fkIndexCheck.error}`);
  }

  // 5. Check for tables without primary keys
  console.log('\n5️⃣  Checking for tables without primary keys...');
  const pkCheck = await runQuery(`
    SELECT 
      t.table_name,
      '⚠️  Missing primary key' as issue
    FROM information_schema.tables t
    LEFT JOIN information_schema.table_constraints tc
      ON t.table_schema = tc.table_schema
      AND t.table_name = tc.table_name
      AND tc.constraint_type = 'PRIMARY KEY'
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND tc.constraint_name IS NULL
    ORDER BY t.table_name;
  `, 'Primary keys check');
  
  if (pkCheck.success) {
    if (pkCheck.data.length === 0) {
      console.log('   ✅ All tables have primary keys');
      results.passed.push('All tables have primary keys');
    } else {
      console.log(`   ⚠️  Found ${pkCheck.data.length} tables without primary keys:`);
      pkCheck.data.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
      results.warnings.push(`${pkCheck.data.length} tables missing primary keys`);
    }
  } else {
    results.errors.push(`Primary key check failed: ${pkCheck.error}`);
  }

  // 6. Check for missing unique constraints
  console.log('\n6️⃣  Checking for missing unique constraints...');
  const uniqueCheck = await runQuery(`
    SELECT 
      table_name,
      column_name,
      '⚠️  Should have unique constraint' as recommendation
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'users' AND column_name = 'email') OR
        (table_name = 'licenses' AND column_name = 'license_key') OR
        (table_name = 'subscriptions' AND column_name = 'stripe_subscription_id') OR
        (table_name = 'password_reset_tokens' AND column_name = 'token_hash')
      )
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = information_schema.columns.table_name
          AND ccu.column_name = information_schema.columns.column_name
          AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
      )
    ORDER BY table_name, column_name;
  `, 'Unique constraints check');
  
  if (uniqueCheck.success) {
    if (uniqueCheck.data.length === 0) {
      console.log('   ✅ All critical columns have unique constraints');
      results.passed.push('All critical columns have unique constraints');
    } else {
      console.log(`   ⚠️  Found ${uniqueCheck.data.length} columns missing unique constraints:`);
      uniqueCheck.data.forEach(row => {
        console.log(`   - ${row.table_name}.${row.column_name}`);
      });
      results.warnings.push(`${uniqueCheck.data.length} columns missing unique constraints`);
    }
  } else {
    results.errors.push(`Unique constraint check failed: ${uniqueCheck.error}`);
  }

  // 7. Table size analysis
  console.log('\n7️⃣  Analyzing table sizes...');
  const sizeCheck = await runQuery(`
    SELECT 
      tablename,
      pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size,
      pg_total_relation_size('public.'||tablename) AS size_bytes
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size('public.'||tablename) DESC;
  `, 'Table sizes');
  
  if (sizeCheck.success) {
    console.log('   Table sizes:');
    sizeCheck.data.forEach(row => {
      const sizeBytes = parseInt(row.size_bytes);
      let status = '✅';
      if (sizeBytes > 1073741824) status = '⚠️  (>1GB)';
      else if (sizeBytes > 536870912) status = '💡 (>512MB)';
      console.log(`   ${status} ${row.tablename}: ${row.size}`);
    });
    results.passed.push('Table size analysis complete');
  } else {
    results.errors.push(`Table size check failed: ${sizeCheck.error}`);
  }

  // 8. Check for orphaned records
  console.log('\n8️⃣  Checking for orphaned records...');
  
  const orphanedUsageLogsLicense = await runQuery(`
    SELECT COUNT(*) as orphaned_count
    FROM usage_logs ul
    LEFT JOIN licenses l ON ul.license_id = l.id
    WHERE ul.license_id IS NOT NULL AND l.id IS NULL;
  `, 'Orphaned usage_logs by license_id');
  
  const orphanedUsageLogsUser = await runQuery(`
    SELECT COUNT(*) as orphaned_count
    FROM usage_logs ul
    LEFT JOIN users u ON ul.user_id = u.id
    WHERE ul.user_id IS NOT NULL AND u.id IS NULL;
  `, 'Orphaned usage_logs by user_id');
  
  const orphanedLicenses = await runQuery(`
    SELECT COUNT(*) as orphaned_count
    FROM licenses l
    LEFT JOIN users u ON l.user_id = u.id
    WHERE l.user_id IS NOT NULL AND u.id IS NULL;
  `, 'Orphaned licenses by user_id');
  
  const orphanedCounts = {
    'usage_logs (license_id)': orphanedUsageLogsLicense.success ? parseInt(orphanedUsageLogsLicense.data[0]?.orphaned_count || 0) : -1,
    'usage_logs (user_id)': orphanedUsageLogsUser.success ? parseInt(orphanedUsageLogsUser.data[0]?.orphaned_count || 0) : -1,
    'licenses (user_id)': orphanedLicenses.success ? parseInt(orphanedLicenses.data[0]?.orphaned_count || 0) : -1
  };
  
  let allOrphanedClean = true;
  Object.entries(orphanedCounts).forEach(([key, count]) => {
    if (count === -1) {
      console.log(`   ❌ Failed to check ${key}`);
      results.errors.push(`Orphaned check failed for ${key}`);
      allOrphanedClean = false;
    } else if (count > 0) {
      console.log(`   ⚠️  ${key}: ${count} orphaned records`);
      results.warnings.push(`${key}: ${count} orphaned records`);
      allOrphanedClean = false;
    } else {
      console.log(`   ✅ ${key}: 0 orphaned records`);
    }
  });
  
  if (allOrphanedClean) {
    results.passed.push('No orphaned records found');
  }

  // 9. Large tables performance recommendations
  console.log('\n9️⃣  Checking for large tables needing attention...');
  const largeTablesCheck = await runQuery(`
    SELECT 
      tablename,
      pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size,
      CASE 
        WHEN pg_total_relation_size('public.'||tablename) > 1073741824 THEN '⚠️  Consider partitioning (>1GB)'
        WHEN pg_total_relation_size('public.'||tablename) > 536870912 THEN '💡 Monitor size (>512MB)'
        ELSE '✅ OK'
      END as recommendation
    FROM pg_tables
    WHERE schemaname = 'public'
      AND pg_total_relation_size('public.'||tablename) > 104857600
    ORDER BY pg_total_relation_size('public.'||tablename) DESC;
  `, 'Large tables check');
  
  if (largeTablesCheck.success) {
    if (largeTablesCheck.data.length === 0) {
      console.log('   ✅ No tables larger than 100MB');
      results.passed.push('No large tables requiring attention');
    } else {
      console.log('   Large tables:');
      largeTablesCheck.data.forEach(row => {
        console.log(`   ${row.recommendation} ${row.tablename}: ${row.size}`);
      });
      const needsAttention = largeTablesCheck.data.filter(row => row.recommendation.includes('⚠️')).length;
      if (needsAttention > 0) {
        results.warnings.push(`${needsAttention} tables may need partitioning`);
      }
    }
  } else {
    results.errors.push(`Large tables check failed: ${largeTablesCheck.error}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  results.passed.forEach(item => console.log(`   ✓ ${item}`));
  
  if (results.warnings.length > 0) {
    console.log(`\n⚠️  Warnings: ${results.warnings.length}`);
    results.warnings.forEach(item => console.log(`   ⚠ ${item}`));
  }
  
  if (results.errors.length > 0) {
    console.log(`\n❌ Errors: ${results.errors.length}`);
    results.errors.forEach(item => console.log(`   ✗ ${item}`));
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (results.errors.length === 0 && results.warnings.length === 0) {
    console.log('🎉 Database is in EXCELLENT shape! All checks passed.');
    process.exit(0);
  } else if (results.errors.length === 0) {
    console.log('✅ Database is in GOOD shape. Some minor optimizations recommended.');
    process.exit(0);
  } else {
    console.log('❌ Database has issues that need attention.');
    process.exit(1);
  }
}

// Run verification
verifyDatabase()
  .catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });

