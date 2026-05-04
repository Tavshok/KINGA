/**
 * Safe targeted migration: adds 4 tier columns to insurer_tenants.
 * Does NOT touch any other table. No data is dropped or renamed.
 */
import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await createConnection(url);

try {
  // Check which columns already exist to make this idempotent
  const [existing] = await conn.execute(
    `SHOW COLUMNS FROM insurer_tenants WHERE Field IN ('pricing_tier','monthly_platform_fee','per_claim_fee','tier_feature_flags')`
  );
  const existingNames = existing.map(r => r.Field);
  console.log('Columns already present:', existingNames.length > 0 ? existingNames.join(', ') : 'none');

  const toAdd = [];
  if (!existingNames.includes('pricing_tier'))
    toAdd.push(`ADD COLUMN pricing_tier ENUM('process','protect','prove') NOT NULL DEFAULT 'process' AFTER exchange_rate`);
  if (!existingNames.includes('monthly_platform_fee'))
    toAdd.push(`ADD COLUMN monthly_platform_fee DECIMAL(10,2) NOT NULL DEFAULT 900.00 AFTER pricing_tier`);
  if (!existingNames.includes('per_claim_fee'))
    toAdd.push(`ADD COLUMN per_claim_fee DECIMAL(8,2) NOT NULL DEFAULT 12.00 AFTER monthly_platform_fee`);
  if (!existingNames.includes('tier_feature_flags'))
    toAdd.push(`ADD COLUMN tier_feature_flags TEXT NULL AFTER per_claim_fee`);

  if (toAdd.length === 0) {
    console.log('All columns already exist — nothing to do.');
  } else {
    // Add columns one at a time to avoid forward-reference issues with AFTER
    for (const colDef of toAdd) {
      const sql = `ALTER TABLE insurer_tenants ${colDef}`;
      console.log('Running:', sql);
      await conn.execute(sql);
    }
    console.log(`Migration successful — ${toAdd.length} column(s) added.`);
  }

  // Verify final state
  const [final] = await conn.execute(
    `SHOW COLUMNS FROM insurer_tenants WHERE Field IN ('pricing_tier','monthly_platform_fee','per_claim_fee','tier_feature_flags')`
  );
  console.log('\nFinal column state:');
  final.forEach(r => console.log(` ✓ ${r.Field}  type=${r.Type}  default=${r.Default}`));

} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await conn.end();
}
