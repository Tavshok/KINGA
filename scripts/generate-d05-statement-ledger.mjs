import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [mode = 'generate', sourceArg, ledgerArg, summaryArg, statementsDirArg] = process.argv.slice(2);
if (!sourceArg || !ledgerArg || !['generate', 'verify'].includes(mode)) {
  console.error('Usage: node scripts/generate-d05-statement-ledger.mjs <generate|verify> <source.sql> <ledger.json> [summary.md] [statements-dir]');
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

  if (markerCount !== 290) throw new Error(`Expected 290 markers; found ${markerCount}`);
  if (!trailingMarker) throw new Error('Expected revised Wave 5 source to end with a literal statement-breakpoint marker');
  if (fragments.length !== 290) throw new Error(`Expected 290 non-empty marker-separated fragments; found ${fragments.length}`);
  if (fragments.some((fragment) => !fragment.endsWith(';'))) throw new Error('Every emitted statement must terminate with a semicolon');

  const statements = fragments.map((sql, index) => ({
    ordinal: index + 1,
    ...classify(sql),
    sha256: sha256(sql),
    sql,
  }));

  const statementCounts = statements.reduce((counts, statement) => {
    counts[statement.kind] = (counts[statement.kind] ?? 0) + 1;
    return counts;
  }, {});
  if (statementCounts['CREATE TABLE'] !== 75 || statementCounts['ADD FOREIGN KEY'] !== 25 || statementCounts['CREATE INDEX'] !== 190) {
    throw new Error(`Unexpected D-05 statement classes: ${JSON.stringify(statementCounts)}`);
  }

  return {
    schema: 'kinga-d05-statement-ledger/v1',
    source_file: sourceArg,
    source_sha256: sha256(sourceText),
    marker_literal: marker,
    marker_count: markerCount,
    trailing_marker: trailingMarker,
    split_rule: 'Split on the exact literal marker, UTF-8 trim every fragment, discard only the empty terminal fragment required by the source trailing marker, then emit every non-empty statement unchanged with its terminal semicolon.',
    statement_count: statements.length,
    statement_counts: statementCounts,
    statements,
  };
}

function renderSummary(ledger) {
  const rows = ledger.statements.map((statement) => (
    `| ${statement.ordinal} | ${statement.phase} | ${statement.kind} | \`${statement.table_name ?? '—'}\` | \`${statement.object_name}\` | \`${statement.sha256}\` |`
  )).join('\n');
  return `# D-05 Wave 5 Marker-Split Statement Hash Ledger\n\n` +
    `This record is generated deterministically from \`${ledger.source_file}\`, the revised TiDB-compatible final Wave 5 execution source. The historical Gate C source remains immutable. Before generation, the source passed a compatibility audit for literal marker framing, JSON-shaped TEXT defaults, and plain TEXT/BLOB indexes. The source is split only on the exact literal \`${ledger.marker_literal}\`; each non-empty fragment is UTF-8 trimmed, retains its terminal semicolon, and is SHA-256 hashed.\n\n` +
    `| Control | Value |\n|---|---|\n` +
    `| Revised full-source SHA-256 | \`${ledger.source_sha256}\` |\n` +
    `| Literal markers | ${ledger.marker_count}; one empty terminal fragment excluded |\n` +
    `| Executable statements | ${ledger.statement_count} |\n` +
    `| Class totals | 75 \`CREATE TABLE\`, 25 \`ADD FOREIGN KEY\`, 190 \`CREATE INDEX\` |\n` +
    `| JSON companion | \`../../audit/gate-d-d05-statement-hash-ledger-2026-09-15.json\` |\n\n` +
    `> Do not submit the raw source through \`mysql < file.sql\`. The \`--> statement-breakpoint\` literal is repository tooling, not a MySQL/TiDB comment. This ledger is review material and grants no execution authority.\n\n` +
    `## Ordered execution ledger\n\n| # | Phase | Statement class | Table | Object / constraint / index | SHA-256 of emitted SQL |\n|---:|---|---|---|---|---|\n${rows}\n\n` +
    `## Reproducibility command\n\n\`\`\`bash\nnode scripts/generate-d05-statement-ledger.mjs verify ${ledger.source_file} audit/gate-d-d05-statement-hash-ledger-2026-09-15.json\n\`\`\`\n`;
}

function writeStatementFiles(ledger, statementsDirectory) {
  const outputDirectory = resolve(statementsDirectory);
  mkdirSync(outputDirectory, { recursive: true });
  for (const statement of ledger.statements) {
    const fileName = `${String(statement.ordinal).padStart(3, '0')}-${statement.object_name}.sql`;
    const outputPath = resolve(outputDirectory, fileName);
    writeFileSync(outputPath, statement.sql, 'utf8');
    if (sha256(readFileSync(outputPath, 'utf8')) !== statement.sha256) throw new Error(`Statement-file hash mismatch: ${fileName}`);
  }
  return outputDirectory;
}

const freshLedger = buildLedger();
if (mode === 'generate') {
  writeFileSync(ledgerPath, `${JSON.stringify(freshLedger, null, 2)}\n`, 'utf8');
  if (summaryArg) writeFileSync(resolve(summaryArg), renderSummary(freshLedger), 'utf8');
  const statementsDirectory = statementsDirArg ? writeStatementFiles(freshLedger, statementsDirArg) : null;
  console.log(JSON.stringify({ mode, source_sha256: freshLedger.source_sha256, marker_count: freshLedger.marker_count, trailing_marker: freshLedger.trailing_marker, statement_count: freshLedger.statement_count, statement_counts: freshLedger.statement_counts, ledger_path: ledgerPath, summary_path: summaryArg ? resolve(summaryArg) : null, statements_dir: statementsDirectory }, null, 2));
} else {
  const recordedLedger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  if (JSON.stringify(recordedLedger) !== JSON.stringify(freshLedger)) {
    console.error('Ledger verification failed: source-derived ledger differs from recorded ledger.');
    process.exit(1);
  }
  console.log(JSON.stringify({ mode, status: 'PASS', source_sha256: freshLedger.source_sha256, statement_count: freshLedger.statement_count }, null, 2));
}
