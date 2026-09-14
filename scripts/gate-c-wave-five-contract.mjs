export const WAVE_ONE_TABLES = ["tenant_invitations", "tenants", "users"];
export const WAVE_TWO_TABLES = [
  "claim_assignments", "claim_documents", "claims", "drivers", "inspections",
  "insurance_audit_logs", "insurance_carriers", "insurance_policies", "insurance_products", "insurance_quotes",
  "measurement_types", "vehicle_condition_assessment", "vehicle_condition_snapshots", "vehicle_damage_history",
  "vehicle_geometry_measurements", "vehicle_market_valuations", "vehicle_mileage_logs", "vehicle_models",
  "vehicle_passport_snapshots", "vehicle_registry",
];
export const WAVE_THREE_TABLES = [
  "adjuster_sign_offs", "agency_documents", "ai_assessments", "ai_prediction_logs", "assessor_report_attachments",
  "assessor_report_reviews", "assessor_reports", "automation_policies", "claim_confidence_scores", "claim_decision_lifecycle",
  "claim_routing_decisions", "component_repair_outcomes", "cost_components", "cost_learning_records", "country_repair_index",
  "currency_exchange_rates", "customer_documents", "decision_snapshots", "document_naming_templates", "extracted_document_data",
  "extracted_repair_items", "fleet_documents", "fleet_incident_reports", "fraud_alerts", "fraud_indicators", "fraud_rules",
  "generated_reports", "ingestion_documents", "insurer_marketplace_links", "insurer_marketplace_relationships", "insurer_quote_requests",
  "marketplace_profiles", "panel_beater_quotes", "pdf_reports", "physics_validation_records", "police_reports", "policy_documents",
  "pre_accident_damage", "quotation_request_documents", "quote_line_items", "quote_optimisation_results", "repair_cost_intelligence",
  "repair_history", "report_access_audit", "report_links", "report_snapshots", "service_quotes", "supplier_quote_line_items",
  "supplier_quotes", "valuation_comparable_evidence",
].sort();
export const WAVE_FOUR_TABLES = [
  "agency_assisted_claimant_identities", "agency_clients", "agency_insurance_service_request_insurers",
  "agency_insurance_service_requests", "agency_insurance_valuation_deviations", "agency_product_commission_configs",
  "approval_workflow", "claim_comment_reads", "claim_comments", "client_insurance_service_requests",
  "client_vehicle_valuation_requests", "engineer_observations", "engineer_profiles", "fleet_accounts", "fleet_audit_logs",
  "fleet_drivers", "fleet_intelligence_snapshots", "fleet_manager_requests", "fleet_rfq_client_instructions", "fleet_risk_scores",
  "fleet_vehicles", "fleets", "governance_audit_log", "governance_notifications", "governance_violation_log",
  "inspection_projects", "notification_events", "notification_preferences", "notifications", "panel_beaters",
  "platform_governance_limits", "rate_limit_tracking", "recovery_cases", "recovery_correspondence_log", "service_requests",
  "tenant_workflow_configs", "whatsapp_sessions", "workflow_audit_trail", "workflow_configuration", "workflow_templates",
].sort();
export const WAVE_FIVE_TABLES = [
  "access_denial_log", "anonymization_audit_log", "appointments", "assessor_deviation_metrics", "assessor_evaluations",
  "assessor_insurer_relationships", "assessor_subscriptions", "assessors", "asset_registry", "audit_trail", "automation_audit_log",
  "bias_detection_flags", "calibration_overrides", "claim_approvals", "claim_events", "claim_intake_requests", "claim_intelligence_dataset",
  "claim_involvement_tracking", "claim_review_queue", "commission_records", "component_benchmarks", "cross_claim_signals", "customer_consent",
  "dataset_access_grants", "driver_claims", "fast_track_config", "fast_track_routing_log", "federated_learning_metadata", "final_approval_records",
  "fuel_records", "global_anonymized_dataset", "global_search_analytics", "global_search_history", "historical_claims", "historical_replay_results",
  "human_review_queue", "ingestion_batches", "insurer_tenants", "iso_audit_logs", "licensing_records", "maintenance_alerts", "maintenance_records",
  "maintenance_schedules", "mismatch_annotations", "model_training_queue", "multi_reference_truth", "narrative_versions", "parts_pricing_baseline",
  "personal_vehicles", "physical_measurements", "pipeline_jobs", "pipeline_runs", "policy_claim_links", "policy_endorsements", "predictive_risk_scores",
  "quotation_requests", "replay_logs", "risk_register", "role_assignment_audit", "routing_history", "routing_threshold_config",
  "service_providers", "shadow_override_monitor", "similar_claims_clusters", "super_audit_sessions", "supplier_performance_metrics",
  "system_errors", "tenant_isolation_violations", "tenant_role_configs", "third_party_vehicles", "training_data_scores", "training_dataset",
  "usage_events", "variance_datasets", "weight_adjustment_log",
].sort();
export const PREREQUISITE_TABLES = [...WAVE_ONE_TABLES, ...WAVE_TWO_TABLES, ...WAVE_THREE_TABLES, ...WAVE_FOUR_TABLES].sort();

/** Source-generated names that exceed the MySQL/TiDB 64-character limit. SQL-only names retain columns and referential actions. */
export const FOREIGN_KEY_NAME_NORMALISATIONS = new Map([
  ["automation_audit_log_routing_decision_id_claim_routing_decisions_id_fk", "fk_aal_routing_decision"],
  ["automation_audit_log_confidence_score_id_claim_confidence_scores_id_fk", "fk_aal_confidence_score"],
  ["assessor_evaluations_accepted_review_id_assessor_report_reviews_id_fk", "fk_ae_accepted_review"],
  ["automation_audit_log_automation_policy_id_automation_policies_id_fk", "fk_aal_automation_policy"],
]);

export function splitStatements(sql) { return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean); }
export function createTableName(statement) { return statement.match(/^CREATE\s+TABLE\s+`([^`]+)`/i)?.[1] ?? null; }
export function createIndexTarget(statement) { return statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`[^`]+`\s+ON\s+`([^`]+)`/i)?.[1] ?? null; }
export function foreignKeyTables(statement) {
  const match = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`([^`]+)`\s+FOREIGN\s+KEY\s*\([^)]*\)\s+REFERENCES\s+`([^`]+)`\s*\([^)]*\)(?:\s+ON\s+DELETE\s+[A-Z ]+)?(?:\s+ON\s+UPDATE\s+[A-Z ]+)?;?$/is);
  return match ? { source: match[1], name: match[2], target: match[3] } : null;
}
export function expectedPrimaryKeyPattern(tableName) {
  return tableName === "tenant_role_configs"
    ? /PRIMARY\s+KEY\s*\(\s*`tenant_id`\s*,\s*`role_key`\s*\)/i
    : /PRIMARY\s+KEY\s*\(\s*`id`\s*\)/i;
}
export function normaliseWaveFiveForeignKeyNames(statement) {
  return statement.replace(/ADD\s+CONSTRAINT\s+`([^`]+)`/i, (full, name) => {
    const replacement = FOREIGN_KEY_NAME_NORMALISATIONS.get(name);
    return replacement ? `ADD CONSTRAINT \`${replacement}\`` : full;
  });
}
export function validateWaveFiveSql(sql) {
  const statements = splitStatements(sql);
  if (statements.length === 0) throw new Error("Gate C Wave 5 SQL contains no statements.");
  const createdTables = [];
  const indexStatements = [];
  const foreignKeys = [];
  for (const statement of statements) {
    const table = createTableName(statement);
    if (table) {
      if (!WAVE_FIVE_TABLES.includes(table)) throw new Error(`Gate C Wave 5 creates unreviewed table ${table}.`);
      if (!expectedPrimaryKeyPattern(table).test(statement)) throw new Error(`Gate C Wave 5 table ${table} lacks its approved explicit primary key.`);
      createdTables.push(table);
      continue;
    }
    const indexTarget = createIndexTarget(statement);
    if (indexTarget) {
      if (!WAVE_FIVE_TABLES.includes(indexTarget)) throw new Error(`Gate C Wave 5 index targets unreviewed table ${indexTarget}.`);
      indexStatements.push(statement);
      continue;
    }
    const foreignKey = foreignKeyTables(statement);
    if (!foreignKey) throw new Error(`Gate C Wave 5 permits only CREATE TABLE, CREATE INDEX, and source-declared foreign-key additions: ${statement.slice(0, 120)}`);
    if (!WAVE_FIVE_TABLES.includes(foreignKey.source)) throw new Error(`Gate C Wave 5 foreign key source is unreviewed: ${foreignKey.source}.`);
    if (!WAVE_FIVE_TABLES.includes(foreignKey.target) && !PREREQUISITE_TABLES.includes(foreignKey.target)) throw new Error(`Gate C Wave 5 foreign-key target is outside reviewed prerequisites: ${foreignKey.source} -> ${foreignKey.target}.`);
    foreignKeys.push({ ...foreignKey, statement });
  }
  const sortedTables = [...createdTables].sort();
  if (JSON.stringify(sortedTables) !== JSON.stringify(WAVE_FIVE_TABLES)) throw new Error(`Gate C Wave 5 SQL table set differs from the reviewed plan: ${sortedTables.join(", ")}.`);
  if (new Set(createdTables).size !== createdTables.length) throw new Error("Gate C Wave 5 SQL creates a table more than once.");
  return { statements, createdTables: sortedTables, indexStatements, foreignKeys };
}
