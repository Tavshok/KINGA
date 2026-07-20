import { getDb } from '../server/db';
import { claims, aiAssessments, panelBeaterQuotes, quoteLineItems, claimDocuments, fraudAlerts } from '../drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { writeFileSync } from 'fs';

const CLAIM_ID = 10239902;

async function main() {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const [c] = await db.select().from(claims).where(eq(claims.id, CLAIM_ID)).limit(1);
  const [ai] = await db.select().from(aiAssessments).where(eq(aiAssessments.claimId, CLAIM_ID)).limit(1);
  const quotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, CLAIM_ID));
  const quoteIds = quotes.map(q => q.id);
  const items = quoteIds.length > 0 ? await db.select().from(quoteLineItems).where(inArray(quoteLineItems.quoteId, quoteIds)) : [];
  const docs = await db.select().from(claimDocuments).where(eq(claimDocuments.claimId, CLAIM_ID));
  const fraudRows = await db.select().from(fraudAlerts).where(eq(fraudAlerts.claimId, CLAIM_ID)).limit(5);

  const out = { c, ai, quotes, items, docs, fraudAlerts: fraudRows };
  writeFileSync('/tmp/claim-10239902-data.json', JSON.stringify(out, null, 2));
  console.log('Written to /tmp/claim-10239902-data.json');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
