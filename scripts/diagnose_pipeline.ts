// @ts-nocheck
import { getDb } from '/home/ubuntu/kinga-replit/server/db';
import { sql } from 'drizzle-orm';

async function diagnose() {
  const db = await getDb();
  
  // 1. Claims by status
  const statusCounts = await db.execute(sql`
    SELECT status, workflow_state, COUNT(*) as cnt 
    FROM claims 
    GROUP BY status, workflow_state 
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log('=== CLAIM STATUS DISTRIBUTION ===');
  (statusCounts[0] as any[]).forEach((r: any) => console.log(`  ${r.status} / ${r.workflow_state}: ${r.cnt}`));
  
  // 2. Stuck claims (in_progress for > 30 min)
  const stuckClaims = await db.execute(sql`
    SELECT id, claim_number, status, workflow_state, created_at, updated_at
    FROM claims 
    WHERE status IN ('assessment_in_progress', 'intake_pending')
    AND updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
    LIMIT 10
  `);
  console.log('\n=== STUCK CLAIMS (>30min) ===');
  const stuck = stuckClaims[0] as any[];
  if (stuck.length === 0) console.log('  None - all clear!');
  else stuck.forEach((r: any) => console.log(`  ID:${r.id} ${r.claim_number} | ${r.status} | ${r.workflow_state} | updated: ${r.updated_at}`));
  
  // 3. Recent pipeline runs (last 24h)
  const recentClaims = await db.execute(sql`
    SELECT c.id, c.claim_number, c.status, c.workflow_state,
           a.confidence_score, a.fraud_risk_score, a.created_at as assessed_at
    FROM claims c
    LEFT JOIN ai_assessments a ON a.claim_id = c.id
    WHERE c.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ORDER BY c.created_at DESC
    LIMIT 10
  `);
  console.log('\n=== RECENT CLAIMS (24h) ===');
  (recentClaims[0] as any[]).forEach((r: any) => console.log(`  ID:${r.id} ${r.claim_number} | ${r.status} | confidence:${r.confidence_score} fraud:${r.fraud_risk_score}`));
  
  // 4. Report generation status - check pdf_reports table exists
  try {
    const reportStatus = await db.execute(sql`
      SELECT report_type, COUNT(*) as cnt, 
             AVG(CHAR_LENGTH(IFNULL(report_data,''))) as avg_size
      FROM pdf_reports
      GROUP BY report_type
    `);
    console.log('\n=== PDF REPORTS TABLE ===');
    const rpts = reportStatus[0] as any[];
    if (rpts.length === 0) console.log('  No reports stored in DB yet');
    else rpts.forEach((r: any) => console.log(`  ${r.report_type}: ${r.cnt} reports, avg ${Math.round(r.avg_size/1024)}KB`));
  } catch(e: any) {
    console.log('\n=== PDF REPORTS TABLE ===');
    console.log('  Table not found or error:', e.message);
  }
  
  // 5. LLM call timing - check if any assessment took > 5 min
  const slowAssessments = await db.execute(sql`
    SELECT c.claim_number, 
           TIMESTAMPDIFF(MINUTE, c.created_at, a.created_at) as minutes_to_assess
    FROM claims c
    JOIN ai_assessments a ON a.claim_id = c.id
    WHERE c.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY minutes_to_assess DESC
    LIMIT 5
  `);
  console.log('\n=== PIPELINE TIMING (slowest assessments, 7d) ===');
  (slowAssessments[0] as any[]).forEach((r: any) => console.log(`  ${r.claim_number}: ${r.minutes_to_assess} min to assess`));
  
  process.exit(0);
}
diagnose().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
