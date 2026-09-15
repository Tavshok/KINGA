import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  throw new Error('Usage: node scripts/audit-wave5-compatibility.mjs <revised-wave-05-source.sql> <output.json>');
}

const sourcePath = resolve(sourceArg);
const source = readFileSync(sourcePath, 'utf8');
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const marker = '--> statement-breakpoint';
const markerCount = (source.match(/--> statement-breakpoint/g) ?? []).length;
const fragments = source.split(marker).map((fragment) => fragment.trim()).filter(Boolean);

if (markerCount !== 290 || fragments.length !== 290 || !source.trimEnd().endsWith(marker)) {
  throw new Error(`Unexpected marker framing: markers=${markerCount}, non_empty_fragments=${fragments.length}, trailing_marker=${source.trimEnd().endsWith(marker)}`);
}

const tableColumns = new Map();
for (const match of source.matchAll(/CREATE TABLE `([^`]+)` \((.*?)\);/gs)) {
  const [, tableName, definition] = match;
  const columns = new Map();
  for (const column of definition.matchAll(/^\s*`([^`]+)`\s+(tinyblob|blob|mediumblob|longblob|tinytext|text|mediumtext|longtext)\b/imsg)) {
    columns.set(column[1], column[2].toLowerCase());
  }
  tableColumns.set(tableName, columns);
}

const plainTextBlobIndexes = [];
for (const match of source.matchAll(/^CREATE INDEX `([^`]+)` ON `([^`]+)` \((.+)\);$/gm)) {
  const [, indexName, tableName, indexColumns] = match;
  const textColumns = tableColumns.get(tableName) ?? new Map();
  for (const indexedColumn of indexColumns.matchAll(/`([^`]+)`(?:\((\d+)\))?/g)) {
    const [, columnName, prefixLength] = indexedColumn;
    const type = textColumns.get(columnName);
    if (type && !prefixLength) {
      plainTextBlobIndexes.push({ table: tableName, index: indexName, column: columnName, type });
    }
  }
}

const legacyJsonTextDefaults = [...source.matchAll(/`([^`]+)`\s+text\b[^,]*\bDEFAULT \('(\[\]|\{\})'\)/gim)]
  .map((match) => ({ column: match[1], literal: match[2] }));
const compatibleJsonExpressionDefaults = [...source.matchAll(/`([^`]+)`\s+text\b[^,]*\bDEFAULT \(JSON_(ARRAY|OBJECT)\(\)\)/gim)]
  .map((match) => ({ column: match[1], expression: `JSON_${match[2]}()` }));

const statementCounts = {
  create_table: fragments.filter((fragment) => fragment.startsWith('CREATE TABLE ')).length,
  add_foreign_key: fragments.filter((fragment) => fragment.startsWith('ALTER TABLE ') && fragment.includes(' FOREIGN KEY ')).length,
  create_index: fragments.filter((fragment) => fragment.startsWith('CREATE INDEX ')).length,
};
if (statementCounts.create_table !== 75 || statementCounts.add_foreign_key !== 25 || statementCounts.create_index !== 190) {
  throw new Error(`Unexpected Wave 5 statement classes: ${JSON.stringify(statementCounts)}`);
}

const audit = {
  schema: 'kinga-d05-compatibility-audit/v1',
  source_file: sourceArg,
  source_sha256: sha256(source),
  marker_literal: marker,
  marker_count: markerCount,
  trailing_marker: true,
  non_empty_statement_count: fragments.length,
  statement_counts: statementCounts,
  legacy_json_shaped_text_defaults: legacyJsonTextDefaults,
  compatible_json_expression_defaults: compatibleJsonExpressionDefaults,
  unprefixed_text_or_blob_indexes: plainTextBlobIndexes,
  result: legacyJsonTextDefaults.length === 0 && plainTextBlobIndexes.length === 0 ? 'PASS' : 'FAIL',
};

writeFileSync(resolve(outputArg), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
if (audit.result !== 'PASS') {
  throw new Error(`Compatibility audit failed: legacy_json_defaults=${legacyJsonTextDefaults.length}, unprefixed_text_or_blob_indexes=${plainTextBlobIndexes.length}`);
}
console.log(JSON.stringify(audit, null, 2));
