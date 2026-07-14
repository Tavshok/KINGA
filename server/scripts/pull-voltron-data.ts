import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'fs';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const [rows] = await conn.execute(
    'SELECT enriched_photos_json, damaged_components_json FROM ai_assessments WHERE claim_id = 8880001 ORDER BY id DESC LIMIT 1'
  );
  const r = (rows as any[])[0];
  fs.writeFileSync('/tmp/voltron-enriched.json', r.enriched_photos_json || '[]');
  fs.writeFileSync('/tmp/voltron-components.json', r.damaged_components_json || '[]');
  fs.writeFileSync('/tmp/voltron-photo-urls.json', r.photo_urls_json || '[]');
  console.log('done');
  await conn.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
