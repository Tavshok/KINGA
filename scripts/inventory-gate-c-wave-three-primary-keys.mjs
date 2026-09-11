import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { WAVE_THREE_TABLES } from "./gate-c-wave-three-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const outputPath = path.resolve(repoRoot, process.argv[2] ?? "audit/gate-c-scratch-baseline/wave-03-primary-key-inventory.json");
if (!outputPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error("Output path must be inside the repository.");

const text = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const rows = [];
function nameOf(node) { return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null; }
function hasConfiguredPrimaryKey(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === "primaryKey") { found = true; return; }
    ts.forEachChild(child, visit);
  };
  if (node) visit(node);
  return found;
}
for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
    if (!ts.isIdentifier(declaration.initializer.expression) || declaration.initializer.expression.text !== "mysqlTable") continue;
    const [tableNameArg, columnsArg, configArg] = declaration.initializer.arguments;
    if (!ts.isStringLiteral(tableNameArg) || !WAVE_THREE_TABLES.includes(tableNameArg.text) || !ts.isObjectLiteralExpression(columnsArg)) continue;
    const id = columnsArg.properties.find((property) => ts.isPropertyAssignment(property) && nameOf(property.name) === "id");
    const idExpression = id && ts.isPropertyAssignment(id) ? id.initializer.getText(sourceFile) : null;
    const inlinePrimaryKey = Boolean(idExpression?.includes(".primaryKey()"));
    const configuredPrimaryKey = hasConfiguredPrimaryKey(configArg);
    rows.push({
      tableName: tableNameArg.text,
      declaration: declaration.name.text,
      idExpression,
      inlinePrimaryKey,
      configuredPrimaryKey,
      hasExplicitPrimaryKey: inlinePrimaryKey || configuredPrimaryKey,
      line: id && ts.isPropertyAssignment(id) ? sourceFile.getLineAndCharacterOfPosition(id.getStart(sourceFile)).line + 1 : null,
    });
  }
}
const missing = rows.filter(({ hasExplicitPrimaryKey }) => !hasExplicitPrimaryKey);
const output = {
  scope: "Repository-only Wave 3 source key inventory. No database connection, SQL generation, DDL, staging, production, or source write occurred.",
  expectedWaveThreeTableCount: WAVE_THREE_TABLES.length,
  inspectedTableCount: rows.length,
  explicitPrimaryKeyCount: rows.length - missing.length,
  missingExplicitPrimaryKeyCount: missing.length,
  missing,
  rows,
  status: rows.length === WAVE_THREE_TABLES.length ? "complete" : "incomplete",
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ inspected: output.inspectedTableCount, explicit: output.explicitPrimaryKeyCount, missing: output.missingExplicitPrimaryKeyCount, status: output.status }, null, 2));
