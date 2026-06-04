import { getDb } from '../server/db';
import { panelBeaterQuotes, panelBeaters } from '../drizzle/schema';
import { eq, inArray } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }

  const CLAIM_ID = 6240003;

  // 1. All quotes for this claim
  const quotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, CLAIM_ID));
  console.log(`\n=== ${quotes.length} quotes for claim ${CLAIM_ID} ===`);
  for (const q of quotes) {
    console.log(`  id=${q.id} panelBeaterId=${q.panelBeaterId} amount=${q.quotedAmount} status=${q.status} parts=${q.partsCost} labour=${q.laborCost}`);
  }

  // 2. Resolve panel beater names
  const pbIds = [...new Set(quotes.map(q => q.panelBeaterId))];
  const pbs = pbIds.length > 0 ? await db.select({ id: panelBeaters.id, name: panelBeaters.name, businessName: panelBeaters.businessName }).from(panelBeaters).where(inArray(panelBeaters.id, pbIds)) : [];
  console.log(`\n=== Panel beaters for these quotes ===`);
  for (const pb of pbs) {
    console.log(`  id=${pb.id} name="${pb.name}" businessName="${pb.businessName}"`);
  }

  // 3. Show what the report would see
  const pbMap = new Map(pbs.map(pb => [pb.id, pb]));
  console.log(`\n=== What the report renders ===`);
  for (const q of quotes) {
    const pb = pbMap.get(q.panelBeaterId);
    const displayName = pb?.businessName || pb?.name || `Repairer #${q.panelBeaterId}`;
    console.log(`  Quote ${q.id}: "${displayName}" — $${(q.quotedAmount / 100).toFixed(2)}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
