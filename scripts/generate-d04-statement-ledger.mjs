import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [mode = 'generate', sourceArg, ledgerArg, summaryArg, statementsDirArg] = process.argv.slice(2);

if (!sourceArg || !ledgerArg || !['generate', 'verify'].includes(mode)) {
  console.error('Usage: node scripts/generate-d04-statement-ledger.mjs <generate|verify> <source.sql> <ledger.json> [summary.md] [statements-dir]');
  process.exit(2);
}

const sourcePath = resolve(sourceArg);
const ledgerPath = resolve(ledgerArg);
const marker = '--> statement-breakpoint';
const sourceText = readFileSync(sourcePath, 'utf8');
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

function classify(sql) {
  const table = sql.match(/^CREATE TABLE `([^`]+)`/);
  if (table) return { phase: 'tables', kind: 'CREATE TABLE', object_name: table[1] };

  const foreignKey = sql.match(/^ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` FOREIGN KEY/);
  if (foreignKey) return { phase: 'foreign_keys', kind: 'ADD FOREIGN KEY', object_name: foreignKey[2], table_name: foreignKey[1] };

  const index = sql.match(/^CREATE INDEX `([^`]+)` ON `([^`]+)`/);
  if (index) return { phase: 'indexes', kind: 'CREATE INDEX', object_name: index[1], table_name: index[2] };

  throw new Error(`Unsupported statement class: ${sql.slice(0, 100)}`);
}

function buildLedger() {
  const markerCount = (sourceText.match(/--> statement-breakpoint/g) ?? []).length;
  const rawFragments = sourceText.split(marker);
  const trailingMarker = rawFragments.at(-1)?.trim() === '';
  const fragments = rawFragments.map((fragment) => fragment.trim()).filter(Boolean);

  if (markerCount !== 134) throw new Error(`Expected 134 markers; found ${markerCount}`);
  if (!trailingMarker) throw new Error('Expected the revised Wave 4 source to end with a literal statement-breakpoint marker');
  if (fragments.length !== 134) throw new Error(`Expected 134 non-empty marker-separated fragments; found ${fragments.length}`);
  if (fragments.some((fragment) => !fragment.endsWith(';'))) throw new Error('Every emitted statement must terminate with a semicolon');

  const statements = fragments.map((sql, index) => ({
    ordinal: index + 1,
    ...classify(sql),
    sha256: sha256(sql),
    sql,
  }));

  const counts = statements.reduce((accumulator, statement) => {
    accumulator[statement.kind] = (accumulator[statement.kind] ?? 0) + 1;
    return accumulator;
  }, {});

  if (counts['CREATE TABLE'] !== 40 || counts['ADD FOREIGN KEY'] !== 7 || counts['CREATE INDEX'] !== 87) {
    throw new Error(`Unexpected statement classes: ${JSON.stringify(counts)}`);
  }

  return {
    schema: 'kinga-d04-statement-ledger/v1',
    source_file: sourceArg,
    source_sha256: sha256(sourceText),
    marker_literal: marker,
    marker_count: markerCount,
    trailing_marker: trailingMarker,
    split_rule: 'Split on the exact literal marker, UTF-8 trim every fragment, discard the one empty terminal fragment required by the source trailing marker, then emit each remaining fragment unchanged with its terminal semicolon.',
    statement_count: statements.length,
    statement_counts: counts,
    statements,
  };
}

function renderSummary(ledger) {
  const rows = ledger.statements.map((statement) => (
    `| ${statement.ordinal} | ${statement.phase} | ${statement.kind} | \`${statement.table_name ?? '—'}\` | \`${statement.object_name}\` | \`${statement.sha256}\` |`
  )).join('\n');

  return `# D-04 Wave 4 Marker-Split Statement Hash Ledger\n\n` +
    `This manifest is generated deterministically from \`${ledger.source_file}\`, the revised TiDB-compatible Wave 4 execution source. The immutable historical Gate C source remains unchanged; this packet source retains the five documented JSON-shaped TEXT default corrections and deliberately omits the Gate-B-excluded no-consumer whole-TEXT \`idx_recipients\` index. The source is split only on the exact literal \`${ledger.marker_literal}\`, each fragment is UTF-8 trimmed, and the source's one empty terminal fragment is discarded because Wave 4 ends with a marker. Each emitted statement retains its terminal semicolon and is hashed with SHA-256. The JSON companion ledger contains the exact full SQL for every row.\n\n` +
    `| Control | Value |\n|---|---|\n` +
    `| Full revised source SHA-256 | \`${ledger.source_sha256}\` |\n` +
    `| Marker count | ${ledger.marker_count} (trailing marker present) |\n` +
    `| Executable statement count | ${ledger.statement_count} |\n` +
    `| Statement class totals | 40 \`CREATE TABLE\`, 7 \`ADD FOREIGN KEY\`, 87 \`CREATE INDEX\` |\n` +
    `| JSON companion | \`../../audit/gate-d-d04-statement-hash-ledger-2026-09-14.json\` |\n\n` +
    `> Do not run the raw source through \`mysql < file.sql\`. The \`--> statement-breakpoint\` literal is repository tooling, not a MySQL/TiDB comment. Before any separately authorised execution, compare each prepared statement text and its SHA-256 with the matching row below. This review packet grants no execution authority.\n\n` +
    `## Ordered execution ledger\n\n` +
    `| # | Phase | Statement class | Table | Object / constraint / index | SHA-256 of emitted SQL |\n` +
    `|---:|---|---|---|---|---|\n${rows}\n\n` +
    `## Reproducibility command\n\n` +
    '```bash\n' +
    `node scripts/generate-d04-statement-ledger.mjs verify ${ledger.source_file} audit/gate-d-d04-statement-hash-ledger-2026-09-14.json\n` +
    '```\n';
}

function writeStatementFiles(ledger, statementsDir) {
  const outputDir = resolve(statementsDir);
  mkdirSync(outputDir, { recursive: true });

  for (const statement of ledger.statements) {
    const ordinal = String(statement.ordinal).padStart(3, '0');
    const outputPath = resolve(outputDir, `${ordinal}-${statement.object_name}.sql`);
    writeFileSync(outputPath, statement.sql, 'utf8');
    const writtenHash = sha256(readFileSync(outputPath, 'utf8'));
    if (writtenHash !== statement.sha256) throw new Error(`Statement-file hash mismatch for ${outputPath}`);
  }

  return outputDir;
}

const freshLedger = buildLedger();

if (mode === 'generate') {
  writeFileSync(ledgerPath, `${JSON.stringify(freshLedger, null, 2)}\n`, 'utf8');
  if (summaryArg) writeFileSync(resolve(summaryArg), renderSummary(freshLedger), 'utf8');
  const statementsDir = statementsDirArg ? writeStatementFiles(freshLedger, statementsDirArg) : null;
  console.log(JSON.stringify({ mode, source_sha256: freshLedger.source_sha256, marker_count: freshLedger.marker_count, trailing_marker: freshLedger.trailing_marker, statement_count: freshLedger.statement_count, statement_counts: freshLedger.statement_counts, ledger_path: ledgerPath, summary_path: summaryArg ? resolve(summaryArg) : null, statements_dir: statementsDir }, null, 2));
} else {
  const recordedLedger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  if (JSON.stringify(recordedLedger) !== JSON.stringify(freshLedger)) {
    console.error('Ledger verification failed: source-derived ledger differs from recorded ledger.');
    process.exit(1);
  }
  console.log(JSON.stringify({ mode, status: 'PASS', source_sha256: freshLedger.source_sha256, statement_count: freshLedger.statement_count }, null, 2));
}
