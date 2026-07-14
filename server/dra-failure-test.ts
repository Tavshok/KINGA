/**
 * DRA Live Failure Path Test
 *
 * Creates a test claim with a corrupt/unreachable PDF URL, clears cached photos,
 * and runs triggerAiAssessment() to verify the DRA failure states are reached.
 *
 * Run with: npx tsx server/dra-failure-test.ts
 *
 * Expected outcome:
 *   - pdftoppm fails to render the corrupt PDF (unreachable URL)
 *   - Recovery ladder all fail (no cached photos, no embedded images, no text)
 *   - Document Health Gate fires BLOCK_ASSESSMENT (score < 40%)
 *   - Claim transitions to document_failed / DOCUMENT_FAILED
 *   - triggerAiAssessment returns { success: false }
 */

import { getDb, triggerAiAssessment } from './db';
import { claims, aiAssessments } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const TEST_CLAIM_ID = 9999901;

async function main() {
  const db = await getDb();
  if (!db) throw new Error('DB connection failed');

  console.log('\n=== DRA Live Failure Path Test ===\n');

  // Step 1: Clean up any previous test run
  console.log('Step 1: Cleaning up previous test claim...');
  await db.delete(aiAssessments).where(eq(aiAssessments.claimId, TEST_CLAIM_ID)).catch(() => {});
  await db.delete(claims).where(eq(claims.id, TEST_CLAIM_ID)).catch(() => {});

  // Step 2: Create a test claim with a corrupt PDF URL and no cached photos
  console.log('Step 2: Creating test claim with corrupt PDF URL and no cached photos...');
  await db.insert(claims).values({
    id: TEST_CLAIM_ID,
    tenantId: 1,
    claimNumber: 'DRA-FAILURE-TEST-001',
    status: 'intake_pending',
    documentProcessingStatus: 'DOCUMENT_VALIDATING',
    workflowState: 'intake_queue',
    aiAssessmentTriggered: 0,
    aiAssessmentCompleted: 0,
    vehicleMake: 'Test',
    vehicleModel: 'CorruptPDF',
    vehicleYear: 2020,
    // externalAssessmentUrl is the test/debug path: when no sourceDocumentId is set,
    // the pipeline reads this field as the PDF source. The URL points to a real S3 file
    // with a valid PDF header but corrupt/truncated body — pdftoppm will download it
    // but render 0 pages, exercising the recovery ladder and Document Health Gate.
    externalAssessmentUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/test/dra-corrupt-pdf-1784064364135.pdf',
    damagePhotos: JSON.stringify([]),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
  console.log(`  ✓ Test claim ${TEST_CLAIM_ID} created`);

  // Step 3: Run the pipeline
  console.log('\nStep 3: Running triggerAiAssessment() on corrupt PDF claim...');
  const startTime = Date.now();
  let result: any;
  try {
    result = await triggerAiAssessment(TEST_CLAIM_ID);
  } catch (err: any) {
    result = { success: false, error: err.message };
  }
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Pipeline returned in ${duration}s: ${JSON.stringify(result)}`);

  // Step 4: Read final DB state
  console.log('\nStep 4: Reading final DB state...');
  const finalClaim = await db.select({
    id: claims.id,
    status: claims.status,
    documentProcessingStatus: claims.documentProcessingStatus,
    workflowState: claims.workflowState,
    aiAssessmentCompleted: claims.aiAssessmentCompleted,
  }).from(claims).where(eq(claims.id, TEST_CLAIM_ID)).limit(1);

  const claim = finalClaim[0];
  console.log('\n=== RESULT ===');
  console.log(`  claim.status:                   ${claim?.status}`);
  console.log(`  claim.documentProcessingStatus: ${claim?.documentProcessingStatus}`);
  console.log(`  claim.workflowState:            ${claim?.workflowState}`);
  console.log(`  claim.aiAssessmentCompleted:    ${claim?.aiAssessmentCompleted}`);
  console.log(`  triggerAiAssessment result:     ${JSON.stringify(result)}`);

  // Step 5: Verify expected states
  console.log('\n=== VERIFICATION ===');
  const isFailureState = ['document_failed', 'human_review_required'].includes(claim?.status ?? '');
  const isDpsFailureState = ['DOCUMENT_FAILED', 'HUMAN_REVIEW_REQUIRED'].includes(claim?.documentProcessingStatus ?? '');
  const successFalse = result?.success === false;
  const notCompleted = claim?.aiAssessmentCompleted === 0;

  console.log(`  status in failure states: ${isFailureState ? `✅ PASS (${claim?.status})` : `❌ FAIL (got: ${claim?.status})`}`);
  console.log(`  dps in failure states:    ${isDpsFailureState ? `✅ PASS (${claim?.documentProcessingStatus})` : `❌ FAIL (got: ${claim?.documentProcessingStatus})`}`);
  console.log(`  result.success === false: ${successFalse ? '✅ PASS' : `❌ FAIL (got: ${result?.success})`}`);
  console.log(`  aiAssessmentCompleted=0:  ${notCompleted ? '✅ PASS' : `❌ FAIL (got: ${claim?.aiAssessmentCompleted})`}`);

  const allPass = isFailureState && isDpsFailureState && successFalse && notCompleted;
  console.log(`\n  Overall: ${allPass ? '✅ ALL PASS — DRA failure path is live-verified' : '❌ SOME CHECKS FAILED'}`);

  // Step 6: Clean up
  console.log('\nStep 6: Cleaning up test claim...');
  await db.delete(aiAssessments).where(eq(aiAssessments.claimId, TEST_CLAIM_ID)).catch(() => {});
  await db.delete(claims).where(eq(claims.id, TEST_CLAIM_ID)).catch(() => {});
  console.log('  ✓ Test claim cleaned up');

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
