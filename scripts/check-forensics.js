// Check photo_inconsistencies_json structure
const {createConnection} = require('mysql2/promise');

createConnection(process.env.DATABASE_URL).then(async conn => {
  const [rows] = await conn.query(
    'SELECT photo_inconsistencies_json FROM ai_assessments WHERE claim_id = 8400001 ORDER BY id DESC LIMIT 1'
  );
  const raw = rows[0].photo_inconsistencies_json;
  const data = raw ? JSON.parse(raw) : null;
  if (!data) {
    console.log('photo_inconsistencies_json is NULL');
    await conn.end();
    return;
  }
  console.log('Top keys:', Object.keys(data).join(', '));
  const photos = data.photos || [];
  console.log('photos count:', photos.length);
  if (photos[0]) {
    console.log('Photo[0] keys:', Object.keys(photos[0]).join(', '));
    console.log('Photo[0] url:', (photos[0].url || photos[0].imageUrl || 'NONE').slice(-80));
    const ar = photos[0].analysisResult || {};
    console.log('analysisResult keys:', Object.keys(ar).join(', '));
    const desc = ar.ai_vision_description || ar.description || ar.analysis || 'MISSING';
    console.log('ai_vision_description:', desc.slice(0, 200));
  }
  await conn.end();
}).catch(e => console.error(e.message));
