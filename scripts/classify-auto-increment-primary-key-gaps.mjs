/**
 * Gate C global auto-increment primary-key classification.
 *
 * This is a repository-only AST analysis. It classifies every remaining
 * auto-increment `id` lacking `.primaryKey()` as either safe for the approved
 * sole-identifier correction or held for a separate contract decision.
 *
 * A candidate is safe only when its table has no other primary-key declaration,
 * no direct or configured unique identity constraint outside `id`, and is not a
 * many-to-many/junction candidate. The latter is deliberately conservative:
 * two identifier-like `*Id`/`*_id` columns are held even where legacy metadata
 * does not declare both relationships with `.references()`.
 * It never opens a database, generates SQL, or edits source metadata.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const outputPath = path.resolve(repoRoot, process.argv[2] ?? "audit/gate-c-scratch-baseline/auto-increment-primary-key-classification.json");
if (!outputPath.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error("Output path must be inside the repository.");
}

const completedWaveTables = new Set([
  "users", "tenants", "tenant_invitations",
  "claim_assignments", "claim_documents", "claims", "drivers", "inspections",
  "insurance_audit_logs", "insurance_carriers", "insurance_policies", "insurance_products", "insurance_quotes",
  "measurement_types", "vehicle_condition_assessment", "vehicle_condition_snapshots", "vehicle_damage_history",
  "vehicle_geometry_measurements", "vehicle_market_valuations", "vehicle_mileage_logs", "vehicle_models",
  "vehicle_passport_snapshots", "vehicle_registry",
]);

const text = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

function hasMethodCall(node, methodName) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === methodName) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function directCallNames(node, factoryName) {
  const names = [];
  const visit = (child) => {
    if (!ts.isCallExpression(child)) return ts.forEachChild(child, visit);
    const expression = child.expression;
    if (ts.isIdentifier(expression) && expression.text === factoryName) {
      names.push(child.arguments[0] && ts.isStringLiteral(child.arguments[0]) ? child.arguments[0].text : null);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names;
}

function tableColumnReferences(columnInitializer) {
  return hasMethodCall(columnInitializer, "references");
}

function tableConfigHasPrimaryKey(configNode) {
  return directCallNames(configNode, "primaryKey").length > 0;
}

function tableConfigUniqueIndexes(configNode) {
  return directCallNames(configNode, "uniqueIndex");
}

const candidates = [];
for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
    const initializer = declaration.initializer;
    if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== "mysqlTable") continue;
    const [tableNameArgument, columnsArgument, configArgument] = initializer.arguments;
    if (!ts.isStringLiteral(tableNameArgument) || !columnsArgument || !ts.isObjectLiteralExpression(columnsArgument)) continue;
    if (completedWaveTables.has(tableNameArgument.text)) continue;

    const properties = columnsArgument.properties.filter(ts.isPropertyAssignment);
    const idProperty = properties.find((property) => propertyName(property.name) === "id");
    if (!idProperty || !ts.isPropertyAssignment(idProperty)) continue;
    const idText = idProperty.initializer.getText(sourceFile);
    if (!idText.includes(".autoincrement()") || idText.includes(".primaryKey()")) continue;

    const foreignKeyColumns = [];
    const identifierLikeReferenceColumns = [];
    const directUniqueColumns = [];
    for (const property of properties) {
      const name = propertyName(property.name);
      if (!name || name === "id") continue;
      if (tableColumnReferences(property.initializer)) foreignKeyColumns.push(name);
      if (/(?:Id|_id)$/.test(name)) identifierLikeReferenceColumns.push(name);
      if (hasMethodCall(property.initializer, "unique")) directUniqueColumns.push(name);
    }

    const configText = configArgument?.getText(sourceFile) ?? "";
    const configuredUniqueIndexNames = configArgument ? tableConfigUniqueIndexes(configArgument) : [];
    const hasConfiguredPrimaryKey = configArgument ? tableConfigHasPrimaryKey(configArgument) : false;
    const junctionCandidate = identifierLikeReferenceColumns.length >= 2;
    const alternativeIdentity = directUniqueColumns.length > 0 || configuredUniqueIndexNames.length > 0;
    const heldReasons = [];
    if (hasConfiguredPrimaryKey) heldReasons.push("source_declared_primary_key_elsewhere");
    if (junctionCandidate) heldReasons.push("two_or_more_identifier_like_reference_columns");
    if (directUniqueColumns.length > 0) heldReasons.push("direct_unique_identity_column_outside_id");
    if (configuredUniqueIndexNames.length > 0) heldReasons.push("configured_unique_identity_constraint_outside_id");

    candidates.push({
      tableName: tableNameArgument.text,
      declaration: declaration.name.text,
      line: sourceFile.getLineAndCharacterOfPosition(idProperty.getStart(sourceFile)).line + 1,
      autoIncrementColumn: "id",
      foreignKeyColumns,
      identifierLikeReferenceColumns,
      directUniqueColumns,
      configuredUniqueIndexNames,
      hasConfiguredPrimaryKey,
      tableConfigPresent: Boolean(configArgument),
      classification: heldReasons.length === 0 ? "safe_sole_identifier" : "held_for_contract_decision",
      heldReasons,
      sourceExcerpt: `id: ${idText}`,
      configUsesUniqueIndex: configText.includes("uniqueIndex("),
    });
  }
}

const safe = candidates.filter(({ classification }) => classification === "safe_sole_identifier");
const held = candidates.filter(({ classification }) => classification === "held_for_contract_decision");
const byReason = Object.fromEntries(
  [...new Set(held.flatMap(({ heldReasons }) => heldReasons))]
    .sort()
    .map((reason) => [reason, held.filter(({ heldReasons }) => heldReasons.includes(reason)).map(({ tableName }) => tableName)]),
);

const output = {
  scope: "Repository-only AST classification of future-wave auto-increment id declarations. No database connection, SQL generation, or source modification was performed.",
  rule: "safe_sole_identifier requires no source-declared alternative primary/unique identity outside id and fewer than two identifier-like *Id/*_id columns; all other candidates are held for a separate contract decision.",
  source: "drizzle/schema.ts",
  completedWaveTablesExcluded: [...completedWaveTables].sort(),
  candidateCount: candidates.length,
  safeSoleIdentifierCount: safe.length,
  heldForContractDecisionCount: held.length,
  safeSoleIdentifiers: safe,
  heldForContractDecision: held,
  heldTablesByReason: byReason,
  status: safe.length + held.length === candidates.length ? "classification_complete" : "classification_incomplete",
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath: path.relative(repoRoot, outputPath),
  candidateCount: output.candidateCount,
  safeSoleIdentifierCount: output.safeSoleIdentifierCount,
  heldForContractDecisionCount: output.heldForContractDecisionCount,
  status: output.status,
}, null, 2));
