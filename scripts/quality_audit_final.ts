// @ts-nocheck
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  
  // Check all assessments for the user's real claims
  const [assessments] = await db.execute(sql`
    SELECT a.id, a.claim_id, c.claim_number, c.kinga_ref,
           a.fraud_score, a.confidence_score, a.recommendation, a.fraud_risk_level, a.fcdi_score,
           CASE WHEN a.cost_intelligence_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as cost_intel,
           CASE WHEN a.physics_analysis IS NOT NULL THEN 'SET' ELSE 'NULL' END as physics,
           CASE WHEN a.pipeline_run_summary IS NOT NULL THEN 'SET' ELSE 'NULL' END as pipeline_summary,
           CASE WHEN a.coherence_result_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as coherence,
           CASE WHEN a.cost_realism_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as cost_realism,
           CASE WHEN a.consistency_check_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as consistency,
           CASE WHEN a.contradiction_gate_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as contradiction,
           CASE WHEN a.physics_deviation_score IS NOT NULL THEN 'SET' ELSE 'NULL' END as phys_dev,
           CASE WHEN a.fraud_score_breakdown_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as fraud_breakdown,
           CASE WHEN a.enriched_photos_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as enriched_photos,
           CASE WHEN a.photo_classification_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as photo_class,
           CASE WHEN a.stage2_raw_ocr_text IS NOT NULL THEN 'SET' ELSE 'NULL' END as ocr_text,
           CASE WHEN a.claim_record_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as claim_record,
           CASE WHEN a.narrative_analysis_json IS NOT NULL THEN 'SET' ELSE 'NULL' END as narrative,
           a.image_analysis_total_count, a.image_analysis_success_count, a.image_analysis_success_rate,
           a.created_at
    FROM ai_assessments a
    JOIN claims c ON a.claim_id = c.id
    WHERE c.tenant_id = 'tenant-1771335377063'
    ORDER BY a.id DESC
    LIMIT 15
  `);
  
  console.log("=== ASSESSMENT QUALITY AUDIT (USER'S REAL CLAIMS) ===\n");
  let totalFields = 0;
  let populatedFields = 0;
  
  for (const a of assessments as any[]) {
    console.log(`\n--- Assessment ${a.id} | Claim ${a.claim_id} (${a.claim_number}) | ${a.kinga_ref} ---`);
    console.log(`  SCORES: fraud=${a.fraud_score} | conf=${a.confidence_score} | rec=${a.recommendation} | risk=${a.fraud_risk_level} | fcdi=${a.fcdi_score}`);
    console.log(`  IMAGES: total=${a.image_analysis_total_count} | success=${a.image_analysis_success_count} | rate=${a.image_analysis_success_rate}%`);
    
    const fields = {
      cost_intel: a.cost_intel,
      physics: a.physics,
      pipeline_summary: a.pipeline_summary,
      coherence: a.coherence,
      cost_realism: a.cost_realism,
      consistency: a.consistency,
      contradiction: a.contradiction,
      phys_dev: a.phys_dev,
      fraud_breakdown: a.fraud_breakdown,
      enriched_photos: a.enriched_photos,
      photo_class: a.photo_class,
      ocr_text: a.ocr_text,
      claim_record: a.claim_record,
      narrative: a.narrative,
    };
    
    const setFields = Object.entries(fields).filter(([_, v]) => v === 'SET').map(([k]) => k);
    const nullFields = Object.entries(fields).filter(([_, v]) => v === 'NULL').map(([k]) => k);
    
    totalFields += Object.keys(fields).length;
    populatedFields += setFields.length;
    
    console.log(`  POPULATED (${setFields.length}/${Object.keys(fields).length}): ${setFields.join(', ')}`);
    if (nullFields.length > 0) {
      console.log(`  MISSING: ${nullFields.join(', ')}`);
    }
    
    // Check if this is a degraded assessment
    const isGoodScore = a.fraud_score !== null;
    const isGoodConf = a.confidence_score !== null && a.confidence_score > 50;
    const hasRec = a.recommendation !== null;
    const hasCostData = a.cost_intel === 'SET';
    const hasPhysics = a.physics === 'SET';
    
    const quality = isGoodScore && isGoodConf && hasRec && hasCostData && hasPhysics ? 'GOOD' : 
                    isGoodScore && hasRec ? 'PARTIAL' : 'DEGRADED';
    console.log(`  QUALITY: ${quality}`);
  }
  
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Total assessments: ${(assessments as any[]).length}`);
  console.log(`Field population rate: ${populatedFields}/${totalFields} (${Math.round(populatedFields/totalFields*100)}%)`);
  
  const good = (assessments as any[]).filter(a => a.fraud_score !== null && a.confidence_score > 50 && a.recommendation !== null && a.cost_intel === 'SET' && a.physics === 'SET').length;
  const partial = (assessments as any[]).filter(a => a.fraud_score !== null && a.recommendation !== null && (a.cost_intel !== 'SET' || a.physics !== 'SET')).length;
  const degraded = (assessments as any[]).length - good - partial;
  
  console.log(`GOOD quality: ${good}`);
  console.log(`PARTIAL quality: ${partial}`);
  console.log(`DEGRADED quality: ${degraded}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
