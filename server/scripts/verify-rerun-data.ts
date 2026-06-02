import 'dotenv/config';
import { getDb } from '../db';
import { aiAssessments, claims } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB NULL'); process.exit(1); }

  // Get claim 6990001
  const claimRows = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    status: claims.status,
    aiAssessmentCompleted: claims.aiAssessmentCompleted,
  }).from(claims).where(eq(claims.id, 6990001)).limit(1);

  if (!claimRows.length) { console.log('Claim not found'); process.exit(0); }
  const claim = claimRows[0];
  console.log('CLAIM STATUS:', JSON.stringify(claim, null, 2));

  // Get the latest assessment
  const asmRows = await db.select({
    id: aiAssessments.id,
    claimId: aiAssessments.claimId,
    confidenceScore: aiAssessments.confidenceScore,
    fraudScore: aiAssessments.fraudScore,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
    recommendation: aiAssessments.recommendation,
    estimatedCost: aiAssessments.estimatedCost,
    createdAt: aiAssessments.createdAt,
    // Check which JSON columns have data
    hasFraudBreakdown: aiAssessments.fraudScoreBreakdownJson,
    hasPhysics: aiAssessments.physicsAnalysis,
    hasForensic: aiAssessments.forensicAnalysis,
    hasCostIntelligence: aiAssessments.costIntelligenceJson,
    hasPipelineSummary: aiAssessments.pipelineRunSummary,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, 6990001))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!asmRows.length) { console.log('No assessment found'); process.exit(0); }
  const asm = asmRows[0];

  console.log('\nASSESSMENT SUMMARY:');
  console.log('  ID:', asm.id);
  console.log('  Confidence Score:', asm.confidenceScore);
  console.log('  Fraud Score:', asm.fraudScore);
  console.log('  Fraud Risk Level:', asm.fraudRiskLevel);
  console.log('  Recommendation:', asm.recommendation);
  console.log('  Estimated Cost:', asm.estimatedCost);
  console.log('  Created:', asm.createdAt);
  console.log('\nDATA PRESENCE:');
  console.log('  Fraud Breakdown JSON:', asm.hasFraudBreakdown ? `${String(asm.hasFraudBreakdown).length} chars` : 'EMPTY');
  console.log('  Physics Analysis:', asm.hasPhysics ? `${String(asm.hasPhysics).length} chars` : 'EMPTY');
  console.log('  Forensic Analysis:', asm.hasForensic ? `${String(asm.hasForensic).length} chars` : 'EMPTY');
  console.log('  Cost Intelligence:', asm.hasCostIntelligence ? `${String(asm.hasCostIntelligence).length} chars` : 'EMPTY');
  console.log('  Pipeline Summary:', asm.hasPipelineSummary ? `${String(asm.hasPipelineSummary).length} chars` : 'EMPTY');

  // Parse pipeline summary to check stage statuses
  if (asm.hasPipelineSummary) {
    try {
      const summary = JSON.parse(String(asm.hasPipelineSummary));
      console.log('\nPIPELINE STAGE STATUSES:');
      if (Array.isArray(summary)) {
        summary.forEach((s: any) => {
          console.log(`  Stage ${s.stage}: ${s.status} (${s.duration}ms)${s.error ? ' ERROR: ' + s.error : ''}`);
        });
      } else {
        console.log('  Summary format:', typeof summary);
      }
    } catch(e) {
      console.log('  Could not parse pipeline summary');
    }
  }

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
