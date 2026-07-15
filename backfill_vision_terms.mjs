/**
 * backfill_vision_terms.mjs
 *
 * Backfills the Wing → Fender normalisation into all stored enrichedPhotosJson records.
 *
 * Safe to run multiple times (idempotent — if no "Wing" exists, no update is made).
 * Does NOT touch damagedComponentsJson — that field is populated from submitted documents
 * and will be corrected on next re-assessment for the small number of contaminated records.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find all assessments with enrichedPhotosJson containing "Wing"
const [rows] = await conn.query(`
  SELECT id, claim_id, enriched_photos_json
  FROM ai_assessments
  WHERE enriched_photos_json IS NOT NULL
    AND enriched_photos_json LIKE '%Wing%'
`);

console.log(`Found ${rows.length} assessments with "Wing" in enrichedPhotosJson`);

let updated = 0;
let unchanged = 0;
let errors = 0;

for (const row of rows) {
  try {
    const photos = JSON.parse(row.enriched_photos_json);
    if (!Array.isArray(photos)) { unchanged++; continue; }

    let changed = false;
    const normalised = photos.map(photo => {
      if (!Array.isArray(photo.detectedComponents)) return photo;
      const normComponents = photo.detectedComponents.map(name => {
        if (typeof name !== 'string') return name;
        const n = name.replace(/\bWing\b/g, 'Fender');
        if (n !== name) changed = true;
        return n;
      });
      return { ...photo, detectedComponents: normComponents };
    });

    if (!changed) { unchanged++; continue; }

    await conn.execute(
      'UPDATE ai_assessments SET enriched_photos_json = ? WHERE id = ?',
      [JSON.stringify(normalised), row.id]
    );
    console.log(`  ✅ Updated assessment ${row.id} (claim ${row.claim_id})`);
    updated++;
  } catch (err) {
    console.error(`  ❌ Error on assessment ${row.id}: ${err.message}`);
    errors++;
  }
}

console.log(`\nBackfill complete: ${updated} updated, ${unchanged} unchanged, ${errors} errors`);

// Verify VOLTRON specifically
const [voltron] = await conn.query(`
  SELECT a.id, a.enriched_photos_json
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE c.claim_number = 'LIVE-RUN-VOLTRON-001'
  ORDER BY a.id DESC
  LIMIT 1
`);

if (voltron.length > 0) {
  const photos = JSON.parse(voltron[0].enriched_photos_json || '[]');
  const allComponents = new Set();
  for (const p of photos) {
    for (const c of (p.detectedComponents ?? [])) allComponents.add(c);
  }
  const wingTerms = [...allComponents].filter(c => /\bWing\b/i.test(c));
  const fenderTerms = [...allComponents].filter(c => /\bFender\b/i.test(c));
  console.log(`\nVOLTRON post-backfill verification:`);
  console.log(`  Wing terms remaining: ${wingTerms.length > 0 ? wingTerms.join(', ') : 'NONE ✅'}`);
  console.log(`  Fender terms present: ${fenderTerms.length > 0 ? fenderTerms.join(', ') : 'NONE ❌'}`);

  // Simulate photoCountForComponent("Fender") after normalisation
  let fenderCount = 0;
  for (const p of photos) {
    const comps = (p.detectedComponents ?? []).map(c => c.toLowerCase());
    if (comps.some(c => c.includes('fender'))) fenderCount++;
  }
  console.log(`  Simulated 📷×N for "Fender": ${fenderCount} (expected: 7)`);
}

await conn.end();
