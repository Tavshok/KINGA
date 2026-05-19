import { getDb } from '../server/db';
import { quoteLineItems } from '../drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }
  // Swiss Motors quote id=4800001
  const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, 4800001));
  console.log(`Swiss Motors line items (${items.length} total):`);
  for (const item of items) {
    const lt = parseFloat(String(item.lineTotal ?? '0'));
    const flag = lt === 0 ? ' ← ZERO' : '';
    console.log(`  ${item.description?.padEnd(40)} | unitPrice: ${String(item.unitPrice ?? '0').padStart(10)} | qty: ${item.quantity} | lineTotal: ${String(item.lineTotal ?? '0').padStart(10)}${flag}`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
