/**
 * VOLTRON re-run script — verifies TRE wiring and Stage 6 visionSourceReliability fix.
 *
 * Claim: VOLTRONMINECOR6002812 | claimId: 8880001 | assessmentId: 12930001
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Check current state ────────────────────────────────────────────────────
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
console.log('\n=== VOLTRON CURRENT STATE ===');
console.log('physicsStatus:', row?.physics_status ?? 'N/A');
console.log('estimatedSpeedKmh (physics_analysis):', row?.speed_kmh ?? 'N/A');
console.log('visionSourceReliability (physics_analysis):', row?.vision_reliability ?? 'N/A');
console.log('');
console.log('=== TRE CTO FIELDS ===');
console.log('cto_status:', row?.cto_status ?? 'N/A');
console.log('cto_decision:', row?.cto_decision ?? 'N/A');
console.log('cto_completeness:', row?.cto_completeness ?? 'N/A');
console.log('cto_speed:', row?.cto_speed ?? 'N/A');
console.log('cto_claim_age_days:', row?.cto_claim_age_days ?? 'N/A');
console.log('cto_turnaround_days:', row?.cto_turnaround_days ?? 'N/A');

// ── 2. Trigger re-run ─────────────────────────────────────────────────────────
console.log('\n=== TRIGGERING VOLTRON RE-RUN ===');
try {
  const response = await fetch('http://localhost:3000/api/trpc/claims.triggerAiAssessment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': '' },
    body: JSON.stringify({ json: { claimId: 8880001, reason: 'VOLTRON TRE wiring verification re-run' } }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.log('API response status:', response.status);
    console.log('API response:', text.slice(0, 500));
  } else {
    const data = await response.json();
    console.log('Re-run triggered:', JSON.stringify(data).slice(0, 300));
    console.log('\nWaiting 90s for pipeline to complete...');
  }
} catch (err) {
  console.log('API call failed:', err.message);
}

await conn.end();
