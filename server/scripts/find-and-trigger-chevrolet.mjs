import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Use the compiled server via tsx
const { getDb } = await import('../db.ts');
const { claims } = await import('../../drizzle/schema.ts');
const { like } = await import('drizzle-orm');
const { triggerAiAssessment } = await import('../db.ts');

const db = await getDb();
if (!db) {
  console.error('NO DB');
  process.exit(1);
}

// Find the Chevrolet ADL8563 claim
const rows = await db.select({
  id: claims.id,
  claimNumber: claims.claimNumber,
  vehicleRegistration: claims.vehicleRegistration,
  kingaRef: claims.kingaRef,
  damagePhotos: claims.damagePhotos,
  pdfUrl: claims.pdfUrl,
}).from(claims).where(like(claims.vehicleRegistration, '%ADL%'));

console.log('Found claims:', JSON.stringify(rows.map(r => ({
  id: r.id,
  claimNumber: r.claimNumber,
  vehicleRegistration: r.vehicleRegistration,
  kingaRef: r.kingaRef,
  hasPdf: !!r.pdfUrl,
  damagePhotoCount: r.damagePhotos ? JSON.parse(r.damagePhotos).length : 0,
})), null, 2));

if (rows.length === 0) {
  console.log('No ADL claims found. Searching by claim number...');
  const all = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    vehicleRegistration: claims.vehicleRegistration,
    kingaRef: claims.kingaRef,
  }).from(claims).limit(20);
  console.log('Recent claims:', JSON.stringify(all, null, 2));
  process.exit(0);
}

const claim = rows[0];
console.log(`\nTriggering pipeline for claim ID ${claim.id} (${claim.vehicleRegistration})...`);

// Clear cached damage photos so the pipeline re-extracts them
await db.update(claims).set({
  damagePhotos: null,
  updatedAt: new Date(),
}).where(like(claims.vehicleRegistration, '%ADL%'));
console.log('Cleared cached damagePhotos — pipeline will re-extract from PDF');

await triggerAiAssessment(claim.id);
console.log('Pipeline triggered. Monitor server logs for progress.');
process.exit(0);
