/**
 * Applies the approved Gate C Wave 2 primary-key reconciliation.
 *
 * This script changes only named auto-increment `id` declarations in
 * `drizzle/schema.ts`. It has no database imports, connection handling, DDL
 * generation, or environment access. It aborts on any source-shape mismatch.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const approvedTables = new Map([
  ["claimAssignments", "claim_assignments"],
  ["claimDocuments", "claim_documents"],
  ["claims", "claims"],
  ["drivers", "drivers"],
  ["insuranceAuditLogs", "insurance_audit_logs"],
  ["insuranceCarriers", "insurance_carriers"],
  ["insurancePolicies", "insurance_policies"],
  ["insuranceProducts", "insurance_products"],
  ["insuranceQuotes", "insurance_quotes"],
  ["vehicleConditionAssessment", "vehicle_condition_assessment"],
  ["vehicleConditionSnapshots", "vehicle_condition_snapshots"],
  ["vehicleDamageHistory", "vehicle_damage_history"],
  ["vehicleMarketValuations", "vehicle_market_valuations"],
  ["vehicleMileageLogs", "vehicle_mileage_logs"],
  ["vehiclePassportSnapshots", "vehicle_passport_snapshots"],
  ["vehicleRegistry", "vehicle_registry"],
]);

const dryRun = process.argv.includes("--dry-run");
const sourceText = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const replacements = [];
const verified = [];

function terminalName(expression) {
  return ts.isIdentifier(expression) ? expression.text : null;
}

for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !approvedTables.has(declaration.name.text)) continue;
    const tableSymbol = declaration.name.text;
    const expectedTableName = approvedTables.get(tableSymbol);
    const initializer = declaration.initializer;
    if (!initializer || !ts.isCallExpression(initializer) || terminalName(initializer.expression) !== "mysqlTable") {
      throw new Error(`${tableSymbol} is not a direct mysqlTable declaration.`);
    }
    const [tableNameArg, columnsArg] = initializer.arguments;
    if (!tableNameArg || !ts.isStringLiteral(tableNameArg) || tableNameArg.text !== expectedTableName) {
      throw new Error(`${tableSymbol} does not map to approved table ${expectedTableName}.`);
    }
    if (!columnsArg || !ts.isObjectLiteralExpression(columnsArg)) {
      throw new Error(`${tableSymbol} has no object-literal column declaration.`);
    }
    const idProperty = columnsArg.properties.find((property) =>
      ts.isPropertyAssignment(property) && ((ts.isIdentifier(property.name) && property.name.text === "id") || (ts.isStringLiteral(property.name) && property.name.text === "id")),
    );
    if (!idProperty || !ts.isPropertyAssignment(idProperty)) throw new Error(`${tableSymbol}.id is missing.`);

    const idExpression = idProperty.initializer.getText(sourceFile);
    if (!idExpression.includes('.autoincrement()') || idExpression.includes('.primaryKey()')) {
      throw new Error(`${tableSymbol}.id does not have the expected unkeyed auto-increment source shape.`);
    }
    replacements.push({ start: idProperty.initializer.getStart(sourceFile), end: idProperty.initializer.getEnd(), text: `${idExpression}.primaryKey()` });
    verified.push({ symbol: tableSymbol, tableName: expectedTableName });
  }
}

if (verified.length !== approvedTables.size) {
  const found = new Set(verified.map(({ symbol }) => symbol));
  const missing = [...approvedTables.keys()].filter((symbol) => !found.has(symbol));
  throw new Error(`Approved table set mismatch; missing ${missing.join(", ")}.`);
}

if (!dryRun) {
  let updated = sourceText;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  fs.writeFileSync(schemaPath, updated);
}

console.log(JSON.stringify({
  scope: "Gate C Wave 2 source-only approved primary-key reconciliation; no database was opened.",
  dryRun,
  approvedTableCount: approvedTables.size,
  verified,
  status: "passed",
}, null, 2));
