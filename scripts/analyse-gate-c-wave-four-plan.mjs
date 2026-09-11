/** Gate C Wave 4 source-only planning analysis. It never opens a database or generates SQL. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.resolve(repoRoot, process.argv[2] ?? "audit/gate-c-scratch-baseline/wave-04-planning-analysis.json");
if (!outputPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error("Output path must be inside the repository.");

const WAVE_ONE_TABLES = ["tenant_invitations", "tenants", "users"];
const WAVE_TWO_TABLES = [
  "claim_assignments", "claim_documents", "claims", "drivers", "inspections",
  "insurance_audit_logs", "insurance_carriers", "insurance_policies", "insurance_products", "insurance_quotes",
  "measurement_types", "vehicle_condition_assessment", "vehicle_condition_snapshots", "vehicle_damage_history",
  "vehicle_geometry_measurements", "vehicle_market_valuations", "vehicle_mileage_logs", "vehicle_models",
  "vehicle_passport_snapshots", "vehicle_registry",
];
const WAVE_THREE_TABLES = [
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
];
export const ORIGINAL_WAVE_FOUR_TABLES = [
  "agency_assisted_claimant_identities", "agency_clients", "agency_insurance_service_request_insurers",
  "agency_insurance_service_requests", "agency_insurance_valuation_deviations", "agency_product_commission_configs",
  "approval_workflow", "claim_comment_reads", "claim_comments", "client_insurance_service_requests",
  "client_vehicle_valuation_requests", "engineer_observations", "engineer_profiles", "fleet_accounts", "fleet_audit_logs",
  "fleet_drivers", "fleet_intelligence_snapshots", "fleet_manager_requests", "fleet_rfq_client_instructions", "fleet_risk_scores",
  "fleet_vehicles", "fleets", "governance_audit_log", "governance_notifications", "governance_violation_log",
  "inspection_projects", "notification_events", "notification_preferences", "notifications", "panel_beaters",
  "platform_governance_limits", "rate_limit_tracking", "service_requests", "tenant_workflow_configs", "workflow_audit_trail",
  "workflow_configuration", "workflow_templates",
].sort();
export const REQUESTED_OPERATIONAL_CHANNEL_EXTENSION = [
  "recovery_cases", "recovery_correspondence_log", "whatsapp_sessions",
].sort();
export const WAVE_FOUR_TABLES = [...new Set([
  ...ORIGINAL_WAVE_FOUR_TABLES,
  ...REQUESTED_OPERATIONAL_CHANNEL_EXTENSION,
])].sort();
const HELD_TABLES = [
  "audit_logs", "benchmark_deviations", "geometry_sources", "photo_reextraction_jobs", "tenant_tier_history",
  "tenant_usage_summary", "vehicle_landmarks", "vision_calibration_results",
].sort();
const precedingTables = new Set([...WAVE_ONE_TABLES, ...WAVE_TWO_TABLES, ...WAVE_THREE_TABLES]);
const waveFourTables = new Set(WAVE_FOUR_TABLES);

function nodeName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
}

function callName(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? node.expression.text : null;
}

function hasConfiguredPrimaryKey(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === "primaryKey") found = true;
    else ts.forEachChild(child, visit);
  };
  if (node) visit(node);
  return found;
}

function referencesTargets(node, sourceFile) {
  const targets = new Set();
  const visit = (child) => {
    if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === "references") {
      const callback = child.arguments[0];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const body = callback.body;
        if (ts.isPropertyAccessExpression(body)) {
          const variable = body.expression.getText(sourceFile);
          targets.add(variable);
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...targets].sort();
}

function configuredIndexes(configArg, sourceFile) {
  const indexes = [];
  if (!configArg) return indexes;
  const visit = (child) => {
    if (!ts.isCallExpression(child)) return ts.forEachChild(child, visit);
    const name = callName(child);
    if (name === "index" || name === "uniqueIndex") {
      const indexName = child.arguments[0] && ts.isStringLiteral(child.arguments[0]) ? child.arguments[0].text : null;
      indexes.push({ name: indexName, unique: name === "uniqueIndex", source: child.getText(sourceFile) });
    }
    ts.forEachChild(child, visit);
  };
  visit(configArg);
  return indexes.sort((a, b) => `${a.name}`.localeCompare(`${b.name}`));
}

function parseTables(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(absolutePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const tables = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      if (callName(declaration.initializer) !== "mysqlTable") continue;
      const [tableNameArg, columnsArg, configArg] = declaration.initializer.arguments;
      if (!ts.isStringLiteral(tableNameArg) || !ts.isObjectLiteralExpression(columnsArg)) continue;
      const columns = columnsArg.properties
        .filter(ts.isPropertyAssignment)
        .map((property) => ({
          property: nodeName(property.name),
          expression: property.initializer.getText(sourceFile),
          references: referencesTargets(property.initializer, sourceFile),
          line: sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile)).line + 1,
        }));
      const idColumn = columns.find(({ property }) => property === "id") ?? null;
      tables.push({
        tableName: tableNameArg.text,
        declaration: declaration.name.text,
        sourceFile: relativePath,
        line: sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1,
        idColumn,
        inlinePrimaryKey: Boolean(idColumn?.expression.includes(".primaryKey()")),
        configuredPrimaryKey: hasConfiguredPrimaryKey(configArg),
        columns,
        indexes: configuredIndexes(configArg, sourceFile),
      });
    }
  }
  return tables;
}

const configuredGenerationSource = "drizzle/schema.ts";
const sourceTables = [...parseTables(configuredGenerationSource), ...parseTables("drizzle/claim-comments-schema.ts")];
const tableByName = new Map();
const duplicatePhysicalTableDeclarations = [];
for (const table of sourceTables) {
  const existing = tableByName.get(table.tableName);
  if (existing) {
    duplicatePhysicalTableDeclarations.push({
      tableName: table.tableName,
      configuredDeclaration: {
        declaration: existing.declaration,
        sourceFile: existing.sourceFile,
        line: existing.line,
      },
      secondaryDeclaration: {
        declaration: table.declaration,
        sourceFile: table.sourceFile,
        line: table.line,
      },
    });
    continue;
  }
  tableByName.set(table.tableName, table);
}
const declarationToPhysicalTable = new Map(sourceTables.map((table) => [table.declaration, table.tableName]));
const rows = WAVE_FOUR_TABLES.map((tableName) => {
  const table = tableByName.get(tableName);
  if (!table) return { tableName, missingSourceDeclaration: true };
  const referenceDeclarations = [...new Set(table.columns.flatMap(({ references }) => references))].sort();
  const referenceTargets = referenceDeclarations.map((declaration) => declarationToPhysicalTable.get(declaration) ?? `UNRESOLVED:${declaration}`);
  const referencedPrecedingTables = referenceTargets.filter((target) => precedingTables.has(target));
  const referencedWaveFourTables = referenceTargets.filter((target) => waveFourTables.has(target));
  const unresolvedReferences = referenceTargets.filter((target) => target.startsWith("UNRESOLVED:"));
  return {
    tableName,
    declaration: table.declaration,
    sourceFile: table.sourceFile,
    includedByConfiguredGenerationSource: table.sourceFile === configuredGenerationSource,
    line: table.line,
    hasIdColumn: Boolean(table.idColumn),
    idExpression: table.idColumn?.expression ?? null,
    hasExplicitPrimaryKey: table.inlinePrimaryKey || table.configuredPrimaryKey,
    referenceTargets,
    referencedPrecedingTables,
    referencedWaveFourTables,
    unresolvedReferences,
    indexes: table.indexes.map(({ name, unique }) => ({ name, unique })),
  };
});

const keyGaps = rows.filter((row) => !row.hasExplicitPrimaryKey || !row.hasIdColumn);
const unresolvedDependencies = rows.filter((row) => row.unresolvedReferences.length > 0);
const tablesOutsideConfiguredGenerationSource = rows
  .filter((row) => !row.missingSourceDeclaration && !row.includedByConfiguredGenerationSource)
  .map(({ tableName, declaration, sourceFile, line }) => ({ tableName, declaration, sourceFile, line }));
const heldOverlap = WAVE_FOUR_TABLES.filter((tableName) => HELD_TABLES.includes(tableName));
const sourceOrderDependencies = rows
  .filter((row) => row.referencedWaveFourTables.length > 0)
  .map((row) => ({ tableName: row.tableName, dependsOn: row.referencedWaveFourTables }));
const emptyConfiguredIndexNames = rows
  .flatMap((row) => row.indexes.filter(({ name }) => !name).map(() => ({ tableName: row.tableName })))
  .sort((a, b) => a.tableName.localeCompare(b.tableName));
const duplicateConfiguredIndexNames = rows
  .flatMap((row) => {
    const names = row.indexes.map(({ name }) => name).filter(Boolean);
    return [...new Set(names)]
      .filter((name) => names.filter((candidate) => candidate === name).length > 1)
      .map((name) => ({ tableName: row.tableName, name }));
  })
  .sort((a, b) => `${a.tableName}:${a.name}`.localeCompare(`${b.tableName}:${b.name}`));
const repeatedNamesAcrossTables = [...new Set(rows.flatMap((row) => row.indexes.map(({ name }) => name).filter(Boolean)))]
  .map((name) => ({ name, tables: rows.filter((row) => row.indexes.some((index) => index.name === name)).map(({ tableName }) => tableName).sort() }))
  .filter(({ tables }) => tables.length > 1)
  .sort((a, b) => a.name.localeCompare(b.name));

const output = {
  scope: "Planning only. Parsed repository source metadata; no database connection, SQL generation, DDL, or source-schema reconciliation was performed.",
  wave: 4,
  title: "Operational portals and workflows",
  originalPlannedTableCount: ORIGINAL_WAVE_FOUR_TABLES.length,
  requestedOperationalChannelExtension: REQUESTED_OPERATIONAL_CHANNEL_EXTENSION,
  expectedTableCount: WAVE_FOUR_TABLES.length,
  inspectedTableCount: rows.length,
  prerequisiteTables: [...precedingTables].sort(),
  configuredGenerationSource,
  heldTablesExcluded: HELD_TABLES,
  heldTableOverlap: heldOverlap,
  duplicatePhysicalTableDeclarations,
  tablesOutsideConfiguredGenerationSource,
  explicitPrimaryKeyGaps: keyGaps,
  unresolvedDependencies,
  sourceOrderDependencies,
  emptyConfiguredIndexNames,
  duplicateConfiguredIndexNames,
  repeatedNamesAcrossTables,
  rows,
  readiness: {
    tableSetComplete: rows.length === WAVE_FOUR_TABLES.length,
    explicitKeysComplete: keyGaps.length === 0,
    dependenciesResolved: unresolvedDependencies.length === 0,
    heldTablesExcluded: heldOverlap.length === 0,
    allTablesInConfiguredGenerationSource: tablesOutsideConfiguredGenerationSource.length === 0,
    noEmptyConfiguredIndexNames: emptyConfiguredIndexNames.length === 0,
    noDuplicateConfiguredIndexNames: duplicateConfiguredIndexNames.length === 0,
  },
};
output.readiness.readyForSqlGeneration = Object.values(output.readiness).every(Boolean);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  inspected: output.inspectedTableCount,
  keyGaps: keyGaps.length,
  outsideConfiguredGenerationSource: tablesOutsideConfiguredGenerationSource.length,
  duplicatePhysicalTableDeclarations: duplicatePhysicalTableDeclarations.length,
  unresolvedDependencies: unresolvedDependencies.length,
  sourceOrderDependencies: sourceOrderDependencies.length,
  heldOverlap: heldOverlap.length,
  emptyConfiguredIndexNames: emptyConfiguredIndexNames.length,
  duplicateConfiguredIndexNames: duplicateConfiguredIndexNames.length,
  repeatedNamesAcrossTables: repeatedNamesAcrossTables.length,
  readyForSqlGeneration: output.readiness.readyForSqlGeneration,
}, null, 2));
