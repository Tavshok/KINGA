/**
 * Directly trigger VOLTRON pipeline re-run by calling triggerAiAssessment
 * This bypasses the status machine and calls the pipeline directly
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const CLAIM_ID = 8880001;

async function main() {
  console.log(`[${new Date().toISOString()}] Starting direct VOLTRON re-run for claim ${CLAIM_ID}`);
  
  // Reset claim state first
  const mysql = await import('mysql2/promise');
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Set to assessment_pending so triggerAiAssessment can run
  await conn.execute(
    `UPDATE claims SET 
      status = 'assessment_pending',
      ai_assessment_completed = 0,
      ai_assessment_triggered = 0,
      pipeline_current_stage = NULL
    WHERE id = ?`,
    [CLAIM_ID]
  );
  console.log(`Reset claim ${CLAIM_ID} to assessment_pending`);
  await conn.end();
  
  // Now call triggerAiAssessment directly
  const { triggerAiAssessment } = await import('../server/db');
  
  console.log(`[${new Date().toISOString()}] Calling triggerAiAssessment(${CLAIM_ID})...`);
  const result = await triggerAiAssessment(CLAIM_ID);
  
  console.log(`[${new Date().toISOString()}] Pipeline completed!`);
  console.log('Result summary:', JSON.stringify({
    status: (result as any)?.status,
    assessmentId: (result as any)?.assessmentId,
  }, null, 2));
  
  // Now extract physics comparison
  const mysql2 = await import('mysql2/promise');
  const conn2 = await mysql2.createConnection(process.env.DATABASE_URL!);
  
  const [assessments] = await conn2.execute(
    `SELECT id, physics_analysis, created_at FROM ai_assessments WHERE claim_id = ? ORDER BY id DESC LIMIT 2`,
    [CLAIM_ID]
  ) as any[];
  
  console.log(`\nAssessments for claim ${CLAIM_ID}:`);
  for (const a of assessments) {
    const physics = a.physics_analysis ? JSON.parse(a.physics_analysis) : null;
    const ensemble = physics?.speedInferenceEnsemble;
    const methods = ensemble?.methods ?? [];
    const campbell = methods.find((m: any) => m.method === 'M1_CAMPBELL' || m.name?.includes('Campbell'));
    const visionDef = methods.find((m: any) => m.method === 'M5_VISION_DEFORMATION' || m.name?.includes('Vision'));
    
    console.log(`\n  Assessment ${a.id} (${a.created_at}):`);
    console.log(`    visionCrushDepthM:     ${physics?.visionCrushDepthM ?? ensemble?.visionCrushDepthM ?? 'N/A'}`);
    console.log(`    Campbell speed:        ${campbell?.speedKmh ?? campbell?.result ?? 'N/A'} km/h`);
    console.log(`    Vision deformation:    ${visionDef?.speedKmh ?? visionDef?.result ?? 'N/A'} km/h`);
    console.log(`    Consensus speed:       ${ensemble?.consensusSpeedKmh ?? 'N/A'} km/h`);
    console.log(`    Consensus method:      ${ensemble?.consensusMethod ?? 'N/A'}`);
    console.log(`    Methods ran:           ${ensemble?.methodsRan ?? 'N/A'}`);
    console.log(`    High divergence:       ${ensemble?.highDivergence ?? false}`);
    
    const plausCheck = ensemble?.crushDepthPlausibilityCheck;
    if (plausCheck) {
      console.log(`    Plausibility check triggered: ${plausCheck.triggered}`);
      console.log(`    Plausibility flag: ${plausCheck.flag ?? 'none'}`);
      console.log(`    Plausibility message: ${plausCheck.message ?? 'none'}`);
    }
  }
  
  // Save full result
  const fs = await import('fs');
  const comparison = {
    before: {
      assessmentId: 13290001,
      visionCrushDepthM: 0.10,
      campbellSpeedKmh: 8,
      visionDeformationSpeedKmh: 10,
      consensusSpeedKmh: 28,
      consensusMethod: 'DEPLOYMENT_THRESHOLD floor override — Campbell/M5 implausibly low',
      zoneFilter: 'NONE — used LH Chassis Rail (front left) by coincidence, not by design',
      dedupStrategy: 'FIRST occurrence',
    },
    after: assessments.map((a: any) => {
      const physics = a.physics_analysis ? JSON.parse(a.physics_analysis) : null;
      const ensemble = physics?.speedInferenceEnsemble;
      const methods = ensemble?.methods ?? [];
      return {
        assessmentId: a.id,
        createdAt: a.created_at,
        visionCrushDepthM: physics?.visionCrushDepthM ?? ensemble?.visionCrushDepthM,
        ensemble: {
          consensusSpeedKmh: ensemble?.consensusSpeedKmh,
          consensusMethod: ensemble?.consensusMethod,
          methodsRan: ensemble?.methodsRan,
          highDivergence: ensemble?.highDivergence,
          crushDepthPlausibilityCheck: ensemble?.crushDepthPlausibilityCheck,
        },
        methods: methods.map((m: any) => ({
          method: m.method ?? m.name,
          speedKmh: m.speedKmh ?? m.result,
          confidence: m.confidence,
          disabled: m.disabled,
          reason: m.reason,
        })),
      };
    }),
  };
  
  fs.writeFileSync('/tmp/voltron-before-after.json', JSON.stringify(comparison, null, 2));
  console.log('\nFull comparison saved to /tmp/voltron-before-after.json');
  
  await conn2.end();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
