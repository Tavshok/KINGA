import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get the claim id first
const [claimRows] = await conn.execute(
  'SELECT id FROM claims WHERE claim_number = ? LIMIT 1',
  ['DOC-20260506-6A7A075E']
);
if (!claimRows[0]) { console.log('No claim found'); await conn.end(); process.exit(0); }
const claimId = claimRows[0].id;
console.log('claimId:', claimId);

// Get the ai_assessment record using actual column names
const [aRows] = await conn.execute(
  `SELECT 
    cost_intelligence_json,
    benchmark_bundle_json,
    physics_analysis,
    fraud_score_breakdown_json,
    fraud_indicators,
    fraud_risk_level,
    fraud_score,
    damaged_components_json,
    consistency_check_json,
    claim_record_json,
    pipeline_run_summary,
    fcdi_score,
    structural_damage_severity,
    estimated_cost,
    estimated_vehicle_value,
    repair_to_value_ratio,
    parts_reconciliation_json,
    evidence_bundle_json,
    realism_bundle_json
  FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1`,
  [claimId]
);

if (!aRows[0]) { console.log('No ai_assessment found for claimId', claimId); await conn.end(); process.exit(0); }
const a = aRows[0];

console.log('\n=== COST INTELLIGENCE ===');
const costIntel = a.cost_intelligence_json ? JSON.parse(a.cost_intelligence_json) : null;
console.log('costIntel keys:', costIntel ? Object.keys(costIntel) : 'NULL');
console.log('estimatedCostUsd:', costIntel?.estimatedCostUsd ?? costIntel?.totalEstimatedCost);
console.log('marketValueUsd:', costIntel?.marketValueUsd);
console.log('learningBenchmark:', JSON.stringify(costIntel?.learningBenchmark, null, 2));
console.log('estimated_cost (column):', a.estimated_cost);
console.log('estimated_vehicle_value (column):', a.estimated_vehicle_value);

console.log('\n=== BENCHMARK BUNDLE ===');
const benchmark = a.benchmark_bundle_json ? JSON.parse(a.benchmark_bundle_json) : null;
console.log('benchmark keys:', benchmark ? Object.keys(benchmark) : 'NULL');
if (benchmark) {
  console.log('estimatedCostUsd:', benchmark?.estimatedCostUsd);
  console.log('fairRangeMinUsd:', benchmark?.fairRangeMinUsd);
  console.log('fairRangeMaxUsd:', benchmark?.fairRangeMaxUsd);
  console.log('full:', JSON.stringify(benchmark, null, 2).slice(0, 600));
}

console.log('\n=== PHYSICS ===');
const phys = a.physics_analysis ? JSON.parse(a.physics_analysis) : null;
console.log('physics keys:', phys ? Object.keys(phys) : 'NULL');
console.log('damageZones:', JSON.stringify(phys?.damageZones ?? phys?.damage_zones)?.slice(0, 400));
console.log('incidentType:', phys?.incidentType ?? phys?.incident_type);
console.log('deltaV:', phys?.deltaV ?? phys?.delta_v);
console.log('energyKj:', phys?.energyKj ?? phys?.energy_kj);
console.log('velocityRange:', JSON.stringify(phys?.velocityRange ?? phys?.velocity_range ?? phys?.physicsNumerical?.velocity_range));
console.log('speedEnsemble:', JSON.stringify(phys?.speedEnsemble ?? phys?.speed_ensemble)?.slice(0, 300));

console.log('\n=== FRAUD ===');
const fraudBreakdown = a.fraud_score_breakdown_json ? JSON.parse(a.fraud_score_breakdown_json) : null;
console.log('fraudScoreBreakdown keys:', fraudBreakdown ? Object.keys(fraudBreakdown) : 'NULL');
console.log('fraudScore (breakdown.totalScore):', fraudBreakdown?.totalScore ?? fraudBreakdown?.score);
console.log('fraudScore (column):', a.fraud_score);
console.log('fraudRiskLevel (column):', a.fraud_risk_level);
if (fraudBreakdown?.indicators) {
  console.log('indicators:', JSON.stringify(fraudBreakdown.indicators, null, 2).slice(0, 600));
}

console.log('\n=== SEVERITY ===');
console.log('structural_damage_severity (column):', a.structural_damage_severity);
const claimRecord = a.claim_record_json ? JSON.parse(a.claim_record_json) : null;
console.log('claimRecord.overallSeverity:', claimRecord?.overallSeverity ?? claimRecord?.overall_severity);
const consistencyCheck = a.consistency_check_json ? JSON.parse(a.consistency_check_json) : null;
console.log('consistencyCheck.severityConsensus:', consistencyCheck?.severityConsensus ?? consistencyCheck?.severity_consensus);

console.log('\n=== REPAIR TO VALUE ===');
console.log('repair_to_value_ratio (column):', a.repair_to_value_ratio);
console.log('estimated_cost (column):', a.estimated_cost);
console.log('estimated_vehicle_value (column):', a.estimated_vehicle_value);

console.log('\n=== PARTS RECONCILIATION ===');
const partsRecon = a.parts_reconciliation_json ? JSON.parse(a.parts_reconciliation_json) : null;
console.log('partsRecon type:', Array.isArray(partsRecon) ? 'array[' + partsRecon.length + ']' : typeof partsRecon);
if (Array.isArray(partsRecon) && partsRecon[0]) console.log('partsRecon[0]:', JSON.stringify(partsRecon[0], null, 2));

await conn.end();
