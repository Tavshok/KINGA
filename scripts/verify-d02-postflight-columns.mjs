import { readFileSync } from 'node:fs';

const [waveOnePath, waveTwoPath, ...liveCsvPaths] = process.argv.slice(2);

if (!waveOnePath || !waveTwoPath || !liveCsvPaths.length) {
  console.error('Usage: node scripts/verify-d02-postflight-columns.mjs <wave-01.sql> <wave-02.sql> <one-or-more-live-information-schema-columns.csv>');
  process.exit(2);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

function normalizeType(value) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function sourceDefault(rest) {
  if (/\bDEFAULT\s+\(now\(\)\)/i.test(rest)) return 'CURRENT_TIMESTAMP';
  const match = rest.match(/\bDEFAULT\s+(\([^)]*\)|'(?:[^'\\]|\\.)*'|[^\s,]+)/i);
  if (!match) return null;
  const raw = match[1];
  if (/^\(now\(\)\)$/i.test(raw) || /^current_timestamp$/i.test(raw)) return 'CURRENT_TIMESTAMP';
  if (/^null$/i.test(raw)) return 'NULL';
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/\\'/g, "'");
  return raw;
}

function liveDefault(value) {
  if (!value) return 'NULL';
  if (/^current_timestamp(?:\(\))?$/i.test(value)) return 'CURRENT_TIMESTAMP';
  return value;
}

function sourceColumn(line, tableName, ordinal) {
  const match = line.match(/^\s*`([^`]+)`\s+(.+?)(?:,)?$/);
  if (!match) return null;

  const [, columnName, rest] = match;
  const typeMatch = rest.match(/^(.+?)(?=\s+(?:NOT NULL|DEFAULT|AUTO_INCREMENT|ON UPDATE)|,?$)/i);
  if (!typeMatch) {
    throw new Error(`Could not parse type for ${tableName}.${columnName}: ${line}`);
  }

  return {
    tableName,
    columnName,
    ordinal,
    type: normalizeType(typeMatch[1]),
    nullable: /\bNOT NULL\b/i.test(rest) ? 'NO' : 'YES',
    defaultValue: sourceDefault(rest),
    autoIncrement: /\bAUTO_INCREMENT\b/i.test(rest),
    onUpdateCurrentTimestamp: /\bON UPDATE CURRENT_TIMESTAMP\b/i.test(rest),
  };
}

function extractSourceColumns(sourceText) {
  const tables = new Map();
  const createTablePattern = /CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\);/g;

  for (const match of sourceText.matchAll(createTablePattern)) {
    const [, tableName, body] = match;
    const columns = [];
    for (const line of body.split('\n')) {
      const column = sourceColumn(line, tableName, columns.length + 1);
      if (column) columns.push(column);
    }
    if (!columns.length) throw new Error(`No columns parsed for ${tableName}`);
    if (tables.has(tableName)) throw new Error(`Duplicate source table ${tableName}`);
    tables.set(tableName, columns);
  }

  return tables;
}

const expectedTables = new Map([
  ...extractSourceColumns(readFileSync(waveOnePath, 'utf8')),
  ...extractSourceColumns(readFileSync(waveTwoPath, 'utf8')),
]);

const parsedCsvs = liveCsvPaths.map((liveCsvPath) => parseCsv(readFileSync(liveCsvPath, 'utf8')));
const [header] = parsedCsvs[0];
const dataRows = parsedCsvs.flatMap((rows) => {
  const [candidateHeader, ...rowsWithoutHeader] = rows;
  if (JSON.stringify(candidateHeader) !== JSON.stringify(header)) {
    throw new Error('Live CSV headers differ across supplied exports');
  }
  return rowsWithoutHeader;
});
const headerIndex = Object.fromEntries(header.map((value, index) => [value, index]));
const requiredHeaders = ['TABLE_SCHEMA', 'TABLE_NAME', 'COLUMN_NAME', 'ORDINAL_POSITION', 'COLUMN_DEFAULT', 'IS_NULLABLE', 'COLUMN_TYPE', 'EXTRA'];
for (const requiredHeader of requiredHeaders) {
  if (!(requiredHeader in headerIndex)) throw new Error(`Live CSV is missing ${requiredHeader}`);
}

const liveTables = new Map();
for (const row of dataRows) {
  if (row[headerIndex.TABLE_SCHEMA] !== 'kinga_staging') continue;
  const tableName = row[headerIndex.TABLE_NAME];
  const column = {
    tableName,
    columnName: row[headerIndex.COLUMN_NAME],
    ordinal: Number(row[headerIndex.ORDINAL_POSITION]),
    type: normalizeType(row[headerIndex.COLUMN_TYPE]),
    nullable: row[headerIndex.IS_NULLABLE],
    defaultValue: liveDefault(row[headerIndex.COLUMN_DEFAULT]),
    autoIncrement: /auto_increment/i.test(row[headerIndex.EXTRA]),
    onUpdateCurrentTimestamp: /on update current_timestamp/i.test(row[headerIndex.EXTRA]),
  };
  const columns = liveTables.get(tableName) ?? [];
  columns.push(column);
  liveTables.set(tableName, columns);
}

const mismatches = [];
const expectedTableNames = [...expectedTables.keys()].sort();
const liveTableNames = [...liveTables.keys()].sort();

for (const tableName of expectedTableNames) {
  if (!liveTables.has(tableName)) {
    mismatches.push({ kind: 'missing_table', tableName });
    continue;
  }

  const expectedColumns = expectedTables.get(tableName);
  const actualColumns = liveTables.get(tableName).sort((left, right) => left.ordinal - right.ordinal);
  if (expectedColumns.length !== actualColumns.length) {
    mismatches.push({ kind: 'column_count', tableName, expected: expectedColumns.length, actual: actualColumns.length });
  }

  const maxColumns = Math.max(expectedColumns.length, actualColumns.length);
  for (let index = 0; index < maxColumns; index += 1) {
    const expected = expectedColumns[index];
    const actual = actualColumns[index];
    if (!expected || !actual) continue;

    for (const field of ['ordinal', 'columnName', 'type', 'nullable', 'autoIncrement', 'onUpdateCurrentTimestamp']) {
      if (expected[field] !== actual[field]) {
        mismatches.push({ kind: 'column_property', tableName, column: expected.columnName, field, expected: expected[field], actual: actual[field] });
      }
    }

    if (expected.defaultValue !== null && expected.defaultValue !== actual.defaultValue) {
      mismatches.push({ kind: 'column_default', tableName, column: expected.columnName, expected: expected.defaultValue, actual: actual.defaultValue });
    }
  }
}

for (const tableName of liveTableNames) {
  if (!expectedTables.has(tableName)) mismatches.push({ kind: 'unexpected_table', tableName });
}

const expectedColumns = [...expectedTables.values()].flat().length;
const actualColumns = [...liveTables.values()].flat().length;
const report = {
  status: mismatches.length ? 'FAIL' : 'PASS',
  expected_table_count: expectedTables.size,
  live_table_count: liveTables.size,
  expected_column_count: expectedColumns,
  live_column_count: actualColumns,
  default_comparison_policy: 'Compare every explicit non-null source default; implicit nullable/default-null source fields are not distinguished because INFORMATION_SCHEMA represents both as NULL.',
  mismatches,
};

console.log(JSON.stringify(report, null, 2));
process.exit(mismatches.length ? 1 : 0);
