/**
 * Generate AI Assessments for Missing Claims
 * 
 * Batch processes claims with damage photos that don't have AI assessments
 * 
 * Features:
 * - Batch processing (5 claims at a time)
 * - Error handling and logging
 * - Progress tracking
 * - Coverage calculation
 */

import { getDb } from '../server/db';
import { claims, aiAssessments } from '../drizzle/schema';
import { sql, notInArray, and, isNotNull, ne } from 'drizzle-orm';
import * as fs from 'fs';

// Import the AI assessment trigger function
import { triggerAiAssessment } from '../server/db';

const BATCH_SIZE = 5;
const LOG_FILE = '/home/ubuntu/AI_ASSESSMENT_GENERATION_LOG.md';

interface ProcessingResult {
  claimId: number;
  claimNumber: string;
  status: 'SUCCESS' | 'ERROR';
  error?: string;
  timestamp: string;
}

async function generateMissingAiAssessments() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AI ASSESSMENT BATCH GENERATION');
  console.log('  KINGA - AutoVerify AI');
  console.log('═══════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const db = getDb();
  const results: ProcessingResult[] = [];

  // ============================================================
  // STEP 1: Query missing assessments
  // ============================================================
  console.log('[STEP 1/4] Querying claims with damage photos missing AI assessments...\n');

  const missingAssessmentsQuery = await db.execute(sql`
    SELECT id, claim_number 
    FROM claims 
    WHERE damage_photos IS NOT NULL 
      AND damage_photos != '[]'
      AND id NOT IN (
        SELECT claim_id FROM ai_assessments
      )
    ORDER BY id
  `);

  const missingClaims = missingAssessmentsQuery.rows as Array<{ id: number; claim_number: string }>;
  const totalMissing = missingClaims.length;

  console.log(`✓ Found ${totalMissing} claims missing AI assessments\n`);

  if (totalMissing === 0) {
    console.log('No missing assessments. All claims with photos have AI assessments!\n');
    process.exit(0);
  }

  console.log('Claims to process:');
  missingClaims.forEach((claim, index) => {
    console.log(`  ${index + 1}. Claim #${claim.claim_number} (ID: ${claim.id})`);
  });
  console.log('');

  // ============================================================
  // STEP 2: Batch processing
  // ============================================================
  console.log(`[STEP 2/4] Processing ${totalMissing} claims in batches of ${BATCH_SIZE}...\n`);

  let successCount = 0;
  let errorCount = 0;

  // Process in batches
  for (let i = 0; i < missingClaims.length; i += BATCH_SIZE) {
    const batch = missingClaims.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(missingClaims.length / BATCH_SIZE);

    console.log(`\n--- Batch ${batchNumber}/${totalBatches} (${batch.length} claims) ---`);

    for (const claim of batch) {
      const claimIndex = i + batch.indexOf(claim) + 1;
      console.log(`\n[${claimIndex}/${totalMissing}] Processing Claim #${claim.claim_number} (ID: ${claim.id})...`);

      try {
        // Call the AI assessment trigger
        await triggerAiAssessment(claim.id);

        results.push({
          claimId: claim.id,
          claimNumber: claim.claim_number,
          status: 'SUCCESS',
          timestamp: new Date().toISOString()
        });

        successCount++;
        console.log(`   ✓ SUCCESS: AI assessment created for Claim #${claim.claim_number}`);

      } catch (error: any) {
        results.push({
          claimId: claim.id,
          claimNumber: claim.claim_number,
          status: 'ERROR',
          error: error.message || String(error),
          timestamp: new Date().toISOString()
        });

        errorCount++;
        console.error(`   ✗ ERROR: Failed to create AI assessment for Claim #${claim.claim_number}`);
        console.error(`   Error: ${error.message || error}`);
      }

      // Small delay between claims to prevent overload
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Delay between batches
    if (i + BATCH_SIZE < missingClaims.length) {
      console.log(`\n⏳ Waiting 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // ============================================================
  // STEP 3: Verify coverage
  // ============================================================
  console.log('\n\n[STEP 3/4] Verifying AI assessment coverage...\n');

  const coverageQuery = await db.execute(sql`
    SELECT 
      c.total_claims_with_photos,
      COALESCE(a.assessments_count, 0) as ai_assessments_created,
      ROUND(100.0 * COALESCE(a.assessments_count, 0) / c.total_claims_with_photos, 2) as coverage_percent
    FROM 
      (SELECT COUNT(*) as total_claims_with_photos 
       FROM claims 
       WHERE damage_photos IS NOT NULL AND damage_photos != '[]') c
    LEFT JOIN
      (SELECT COUNT(*) as assessments_count 
       FROM ai_assessments) a
    ON 1=1
  `);

  const coverageRow = coverageQuery.rows[0] as any;
  const totalWithPhotos = parseInt(coverageRow.total_claims_with_photos || '0');
  const totalAssessments = parseInt(coverageRow.ai_assessments_created || '0');
  const coveragePercent = parseFloat(coverageRow.coverage_percent || '0');

  console.log(`✓ Coverage Verification:`);
  console.log(`   Total claims with photos: ${totalWithPhotos}`);
  console.log(`   Total AI assessments: ${totalAssessments}`);
  console.log(`   Coverage rate: ${coveragePercent}%`);
  console.log(`   Target: ≥ 80%`);
  console.log(`   Status: ${coveragePercent >= 80 ? '✓ TARGET MET' : '⚠ BELOW TARGET'}\n`);

  // ============================================================
  // STEP 4: Generate report
  // ============================================================
  console.log('[STEP 4/4] Generating execution report...\n');

  const executionTime = Date.now() - startTime;

  // Generate detailed log
  const logContent = `# AI Assessment Batch Generation Log

**Execution Date:** ${new Date().toISOString()}  
**Total Claims Processed:** ${totalMissing}  
**Batch Size:** ${BATCH_SIZE}  
**Execution Time:** ${(executionTime / 1000).toFixed(2)}s

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Processed** | ${totalMissing} |
| **Successful** | ${successCount} |
| **Errors** | ${errorCount} |
| **Success Rate** | ${((successCount / totalMissing) * 100).toFixed(2)}% |

---

## Coverage Metrics

| Metric | Value |
|--------|-------|
| **Claims with Photos** | ${totalWithPhotos} |
| **AI Assessments Created** | ${totalAssessments} |
| **Coverage Rate** | ${coveragePercent}% |
| **Target** | ≥ 80% |
| **Status** | ${coveragePercent >= 80 ? '✅ TARGET MET' : '⚠️ BELOW TARGET'} |

---

## Detailed Results

${results.map((r, index) => `
### ${index + 1}. Claim #${r.claimNumber} (ID: ${r.claimId})

- **Status:** ${r.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}
- **Timestamp:** ${r.timestamp}
${r.error ? `- **Error:** ${r.error}` : ''}
`).join('\n')}

---

## Execution Summary

- **Start Time:** ${new Date(startTime).toISOString()}
- **End Time:** ${new Date().toISOString()}
- **Duration:** ${(executionTime / 1000).toFixed(2)} seconds
- **Average Time per Claim:** ${(executionTime / totalMissing / 1000).toFixed(2)} seconds

---

**END OF LOG**
`;

  fs.writeFileSync(LOG_FILE, logContent);
  console.log(`✓ Log saved to: ${LOG_FILE}\n`);

  // ============================================================
  // Final summary
  // ============================================================
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXECUTION SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total Claims Processed: ${totalMissing}`);
  console.log(`  ✓ Successful: ${successCount}`);
  console.log(`  ✗ Errors: ${errorCount}`);
  console.log(`  Success Rate: ${((successCount / totalMissing) * 100).toFixed(2)}%\n`);

  console.log(`Coverage Metrics:`);
  console.log(`  Claims with Photos: ${totalWithPhotos}`);
  console.log(`  AI Assessments: ${totalAssessments}`);
  console.log(`  Coverage Rate: ${coveragePercent}%`);
  console.log(`  Status: ${coveragePercent >= 80 ? '✓ TARGET MET' : '⚠ BELOW TARGET'}\n`);

  console.log(`Execution Time: ${(executionTime / 1000).toFixed(2)}s`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (coveragePercent >= 80) {
    console.log('🎉 SUCCESS: AI assessment coverage target met!\n');
    process.exit(0);
  } else {
    console.log('⚠️  WARNING: Coverage target not met. Review errors and retry.\n');
    process.exit(1);
  }
}

// Execute
generateMissingAiAssessments().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});
