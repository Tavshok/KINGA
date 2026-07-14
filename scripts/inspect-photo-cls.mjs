import mysql from 'mysql2/promise';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const DB_URL = process.env.DATABASE_URL || env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // Check photo_classification_json
  const [cnt] = await conn.execute('SELECT COUNT(*) as c FROM ai_assessments WHERE photo_classification_json IS NOT NULL');
  console.log('Rows with photo_classification_json:', cnt[0].c);
  
  if (cnt[0].c > 0) {
    const [rows] = await conn.execute('SELECT id, photo_classification_json FROM ai_assessments WHERE photo_classification_json IS NOT NULL ORDER BY id DESC LIMIT 1');
    const raw = JSON.parse(rows[0].photo_classification_json);
    if (Array.isArray(raw)) {
      console.log('photo_classification_json: ARRAY len:', raw.length);
      if (raw[0]) {
        console.log('First item keys:', Object.keys(raw[0]).join(', '));
        console.log('First item:', JSON.stringify(raw[0]).substring(0, 600));
      }
    } else {
      console.log('photo_classification_json: OBJECT keys:', Object.keys(raw).join(', '));
      const firstKey = Object.keys(raw)[0];
      const firstVal = raw[firstKey];
      console.log('First key:', firstKey, '| val type:', typeof firstVal, Array.isArray(firstVal) ? 'ARRAY len=' + firstVal.length : '');
      if (Array.isArray(firstVal) && firstVal[0]) {
        console.log('First nested item keys:', Object.keys(firstVal[0]).join(', '));
        console.log('First nested item:', JSON.stringify(firstVal[0]).substring(0, 600));
      }
    }
  }
  
  // Check enriched_photos_json for VOLTRON 13350001
  const [ep] = await conn.execute('SELECT id, enriched_photos_json FROM ai_assessments WHERE id = 13350001');
  if (ep[0] && ep[0].enriched_photos_json) {
    const raw2 = JSON.parse(ep[0].enriched_photos_json);
    console.log('\nVOLTRON 13350001 enriched_photos_json:');
    if (Array.isArray(raw2)) {
      console.log('ARRAY len:', raw2.length);
      if (raw2[0]) {
        console.log('Keys:', Object.keys(raw2[0]).join(', '));
        console.log('Item 0:', JSON.stringify(raw2[0]).substring(0, 600));
        if (raw2[1]) console.log('Item 1:', JSON.stringify(raw2[1]).substring(0, 600));
      }
    }
  }
  
  await conn.end();
}
main().catch(e => console.error(e.message));
