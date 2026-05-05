/**
 * Fix remaining FK constraint failures:
 * 1. Clean orphaned rows in tables that still have invalid claim_ids
 * 2. Fix type mismatch on governance_audit_log.claim_id
 * 3. Retry all failed FK constraints
 */
const mysql = require('../node_modules/mysql2/promise');

// Tables that failed due to orphaned data (CASCADE group)
const FAILED_CASCADE = [
  'assessor_evaluations',
  'repair_history',
  'driver_claims',
];

// Tables that failed due to orphaned data (SET NULL group)
const FAILED_SET_NULL = [
  'model_training_queue',
  'claim_intelligence_dataset',
  'claim_features',
  'cost_learning_records',
  'usage_events',
  'assessor_marketplace_reviews',
  'vehicle_market_valuations',
  'vehicle_damage_history',
];

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [dbRows] = await conn.execute('SELECT DATABASE() as db');
  const DB = dbRows[0].db;

  console.log('=== Step 1: Clean remaining orphans ===');
  const allOrphanTables = [...FAILED_CASCADE, ...FAILED_SET_NULL];
  for (const table of allOrphanTables) {
    try {
      const [[before]] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE claim_id NOT IN (SELECT id FROM claims) AND claim_id IS NOT NULL`
      );
      if (before.cnt > 0) {
        const [r] = await conn.execute(
          `DELETE FROM \`${table}\` WHERE claim_id NOT IN (SELECT id FROM claims) AND claim_id IS NOT NULL`
        );
        console.log(`  Cleaned ${r.affectedRows} orphans from ${table}`);
      } else {
        console.log(`  ${table}: no orphans`);
      }
    } catch (e) {
      console.log(`  ERR cleaning ${table}: ${e.message}`);
    }
  }

  console.log('\n=== Step 2: Fix governance_audit_log type mismatch ===');
  try {
    // Check the actual column type
    const [cols] = await conn.execute(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'governance_audit_log' AND COLUMN_NAME = 'claim_id'
    `, [DB]);
    if (cols.length > 0) {
      console.log(`  Current type: ${cols[0].COLUMN_TYPE}`);
      // Check claims.id type
      const [idCols] = await conn.execute(`
        SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'claims' AND COLUMN_NAME = 'id'
      `, [DB]);
      console.log(`  claims.id type: ${idCols[0]?.COLUMN_TYPE}`);
      // Alter to match
      await conn.execute(`ALTER TABLE governance_audit_log MODIFY COLUMN claim_id ${idCols[0]?.COLUMN_TYPE} NULL`);
      console.log(`  Fixed: governance_audit_log.claim_id → ${idCols[0]?.COLUMN_TYPE} NULL`);
    }
  } catch (e) {
    console.log(`  ERR: ${e.message}`);
  }

  console.log('\n=== Step 3: Retry failed CASCADE FKs ===');
  for (const table of FAILED_CASCADE) {
    try {
      // Drop any partial FK first
      const [existingFks] = await conn.execute(`
        SELECT kcu.CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ? AND kcu.COLUMN_NAME = 'claim_id'
      `, [DB, table]);
      for (const fk of existingFks) {
        await conn.execute(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
      }
      await conn.execute(`
        ALTER TABLE \`${table}\`
        ADD CONSTRAINT \`fk_${table}_claim_id\`
        FOREIGN KEY (claim_id) REFERENCES claims(id)
        ON DELETE CASCADE ON UPDATE CASCADE
      `);
      console.log(`  ✓ ${table} → CASCADE`);
    } catch (e) {
      console.log(`  ✗ ${table}: ${e.message}`);
    }
  }

  console.log('\n=== Step 4: Retry failed SET NULL FKs ===');
  for (const table of FAILED_SET_NULL) {
    try {
      // Drop any partial FK first
      const [existingFks] = await conn.execute(`
        SELECT kcu.CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ? AND kcu.COLUMN_NAME = 'claim_id'
      `, [DB, table]);
      for (const fk of existingFks) {
        await conn.execute(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
      }
      // Ensure nullable
      const [cols] = await conn.execute(`
        SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'claim_id'
      `, [DB, table]);
      if (cols[0]?.IS_NULLABLE === 'NO') {
        await conn.execute(`ALTER TABLE \`${table}\` MODIFY COLUMN claim_id ${cols[0].COLUMN_TYPE} NULL`);
      }
      await conn.execute(`
        ALTER TABLE \`${table}\`
        ADD CONSTRAINT \`fk_${table}_claim_id\`
        FOREIGN KEY (claim_id) REFERENCES claims(id)
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
      console.log(`  ✓ ${table} → SET NULL`);
    } catch (e) {
      console.log(`  ✗ ${table}: ${e.message}`);
    }
  }

  console.log('\n=== Step 5: Retry governance_audit_log CASCADE ===');
  try {
    const [existingFks] = await conn.execute(`
      SELECT kcu.CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE kcu
      JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
      WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = 'governance_audit_log' AND kcu.COLUMN_NAME = 'claim_id'
    `, [DB]);
    for (const fk of existingFks) {
      await conn.execute(`ALTER TABLE governance_audit_log DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
    }
    await conn.execute(`
      ALTER TABLE governance_audit_log
      ADD CONSTRAINT fk_governance_audit_log_claim_id
      FOREIGN KEY (claim_id) REFERENCES claims(id)
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log('  ✓ governance_audit_log → CASCADE');
  } catch (e) {
    console.log(`  ✗ governance_audit_log: ${e.message}`);
  }

  // Final count
  const [finalFks] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
    WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME = 'claims'
  `, [DB]);
  console.log(`\n=== Total FK constraints on claims: ${finalFks[0].cnt} ===`);

  await conn.end();
})().catch(e => console.error('FATAL:', e.message));
