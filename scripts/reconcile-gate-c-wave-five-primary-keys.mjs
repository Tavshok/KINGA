/**
 * Gate C Wave 5 source-only primary-key reconciliation.
 *
 * It permits exactly five approved existing required string IDs to receive
 * `.primaryKey()` and `tenant_role_configs` to receive the separately
 * approved composite key `(tenantId, roleKey)`. It has no database client,
 * SQL generator, DDL executor, environment access, or external target.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const approvedStringIds = new Map([
  ["insurerTenants", "insurer_tenants"],
  ["isoAuditLogs", "iso_audit_logs"],
  ["riskRegister", "risk_register"],
  ["routingHistory", "routing_history"],
  ["routingThresholdConfig", "routing_threshold_config"],
]);
const tenantRoleConfig = ["tenantRoleConfigs", "tenant_role_configs"];
const dryRun = process.argv.includes("--dry-run");
const verifyOnly = process.argv.includes("--verify");
if (dryRun && verifyOnly) throw new Error("Choose either --dry-run or --verify, not both.");

const text = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const replacements = [];
const applied = [];
let mysqlCoreImport = null;
let tenantRoleDeclaration = null;

function nodeName(node) { return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null; }
function callName(node) { return ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? node.expression.text : null; }
function containsPrimaryKey(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === "primaryKey") { found = true; return; }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

for (const statement of sourceFile.statements) {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "drizzle-orm/mysql-core") mysqlCoreImport = statement;
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer) || callName(declaration.initializer) !== "mysqlTable") continue;
    const [tableNameArg, columnsArg, configArg] = declaration.initializer.arguments;
    if (!ts.isStringLiteral(tableNameArg) || !ts.isObjectLiteralExpression(columnsArg)) continue;
    if (approvedStringIds.has(declaration.name.text)) {
      if (tableNameArg.text !== approvedStringIds.get(declaration.name.text)) throw new Error(`${declaration.name.text} no longer maps to its approved physical table.`);
      const id = columnsArg.properties.find((property) => ts.isPropertyAssignment(property) && nodeName(property.name) === "id");
      if (!id || !ts.isPropertyAssignment(id)) throw new Error(`${declaration.name.text}.id is missing.`);
      const idExpression = id.initializer.getText(sourceFile);
      if (!idExpression.includes("varchar(") || !idExpression.includes(".notNull()")) throw new Error(`${declaration.name.text}.id no longer has the approved required-string-ID shape.`);
      const alreadyApplied = idExpression.includes(".primaryKey()") && !containsPrimaryKey(configArg ?? columnsArg);
      if (verifyOnly && !alreadyApplied) throw new Error(`${declaration.name.text}.id does not retain the approved explicit primary key.`);
      if (!verifyOnly && alreadyApplied) throw new Error(`${declaration.name.text}.id already declares a primary key; use --verify to prove the completed contract.`);
      if (!verifyOnly) replacements.push({ start: id.initializer.getStart(sourceFile), end: id.initializer.getEnd(), text: `${idExpression}.primaryKey()` });
      applied.push({ declaration: declaration.name.text, tableName: tableNameArg.text, key: "id" });
    }
    if (declaration.name.text === tenantRoleConfig[0]) {
      if (tableNameArg.text !== tenantRoleConfig[1]) throw new Error("tenantRoleConfigs no longer maps to tenant_role_configs.");
      const propertyNames = columnsArg.properties.filter(ts.isPropertyAssignment).map((property) => nodeName(property.name));
      if (propertyNames.includes("id") || !propertyNames.includes("tenantId") || !propertyNames.includes("roleKey")) throw new Error("tenantRoleConfigs no longer has the approved composite-key source shape.");
      const expectedConfiguration = "primaryKey({ columns: [table.tenantId, table.roleKey] })";
      const alreadyApplied = Boolean(configArg && configArg.getText(sourceFile).replace(/\s+/g, " ").includes(expectedConfiguration));
      if (verifyOnly && !alreadyApplied) throw new Error("tenantRoleConfigs does not retain the approved composite key.");
      if (!verifyOnly && alreadyApplied) throw new Error("tenantRoleConfigs already declares a primary key; use --verify to prove the completed contract.");
      if (!verifyOnly && configArg) throw new Error("tenantRoleConfigs source shape has an unexpected existing key configuration.");
      tenantRoleDeclaration = { end: columnsArg.getEnd(), declaration: declaration.name.text, tableName: tableNameArg.text, alreadyApplied };
    }
  }
}

if (!mysqlCoreImport) throw new Error("Unable to locate drizzle-orm/mysql-core import.");
if (applied.length !== approvedStringIds.size) throw new Error(`Applied ${applied.length}/${approvedStringIds.size} approved string-ID reconciliations.`);
if (!tenantRoleDeclaration) throw new Error("Unable to locate approved tenant-role configuration declaration.");
const importText = mysqlCoreImport.getText(sourceFile);
if (!verifyOnly && !importText.includes("primaryKey")) {
  const close = importText.lastIndexOf(" }");
  if (close < 0) throw new Error("Unexpected mysql-core import shape.");
  replacements.push({ start: mysqlCoreImport.getStart(sourceFile), end: mysqlCoreImport.getEnd(), text: `${importText.slice(0, close)}, primaryKey${importText.slice(close)}` });
}
if (!verifyOnly) replacements.push({
  start: tenantRoleDeclaration.end,
  end: tenantRoleDeclaration.end,
  text: ", (table) => [primaryKey({ columns: [table.tenantId, table.roleKey] })]",
});
applied.push({ declaration: tenantRoleDeclaration.declaration, tableName: tenantRoleDeclaration.tableName, key: "tenantId,roleKey" });

if (!dryRun && !verifyOnly) {
  let updated = text;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  fs.writeFileSync(schemaPath, updated);
}

console.log(JSON.stringify({
  scope: "Gate C Wave 5 source-only approved primary-key reconciliation; no database, SQL generation, DDL, staging, production, migration-account, or data operation occurred.",
  mode: verifyOnly ? "verify" : dryRun ? "dry-run" : "apply",
  appliedCount: applied.length,
  applied,
  status: "passed",
}, null, 2));
