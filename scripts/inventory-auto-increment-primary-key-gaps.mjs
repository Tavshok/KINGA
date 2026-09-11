/**
 * Gate C source-only identity-key inventory.
 *
 * Scans the authoritative configured `drizzle/schema.ts` declaration module.
 * It does not connect to a database, generate SQL, or modify source. The
 * completed Wave 1 and Wave 2 table sets are excluded from the reported gap
 * list so the output is the requested future-wave decision input.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
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
const allAutoIncrementWithoutPrimaryKey = [];

for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
    const initializer = declaration.initializer;
    if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== "mysqlTable") continue;
    const [tableNameArgument, columnsArgument] = initializer.arguments;
    if (!ts.isStringLiteral(tableNameArgument) || !columnsArgument || !ts.isObjectLiteralExpression(columnsArgument)) continue;
    const idProperty = columnsArgument.properties.find((property) =>
      ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === "id",
    );
    if (!idProperty || !ts.isPropertyAssignment(idProperty)) continue;
    const expression = idProperty.initializer.getText(sourceFile);
    if (!expression.includes(".autoincrement()") || expression.includes(".primaryKey()")) continue;
    allAutoIncrementWithoutPrimaryKey.push({
      tableName: tableNameArgument.text,
      declaration: declaration.name.text,
      line: sourceFile.getLineAndCharacterOfPosition(idProperty.getStart(sourceFile)).line + 1,
      excludedAsCompletedWave: completedWaveTables.has(tableNameArgument.text),
    });
  }
}

const futureWaveGaps = allAutoIncrementWithoutPrimaryKey.filter(({ excludedAsCompletedWave }) => !excludedAsCompletedWave);
console.log(JSON.stringify({
  scope: "Authoritative drizzle/schema.ts static inventory only; no database connection, SQL generation, or source modification.",
  completedWaveTablesExcluded: [...completedWaveTables].sort(),
  allUnkeyedAutoIncrementIdentityCount: allAutoIncrementWithoutPrimaryKey.length,
  futureWaveUnkeyedAutoIncrementIdentityCount: futureWaveGaps.length,
  futureWaveGaps,
  status: "inventory_complete",
}, null, 2));
