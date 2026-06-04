import { getDb } from '../server/db';
import { quoteLineItems, panelBeaterQuotes, supplierQuotes, claims } from '../drizzle/schema';
import { eq, sql, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }

  // 1. Find which table has quote id 4800001
  console.log('=== Checking panelBeaterQuotes for id=4800001 ===');
  const pbq = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, 4800001)).limit(1);
  console.log('panelBeaterQuotes result:', JSON.stringify(pbq[0] ?? 'not found'));

  // 2. Check quoteLineItems to find which quote table they reference
  const qli = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, 4800001)).limit(1);
  console.log('quoteLineItems sample:', JSON.stringify(qli[0] ?? 'not found'));

  // 3. Find the most recent claim with DOC-20260604
  console.log('\n=== Most recent claims ===');
  const recentClaims = await db.select({
    id: claims.id,
    documentRef: claims.documentRef,
    createdAt: claims.createdAt,
    status: claims.status,
  }).from(claims).orderBy(desc(claims.createdAt)).limit(5);
  for (const c of recentClaims) {
    console.log(`  Claim ${c.id}: ${c.documentRef} | status: ${c.status} | created: ${c.createdAt}`);
  }

  // 4. Find all panel beater quotes for the most recent claim
  if (recentClaims.length > 0) {
    const claimId = recentClaims[0].id;
    console.log(`\n=== Panel beater quotes for claim ${claimId} ===`);
    const pbqs = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, claimId));
    for (const q of pbqs) {
      console.log(`  Quote ${q.id}: repairer="${q.repairerName}" | amount=${q.quotedAmount} | status=${q.status} | isLowest=${q.isLowest}`);
    }

    // 5. Also check supplierQuotes
    console.log(`\n=== Supplier quotes for claim ${claimId} ===`);
    const sqs = await db.select().from(supplierQuotes).where(eq(supplierQuotes.claimId, claimId));
    for (const q of sqs) {
      console.log(`  Supplier quote ${q.id}: name="${(q as any).supplierName ?? (q as any).name}" | amount=${(q as any).quotedAmount ?? (q as any).amount}`);
    }
  }

  // 6. Search for Swiss Motors across all panel beater quotes
  console.log('\n=== Searching for Swiss Motors in panelBeaterQuotes ===');
  const swissQuotes = await db.execute(sql`SELECT id, claim_id, repairer_name, quoted_amount, status, is_lowest, source FROM panel_beater_quotes WHERE repairer_name LIKE '%Swiss%' OR repairer_name LIKE '%swiss%' ORDER BY id DESC LIMIT 10`);
  console.log('Swiss Motors quotes:', JSON.stringify(swissQuotes));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
