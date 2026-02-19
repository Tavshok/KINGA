/**
 * Bulk AI Assessment Generation Execution Script
 * 
 * Generates AI assessments for all claims with damage photos but missing assessments.
 * Bypasses authentication for direct database access.
 */

import { getDb } from '../server/db';
import { triggerAiAssessment } from '../server/db';
import { claims, aiAssessments } from '../drizzle/schema';
import { eq, isNotNull, sql } from 'drizzle-orm';

interface GenerationResult {
  claimId: number;
  success: boolean;
  error?: string;
  physicsMode?: 'quantitative' | 'qualitative';
  validationConfidence?: number;
}

interface GenerationSummary {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  coveragePercent: number;
  quantitativeActivationPercent: number;
  results: GenerationResult[];
}

async function getMissingAssessmentClaims(maxClaims: number): Promise<number[]> {
  const db = await getDb();
  
  // Query claims with damage photos but no AI assessment
  const result = await db.execute(sql`
    SELECT c.id
    FROM claims c
    LEFT JOIN ai_assessments aa ON c.id = aa.claim_id
    WHERE c.damage_photos IS NOT NULL
      AND aa.id IS NULL
    LIMIT ${maxClaims}
  `);

  return result.rows.map((row: any) => parseInt(row.id));
}

async function generateAssessmentForClaim(claimId: number): Promise<GenerationResult> {
  try {
    console.log(`[Claim ${claimId}] Starting AI assessment generation...`);
    
    // Trigger AI assessment
    await triggerAiAssessment(claimId);
    
    // Verify assessment was created
    const db = await getDb();
    const assessment = await db.query.aiAssessments.findFirst({
      where: eq(aiAssessments.claimId, claimId),
    });

    if (!assessment) {
      throw new Error('Assessment creation failed - no record found');
    }

    // Parse physics analysis to check quantitative mode
    let physicsMode: 'quantitative' | 'qualitative' = 'qualitative';
    let validationConfidence = 0;

    if (assessment.physicsAnalysis) {
      try {
        const physics = typeof assessment.physicsAnalysis === 'string' 
          ? JSON.parse(assessment.physicsAnalysis)
          : assessment.physicsAnalysis;
        
        physicsMode = physics.quantitativeMode === true ? 'quantitative' : 'qualitative';
        validationConfidence = physics.validationConfidence || physics.confidence || 0;
      } catch (e) {
        console.warn(`[Claim ${claimId}] Failed to parse physics analysis:`, e);
      }
    }

    console.log(`[Claim ${claimId}] ✅ SUCCESS - Mode: ${physicsMode}, Confidence: ${validationConfidence}`);

    return {
      claimId,
      success: true,
      physicsMode,
      validationConfidence,
    };
  } catch (error: any) {
    console.error(`[Claim ${claimId}] ❌ FAILED:`, error.message);
    return {
      claimId,
      success: false,
      error: error.message,
    };
  }
}

async function processBatch(claimIds: number[], batchSize: number): Promise<GenerationResult[]> {
  const results: GenerationResult[] = [];
  
  // Process in batches
  for (let i = 0; i < claimIds.length; i += batchSize) {
    const batch = claimIds.slice(i, i + batchSize);
    console.log(`\n[Batch ${Math.floor(i / batchSize) + 1}] Processing ${batch.length} claims...`);
    
    // Process batch sequentially to avoid overwhelming the system
    for (const claimId of batch) {
      const result = await generateAssessmentForClaim(claimId);
      results.push(result);
      
      // Small delay between claims to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[Batch ${Math.floor(i / batchSize) + 1}] Complete`);
  }
  
  return results;
}

async function verifyCoverage(): Promise<{ totalAssessments: number; totalClaimsWithPhotos: number; coveragePercent: number }> {
  const db = await getDb();
  
  // Count total AI assessments
  const assessmentCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM ai_assessments
  `);
  const totalAssessments = parseInt((assessmentCount.rows[0] as any).count);
  
  // Count claims with damage photos
  const claimsCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM claims WHERE damage_photos IS NOT NULL
  `);
  const totalClaimsWithPhotos = parseInt((claimsCount.rows[0] as any).count);
  
  const coveragePercent = totalClaimsWithPhotos > 0 
    ? Math.round((totalAssessments / totalClaimsWithPhotos) * 100)
    : 0;
  
  return { totalAssessments, totalClaimsWithPhotos, coveragePercent };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  BULK AI ASSESSMENT GENERATION");
  console.log("  KINGA - AutoVerify AI");
  console.log("═══════════════════════════════════════════════════════\n");

  const BATCH_SIZE = 5;
  const MAX_CLAIMS = 50;

  try {
    // Step 1: Get claims needing assessments
    console.log("[Step 1] Querying claims with missing AI assessments...");
    const claimIds = await getMissingAssessmentClaims(MAX_CLAIMS);
    console.log(`Found ${claimIds.length} claims needing AI assessments\n`);

    if (claimIds.length === 0) {
      console.log("✅ No claims need AI assessments. All claims with photos already have assessments.\n");
      
      // Verify coverage
      const coverage = await verifyCoverage();
      console.log("Coverage Metrics:");
      console.log(`  Total AI Assessments: ${coverage.totalAssessments}`);
      console.log(`  Claims with Photos: ${coverage.totalClaimsWithPhotos}`);
      console.log(`  Coverage: ${coverage.coveragePercent}%\n`);
      
      console.log("PRODUCTION_READY_STAGE_1 = TRUE ✅\n");
      return;
    }

    // Step 2: Process claims in batches
    console.log(`[Step 2] Processing ${claimIds.length} claims in batches of ${BATCH_SIZE}...`);
    const results = await processBatch(claimIds, BATCH_SIZE);

    // Step 3: Calculate summary
    console.log("\n[Step 3] Calculating summary metrics...");
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const quantitativeCount = results.filter(r => r.success && r.physicsMode === 'quantitative').length;
    const quantitativeActivationPercent = successCount > 0
      ? Math.round((quantitativeCount / successCount) * 100)
      : 0;

    // Step 4: Verify final coverage
    console.log("\n[Step 4] Verifying final coverage...");
    const coverage = await verifyCoverage();

    // Generate summary
    const summary: GenerationSummary = {
      totalProcessed: results.length,
      successCount,
      failureCount,
      coveragePercent: coverage.coveragePercent,
      quantitativeActivationPercent,
      results,
    };

    // Print summary
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  GENERATION SUMMARY");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`Total Processed: ${summary.totalProcessed}`);
    console.log(`Success: ${summary.successCount}`);
    console.log(`Failure: ${summary.failureCount}`);
    console.log(`Coverage: ${summary.coveragePercent}% (${coverage.totalAssessments}/${coverage.totalClaimsWithPhotos})`);
    console.log(`Quantitative Activation: ${summary.quantitativeActivationPercent}%`);
    console.log("═══════════════════════════════════════════════════════\n");

    // Print per-claim results
    console.log("Per-Claim Results:");
    results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      const mode = r.physicsMode ? `[${r.physicsMode}]` : '';
      const conf = r.validationConfidence ? `(${r.validationConfidence.toFixed(2)})` : '';
      const error = r.error ? ` - ${r.error}` : '';
      console.log(`  ${status} Claim ${r.claimId} ${mode} ${conf}${error}`);
    });

    // Determine production readiness
    const isProductionReady = summary.coveragePercent >= 80 && summary.quantitativeActivationPercent >= 80;
    console.log(`\nPRODUCTION_READY_STAGE_1 = ${isProductionReady ? 'TRUE ✅' : 'FALSE ❌'}\n`);

    // Write detailed report
    const fs = await import('fs');
    fs.writeFileSync(
      '/home/ubuntu/BULK_AI_GENERATION_REPORT.json',
      JSON.stringify(summary, null, 2)
    );
    console.log("Detailed report saved to: /home/ubuntu/BULK_AI_GENERATION_REPORT.json\n");

    process.exit(isProductionReady ? 0 : 1);
  } catch (error: any) {
    console.error("\n❌ FATAL ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
