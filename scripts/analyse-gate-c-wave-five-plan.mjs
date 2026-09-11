/** Gate C Wave 5 source-only readiness analysis. It neither opens nor configures a database. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { PREREQUISITE_TABLES, WAVE_FOUR_TABLES } from "./gate-c-wave-four-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.resolve(repoRoot, process.argv[2] ?? "audit/gate-c-scratch-baseline/wave-05-planning-analysis.json");
if (!outputPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error("Output path must be inside the repository.");

const ORIGINAL_WAVE_FIVE_TABLES = [
  "access_denial_log", "anonymization_audit_log", "appointments", "assessor_deviation_metrics", "assessor_evaluations",
  "assessor_insurer_relationships", "assessor_subscriptions", "assessors", "asset_registry", "audit_trail", "automation_audit_log",
  "bias_detection_flags", "calibration_overrides", "claim_approvals", "claim_events", "claim_intake_requests", "claim_intelligence_dataset",
  "claim_involvement_tracking", "claim_review_queue", "commission_records", "component_benchmarks", "cross_claim_signals", "customer_consent",
  "dataset_access_grants", "driver_claims", "fast_track_config", "fast_track_routing_log", "federated_learning_metadata", "final_approval_records",
  "fuel_records", "global_anonymized_dataset", "global_search_analytics", "global_search_history", "historical_claims", "historical_replay_results",
  "human_review_queue", "ingestion_batches", "insurer_tenants", "iso_audit_logs", "licensing_records", "maintenance_alerts", "maintenance_records",
  "maintenance_schedules", "mismatch_annotations", "model_training_queue", "multi_reference_truth", "narrative_versions", "parts_pricing_baseline",
  "personal_vehicles", "physical_measurements", "pipeline_jobs", "pipeline_runs", "policy_claim_links", "policy_endorsements", "predictive_risk_scores",
  "quotation_requests", "recovery_cases", "recovery_correspondence_log", "replay_logs", "risk_register", "role_assignment_audit", "routing_history",
  "routing_threshold_config", "service_providers", "shadow_override_monitor", "similar_claims_clusters", "super_audit_sessions",
  "supplier_performance_metrics", "system_errors", "tenant_isolation_violations", "tenant_role_configs", "third_party_vehicles", "training_data_scores",
  "training_dataset", "usage_events", "variance_datasets", "weight_adjustment_log", "whatsapp_sessions",
].sort();
const ALREADY_WAVED_OPERATIONAL_CHANNELS = ["recovery_cases", "recovery_correspondence_log", "whatsapp_sessions"].sort();
export const WAVE_FIVE_TABLES = ORIGINAL_WAVE_FIVE_TABLES.filter((tableName) => !ALREADY_WAVED_OPERATIONAL_CHANNELS.includes(tableName));
const HELD_TABLES = [
  "audit_logs", "benchmark_deviations", "geometry_sources", "photo_reextraction_jobs", "tenant_tier_history",
  "tenant_usage_summary", "vehicle_landmarks", "vision_calibration_results",
].sort();
const precedingTables = new Set([...PREREQUISITE_TABLES, ...WAVE_FOUR_TABLES]);
const waveFiveTables = new Set(WAVE_FIVE_TABLES);

function nodeName(node) { return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null; }
function callName(node) { return ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? node.expression.text : null; }

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
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isPropertyAccessExpression(callback.body)) {
        targets.add(callback.body.expression.getText(sourceFile));
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
      indexes.push({
        name: child.arguments[0] && ts.isStringLiteral(child.arguments[0]) ? child.arguments[0].text : null,
        unique: name === "uniqueIndex",
        source: child.getText(sourceFile),
      });
    }
    ts.forEachChild(child, visit);
  };
  visit(configArg);
  return indexes.sort((a, b) => `${a.name}`.localeCompare(`${b.name}`));
}

function parseCanonicalSchema() {
  const relativePath = "drizzle/schema.ts";
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
      const columns = columnsArg.properties.filter(ts.isPropertyAssignment).map((property) => ({
        property: nodeName(property.name),
        expression: property.initializer.getText(sourceFile),
        references: referencesTargets(property.initializer, sourceFile),
        inlineUnique: property.initializer.getText(sourceFile).includes(".unique()"),
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

const sourceTables = parseCanonicalSchema();
const tableByName = new Map(sourceTables.map((table) => [table.tableName, table]));
const declarationToPhysicalTable = new Map(sourceTables.map((table) => [table.declaration, table.tableName]));
const rows = WAVE_FIVE_TABLES.map((tableName) => {
  const table = tableByName.get(tableName);
  if (!table) return { tableName, missingSourceDeclaration: true };
  const referenceDeclarations = [...new Set(table.columns.flatMap(({ references }) => references))].sort();
  const referenceTargets = referenceDeclarations.map((declaration) => declarationToPhysicalTable.get(declaration) ?? `UNRESOLVED:${declaration}`);
  return {
    tableName,
    declaration: table.declaration,
    sourceFile: table.sourceFile,
    line: table.line,
    hasIdColumn: Boolean(table.idColumn),
    idExpression: table.idColumn?.expression ?? null,
    hasExplicitPrimaryKey: table.inlinePrimaryKey || table.configuredPrimaryKey,
    referenceTargets,
    referencedPrecedingTables: referenceTargets.filter((target) => precedingTables.has(target)),
    referencedWaveFiveTables: referenceTargets.filter((target) => waveFiveTables.has(target)),
    unresolvedReferences: referenceTargets.filter((target) => target.startsWith("UNRESOLVED:")),
    indexes: table.indexes.map(({ name, unique }) => ({ name, unique })),
    inlineUniqueColumns: table.columns.filter((column) => column.inlineUnique).map((column) => column.property),
  };
});

// A table may validly use a configured composite primary key and therefore have no `id` column.
const keyGaps = rows.filter((row) => !row.hasExplicitPrimaryKey);
const unresolvedDependencies = rows.filter((row) => row.unresolvedReferences.length > 0);
const missingSourceDeclarations = rows.filter((row) => row.missingSourceDeclaration);
const heldTableOverlap = WAVE_FIVE_TABLES.filter((tableName) => HELD_TABLES.includes(tableName));
const emptyConfiguredIndexNames = rows.flatMap((row) => row.indexes.filter(({ name }) => !name).map(() => ({ tableName: row.tableName }))).sort((a, b) => a.tableName.localeCompare(b.tableName));
const duplicateConfiguredIndexNames = rows.flatMap((row) => {
  const names = row.indexes.map(({ name }) => name).filter(Boolean);
  return [...new Set(names)].filter((name) => names.filter((candidate) => candidate === name).length > 1).map((name) => ({ tableName: row.tableName, name }));
}).sort((a, b) => `${a.tableName}:${a.name}`.localeCompare(`${b.tableName}:${b.name}`));
const repeatedNamesAcrossTables = [...new Set(rows.flatMap((row) => row.indexes.map(({ name }) => name).filter(Boolean)))].map((name) => ({ name, tables: rows.filter((row) => row.indexes.some((index) => index.name === name)).map(({ tableName }) => tableName).sort() })).filter(({ tables }) => tables.length > 1).sort((a, b) => a.name.localeCompare(b.name));
const sourceOrderDependencies = rows.filter((row) => row.referencedWaveFiveTables.length > 0).map((row) => ({ tableName: row.tableName, dependsOn: row.referencedWaveFiveTables }));
const inlineUniqueColumns = rows.flatMap((row) => row.inlineUniqueColumns.map((column) => ({ tableName: row.tableName, column })));

const output = {
  scope: "Planning only. Parsed repository source metadata; no database connection, SQL generation, DDL, or source-schema reconciliation was performed.",
  wave: 5,
  title: "Intelligence, learning, analytics and secondary capabilities",
  originalFinalWaveTableCount: ORIGINAL_WAVE_FIVE_TABLES.length,
  alreadyWavedOperationalChannels: ALREADY_WAVED_OPERATIONAL_CHANNELS,
  expectedTableCount: WAVE_FIVE_TABLES.length,
  inspectedTableCount: rows.length,
  prerequisiteTableCount: precedingTables.size,
  prerequisiteTables: [...precedingTables].sort(),
  configuredGenerationSource: "drizzle/schema.ts",
  heldTablesExcluded: HELD_TABLES,
  heldTableOverlap,
  missingSourceDeclarations,
  explicitPrimaryKeyGaps: keyGaps,
  unresolvedDependencies,
  sourceOrderDependencies,
  emptyConfiguredIndexNames,
  duplicateConfiguredIndexNames,
  repeatedNamesAcrossTables,
  inlineUniqueColumns,
  rows,
  readiness: {
    tableSetComplete: rows.length === WAVE_FIVE_TABLES.length,
    originalOperationalChannelsAlreadyWaved: ALREADY_WAVED_OPERATIONAL_CHANNELS.every((tableName) => !WAVE_FIVE_TABLES.includes(tableName)),
    explicitKeysComplete: keyGaps.length === 0,
    sourceDeclarationsComplete: missingSourceDeclarations.length === 0,
    dependenciesResolved: unresolvedDependencies.length === 0,
    heldTablesExcluded: heldTableOverlap.length === 0,
    noEmptyConfiguredIndexNames: emptyConfiguredIndexNames.length === 0,
    noDuplicateConfiguredIndexNames: duplicateConfiguredIndexNames.length === 0,
  },
};
output.readiness.readyForSqlGeneration = Object.values(output.readiness).every(Boolean);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  inspected: output.inspectedTableCount,
  originalFinalWaveTableCount: output.originalFinalWaveTableCount,
  alreadyWavedOperationalChannels: output.alreadyWavedOperationalChannels.length,
  keyGaps: keyGaps.length,
  missingSourceDeclarations: missingSourceDeclarations.length,
  unresolvedDependencies: unresolvedDependencies.length,
  sourceOrderDependencies: sourceOrderDependencies.length,
  heldOverlap: heldTableOverlap.length,
  emptyConfiguredIndexNames: emptyConfiguredIndexNames.length,
  duplicateConfiguredIndexNames: duplicateConfiguredIndexNames.length,
  readyForSqlGeneration: output.readiness.readyForSqlGeneration,
}, null, 2));
