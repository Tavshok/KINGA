/**
 * END-TO-END ENGINE VERIFICATION SCRIPT (corrected column names)
 */
import mysql from "mysql2/promise";

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Get the most recent claim with a completed AI assessment ───────────────
const [claims] = await db.execute(`
  SELECT c.id, c.status, c.vehicle_make, c.vehicle_model, c.vehicle_year,
         c.vehicle_registration, c.incident_type, c.incident_date,
         c.estimated_claim_value, c.fraud_risk_score, c.fraud_risk_level
  FROM claims c
  WHERE c.status IN ('assessment_complete','quotes_received','approved','rejected','in_repair','completed')
  ORDER BY c.id DESC LIMIT 1
`);

if (!claims.length) {
  // Try any claim with an assessment
  const [anyClaims] = await db.execute(`SELECT c.id, c.status FROM claims c ORDER BY c.id DESC LIMIT 5`);
  console.log("No completed claims. Latest 5 claims:", anyClaims);
  process.exit(1);
}
const claim = claims[0];
console.log("\n═══════════════════════════════════════════════════════════");
console.log("CLAIM UNDER TEST:", JSON.stringify(claim, null, 2));
console.log("═══════════════════════════════════════════════════════════\n");

// ─── Pull AI Assessment ───────────────────────────────────────────────────────
const [assessments] = await db.execute(
  `SELECT * FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 1`,
  [claim.id]
);
const a = assessments[0] || null;

if (!a) {
  console.log("❌ NO AI ASSESSMENT FOUND FOR CLAIM", claim.id);
  process.exit(1);
}

// ─── Parse JSON columns ───────────────────────────────────────────────────────
function safeJson(val, label) {
  if (val === null || val === undefined) return { _status: "NULL", _label: label };
  if (typeof val === "object") return val;
  try { return JSON.parse(val); }
  catch { return { _status: "PARSE_ERROR", _raw: String(val).substring(0, 300), _label: label }; }
}

const physicsRaw       = safeJson(a.physics_analysis,          "physics_analysis");
const damageComponents = safeJson(a.damaged_components_json,   "damaged_components_json");
const fraudBreakdown   = safeJson(a.fraud_score_breakdown_json,"fraud_score_breakdown_json");
const costIntelligence = safeJson(a.cost_intelligence_json,    "cost_intelligence_json");
const hiddenDamage     = safeJson(a.inferred_hidden_damages_json, "inferred_hidden_damages_json");
const repairIntel      = safeJson(a.repair_intelligence_json,  "repair_intelligence_json");
const partsRecon       = safeJson(a.parts_reconciliation_json, "parts_reconciliation_json");
const damagePhotos     = safeJson(a.damage_photos_json,        "damage_photos_json");
const confidenceBreakdown = safeJson(a.confidence_score_breakdown_json, "confidence_score_breakdown_json");
const pipelineSummary  = safeJson(a.pipeline_run_summary,      "pipeline_run_summary");
const forensicAnalysis = safeJson(a.forensic_analysis,         "forensic_analysis");

// ─── Pull quotes ─────────────────────────────────────────────────────────────
const [quotes] = await db.execute(
  `SELECT id, panel_beater_id, total_amount, parts_cost, labour_cost, status FROM quotes WHERE claim_id = ? LIMIT 10`,
  [claim.id]
);

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — RAW ENGINE OUTPUTS
// ═══════════════════════════════════════════════════════════════════════════════
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║              LAYER 1 — RAW ENGINE OUTPUTS               ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log("── SCALAR FIELDS ─────────────────────────────────────────");
console.log({
  id: a.id,
  claim_id: a.claim_id,
  estimated_cost: a.estimated_cost,
  parts_cost: a.parts_cost,
  labor_cost: a.labor_cost,
  estimated_parts_cost: a.estimated_parts_cost,
  estimated_labor_cost: a.estimated_labor_cost,
  confidence_score: a.confidence_score,
  fraud_risk_level: a.fraud_risk_level,
  damage_description: a.damage_description ? a.damage_description.substring(0, 200) : null,
  structural_damage_severity: a.structural_damage_severity,
  accident_type: a.accident_type,
  structural_damage: a.structural_damage,
  airbag_deployment: a.airbag_deployment,
  physics_deviation_score: a.physics_deviation_score,
  total_loss_indicated: a.total_loss_indicated,
  repair_to_value_ratio: a.repair_to_value_ratio,
  is_reanalysis: a.is_reanalysis,
  version_number: a.version_number,
  currency_code: a.currency_code,
});

console.log("\n── ENGINE 1: AI VISION / DAMAGE DETECTION ──────────────────");
console.log("damaged_components_json:", JSON.stringify(damageComponents, null, 2));

console.log("\n── ENGINE 2: PHYSICS ENGINE (physics_analysis) ─────────────");
console.log(JSON.stringify(physicsRaw, null, 2));

console.log("\n── ENGINE 3: FRAUD ENGINE (fraud_score_breakdown_json) ──────");
console.log(JSON.stringify(fraudBreakdown, null, 2));

console.log("\n── ENGINE 4: COST ENGINE (cost_intelligence_json) ───────────");
console.log(JSON.stringify(costIntelligence, null, 2));

console.log("\n── ENGINE 5: HIDDEN DAMAGE INFERENCE ────────────────────────");
console.log(JSON.stringify(hiddenDamage, null, 2));

console.log("\n── ENGINE 6: REPAIR INTELLIGENCE ────────────────────────────");
console.log(JSON.stringify(repairIntel, null, 2));

console.log("\n── ENGINE 7: PARTS RECONCILIATION ───────────────────────────");
console.log(JSON.stringify(partsRecon, null, 2));

console.log("\n── ENGINE 8: FORENSIC ANALYSIS ──────────────────────────────");
console.log(JSON.stringify(forensicAnalysis, null, 2));

console.log("\n── ENGINE 9: PIPELINE RUN SUMMARY ───────────────────────────");
console.log(JSON.stringify(pipelineSummary, null, 2));

console.log("\n── QUOTES ────────────────────────────────────────────────────");
console.log(JSON.stringify(quotes, null, 2));

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — FIELD MAPPING VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║         LAYER 2 — FIELD MAPPING VALIDATION              ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// What the frontend code actually reads (from InsurerComparisonView.tsx)
const frontendReads = {
  // Physics — what the normalizer produces from physics_analysis
  "physics.estimatedSpeedKmh":    physicsRaw?.estimatedSpeedKmh ?? physicsRaw?.estimatedSpeed?.value,
  "physics.impactForceKn":        physicsRaw?.impactForceKn ?? physicsRaw?.impactForce?.magnitude,
  "physics.deltaVKmh":            physicsRaw?.deltaVKmh ?? physicsRaw?.deltaV?.value,
  "physics.impactVector.direction": physicsRaw?.impactVector?.direction,
  "physics.energyDistribution.kineticEnergyJ": physicsRaw?.energyDistribution?.kineticEnergyJ,
  "physics.energyDistribution.energyDissipatedJ": physicsRaw?.energyDistribution?.energyDissipatedJ,
  "physics.accidentSeverity":     physicsRaw?.accidentSeverity,
  "physics.damageConsistencyScore": physicsRaw?.damageConsistencyScore,
  // Damage
  "damage.components (array)":    Array.isArray(damageComponents) ? damageComponents.length : "NOT_ARRAY",
  "damage.severity (scalar)":     a.structural_damage_severity,
  "damage.accidentType":          a.accident_type,
  // Cost
  "cost.estimatedCost":           a.estimated_cost,
  "cost.partsCost":               a.parts_cost,
  "cost.labourCost":              a.labor_cost,
  "cost.estimatedPartsCost":      a.estimated_parts_cost,
  "cost.estimatedLabourCost":     a.estimated_labor_cost,
  "cost.quotes.count":            quotes.length,
  // Fraud
  "fraud.riskLevel":              a.fraud_risk_level,
  "fraud.breakdown":              fraudBreakdown?._status ?? (Array.isArray(fraudBreakdown?.breakdown) ? `breakdown[${fraudBreakdown.breakdown.length}]` : typeof fraudBreakdown),
  "fraud.overallScore":           fraudBreakdown?.overallScore ?? fraudBreakdown?.score,
};

console.log("FRONTEND READS (what the UI will actually see):");
let nullCount = 0;
for (const [field, value] of Object.entries(frontendReads)) {
  const isNull = value === null || value === undefined || value === "NOT_ARRAY";
  if (isNull) nullCount++;
  console.log(`  ${isNull ? "❌" : "✅"} ${field}: ${JSON.stringify(value)}`);
}
console.log(`\nNULL/MISSING FIELDS: ${nullCount}/${Object.keys(frontendReads).length}`);

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3 — UI RENDER CHECK
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║            LAYER 3 — UI RENDER CHECK                    ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const renderChecks = [
  { panel: "DAMAGE PANEL",   check: "Damage zones present",          pass: Array.isArray(damageComponents) && damageComponents.length > 0 },
  { panel: "PHYSICS PANEL",  check: "velocity_kmh visible",          pass: !!(physicsRaw?.estimatedSpeedKmh || physicsRaw?.estimatedSpeed?.value) },
  { panel: "PHYSICS PANEL",  check: "impact_force_kn visible",       pass: !!(physicsRaw?.impactForceKn || physicsRaw?.impactForce?.magnitude) },
  { panel: "PHYSICS PANEL",  check: "energy_kj visible",             pass: !!(physicsRaw?.energyDistribution?.kineticEnergyJ || physicsRaw?.energyDistribution?.energyDissipatedJ) },
  { panel: "PHYSICS PANEL",  check: "delta_v visible",               pass: !!(physicsRaw?.deltaVKmh || physicsRaw?.deltaV?.value) },
  { panel: "VECTOR DIAGRAM", check: "direction available",           pass: !!(physicsRaw?.impactVector?.direction) },
  { panel: "COST PANEL",     check: "AI estimated cost > 0",         pass: !!(a.estimated_cost && a.estimated_cost > 0) },
  { panel: "COST PANEL",     check: "parts_cost present",            pass: !!(a.parts_cost && a.parts_cost > 0) },
  { panel: "COST PANEL",     check: "labour_cost present",           pass: !!(a.labor_cost && a.labor_cost > 0) },
  { panel: "COST PANEL",     check: "quotes for comparison",         pass: quotes.length > 0 },
  { panel: "FRAUD PANEL",    check: "fraud level present",           pass: !!(a.fraud_risk_level) },
  { panel: "FRAUD PANEL",    check: "fraud breakdown indicators",    pass: !!(fraudBreakdown && !fraudBreakdown._status) },
  { panel: "HIDDEN DAMAGE",  check: "hidden damage inferences",      pass: !!(hiddenDamage && !hiddenDamage._status) },
  { panel: "REPAIR INTEL",   check: "repair intelligence present",   pass: !!(repairIntel && !repairIntel._status) },
];

for (const r of renderChecks) {
  console.log(`  [${r.panel.padEnd(15)}] ${r.pass ? "✅ YES" : "❌ NO "} — ${r.check}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA MISMATCH REPORT
// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║         SCHEMA MISMATCH REPORT                          ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const schemaMismatches = [
  { field: "physics_analysis_json", actual: "physics_analysis",          status: "MISMATCH — code reads wrong column name" },
  { field: "fraud_analysis_json",   actual: "fraud_score_breakdown_json", status: "MISMATCH — code reads wrong column name" },
  { field: "cost_analysis_json",    actual: "cost_intelligence_json",     status: "MISMATCH — code reads wrong column name" },
  { field: "vehicle_inspection_json", actual: "DOES NOT EXIST",           status: "MISSING COLUMN" },
  { field: "hidden_damage_inference_json", actual: "inferred_hidden_damages_json", status: "MISMATCH — code reads wrong column name" },
  { field: "labour_cost",           actual: "labor_cost",                 status: "MISMATCH — US vs UK spelling" },
  { field: "delta_v_kmh (scalar)",  actual: "NOT IN ai_assessments",      status: "MISSING — only in physics_analysis JSON" },
  { field: "impact_force_kn (scalar)", actual: "NOT IN ai_assessments",   status: "MISSING — only in physics_analysis JSON" },
  { field: "estimated_speed_kmh (scalar)", actual: "NOT IN ai_assessments", status: "MISSING — only in physics_analysis JSON" },
  { field: "damage_consistency_score (scalar)", actual: "physics_deviation_score", status: "DIFFERENT NAME" },
];

for (const m of schemaMismatches) {
  console.log(`  ❌ CODE EXPECTS: ${m.field}`);
  console.log(`     DB HAS:       ${m.actual}`);
  console.log(`     STATUS:       ${m.status}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL VERDICT
// ═══════════════════════════════════════════════════════════════════════════════
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║                   FINAL VERDICT                         ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const failedRenders = renderChecks.filter(r => !r.pass);
const passedRenders = renderChecks.filter(r => r.pass);

console.log(`RENDER CHECKS:    ${passedRenders.length}/${renderChecks.length} PASSING`);
console.log(`SCHEMA MISMATCHES: ${schemaMismatches.length} FOUND`);
console.log(`NULL FIELDS:       ${nullCount}/${Object.keys(frontendReads).length}`);

if (failedRenders.length === 0 && schemaMismatches.length === 0) {
  console.log("\n🟢 SYSTEM STATUS: FULLY WORKING");
} else if (failedRenders.length <= 4) {
  console.log("\n🟡 SYSTEM STATUS: PARTIALLY WORKING");
} else {
  console.log("\n🔴 SYSTEM STATUS: BROKEN");
}

console.log("\nFAILED RENDER CHECKS:");
for (const f of failedRenders) {
  console.log(`  ❌ [${f.panel}] ${f.check}`);
}

await db.end();
