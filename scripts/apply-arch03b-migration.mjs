/**
 * ARCH-03b: Apply fraud_risk_level enum migration directly
 * Adds 'moderate' to the enum in all 5 affected tables.
 */
import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(url);

const statements = [
  `ALTER TABLE \`ai_assessments\` MODIFY COLUMN \`fraud_risk_level\` ENUM('low','medium','moderate','high','critical','elevated')`,
  `ALTER TABLE \`assessor_evaluations\` MODIFY COLUMN \`fraud_risk_level\` ENUM('low','medium','moderate','high')`,
  `ALTER TABLE \`claims\` MODIFY COLUMN \`fraud_risk_level\` ENUM('low','medium','moderate','high')`,
  `ALTER TABLE \`fraud_indicators\` MODIFY COLUMN \`fraud_risk_level\` ENUM('low','medium','moderate','high','critical','elevated') NOT NULL`,
  `ALTER TABLE \`historical_replay_results\` MODIFY COLUMN \`fraud_risk_level\` ENUM('none','low','medium','moderate','high','critical','elevated')`,
];

let success = 0;
let skipped = 0;

for (const sql of statements) {
  const tableName = sql.match(/ALTER TABLE `(\w+)`/)?.[1] ?? 'unknown';
  try {
    await conn.execute(sql);
    console.log(`✓ ${tableName}: enum updated`);
    success++;
  } catch (err) {
    if (err.message?.includes("Duplicate column name") || err.message?.includes("already exists")) {
      console.log(`~ ${tableName}: already has 'moderate' (skipped)`);
      skipped++;
    } else {
      console.error(`✗ ${tableName}: ${err.message}`);
      await conn.end();
      process.exit(1);
    }
  }
}

// Verify the enum now includes 'moderate' in ai_assessments
const [cols] = await conn.execute(`
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ai_assessments'
    AND COLUMN_NAME = 'fraud_risk_level'
`);
console.log(`\nVerification — ai_assessments.fraud_risk_level type: ${cols[0]?.COLUMN_TYPE}`);
const hasModerate = cols[0]?.COLUMN_TYPE?.includes('moderate');
console.log(hasModerate ? "✓ 'moderate' is now a valid enum value" : "✗ 'moderate' NOT found in enum — migration may have failed");

await conn.end();
console.log(`\nDone: ${success} altered, ${skipped} already up to date`);
if (!hasModerate) process.exit(1);
