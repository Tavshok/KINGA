/**
 * Migration: Add ON DELETE CASCADE foreign key constraints
 * to all core claim-related tables.
 *
 * Group 1 – CASCADE (child data, no independent value)
 * Group 2 – SET NULL (analytics/ML data, retain even if claim deleted)
 */
const mysql = require('../node_modules/mysql2/promise');

// Tables that should CASCADE delete when a claim is deleted
const CASCADE_TABLES = [
  'ai_assessments',
  'claim_documents',
  'claim_events',
  'claim_approvals',
  'audit_trail',
  'panel_beater_quotes',
  'appointments',
  'fraud_alerts',
  'fraud_indicators',
  'generated_reports',
  'report_snapshots',
  'report_audit_log',
  'notifications',
  'approval_workflow',
  'workflow_states',
  'workflow_audit_trail',
  'claim_routing_decisions',
  'routing_history',
  'decision_snapshots',
  'adjuster_tasks',
  'adjuster_sign_offs',
  'police_reports',
  'pre_accident_damage',
  'third_party_vehicles',
  'vehicle_condition_assessment',
  'photo_reextraction_jobs',
  'fast_track_routing_log',
  'claim_confidence_scores',
  'claim_decision_lifecycle',
  'claim_involvement_tracking',
  'governance_audit_log',
  'governance_notifications',
  'benchmark_deviations',
  'assessor_evaluations',
  'repair_history',
  'component_repair_outcomes',
  'narrative_versions',
  'document_versions',
  'mismatch_annotations',
  'quote_optimisation_results',
  'insurer_quote_requests',
  'driver_claims',
  'policy_claim_links',
  'cross_claim_signals',
];

// Tables that should SET NULL (keep for analytics/ML training)
const SET_NULL_TABLES = [
  'model_training_queue',
  'claim_intelligence_dataset',
  'claim_features',
  'cost_learning_records',
  'entity_relationship_graph',
  'usage_events',
  'automation_audit_log',
  'admin_pipeline_regenerations',
  'admin_regen_requests',
  'replay_logs',
  'risk_register',
  'assessor_marketplace_reviews',
  'marketplace_transactions',
  'vehicle_market_valuations',
  'vehicle_damage_history',
];

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [dbRows] = await conn.execute('SELECT DATABASE() as db');
  const DB = dbRows[0].db;

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  async function applyFk(table, deleteRule) {
    try {
      // 1. Check column exists and is nullable (needed for SET NULL)
      const [cols] = await conn.execute(`
        SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'claim_id'
      `, [DB, table]);

      if (cols.length === 0) {
        console.log(`  SKIP  ${table} — no claim_id column`);
        skipCount++;
        return;
      }

      // 2. Drop any existing FK on claim_id for this table
      const [existingFks] = await conn.execute(`
        SELECT kcu.CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ?
          AND kcu.TABLE_NAME = ?
          AND kcu.COLUMN_NAME = 'claim_id'
          AND kcu.REFERENCED_TABLE_NAME = 'claims'
      `, [DB, table]);

      for (const fk of existingFks) {
        await conn.execute(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
        console.log(`  DROP  ${table}.${fk.CONSTRAINT_NAME}`);
      }

      // 3. For SET NULL, ensure column is nullable
      if (deleteRule === 'SET NULL') {
        const col = cols[0];
        if (col.IS_NULLABLE === 'NO') {
          await conn.execute(`ALTER TABLE \`${table}\` MODIFY COLUMN claim_id ${col.DATA_TYPE} NULL`);
          console.log(`  ALTER ${table}.claim_id → nullable`);
        }
      }

      // 4. Add the new FK constraint
      const constraintName = `fk_${table}_claim_id`;
      await conn.execute(`
        ALTER TABLE \`${table}\`
        ADD CONSTRAINT \`${constraintName}\`
        FOREIGN KEY (claim_id) REFERENCES claims(id)
        ON DELETE ${deleteRule}
        ON UPDATE CASCADE
      `);

      console.log(`  ✓ OK  ${table} → ON DELETE ${deleteRule}`);
      successCount++;
    } catch (err) {
      console.log(`  ✗ ERR ${table}: ${err.message}`);
      errorCount++;
    }
  }

  console.log('=== Adding ON DELETE CASCADE FKs ===');
  for (const table of CASCADE_TABLES) {
    await applyFk(table, 'CASCADE');
  }

  console.log('\n=== Adding ON DELETE SET NULL FKs ===');
  for (const table of SET_NULL_TABLES) {
    await applyFk(table, 'SET NULL');
  }

  console.log(`\n=== Done: ${successCount} applied, ${skipCount} skipped, ${errorCount} errors ===`);
  await conn.end();
})().catch(e => console.error('FATAL:', e.message));
