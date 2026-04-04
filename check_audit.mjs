import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check damage photos and physics data
const [rows] = await conn.execute(`
  SELECT id, claim_id, 
    CASE WHEN damage_photos_json IS NOT NULL AND damage_photos_json != '' THEN 'HAS_DATA' ELSE 'NULL' END as photos_status,
    CASE WHEN enriched_photos_json IS NOT NULL AND enriched_photos_json != '' THEN 'HAS_DATA' ELSE 'NULL' END as enriched_status,
    LEFT(damage_photos_json, 500) as photos_preview,
    LEFT(enriched_photos_json, 500) as enriched_preview,
    LEFT(physics_analysis_json, 500) as physics_preview,
    LEFT(cost_intelligence_json, 500) as cost_preview
  FROM ai_assessments 
  ORDER BY id DESC LIMIT 3
`);

for (const r of rows) {
  console.log(`\n=== Assessment ${r.id} (claim ${r.claim_id}) ===`);
  console.log("Photos:", r.photos_status);
  if (r.photos_preview) console.log("  Preview:", r.photos_preview.slice(0, 200));
  console.log("Enriched:", r.enriched_status);
  if (r.enriched_preview) console.log("  Preview:", r.enriched_preview.slice(0, 200));
  
  if (r.physics_preview) {
    const p = JSON.parse(r.physics_preview + (r.physics_preview.endsWith("}") ? "" : '"}'));
    console.log("Physics executed:", p.physicsExecuted);
    console.log("Impact vector:", JSON.stringify(p.impactVector || "NOT SET").slice(0, 200));
  } else {
    console.log("Physics: NULL");
  }
  
  if (r.cost_preview) {
    try {
      // Just show first 300 chars
      console.log("Cost intel preview:", r.cost_preview.slice(0, 300));
    } catch(e) {}
  }
}

// Check claims for document URLs (images)
const [claims] = await conn.execute(`
  SELECT c.id, c.claim_number, 
    CASE WHEN cd.document_url IS NOT NULL THEN 'HAS_DOC' ELSE 'NO_DOC' END as doc_status,
    LEFT(cd.document_url, 200) as doc_url
  FROM claims c
  LEFT JOIN claim_documents cd ON cd.claim_id = c.id
  ORDER BY c.id DESC LIMIT 5
`);

console.log("\n\n=== CLAIM DOCUMENTS ===");
for (const c of claims) {
  console.log(`Claim ${c.id} (${c.claim_number}): ${c.doc_status} ${c.doc_url || ''}`);
}

await conn.end();
