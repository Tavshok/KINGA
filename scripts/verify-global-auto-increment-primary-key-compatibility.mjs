/**
 * Gate C source-only compatibility proof for the all-table explicit primary-key pass.
 *
 * This verifies every residual gap from the previous safe-subset reconciliation
 * has a named `id` property, still uses `.autoincrement()`, does not already use
 * `.primaryKey()`, and has no configured `primaryKey(...)` elsewhere in its
 * mysqlTable declaration. It does not modify source, generate SQL, or open a
 * database.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const residualInventoryPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/auto-increment-primary-key-gaps-held-after-global-safe-pass.json");
const outputPath = path.resolve(repoRoot, process.argv[2] ?? "audit/gate-c-scratch-baseline/global-primary-key-compatibility.json");
if (!outputPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error("Output path must be inside the repository.");

const residual = JSON.parse(fs.readFileSync(residualInventoryPath, "utf8"));
if (!Array.isArray(residual.futureWaveGaps) || residual.futureWaveUnkeyedAutoIncrementIdentityCount !== residual.futureWaveGaps.length) {
  throw new Error("Residual primary-key inventory is incomplete or inconsistent.");
}
const expectedByDeclaration = new Map(residual.futureWaveGaps.map(({ declaration, tableName }) => [declaration, tableName]));
const text = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const compatible = [];
const conflicts = [];

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
}

function hasPrimaryKeyCall(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === "primaryKey") {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !expectedByDeclaration.has(declaration.name.text)) continue;
    const expectedTableName = expectedByDeclaration.get(declaration.name.text);
    const initializer = declaration.initializer;
    const problems = [];
    if (!initializer || !ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression) || initializer.expression.text !== "mysqlTable") {
      problems.push("not_direct_mysql_table_declaration");
    }
    const [tableNameArgument, columnsArgument, configArgument] = initializer?.arguments ?? [];
    if (!ts.isStringLiteral(tableNameArgument) || tableNameArgument.text !== expectedTableName) problems.push("unexpected_physical_table_name");
    if (!columnsArgument || !ts.isObjectLiteralExpression(columnsArgument)) problems.push("missing_object_literal_columns");
    const idProperty = columnsArgument && ts.isObjectLiteralExpression(columnsArgument)
      ? columnsArgument.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property.name) === "id")
      : undefined;
    if (!idProperty || !ts.isPropertyAssignment(idProperty)) problems.push("missing_id_property");
    const idExpression = idProperty && ts.isPropertyAssignment(idProperty) ? idProperty.initializer.getText(sourceFile) : null;
    if (!idExpression?.includes(".autoincrement()")) problems.push("id_not_auto_increment");
    if (idExpression?.includes(".primaryKey()")) problems.push("id_already_primary_key");
    if (configArgument && hasPrimaryKeyCall(configArgument)) problems.push("configured_primary_key_elsewhere");
    const record = {
      declaration: declaration.name.text,
      tableName: expectedTableName,
      line: idProperty && ts.isPropertyAssignment(idProperty) ? sourceFile.getLineAndCharacterOfPosition(idProperty.getStart(sourceFile)).line + 1 : null,
      idExpression,
      problems,
    };
    if (problems.length === 0) compatible.push(record);
    else conflicts.push(record);
  }
}

const found = new Set([...compatible, ...conflicts].map(({ declaration }) => declaration));
const missing = [...expectedByDeclaration.keys()].filter((declaration) => !found.has(declaration));
if (missing.length > 0) conflicts.push({ declaration: null, tableName: null, line: null, idExpression: null, problems: [`missing_declarations:${missing.join(",")}`] });

const output = {
  scope: "Repository-only source compatibility proof. No database connection, SQL generation, DDL, source write, environment access, staging, or production operation occurred.",
  expectedResidualCount: expectedByDeclaration.size,
  compatibleAutoIncrementIdCount: compatible.length,
  conflictCount: conflicts.length,
  compatible,
  conflicts,
  status: conflicts.length === 0 && compatible.length === expectedByDeclaration.size ? "all_compatible" : "conflicts_found",
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath: path.relative(repoRoot, outputPath),
  expectedResidualCount: output.expectedResidualCount,
  compatibleAutoIncrementIdCount: output.compatibleAutoIncrementIdCount,
  conflictCount: output.conflictCount,
  status: output.status,
}, null, 2));
