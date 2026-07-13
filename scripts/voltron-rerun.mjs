/**
 * VOLTRON re-run script — verifies Stage 6 visionSourceReliability fix.
 *
 * Claim: VOLTRONMINECOR6002812 | claimId: 8880001 | assessmentId: 12930001
 *
 * Expected outcome after fix:
 *   - visionSourceReliability = 'MEDIUM' (was 'LOW' before fix)
 *   - Stage 6 log: "[P6] visionSourceReliability=MEDIUM: N PDF page(s) classified as damage_photo"
 *   - Stage 7 physics: crush depths from Stage 6 enter consensus at MEDIUM confidence
 *   - physicsStatus = 'COMPLETE' or 'PARTIAL' (not 'LOW_CONFIDENCE_EXCLUDED')
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── 1. Check current state of the VOLTRON assessment ─────────────────────────
const [before] = await conn.execute(`
  SELECT 
    id,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.physicsStatus')) as physics_status,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.estimatedSpeedKmh')) as speed_kmh,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.consensusSpeedKmh')) as consensus_speed,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.visionSourceReliability')) as vision_reliability,
    JSON_UNQUOTE(JSON_EXTRACT(physics_analysis, '$.crushDepthConsensus')) as crush_consensus,
    LEFT(pipeline_log, 2000) as log_preview
  FROM ai_assessments WHERE id = 12930001
`);

console.log('\n=== VOLTRON BEFORE RE-RUN ===');
console.log('physicsStatus:', before[0]?.physics_status);
console.log('estimatedSpeedKmh:', before[0]?.speed_kmh);
console.log('consensusSpeedKmh:', before[0]?.consensus_speed);
console.log('visionSourceReliability (in physics):', before[0]?.vision_reliability);
console.log('crushDepthConsensus:', before[0]?.crush_consensus);

// ── 2. Check the pipeline log for Stage 6 P6 entries ─────────────────────────
const [logRow] = await conn.execute(`
  SELECT pipeline_log FROM ai_assessments WHERE id = 12930001
`);

if (logRow[0]?.pipeline_log) {
  const log = logRow[0].pipeline_log;
  const p6Lines = log.split('\n').filter(l => l.includes('[P6]') || l.includes('visionSourceReliability') || l.includes('ImageIntelligence'));
  console.log('\n=== Stage 6 P6 / ImageIntelligence log lines (BEFORE) ===');
  if (p6Lines.length > 0) {
    p6Lines.forEach(l => console.log(' ', l.trim()));
  } else {
    console.log('  (none found — log may be truncated or stored differently)');
    // Try to find any Stage 6 lines
    const s6Lines = log.split('\n').filter(l => l.includes('Stage 6') || l.includes('stage-6')).slice(0, 10);
    console.log('Stage 6 lines found:', s6Lines.length);
    s6Lines.forEach(l => console.log(' ', l.trim()));
  }
}

// ── 3. Trigger the re-run via the API ─────────────────────────────────────────
console.log('\n=== TRIGGERING VOLTRON RE-RUN ===');
console.log('Calling /api/trpc/claims.rerunAssessment for claimId=8880001...');

try {
  const response = await fetch('http://localhost:3000/api/trpc/claims.rerunAssessment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { claimId: 8880001, forceRerun: true } }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.log('API response status:', response.status);
    console.log('API response:', text.slice(0, 500));
  } else {
    const data = await response.json();
    console.log('Re-run triggered:', JSON.stringify(data).slice(0, 300));
  }
} catch (err) {
  console.log('API call failed:', err.message);
  console.log('(Will check DB directly for pipeline_log changes)');
}

await conn.end();
console.log('\nDone. Run this script again after 60-90s to check the updated pipeline_log for [P6] lines.');
