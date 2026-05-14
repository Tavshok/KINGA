// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Check claim 6090046 source document
  const [claims] = await db.execute(sql`
    SELECT id, source_document_id, external_assessment_url, 
           LEFT(damage_photos, 200) as damage_photos_preview
    FROM claims WHERE id = 6090046
  `);
  for (const c of claims as any[]) {
    console.log("Claim 6090046:");
    console.log("  sourceDocumentId:", c.source_document_id);
    console.log("  externalAssessmentUrl:", c.external_assessment_url);
    console.log("  damagePhotos:", c.damage_photos_preview);
  }
  
  // Check the ingestion document
  const claim = (claims as any[])[0];
  if (claim?.source_document_id) {
    const [docs] = await db.execute(sql`
      SELECT id, original_filename, s3_url, s3_key, status, file_size, mime_type
      FROM ingestion_documents WHERE id = ${claim.source_document_id}
    `);
    for (const d of docs as any[]) {
      console.log("\nIngestion Document:");
      console.log("  id:", d.id);
      console.log("  filename:", d.original_filename);
      console.log("  s3_url:", d.s3_url);
      console.log("  s3_key:", d.s3_key);
      console.log("  status:", d.status);
      console.log("  size:", d.file_size);
      console.log("  mime:", d.mime_type);
    }
  }
  
  // Also check ALL ingestion documents for this tenant to see if any are linked
  const [allDocs] = await db.execute(sql`
    SELECT id, original_filename, s3_url, status, file_size, created_at
    FROM ingestion_documents
    ORDER BY id DESC LIMIT 10
  `);
  console.log("\n\nRecent ingestion documents:");
  for (const d of allDocs as any[]) {
    console.log(`  Doc ${d.id}: ${d.original_filename} | ${d.status} | ${d.file_size} bytes | ${d.created_at}`);
    if (d.s3_url) console.log(`    URL: ${d.s3_url.substring(0, 100)}...`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
