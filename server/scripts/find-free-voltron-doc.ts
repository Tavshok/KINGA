import "dotenv/config";
import { getDb } from '../db';
import { claims, ingestionDocuments } from '../../drizzle/schema';
import { inArray, eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();

  const voltronIds = [4140001, 4110001, 4080001, 4050001, 3960001, 3570001, 3540001, 3510001, 3480001, 3450001];

  // Find which claims are using these document IDs
  const linkedClaims = await db.select({
    id: claims.id,
    claimReference: claims.claimReference,
    sourceDocumentId: claims.sourceDocumentId,
  }).from(claims)
    .where(inArray(claims.sourceDocumentId, voltronIds));

  console.log('\n=== CLAIMS LINKED TO VOLTRON DOCUMENT IDs ===');
  for (const c of linkedClaims) {
    console.log(`Claim ID: ${c.id} | Ref: ${c.claimReference} | source_document_id: ${c.sourceDocumentId}`);
  }

  const linkedIds = linkedClaims.map(c => c.sourceDocumentId).filter(Boolean);
  const freeIds = voltronIds.filter(id => !linkedIds.includes(id));
  
  console.log('\n=== FREE (UNLINKED) VOLTRON DOCUMENT IDs ===');
  console.log(freeIds);

  if (freeIds.length > 0) {
    // Get details of the most recent free document
    const freeDocs = await db.select({
      id: ingestionDocuments.id,
      originalFilename: ingestionDocuments.originalFilename,
      createdAt: ingestionDocuments.createdAt,
    }).from(ingestionDocuments)
      .where(inArray(ingestionDocuments.id, freeIds));
    
    console.log('\n=== FREE DOCUMENT DETAILS ===');
    for (const d of freeDocs) {
      console.log(`ID: ${d.id} | Created: ${d.createdAt} | Filename: ${d.originalFilename}`);
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
