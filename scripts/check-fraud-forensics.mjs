import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  'SELECT fraud_score_breakdown_json FROM ai_assessments WHERE claim_id = 8400001 ORDER BY id DESC LIMIT 1'
);
const raw = rows[0].fraud_score_breakdown_json;
if (!raw) {
  console.log('fraud_score_breakdown_json is NULL');
  await conn.end();
  process.exit(0);
}
const data = JSON.parse(raw);
console.log('Top keys:', Object.keys(data).join(', '));

const pf = data.photoForensics;
console.log('photoForensics type:', typeof pf);
console.log('photoForensics value:', JSON.stringify(pf).slice(0, 500));

if (pf && typeof pf === 'object') {
  console.log('photoForensics sub-keys:', Object.keys(pf).join(', '));
  const photos = pf.photos || [];
  console.log('photos count:', photos.length);
  if (photos[0]) {
    console.log('p0 keys:', Object.keys(photos[0]).join(', '));
    console.log('p0 url:', (photos[0].url || photos[0].imageUrl || 'NONE').slice(-80));
    const ar = photos[0].analysisResult || {};
    console.log('ar keys:', Object.keys(ar).join(', '));
    const desc = ar.ai_vision_description || ar.description || 'MISSING';
    console.log('ai_vision_description:', desc.slice(0, 200));
  }
}

// Also check photo_inconsistencies_json
const [rows2] = await conn.query(
  'SELECT photo_inconsistencies_json FROM ai_assessments WHERE claim_id = 8400001 ORDER BY id DESC LIMIT 1'
);
const raw2 = rows2[0].photo_inconsistencies_json;
console.log('\n--- photo_inconsistencies_json ---');
if (!raw2) {
  console.log('NULL');
} else {
  const d2 = JSON.parse(raw2);
  console.log('keys:', Object.keys(d2).join(', '));
  const photos2 = d2.photos || [];
  console.log('photos count:', photos2.length);
  if (photos2[0]) {
    console.log('p0 url:', (photos2[0].url || photos2[0].imageUrl || 'NONE').slice(-80));
    const ar2 = photos2[0].analysisResult || {};
    console.log('ar keys:', Object.keys(ar2).join(', '));
    const desc2 = ar2.ai_vision_description || 'MISSING';
    console.log('ai_vision_description:', desc2.slice(0, 200));
  }
}

await conn.end();
