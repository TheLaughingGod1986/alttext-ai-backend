const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  try {
    // Find user with email from screenshot
    const user = await prisma.user.findFirst({
      where: { email: 'benoats@gmail.com' },
      select: {
        id: true,
        email: true,
        plan: true,
        tokensRemaining: true,
        resetDate: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (user) {
      console.log('User found:');
      console.log(JSON.stringify(user, null, 2));
      console.log('\nCurrent date:', new Date().toISOString());
      console.log('Reset date:', user.resetDate);
      console.log('Reset date has passed:', new Date(user.resetDate) < new Date());
    } else {
      console.log('User not found');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
  }
}

checkUser();
