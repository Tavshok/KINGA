/**
 * Applies the authorised Gate C completion pass for residual compatible IDs.
 *
 * The compatibility proof is an input contract: every residual declaration
 * must still have exactly the unkeyed auto-increment `id` shape verified by
 * `verify-global-auto-increment-primary-key-compatibility.mjs`. This script
 * adds only `.primaryKey()` to those IDs. It never adds/changes an index or
 * unique constraint, generates no SQL, opens no database, or reads env values.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const compatibilityPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/global-primary-key-compatibility.json");
const dryRun = process.argv.includes("--dry-run");

const compatibility = JSON.parse(fs.readFileSync(compatibilityPath, "utf8"));
if (compatibility.status !== "all_compatible" || compatibility.conflictCount !== 0) {
  throw new Error("Residual auto-increment primary-key compatibility is not fully proven.");
}
if (!Array.isArray(compatibility.compatible) || compatibility.compatibleAutoIncrementIdCount !== compatibility.compatible.length) {
  throw new Error("Compatibility candidate list is incomplete.");
}

const expected = new Map(compatibility.compatible.map(({ declaration, tableName }) => [declaration, tableName]));
const text = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const replacements = [];
const applied = [];

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
}

for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !expected.has(declaration.name.text)) continue;
    const initializer = declaration.initializer;
    if (!initializer || !ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression) || initializer.expression.text !== "mysqlTable") {
      throw new Error(`${declaration.name.text} is not a direct mysqlTable declaration.`);
    }
    const [tableNameArgument, columnsArgument] = initializer.arguments;
    if (!ts.isStringLiteral(tableNameArgument) || tableNameArgument.text !== expected.get(declaration.name.text)) {
      throw new Error(`${declaration.name.text} no longer maps to the compatible source table.`);
    }
    if (!columnsArgument || !ts.isObjectLiteralExpression(columnsArgument)) throw new Error(`${declaration.name.text} has no object-literal columns.`);
    const idProperty = columnsArgument.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property.name) === "id");
    if (!idProperty || !ts.isPropertyAssignment(idProperty)) throw new Error(`${declaration.name.text}.id is missing.`);
    const idExpression = idProperty.initializer.getText(sourceFile);
    if (!idExpression.includes(".autoincrement()") || idExpression.includes(".primaryKey()")) {
      throw new Error(`${declaration.name.text}.id no longer has the proven compatible unkeyed auto-increment shape.`);
    }
    replacements.push({ start: idProperty.initializer.getStart(sourceFile), end: idProperty.initializer.getEnd(), text: `${idExpression}.primaryKey()` });
    applied.push({ declaration: declaration.name.text, tableName: tableNameArgument.text });
  }
}

if (applied.length !== expected.size) {
  const found = new Set(applied.map(({ declaration }) => declaration));
  throw new Error(`Compatible primary-key set mismatch; missing ${[...expected.keys()].filter((key) => !found.has(key)).join(", ")}.`);
}

if (!dryRun) {
  let updated = text;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  fs.writeFileSync(schemaPath, updated);
}

console.log(JSON.stringify({
  scope: "Gate C source-only residual explicit primary-key completion. Only .primaryKey() was added to proven compatible auto-increment IDs; no unique/index constraint, SQL, database, environment, staging, or production operation was used.",
  dryRun,
  appliedCount: applied.length,
  applied,
  status: "passed",
}, null, 2));
