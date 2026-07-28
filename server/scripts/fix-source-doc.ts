import "dotenv/config";
import { getDb } from '../db';
import { claims } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();

  // Fix: claim 10719902 (Voltron Mining COR 6002812) was incorrectly linked to 
  // ingestion_document 4500001 (ACTION AID STAFF / Nharingo / Glenara hit-and-run).
  // The correct document is 4140001 (VOLTRON MINE COR 6002812 (1).pdf, uploaded 2026-06-26).
  const result = await db.update(claims)
    .set({ sourceDocumentId: 4140001 })
    .where(eq(claims.id, 10719902));

  console.log('Update result:', result);
  
  // Verify
  const [updated] = await db.select({
    id: claims.id,
    sourceDocumentId: claims.sourceDocumentId,
  }).from(claims).where(eq(claims.id, 10719902));
  
  console.log('Verified claim record:', updated);
  
  if (updated.sourceDocumentId === 4140001) {
    console.log('✅ source_document_id correctly updated to 4140001 (VOLTRON MINE COR 6002812 (1).pdf)');
  } else {
    console.log('❌ Update failed — source_document_id is still:', updated.sourceDocumentId);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
