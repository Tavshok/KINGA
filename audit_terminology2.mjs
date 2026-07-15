import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Quote line items - what do real panel beaters write?
console.log('\n=== QUOTE LINE ITEMS: fender/wing/mudguard in real submitted quotes ===');
const [qli] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
         qli.description, qli.category, qli.unit_price
  FROM quote_line_items qli
  JOIN panel_beater_quotes pbq ON qli.quote_id = pbq.id
  JOIN claims c ON pbq.claim_id = c.id
  WHERE LOWER(qli.description) LIKE '%fender%'
     OR LOWER(qli.description) LIKE '%wing%'
     OR LOWER(qli.description) LIKE '%mudguard%'
  ORDER BY c.claim_number, qli.description
  LIMIT 30
`);
for (const r of qli) {
  console.log(`  [${r.claim_number}] ${r.vehicle_make} ${r.vehicle_model} ${r.vehicle_year} | "${r.description}" | cat:${r.category} | price:${r.unit_price}`);
}
if (qli.length === 0) console.log('  (no results)');

// 2. supplier_quote_line_items - alternative quote table
console.log('\n=== SUPPLIER QUOTE LINE ITEMS: fender/wing/mudguard ===');
const [sqli] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
         sqli.description, sqli.unit_price
  FROM supplier_quote_line_items sqli
  JOIN supplier_quotes sq ON sqli.supplier_quote_id = sq.id
  JOIN claims c ON sq.claim_id = c.id
  WHERE LOWER(sqli.description) LIKE '%fender%'
     OR LOWER(sqli.description) LIKE '%wing%'
     OR LOWER(sqli.description) LIKE '%mudguard%'
  ORDER BY c.claim_number
  LIMIT 20
`).catch(() => [[]]);
for (const r of sqli) {
  console.log(`  [${r.claim_number}] ${r.vehicle_make} ${r.vehicle_model} ${r.vehicle_year} | "${r.description}" | price:${r.unit_price}`);
}
if (sqli.length === 0) console.log('  (no results)');

// 3. Damaged components JSON - what does the AI pipeline call it?
console.log('\n=== DAMAGED COMPONENTS JSON: fender/wing across all assessments ===');
const [assessments] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
         a.damaged_components_json
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE a.damaged_components_json IS NOT NULL
    AND (LOWER(a.damaged_components_json) LIKE '%fender%'
      OR LOWER(a.damaged_components_json) LIKE '%wing%'
      OR LOWER(a.damaged_components_json) LIKE '%mudguard%')
  ORDER BY c.claim_number
  LIMIT 20
`);
for (const r of assessments) {
  try {
    const comps = JSON.parse(r.damaged_components_json);
    if (!Array.isArray(comps)) continue;
    const relevant = comps.filter(c => /fender|wing|mudguard/i.test(c?.name ?? ''));
    for (const comp of relevant) {
      console.log(`  [${r.claim_number}] ${r.vehicle_make} ${r.vehicle_model} ${r.vehicle_year} | damaged_component: "${comp.name}" location:"${comp.location ?? ''}"`);
    }
  } catch {}
}

// 4. Enriched photos JSON - what does the vision model call it?
console.log('\n=== ENRICHED PHOTOS JSON: fender/wing in vision model output ===');
const [enriched] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
         a.enriched_photos_json
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE a.enriched_photos_json IS NOT NULL
    AND (LOWER(a.enriched_photos_json) LIKE '%fender%'
      OR LOWER(a.enriched_photos_json) LIKE '%wing%'
      OR LOWER(a.enriched_photos_json) LIKE '%mudguard%')
  ORDER BY c.claim_number
  LIMIT 20
`);
for (const r of enriched) {
  try {
    const photos = JSON.parse(r.enriched_photos_json);
    if (!Array.isArray(photos)) continue;
    const hits = new Set();
    for (const p of photos) {
      for (const c of (p?.detectedComponents ?? [])) {
        const name = typeof c === 'string' ? c : (c?.name ?? '');
        if (/fender|wing|mudguard/i.test(name)) hits.add(name);
      }
    }
    if (hits.size > 0) {
      console.log(`  [${r.claim_number}] ${r.vehicle_make} ${r.vehicle_model} ${r.vehicle_year} | vision_terms: ${[...hits].join(', ')}`);
    }
  } catch {}
}

// 5. Raw extracted text from claim documents
console.log('\n=== CLAIM DOCUMENTS: raw text containing fender/wing/mudguard ===');
const [docs] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, cd.document_category, cd.extracted_text
  FROM claim_documents cd
  JOIN claims c ON cd.claim_id = c.id
  WHERE cd.extracted_text IS NOT NULL
    AND (LOWER(cd.extracted_text) LIKE '%fender%'
      OR LOWER(cd.extracted_text) LIKE '%wing%'
      OR LOWER(cd.extracted_text) LIKE '%mudguard%')
  ORDER BY c.claim_number
  LIMIT 15
`).catch(() => [[]]);
for (const r of docs) {
  const lines = (r.extracted_text ?? '').split('\n');
  const relevant = lines.filter(l => /fender|wing|mudguard/i.test(l)).slice(0, 4);
  if (relevant.length > 0) {
    console.log(`  [${r.claim_number}] ${r.vehicle_make} ${r.vehicle_model} | ${r.document_category}:`);
    for (const l of relevant) console.log(`    > "${l.trim()}"`);
  }
}

// 6. ingestion_documents extracted text
console.log('\n=== INGESTION DOCUMENTS: raw text containing fender/wing/mudguard ===');
const [ingDocs] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, id2.document_type, id2.extracted_text
  FROM ingestion_documents id2
  JOIN claims c ON id2.claim_id = c.id
  WHERE id2.extracted_text IS NOT NULL
    AND (LOWER(id2.extracted_text) LIKE '%fender%'
      OR LOWER(id2.extracted_text) LIKE '%wing%'
      OR LOWER(id2.extracted_text) LIKE '%mudguard%')
  ORDER BY c.claim_number
  LIMIT 15
`).catch(() => [[]]);
for (const r of ingDocs) {
  const lines = (r.extracted_text ?? '').split('\n');
  const relevant = lines.filter(l => /fender|wing|mudguard/i.test(l)).slice(0, 4);
  if (relevant.length > 0) {
    console.log(`  [${r.claim_number}] ${r.vehicle_make} ${r.vehicle_model} | ${r.document_type}:`);
    for (const l of relevant) console.log(`    > "${l.trim()}"`);
  }
}

await conn.end();
console.log('\n=== AUDIT COMPLETE ===');
