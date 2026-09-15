import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [historicalLedgerPath, revisedLedgerPath, d01Path, d02Path, d03Path, revisedD04Path, partialOutputPath, zeroRowsOutputPath, reportOutputPath] = process.argv.slice(2);
if (![historicalLedgerPath, revisedLedgerPath, d01Path, d02Path, d03Path, revisedD04Path, partialOutputPath, zeroRowsOutputPath, reportOutputPath].every(Boolean)) {
  throw new Error('Usage: node generate-d04-resumption-preflight-queries.mjs <historical-ledger> <revised-ledger> <d01> <d02> <d03> <revised-d04> <partial-output> <zero-rows-output> <report-output>');
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const historicalLedger = JSON.parse(readFileSync(historicalLedgerPath, 'utf8'));
const revisedLedger = JSON.parse(readFileSync(revisedLedgerPath, 'utf8'));
const ledger = historicalLedger.statements;
const revisedStatements = revisedLedger.statements;
const partialIndexes = ledger
  .filter((row) => row.ordinal <= 98 && row.kind === 'CREATE INDEX')
  .map((row) => {
    const match = row.sql.match(/^CREATE(?: UNIQUE)? INDEX `([^`]+)` ON `([^`]+)`/i);
    if (!match) throw new Error(`Could not parse index row ${row.ordinal}`);
    return { ordinal: row.ordinal, indexName: match[1], tableName: match[2] };
  });
const expectedFks = revisedStatements
  .filter((row) => row.kind === 'ADD FOREIGN KEY')
  .map((row) => {
    const match = row.sql.match(/ADD CONSTRAINT `([^`]+)`/i);
    if (!match) throw new Error(`Could not parse foreign key row ${row.ordinal}`);
    return match[1];
  });
const sourceTables = (sourcePath) => [...readFileSync(sourcePath, 'utf8').matchAll(/^\s*CREATE TABLE `([^`]+)`/gm)].map((match) => match[1]);
const allTables = [...new Set([d01Path, d02Path, d03Path, revisedD04Path].flatMap(sourceTables))].sort();

if (partialIndexes.length !== 51) throw new Error(`Expected 51 accepted index statements through historical ordinal 98; found ${partialIndexes.length}`);
if (expectedFks.length !== 7) throw new Error(`Expected 7 D-04 foreign keys; found ${expectedFks.length}`);
if (allTables.length !== 113) throw new Error(`Expected 113 cumulative tables; found ${allTables.length}`);

const sqlQuote = (value) => `'${value.replaceAll("'", "''")}'`;
const partialQuery = `SELECT
  (SELECT COUNT(*)
   FROM information_schema.table_constraints
   WHERE constraint_schema = 'kinga_staging'
     AND constraint_type = 'FOREIGN KEY'
     AND constraint_name IN (${expectedFks.map(sqlQuote).join(', ')})) AS accepted_d04_foreign_keys_present,
  (SELECT COUNT(DISTINCT CONCAT(table_name, CHAR(0), index_name))
   FROM information_schema.statistics
   WHERE table_schema = 'kinga_staging'
     AND (${partialIndexes.map(({ tableName, indexName }) => `(table_name = ${sqlQuote(tableName)} AND index_name = ${sqlQuote(indexName)})`).join('\n          OR ')})) AS accepted_d04_explicit_index_pairs_present,
  (SELECT COUNT(*)
   FROM information_schema.statistics
   WHERE table_schema = 'kinga_staging'
     AND table_name = 'governance_notifications'
     AND index_name = 'idx_recipients') AS excluded_idx_recipients_present;\n`;
const zeroRowsQuery = `SELECT
  COUNT(*) AS tables_checked,
  SUM(row_count) AS total_rows,
  MIN(row_count) AS minimum_rows,
  MAX(row_count) AS maximum_rows
FROM (
  ${allTables.map((tableName) => `SELECT ${sqlQuote(tableName)} AS table_name, COUNT(*) AS row_count FROM \`kinga_staging\`.\`${tableName}\``).join('\n  UNION ALL\n  ')}
) AS exact_resumption_preflight_counts;\n`;

writeFileSync(partialOutputPath, partialQuery);
writeFileSync(zeroRowsOutputPath, zeroRowsQuery);
writeFileSync(reportOutputPath, `${JSON.stringify({
  source: {
    historicalLedgerPath,
    revisedLedgerPath,
    tableSources: [d01Path, d02Path, d03Path, revisedD04Path],
  },
  acceptedHistoricalOrdinalRange: '1-98',
  omittedHistoricalOrdinal: 99,
  expected: {
    totalTables: allTables.length,
    d04ForeignKeys: expectedFks.length,
    acceptedD04ExplicitIndexes: partialIndexes.length,
    excludedIndex: 'governance_notifications.idx_recipients',
  },
  querySha256: {
    partialState: sha256(partialQuery),
    zeroRows: sha256(zeroRowsQuery),
  },
}, null, 2)}\n`);

console.log(JSON.stringify({
  status: 'PASS',
  expected_tables: allTables.length,
  expected_d04_foreign_keys: expectedFks.length,
  expected_accepted_d04_explicit_indexes: partialIndexes.length,
  partial_query_sha256: sha256(partialQuery),
  zero_rows_query_sha256: sha256(zeroRowsQuery),
}, null, 2));
