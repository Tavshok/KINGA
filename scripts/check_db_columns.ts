// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Get actual columns in ai_assessments
  const [cols] = await db.execute(sql`SHOW COLUMNS FROM ai_assessments`);
  const actualCols = new Set((cols as any[]).map(c => c.Field));
  
  console.log("=== AI_ASSESSMENTS ACTUAL DB COLUMNS ===");
  for (const c of cols as any[]) {
    console.log(`  ${c.Field} | ${c.Type} | ${c.Null === 'YES' ? 'nullable' : 'NOT NULL'}`);
  }
  console.log(`\nTotal columns: ${actualCols.size}`);
  
  // Expected columns from schema that might be missing
  const expectedNew = [
    'forensic_analysis_json',
    'coherence_result_json', 
    'cost_realism_json',
    'consistency_check_json',
    'contradiction_gate_json',
    'physics_deviation_score',
    'composite_optimisation',
    'cost_decision',
    'vehicle_analysis',
    'damage_analysis',
    'claim_summary',
    'executive_summary',
    'narrative_report',
    'workflow_audit_trail',
    'fraud_analysis',
    'total_claim_amount',
    'currency',
    'confidence',
  ];
  
  console.log("\n=== MISSING COLUMNS ===");
  for (const col of expectedNew) {
    if (!actualCols.has(col)) {
      console.log(`  MISSING: ${col}`);
    } else {
      console.log(`  EXISTS: ${col}`);
    }
  }
  
  // Also check user's claims
  const [userClaims] = await db.execute(sql`
    SELECT id, claim_number, kinga_ref, source_document_id, claim_source, 
           workflow_state, ai_assessment_triggered, ai_assessment_completed,
           document_processing_status, created_at
    FROM claims 
    WHERE tenant_id = 'tenant-1771335377063'
    ORDER BY id DESC LIMIT 15
  `);
  
  console.log("\n=== USER'S CLAIMS (tenant-1771335377063) ===");
  for (const c of userClaims as any[]) {
    console.log(`  Claim ${c.id} | ${c.claim_number} | ${c.kinga_ref || 'no-ref'} | src=${c.claim_source} | state=${c.workflow_state} | docId=${c.source_document_id} | aiTriggered=${c.ai_assessment_triggered} | aiDone=${c.ai_assessment_completed} | docStatus=${c.document_processing_status}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
