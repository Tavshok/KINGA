import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [ledgerArg, statementDirArg] = process.argv.slice(2);

if (!ledgerArg || !statementDirArg) {
  console.error('Usage: node scripts/verify-d03-statement-files.mjs <ledger.json> <statements-dir>');
  process.exit(2);
}

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const ledger = JSON.parse(readFileSync(resolve(ledgerArg), 'utf8'));
const statementDir = resolve(statementDirArg);
const actualFiles = readdirSync(statementDir).filter((file) => file.endsWith('.sql')).sort();
const expectedFiles = ledger.statements.map((statement) => (
  `${String(statement.ordinal).padStart(3, '0')}-${statement.object_name}.sql`
));

const expectedSet = new Set(expectedFiles);
const actualSet = new Set(actualFiles);
const missingFiles = expectedFiles.filter((file) => !actualSet.has(file));
const unexpectedFiles = actualFiles.filter((file) => !expectedSet.has(file));
const mismatches = [];

for (const statement of ledger.statements) {
  const filename = `${String(statement.ordinal).padStart(3, '0')}-${statement.object_name}.sql`;
  if (!actualSet.has(filename)) continue;
  const text = readFileSync(resolve(statementDir, filename), 'utf8');
  if (text !== statement.sql || sha256(text) !== statement.sha256) {
    mismatches.push({ ordinal: statement.ordinal, filename, expected_sha256: statement.sha256, actual_sha256: sha256(text), exact_text_match: text === statement.sql });
  }
}

const orderedConcatenation = expectedFiles
  .filter((file) => actualSet.has(file))
  .map((file) => readFileSync(resolve(statementDir, file), 'utf8'))
  .join('');

const report = {
  status: missingFiles.length || unexpectedFiles.length || mismatches.length ? 'FAIL' : 'PASS',
  expected_statement_file_count: expectedFiles.length,
  actual_statement_file_count: actualFiles.length,
  ordered_concatenation_sha256: sha256(orderedConcatenation),
  missing_files: missingFiles,
  unexpected_files: unexpectedFiles,
  mismatches,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);
