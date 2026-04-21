import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

// Parse the DATABASE_URL
const url = new URL(dbUrl);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// Check which columns exist in ai_assessments
const [cols] = await conn.execute(`SHOW COLUMNS FROM ai_assessments`);
const existingCols = new Set(cols.map(c => c.Field));
console.log('Existing columns count:', existingCols.size);

// Columns that should exist per schema but might be missing
const needed = [
  { name: 'enriched_photos_json', sql: 'LONGTEXT' },
  { name: 'photo_inconsistencies_json', sql: 'LONGTEXT' },
  { name: 'consistency_check_json', sql: 'LONGTEXT' },
  { name: 'coherence_result_json', sql: 'LONGTEXT' },
  { name: 'cost_realism_json', sql: 'LONGTEXT' },
  { name: 'constraint_overrides_json', sql: 'LONGTEXT' },
  { name: 'contradiction_gate_json', sql: 'LONGTEXT' },
  { name: 'explanation_json', sql: 'LONGTEXT' },
  { name: 'escalation_route_json', sql: 'LONGTEXT' },
  { name: 'decision_trace_json', sql: 'LONGTEXT' },
  { name: 'stage2_raw_ocr_text', sql: 'LONGTEXT' },
  { name: 'claim_record_json', sql: 'LONGTEXT' },
  { name: 'narrative_analysis_json', sql: 'LONGTEXT' },
  { name: 'image_analysis_total_count', sql: 'INT DEFAULT 0' },
  { name: 'image_analysis_success_count', sql: 'INT DEFAULT 0' },
  { name: 'image_analysis_failed_count', sql: 'INT DEFAULT 0' },
  { name: 'image_analysis_success_rate', sql: 'INT' },
  { name: 'fcdi_score', sql: 'INT' },
  { name: 'forensic_execution_ledger_json', sql: 'LONGTEXT' },
  { name: 'assumption_registry_json', sql: 'LONGTEXT' },
  { name: 'economic_context_json', sql: 'LONGTEXT' },
  { name: 'ife_result_json', sql: 'LONGTEXT' },
  { name: 'doe_result_json', sql: 'LONGTEXT' },
  { name: 'fel_version_snapshot_json', sql: 'LONGTEXT' },
  { name: 'claim_quality_json', sql: 'LONGTEXT' },
  { name: 'forensic_audit_validation_json', sql: 'LONGTEXT' },
  { name: 'decision_authority_json', sql: 'LONGTEXT' },
  { name: 'report_readiness_json', sql: 'LONGTEXT' },
  { name: 'causal_chain_json', sql: 'LONGTEXT' },
  { name: 'evidence_bundle_json', sql: 'LONGTEXT' },
  { name: 'realism_bundle_json', sql: 'LONGTEXT' },
  { name: 'benchmark_bundle_json', sql: 'LONGTEXT' },
  { name: 'consensus_result_json', sql: 'LONGTEXT' },
  { name: 'causal_verdict_json', sql: 'LONGTEXT' },
  { name: 'validated_outcome_json', sql: 'LONGTEXT' },
  { name: 'case_signature_json', sql: 'LONGTEXT' },
];

let added = 0;
for (const col of needed) {
  if (!existingCols.has(col.name)) {
    console.log(`Adding column: ${col.name}`);
    await conn.execute(`ALTER TABLE ai_assessments ADD COLUMN \`${col.name}\` ${col.sql}`);
    added++;
  } else {
    console.log(`Column exists: ${col.name}`);
  }
}

console.log(`\nDone. Added ${added} missing columns.`);
await conn.end();
