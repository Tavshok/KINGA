/**
 * Phase B-1: Extract all image URLs from ai_assessments rows with damage_photos_json populated.
 * Outputs a CSV file ready for manual tagging.
 *
 * Usage: node server/pipeline-v2/benchmarks/extract-images-for-tagging.mjs
 * Output: server/pipeline-v2/benchmarks/images-for-tagging.csv
 */
import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(`
  SELECT id as assessment_id, claim_id, damage_photos_json
  FROM ai_assessments
  WHERE damage_photos_json IS NOT NULL AND damage_photos_json != '[]' AND damage_photos_json != 'null'
  ORDER BY id DESC
`);

console.log(`Found ${rows.length} assessments with damage_photos_json`);

const csvLines = ['assessment_id,claim_id,image_url,ground_truth,tagger_confidence,notes'];

for (const row of rows) {
  let urls = [];
  try {
    urls = JSON.parse(row.damage_photos_json);
    if (!Array.isArray(urls)) urls = [];
  } catch {
    continue;
  }
  for (const url of urls) {
    if (typeof url === 'string' && url.startsWith('http')) {
      // Escape commas in URL (shouldn't happen but defensive)
      const safeUrl = `"${url}"`;
      csvLines.push(`${row.assessment_id},${row.claim_id},${safeUrl},,, `);
    }
  }
}

const outPath = join(__dir, 'images-for-tagging.csv');
writeFileSync(outPath, csvLines.join('\n'), 'utf8');
console.log(`Written ${csvLines.length - 1} image rows to ${outPath}`);
console.log('\nNext steps:');
console.log('1. Open images-for-tagging.csv in a spreadsheet');
console.log('2. For each row, view the image URL and fill in:');
console.log('   ground_truth: genuine_damage_photo | vehicle_overview | document_page | quotation_scan | pdf_page_with_embedded_damage_photo | pdf_page_document_only | other');
console.log('   tagger_confidence: HIGH | MEDIUM | LOW');
console.log('   notes: optional free text');
console.log('3. Save as images-tagged.csv');
console.log('4. Run: node server/pipeline-v2/benchmarks/csv-to-labels.mjs');

await conn.end();
