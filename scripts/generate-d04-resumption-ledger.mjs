import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [oldLedgerArg, revisedLedgerArg, outputLedgerArg, outputSummaryArg, outputDirectoryArg] = process.argv.slice(2);
if (![oldLedgerArg, revisedLedgerArg, outputLedgerArg, outputSummaryArg, outputDirectoryArg].every(Boolean)) {
  throw new Error('Usage: node scripts/generate-d04-resumption-ledger.mjs <old-ledger.json> <revised-ledger.json> <resume-ledger.json> <resume-ledger.md> <statement-dir>');
}

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const oldLedger = JSON.parse(readFileSync(resolve(oldLedgerArg), 'utf8'));
const revisedLedger = JSON.parse(readFileSync(resolve(revisedLedgerArg), 'utf8'));

if (oldLedger.statement_count !== 135 || revisedLedger.statement_count !== 134) {
  throw new Error(`Unexpected ledger totals: old=${oldLedger.statement_count}, revised=${revisedLedger.statement_count}`);
}

const oldStatements = oldLedger.statements;
const revisedStatements = revisedLedger.statements;
const stopped = oldStatements[98];
if (stopped.ordinal !== 99 || stopped.object_name !== 'idx_recipients' || !/governance_notifications/.test(stopped.sql)) {
  throw new Error('Historical ordinal 99 is not the expected stopped idx_recipients statement');
}
for (let index = 0; index < 98; index += 1) {
  if (oldStatements[index].sql !== revisedStatements[index].sql || oldStatements[index].sha256 !== revisedStatements[index].sha256) {
    throw new Error(`Historical accepted statement ${index + 1} differs in revised ledger`);
  }
}
if (revisedStatements.some((statement) => statement.sha256 === stopped.sha256 || statement.sql === stopped.sql)) {
  throw new Error('Revised ledger still contains stopped historical ordinal 99');
}
for (let historicalIndex = 99; historicalIndex < oldStatements.length; historicalIndex += 1) {
  const revisedIndex = historicalIndex - 1;
  if (oldStatements[historicalIndex].sql !== revisedStatements[revisedIndex].sql || oldStatements[historicalIndex].sha256 !== revisedStatements[revisedIndex].sha256) {
    throw new Error(`Pending historical statement ${historicalIndex + 1} differs in revised ledger`);
  }
}

const statements = revisedStatements.slice(98).map((statement, index) => ({
  ...statement,
  ordinal: index + 100,
  revised_ledger_ordinal: statement.ordinal,
}));
if (statements.length !== 36 || statements[0].ordinal !== 100 || statements.at(-1).ordinal !== 135) {
  throw new Error('Expected exactly historical ordinals 100 through 135 in the D-04 resumption ledger');
}

const resumeLedger = {
  schema: 'kinga-d04-resumption-ledger/v1',
  prior_ledger: oldLedgerArg,
  prior_source_sha256: oldLedger.source_sha256,
  revised_ledger: revisedLedgerArg,
  revised_source_sha256: revisedLedger.source_sha256,
  accepted_historical_ordinals: '1-98',
  omitted_historical_ordinal: 99,
  omitted_statement_sha256: stopped.sha256,
  omitted_statement_reason: 'Gate B previously excluded idx_recipients because recipients is JSON TEXT with no SQL filter consumer; the source reconciliation removes it rather than adding an unsupported whole-TEXT index.',
  resumption_historical_ordinals: '100-135',
  statement_count: statements.length,
  statements,
};

const outputDirectory = resolve(outputDirectoryArg);
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
for (const statement of statements) {
  const name = `${String(statement.ordinal).padStart(3, '0')}-${statement.object_name}.sql`;
  const path = resolve(outputDirectory, name);
  writeFileSync(path, statement.sql, 'utf8');
  if (sha256(readFileSync(path, 'utf8')) !== statement.sha256) throw new Error(`Hash mismatch after writing ${name}`);
}
const actualNames = readdirSync(outputDirectory).sort();
if (actualNames.length !== 36 || actualNames.some((name) => !/^1(?:0[0-9]|[1-2][0-9]|3[0-5])-/.test(name))) {
  throw new Error('Resumption statement directory does not contain exactly original ordinals 100–135');
}

writeFileSync(resolve(outputLedgerArg), `${JSON.stringify(resumeLedger, null, 2)}\n`, 'utf8');
const rows = statements.map((statement) => `| ${statement.ordinal} | ${statement.revised_ledger_ordinal} | ${statement.phase} | ${statement.kind} | \`${statement.table_name ?? '—'}\` | \`${statement.object_name}\` | \`${statement.sha256}\` |`).join('\n');
writeFileSync(resolve(outputSummaryArg), `# D-04 Wave 4 Resumption Ledger\n\nThis ledger is generated from the historical 135-statement D-04 ledger and its 134-statement revised counterpart. It proves that accepted historical ordinals **1–98** are unchanged, historical ordinal **99** is deliberately omitted, and each pending historical ordinal **100–135** has byte-identical SQL and SHA-256 in the revised source.\n\n| Control | Value |\n|---|---|\n| Accepted historical ordinals | 1–98 — do not rerun |\n| Omitted historical ordinal | 99 — \`idx_recipients\` whole-TEXT index, SHA-256 \`${stopped.sha256}\` |\n| Resumption range | Historical ordinals 100–135 only |\n| Resumption statements | ${statements.length} |\n| Revised full-source SHA-256 | \`${revisedLedger.source_sha256}\` |\n| Resumption-ledger SHA-256 | \`${sha256(`${JSON.stringify(resumeLedger, null, 2)}\n`)}\` |\n\n> Do not run the historical source or historical full ledger. Do not rerun statements 1–98. After a new immediate preflight and hash verification, begin with file \`100-${statements[0].object_name}.sql\` and follow this ledger in order.\n\n## Ordered pending statements\n\n| Historical # | Revised # | Phase | Class | Table | Object | SHA-256 |\n|---:|---:|---|---|---|---|---|\n${rows}\n`);
console.log(JSON.stringify({ status: 'PASS', accepted_historical_ordinals: '1-98', omitted_historical_ordinal: 99, resumption_statement_count: statements.length, first_ordinal: statements[0].ordinal, last_ordinal: statements.at(-1).ordinal }, null, 2));
