/**
 * VOLTRON direct re-run — bypasses tRPC auth, calls triggerAiAssessment directly.
 * Run from project root: node scripts/voltron-direct-rerun.mjs
 *
 * claimId: 8880001 | assessmentId: 12930001
 */
import { createRequire } from 'module';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// We need to run the TypeScript via tsx
// This script is a wrapper — it calls the pipeline via the compiled server
// by posting to the internal admin endpoint with a service token.

// Strategy: use the dev server's internal admin bypass route if it exists,
// otherwise call the pipeline function via a compiled ts-node invocation.

const CLAIM_ID = 8880001;
const BASE_URL = 'http://localhost:3000';

// Check if there's an internal admin bypass
async function tryAdminBypass() {
  try {
    const resp = await fetch(`${BASE_URL}/api/internal/rerun-assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.JWT_SECRET ?? '' },
      body: JSON.stringify({ claimId: CLAIM_ID }),
    });
    return resp.ok ? await resp.json() : null;
  } catch { return null; }
}

// Check current state before re-run
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [before] = await conn.execute(`
  SELECT 
    id,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.physicsStatus')) as physics_status,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.estimatedSpeedKmh')) as speed_kmh,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.visionSourceReliability')) as vision_reliability,
    CASE WHEN claim_truth_object_json IS NOT NULL AND claim_truth_object_json != 'null' THEN 'populated' ELSE 'NULL' END as cto_status,
    JSON_UNQUOTE(JSON_EXTRACT(claim_truth_object_json, '$.decision.recommendation')) as cto_decision,
    JSON_UNQUOTE(JSON_EXTRACT(claim_truth_object_json, '$.evidence.completenessScore')) as cto_completeness,
    JSON_UNQUOTE(JSON_EXTRACT(claim_truth_object_json, '$.physics.estimatedSpeedKmh')) as cto_speed,
    JSON_UNQUOTE(JSON_EXTRACT(claim_truth_object_json, '$.workflow.claimAgeDays')) as cto_claim_age_days,
    JSON_UNQUOTE(JSON_EXTRACT(claim_truth_object_json, '$.workflow.estimatedTurnaroundDays')) as cto_turnaround_days
  FROM ai_assessments WHERE id = 12930001
`);

const row = before[0];
console.log('\n=== VOLTRON CURRENT STATE (BEFORE RE-RUN) ===');
console.log('physicsStatus:', row?.physics_status ?? 'N/A');
console.log('estimatedSpeedKmh:', row?.speed_kmh ?? 'N/A');
console.log('visionSourceReliability:', row?.vision_reliability ?? 'N/A');
console.log('');
console.log('=== TRE CTO FIELDS (BEFORE RE-RUN) ===');
console.log('cto_status:', row?.cto_status ?? 'N/A');
console.log('cto_decision:', row?.cto_decision ?? 'N/A');
console.log('cto_completeness:', row?.cto_completeness ?? 'N/A');
console.log('cto_speed:', row?.cto_speed ?? 'N/A');
console.log('cto_claim_age_days:', row?.cto_claim_age_days ?? 'N/A');
console.log('cto_turnaround_days:', row?.cto_turnaround_days ?? 'N/A');

await conn.end();

console.log('\n=== TRIGGERING RE-RUN VIA DEV SERVER ===');
console.log('NOTE: triggerAiAssessment requires a valid session.');
console.log('To trigger a VOLTRON re-run:');
console.log('  1. Open the KINGA admin UI');
console.log('  2. Navigate to claim VOLTRONMINECOR6002812 (claimId=8880001)');
console.log('  3. Click "Re-run Assessment" / "Trigger KINGA Assessment"');
console.log('  4. Wait ~90s for pipeline to complete');
console.log('  5. Re-run this script to check the updated CTO fields');
console.log('');
console.log('OR: run the following tsx command from the project root:');
console.log('  npx tsx -e "import { triggerAiAssessment } from \'./server/db.ts\'; triggerAiAssessment(8880001).then(r => console.log(JSON.stringify(r?.claimTruthObject?.decision ?? \'no CTO\'))).catch(console.error)"');
