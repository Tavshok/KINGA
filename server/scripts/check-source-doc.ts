import "dotenv/config";
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();

  // 1. Get the claim's sourceDocumentId and externalAssessmentUrl
  const claimRows = await db.execute(sql`
    SELECT 
      id, 
      claim_reference,
      source_document_id,
      external_assessment_url,
      damage_photos,
      estimated_speed_kmh,
      created_at
    FROM claims
    WHERE id = 10719902
    LIMIT 1
  `);
  console.log('\n=== CLAIM RECORD ===');
  console.log(JSON.stringify(claimRows[0], null, 2));

  const claim = claimRows[0] as any;
  const sourceDocId = claim?.source_document_id;

  if (sourceDocId) {
    // 2. Get the ingestion_document
    const docRows = await db.execute(sql`
      SELECT 
        id,
        original_filename,
        s3_url,
        s3_key,
        document_type,
        extraction_status,
        historical_claim_id,
        created_at
      FROM ingestion_documents
      WHERE id = ${sourceDocId}
      LIMIT 1
    `);
    console.log('\n=== SOURCE INGESTION DOCUMENT ===');
    console.log(JSON.stringify(docRows[0], null, 2));
  } else {
    console.log('\nNo sourceDocumentId set on claim.');
  }

  // 3. Also check claim_documents for this claim
  const cdRows = await db.execute(sql`
    SELECT id, claim_id, file_name, file_url, document_category, created_at
    FROM claim_documents
    WHERE claim_id = 10719902
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log('\n=== CLAIM DOCUMENTS ===');
  console.log(JSON.stringify(cdRows, null, 2));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
