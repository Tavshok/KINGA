import { getDb } from '../server/db';
import { panelBeaterQuotes, panelBeaters, claims } from '../drizzle/schema';
import { eq, inArray, like, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('No DB'); process.exit(1); }

  // Find Kingfisher panel beater
  console.log('=== Searching for Kingfisher panel beater ===');
  const kf = await db.select({ id: panelBeaters.id, name: panelBeaters.name, businessName: panelBeaters.businessName })
    .from(panelBeaters)
    .where(like(panelBeaters.name, '%Kingfisher%'));
  console.log('Kingfisher:', JSON.stringify(kf));

  if (kf.length > 0) {
    const kfId = kf[0].id;
    // Find claims with Kingfisher quotes
    const kfQuotes = await db.select({ id: panelBeaterQuotes.id, claimId: panelBeaterQuotes.claimId, quotedAmount: panelBeaterQuotes.quotedAmount })
      .from(panelBeaterQuotes)
      .where(eq(panelBeaterQuotes.panelBeaterId, kfId));
    console.log('Kingfisher quotes:', JSON.stringify(kfQuotes));

    // For each claim with Kingfisher, show all quotes
    for (const kfq of kfQuotes) {
      console.log(`\n=== All quotes for claim ${kfq.claimId} ===`);
      const allQ = await db.select({
        id: panelBeaterQuotes.id,
        panelBeaterId: panelBeaterQuotes.panelBeaterId,
        quotedAmount: panelBeaterQuotes.quotedAmount,
        status: panelBeaterQuotes.status,
      }).from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, kfq.claimId));
      
      const pbIds = [...new Set(allQ.map(q => q.panelBeaterId))];
      const pbs = await db.select({ id: panelBeaters.id, name: panelBeaters.name, businessName: panelBeaters.businessName })
        .from(panelBeaters).where(inArray(panelBeaters.id, pbIds));
      const pbMap = new Map(pbs.map(pb => [pb.id, pb]));
      
      for (const q of allQ) {
        const pb = pbMap.get(q.panelBeaterId);
        console.log(`  Quote ${q.id}: "${pb?.businessName || pb?.name || 'Unknown'}" — $${(q.quotedAmount / 100).toFixed(2)} [${q.status}]`);
      }
    }
  }

  // Also check the most recent 5 claims
  console.log('\n=== Most recent 5 claims ===');
  const recentClaims = await db.execute(
    require('drizzle-orm').sql`SELECT id, document_ref, status, created_at FROM claims ORDER BY created_at DESC LIMIT 5`
  );
  console.log(JSON.stringify(recentClaims));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
