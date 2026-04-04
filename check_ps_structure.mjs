import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  'SELECT id, pipeline_run_summary FROM ai_assessments WHERE id IN (2400001, 2340001) ORDER BY id DESC LIMIT 2'
);

for (const row of rows) {
  console.log(`\n=== Assessment ${row.id} ===`);
  if (!row.pipeline_run_summary) { console.log('  No pipeline_run_summary'); continue; }
  const ps = JSON.parse(row.pipeline_run_summary);
  console.log('Top-level keys:', Object.keys(ps).join(', '));
  
  // Search for repairQuote anywhere in the object
  const str = JSON.stringify(ps);
  const idx = str.indexOf('repairQuote');
  if (idx >= 0) {
    console.log('repairQuote found at char', idx, ':', str.substring(Math.max(0,idx-5), idx+300));
  } else {
    console.log('repairQuote NOT FOUND');
  }
  
  // Search for quoteTotalCents
  const idx2 = str.indexOf('quoteTotalCents');
  if (idx2 >= 0) {
    console.log('quoteTotalCents found:', str.substring(Math.max(0,idx2-5), idx2+100));
  } else {
    console.log('quoteTotalCents NOT FOUND');
  }
  
  // Show stage keys if present
  for (const key of Object.keys(ps)) {
    if (key.startsWith('stage') && ps[key] && typeof ps[key] === 'object') {
      console.log(`  ${key} keys:`, Object.keys(ps[key]).slice(0,8).join(', '));
    }
  }
}

await conn.end();
