/**
 * ARCH-03b Affected Claims Audit
 *
 * Identifies claims where the pipeline computed a moderate fraud score (40–60)
 * but the missing 'moderate' key in fraudLevelMap caused the value to be written
 * as 'low' in the database.
 *
 * Also checks R-D-02 routing impact: whether the incorrect 'low' classification
 * caused claims to skip fraud review, auto-approve, or be treated more leniently.
 *
 * R-D-02 ESCALATE logic (from Batch 5):
 *   - fraudRiskLevel = 'high' OR 'elevated' → ESCALATE_INVESTIGATION
 *   - fraudRiskLevel = 'moderate' → REVIEW_REQUIRED (manual adjuster review)
 *   - fraudRiskLevel = 'low' → eligible for APPROVE or FINALISE_CLAIM
 *
 * The bug: claims with fraudScore 40–60 (should be 'moderate' → REVIEW_REQUIRED)
 * were written as 'low' → potentially auto-approved or finalised without review.
 */

import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(url);

console.log('=== ARCH-03b Affected Claims Audit ===\n');

// Step 1: Find all ai_assessments where fraud_risk_level = 'low' but fraud_score is 40–60
// These are the candidates that should have been 'moderate' but were silently downgraded.
// Note: fraudLevelMap was introduced with ARCH-03 (commit ddb42a90, ~2026-07-09).
// Before ARCH-03, the pipeline wrote 'medium' for scores 40–60.
// After ARCH-03, the pipeline writes 'moderate' which falls through to 'low'.
// So we look for: fraud_risk_level = 'low' AND fraud_score BETWEEN 40 AND 60
// created AFTER the ARCH-03 deployment.

const [affectedAssessments] = await conn.execute(`
  SELECT
    a.id AS assessment_id,
    a.claim_id,
    a.fraud_risk_level AS stored_level,
    a.fraud_score,
    a.recommendation,
    a.created_at,
    c.claim_number,
    c.status AS claim_status,
    c.fraud_risk_level AS claim_fraud_level
  FROM ai_assessments a
  JOIN claims c ON c.id = a.claim_id
  WHERE a.fraud_risk_level = 'low'
    AND a.fraud_score BETWEEN 40 AND 60
    AND a.fraud_score IS NOT NULL
  ORDER BY a.fraud_score DESC, a.created_at DESC
`);

console.log(`Claims with fraud_score 40–60 stored as 'low' (should be 'moderate'): ${affectedAssessments.length}`);

if (affectedAssessments.length > 0) {
  console.log('\nBreakdown by score range:');
  const bands = { '40-49': 0, '50-60': 0 };
  for (const r of affectedAssessments) {
    if (r.fraud_score >= 50) bands['50-60']++;
    else bands['40-49']++;
  }
  for (const [band, count] of Object.entries(bands)) {
    console.log(`  Score ${band}: ${count} claims`);
  }

  console.log('\nRouting impact (R-D-02):');
  const routingImpact = {
    auto_approved: 0,
    finalised: 0,
    reviewed_anyway: 0,
    still_active: 0,
    rejected: 0,
    other: 0,
  };
  const needsReview = [];

  for (const r of affectedAssessments) {
    const status = (r.claim_status || '').toLowerCase();
    const rec = (r.recommendation || '').toUpperCase();

    // Check if the recommendation was APPROVE/FINALISE (lenient) when it should have been REVIEW_REQUIRED
    const wasLenient = rec === 'APPROVE' || rec === 'FINALISE_CLAIM' || rec === 'PROCEED_TO_ASSESSMENT';
    const wasReviewed = rec === 'REVIEW_REQUIRED' || rec === 'ESCALATE_INVESTIGATION';

    if (status === 'completed' || status === 'approved' || status === 'finalised') {
      if (wasLenient) {
        routingImpact.auto_approved++;
        needsReview.push(r);
      } else {
        routingImpact.finalised++;
      }
    } else if (status === 'under_review' || status === 'review' || status === 'pending_review') {
      routingImpact.reviewed_anyway++;
    } else if (status === 'rejected') {
      routingImpact.rejected++;
    } else if (status === 'active' || status === 'pending' || status === 'processing' || status === 'submitted') {
      routingImpact.still_active++;
      if (wasLenient) needsReview.push(r);
    } else {
      routingImpact.other++;
    }
  }

  console.log(`  Completed/approved with lenient recommendation (APPROVE/FINALISE): ${routingImpact.auto_approved}`);
  console.log(`  Completed/finalised (recommendation was already REVIEW_REQUIRED): ${routingImpact.finalised}`);
  console.log(`  Currently under review (routing was correct despite wrong level): ${routingImpact.reviewed_anyway}`);
  console.log(`  Still active/pending (need re-flagging): ${routingImpact.still_active}`);
  console.log(`  Rejected: ${routingImpact.rejected}`);
  console.log(`  Other status: ${routingImpact.other}`);

  if (needsReview.length > 0) {
    console.log(`\n⚠️  Claims requiring manual re-flagging (${needsReview.length}):`);
    for (const r of needsReview.slice(0, 20)) {
      console.log(`  Claim ${r.claim_number} (ID ${r.claim_id}): score=${r.fraud_score}, stored='${r.stored_level}', recommendation='${r.recommendation}', status='${r.claim_status}'`);
    }
    if (needsReview.length > 20) {
      console.log(`  ... and ${needsReview.length - 20} more`);
    }
  } else {
    console.log('\n✓ No claims require immediate manual re-flagging.');
  }
}

// Step 2: Also check claims written as 'medium' (pre-ARCH-03) with score 40–60
const [mediumAssessments] = await conn.execute(`
  SELECT COUNT(*) as cnt, AVG(fraud_score) as avg_score
  FROM ai_assessments
  WHERE fraud_risk_level = 'medium'
    AND fraud_score BETWEEN 40 AND 60
`);
console.log(`\nPre-ARCH-03 'medium' rows with score 40–60: ${mediumAssessments[0].cnt} (avg score: ${Number(mediumAssessments[0].avg_score || 0).toFixed(1)})`);

// Step 3: Full distribution of fraud_risk_level vs fraud_score bands
console.log('\n=== Full fraud_risk_level vs fraud_score distribution ===');
const [dist] = await conn.execute(`
  SELECT
    fraud_risk_level,
    SUM(CASE WHEN fraud_score BETWEEN 0 AND 19 THEN 1 ELSE 0 END) as band_minimal,
    SUM(CASE WHEN fraud_score BETWEEN 20 AND 39 THEN 1 ELSE 0 END) as band_low,
    SUM(CASE WHEN fraud_score BETWEEN 40 AND 60 THEN 1 ELSE 0 END) as band_moderate,
    SUM(CASE WHEN fraud_score BETWEEN 61 AND 80 THEN 1 ELSE 0 END) as band_high,
    SUM(CASE WHEN fraud_score BETWEEN 81 AND 100 THEN 1 ELSE 0 END) as band_elevated,
    COUNT(*) as total
  FROM ai_assessments
  WHERE fraud_score IS NOT NULL
  GROUP BY fraud_risk_level
  ORDER BY fraud_risk_level
`);

console.log('stored_level     | 0-19 | 20-39 | 40-60 | 61-80 | 81-100 | total');
console.log('-----------------|------|-------|-------|-------|--------|------');
for (const r of dist) {
  const lvl = (r.fraud_risk_level || 'null').padEnd(16);
  console.log(`${lvl} | ${String(r.band_minimal).padStart(4)} | ${String(r.band_low).padStart(5)} | ${String(r.band_moderate).padStart(5)} | ${String(r.band_high).padStart(5)} | ${String(r.band_elevated).padStart(6)} | ${r.total}`);
}

await conn.end();
console.log('\nAudit complete.');
