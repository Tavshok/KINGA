import { readFileSync } from 'node:fs';

const [csvPath] = process.argv.slice(2);
if (!csvPath) {
  throw new Error('Usage: node generate-d04-preflight-baseline-count-query.mjs <verified-table-inventory.csv>');
}

const lines = readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
const normalize = (value) => {
  const trimmed = value.replace(/\r$/, '').trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/""/g, '"')
    : trimmed;
};

if (normalize(lines[0]) !== 'table_name') {
  throw new Error(`Unexpected inventory header: ${lines[0] ?? '<empty>'}`);
}

const tables = lines.slice(1).map(normalize).filter(Boolean);
if (tables.length !== 73 || new Set(tables).size !== 73 || tables.some((name) => !/^[a-z0-9_]+$/.test(name))) {
  throw new Error('Refusing to generate a count query from an invalid 73-table baseline inventory.');
}

const counts = tables
  .map((name, index) => `${index === 0 ? '' : 'UNION ALL '}SELECT COUNT(*) AS row_count FROM \`kinga_staging\`.\`${name}\``)
  .join('\n');

console.log(`SELECT COUNT(*) AS tables_checked,
       SUM(row_count) AS total_rows,
       MIN(row_count) AS minimum_rows,
       MAX(row_count) AS maximum_rows
FROM (
${counts}
) AS baseline_counts;`);
