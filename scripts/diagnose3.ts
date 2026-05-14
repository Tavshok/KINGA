// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const db = await getDb();
  
  // Check ai_assessments columns
  const cols = await db.execute(sql`SHOW COLUMNS FROM ai_assessments`);
  const colNames = (cols[0] as any[]).map((c:any) => c.Field);
  console.log('AI_ASSESSMENTS COLUMNS:', colNames.join(', '));
  
  // Recent assessments
  const r2 = await db.execute(sql`SELECT claim_id, confidence_score, fraud_risk_score, recommendation FROM ai_assessments ORDER BY id DESC LIMIT 5`);
  console.log('\nRECENT ASSESSMENTS:');
  (r2[0] as any[]).forEach((a:any) => console.log(`  claim:${a.claim_id} conf:${a.confidence_score} fraud:${a.fraud_risk_score} rec:${a.recommendation}`));
  
  // Pipeline timing
  const r3 = await db.execute(sql`SELECT c.claim_number, TIMESTAMPDIFF(MINUTE, c.created_at, a.created_at) as mins FROM claims c JOIN ai_assessments a ON a.claim_id=c.id ORDER BY a.id DESC LIMIT 5`);
  console.log('\nPIPELINE TIMING (recent):');
  (r3[0] as any[]).forEach((r:any) => console.log(`  ${r.claim_number}: ${r.mins} min`));
  
  // Check stuck claims detail
  const r4 = await db.execute(sql`SELECT id, claim_number, status, workflow_state, updated_at FROM claims WHERE status IN ('assessment_in_progress','intake_pending') AND updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE) LIMIT 5`);
  console.log('\nSTUCK CLAIMS:');
  const stuck = r4[0] as any[];
  if (stuck.length === 0) console.log('  None');
  else stuck.forEach((r:any) => console.log(`  ${r.id} ${r.claim_number} | ${r.status} | ${r.workflow_state} | updated:${r.updated_at}`));
  
  // Check if pdf_reports table exists
  try {
    const r5 = await db.execute(sql`SELECT report_type, COUNT(*) as cnt FROM pdf_reports GROUP BY report_type`);
    console.log('\nPDF REPORTS TABLE:');
    (r5[0] as any[]).forEach((r:any) => console.log(`  ${r.report_type}: ${r.cnt}`));
  } catch(e: any) {
    console.log('\nPDF REPORTS TABLE: not found');
  }
  
  // Check ingestion_documents for failed ones
  const r6 = await db.execute(sql`SELECT status, COUNT(*) as cnt FROM ingestion_documents GROUP BY status ORDER BY cnt DESC`);
  console.log('\nINGESTION DOCUMENT STATUS:');
  (r6[0] as any[]).forEach((r:any) => console.log(`  ${r.status}: ${r.cnt}`));
  
  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
