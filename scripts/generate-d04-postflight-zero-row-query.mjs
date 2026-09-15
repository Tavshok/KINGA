import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  console.error("Usage: node scripts/generate-d04-postflight-zero-row-query.mjs <corrected-wave-4.sql> <output.sql>");
  process.exit(2);
}

const sourceText = readFileSync(resolve(sourcePath), "utf8");
const tableNames = [...sourceText.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
if (tableNames.length !== 40 || new Set(tableNames).size !== 40) {
  throw new Error(`Expected exactly 40 unique D-04 tables; found ${tableNames.length}`);
}

const rows = tableNames.map((tableName) => `  SELECT '${tableName}' AS table_name, COUNT(*) AS row_count FROM \`kinga_staging\`.\`${tableName}\``);
const sql = [
  "USE `kinga_staging`;",
  "",
  "SELECT COUNT(*) AS checked_table_count,",
  "       SUM(row_count) AS total_rows,",
  "       MIN(row_count) AS minimum_rows,",
  "       MAX(row_count) AS maximum_rows",
  "FROM (",
  rows.join("\n  UNION ALL\n"),
  ") AS per_table_counts;",
  "",
].join("\n");

writeFileSync(resolve(outputPath), sql);
console.log(JSON.stringify({
  status: "PASS",
  table_count: tableNames.length,
  output_path: resolve(outputPath),
  sha256: createHash("sha256").update(sql).digest("hex"),
}, null, 2));
