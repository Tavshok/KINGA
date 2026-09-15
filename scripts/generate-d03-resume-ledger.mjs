import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [fullLedgerArg, outputLedgerArg, outputSummaryArg, statementsDirArg] = process.argv.slice(2);
const firstPendingOrdinal = 14;

if (!fullLedgerArg || !outputLedgerArg || !outputSummaryArg || !statementsDirArg) {
  console.error("Usage: node scripts/generate-d03-resume-ledger.mjs <full-ledger.json> <resume-ledger.json> <resume-summary.md> <resume-statements-dir>");
  process.exit(2);
}

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const fullLedgerText = readFileSync(resolve(fullLedgerArg), "utf8");
const fullLedger = JSON.parse(fullLedgerText);

if (fullLedger.statement_count !== 187 || fullLedger.statements?.length !== 187) {
  throw new Error("Full D-03 revised ledger must contain exactly 187 statements.");
}
if (fullLedger.statements.some((statement, index) => statement.ordinal !== index + 1)) {
  throw new Error("Full D-03 revised ledger ordinals must be exactly 1 through 187.");
}

const pendingStatements = fullLedger.statements.filter((statement) => statement.ordinal >= firstPendingOrdinal);
const resumeLedger = {
  schema: "kinga-d03-resume-ledger/v1",
  source_ledger: fullLedgerArg,
  source_ledger_sha256: sha256(fullLedgerText),
  source_sha256: fullLedger.source_sha256,
  statement_count: pendingStatements.length,
  first_pending_ordinal: firstPendingOrdinal,
  last_pending_ordinal: fullLedger.statement_count,
  accepted_prior_statement_range: "1-13",
  execution_boundary: "Statements 1-13 are owner-reported as already executed successfully and must not be retried. Execute only ordinals 14-187, in order, after independently verifying the revised source, full ledger, and this resume ledger.",
  statements: pendingStatements,
};

const statementDir = resolve(statementsDirArg);
mkdirSync(statementDir, { recursive: true });
for (const statement of pendingStatements) {
  const filename = `${String(statement.ordinal).padStart(3, "0")}-${statement.object_name}.sql`;
  const filePath = resolve(statementDir, filename);
  writeFileSync(filePath, statement.sql, "utf8");
  const written = readFileSync(filePath, "utf8");
  if (written !== statement.sql || sha256(written) !== statement.sha256) {
    throw new Error(`Resume statement file verification failed: ${filename}`);
  }
}

const rows = pendingStatements.map((statement) => (
  `| ${statement.ordinal} | ${statement.phase} | ${statement.kind} | \`${statement.table_name ?? "—"}\` | \`${statement.object_name}\` | \`${statement.sha256}\` |`
)).join("\n");
const summary = `# D-03 Wave 3 Resumption Ledger — Ordinal 14 Onward\n\n` +
  `This is a derived execution-control ledger. It preserves the original ordinals from the revised 187-statement canonical ledger but exposes **only the 174 pending statements**. Statements 1–13 are recorded as successfully executed before the compatibility stop and are expressly excluded from rerun.\n\n` +
  `| Control | Value |\n|---|---|\n` +
  `| Revised D-03 source SHA-256 | \`${resumeLedger.source_sha256}\` |\n` +
  `| Full revised ledger SHA-256 | \`${resumeLedger.source_ledger_sha256}\` |\n` +
  `| Accepted prior range — do not rerun | 1–13 |\n` +
  `| First pending ordinal | 14 |\n` +
  `| Pending statement count | ${pendingStatements.length} |\n` +
  `| Last pending ordinal | 187 |\n\n` +
  `> Before resuming, independently verify the revised full source and canonical ledger. Then compare each prepared SQL file with the matching row below, execute only ordinals 14–187 in strict order, and stop on any mismatch or server error without blind retry.\n\n` +
  `## Pending ordered execution ledger\n\n` +
  `| Original # | Phase | Statement class | Table | Object / constraint / index | SHA-256 of exact SQL |\n|---:|---|---|---|---|---|\n${rows}\n`;

writeFileSync(resolve(outputLedgerArg), `${JSON.stringify(resumeLedger, null, 2)}\n`, "utf8");
writeFileSync(resolve(outputSummaryArg), summary, "utf8");
console.log(JSON.stringify({
  status: "PASS",
  source_sha256: resumeLedger.source_sha256,
  full_ledger_sha256: resumeLedger.source_ledger_sha256,
  accepted_prior_statement_range: resumeLedger.accepted_prior_statement_range,
  first_pending_ordinal: resumeLedger.first_pending_ordinal,
  pending_statement_count: resumeLedger.statement_count,
  last_pending_ordinal: resumeLedger.last_pending_ordinal,
}, null, 2));
