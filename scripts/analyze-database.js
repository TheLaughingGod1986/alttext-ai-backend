/**
 * Database Analysis Script
 * Analyzes table usage and provides optimization recommendations
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Tables in the database (from the image/schema)
const DATABASE_TABLES = [
  'credits',
  'generation_requests',
  'license_sites',
  'licenses',
  'password_reset_tokens',
  'queue_jobs',
  'sessions',
  'subscriptions',
  'usage_logs',
  'users'
];

// Find all JavaScript files in the codebase
function findCodeFiles() {
  const codeFiles = [];
  
  const directories = [
    'routes',
    'src',
    'services',
    'auth',
    'db',
    'scripts'
  ];
  
  directories.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = glob.sync(`${dir}/**/*.js`, { ignore: ['node_modules/**', 'coverage/**'] });
      codeFiles.push(...files);
    }
  });
  
  // Also check root level files
  const rootFiles = glob.sync('*.js', { ignore: ['node_modules/**'] });
  codeFiles.push(...rootFiles);
  
  return codeFiles;
}

// Analyze table usage in codebase
function analyzeTableUsage() {
  const codeFiles = findCodeFiles();
  const tableUsage = {};
  
  DATABASE_TABLES.forEach(table => {
    tableUsage[table] = {
      used: false,
      files: [],
      operations: {
        select: 0,
        insert: 0,
        update: 0,
        delete: 0
      }
    };
  });
  
  codeFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      DATABASE_TABLES.forEach(table => {
        // Check for table usage patterns
        const patterns = [
          new RegExp(`\\.from\\(['"]${table}['"]\\)`, 'g'),
          new RegExp(`\\.from\\(['"]${table.replace(/_/g, '[_]')}['"]\\)`, 'g'),
          new RegExp(`FROM\\s+${table}`, 'gi'),
          new RegExp(`INTO\\s+${table}`, 'gi'),
          new RegExp(`UPDATE\\s+${table}`, 'gi'),
          new RegExp(`DELETE\\s+FROM\\s+${table}`, 'gi')
        ];
        
        patterns.forEach(pattern => {
          const matches = content.match(pattern);
          if (matches) {
            tableUsage[table].used = true;
            if (!tableUsage[table].files.includes(file)) {
              tableUsage[table].files.push(file);
            }
            
            // Count operations
            if (pattern.source.includes('FROM') || pattern.source.includes('from')) {
              if (content.match(/\.select\(/)) tableUsage[table].operations.select += matches.length;
              if (content.match(/\.insert\(/)) tableUsage[table].operations.insert += matches.length;
              if (content.match(/\.update\(/)) tableUsage[table].operations.update += matches.length;
              if (content.match(/\.delete\(/)) tableUsage[table].operations.delete += matches.length;
            }
          }
        });
      });
    } catch (error) {
      // Skip files that can't be read
    }
  });
  
  return tableUsage;
}

// Generate report
function generateReport(tableUsage) {
  console.log('📊 Database Table Usage Analysis\n');
  console.log('='.repeat(70));
  console.log('\n');
  
  const usedTables = [];
  const unusedTables = [];
  
  Object.keys(tableUsage).forEach(table => {
    if (tableUsage[table].used) {
      usedTables.push(table);
    } else {
      unusedTables.push(table);
    }
  });
  
  console.log('✅ USED TABLES (' + usedTables.length + '):');
  console.log('-'.repeat(70));
  usedTables.forEach(table => {
    const usage = tableUsage[table];
    console.log(`\n📋 ${table}`);
    console.log(`   Files: ${usage.files.length}`);
    console.log(`   Operations: SELECT=${usage.operations.select}, INSERT=${usage.operations.insert}, UPDATE=${usage.operations.update}, DELETE=${usage.operations.delete}`);
    if (usage.files.length > 0) {
      console.log(`   Used in: ${usage.files.slice(0, 3).join(', ')}${usage.files.length > 3 ? '...' : ''}`);
    }
  });
  
  console.log('\n\n⚠️  UNUSED TABLES (' + unusedTables.length + '):');
  console.log('-'.repeat(70));
  if (unusedTables.length === 0) {
    console.log('   None! All tables are being used.');
  } else {
    unusedTables.forEach(table => {
      console.log(`   ❌ ${table}`);
    });
  }
  
  console.log('\n\n💡 RECOMMENDATIONS:');
  console.log('-'.repeat(70));
  
  if (unusedTables.length > 0) {
    console.log('\n1. UNUSED TABLES - Consider removing:');
    unusedTables.forEach(table => {
      console.log(`   - ${table} (not referenced in codebase)`);
    });
    console.log('\n   ⚠️  WARNING: Before dropping tables, verify they are not used by:');
    console.log('      - External services or scripts');
    console.log('      - Future planned features');
    console.log('      - Database views or functions');
  }
  
  // Check for optimization opportunities
  console.log('\n2. OPTIMIZATION OPPORTUNITIES:');
  console.log('   - Add indexes on frequently queried columns');
  console.log('   - Review foreign key constraints');
  console.log('   - Consider partitioning large tables (usage_logs, generation_requests)');
  console.log('   - Add RLS policies if needed for security');
  
  console.log('\n3. TABLE RELATIONSHIPS:');
  console.log('   - users → licenses (one-to-many)');
  console.log('   - licenses → license_sites (one-to-many)');
  console.log('   - users → credits (one-to-one)');
  console.log('   - users → subscriptions (one-to-many)');
  console.log('   - users → usage_logs (one-to-many)');
  console.log('   - licenses → usage_logs (one-to-many)');
  
  return {
    usedTables,
    unusedTables,
    tableUsage
  };
}

// Main execution
function main() {
  console.log('🔍 Analyzing database table usage...\n');
  
  const tableUsage = analyzeTableUsage();
  const report = generateReport(tableUsage);
  
  // Save report to file
  const reportPath = path.join(__dirname, '../database-analysis-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);
  
  return report;
}

if (require.main === module) {
  main();
}

module.exports = { analyzeTableUsage, generateReport };

