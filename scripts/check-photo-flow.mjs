import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Assessment photo fields
const [aRows] = await conn.execute(`
  SELECT id, claim_id, damage_photos_json, enriched_photos_json,
    CHAR_LENGTH(claim_record_json) as cr_len
  FROM ai_assessments WHERE claim_id = 8160001 LIMIT 1
`);
console.log('=== Assessment ===');
for (const r of aRows) {
  console.log('damage_photos_json:', r.damage_photos_json);
  console.log('enriched_photos_json:', r.enriched_photos_json);
  console.log('claim_record_json length:', r.cr_len);
  // Parse claim_record to check imageUrls
  const [crRows] = await conn.execute(`SELECT claim_record_json FROM ai_assessments WHERE claim_id = 8160001 LIMIT 1`);
  if (crRows[0]?.claim_record_json) {
    const cr = JSON.parse(crRows[0].claim_record_json);
    console.log('claimRecord.damage.imageUrls:', JSON.stringify(cr.damage?.imageUrls));
    console.log('claimRecord.damage.description:', (cr.damage?.description || '').substring(0, 80));
  }
}

// 2. photo_reextraction_jobs columns
const [pjCols] = await conn.execute('SHOW COLUMNS FROM photo_reextraction_jobs');
console.log('\n=== photo_reextraction_jobs cols ===', pjCols.map(c=>c.Field).join(', '));
const [pjRows] = await conn.execute(`SELECT * FROM photo_reextraction_jobs WHERE claim_id = 8160001 LIMIT 5`);
console.log('photo_reextraction_jobs for 8160001:', pjRows.length, 'rows');
for (const r of pjRows) {
  Object.keys(r).forEach(k => { if (r[k]) console.log(' ', k+':', String(r[k]).substring(0,120)); });
  console.log('---');
}

// 3. claim_documents (images)
const [cdRows] = await conn.execute(`SELECT id, file_name, file_url, mime_type, document_category FROM claim_documents WHERE claim_id = 8160001`);
console.log('\n=== claim_documents for 8160001 ===', cdRows.length, 'rows');
for (const r of cdRows) {
  console.log(' ', r.document_category, '|', r.mime_type, '|', r.file_name, '|', (r.file_url||'').substring(0,80));
}

// 4. claims.damage_photos
const [cRows] = await conn.execute(`SELECT id, damage_photos, source_document_id FROM claims WHERE id = 8160001`);
console.log('\n=== claims.damage_photos ===');
for (const r of cRows) {
  console.log('damage_photos:', r.damage_photos);
  console.log('source_document_id:', r.source_document_id);
}

// 5. Check how the pipeline context is initialized — look at pdfUrl in claims
const [clCols] = await conn.execute('SHOW COLUMNS FROM claims');
const urlCols = clCols.filter(c => /url|pdf|s3|file|photo|image/i.test(c.Field));
console.log('\n=== claims URL-related columns ===', urlCols.map(c=>c.Field).join(', '));
const urlColNames = urlCols.map(c=>c.Field).join(', ');
if (urlColNames) {
  const [urlRows] = await conn.execute(`SELECT ${urlColNames} FROM claims WHERE id = 8160001 LIMIT 1`);
  for (const r of urlRows) {
    Object.keys(r).forEach(k => { if (r[k]) console.log(' ', k+':', String(r[k]).substring(0,150)); });
  }
}

await conn.end();
