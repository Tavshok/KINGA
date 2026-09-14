import { readFileSync } from 'node:fs';

const [ledgerPath] = process.argv.slice(2);
if (!ledgerPath) {
  throw new Error('Usage: node generate-d04-object-absence-query.mjs <d04-ledger.json>');
}

const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
const foreignKeys = ledger.statements
  .filter((statement) => statement.kind === 'ADD FOREIGN KEY')
  .map((statement) => {
    const match = statement.sql.match(/^ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` FOREIGN KEY/m);
    if (!match) throw new Error(`Cannot parse FK statement ${statement.ordinal}`);
    return { table: match[1], constraint: match[2] };
  });
const indexes = ledger.statements
  .filter((statement) => statement.kind === 'CREATE INDEX')
  .map((statement) => {
    const match = statement.sql.match(/^CREATE(?: UNIQUE)? INDEX `([^`]+)` ON `([^`]+)`/m);
    if (!match) throw new Error(`Cannot parse index statement ${statement.ordinal}`);
    return { index: match[1], table: match[2] };
  });

if (foreignKeys.length !== 7 || indexes.length !== 87) {
  throw new Error(`Unexpected D-04 scope: ${foreignKeys.length} FKs, ${indexes.length} indexes`);
}

const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const fkNames = foreignKeys.map(({ constraint }) => quote(constraint)).join(', ');
const indexPairs = indexes
  .map(({ table, index }) => `(table_name = ${quote(table)} AND index_name = ${quote(index)})`)
  .join('\n     OR ');

console.log(`SELECT
  (SELECT COUNT(*)
   FROM information_schema.table_constraints
   WHERE constraint_schema = 'kinga_staging'
     AND constraint_type = 'FOREIGN KEY'
     AND constraint_name IN (${fkNames})) AS d04_foreign_keys_present,
  (SELECT COUNT(DISTINCT CONCAT(table_name, CHAR(0), index_name))
   FROM information_schema.statistics
   WHERE table_schema = 'kinga_staging'
     AND (
       ${indexPairs}
     )) AS d04_explicit_index_pairs_present;`);
