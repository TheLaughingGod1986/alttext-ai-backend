/**
 * Quick script to verify password_reset_tokens table exists
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkTable() {
  try {
    // Try to query the table - if it exists, this will work
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'password_reset_tokens'
      );
    `;
    
    const exists = result[0]?.exists;
    
    if (exists) {
      console.log('✅ password_reset_tokens table EXISTS in database');
      
      // Also check table structure
      const columns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'password_reset_tokens'
        ORDER BY ordinal_position;
      `;
      
      console.log('\n📋 Table Structure:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
      
      // Check if there are any tokens
      const count = await prisma.passwordResetToken.count();
      console.log(`\n📊 Current tokens in table: ${count}`);
      
    } else {
      console.log('❌ password_reset_tokens table DOES NOT EXIST');
      console.log('⚠️  You need to run: npx prisma db push');
    }
  } catch (error) {
    console.error('❌ Error checking table:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTable();

