import { db } from '../server/db';
import { panelBeaterQuotes, quoteLineItems } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const quotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, 6240003));
for (const q of quotes) {
  console.log(`Quote: ${q.panelBeaterName} | total cents: ${q.quotedAmountCents} | USD: ${((q.quotedAmountCents??0)/100).toFixed(2)}`);
  const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, q.id));
  console.log(`  Line items: ${items.length}`);
  const total = items.reduce((s, i) => s + (i.lineTotalCents ?? 0), 0);
  console.log(`  Sum of line items: USD ${(total/100).toFixed(2)}`);
}
process.exit(0);
