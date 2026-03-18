/**
 * Full end-to-end engine verification for the real Toyota Fortuner claim (2130345)
 * Assessment ID: 1620015
 */
import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await db.execute(`
  SELECT 
    a.*,
    c.vehicle_make, c.vehicle_model, c.vehicle_year, c.vehicle_registration,
    c.source_document_id, c.damage_photos, c.document_processing_status,
    d.s3_url, d.original_filename
  FROM ai_assessments a
  JOIN claims c ON c.id = a.claim_id
  LEFT JOIN ingestion_documents d ON d.id = c.source_document_id
  WHERE a.claim_id = 2130345
  ORDER BY a.id DESC LIMIT 1
`);

if (!rows.length) {
  console.log('❌ NO ASSESSMENT FOUND for claim 2130345');
  await db.end();
  process.exit(1);
}

const a = rows[0];

// ─── LAYER 1: RAW ENGINE OUTPUTS ─────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('LAYER 1 — RAW ENGINE OUTPUTS');
console.log('══════════════════════════════════════════════════════════════\n');

const parseJson = (val, label) => {
  if (!val) { console.log(`  ❌ ${label}: NULL`); return null; }
  try { const parsed = JSON.parse(val); console.log(`  ✅ ${label}: ${JSON.stringify(parsed).slice(0, 120)}...`); return parsed; }
  catch { console.log(`  ❌ ${label}: INVALID JSON`); return null; }
};

console.log('── CLAIM RECORD ──');
console.log(`  claim_id: ${a.claim_id}`);
console.log(`  vehicle: ${a.vehicle_make} ${a.vehicle_model} ${a.vehicle_year}`);
console.log(`  registration: ${a.vehicle_registration}`);
console.log(`  source_document: ${a.original_filename || 'NULL'}`);
console.log(`  s3_url: ${a.s3_url ? '✅ present' : '❌ NULL'}`);

console.log('\n── AI VISION / DAMAGE ANALYSIS ──');
const damagedComponents = parseJson(a.damaged_components_json, 'damaged_components_json');
const damagePhotos = parseJson(a.damage_photos_json, 'damage_photos_json');
console.log(`  damage_description: ${a.damage_description ? '✅ ' + a.damage_description.slice(0, 80) : '❌ NULL'}`);
console.log(`  accident_type: ${a.accident_type || '❌ NULL'}`);
console.log(`  structural_damage: ${a.structural_damage ?? '❌ NULL'}`);
console.log(`  airbag_deployment: ${a.airbag_deployment ?? '❌ NULL'}`);

console.log('\n── PHYSICS ENGINE ──');
const physics = parseJson(a.physics_analysis, 'physics_analysis');
if (physics) {
  console.log(`  impactForceKn: ${physics.impactForceKn ?? '❌ missing'}`);
  console.log(`  estimatedSpeedKmh: ${physics.estimatedSpeedKmh ?? '❌ missing'}`);
  console.log(`  deltaVKmh: ${physics.deltaVKmh ?? '❌ missing'}`);
  console.log(`  accidentSeverity: ${physics.accidentSeverity ?? '❌ missing'}`);
  console.log(`  damageConsistencyScore: ${physics.damageConsistencyScore ?? '❌ missing'}`);
  console.log(`  physicsExecuted: ${physics.physicsExecuted ?? '❌ missing'}`);
  console.log(`  impactVector.direction: ${physics.impactVector?.direction ?? '❌ missing'}`);
  console.log(`  energyDistribution.energyDissipatedKj: ${physics.energyDistribution?.energyDissipatedKj ?? '❌ missing'}`);
}

console.log('\n── COST ENGINE ──');
const costIntelligence = parseJson(a.cost_intelligence_json, 'cost_intelligence_json');
console.log(`  estimated_cost (DB): ${a.estimated_cost ?? '❌ NULL'}`);
console.log(`  estimated_parts_cost: ${a.estimated_parts_cost ?? '❌ NULL'}`);
console.log(`  estimated_labor_cost: ${a.estimated_labor_cost ?? '❌ NULL'}`);
console.log(`  parts_cost (old): ${a.parts_cost ?? '❌ NULL'}`);
console.log(`  labor_cost (old): ${a.labor_cost ?? '❌ NULL'}`);
console.log(`  currency_code: ${a.currency_code || '❌ NULL'}`);

console.log('\n── REPAIR INTELLIGENCE ──');
const repairIntelligence = parseJson(a.repair_intelligence_json, 'repair_intelligence_json');

console.log('\n── PARTS RECONCILIATION ──');
const partsReconciliation = parseJson(a.parts_reconciliation_json, 'parts_reconciliation_json');

console.log('\n── FRAUD ENGINE ──');
const fraudBreakdown = parseJson(a.fraud_score_breakdown_json, 'fraud_score_breakdown_json');
console.log(`  fraud_risk_level: ${a.fraud_risk_level || '❌ NULL'}`);
console.log(`  fraud_indicators: ${a.fraud_indicators ? '✅ present' : '❌ NULL'}`);

console.log('\n── HIDDEN DAMAGES ──');
const hiddenDamages = parseJson(a.inferred_hidden_damages_json, 'inferred_hidden_damages_json');

console.log('\n── PIPELINE SUMMARY ──');
const pipelineSummary = parseJson(a.pipeline_run_summary, 'pipeline_run_summary');
if (pipelineSummary) {
  console.log(`  stages run: ${pipelineSummary.stagesRun?.join(', ') || 'unknown'}`);
  console.log(`  overall_status: ${pipelineSummary.overallStatus || 'unknown'}`);
  console.log(`  confidence: ${pipelineSummary.confidenceScore || 'unknown'}`);
}

// ─── LAYER 2: FIELD MAPPING VALIDATION ───────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('LAYER 2 — FIELD MAPPING VALIDATION (Backend → Frontend)');
console.log('══════════════════════════════════════════════════════════════\n');

const checks = [
  // Physics
  { backend: 'physics_analysis.impactForceKn', frontend: 'normalizedPhysics._raw.impactForce.magnitude', value: physics?.impactForceKn, issue: physics?.impactForceKn === 0 ? 'ZERO — shows as 0 kN, should show N/A' : null },
  { backend: 'physics_analysis.estimatedSpeedKmh', frontend: 'normalizedPhysics._raw.estimatedSpeed.value', value: physics?.estimatedSpeedKmh, issue: physics?.estimatedSpeedKmh === 0 ? 'ZERO — shows as 0 km/h, should show N/A' : null },
  { backend: 'physics_analysis.deltaVKmh', frontend: 'normalizedPhysics._raw.deltaV.value', value: physics?.deltaVKmh, issue: null },
  { backend: 'physics_analysis.energyDistribution.energyDissipatedKj', frontend: 'normalizedPhysics._raw.energy.kineticKj', value: physics?.energyDistribution?.energyDissipatedKj, issue: null },
  { backend: 'physics_analysis.impactVector.direction', frontend: 'normalizedPhysics._raw.impactVector.direction', value: physics?.impactVector?.direction, issue: null },
  // Cost
  { backend: 'estimated_cost (dollars)', frontend: 'formatCurrency(estimatedCost)', value: a.estimated_cost, issue: null },
  { backend: 'estimated_parts_cost', frontend: 'formatCurrency(partsEstimate)', value: a.estimated_parts_cost, issue: null },
  { backend: 'estimated_labor_cost', frontend: 'formatCurrency(labourEstimate)', value: a.estimated_labor_cost, issue: null },
  { backend: 'cost_intelligence_json', frontend: 'quoteOptimisationData', value: costIntelligence ? 'present' : null, issue: !costIntelligence ? 'NULL — QuoteOptimisationPanel will show no data' : null },
  // Damage
  { backend: 'damaged_components_json', frontend: 'VehicleDamageVisualization.zones', value: damagedComponents?.length ?? 0, issue: !damagedComponents?.length ? 'EMPTY — damage map will show no zones' : null },
  // Fraud
  { backend: 'fraud_score_breakdown_json', frontend: 'FraudScorePanel.breakdown', value: fraudBreakdown ? 'present' : null, issue: !fraudBreakdown ? 'NULL — FraudScorePanel will show no breakdown' : null },
  { backend: 'fraud_risk_level', frontend: 'fraudLevel badge', value: a.fraud_risk_level, issue: !a.fraud_risk_level ? 'NULL — fraud badge will not render' : null },
  // Repair
  { backend: 'repair_intelligence_json', frontend: 'RepairIntelligencePanel', value: repairIntelligence ? 'present' : null, issue: !repairIntelligence ? 'NULL — repair intelligence section will be empty' : null },
  { backend: 'parts_reconciliation_json', frontend: 'PartsReconciliationTable', value: partsReconciliation ? 'present' : null, issue: !partsReconciliation ? 'NULL — parts reconciliation table will be empty' : null },
];

for (const c of checks) {
  const status = c.issue ? '⚠️  ISSUE' : '✅ OK   ';
  console.log(`  ${status} | ${c.backend.padEnd(50)} → ${c.frontend}`);
  if (c.issue) console.log(`           └─ ${c.issue}`);
}

// ─── LAYER 3: UI RENDER CHECK ─────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('LAYER 3 — UI RENDER CHECK');
console.log('══════════════════════════════════════════════════════════════\n');

const renderChecks = [
  { panel: 'DAMAGE PANEL', check: 'Damage zones present', result: (damagedComponents?.length ?? 0) > 0 },
  { panel: 'PHYSICS PANEL', check: 'velocity visible (non-zero)', result: (physics?.estimatedSpeedKmh ?? 0) > 0 },
  { panel: 'PHYSICS PANEL', check: 'force visible (non-zero)', result: (physics?.impactForceKn ?? 0) > 0 },
  { panel: 'PHYSICS PANEL', check: 'energy visible (non-zero)', result: (physics?.energyDistribution?.energyDissipatedKj ?? 0) > 0 },
  { panel: 'PHYSICS PANEL', check: 'delta-V visible (non-zero)', result: (physics?.deltaVKmh ?? 0) > 0 },
  { panel: 'VECTOR DIAGRAM', check: 'direction available', result: !!physics?.impactVector?.direction },
  { panel: 'COST PANEL', check: 'AI estimate present', result: (a.estimated_cost ?? 0) > 0 },
  { panel: 'COST PANEL', check: 'cost intelligence JSON present', result: !!costIntelligence },
  { panel: 'FRAUD PANEL', check: 'fraud score rendered', result: !!a.fraud_risk_level },
  { panel: 'FRAUD PANEL', check: 'fraud breakdown present', result: !!fraudBreakdown },
  { panel: 'REPAIR PANEL', check: 'repair intelligence present', result: !!repairIntelligence },
  { panel: 'PARTS PANEL', check: 'parts reconciliation present', result: !!partsReconciliation },
];

for (const r of renderChecks) {
  console.log(`  ${r.result ? '✅ YES' : '❌ NO '} | [${r.panel}] ${r.check}`);
}

// ─── FINAL VERDICT ────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('FINAL VERDICT');
console.log('══════════════════════════════════════════════════════════════\n');

const failures = renderChecks.filter(r => !r.result);
const issues = checks.filter(c => c.issue);

if (failures.length === 0 && issues.length === 0) {
  console.log('  🟢 FULLY WORKING — All engines producing output, all fields mapped correctly');
} else if (failures.length <= 3) {
  console.log('  🟡 PARTIALLY WORKING — Most engines working, some fields missing or zero');
} else {
  console.log('  🔴 BROKEN — Multiple critical engines failing');
}

console.log(`\n  Failures: ${failures.length}/${renderChecks.length} render checks failed`);
console.log(`  Mapping issues: ${issues.length}/${checks.length} field mappings have issues`);

if (failures.length > 0) {
  console.log('\n  Failed render checks:');
  for (const f of failures) {
    console.log(`    ❌ [${f.panel}] ${f.check}`);
  }
}

if (issues.length > 0) {
  console.log('\n  Mapping issues:');
  for (const i of issues) {
    console.log(`    ⚠️  ${i.backend}: ${i.issue}`);
  }
}

await db.end();
