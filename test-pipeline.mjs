/**
 * End-to-end pipeline test script.
 * Triggers the AI assessment for a given claim and monitors all stages.
 */
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';

// Load env
const envPath = '/home/ubuntu/kinga-replit/.env';
try {
  const { readFileSync } = await import('fs');
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
} catch(e) {}

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse MySQL URL: mysql://user:pass@host:port/db
const match = DB_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!match) {
  console.error('Cannot parse DATABASE_URL:', DB_URL.substring(0, 50));
  process.exit(1);
}
const [, user, password, host, port, database] = match;

const conn = await createConnection({ host, port: parseInt(port), user, password, database, ssl: { rejectUnauthorized: false } });

// Find AFX3048 claim
const [rows] = await conn.execute('SELECT id, claim_number, status, ai_assessment_completed, ai_assessment_status FROM claims WHERE claim_number = ? LIMIT 1', ['AFX3048']);
if (!rows.length) {
  // Try to find any claim with a source document
  const [anyRows] = await conn.execute('SELECT id, claim_number, status, ai_assessment_completed, source_document_id FROM claims WHERE source_document_id IS NOT NULL LIMIT 5');
  console.log('AFX3048 not found. Claims with source docs:');
  console.log(JSON.stringify(anyRows, null, 2));
  await conn.end();
  process.exit(0);
}

const claim = rows[0];
console.log('Found claim:', JSON.stringify(claim, null, 2));

// Check latest AI assessment
const [assessRows] = await conn.execute(
  'SELECT id, pipeline_execution_summary_json FROM ai_assessments WHERE claim_id = ? ORDER BY created_at DESC LIMIT 1',
  [claim.id]
);

if (assessRows.length) {
  const summary = JSON.parse(assessRows[0].pipeline_execution_summary_json || '{}');
  const stages = summary.stages || {};
  console.log('\n=== LAST PIPELINE EXECUTION SUMMARY ===');
  for (const [stageName, stageData] of Object.entries(stages)) {
    const s = stageData;
    const icon = s.status === 'success' ? '✅' : s.status === 'degraded' ? '⚠️' : s.status === 'skipped' ? '⏭️' : '❌';
    console.log(`${icon} ${stageName.padEnd(30)} ${s.status.padEnd(12)} ${s.durationMs ?? 0}ms ${s.error ? '| ERR: ' + s.error.substring(0, 60) : ''}`);
  }
  
  // Check for multi-event sequence
  const claimRecord = summary.claimRecord || summary._claimRecord;
  const mes = claimRecord?.accidentDetails?.multiEventSequence;
  console.log('\n=== MULTI-EVENT SEQUENCE ===');
  if (mes) {
    console.log(`is_multi_event: ${mes.is_multi_event}`);
    console.log(`events: ${mes.events?.length ?? 0}`);
    console.log(`summary: ${mes.sequence_summary}`);
    mes.events?.forEach((e, i) => console.log(`  Event ${i+1}: ${e.event_type} — ${e.description?.substring(0, 80)}`));
  } else {
    console.log('No multiEventSequence in stored claimRecord (claim needs re-run to get new field)');
  }
}

await conn.end();
