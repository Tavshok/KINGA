// @ts-nocheck
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const db = await getDb();
  
  // Recent claims (24h)
  const r1 = await db.execute(sql`SELECT c.id, c.claim_number, c.status, c.workflow_state, c.created_at FROM claims c WHERE c.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY c.created_at DESC LIMIT 10`);
  console.log('RECENT 24h:');
  (r1[0] as any[]).forEach((r:any) => console.log(`  ${r.id} ${r.claim_number} | ${r.status} | ${r.workflow_state}`));
  
  // AI assessments for recent
  const r2 = await db.execute(sql`SELECT claim_id, confidence_score, fraud_risk_score, recommendation FROM ai_assessments WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at DESC LIMIT 10`);
  console.log('AI ASSESSMENTS 24h:');
  (r2[0] as any[]).forEach((r:any) => console.log(`  claim:${r.claim_id} conf:${r.confidence_score} fraud:${r.fraud_risk_score} rec:${r.recommendation}`));
  
  // Pipeline timing
  const r3 = await db.execute(sql`SELECT c.claim_number, TIMESTAMPDIFF(MINUTE, c.created_at, a.created_at) as mins FROM claims c JOIN ai_assessments a ON a.claim_id=c.id WHERE c.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY mins DESC LIMIT 5`);
  console.log('SLOWEST ASSESSMENTS (7d):');
  (r3[0] as any[]).forEach((r:any) => console.log(`  ${r.claim_number}: ${r.mins} min`));
  
  // Check for pdf_reports table
  try {
    const r4 = await db.execute(sql`SELECT report_type, COUNT(*) as cnt FROM pdf_reports GROUP BY report_type`);
    console.log('PDF REPORTS TABLE:');
    (r4[0] as any[]).forEach((r:any) => console.log(`  ${r.report_type}: ${r.cnt}`));
  } catch(e: any) {
    console.log('PDF REPORTS TABLE: not found -', e.message.substring(0, 80));
  }
  
  // Stuck claims
  const r5 = await db.execute(sql`SELECT id, claim_number, status, workflow_state, updated_at FROM claims WHERE status IN ('assessment_in_progress','intake_pending') AND updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE) LIMIT 5`);
  console.log('STUCK CLAIMS (>30min):');
  const stuck = r5[0] as any[];
  if (stuck.length === 0) console.log('  None');
  else stuck.forEach((r:any) => console.log(`  ${r.id} ${r.claim_number} | ${r.status} | updated:${r.updated_at}`));
  
  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
