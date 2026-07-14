const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/home/ubuntu/kinga-replit/.env' });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Check if any photo_classification_json rows exist
  const [cnt] = await conn.execute('SELECT COUNT(*) as c FROM ai_assessments WHERE photo_classification_json IS NOT NULL');
  console.log('Rows with photo_classification_json:', cnt[0].c);
  
  if (cnt[0].c > 0) {
    const [rows] = await conn.execute('SELECT id, photo_classification_json FROM ai_assessments WHERE photo_classification_json IS NOT NULL ORDER BY id DESC LIMIT 1');
    const raw = JSON.parse(rows[0].photo_classification_json);
    if (Array.isArray(raw)) {
      console.log('ARRAY len:', raw.length);
      if (raw[0]) {
        console.log('First item keys:', Object.keys(raw[0]).join(', '));
        console.log('First item:', JSON.stringify(raw[0]).substring(0, 500));
      }
    } else {
      console.log('OBJECT keys:', Object.keys(raw).join(', '));
    }
  }
  
  // Also check enriched_photos_json for the new VOLTRON assessment
  const [ep] = await conn.execute('SELECT id, enriched_photos_json FROM ai_assessments WHERE id = 13350001');
  if (ep[0] && ep[0].enriched_photos_json) {
    const raw2 = JSON.parse(ep[0].enriched_photos_json);
    console.log('\nVOLTRON 13350001 enriched_photos_json:');
    if (Array.isArray(raw2)) {
      console.log('ARRAY len:', raw2.length);
      if (raw2[0]) {
        console.log('First item keys:', Object.keys(raw2[0]).join(', '));
        console.log('First item:', JSON.stringify(raw2[0]).substring(0, 600));
      }
    }
  }
  
  await conn.end();
}
main().catch(e => console.error(e.message));
