/**
 * Applies the approved Gate C global sole-identifier primary-key reconciliation.
 *
 * The input classification is generated from the authoritative source schema by
 * `classify-auto-increment-primary-key-gaps.mjs`. Only candidates classified as
 * `safe_sole_identifier` are changed. Every held composite, junction, or
 * alternative-identity candidate is rejected from this transformation.
 *
 * This changes only `drizzle/schema.ts`; it opens no database, generates no
 * migration, reads no environment variable, and cannot target staging or
 * production.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const classificationPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/auto-increment-primary-key-classification.json");
const dryRun = process.argv.includes("--dry-run");

const classification = JSON.parse(fs.readFileSync(classificationPath, "utf8"));
if (classification.status !== "classification_complete") {
  throw new Error("Primary-key classification is not complete.");
}
if (!Array.isArray(classification.safeSoleIdentifiers) || !Array.isArray(classification.heldForContractDecision)) {
  throw new Error("Primary-key classification has an invalid candidate shape.");
}
if (classification.candidateCount !== classification.safeSoleIdentifiers.length + classification.heldForContractDecision.length) {
  throw new Error("Primary-key classification candidate counts do not reconcile.");
}
if (classification.safeSoleIdentifiers.some(({ classification: result }) => result !== "safe_sole_identifier")) {
  throw new Error("Safe primary-key classification includes a non-safe candidate.");
}
if (classification.heldForContractDecision.some(({ classification: result }) => result !== "held_for_contract_decision")) {
  throw new Error("Held primary-key classification includes a non-held candidate.");
}

const safeTables = new Map(classification.safeSoleIdentifiers.map(({ declaration, tableName }) => [declaration, tableName]));
const heldTables = new Set(classification.heldForContractDecision.map(({ declaration }) => declaration));
const sourceText = fs.readFileSync(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const replacements = [];
const changed = [];
const heldObserved = [];

function nameOf(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
}

for (const statement of sourceFile.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
    const declarationName = declaration.name.text;
    if (!safeTables.has(declarationName) && !heldTables.has(declarationName)) continue;
    if (!ts.isIdentifier(declaration.initializer.expression) || declaration.initializer.expression.text !== "mysqlTable") {
      throw new Error(`${declarationName} is not a direct mysqlTable declaration.`);
    }
    const [tableNameArg, columnsArg] = declaration.initializer.arguments;
    if (!ts.isStringLiteral(tableNameArg) || !ts.isObjectLiteralExpression(columnsArg)) {
      throw new Error(`${declarationName} has an unexpected table declaration shape.`);
    }
    const idProperty = columnsArg.properties.find((property) =>
      ts.isPropertyAssignment(property) && nameOf(property.name) === "id",
    );
    if (!idProperty || !ts.isPropertyAssignment(idProperty)) throw new Error(`${declarationName}.id is missing.`);
    const idExpression = idProperty.initializer.getText(sourceFile);

    if (safeTables.has(declarationName)) {
      const expectedTableName = safeTables.get(declarationName);
      if (tableNameArg.text !== expectedTableName) {
        throw new Error(`${declarationName} does not map to classified table ${expectedTableName}.`);
      }
      if (!idExpression.includes(".autoincrement()") || idExpression.includes(".primaryKey()")) {
        throw new Error(`${declarationName}.id does not have the expected unkeyed auto-increment source shape.`);
      }
      replacements.push({
        start: idProperty.initializer.getStart(sourceFile),
        end: idProperty.initializer.getEnd(),
        text: `${idExpression}.primaryKey()`,
      });
      changed.push({ declaration: declarationName, tableName: tableNameArg.text });
    } else {
      if (!idExpression.includes(".autoincrement()") || idExpression.includes(".primaryKey()")) {
        throw new Error(`Held candidate ${declarationName}.id unexpectedly changed before reconciliation.`);
      }
      heldObserved.push({ declaration: declarationName, tableName: tableNameArg.text });
    }
  }
}

if (changed.length !== safeTables.size) {
  const found = new Set(changed.map(({ declaration }) => declaration));
  throw new Error(`Safe classified table set mismatch; missing ${[...safeTables.keys()].filter((key) => !found.has(key)).join(", ")}.`);
}
if (heldObserved.length !== heldTables.size) {
  const found = new Set(heldObserved.map(({ declaration }) => declaration));
  throw new Error(`Held classified table set mismatch; missing ${[...heldTables].filter((key) => !found.has(key)).join(", ")}.`);
}

if (!dryRun) {
  let updated = sourceText;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  fs.writeFileSync(schemaPath, updated);
}

console.log(JSON.stringify({
  scope: "Gate C repository-only classified sole-identifier primary-key reconciliation; no database, migration, environment, staging, or production operation was used.",
  dryRun,
  candidateCount: classification.candidateCount,
  changedSafeSoleIdentifierCount: changed.length,
  heldForContractDecisionCount: heldObserved.length,
  changed,
  heldObserved,
  status: "passed",
}, null, 2));
