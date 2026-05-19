import { getDb } from '../server/db';
import { panelBeaterQuotes, quoteLineItems } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }
  const quotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, 6240003));
  for (const q of quotes) {
    console.log(`Quote: ${q.panelBeaterName} | USD: ${((q.quotedAmountCents ?? 0) / 100).toFixed(2)}`);
    const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, q.id));
    const total = items.reduce((s, i) => s + (i.lineTotalCents ?? 0), 0);
    console.log(`  Items: ${items.length} | Sum USD: ${(total / 100).toFixed(2)}`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
