import { createPool } from 'mysql2/promise';

const pool = createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 2,
});

async function main() {
  // 1. Full claim record
  const [claimRows] = await pool.execute(
    `SELECT id, claim_reference, status, vehicle_make, vehicle_model, vehicle_year,
            vehicle_registration, police_report_number, damage_photos, source_document_id,
            external_assessment_url, ai_assessment_completed, estimated_speed_kmh,
            created_at
     FROM claims WHERE id = 9330001`
  ) as any[];
  console.log('\n=== CLAIM RECORD ===');
  console.log(JSON.stringify(claimRows[0], null, 2));

  // 2. All assessments for this claim
  const [assessRows] = await pool.execute(
    `SELECT id, recommendation, fraud_score, fraud_risk_level, confidence_score,
            estimated_cost, total_loss_indicated, structural_damage_severity,
            damaged_components_json, created_at
     FROM ai_assessments WHERE claim_id = 9330001 ORDER BY created_at DESC`
  ) as any[];
  console.log(`\n=== ALL ASSESSMENTS (${(assessRows as any[]).length} total) ===`);
  for (const a of assessRows as any[]) {
    let components: any[] = [];
    try { components = JSON.parse(a.damaged_components_json || '[]'); } catch {}
    console.log(`  id=${a.id} | rec=${a.recommendation} | fraud=${a.fraud_score} | components=${components.length} | created=${a.created_at}`);
  }

  // 3. Latest assessment full fraud breakdown and forensic analysis
  if ((assessRows as any[]).length > 0) {
    const latest = (assessRows as any[])[0];
    const [fullRows] = await pool.execute(
      `SELECT fraud_score_breakdown_json, forensic_analysis, physics_analysis
       FROM ai_assessments WHERE id = ?`, [latest.id]
    ) as any[];
    const full = (fullRows as any[])[0];
    
    console.log('\n=== FRAUD BREAKDOWN ===');
    try {
      const bd = JSON.parse(full.fraud_score_breakdown_json || '{}');
      console.log(JSON.stringify(bd, null, 2));
    } catch { console.log('(parse error)'); }

    console.log('\n=== FORENSIC ANALYSIS (key fields) ===');
    try {
      const fa = JSON.parse(full.forensic_analysis || '{}');
      console.log(JSON.stringify({
        photoCount: fa.photoCount,
        documentCount: fa.documentCount,
        policeReportPresent: fa.policeReportPresent,
        dataCompletenessScore: fa.dataCompletenessScore,
        flags: fa.flags?.slice(0, 5),
        indicators: fa.indicators?.slice(0, 5),
      }, null, 2));
    } catch { console.log('(parse error)'); }

    console.log('\n=== PHYSICS ANALYSIS (speed ensemble) ===');
    try {
      const pa = JSON.parse(full.physics_analysis || '{}');
      const ensemble = pa.speedInferenceEnsemble;
      if (ensemble) {
        console.log(JSON.stringify({
          consensusSpeedKmh: ensemble.consensusSpeedKmh,
          overallConfidence: ensemble.overallConfidence,
          evidenceAgreementPct: ensemble.evidenceAgreementPct,
          methods: ensemble.methods?.map((m: any) => ({
            method: m.method,
            speedKmh: m.speedKmh,
            confidenceWeight: m.confidenceWeight,
          })),
        }, null, 2));
      } else {
        console.log('(no ensemble data)');
      }
    } catch { console.log('(parse error)'); }
  }

  await pool.end();
}

main().catch(console.error);
