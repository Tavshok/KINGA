import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2] ?? "generate";
if (!new Set(["generate", "verify"]).has(mode)) throw new Error("Usage: node scripts/generate-ncu01-postflight-queries.mjs <generate|verify>");

const root = resolve(import.meta.dirname, "..");
const preflight = resolve(root, "audit/natural-composite-unique-staging-2026-09-15/preflight");
const outputDir = resolve(root, "audit/natural-composite-unique-staging-2026-09-15/postflight");
const sourceContract = JSON.parse(readFileSync(resolve(root, "audit/natural-composite-unique-staging-2026-09-15/source-contract.json"), "utf8"));
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

const expectedIndexes = sourceContract.expected_postflight.unique_indexes;
if (expectedIndexes.length !== 3) throw new Error("Expected exactly three approved postflight unique indexes.");
const expectedOld = sourceContract.expected_postflight.removed_index;
const indexQuery = `SELECT table_name, index_name, non_unique, seq_in_index, column_name\nFROM information_schema.statistics\nWHERE table_schema = 'kinga_staging'\n  AND table_name IN ('assessor_insurer_relationships', 'policy_claim_links', 'fleet_drivers')\n  AND index_name IN ('${expectedOld.index_name}', ${expectedIndexes.map((index) => `'${index.index_name}'`).join(", ")})\nORDER BY table_name, index_name, seq_in_index;\n`;

const entries = new Map([
  ["01-final-table-inventory.sql", readFileSync(resolve(preflight, "01-baseline-table-inventory.sql"), "utf8")],
  ["02-final-zero-row-assertion.sql", readFileSync(resolve(preflight, "02-baseline-zero-row-assertion.sql"), "utf8")],
  ["03-final-target-column-metadata.sql", readFileSync(resolve(preflight, "03-target-column-metadata.sql"), "utf8")],
  ["04-final-index-state.sql", indexQuery],
  ["05-final-duplicate-pairs.sql", readFileSync(resolve(preflight, "05-duplicate-pair-preflight.sql"), "utf8")],
]);
const manifest = {
  schema: "kinga-ncu01-postflight-queries/v1",
  source_contract_sha256: sha256(readFileSync(resolve(root, "audit/natural-composite-unique-staging-2026-09-15/source-contract.json"), "utf8")),
  expected_removed_index: expectedOld,
  expected_unique_indexes: expectedIndexes,
  queries: Object.fromEntries([...entries].map(([name, sql]) => [name, sha256(sql)])),
};
entries.set("query-hash-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

if (mode === "generate") {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of entries) writeFileSync(resolve(outputDir, name), content, "utf8");
  console.log(JSON.stringify({ status: "generated", query_count: 5, queries: manifest.queries }, null, 2));
} else {
  const mismatches = [];
  for (const [name, content] of entries) {
    try { if (readFileSync(resolve(outputDir, name), "utf8") !== content) mismatches.push(name); } catch { mismatches.push(name); }
  }
  if (mismatches.length) throw new Error(`Postflight packet verification failed: ${mismatches.join(", ")}`);
  console.log(JSON.stringify({ status: "PASS", query_count: 5, queries: manifest.queries }, null, 2));
}
