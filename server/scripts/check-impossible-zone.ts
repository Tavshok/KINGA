import "dotenv/config";
import { getDb } from '../db';
import { aiAssessments } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.select().from(aiAssessments).where(eq(aiAssessments.id, 15840001));
  if (rows.length === 0) { console.log('Not found'); process.exit(1); }
  const row = rows[0];

  const paRaw = (row as any).physicsAnalysis;
  if (!paRaw) { console.log('No physicsAnalysis'); process.exit(1); }
  const pa = JSON.parse(paRaw);
  const dc = pa.damageClassification;
  if (!dc) { console.log('No damageClassification'); process.exit(1); }

  console.log('=== ALL CLASSIFICATIONS ===');
  const all = [
    ...(dc.componentClassifications || []),
    ...(dc.zoneClassifications || []),
  ];
  for (const c of all) {
    console.log(`[${c.classification}] ${c.component} — ${c.reason?.substring(0, 80)}`);
  }

  console.log('\n=== IMPOSSIBLE ITEMS ===');
  const impossible = all.filter((c: any) => c.classification === 'IMPOSSIBLE');
  for (const c of impossible) {
    console.log(`IMPOSSIBLE: ${c.component}`);
    console.log(`  reason: ${c.reason}`);
    console.log(`  evidenceBasis: ${JSON.stringify(c.evidenceBasis)}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log('possible:', dc.counts?.possible);
  console.log('impossible:', dc.counts?.impossible);
  console.log('unexplained:', dc.counts?.unexplained);
  console.log('componentClassifications count:', dc.componentClassifications?.length);
  console.log('zoneClassifications count:', dc.zoneClassifications?.length);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
