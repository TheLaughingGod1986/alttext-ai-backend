/**
 * Quick database connection test
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('Testing database connection...');

    // Test connection by counting users
    const userCount = await prisma.user.count();
    console.log(`✅ Database connected successfully!`);
    console.log(`   Total users: ${userCount}`);

    // List all users (limited info)
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        plan: true,
        tokensRemaining: true,
        credits: true,
        createdAt: true
      },
      take: 5
    });

    if (users.length > 0) {
      console.log('\n📋 Sample users:');
      users.forEach(user => {
        console.log(`   - ${user.email} (${user.plan}) - ${user.tokensRemaining} tokens, ${user.credits} credits`);
      });
    } else {
      console.log('\n📋 No users in database yet');
    }

  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
