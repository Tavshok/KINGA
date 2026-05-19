import { getDb } from '../server/db';
import { panelBeaterQuotes, quoteLineItems, panelBeaters } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }
  const quotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, 6240003));
  for (const q of quotes) {
    const pb = await db.select().from(panelBeaters).where(eq(panelBeaters.id, q.panelBeaterId));
    const name = pb[0]?.name ?? `PanelBeater#${q.panelBeaterId}`;
    console.log(`\nQuote id=${q.id}: ${name} | quotedAmount: USD ${(q.quotedAmount / 100).toFixed(2)}`);
    const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, q.id));
    const total = items.reduce((s, i) => s + parseFloat(String(i.lineTotal ?? '0')), 0);
    console.log(`  Line items: ${items.length} | Sum lineTotal: USD ${total.toFixed(2)}`);
    if (items.length > 0) {
      const sample = items[0];
      console.log(`  Sample: "${sample.description}" | unitPrice: ${sample.unitPrice} | qty: ${sample.quantity} | lineTotal: ${sample.lineTotal}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
