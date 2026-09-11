/**
 * Reconciles the five Wave 3 stable string IDs identified by the complete
 * source-only Wave 3 key inventory. These are not auto-increment IDs; each
 * already has a required `id` property and lacks any other primary key.
 *
 * The script adds only `.primaryKey()` to the existing ID declaration. It has
 * no database client, SQL generator, DDL executor, environment access, or
 * staging/production path.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const inventoryPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/wave-03-primary-key-inventory.json");
const approved = new Map([
  ["documentNamingTemplates", "document_naming_templates"],
  ["pdfReports", "pdf_reports"],
  ["reportLinks", "report_links"],
  ["reportSnapshots", "report_snapshots"],
  ["marketplaceProfiles", "marketplace_profiles"],
]);
const dryRun = process.argv.includes("--dry-run");
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const missing = new Map((inventory.missing ?? []).map(({ declaration, tableName }) => [declaration, tableName]));
if (inventory.status !== "complete" || inventory.missingExplicitPrimaryKeyCount !== approved.size || [...approved].some(([declaration, tableName]) => missing.get(declaration) !== tableName)) {
  throw new Error("Wave 3 string-ID inventory does not match the reviewed five-table source contract.");
}

const text = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const replacements = [];
const applied = [];
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
    if (!ts.isIdentifier(declaration.name) || !approved.has(declaration.name.text) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
    if (!ts.isIdentifier(declaration.initializer.expression) || declaration.initializer.expression.text !== "mysqlTable") throw new Error(`${declaration.name.text} is not a mysqlTable declaration.`);
    const [tableNameArg, columnsArg, configArg] = declaration.initializer.arguments;
    if (!ts.isStringLiteral(tableNameArg) || tableNameArg.text !== approved.get(declaration.name.text) || !ts.isObjectLiteralExpression(columnsArg)) throw new Error(`${declaration.name.text} source shape changed.`);
    const id = columnsArg.properties.find((property) => ts.isPropertyAssignment(property) && nameOf(property.name) === "id");
    if (!id || !ts.isPropertyAssignment(id)) throw new Error(`${declaration.name.text}.id is missing.`);
    const expression = id.initializer.getText(sourceFile);
    if (!expression.includes("varchar(") || !expression.includes(".notNull()") || expression.includes(".primaryKey()") || hasConfiguredPrimaryKey(configArg)) {
      throw new Error(`${declaration.name.text}.id no longer has the reviewed required-string-ID shape.`);
    }
    replacements.push({ start: id.initializer.getStart(sourceFile), end: id.initializer.getEnd(), text: `${expression}.primaryKey()` });
    applied.push({ declaration: declaration.name.text, tableName: tableNameArg.text });
  }
}
if (applied.length !== approved.size) throw new Error(`Wave 3 string-ID reconciler applied ${applied.length}/${approved.size} reviewed tables.`);
if (!dryRun) {
  let updated = text;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  fs.writeFileSync(schemaPath, updated);
}
console.log(JSON.stringify({ scope: "Gate C Wave 3 source-only required-string-ID primary-key reconciliation; no database, SQL generation, DDL, staging, production, migration-account, or data operation occurred.", dryRun, appliedCount: applied.length, applied, status: "passed" }, null, 2));
