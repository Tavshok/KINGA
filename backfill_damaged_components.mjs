/**
 * backfill_damaged_components.mjs
 *
 * Backfills Wing → Fender normalisation into damagedComponentsJson on all 13
 * contaminated assessments. Idempotent — safe to re-run.
 *
 * damagedComponentsJson can be either:
 *   - Array<string>  (legacy format)
 *   - Array<{ name: string, ... }>  (structured format)
 *   - { components: Array<...> }  (wrapped format)
 *
 * The script handles all three shapes.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const WING_RE = /\bWing\b/g;
const normalise = (s) => (typeof s === 'string' ? s.replace(WING_RE, 'Fender') : s);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(`
  SELECT id, claim_id, damaged_components_json
  FROM ai_assessments
  WHERE damaged_components_json IS NOT NULL
    AND damaged_components_json LIKE '%Wing%'
`);

console.log(`Found ${rows.length} assessments with Wing in damagedComponentsJson`);

let updated = 0;
let unchanged = 0;
let errors = 0;

for (const row of rows) {
  try {
    const parsed = JSON.parse(row.damaged_components_json);
    let changed = false;

    const normaliseItem = (item) => {
      if (typeof item === 'string') {
        const n = normalise(item);
        if (n !== item) changed = true;
        return n;
      }
      if (item && typeof item === 'object') {
        const result = { ...item };
        if (typeof item.name === 'string') {
          result.name = normalise(item.name);
          if (result.name !== item.name) changed = true;
        }
        if (typeof item.component === 'string') {
          result.component = normalise(item.component);
          if (result.component !== item.component) changed = true;
        }
        if (typeof item.description === 'string') {
          result.description = normalise(item.description);
          if (result.description !== item.description) changed = true;
        }
        return result;
      }
      return item;
    };

    let normalised;
    if (Array.isArray(parsed)) {
      normalised = parsed.map(normaliseItem);
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.components)) {
      normalised = { ...parsed, components: parsed.components.map(normaliseItem) };
    } else {
      unchanged++;
      continue;
    }

    if (!changed) { unchanged++; continue; }

    await conn.execute(
      'UPDATE ai_assessments SET damaged_components_json = ? WHERE id = ?',
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

// Verify no Wing terms remain in either field
const [check1] = await conn.query(`
  SELECT COUNT(*) AS cnt FROM ai_assessments
  WHERE enriched_photos_json LIKE '%Wing%'
`);
const [check2] = await conn.query(`
  SELECT COUNT(*) AS cnt FROM ai_assessments
  WHERE damaged_components_json LIKE '%Wing%'
`);
console.log(`\nPost-backfill verification:`);
console.log(`  enrichedPhotosJson Wing terms remaining: ${check1[0].cnt} ✅`);
console.log(`  damagedComponentsJson Wing terms remaining: ${check2[0].cnt} ${check2[0].cnt === 0 ? '✅' : '❌'}`);

await conn.end();
