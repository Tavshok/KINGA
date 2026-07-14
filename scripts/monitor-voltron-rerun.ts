/**
 * Monitor VOLTRON re-run and extract before/after physics comparison
 * Before: assessment 13290001 (crush=0.10m, Campbell=8km/h, vision=10km/h, consensus=28km/h)
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const BEFORE = {
  assessmentId: 13290001,
  visionCrushDepthM: 0.10,
  campbellSpeedKmh: 8,
  visionDeformationSpeedKmh: 10,
  consensusSpeedKmh: 28,
  consensusMethod: 'DEPLOYMENT_THRESHOLD (floor override)',
  zone: 'LH Chassis Rail (front left) — zone filter NOT applied',
  dedup: 'FIRST occurrence (not MAX)',
};

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Poll for new assessment
  let attempts = 0;
  let newAssessmentId: number | null = null;
  
  while (attempts < 20) {
    const [rows] = await conn.execute(
      `SELECT id, created_at FROM ai_assessments WHERE claim_id = 8880001 ORDER BY id DESC LIMIT 3`
    ) as any[];
    
    const latest = rows[0];
    if (latest && latest.id !== 13290001) {
      newAssessmentId = latest.id;
      console.log(`New assessment created: id=${newAssessmentId}`);
      break;
    }
    
    // Also check claim status
    const [claim] = await conn.execute(
      `SELECT status, ai_assessment_completed, pipeline_current_stage FROM claims WHERE id = 8880001`
    ) as any[];
    console.log(`[${new Date().toISOString()}] Claim status: ${claim[0]?.status}, ai_done: ${claim[0]?.ai_assessment_completed}, stage: ${claim[0]?.pipeline_current_stage}`);
    
    attempts++;
    await new Promise(r => setTimeout(r, 15000)); // wait 15s between polls
  }
  
  if (!newAssessmentId) {
    console.log('Pipeline did not complete within 5 minutes — checking latest assessment anyway');
    const [rows] = await conn.execute(
      `SELECT id FROM ai_assessments WHERE claim_id = 8880001 ORDER BY id DESC LIMIT 1`
    ) as any[];
    newAssessmentId = rows[0]?.id;
  }
  
  if (!newAssessmentId) {
    console.log('No assessment found');
    await conn.end();
    return;
  }
  
  // Extract physics data from new assessment
  const [aRows] = await conn.execute(
    `SELECT physics_analysis FROM ai_assessments WHERE id = ?`,
    [newAssessmentId]
  ) as any[];
  
  if (!aRows.length || !aRows[0].physics_analysis) {
    console.log('No physics_analysis in new assessment');
    await conn.end();
    return;
  }
  
  const physics = JSON.parse(aRows[0].physics_analysis);
  const ensemble = physics.speedInferenceEnsemble;
  const methods = ensemble?.methods ?? [];
  
  // Find Campbell and vision deformation methods
  const campbell = methods.find((m: any) => m.method === 'M1_CAMPBELL' || m.name?.includes('Campbell'));
  const visionDef = methods.find((m: any) => m.method === 'M5_VISION_DEFORMATION' || m.name?.includes('Vision'));
  
  // Get crush depth plausibility check
  const plausibilityCheck = ensemble?.crushDepthPlausibilityCheck;
  
  // Get zone filter log from physics (if stored)
  const visionCrushDepth = physics.visionCrushDepthM ?? physics.crushDepthM;
  
  console.log('\n========== VOLTRON BEFORE/AFTER COMPARISON ==========\n');
  console.log('BEFORE (Assessment 13290001):');
  console.log(`  Vision crush depth:     ${BEFORE.visionCrushDepthM} m`);
  console.log(`  Campbell speed:         ${BEFORE.campbellSpeedKmh} km/h`);
  console.log(`  Vision deformation:     ${BEFORE.visionDeformationSpeedKmh} km/h`);
  console.log(`  Consensus speed:        ${BEFORE.consensusSpeedKmh} km/h (${BEFORE.consensusMethod})`);
  console.log(`  Zone filter:            ${BEFORE.zone}`);
  console.log(`  Dedup strategy:         ${BEFORE.dedup}`);
  
  console.log('\nAFTER (Assessment ' + newAssessmentId + '):');
  console.log(`  Vision crush depth:     ${visionCrushDepth ?? 'N/A'} m`);
  console.log(`  Campbell speed:         ${campbell?.speedKmh ?? campbell?.result ?? 'N/A'} km/h`);
  console.log(`  Vision deformation:     ${visionDef?.speedKmh ?? visionDef?.result ?? 'N/A'} km/h`);
  console.log(`  Consensus speed:        ${ensemble?.consensusSpeedKmh ?? 'N/A'} km/h`);
  console.log(`  Consensus method:       ${ensemble?.consensusMethod ?? ensemble?.overallConfidence ?? 'N/A'}`);
  console.log(`  Methods ran:            ${ensemble?.methodsRan ?? 'N/A'}`);
  console.log(`  High divergence:        ${ensemble?.highDivergence ?? false}`);
  
  if (plausibilityCheck) {
    console.log('\nCrush Depth Plausibility Check:');
    console.log(`  Triggered:              ${plausibilityCheck.triggered}`);
    console.log(`  Flag:                   ${plausibilityCheck.flag ?? 'none'}`);
    console.log(`  Message:                ${plausibilityCheck.message ?? 'none'}`);
    console.log(`  Campbell implausible:   ${plausibilityCheck.campbellImplausible ?? false}`);
    console.log(`  Vision implausible:     ${plausibilityCheck.visionImplausible ?? false}`);
  }
  
  // Save full comparison to file
  const comparison = {
    before: BEFORE,
    after: {
      assessmentId: newAssessmentId,
      visionCrushDepthM: visionCrushDepth,
      campbellSpeedKmh: campbell?.speedKmh ?? campbell?.result,
      visionDeformationSpeedKmh: visionDef?.speedKmh ?? visionDef?.result,
      consensusSpeedKmh: ensemble?.consensusSpeedKmh,
      consensusMethod: ensemble?.consensusMethod,
      methodsRan: ensemble?.methodsRan,
      highDivergence: ensemble?.highDivergence,
      plausibilityCheck,
    },
    rawEnsemble: ensemble,
  };
  
  const fs = await import('fs');
  fs.writeFileSync('/tmp/voltron-before-after.json', JSON.stringify(comparison, null, 2));
  console.log('\nFull comparison saved to /tmp/voltron-before-after.json');
  
  await conn.end();
}

main().catch(console.error);
