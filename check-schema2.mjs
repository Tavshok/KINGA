import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [cols] = await conn.execute('SHOW COLUMNS FROM ai_assessments');
const dbCols = new Set(cols.map(c => c.Field));

// ALL columns from the INSERT SQL in the error log (exact order)
const insertCols = [
  'id', 'claim_id', 'estimated_cost', 'damage_description', 'detected_damage_types',
  'confidence_score', 'fraud_indicators', 'fraud_risk_level', 'fraud_score', 'recommendation',
  'fraud_score_breakdown_json', 'model_version', 'processing_time', 'created_at', 'updated_at',
  'total_loss_indicated', 'structural_damage_severity', 'estimated_vehicle_value',
  'repair_to_value_ratio', 'total_loss_reasoning', 'damaged_components_json', 'physics_analysis',
  'graph_urls', 'tenant_id', 'is_reanalysis', 'triggered_by', 'triggered_role',
  'previous_assessment_id', 'reanalysis_reason', 'version_number', 'physics_deviation_score',
  'forensic_analysis', 'estimated_parts_cost', 'estimated_labor_cost', 'currency_code',
  'inferred_hidden_damages_json', 'repair_intelligence_json', 'parts_reconciliation_json',
  'cost_intelligence_json', 'damage_photos_json', 'confidence_score_breakdown_json',
  'pipeline_run_summary', 'enriched_photos_json', 'photo_inconsistencies_json',
  'consistency_check_json', 'coherence_result_json', 'cost_realism_json', 'causal_chain_json',
  'evidence_bundle_json', 'realism_bundle_json', 'benchmark_bundle_json', 'consensus_result_json',
  'causal_verdict_json', 'constraint_overrides_json', 'validated_outcome_json', 'case_signature_json',
  'decision_authority_json', 'contradiction_gate_json', 'report_readiness_json', 'explanation_json',
  'escalation_route_json', 'decision_trace_json', 'stage2_raw_ocr_text', 'claim_record_json',
  'narrative_analysis_json', 'image_analysis_total_count', 'image_analysis_success_count',
  'image_analysis_failed_count', 'image_analysis_success_rate', 'fcdi_score',
  'forensic_execution_ledger_json', 'assumption_registry_json', 'economic_context_json',
  'ife_result_json', 'doe_result_json', 'fel_version_snapshot_json', 'claim_quality_json',
  'forensic_audit_validation_json'
];

console.log('=== Columns in INSERT that are MISSING from DB ===');
const missing = insertCols.filter(c => !dbCols.has(c));
console.log(missing.length ? missing.join('\n') : 'None');

console.log('\n=== DB columns NOT in the INSERT list ===');
const extra = [...dbCols].filter(c => !insertCols.includes(c));
console.log(extra.length ? extra.join('\n') : 'None');

await conn.end();
