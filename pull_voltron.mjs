import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check columns on ai_assessments
const [cols] = await conn.execute('DESCRIBE ai_assessments');
const colNames = cols.map(c => c.Field);
console.log('Columns:', colNames.join(', '));

// Pull VOLTRON assessment
const [rows] = await conn.execute(
  'SELECT * FROM ai_assessments WHERE claim_id = 8880001 LIMIT 1'
);

if (rows.length === 0) {
  console.log('NO ASSESSMENT FOUND');
  await conn.end();
  process.exit(0);
}

const r = rows[0];
console.log('Assessment id:', r.id, 'claim_id:', r.claim_id);

// Write each JSON field to a file
for (const key of Object.keys(r)) {
  const val = r[key];
  if (val && typeof val === 'string' && val.length > 10 && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
    writeFileSync(`/tmp/voltron_${key}.json`, val);
    console.log(`Written /tmp/voltron_${key}.json  (${val.length} chars)`);
  } else if (val !== null && val !== undefined && typeof val !== 'object') {
    console.log(`${key}: ${String(val).substring(0, 100)}`);
  }
}

await conn.end();
