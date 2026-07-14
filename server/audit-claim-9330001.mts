/**
 * audit-claim-9330001.mts
 * Full audit of claim 9330001 — what the system extracted vs what fraud indicators claim is missing.
 */
import { getRawPool } from './db.js';

async function main() {
  const pool = await getRawPool();
  if (!pool) { console.error('No DB pool'); process.exit(1); }

  // 1. Full claim record
  const [claimRows] = await pool.execute(`SELECT * FROM claims WHERE id = 9330001`) as any[];
  const claim = claimRows[0];
  if (!claim) { console.error('Claim not found'); process.exit(1); }

  console.log('=== CLAIM RECORD ===');
  console.log(JSON.stringify({
    id: claim.id,
    reference: claim.claim_reference,
    status: claim.status,
    vehicle_make: claim.vehicle_make,
    vehicle_model: claim.vehicle_model,
    vehicle_year: claim.vehicle_year,
    vehicle_registration: claim.vehicle_registration,
    collision_direction: claim.collision_direction,
    accident_date: claim.accident_date,
    police_report_number: claim.police_report_number,
    estimated_speed_kmh: claim.estimated_speed_kmh,
    airbag_deployment: claim.airbag_deployment,
    structural_damage: claim.structural_damage,
  }, null, 2));

  // 2. Documents attached to this claim
  const [docRows] = await pool.execute(`SELECT id, document_category, file_name, file_url, mime_type, created_at FROM claim_documents WHERE claim_id = 9330001`) as any[];
  console.log(`\n=== DOCUMENTS (${(docRows as any[]).length} total) ===`);
  (docRows as any[]).forEach((d: any) => console.log(`  [${d.document_category}] ${d.file_name} (${d.mime_type}) — ${d.file_url?.slice(0, 80)}`));

  // 3. Check if documents exist under different claim IDs (pipeline might have used wrong ID)
  const [recentDocs] = await pool.execute(`SELECT id, claim_id, document_category, file_name, created_at FROM claim_documents ORDER BY created_at DESC LIMIT 10`) as any[];
  console.log(`\n=== RECENT DOCUMENTS (last 10 across all claims) ===`);
  (recentDocs as any[]).forEach((d: any) => console.log(`  claim=${d.claim_id} [${d.document_category}] ${d.file_name}`));

  // 3b. Check the assessment's classified images and pipeline stage data
  const [stageRows] = await pool.execute(`
    SELECT id, stage_name, stage_data, created_at 
    FROM pipeline_stage_results 
    WHERE assessment_id = 13680001 
    AND stage_name IN ('stage_2_6', 'stage_2_6b', 'stage_1', 'stage_0')
    ORDER BY created_at ASC
  `) as any[];
  console.log(`\n=== PIPELINE STAGE RESULTS (${(stageRows as any[]).length} stages) ===`);
  (stageRows as any[]).forEach((s: any) => {
    try {
      const data = JSON.parse(s.stage_data);
      const summary = {
        stage: s.stage_name,
        imageCount: data.imageCount ?? data.totalImages ?? data.classifiedImages?.length ?? 'n/a',
        damagePhotos: data.damagePhotos?.length ?? data.classifiedImages?.filter((i: any) => i.type === 'DAMAGE_PHOTO')?.length ?? 'n/a',
      };
      console.log(`  ${JSON.stringify(summary)}`);
    } catch { console.log(`  [${s.stage_name}] (parse error)`); }
  });

  // 4. Latest assessment
  const [assessRows] = await pool.execute(`
    SELECT id, recommendation, fraud_score, fraud_risk_level, confidence_score,
           fraud_score_breakdown_json, damaged_components_json, physics_analysis,
           forensic_analysis, created_at
    FROM ai_assessments 
    WHERE claim_id = 9330001 
    ORDER BY created_at DESC 
    LIMIT 1
  `) as any[];
  const assess = (assessRows as any[])[0];
  if (!assess) { console.log('\nNo assessment found'); process.exit(0); }

  console.log(`\n=== ASSESSMENT ===`);
  console.log(`ID: ${assess.id} | Recommendation: ${assess.recommendation} | Fraud: ${assess.fraud_score} (${assess.fraud_risk_level}) | Confidence: ${assess.confidence_score}`);

  // 5. Fraud indicators — what is the system saying is missing?
  if (assess.fraud_score_breakdown_json) {
    try {
      const fraud = JSON.parse(assess.fraud_score_breakdown_json);
      console.log('\n=== ALL FRAUD INDICATORS ===');
      (fraud.indicators ?? []).forEach((ind: any) => {
        console.log(`  [${ind.id ?? 'unknown'}] score=${ind.score} severity=${ind.severity ?? 'n/a'}`);
        console.log(`    ${ind.description}`);
      });
    } catch (e) { console.log('Fraud parse error:', e); }
  }

  // 6. Damaged components — what did Stage 6 extract?
  if (assess.damaged_components_json) {
    try {
      const comps = JSON.parse(assess.damaged_components_json);
      const parts = Array.isArray(comps) ? comps : (comps.damagedParts ?? comps.parts ?? []);
      console.log(`\n=== DAMAGED COMPONENTS (${parts.length} extracted) ===`);
      parts.slice(0, 10).forEach((p: any) => console.log(`  ${p.name} | severity=${p.severity} | source=${p.inputSource}`));
    } catch (e) { console.log('Components parse error:', e); }
  }

  // 7. Physics — what speed did the system compute?
  if (assess.physics_analysis) {
    try {
      const phys = JSON.parse(assess.physics_analysis);
      console.log('\n=== PHYSICS ===');
      console.log(JSON.stringify({
        estimatedSpeedKmh: phys.estimatedSpeedKmh,
        consensusSpeed: phys.speedInferenceEnsemble?.consensusSpeedKmh,
        methodsRan: phys.speedInferenceEnsemble?.methodsRan,
        confidence: phys.speedInferenceEnsemble?.overallConfidence,
        evidenceAgreement: phys.speedInferenceEnsemble?.evidenceAgreementPct,
        accidentSeverity: phys.accidentSeverity,
      }, null, 2));
    } catch (e) { console.log('Physics parse error:', e); }
  }

  // 8. Forensic analysis — semantic classification and VGE
  if (assess.forensic_analysis) {
    try {
      const forensic = JSON.parse(assess.forensic_analysis);
      console.log('\n=== FORENSIC ANALYSIS ===');
      console.log(JSON.stringify({
        dataCompletenessScore: forensic.dataCompletenessScore,
        missingFields: forensic.missingFields,
        photoCount: forensic.photoCount,
        documentCount: forensic.documentCount,
        policeReportPresent: forensic.policeReportPresent,
        semanticClassification: forensic.semanticClassification,
        vgeCalibration: forensic.vgeCalibration ? {
          statusCode: forensic.vgeCalibration.geometryEvidenceBlock?.calibrationStatusCode,
          sourceType: forensic.vgeCalibration.geometryEvidenceBlock?.sourceQualityAssessment?.sourceType,
        } : 'not present',
      }, null, 2));
    } catch (e) { console.log('Forensic parse error:', e); }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
