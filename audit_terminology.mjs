/**
 * Terminology audit: pull real document data from all claims in the system
 * and check what term is actually used for the front side panel (fender/wing/other)
 * in submitted repair quotes, assessor reports, and enriched photo component names.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Pull all extracted quote line items that mention fender, wing, or panel
console.log('\n=== QUOTE LINE ITEMS: fender / wing / panel terms ===');
const [quoteLines] = await conn.execute(`
  SELECT 
    c.claim_number,
    c.vehicle_make,
    c.vehicle_model,
    c.vehicle_year,
    qli.description,
    qli.unit_price,
    qli.quantity,
    q.repairer_name
  FROM quote_line_items qli
  JOIN quotes q ON qli.quote_id = q.id
  JOIN claims c ON q.claim_id = c.id
  WHERE LOWER(qli.description) REGEXP 'fender|wing|mudguard|guard|side panel|front panel'
  ORDER BY c.claim_number, qli.description
  LIMIT 100
`);
for (const row of quoteLines) {
  console.log(`  [${row.claim_number}] ${row.vehicle_make} ${row.vehicle_model} ${row.vehicle_year} | "${row.description}" | ${row.repairer_name ?? 'unknown repairer'}`);
}
if (quoteLines.length === 0) console.log('  (no results)');

// 2. Pull damaged component names from damagedComponentsJson across all assessments
console.log('\n=== DAMAGED COMPONENTS JSON: fender / wing / panel terms ===');
const [assessments] = await conn.execute(`
  SELECT 
    c.claim_number,
    c.vehicle_make,
    c.vehicle_model,
    c.vehicle_year,
    a.damaged_components_json
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE a.damaged_components_json IS NOT NULL
    AND a.damaged_components_json != '[]'
    AND a.damaged_components_json != 'null'
  ORDER BY c.claim_number
  LIMIT 50
`);
for (const row of assessments) {
  try {
    const components = JSON.parse(row.damaged_components_json);
    if (!Array.isArray(components)) continue;
    const relevant = components.filter(c => {
      const name = (c?.name ?? '').toLowerCase();
      return /fender|wing|mudguard|guard|side panel/.test(name);
    });
    if (relevant.length > 0) {
      for (const c of relevant) {
        console.log(`  [${row.claim_number}] ${row.vehicle_make} ${row.vehicle_model} ${row.vehicle_year} | damaged_component: "${c.name}" | location: "${c.location ?? ''}"`);
      }
    }
  } catch {}
}

// 3. Pull enriched photo component names across all claims
console.log('\n=== ENRICHED PHOTOS JSON: fender / wing / panel terms (vision model output) ===');
const [enriched] = await conn.execute(`
  SELECT 
    c.claim_number,
    c.vehicle_make,
    c.vehicle_model,
    c.vehicle_year,
    a.enriched_photos_json
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE a.enriched_photos_json IS NOT NULL
    AND a.enriched_photos_json != '[]'
    AND a.enriched_photos_json != 'null'
  ORDER BY c.claim_number
  LIMIT 50
`);
for (const row of enriched) {
  try {
    const photos = JSON.parse(row.enriched_photos_json);
    if (!Array.isArray(photos)) continue;
    const hits = [];
    for (const p of photos) {
      const components = p?.detectedComponents ?? [];
      for (const c of components) {
        const name = (typeof c === 'string' ? c : c?.name ?? '').toLowerCase();
        if (/fender|wing|mudguard|guard|side panel/.test(name)) {
          hits.push(typeof c === 'string' ? c : c?.name);
        }
      }
    }
    if (hits.length > 0) {
      const unique = [...new Set(hits)];
      console.log(`  [${row.claim_number}] ${row.vehicle_make} ${row.vehicle_model} ${row.vehicle_year} | vision_components: ${unique.join(', ')}`);
    }
  } catch {}
}

// 4. Pull raw extracted text from claim documents to see source document terminology
console.log('\n=== CLAIM DOCUMENTS: raw extracted text containing fender / wing / panel ===');
const [docs] = await conn.execute(`
  SELECT 
    c.claim_number,
    c.vehicle_make,
    c.vehicle_model,
    cd.document_category,
    cd.extracted_text
  FROM claim_documents cd
  JOIN claims c ON cd.claim_id = c.id
  WHERE cd.extracted_text IS NOT NULL
    AND LOWER(cd.extracted_text) REGEXP 'fender|wing|mudguard|guard'
  ORDER BY c.claim_number
  LIMIT 30
`);
for (const row of docs) {
  // Extract just the relevant lines
  const lines = (row.extracted_text ?? '').split('\n');
  const relevant = lines.filter(l => /fender|wing|mudguard|guard/i.test(l)).slice(0, 5);
  if (relevant.length > 0) {
    console.log(`  [${row.claim_number}] ${row.vehicle_make} ${row.vehicle_model} | ${row.document_category}:`);
    for (const l of relevant) {
      console.log(`    "${l.trim()}"`);
    }
  }
}
if (docs.length === 0) console.log('  (no results — extracted_text column may not exist or be empty)');

// 5. Check claim_record_json for any mentions
console.log('\n=== CLAIM RECORD JSON: fender / wing terms ===');
const [records] = await conn.execute(`
  SELECT 
    c.claim_number,
    c.vehicle_make,
    c.vehicle_model,
    a.claim_record_json
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE a.claim_record_json IS NOT NULL
    AND LOWER(a.claim_record_json) REGEXP 'fender|wing|mudguard'
  ORDER BY c.claim_number
  LIMIT 20
`);
for (const row of records) {
  try {
    const rec = JSON.parse(row.claim_record_json);
    // Search recursively for fender/wing mentions
    const text = JSON.stringify(rec);
    const matches = text.match(/"[^"]*(?:fender|wing|mudguard)[^"]*"/gi) ?? [];
    const unique = [...new Set(matches)].slice(0, 10);
    if (unique.length > 0) {
      console.log(`  [${row.claim_number}] ${row.vehicle_make} ${row.vehicle_model}:`);
      for (const m of unique) console.log(`    ${m}`);
    }
  } catch {}
}
if (records.length === 0) console.log('  (no results)');

await conn.end();
console.log('\n=== AUDIT COMPLETE ===');
