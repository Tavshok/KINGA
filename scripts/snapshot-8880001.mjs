// Before-fix snapshot for LIVE-RUN-VOLTRON-001 (claim 8880001)
// Run: node scripts/snapshot-8880001.mjs
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load env from .env file if present, else rely on process.env
try { dotenv.config(); } catch {}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await createConnection(DATABASE_URL);

const [rows] = await conn.execute(
  `SELECT a.id, a.physics_analysis, a.fraud_score, a.estimated_cost, a.cost_intelligence_json
   FROM ai_assessments a
   JOIN claims c ON c.id = a.claim_id
   WHERE c.claim_number = '8880001'
   ORDER BY a.created_at DESC
   LIMIT 1`
);

if (!rows.length) {
  console.log('No assessment found for claim 8880001');
  await conn.end();
  process.exit(0);
}

const row = rows[0];
const pa = row.physics_analysis
  ? (typeof row.physics_analysis === 'string' ? JSON.parse(row.physics_analysis) : row.physics_analysis)
  : null;
const ci = row.cost_intelligence_json
  ? (typeof row.cost_intelligence_json === 'string' ? JSON.parse(row.cost_intelligence_json) : row.cost_intelligence_json)
  : null;

console.log('=== LIVE-RUN-VOLTRON-001 BEFORE-FIX SNAPSHOT ===');
console.log('--- Physics ---');
console.log('estimatedSpeedKmh          :', pa?.estimatedSpeedKmh ?? 'null');
console.log('decelerationG              :', pa?.decelerationG ?? 'null');
console.log('deltaVKmh                  :', pa?.deltaVKmh ?? 'null');
console.log('impactForceKn              :', pa?.impactForceKn ?? 'null');
console.log('kineticEnergyJ             :', pa?.energyDistribution?.kineticEnergyJ ?? 'null');
console.log('energyDissipatedKj         :', pa?.energyDistribution?.energyDissipatedKj ?? 'null');
console.log('--- Ensemble ---');
console.log('ensemble.consensusSpeedKmh :', pa?.speedInferenceEnsemble?.consensusSpeedKmh ?? 'null');
console.log('ensemble.overallConfidence :', pa?.speedInferenceEnsemble?.overallConfidence ?? 'null');
console.log('ensemble.methodsRan        :', pa?.speedInferenceEnsemble?.methodsRan ?? 'null');
console.log('--- Speed Forensics ---');
console.log('speedForensics.claimedSpeedKmh :', pa?.speedForensics?.claimedSpeedKmh ?? 'null');
console.log('speedForensics.physicsSpeedKmh :', pa?.speedForensics?.physicsSpeedKmh ?? 'null');
console.log('speedForensics.ensembleSpeedKmh:', pa?.speedForensics?.ensembleSpeedKmh ?? 'null');
console.log('speedForensics.deviationClass  :', pa?.speedForensics?.deviationClass ?? 'null');
console.log('speedForensics.deviationPct    :', pa?.speedForensics?.deviationPct ?? 'null');
console.log('--- VGR ---');
console.log('vgrReconciliation.consensusCrushDepthM:', pa?.vgrReconciliation?.consensusCrushDepthM ?? 'null');
console.log('vgrReconciliation.confidenceLevel     :', pa?.vgrReconciliation?.confidenceLevel ?? 'null');
console.log('--- Fraud ---');
console.log('fraudScore                 :', row.fraud_score ?? 'null');
console.log('--- Cost ---');
console.log('estimatedCost              :', row.estimated_cost ?? 'null');
console.log('costDecision.true_cost_usd :', ci?.costDecision?.true_cost_usd ?? 'null');
console.log('l2CompositeOptimisedCostUsd:', ci?.compositeOptimisation?.l2CompositeOptimisedCostUsd ?? 'null');
console.log('benchmarkCost              :', ci?.benchmarkCost ?? 'null');

await conn.end();
