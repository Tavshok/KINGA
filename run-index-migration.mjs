/**
 * KINGA — Database Index Optimisation Migration
 * Adds critical indexes for all high-frequency query patterns.
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const indexes = [
  // ── Claims table — most queried ──────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_claims_tenant_status ON claims(tenant_id, psm_status)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_tenant_doc_status ON claims(tenant_id, document_processing_status)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_assessment_started ON claims(ai_assessment_started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_assessment_completed ON claims(ai_assessment_completed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_incident_date ON claims(incident_date)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_incident_location ON claims(incident_location(100))`,
  `CREATE INDEX IF NOT EXISTS idx_claims_submitted_at ON claims(submitted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_vehicle_reg ON claims(vehicle_registration(50))`,

  // ── AI Assessments ───────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_ai_assessments_claim ON ai_assessments(claim_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_assessments_created ON ai_assessments(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_assessments_fraud_score ON ai_assessments(fraud_score)`,

  // ── Entity registries ────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_driver_registry_tenant ON driver_registry(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_driver_registry_licence ON driver_registry(licence_number(50))`,
  `CREATE INDEX IF NOT EXISTS idx_driver_registry_id_number ON driver_registry(id_number(50))`,
  `CREATE INDEX IF NOT EXISTS idx_driver_registry_claims ON driver_registry(total_claims_as_driver)`,

  `CREATE INDEX IF NOT EXISTS idx_claimant_registry_tenant ON claimant_registry(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_claimant_registry_id ON claimant_registry(id_number(50))`,

  `CREATE INDEX IF NOT EXISTS idx_assessor_registry_tenant ON assessor_registry(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assessor_registry_collusion ON assessor_registry(collusion_suspected)`,

  `CREATE INDEX IF NOT EXISTS idx_panel_beater_registry_tenant ON panel_beater_registry(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_panel_beater_registry_suppression ON panel_beater_registry(cost_suppression_claim_count)`,

  `CREATE INDEX IF NOT EXISTS idx_police_officer_registry_tenant ON police_officer_registry(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_police_officer_registry_risk ON police_officer_registry(concentration_risk_level(20))`,
  `CREATE INDEX IF NOT EXISTS idx_police_officer_registry_badge ON police_officer_registry(badge_number(50))`,

  // ── Relationship graph ───────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_entity_rel_source ON entity_relationship_graph(source_entity_type(30), source_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entity_rel_target ON entity_relationship_graph(target_entity_type(30), target_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entity_rel_weight ON entity_relationship_graph(edge_weight)`,

  // ── Accident clusters ────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_accident_clusters_tenant ON accident_clusters(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_accident_clusters_risk ON accident_clusters(risk_level(20))`,

  // ── ML models ────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_ml_models_entity ON ml_models(entity_type(30), entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ml_models_anomaly ON ml_models(is_anomaly)`,

  // ── Workflow audit ───────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_workflow_audit_claim ON workflow_audit_log(claim_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_audit_created ON workflow_audit_log(created_at)`,
];

let created = 0;
let skipped = 0;
let failed = 0;

for (const sql of indexes) {
  try {
    await conn.execute(sql);
    created++;
    const match = sql.match(/idx_\w+/);
    console.log(`  ✓ ${match?.[0] ?? 'index'}`);
  } catch (e) {
    const msg = e.message ?? '';
    if (msg.includes('Duplicate key name') || msg.includes('already exists')) {
      skipped++;
    } else if (msg.includes("doesn't exist") || msg.includes("Unknown column")) {
      console.log(`  ⚠ Skipped (column not found): ${sql.substring(0, 80)}...`);
      skipped++;
    } else {
      console.error(`  ✗ Failed: ${msg}`);
      failed++;
    }
  }
}

await conn.end();
console.log(`\nIndex migration complete: ${created} created, ${skipped} skipped, ${failed} failed`);
