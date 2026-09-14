/**
 * Gate C source-metadata reconciliation only.
 *
 * Converts timestamp(...).default('CURRENT_TIMESTAMP') to defaultNow() in the
 * configured Drizzle source after verifying the exact reviewed inventory. This
 * script never opens a database, reads environment variables, invokes Drizzle,
 * generates SQL, or touches migration artefacts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, "drizzle", "schema.ts");
const reviewedInventoryPath = path.join(repoRoot, "audit", "gate-c-scratch-baseline", "quoted-current-timestamp-defaults.json");
const receiptPath = path.join(repoRoot, "audit", "gate-c-scratch-baseline", "quoted-current-timestamp-defaults-reconciliation.json");
const apply = process.argv.includes("--apply");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isTimestampRoot(node) {
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "timestamp") return true;
    if (ts.isPropertyAccessExpression(node.expression)) return isTimestampRoot(node.expression.expression);
  }
  return false;
}

function findQuotedTimestampDefault(node) {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isPropertyAccessExpression(node.expression)) {
    if (
      node.expression.name.text === "default"
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === "CURRENT_TIMESTAMP"
      && isTimestampRoot(node.expression.expression)
    ) {
      return {
        defaultStart: node.expression.expression.getEnd(),
        defaultEnd: node.getEnd(),
      };
    }
    return findQuotedTimestampDefault(node.expression.expression);
  }
  return null;
}

const source = fs.readFileSync(sourcePath, "utf8");
const reviewedInventory = JSON.parse(fs.readFileSync(reviewedInventoryPath, "utf8"));
const expectedOccurrences = reviewedInventory.occurrences;
const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const replacements = [];

function visit(node) {
  if (ts.isPropertyAssignment(node) && node.initializer) {
    const literal = findQuotedTimestampDefault(node.initializer);
    if (literal) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      replacements.push({
        line,
        field: node.name.getText(sourceFile),
        defaultStart: literal.defaultStart,
        defaultEnd: literal.defaultEnd,
      });
    }
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);

if (replacements.length !== expectedOccurrences.length) {
  throw new Error(`Reviewed timestamp-default count mismatch: expected ${expectedOccurrences.length}, found ${replacements.length}. No source was changed.`);
}

const expectedByLine = new Map(expectedOccurrences.map((entry) => [entry.line, entry]));
for (const replacement of replacements) {
  if (!expectedByLine.has(replacement.line)) {
    throw new Error(`Unreviewed quoted timestamp default at schema.ts:${replacement.line}. No source was changed.`);
  }
}

if (!apply) {
  console.log(JSON.stringify({
    scope: "Gate C source-only timestamp-default reconciliation dry run",
    reviewedOccurrences: expectedOccurrences.length,
    astVerifiedOccurrences: replacements.length,
    wouldChange: replacements.map(({ line, field }) => ({ line, field })),
    status: "ready",
  }, null, 2));
  process.exit(0);
}

let reconciled = source;
for (const replacement of [...replacements].sort((a, b) => b.defaultStart - a.defaultStart)) {
  reconciled = `${reconciled.slice(0, replacement.defaultStart)}.defaultNow()${reconciled.slice(replacement.defaultEnd)}`;
}

const remainingSourceFile = ts.createSourceFile(sourcePath, reconciled, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let remaining = 0;
function countRemaining(node) {
  if (ts.isPropertyAssignment(node) && node.initializer && findQuotedTimestampDefault(node.initializer)) remaining += 1;
  ts.forEachChild(node, countRemaining);
}
countRemaining(remainingSourceFile);
if (remaining !== 0) {
  throw new Error(`Reconciliation left ${remaining} quoted timestamp defaults. No source was changed.`);
}

fs.writeFileSync(sourcePath, reconciled);
fs.writeFileSync(receiptPath, `${JSON.stringify({
  scope: "Gate C source-metadata reconciliation only; no database or migration operation was performed.",
  inputSchemaSha256: sha256(source),
  outputSchemaSha256: sha256(reconciled),
  reviewedInventorySha256: sha256(fs.readFileSync(reviewedInventoryPath, "utf8")),
  approvedOccurrenceCount: expectedOccurrences.length,
  astVerifiedOccurrenceCount: replacements.length,
  remainingQuotedTimestampDefaults: remaining,
  changedOccurrences: expectedOccurrences.map(({ table, field, line }) => ({ table, field, line })),
}, null, 2)}\n`);

console.log(JSON.stringify({
  scope: "Gate C source-only timestamp-default reconciliation",
  changedOccurrences: replacements.length,
  remainingQuotedTimestampDefaults: remaining,
  receiptPath: path.relative(repoRoot, receiptPath),
  status: "applied",
}, null, 2));
