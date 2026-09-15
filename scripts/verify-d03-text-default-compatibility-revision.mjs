import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [originalArg, revisedArg] = process.argv.slice(2);

if (!originalArg || !revisedArg) {
  console.error("Usage: node scripts/verify-d03-text-default-compatibility-revision.mjs <immutable-wave-3.sql> <revised-wave-3.sql>");
  process.exit(2);
}

const marker = "--> statement-breakpoint";
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const original = readFileSync(resolve(originalArg), "utf8");
const revised = readFileSync(resolve(revisedArg), "utf8");
const split = (text) => text.split(marker).map((fragment) => fragment.trim()).filter(Boolean);
const originalStatements = split(original);
const revisedStatements = split(revised);

if (originalStatements.length !== 187 || revisedStatements.length !== 187) {
  throw new Error(`Expected 187 statements in both sources; received ${originalStatements.length} immutable and ${revisedStatements.length} revised.`);
}

const changedOrdinals = originalStatements
  .map((statement, index) => statement === revisedStatements[index] ? null : index + 1)
  .filter(Boolean);

const expectedOldDefaults = [
  "`high_cost_drivers_json` text NOT NULL DEFAULT ('[]')",
  "`component_weighting_json` text NOT NULL DEFAULT ('{}')",
  "`component_detail_json` text NOT NULL DEFAULT ('[]')",
  "`quality_flags_json` text NOT NULL DEFAULT ('[]')",
];
const expectedNewDefaults = [
  "`high_cost_drivers_json` text NOT NULL DEFAULT (JSON_ARRAY())",
  "`component_weighting_json` text NOT NULL DEFAULT (JSON_OBJECT())",
  "`component_detail_json` text NOT NULL DEFAULT (JSON_ARRAY())",
  "`quality_flags_json` text NOT NULL DEFAULT (JSON_ARRAY())",
];

const firstThirteenPreserved = originalStatements.slice(0, 13).every((statement, index) => statement === revisedStatements[index]);
const laterStatementsPreserved = originalStatements.slice(14).every((statement, index) => statement === revisedStatements[index + 14]);
const oldStatementFourteen = originalStatements[13];
const newStatementFourteen = revisedStatements[13];
const result = {
  status: changedOrdinals.length === 1
    && changedOrdinals[0] === 14
    && firstThirteenPreserved
    && laterStatementsPreserved
    && expectedOldDefaults.every((clause) => oldStatementFourteen.includes(clause))
    && expectedNewDefaults.every((clause) => newStatementFourteen.includes(clause))
    ? "PASS"
    : "FAIL",
  immutable_source_sha256: sha256(original),
  revised_source_sha256: sha256(revised),
  immutable_statement_14_sha256: sha256(oldStatementFourteen),
  revised_statement_14_sha256: sha256(newStatementFourteen),
  changed_ordinals: changedOrdinals,
  statements_1_to_13_exactly_preserved: firstThirteenPreserved,
  statements_15_to_187_exactly_preserved: laterStatementsPreserved,
  old_text_default_clauses_verified: expectedOldDefaults.every((clause) => oldStatementFourteen.includes(clause)),
  tidb_compatible_expression_clauses_verified: expectedNewDefaults.every((clause) => newStatementFourteen.includes(clause)),
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "PASS" ? 0 : 1);
