import { getDb } from '../server/db';
import { panelBeaterQuotes, quoteLineItems, panelBeaters } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }
  const quotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, 6240003));
  for (const q of quotes) {
    // Look up panel beater name
    const pb = await db.select().from(panelBeaters).where(eq(panelBeaters.id, q.panelBeaterId));
    const name = pb[0]?.name ?? `PanelBeater#${q.panelBeaterId}`;
    console.log(`Quote id=${q.id}: ${name} | quotedAmount: ${q.quotedAmount} cents = USD ${(q.quotedAmount / 100).toFixed(2)} | status: ${q.status}`);
    const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, q.id));
    const total = items.reduce((s, i) => s + (i.lineTotalCents ?? 0), 0);
    console.log(`  Line items: ${items.length} | Sum lineTotalCents: ${total} = USD ${(total / 100).toFixed(2)}`);
    if (items.length > 0) {
      console.log(`  Sample item: ${items[0].description} | unitCost: ${items[0].unitCostCents} | qty: ${items[0].quantity} | lineTotal: ${items[0].lineTotalCents}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
