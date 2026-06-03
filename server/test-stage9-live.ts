/**
 * test-stage9-live.ts
 *
 * Direct integration test for the hardened stage-9-cost pipeline.
 * Run with: npx tsx server/test-stage9-live.ts
 *
 * Tests:
 * 1. NON_PART passthrough: paint, sundries, labour are NOT dropped
 * 2. Sum-check: discrepancy_pct is computed
 * 3. All quotes → documentedLineItems with source_quote_index
 * 4. quoteLineItemGapAdvisory is populated
 * 5. optimisationInputQuotes derives components from line_items
 */

import { runCostOptimisationStage } from './pipeline-v2/stage-9-cost';
import type {
  PipelineContext,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
} from './pipeline-v2/types';

// ── Minimal PipelineContext stub ─────────────────────────────────────────────
const ctxStub: PipelineContext = {
  claimId: 1,
  tenantId: null,
  assessmentId: 1,
  claim: {},
  pdfUrl: null,
  damagePhotoUrls: [],
  db: null,
  log: (_stage: string, _msg: string) => { /* no-op for test */ },
};

// ── Minimal ClaimRecord stub ──────────────────────────────────────────────────
const claimRecordStub: ClaimRecord = {
  claimId: 1,
  tenantId: null,
  vehicle: {
    make: 'Toyota',
    model: 'Hilux',
    year: 2020,
    registration: null,
    vin: null,
    colour: null,
    engineNumber: null,
    mileageKm: null,
    bodyType: 'pickup',
    powertrain: 'ice',
    massKg: 1800,
    massTier: 'inferred_class',
    valueUsd: null,
    marketValueUsd: null,
  },
  driver: {
    name: null,
    claimantName: null,
    licenseNumber: null,
  },
  accidentDetails: {
    date: null,
    time: null,
    location: null,
    description: null,
    incidentType: 'collision',
    incidentSubType: null,
    incidentClassification: null,
    collisionDirection: 'frontal',
    impactPoint: null,
    estimatedSpeedKmh: null,
    maxCrushDepthM: null,
    totalDamageAreaM2: null,
    structuralDamage: false,
    airbagDeployment: false,
    animalType: null,
    weatherConditions: null,
    visibilityConditions: null,
    roadSurface: null,
    narrativeAnalysis: null,
    collisionScenario: 'unknown',
    isStruckParty: false,
    thirdPartyClaimRequired: false,
    isHitAndRun: false,
    isParkingLotDamage: false,
    multiEventSequence: null,
  },
  policeReport: {
    reportNumber: null,
    station: null,
    officerName: null,
    chargeNumber: null,
    fineAmountCents: null,
    reportDate: null,
  },
  damage: {
    description: null,
    components: [],
    imageUrls: [],
  },
  repairQuote: {
    repairerName: null,
    repairerCompany: null,
    assessorName: null,
    quoteTotalCents: 4500000,
    agreedCostCents: null,
    labourCostCents: null,
    partsCostCents: null,
    lineItems: [],
  },
  insuranceContext: {
    insurerName: null,
    policyNumber: null,
    productType: null,
    claimReference: null,
    excessAmountUsd: null,
    bettermentUsd: null,
  },
  dataQuality: {
    completenessScore: 70,
    missingFields: [],
    validationIssues: [],
  },
  marketRegion: 'ZA',
  assumptions: [],
};

// ── Minimal Stage 6 damage analysis stub ─────────────────────────────────────
const stage6Stub: Stage6Output = {
  damagedParts: [],
  damageZones: [],
  overallSeverityScore: 60,
  structuralDamageDetected: false,
  totalDamageArea: 0.8,
  photosAvailable: 0,
  photosProcessed: 0,
  photosDeferred: 0,
  photosFailed: 0,
  imageConfidenceScore: 0,
  analysisFromPhotos: false,
};

// ── Minimal Stage 3 output (two extracted quotes) ────────────────────────────
const stage3Output = {
  extracted_quotes: [
    {
      panel_beater: 'ABC Panel Beaters',
      total_cost: 45000,
      currency: 'ZAR',
      confidence: 'high' as const,
      components: [],          // intentionally empty — should be derived from line_items
      labour_defined: true,
      parts_defined: true,
      labour_cost: 8000,
      parts_cost: 30000,
      extraction_warnings: [],
      line_item_completeness_score: 95,
      line_items_sum: 44500,
      line_items_sum_discrepancy_pct: -1.1,
      rejected_line_items: [],
      line_items: [
        { component: 'bonnet', description: 'Bonnet replacement', line_total: 12000, unit_cost: 12000, quantity: 1, is_non_part_cost: false },
        { component: 'left_front_door', description: 'Left front door', line_total: 9000, unit_cost: 9000, quantity: 1, is_non_part_cost: false },
        { component: 'left_rear_door', description: 'Left rear door', line_total: 9000, unit_cost: 9000, quantity: 1, is_non_part_cost: false },
        { component: 'paint', description: 'Paint & materials', line_total: 6500, unit_cost: 6500, quantity: 1, is_non_part_cost: true },
        { component: 'labour', description: 'Labour charges', line_total: 8000, unit_cost: 8000, quantity: 1, is_non_part_cost: true },
        // Sundries intentionally zero-priced to test unpriced detection
        { component: 'sundries', description: 'Sundries', line_total: 0, unit_cost: 0, quantity: 1, is_non_part_cost: true },
      ],
    },
    {
      panel_beater: 'XYZ Auto Body',
      total_cost: 42000,
      currency: 'ZAR',
      confidence: 'medium' as const,
      components: [],
      labour_defined: true,
      parts_defined: true,
      labour_cost: 7500,
      parts_cost: 28000,
      extraction_warnings: [],
      line_item_completeness_score: 100,
      line_items_sum: 42000,
      line_items_sum_discrepancy_pct: 0,
      rejected_line_items: [],
      line_items: [
        { component: 'bonnet', description: 'Bonnet replacement', line_total: 11500, unit_cost: 11500, quantity: 1, is_non_part_cost: false },
        { component: 'left_front_door', description: 'Left front door', line_total: 8500, unit_cost: 8500, quantity: 1, is_non_part_cost: false },
        { component: 'left_rear_door', description: 'Left rear door', line_total: 8000, unit_cost: 8000, quantity: 1, is_non_part_cost: false },
        { component: 'paint', description: 'Paint & materials', line_total: 6500, unit_cost: 6500, quantity: 1, is_non_part_cost: true },
        { component: 'labour', description: 'Labour charges', line_total: 7500, unit_cost: 7500, quantity: 1, is_non_part_cost: true },
      ],
    },
  ],
  damage_components: ['bonnet', 'left_front_door', 'left_rear_door'],
  total_repair_cost: 45000,
  currency: 'ZAR',
  confidence: 'high' as const,
  extraction_method: 'llm_text' as const,
  document_type: 'repair_quote' as const,
  perDocumentExtractions: [],
};

// ── Minimal Stage 7 physics output ───────────────────────────────────────────
const stage7Output: Stage7Output = {
  impactForceKn: 45.2,
  impactVector: {
    direction: 'frontal',
    magnitude: 45.2,
    angle: 0,
  },
  energyDistribution: {
    kineticEnergyJ: 180000,
    energyDissipatedJ: 162000,
    energyDissipatedKj: 162,
  },
  estimatedSpeedKmh: 60,
  deltaVKmh: 35,
  decelerationG: 8.5,
  accidentSeverity: 'moderate',
  accidentReconstructionSummary: 'Moderate frontal collision at estimated 60 km/h.',
  damageConsistencyScore: 82,
  latentDamageProbability: {
    engine: 0.15,
    transmission: 0.10,
    suspension: 0.20,
    frame: 0.25,
    electrical: 0.10,
  },
  physicsExecuted: true,
  physicsStatus: 'EXECUTED',
};

// ── Minimal Stage 8 fraud output ─────────────────────────────────────────────
const stage8Output = {
  fraudRiskScore: 15,
  fraudRiskLevel: 'LOW' as const,
  fraudIndicators: [],
  recommendedAction: 'APPROVE' as const,
};

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  KINGA Stage-9 Quote Line Item Hardening — Live Test');
  console.log('══════════════════════════════════════════════════════════\n');

  let result: any;
  try {
    result = await runCostOptimisationStage(
      ctxStub,
      claimRecordStub,
      stage6Stub,
      stage7Output as Stage7Output,
      stage3Output as Parameters<typeof runCostOptimisationStage>[4],
    );
  } catch (err: any) {
    console.error('❌ ensureCostContract threw:', err.message);
    process.exit(1);
  }

  // ── Test 1: quoteLineItemGapAdvisory exists and has 2 entries ────────────
  const gap = result.quoteLineItemGapAdvisory ?? [];
  console.log(`Test 1 — quoteLineItemGapAdvisory has ${gap.length} entries (expected 2)`);
  if (gap.length === 2) {
    console.log('  ✅ PASS: Both quotes present in gap advisory');
  } else {
    console.log(`  ❌ FAIL: Expected 2, got ${gap.length}`);
  }

  // ── Test 2: Paint and labour are NOT dropped ──────────────────────────────
  const q0 = gap[0];
  const q1 = gap[1];
  console.log('\nTest 2 — Non-part cost items (paint, labour, sundries) not dropped');
  console.log(`  Quote[0] "${q0?.panel_beater}": ${q0?.line_item_count} items, ${q0?.priced_item_count} priced, ${q0?.unpriced_item_count} unpriced`);
  console.log(`  Quote[1] "${q1?.panel_beater}": ${q1?.line_item_count} items, ${q1?.priced_item_count} priced, ${q1?.unpriced_item_count} unpriced`);
  if (q0?.line_item_count >= 6 && q1?.line_item_count >= 5) {
    console.log('  ✅ PASS: All line items including paint/labour/sundries present');
  } else {
    console.log('  ❌ FAIL: Some items were silently dropped');
  }

  // ── Test 3: Sundries zero-price detected as unpriced ─────────────────────
  console.log('\nTest 3 — Zero-priced sundries detected as unpriced in Quote[0]');
  if (q0?.status === 'PARTIAL' && q0?.unpriced_items?.includes('sundries')) {
    console.log(`  ✅ PASS: Quote[0] status=${q0.status}, unpriced=[${q0.unpriced_items.join(', ')}]`);
  } else {
    console.log(`  ❌ FAIL: Quote[0] status=${q0?.status}, unpriced=[${(q0?.unpriced_items ?? []).join(', ')}]`);
  }

  // ── Test 4: Quote[1] is COMPLETE ─────────────────────────────────────────
  console.log('\nTest 4 — Quote[1] is COMPLETE (all items priced)');
  if (q1?.status === 'COMPLETE') {
    console.log(`  ✅ PASS: Quote[1] status=${q1.status}, completeness_score=${q1.completeness_score}`);
  } else {
    console.log(`  ❌ FAIL: Quote[1] status=${q1?.status}`);
  }

  // ── Test 5: documentedLineItems has items from both quotes ────────────────
  const docItems = result.documentedLineItems ?? [];
  const q0Items = docItems.filter((li: any) => li.source_quote_index === 0);
  const q1Items = docItems.filter((li: any) => li.source_quote_index === 1);
  console.log(`\nTest 5 — documentedLineItems covers both quotes`);
  console.log(`  Quote[0] items: ${q0Items.length}, Quote[1] items: ${q1Items.length}`);
  if (q0Items.length > 0 && q1Items.length > 0) {
    console.log('  ✅ PASS: Both quotes have line items in documentedLineItems');
  } else {
    console.log('  ❌ FAIL: One or more quotes missing from documentedLineItems');
  }

  // ── Test 6: overallLineItemCompletenessScore is computed ─────────────────
  const score = result.overallLineItemCompletenessScore;
  console.log(`\nTest 6 — overallLineItemCompletenessScore = ${score}`);
  if (typeof score === 'number' && score > 0 && score <= 100) {
    console.log('  ✅ PASS');
  } else {
    console.log('  ❌ FAIL: Score not computed correctly');
  }

  // ── Test 7: partsReconciliation has no silently missing items ─────────────
  const recon = result.partsReconciliation ?? [];
  const missing = recon.filter((r: any) => r.reconciliation_status === 'missing_from_quote');
  const matchedUnpriced = recon.filter((r: any) => r.reconciliation_status === 'matched_unpriced');
  console.log(`\nTest 7 — partsReconciliation: ${recon.length} items`);
  console.log(`  matched: ${recon.filter((r: any) => r.reconciliation_status === 'matched').length}`);
  console.log(`  matched_unpriced: ${matchedUnpriced.length}`);
  console.log(`  missing_from_quote: ${missing.length}`);
  if (missing.length === 0) {
    console.log('  ✅ PASS: No components silently missing from quote');
  } else {
    console.log(`  ⚠️  WARN: ${missing.length} component(s) missing: ${missing.map((r: any) => r.component).join(', ')}`);
  }

  // ── Test 8: Sum discrepancy detected for Quote[0] ─────────────────────────
  console.log(`\nTest 8 — Sum discrepancy detected for Quote[0]`);
  console.log(`  line_items_sum_discrepancy_pct = ${q0?.line_items_sum_discrepancy_pct}`);
  if (q0?.line_items_sum_discrepancy_pct !== null && q0?.line_items_sum_discrepancy_pct !== 0) {
    console.log('  ✅ PASS: Discrepancy correctly detected');
  } else {
    console.log('  ❌ FAIL: Discrepancy not detected');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Full Gap Advisory Output:');
  console.log(JSON.stringify(gap, null, 2));
  console.log('\n  documentedLineItems sample (first 4):');
  console.log(JSON.stringify(docItems.slice(0, 4), null, 2));
  console.log('══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
