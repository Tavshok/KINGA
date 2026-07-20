import { db } from '../server/db.js';
import { claims, aiAssessments, panelBeaterQuotes, quoteLineItems, claimDocuments, fraudAnalyses } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { writeFileSync } from 'fs';

const CLAIM_ID = 10239902;

async function main() {
  const [c] = await db.select().from(claims).where(eq(claims.id, CLAIM_ID)).limit(1);
  const [ai] = await db.select().from(aiAssessments).where(eq(aiAssessments.claimId, CLAIM_ID)).limit(1);
  const quotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, CLAIM_ID));
  const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.claimId, CLAIM_ID));
  const docs = await db.select().from(claimDocuments).where(eq(claimDocuments.claimId, CLAIM_ID));
  const [fraud] = await db.select().from(fraudAnalyses).where(eq(fraudAnalyses.claimId, CLAIM_ID)).limit(1);

  const out = { c, ai, quotes, items, docs, fraud };
  writeFileSync('/tmp/claim-10239902-data.json', JSON.stringify(out, null, 2));
  console.log('Written to /tmp/claim-10239902-data.json');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
