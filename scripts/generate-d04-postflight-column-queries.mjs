import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = resolve("audit/gate-d-text-index-compatibility-2026-09-14/wave-04-tidb-compatible-source-v2.sql");
const outputDir = resolve("audit/gate-d-d04-postflight-column-queries-2026-09-15");
const source = readFileSync(sourcePath, "utf8");
const tables = [...source.matchAll(/^CREATE TABLE `([^`]+)`/gm)].map((match) => match[1]);
if (tables.length !== 40 || new Set(tables).size !== 40) throw new Error(`Expected 40 unique D-04 tables; found ${tables.length}`);

mkdirSync(outputDir, { recursive: true });
const header = "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA\nFROM information_schema.columns\nWHERE TABLE_SCHEMA = 'kinga_staging'\n";
const footer = "ORDER BY TABLE_NAME, ORDINAL_POSITION;\n";
for (let index = 0; index < tables.length; index += 10) {
  const group = tables.slice(index, index + 10);
  const members = group.map((table) => `  '${table}'`).join(",\n");
  const sql = `${header}  AND TABLE_NAME IN (\n${members}\n  )\n${footer}`;
  const ordinal = String(index / 10 + 1).padStart(2, "0");
  writeFileSync(resolve(outputDir, `${ordinal}-tables-${index + 1}-${index + group.length}.sql`), sql);
}
writeFileSync(resolve(outputDir, "README.md"), "# D-04 bounded column-metadata queries\n\nGenerated from corrected D-04 source `wave-04-tidb-compatible-source-v2.sql`. Four read-only queries cover the 40 D-04 tables in source order, ten tables per query, so the SQL editor's 500-row result cap cannot truncate the structural reconciliation.\n");
console.log(JSON.stringify({ source: sourcePath, table_count: tables.length, query_count: 4, output_dir: outputDir }, null, 2));
