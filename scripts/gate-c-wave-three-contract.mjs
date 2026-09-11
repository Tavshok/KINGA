/** Gate C Wave 3 reviewed source-SQL contract. No database access occurs here. */
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
export const PREREQUISITE_TABLES = [...WAVE_ONE_TABLES, ...WAVE_TWO_TABLES].sort();
export const WAVE_THREE_FOREIGN_KEY_NAME_NORMALISATIONS = new Map([
  ["claim_routing_decisions_confidence_score_id_claim_confidence_scores_id_fk", "fk_crd_confidence_score"],
  ["claim_routing_decisions_automation_policy_id_automation_policies_id_fk", "fk_crd_automation_policy"],
]);

export function splitStatements(sql) {
  return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
}

export function createTableName(statement) {
  return statement.match(/^CREATE\s+TABLE\s+`([^`]+)`/i)?.[1] ?? null;
}

export function createIndexTarget(statement) {
  return statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`[^`]+`\s+ON\s+`([^`]+)`/i)?.[1] ?? null;
}

export function foreignKeyTables(statement) {
  const match = statement.match(/^ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY\s*\([^)]*\)\s+REFERENCES\s+`([^`]+)`\s*\([^)]*\)(?:\s+ON\s+DELETE\s+[A-Z ]+)?(?:\s+ON\s+UPDATE\s+[A-Z ]+)?;?$/is);
  return match ? { source: match[1], target: match[2] } : null;
}

export function normaliseWaveThreeForeignKeyName(statement) {
  const match = statement.match(/^(ALTER\s+TABLE\s+`[^`]+`\s+ADD\s+CONSTRAINT\s+)`([^`]+)`([\s\S]*)$/i);
  if (!match) return { statement, normalisation: null };
  const replacement = WAVE_THREE_FOREIGN_KEY_NAME_NORMALISATIONS.get(match[2]);
  return replacement
    ? { statement: `${match[1]}\`${replacement}\`${match[3]}`, normalisation: { from: match[2], to: replacement } }
    : { statement, normalisation: null };
}

export function validateWaveThreeSql(sql) {
  const statements = splitStatements(sql);
  if (statements.length === 0) throw new Error("Gate C Wave 3 SQL contains no statements.");
  const createdTables = [];
  const indexStatements = [];
  const foreignKeys = [];

  for (const statement of statements) {
    const table = createTableName(statement);
    if (table) {
      if (!WAVE_THREE_TABLES.includes(table)) throw new Error(`Gate C Wave 3 creates unreviewed table ${table}.`);
      if (!/PRIMARY\s+KEY\s*\(\s*`id`\s*\)/i.test(statement)) throw new Error(`Gate C Wave 3 table ${table} lacks explicit id primary key.`);
      createdTables.push(table);
      continue;
    }
    const indexTarget = createIndexTarget(statement);
    if (indexTarget) {
      if (!WAVE_THREE_TABLES.includes(indexTarget)) throw new Error(`Gate C Wave 3 index targets unreviewed table ${indexTarget}.`);
      indexStatements.push(statement);
      continue;
    }
    const foreignKey = foreignKeyTables(statement);
    if (!foreignKey) throw new Error(`Gate C Wave 3 permits only CREATE TABLE, CREATE INDEX, and source-declared foreign-key additions: ${statement.slice(0, 120)}`);
    if (!WAVE_THREE_TABLES.includes(foreignKey.source)) throw new Error(`Gate C Wave 3 foreign key source is unreviewed: ${foreignKey.source}.`);
    if (!WAVE_THREE_TABLES.includes(foreignKey.target) && !PREREQUISITE_TABLES.includes(foreignKey.target)) {
      throw new Error(`Gate C Wave 3 foreign key target is outside reviewed prerequisites: ${foreignKey.source} -> ${foreignKey.target}.`);
    }
    foreignKeys.push({ ...foreignKey, statement });
  }

  const sortedTables = [...createdTables].sort();
  if (JSON.stringify(sortedTables) !== JSON.stringify(WAVE_THREE_TABLES)) {
    throw new Error(`Gate C Wave 3 SQL table set differs from the full reviewed plan: ${sortedTables.join(", ")}.`);
  }
  if (new Set(createdTables).size !== createdTables.length) throw new Error("Gate C Wave 3 SQL creates a table more than once.");
  return { statements, createdTables: sortedTables, indexStatements, foreignKeys };
}
