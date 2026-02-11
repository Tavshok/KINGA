#!/usr/bin/env tsx
/**
 * Tenant Provisioning CLI Tool
 * 
 * Automates the onboarding of new insurer tenants to the KINGA platform.
 * 
 * Usage:
 *   pnpm tsx scripts/tenant-onboarding/cli.ts --name "Acme Insurance" --email "admin@acme.com" --tier "tier-professional"
 */

import { Command } from 'commander';
import { provisionDatabase } from './provision-database';
import { provisionAnalytics } from './provision-analytics';
import { provisionStorage } from './provision-storage';
import { provisionEncryption } from './provision-encryption';

const program = new Command();

program
  .name('tenant-onboarding')
  .description('Provision a new tenant on the KINGA platform')
  .requiredOption('--name <name>', 'Tenant name (e.g., "acme-insurance")')
  .requiredOption('--display-name <displayName>', 'Display name (e.g., "Acme Insurance")')
  .requiredOption('--email <email>', 'Contact email')
  .option('--tier <tier>', 'Subscription tier (tier-basic, tier-professional, tier-enterprise)', 'tier-basic')
  .option('--contact-name <contactName>', 'Contact person name')
  .option('--contact-phone <contactPhone>', 'Contact phone number')
  .option('--billing-email <billingEmail>', 'Billing email (defaults to contact email)')
  .action(async (options) => {
    console.log('🚀 Starting tenant provisioning...\n');
    console.log(`Tenant: ${options.displayName} (${options.name})`);
    console.log(`Tier: ${options.tier}`);
    console.log(`Contact: ${options.email}\n`);

    try {
      // Step 1: Provision database schema and tenant record
      console.log('📊 Step 1/4: Provisioning database schema...');
      const tenantId = await provisionDatabase({
        name: options.name,
        displayName: options.displayName,
        tier: options.tier,
        contactEmail: options.email,
        contactName: options.contactName,
        contactPhone: options.contactPhone,
        billingEmail: options.billingEmail || options.email,
      });
      console.log(`✅ Database provisioned. Tenant ID: ${tenantId}\n`);

      // Step 2: Provision analytics instance
      console.log('📈 Step 2/4: Provisioning analytics instance...');
      await provisionAnalytics(tenantId);
      console.log(`✅ Analytics instance provisioned\n`);

      // Step 3: Provision storage buckets
      console.log('💾 Step 3/4: Provisioning storage buckets...');
      await provisionStorage(tenantId);
      console.log(`✅ Storage buckets provisioned\n`);

      // Step 4: Provision encryption keys
      console.log('🔐 Step 4/4: Provisioning encryption keys...');
      const encryptionKeyId = await provisionEncryption(tenantId);
      console.log(`✅ Encryption keys provisioned. Key ID: ${encryptionKeyId}\n`);

      console.log('🎉 Tenant provisioning complete!');
      console.log(`\nTenant ID: ${tenantId}`);
      console.log(`Encryption Key ID: ${encryptionKeyId}`);
      console.log(`\nNext steps:`);
      console.log(`1. Create the first admin user for this tenant`);
      console.log(`2. Configure tenant-specific settings in the admin portal`);
      console.log(`3. Test tenant isolation by logging in as the admin user`);
    } catch (error) {
      console.error('\n❌ Provisioning failed:', error);
      process.exit(1);
    }
  });

program.parse();
