import { db } from '../server/db';
import { panelBeaterQuotes, panelBeaters } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const claimId = 7260001;
  
  const quotes = await db
    .select({
      id: panelBeaterQuotes.id,
      panelBeaterId: panelBeaterQuotes.panelBeaterId,
      quotedAmount: panelBeaterQuotes.quotedAmount,
      status: panelBeaterQuotes.status,
      modified: panelBeaterQuotes.modified,
      quoteType: (panelBeaterQuotes as any).quoteType,
      businessName: panelBeaters.businessName,
    })
    .from(panelBeaterQuotes)
    .leftJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
    .where(eq(panelBeaterQuotes.claimId, claimId));

  console.log(`\nClaim ${claimId} — ${quotes.length} quotes:`);
  quotes.forEach(q => {
    console.log(`  ID=${q.id} panelBeaterId=${q.panelBeaterId} name="${q.businessName}" amount=${q.quotedAmount} modified=${q.modified} quoteType=${q.quoteType} status=${q.status}`);
  });
}

main().catch(console.error).finally(() => process.exit(0));
