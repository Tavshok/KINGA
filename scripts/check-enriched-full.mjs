import { createConnection } from 'mysql2/promise';
const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  'SELECT enriched_photos_json FROM ai_assessments WHERE claim_id = 8400001 ORDER BY id DESC LIMIT 1'
);
const photos = JSON.parse(rows[0].enriched_photos_json);
console.log('All keys across all photos:');
const allKeys = new Set();
for (const p of photos) Object.keys(p).forEach(k => allKeys.add(k));
console.log([...allKeys].join(', '));
console.log('\nFull first photo:');
console.log(JSON.stringify(photos[0], null, 2));
await conn.end();
