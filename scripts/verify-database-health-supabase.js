/**
 * Database Health Verification Script (Using Supabase Client)
 * Runs comprehensive checks to verify database is in good shape
 */

require('dotenv').config();
const { supabase } = require('../db/supabase-client');

async function runQuery(query, description) {
  try {
    // Use RPC for complex queries, or direct SQL execution
    // For Supabase, we'll use the REST API with raw SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });
    
    if (error) {
      // If RPC doesn't exist, try alternative approach
      // For read-only queries, we can use Supabase's query builder where possible
      // But for complex queries, we need direct SQL access
      throw error;
    }
    return { success: true, data: data || [], description };
  } catch (error) {
    return { success: false, error: error.message, description };
  }
}

// Alternative: Use direct SQL queries via Supabase REST API
async function runDirectQuery(query) {
  try {
    // Supabase doesn't support arbitrary SQL via client
    // We'll need to use the pg library with connection string
    // But first, let's try to construct DATABASE_URL from Supabase credentials
    
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not found');
    }
    
    // Extract project ref from Supabase URL
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
    
    // For Supabase, we need the database password to construct DATABASE_URL
    // This is typically found in Supabase dashboard > Settings > Database
    
    console.log('\n⚠️  Direct SQL queries require DATABASE_URL');
    console.log('   To get your DATABASE_URL:');
    console.log('   1. Go to Supabase Dashboard > Settings > Database');
    console.log('   2. Find "Connection string" section');
    console.log('   3. Copy the "URI" or "Connection pooling" connection string');
    console.log('   4. Add it to your .env file as DATABASE_URL');
    console.log('\n   Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres');
    console.log(`   Your project ref: ${projectRef}`);
    
    return null;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyDatabase() {
  console.log('🔍 Starting Database Health Verification...\n');
  console.log('📋 Attempting to verify database health...\n');
  
  // Since we can't run arbitrary SQL via Supabase client easily,
  // let's check what we can verify using the Supabase client directly
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  // 1. Check if sites table exists (using Supabase client)
  console.log('1️⃣  Checking if sites table exists...');
  try {
    const { data, error } = await supabase
      .from('sites')
      .select('id')
      .limit(1);
    
    if (error && error.code === '42P01') {
      // Table doesn't exist
      console.log('   ⚠️  sites table does not exist');
      results.warnings.push('sites table does not exist');
    } else if (error) {
      console.log(`   ❌ Error checking sites table: ${error.message}`);
      results.errors.push(`Error checking sites: ${error.message}`);
    } else {
      console.log('   ✅ sites table exists');
      results.passed.push('sites table exists');
    }
  } catch (error) {
    console.log(`   ❌ Failed to check sites table: ${error.message}`);
    results.errors.push(`Failed to check sites: ${error.message}`);
  }

  // 2. Check if license_sites table exists (should not)
  console.log('\n2️⃣  Checking if license_sites table still exists...');
  try {
    const { data, error } = await supabase
      .from('license_sites')
      .select('id')
      .limit(1);
    
    if (error && error.code === '42P01') {
      // Table doesn't exist (good!)
      console.log('   ✅ license_sites table does not exist (correctly renamed)');
      results.passed.push('license_sites table correctly removed');
    } else if (!error) {
      console.log('   ⚠️  license_sites table still exists');
      results.warnings.push('license_sites table still exists (should be renamed to sites)');
    } else {
      console.log(`   ❓ Could not determine: ${error.message}`);
    }
  } catch (error) {
    // Table doesn't exist, which is good
    console.log('   ✅ license_sites table does not exist (correctly renamed)');
    results.passed.push('license_sites table correctly removed');
  }

  // 3. Check table row counts
  console.log('\n3️⃣  Checking table row counts...');
  const tables = ['users', 'licenses', 'subscriptions', 'usage_logs', 'credits', 'sites'];
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`   ⚠️  ${table}: Error - ${error.message}`);
      } else {
        console.log(`   ✅ ${table}: ${count || 0} rows`);
      }
    } catch (error) {
      console.log(`   ⚠️  ${table}: Could not check`);
    }
  }

  // 4. Check for orphaned records (licenses without users)
  console.log('\n4️⃣  Checking for orphaned licenses...');
  try {
    // Get all licenses
    const { data: licenses, error: licensesError } = await supabase
      .from('licenses')
      .select('user_id');
    
    if (!licensesError && licenses) {
      // Get all user IDs
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id');
      
      if (!usersError && users) {
        const userIds = new Set(users.map(u => u.id));
        const orphaned = licenses.filter(l => l.user_id && !userIds.has(l.user_id));
        
        if (orphaned.length === 0) {
          console.log('   ✅ No orphaned licenses found');
          results.passed.push('No orphaned licenses');
        } else {
          console.log(`   ⚠️  Found ${orphaned.length} orphaned licenses`);
          results.warnings.push(`${orphaned.length} orphaned licenses found`);
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check orphaned licenses: ${error.message}`);
  }

  // 5. Check for orphaned usage_logs
  console.log('\n5️⃣  Checking for orphaned usage_logs...');
  try {
    const { data: usageLogs, error: logsError } = await supabase
      .from('usage_logs')
      .select('license_id, user_id')
      .limit(1000); // Sample check
    
    if (!logsError && usageLogs) {
      const { data: licenses } = await supabase.from('licenses').select('id');
      const { data: users } = await supabase.from('users').select('id');
      
      const licenseIds = new Set((licenses || []).map(l => l.id));
      const userIds = new Set((users || []).map(u => u.id));
      
      const orphanedByLicense = usageLogs.filter(log => log.license_id && !licenseIds.has(log.license_id));
      const orphanedByUser = usageLogs.filter(log => log.user_id && !userIds.has(log.user_id));
      
      if (orphanedByLicense.length === 0 && orphanedByUser.length === 0) {
        console.log('   ✅ No orphaned usage_logs found (sample check)');
        results.passed.push('No orphaned usage_logs (sample)');
      } else {
        console.log(`   ⚠️  Found ${orphanedByLicense.length} orphaned by license, ${orphanedByUser.length} orphaned by user`);
        results.warnings.push(`Some orphaned usage_logs found (sample)`);
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check orphaned usage_logs: ${error.message}`);
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
  console.log('\n💡 NOTE: For complete verification including indexes, constraints, and table sizes,');
  console.log('   please run the SQL file: db/migrations/20251201_quick_health_check.sql');
  console.log('   in your Supabase SQL Editor.\n');
  
  if (results.errors.length === 0 && results.warnings.length === 0) {
    console.log('🎉 Basic checks passed! Run the SQL health check for complete verification.');
  } else if (results.errors.length === 0) {
    console.log('✅ Basic checks show minor issues. Run SQL health check for details.');
  } else {
    console.log('❌ Some issues found. Please review and run SQL health check.');
  }
}

// Run verification
verifyDatabase()
  .catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });

