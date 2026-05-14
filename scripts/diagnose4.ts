// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const db = await getDb();
  
  // Recent assessments
  const r2 = await db.execute(sql`SELECT claim_id, confidence_score, fraud_score, recommendation FROM ai_assessments ORDER BY id DESC LIMIT 5`);
  console.log('RECENT ASSESSMENTS (last 5):');
  (r2[0] as any[]).forEach((a:any) => console.log(`  claim:${a.claim_id} conf:${a.confidence_score} fraud:${a.fraud_score} rec:${a.recommendation}`));
  
  // Pipeline timing
  const r3 = await db.execute(sql`SELECT c.claim_number, TIMESTAMPDIFF(MINUTE, c.created_at, a.created_at) as mins FROM claims c JOIN ai_assessments a ON a.claim_id=c.id ORDER BY a.id DESC LIMIT 5`);
  console.log('\nPIPELINE TIMING (recent):');
  (r3[0] as any[]).forEach((r:any) => console.log(`  ${r.claim_number}: ${r.mins} min`));
  
  // Stuck claims
  const r4 = await db.execute(sql`SELECT id, claim_number, status, workflow_state, updated_at FROM claims WHERE status IN ('assessment_in_progress','intake_pending') AND updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE) LIMIT 5`);
  console.log('\nSTUCK CLAIMS (>30min):');
  const stuck = r4[0] as any[];
  if (stuck.length === 0) console.log('  None');
  else stuck.forEach((r:any) => console.log(`  ${r.id} ${r.claim_number} | ${r.status} | ${r.workflow_state} | updated:${r.updated_at}`));
  
  // Ingestion status
  const r6 = await db.execute(sql`SELECT status, COUNT(*) as cnt FROM ingestion_documents GROUP BY status ORDER BY cnt DESC`);
  console.log('\nINGESTION DOCUMENT STATUS:');
  (r6[0] as any[]).forEach((r:any) => console.log(`  ${r.status}: ${r.cnt}`));
  
  // Report readiness check - look at report_readiness_json for the Voltron claim
  const r7 = await db.execute(sql`SELECT claim_id, recommendation, report_readiness_json, confidence_score FROM ai_assessments WHERE claim_id = 6150002`);
  console.log('\nVOLTRON CLAIM ASSESSMENT:');
  (r7[0] as any[]).forEach((a:any) => {
    console.log(`  claim:${a.claim_id} conf:${a.confidence_score} rec:${a.recommendation}`);
    if (a.report_readiness_json) {
      try {
        const rr = JSON.parse(a.report_readiness_json);
        console.log(`  report_ready:${rr.ready} issues:${JSON.stringify(rr.issues || [])}`);
      } catch(e) {}
    }
  });
  
  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
