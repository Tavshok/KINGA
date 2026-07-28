import "dotenv/config";
import { getDb } from '../db';
import { ingestionDocuments } from '../../drizzle/schema';
import { inArray } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  
  const ids = [4140001, 4110001, 4080001, 4050001, 3960001, 3570001, 3540001, 3510001, 3480001, 3450001];
  
  const docs = await db.select({
    id: ingestionDocuments.id,
    originalFilename: ingestionDocuments.originalFilename,
    documentType: ingestionDocuments.documentType,
    createdAt: ingestionDocuments.createdAt,
  }).from(ingestionDocuments)
    .where(inArray(ingestionDocuments.id, ids));

  console.log('\n=== VOLTRON-RELATED INGESTION DOCUMENTS ===');
  for (const doc of docs) {
    console.log(`ID: ${doc.id} | Type: ${doc.documentType} | Created: ${doc.createdAt}`);
    console.log(`  Filename: ${doc.originalFilename}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
