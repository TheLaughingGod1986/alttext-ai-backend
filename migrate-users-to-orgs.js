#!/usr/bin/env node
/**
 * Migration Script: Convert Existing Users to Organization Model
 *
 * This script:
 * 1. Creates a personal organization for each existing user
 * 2. Transfers user's plan, tokens, credits, and Stripe info to organization
 * 3. Links existing installations to the organization as sites
 * 4. Creates owner membership for the user in their organization
 * 5. Updates usage logs to reference the organization
 */

const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

async function migrateUsersToOrganizations() {
  console.log('Starting user-to-organization migration...\n');

  try {
    // Get all existing users
    const users = await prisma.user.findMany({
      include: {
        installations: true,
        usageLogs: true
      }
    });

    console.log(`Found ${users.length} users to migrate\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        console.log(`\nMigrating user #${user.id}: ${user.email}`);

        // Check if user already has an organization (in case script is run multiple times)
        const existingMembership = await prisma.organizationMember.findFirst({
          where: { userId: user.id, role: 'owner' }
        });

        if (existingMembership) {
          console.log(`  ⚠️  User already has organization (ID: ${existingMembership.organizationId}), skipping...`);
          continue;
        }

        // Create personal organization for this user
        const organization = await prisma.organization.create({
          data: {
            name: `${user.email}'s Organization`,
            licenseKey: randomUUID(),
            plan: user.plan,
            service: user.service,
            maxSites: user.plan === 'agency' ? 10 : 1,
            tokensRemaining: user.tokensRemaining,
            credits: user.credits,
            stripeCustomerId: user.stripeCustomerId,
            stripeSubscriptionId: user.stripeSubscriptionId,
            resetDate: user.resetDate
          }
        });

        console.log(`  ✓ Created organization #${organization.id}`);
        console.log(`  ✓ License key: ${organization.licenseKey}`);

        // Create owner membership
        await prisma.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: 'owner'
          }
        });

        console.log(`  ✓ Created owner membership`);

        // Migrate installations to sites
        if (user.installations.length > 0) {
          for (const installation of user.installations) {
            await prisma.site.create({
              data: {
                organizationId: organization.id,
                siteHash: installation.siteHash,
                siteUrl: null, // Will be populated on next plugin connection
                installId: installation.installId,
                isActive: true,
                firstSeen: installation.firstSeen,
                lastSeen: installation.lastSeen,
                pluginVersion: installation.pluginVersion,
                wordpressVersion: installation.wordpressVersion,
                phpVersion: installation.phpVersion,
                isMultisite: installation.isMultisite,
                metadata: installation.metadata || {}
              }
            });
          }
          console.log(`  ✓ Migrated ${user.installations.length} installation(s) to sites`);
        }

        // Update usage logs to reference the organization
        if (user.usageLogs.length > 0) {
          await prisma.usageLog.updateMany({
            where: { userId: user.id },
            data: { organizationId: organization.id }
          });
          console.log(`  ✓ Updated ${user.usageLogs.length} usage log(s)`);
        }

        successCount++;
        console.log(`  ✓ Successfully migrated user #${user.id}`);

      } catch (error) {
        errorCount++;
        console.error(`  ❌ Error migrating user #${user.id}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('Migration Summary:');
    console.log(`  Total users: ${users.length}`);
    console.log(`  Successfully migrated: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log('='.repeat(70) + '\n');

    // Display all organizations created
    const organizations = await prisma.organization.findMany({
      include: {
        members: {
          include: {
            user: {
              select: { email: true }
            }
          }
        },
        sites: true
      }
    });

    console.log('\nOrganizations created:');
    for (const org of organizations) {
      console.log(`\nOrganization #${org.id}:`);
      console.log(`  Name: ${org.name}`);
      console.log(`  Plan: ${org.plan}`);
      console.log(`  License Key: ${org.licenseKey}`);
      console.log(`  Max Sites: ${org.maxSites}`);
      console.log(`  Tokens Remaining: ${org.tokensRemaining}`);
      console.log(`  Owner: ${org.members.find(m => m.role === 'owner')?.user.email || 'N/A'}`);
      console.log(`  Sites: ${org.sites.length}`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateUsersToOrganizations()
  .then(() => {
    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
