import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Step 1: get claim id
const [claimRows] = await conn.execute(
  "SELECT id FROM claims WHERE claim_number = '8880001' LIMIT 1"
);
const claimId = claimRows[0]?.id;
if (!claimId) { console.log('Claim not found'); await conn.end(); process.exit(0); }
console.log('Claim ID:', claimId);

// Step 2: get assessment
const [aaRows] = await conn.execute(
  "SELECT id, photo_classification_json FROM ai_assessments WHERE claim_id = " + claimId + " LIMIT 1"
);
const aa = aaRows[0];
if (!aa) { console.log('No assessment'); await conn.end(); process.exit(0); }
console.log('Assessment ID:', aa.id);

if (!aa.photo_classification_json) {
  console.log('NO CLASSIFICATION CACHE STORED — all photos default to damage_photo');
  await conn.end(); process.exit(0);
}

const cls = JSON.parse(aa.photo_classification_json);
console.log('Cached classifications:', cls.length);
console.log('');
cls.forEach((c, i) => {
  const fn = c.url.split('/').pop().substring(0, 50);
  console.log(`[${String(i+1).padStart(2)}] ${c.category.padEnd(22)} ${String(Math.round((c.confidence||0)*100)).padStart(3)}%  ${fn}`);
});

// Step 3: get all photo URLs from the assessment
const [photoRows] = await conn.execute(
  "SELECT photo_urls_json FROM ai_assessments WHERE id = " + aa.id + " LIMIT 1"
);
const photoUrlsJson = photoRows[0]?.photo_urls_json;
if (photoUrlsJson) {
  const allUrls = JSON.parse(photoUrlsJson);
  console.log('\nTotal photos in assessment:', allUrls.length);
  const classifiedUrls = new Set(cls.map(c => c.url));
  const unclassified = allUrls.filter(u => !classifiedUrls.has(u));
  console.log('Unclassified (will default to damage_photo):', unclassified.length);
  unclassified.forEach((u, i) => {
    console.log(`  [UNCLASSIFIED-${i+1}] ${u.split('/').pop().substring(0, 50)}`);
  });
}

await conn.end();
