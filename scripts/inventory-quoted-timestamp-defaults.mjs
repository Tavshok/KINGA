/**
 * Gate C read-only inventory. This script reports each AST-verified
 * timestamp(...).default('CURRENT_TIMESTAMP') expression in the authoritative
 * schema source. It never opens a database and it never rewrites the source.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const repositoryRoot = resolve(import.meta.dirname, "..");
const schemaPath = resolve(repositoryRoot, "drizzle/schema.ts");
const outputDirectory = resolve(repositoryRoot, "audit/gate-c-scratch-baseline");
const outputPath = resolve(outputDirectory, "quoted-current-timestamp-defaults.json");
const waveOneTables = new Set(["tenant_invitations", "tenants", "users"]);

function isTimestampRoot(node) {
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "timestamp") return true;
    if (ts.isPropertyAccessExpression(node.expression)) return isTimestampRoot(node.expression.expression);
  }
  return false;
}

function hasQuotedTimestampDefault(node) {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isPropertyAccessExpression(node.expression)) {
    if (
      node.expression.name.text === "default"
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === "CURRENT_TIMESTAMP"
      && isTimestampRoot(node.expression.expression)
    ) return true;
    return hasQuotedTimestampDefault(node.expression.expression);
  }
  return false;
}

const source = await readFile(schemaPath, "utf8");
const sourceFile = ts.createSourceFile(schemaPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const occurrences = [];

function visit(node) {
  if (
    ts.isVariableDeclaration(node)
    && node.initializer
    && ts.isCallExpression(node.initializer)
    && ts.isIdentifier(node.initializer.expression)
    && node.initializer.expression.text === "mysqlTable"
    && ts.isIdentifier(node.name)
    && ts.isStringLiteral(node.initializer.arguments[0])
    && ts.isObjectLiteralExpression(node.initializer.arguments[1])
  ) {
    const table = node.initializer.arguments[0].text;
    const exportName = node.name.text;
    for (const property of node.initializer.arguments[1].properties) {
      if (!ts.isPropertyAssignment(property) || !property.initializer || !hasQuotedTimestampDefault(property.initializer)) continue;
      occurrences.push({
        line: sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile)).line + 1,
        table,
        exportName,
        field: property.name.getText(sourceFile),
        scope: waveOneTables.has(table) ? "wave_one" : "outside_wave_one",
        source: property.getText(sourceFile),
      });
    }
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);
occurrences.sort((a, b) => a.line - b.line || a.table.localeCompare(b.table) || a.field.localeCompare(b.field));

const result = {
  scope: "repository-only AST-verified quoted CURRENT_TIMESTAMP default inventory",
  source: "drizzle/schema.ts",
  total: occurrences.length,
  waveOneCount: occurrences.filter((occurrence) => occurrence.scope === "wave_one").length,
  outsideWaveOneCount: occurrences.filter((occurrence) => occurrence.scope === "outside_wave_one").length,
  occurrences,
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  total: result.total,
  waveOneCount: result.waveOneCount,
  outsideWaveOneCount: result.outsideWaveOneCount,
  outputPath,
}));
