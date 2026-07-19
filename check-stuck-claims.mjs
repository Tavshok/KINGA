import { db } from './server/db.js';
import { claims, claimDocuments } from './drizzle/schema.js';
import { eq, desc, sql } from 'drizzle-orm';

const stuck = await db.select({
  id: claims.id,
  ref: claims.claim_reference,
  status: claims.status,
  created: claims.created_at,
  docs: sql`(SELECT COUNT(*) FROM claim_documents WHERE claim_id = ${claims.id})`
}).from(claims)
  .where(eq(claims.status, 'pending'))
  .orderBy(desc(claims.created_at))
  .limit(20);

console.log('\nPending claims with doc counts:');
stuck.forEach(c => {
  const flag = Number(c.docs) === 0 ? ' ⚠️  NO DOCS' : '';
  console.log(`  ${c.ref} | docs:${c.docs} | created:${new Date(Number(c.created)).toISOString()}${flag}`);
});

const noDocs = stuck.filter(c => Number(c.docs) === 0);
console.log(`\nClaims with 0 documents: ${noDocs.length}`);
if (noDocs.length > 0) {
  console.log('IDs to re-trigger:', noDocs.map(c => c.id).join(', '));
}
process.exit(0);
