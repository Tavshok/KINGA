import { getDb } from "../server/db";

async function rawQuery(db: any, sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.$client.pool.query(sql, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
}

async function main() {
  const db = await getDb();
  if (!db) { console.error("no db"); process.exit(1); }

  // Get all claims with their doc counts and assessment status
  const rows = await rawQuery(db, `
    SELECT c.id, c.claim_number, c.status, c.vehicle_make, c.vehicle_model,
           COUNT(d.id) as doc_count,
           MAX(a.created_at) as last_assessment
    FROM claims c
    LEFT JOIN claim_documents d ON d.claim_id = c.id
    LEFT JOIN ai_assessments a ON a.claim_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 30
  `);

  console.log("\nAll claims (most recent first):");
  console.log("ID         | CLAIM_NUMBER                    | STATUS               | VEHICLE           | DOCS | ASSESSED");
  console.log("-".repeat(110));
  rows.forEach((r: any) => {
    const vehicle = `${r.vehicle_make ?? '?'} ${r.vehicle_model ?? ''}`.trim().padEnd(18);
    const status = String(r.status).padEnd(20);
    const ref = String(r.claim_number).padEnd(32);
    console.log(`${r.id}  | ${ref} | ${status} | ${vehicle} | ${r.doc_count}    | ${r.last_assessment ?? 'never'}`);
  });

  // Find claims with real documents (not test-*.pdf)
  const claimsWithRealDocs = await rawQuery(db, `
    SELECT c.id, c.claim_number, c.status, d.file_name, d.document_category, d.file_url
    FROM claims c
    JOIN claim_documents d ON d.claim_id = c.id
    WHERE d.file_name NOT LIKE 'test-%'
    ORDER BY c.created_at DESC
    LIMIT 20
  `);

  if (claimsWithRealDocs.length > 0) {
    console.log("\n\nClaims with REAL (non-test) documents:");
    claimsWithRealDocs.forEach((r: any) => {
      console.log(`  ID: ${r.id}  REF: ${r.claim_number}  [${r.document_category}] ${r.file_name}`);
    });
  } else {
    console.log("\n\nNo claims with real (non-test) documents found.");
    console.log("All documents in the system are test fixtures.");
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
