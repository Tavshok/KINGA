/**
 * evidenceConfidenceTierEngine.ts
 * Signal 5: Third-Party Evidence Confidence Tier Tagging
 *
 * PURPOSE
 * ───────
 * Tags each piece of evidence in a claim with a confidence tier based on its
 * source type. This is used by the cross-validation layer to weight evidence
 * appropriately and by the fraud engine to flag claims where all evidence is
 * claimant-supplied with no independent corroboration.
 *
 * CONFIDENCE TIERS
 * ────────────────
 * TIER_1_INDEPENDENT  — Evidence from independent third parties (police, traffic
 *                       dept, other insurer, court records, CCTV operator)
 * TIER_2_CORROBORATED — Evidence from parties with partial independence (repair
 *                       assessor appointed by insurer, independent witness)
 * TIER_3_CLAIMANT     — Evidence supplied by or on behalf of the claimant
 *                       (claim form, claimant photos, claimant-appointed repairer)
 * TIER_4_INFERRED     — Evidence derived by the system (physics calculations,
 *                       LLM extraction, VGE measurements)
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * - Lower tier number = higher independence = higher weight in cross-validation
 * - A claim with ONLY Tier 3 evidence has no independent corroboration
 * - This is an ADVISORY signal — not a fraud flag by itself
 * - The tier system is used to weight evidence in the cross-validation layer
 */

import type { ClaimRecord } from './types';

export type EvidenceTier =
  | 'TIER_1_INDEPENDENT'
  | 'TIER_2_CORROBORATED'
  | 'TIER_3_CLAIMANT'
  | 'TIER_4_INFERRED';

export interface EvidenceItem {
  /** Human-readable description of the evidence */
  description: string;
  /** Evidence source type */
  sourceType:
    | 'POLICE_REPORT'
    | 'TRAFFIC_REPORT'
    | 'THIRD_PARTY_ACCOUNT'
    | 'WITNESS_STATEMENT'
    | 'CCTV_FOOTAGE'
    | 'INSURER_ASSESSOR_REPORT'
    | 'INDEPENDENT_ASSESSOR_REPORT'
    | 'CLAIM_FORM'
    | 'CLAIMANT_PHOTOS'
    | 'CLAIMANT_REPAIR_QUOTE'
    | 'CLAIMANT_STATED_SPEED'
    | 'CLAIMANT_NARRATIVE'
    | 'PHYSICS_CALCULATION'
    | 'LLM_EXTRACTION'
    | 'VGE_MEASUREMENT';
  /** Confidence tier */
  tier: EvidenceTier;
  /** Whether this evidence item is present in the claim */
  present: boolean;
  /** Specific value or reference (e.g. police report number, quote total) */
  value: string | null;
  /** Additional notes about this evidence item */
  notes: string | null;
}

export interface EvidenceConfidenceTierResult {
  /** All evidence items found in the claim */
  items: EvidenceItem[];

  /** Summary counts by tier */
  tierSummary: {
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    tier4Count: number;
    presentTier1Count: number;
    presentTier2Count: number;
    presentTier3Count: number;
    presentTier4Count: number;
  };

  /** Whether any independent (Tier 1 or 2) evidence is present */
  hasIndependentEvidence: boolean;

  /** Overall evidence independence level */
  independenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

  /** Advisory note for the adjuster */
  independenceNote: string;

  /** Specific gaps — evidence types that would strengthen the claim */
  evidenceGaps: string[];
}

// ── Tier assignment table ──────────────────────────────────────────────────────
const SOURCE_TIER_MAP: Record<EvidenceItem['sourceType'], EvidenceTier> = {
  POLICE_REPORT:              'TIER_1_INDEPENDENT',
  TRAFFIC_REPORT:             'TIER_1_INDEPENDENT',
  THIRD_PARTY_ACCOUNT:        'TIER_1_INDEPENDENT',  // third party has adverse interest to claimant
  WITNESS_STATEMENT:          'TIER_1_INDEPENDENT',
  CCTV_FOOTAGE:               'TIER_1_INDEPENDENT',
  INSURER_ASSESSOR_REPORT:    'TIER_2_CORROBORATED',
  INDEPENDENT_ASSESSOR_REPORT:'TIER_2_CORROBORATED',
  CLAIM_FORM:                 'TIER_3_CLAIMANT',
  CLAIMANT_PHOTOS:            'TIER_3_CLAIMANT',
  CLAIMANT_REPAIR_QUOTE:      'TIER_3_CLAIMANT',
  CLAIMANT_STATED_SPEED:      'TIER_3_CLAIMANT',
  CLAIMANT_NARRATIVE:         'TIER_3_CLAIMANT',
  PHYSICS_CALCULATION:        'TIER_4_INFERRED',
  LLM_EXTRACTION:             'TIER_4_INFERRED',
  VGE_MEASUREMENT:            'TIER_4_INFERRED',
};

/**
 * Run the evidence confidence tier engine on a claim record.
 */
export function runEvidenceConfidenceTierEngine(
  claimRecord: ClaimRecord
): EvidenceConfidenceTierResult {
  const items: EvidenceItem[] = [];

  // ── Tier 1: Independent evidence ──────────────────────────────────────────

  // Police report
  const hasPoliceReport = !!(
    claimRecord.policeReport?.reportNumber ||
    claimRecord.policeReport?.station ||
    claimRecord.policeReport?.officerName
  );
  items.push({
    description: 'Police / Traffic Report',
    sourceType: 'POLICE_REPORT',
    tier: 'TIER_1_INDEPENDENT',
    present: hasPoliceReport,
    value: claimRecord.policeReport?.reportNumber ?? null,
    notes: hasPoliceReport
      ? `Report number: ${claimRecord.policeReport?.reportNumber ?? 'not recorded'}, Station: ${claimRecord.policeReport?.station ?? 'not recorded'}`
      : 'No police report number or station recorded in claim documents.',
  });

  // Third-party account
  // AccidentDetails uses thirdPartyClaimRequired (not thirdPartyAccountSummary)
  const hasThirdPartyAccount = !!(
    (claimRecord.policeReport as any)?.thirdPartyAccountSummary ||
    claimRecord.accidentDetails?.thirdPartyClaimRequired
  );
  items.push({
    description: 'Third-Party Account of Events',
    sourceType: 'THIRD_PARTY_ACCOUNT',
    tier: 'TIER_1_INDEPENDENT',
    present: hasThirdPartyAccount,
    value: null,
    notes: hasThirdPartyAccount
      ? 'Third-party version of events present in claim documents.'
      : 'No third-party account of events in claim documents.',
  });

  // ── Tier 2: Corroborated evidence ─────────────────────────────────────────

  // Insurer-appointed assessor report (repair quotes from assessor)
  // ClaimRecord uses repairQuote (singular) not repairQuotes (plural)
  const repairQuotes: any[] = (claimRecord as any).repairQuotes ?? (claimRecord.repairQuote ? [claimRecord.repairQuote] : []);
  const hasAssessorReport = repairQuotes.some((q: any) => q.assessorName);
  items.push({
    description: 'Assessor / Loss Adjuster Report',
    sourceType: 'INSURER_ASSESSOR_REPORT',
    tier: 'TIER_2_CORROBORATED',
    present: hasAssessorReport,
    value: hasAssessorReport
      ? repairQuotes.find((q: any) => q.assessorName)?.assessorName ?? null
      : null,
    notes: hasAssessorReport
      ? `Assessor: ${repairQuotes.find((q: any) => q.assessorName)?.assessorName}`
      : 'No assessor name recorded on repair quotes.',
  });

  // ── Tier 3: Claimant-supplied evidence ────────────────────────────────────

  // Claim form / narrative
  // AccidentDetails uses description (not incidentDescription)
  const hasNarrative = !!(claimRecord.accidentDetails?.description);
  items.push({
    description: 'Claimant Incident Narrative (Claim Form)',
    sourceType: 'CLAIMANT_NARRATIVE',
    tier: 'TIER_3_CLAIMANT',
    present: hasNarrative,
    value: hasNarrative
      ? (claimRecord.accidentDetails.description?.substring(0, 80) + '...')
      : null,
    notes: null,
  });

  // Claimant photos
  const photoCount = claimRecord.damage?.imageUrls?.length ?? 0;
  items.push({
    description: 'Claimant-Submitted Damage Photos',
    sourceType: 'CLAIMANT_PHOTOS',
    tier: 'TIER_3_CLAIMANT',
    present: photoCount > 0,
    value: photoCount > 0 ? `${photoCount} photo(s)` : null,
    notes: photoCount > 0
      ? `${photoCount} damage photo(s) submitted. Note: photos may have been taken at the workshop, not the accident scene.`
      : 'No damage photos submitted.',
  });

  // Claimant repair quotes (repairQuotes is a runtime array, repairQuote is the typed field)
  const quoteCount = repairQuotes.length;
  const quoteTotalCents = repairQuotes.reduce(
    (sum: number, q: any) => sum + (q.quoteTotalCents ?? 0), 0
  );
  items.push({
    description: 'Repair Quote(s)',
    sourceType: 'CLAIMANT_REPAIR_QUOTE',
    tier: 'TIER_3_CLAIMANT',
    present: quoteCount > 0,
    value: quoteCount > 0
      ? `${quoteCount} quote(s), total: ${(quoteTotalCents / 100).toFixed(2)} ${(claimRecord as any).currency ?? 'USD'}`
      : null,
    notes: quoteCount > 0
      ? `${quoteCount} repair quote(s) from claimant-appointed repairer(s).`
      : 'No repair quotes submitted.',
  });

  // Claimant-stated speed
  const hasStatedSpeed = claimRecord.accidentDetails?.estimatedSpeedKmh != null;
  items.push({
    description: 'Claimant-Stated Impact Speed',
    sourceType: 'CLAIMANT_STATED_SPEED',
    tier: 'TIER_3_CLAIMANT',
    present: hasStatedSpeed,
    value: hasStatedSpeed ? `${claimRecord.accidentDetails.estimatedSpeedKmh} km/h` : null,
    notes: hasStatedSpeed
      ? `Driver stated impact speed: ${claimRecord.accidentDetails.estimatedSpeedKmh} km/h. Cross-checked by M7 in speed ensemble.`
      : 'No claimant-stated speed in claim documents.',
  });

  // ── Tier 4: System-inferred evidence ──────────────────────────────────────

  items.push({
    description: 'Physics Calculation (Speed Ensemble)',
    sourceType: 'PHYSICS_CALCULATION',
    tier: 'TIER_4_INFERRED',
    present: true, // always runs
    value: null,
    notes: 'Multi-method speed inference ensemble (M1–M7). Confidence depends on available inputs.',
  });

  items.push({
    description: 'Vision Geometry Engine (VGE) Measurement',
    sourceType: 'VGE_MEASUREMENT',
    tier: 'TIER_4_INFERRED',
    present: photoCount > 0,
    value: null,
    notes: photoCount > 0
      ? 'Pixel-to-mm crush depth calibration from damage photos.'
      : 'No photos available for VGE measurement.',
  });

  // ── Compute summary ────────────────────────────────────────────────────────
  const presentItems = items.filter(i => i.present);

  const tierSummary = {
    tier1Count: items.filter(i => i.tier === 'TIER_1_INDEPENDENT').length,
    tier2Count: items.filter(i => i.tier === 'TIER_2_CORROBORATED').length,
    tier3Count: items.filter(i => i.tier === 'TIER_3_CLAIMANT').length,
    tier4Count: items.filter(i => i.tier === 'TIER_4_INFERRED').length,
    presentTier1Count: presentItems.filter(i => i.tier === 'TIER_1_INDEPENDENT').length,
    presentTier2Count: presentItems.filter(i => i.tier === 'TIER_2_CORROBORATED').length,
    presentTier3Count: presentItems.filter(i => i.tier === 'TIER_3_CLAIMANT').length,
    presentTier4Count: presentItems.filter(i => i.tier === 'TIER_4_INFERRED').length,
  };

  const hasIndependentEvidence =
    tierSummary.presentTier1Count > 0 || tierSummary.presentTier2Count > 0;

  let independenceLevel: EvidenceConfidenceTierResult['independenceLevel'];
  if (tierSummary.presentTier1Count >= 2) {
    independenceLevel = 'HIGH';
  } else if (tierSummary.presentTier1Count === 1 || tierSummary.presentTier2Count >= 1) {
    independenceLevel = 'MEDIUM';
  } else if (tierSummary.presentTier3Count > 0) {
    independenceLevel = 'LOW';
  } else {
    independenceLevel = 'NONE';
  }

  const independenceNote: Record<EvidenceConfidenceTierResult['independenceLevel'], string> = {
    HIGH:   'Multiple independent evidence sources present (police report + third-party account or assessor). High confidence in claim facts.',
    MEDIUM: 'At least one independent evidence source present. Moderate confidence in claim facts.',
    LOW:    'All evidence is claimant-supplied. No independent corroboration. Adjuster should seek additional verification.',
    NONE:   'No evidence present. Claim cannot be assessed.',
  };

  // ── Identify evidence gaps ─────────────────────────────────────────────────
  const evidenceGaps: string[] = [];
  if (!hasPoliceReport) {
    evidenceGaps.push('Police/traffic report — obtain report number and station to verify incident was reported');
  }
  if (!hasThirdPartyAccount && claimRecord.accidentDetails?.collisionScenario !== 'single_vehicle') {
    evidenceGaps.push('Third-party account of events — request from third party or police report');
  }
  if (!hasAssessorReport) {
    evidenceGaps.push('Independent assessor report — appoint insurer assessor to verify damage');
  }
  if (!hasStatedSpeed && claimRecord.accidentDetails?.collisionScenario !== 'parking_lot') {
    evidenceGaps.push('Claimant-stated impact speed — request from driver statement');
  }

  return {
    items,
    tierSummary,
    hasIndependentEvidence,
    independenceLevel,
    independenceNote: independenceNote[independenceLevel],
    evidenceGaps,
  };
}
