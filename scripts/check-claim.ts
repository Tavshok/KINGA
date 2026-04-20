// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

const db = await getDb();
if (!db) { console.error('no db'); process.exit(1); }

const [rows] = await db.execute(
  sql`SELECT claim_reference, pdf_url, damage_photos, document_processing_status, status, ai_assessment_triggered FROM claims ORDER BY created_at DESC LIMIT 10`
);

for (const r of rows as any[]) {
  const photos = r.damage_photos ? JSON.parse(r.damage_photos) : [];
  console.log('Ref:', r.claim_reference);
  console.log('  Status:', r.status, '/', r.document_processing_status);
  console.log('  Photos:', photos.length);
  console.log('  pdfUrl:', r.pdf_url ? r.pdf_url.substring(0, 80) : 'NULL');
  console.log('---');
}
process.exit(0);
