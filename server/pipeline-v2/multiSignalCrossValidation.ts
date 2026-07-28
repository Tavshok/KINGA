/**
 * multiSignalCrossValidation.ts
 * Multi-Signal Cross-Validation Layer
 *
 * PURPOSE
 * ───────
 * Aggregates all five signal types into a per-fact agreement/disagreement
 * structure. Each "fact" is a claim assertion (speed, direction, damage,
 * weather, etc.) that can be corroborated or contradicted by multiple
 * independent signals.
 *
 * SIGNALS
 * ───────
 * S1 — Quote-Photo Agreement (quotePhotoAgreementEngine)
 * S2 — Narrative Geometry / Direction Contradiction (directionContradictionFlag)
 * S3 — EXIF Vision Trust Tier (visionSourceReliabilityAdjusted)
 * S4 — Weather Cross-Check (weatherCrossCheckEngine — PENDING_DEPENDENCY)
 * S5 — Evidence Confidence Tiers (evidenceConfidenceTierEngine)
 * S6 — Physics Ensemble (speedInferenceEnsemble + damageClassification)
 *
 * OUTPUT
 * ──────
 * A structured list of "cross-validation findings" — one per fact under
 * examination — each with:
 *   - The fact being checked
 *   - Which signals agree / disagree
 *   - A verdict: CORROBORATED / CONTRADICTED / UNVERIFIABLE / PENDING
 *   - A plain-language explanation for the adjuster
 *   - A severity level: INFO / ADVISORY / CONCERN / FLAG
 */

import type { ClaimRecord } from './types';
import type { EvidenceConfidenceTierResult } from './evidenceConfidenceTierEngine';
import type { QuotePhotoAgreementResult } from './quotePhotoAgreementEngine';
import type { WeatherCrossCheckResult } from './weatherCrossCheckEngine';

export type CrossValidationVerdict =
  | 'CORROBORATED'    // Multiple independent signals agree
  | 'CONTRADICTED'    // At least one signal contradicts the claim assertion
  | 'UNVERIFIABLE'    // Insufficient data to verify
  | 'PENDING';        // Required data not yet available (e.g. weather API)

export type CrossValidationSeverity =
  | 'INFO'      // No concern — consistent with expectations
  | 'ADVISORY'  // Minor inconsistency — may have innocent explanation
  | 'CONCERN'   // Significant inconsistency — adjuster should investigate
  | 'FLAG';     // Material contradiction — specialist review recommended

export interface CrossValidationFinding {
  /** The fact being cross-validated */
  fact: string;
  /** Category for grouping in reports */
  category: 'SPEED' | 'DIRECTION' | 'DAMAGE' | 'WEATHER' | 'EVIDENCE' | 'COST';
  /** Verdict */
  verdict: CrossValidationVerdict;
  /** Severity */
  severity: CrossValidationSeverity;
  /** Signals that agree with the claim assertion */
  agreeingSignals: string[];
  /** Signals that contradict the claim assertion */
  contradictingSignals: string[];
  /** Signals that could not be evaluated */
  unavailableSignals: string[];
  /** Plain-language explanation for the adjuster */
  explanation: string;
  /** Recommended action (null if no action needed) */
  recommendedAction: string | null;
}

export interface MultiSignalCrossValidationResult {
  /** All cross-validation findings */
  findings: CrossValidationFinding[];

  /** Summary counts by verdict */
  verdictSummary: {
    corroborated: number;
    contradicted: number;
    unverifiable: number;
    pending: number;
  };

  /** Summary counts by severity */
  severitySummary: {
    info: number;
    advisory: number;
    concern: number;
    flag: number;
  };

  /** Overall cross-validation risk level */
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  /** Plain-language summary for the adjuster */
  summary: string;

  /** Whether any material contradictions were found */
  hasMaterialContradictions: boolean;

  /**
   * Three-way speed comparison: claimed vs consensus vs severity-implied.
   * Null if fewer than two of the three values are available.
   */
  threeWaySpeedComparison: {
    claimedSpeedKmh: number | null;
    consensusSpeedKmh: number | null;
    severityImpliedBand: string | null;       // e.g. 'MODERATE (25–45 km/h)'
    severityImpliedMidpointKmh: number | null;
    claimedVsConsensus: string | null;        // e.g. 'CONSISTENT' | 'DIVERGENT' | 'N/A'
    claimedVsSeverity: string | null;
    consensusVsSeverity: string | null;
    overallAgreement: 'ALL_AGREE' | 'TWO_AGREE' | 'ALL_DIVERGE' | 'INSUFFICIENT_DATA';
    note: string;
  } | null;

  /** Echoed signal inputs — persisted in cross_validation_json for downstream consumers */
  quotePhotoAgreement?: CrossValidationInput['quotePhotoAgreement'] | null;
  evidenceTiers?: CrossValidationInput['evidenceTiers'] | null;
  directionContradiction?: CrossValidationInput['directionContradiction'] | null;
  weatherCrossCheck?: CrossValidationInput['weatherCrossCheck'] | null;
}

export interface CrossValidationInput {
  claimRecord: ClaimRecord;

  /** From speedInferenceEnsemble */
  speedEnsemble: {
    consensusSpeedKmh: number | null;
    claimedSpeedDeviationFlag: {
      claimedSpeedKmh: number | null;
      deviationClass: string;
      deviationKmh: number | null;
      deviationPct: number | null;
      requiresVerification: boolean;
      interpretation: string;
    } | null;
  } | null;

  /** From damageClassificationEngine */
  damageClassification: {
    overallVerdict: 'CONSISTENT' | 'ANOMALOUS' | 'CONTRADICTORY';
    possibleCount: number;
    impossibleCount: number;
    unexplainedCount: number;
    summary: string;
  } | null;

  /** From directionContradictionFlag (stage-7-unified) */
  directionContradiction: {
    contradicts: boolean;
    narrativeDirection: string | null;
    physicsDirection: string | null;
    explanation: string;
    severity: string;
  } | null;

  /** From visionSourceReliabilityAdjusted (orchestrator S3) */
  visionTrustAdjusted: {
    adjusted: boolean;
    originalTier: string;
    adjustedTier: string | null;
    reason: string | null;
  } | null;

  /** From weatherCrossCheckEngine */
  weatherCrossCheck: WeatherCrossCheckResult | null;

  /** From evidenceConfidenceTierEngine */
  evidenceTiers: EvidenceConfidenceTierResult | null;

  /**
   * Stage 6 severity/structural rating — used to derive the severity-implied speed band
   * for the three-way speed comparison (claimed vs consensus vs severity-implied).
   * This is the same severity used as the crush depth check anchor.
   */
  damageSeverity: string | null;

  /**
   * From quotePhotoAgreementEngine — uses actual field names from QuotePhotoAgreementResult:
   * agreementScore (0-1), quotedNotVisible[], visibleNotQuoted[], structuralGapsInQuotes[], summary
   */
  quotePhotoAgreement: {
    agreementScore: number;
    quotedNotVisible: string[];
    visibleNotQuoted: string[];
    structuralGapsInQuotes: string[];
    quotesAnalysed: number;
    summary: string;
  } | null;
}

/**
 * Run the multi-signal cross-validation engine.
 */
export function runMultiSignalCrossValidation(
  input: CrossValidationInput
): MultiSignalCrossValidationResult {
  const findings: CrossValidationFinding[] = [];

  // ── FACT 1: Impact Speed ─────────────────────────────────────────────────
  if (input.speedEnsemble?.claimedSpeedDeviationFlag) {
    const dev = input.speedEnsemble.claimedSpeedDeviationFlag;
    if (dev.claimedSpeedKmh != null && dev.deviationClass !== 'no_claim') {
      const verdictMap: Record<string, CrossValidationVerdict> = {
        consistent: 'CORROBORATED',
        moderate: 'CORROBORATED',
        significant: 'CONTRADICTED',
        critical: 'CONTRADICTED',
        implausible: 'CONTRADICTED',
      };
      const severityMap: Record<string, CrossValidationSeverity> = {
        consistent: 'INFO',
        moderate: 'ADVISORY',
        significant: 'CONCERN',
        critical: 'FLAG',
        implausible: 'FLAG',
      };
      const verdict = verdictMap[dev.deviationClass] ?? 'UNVERIFIABLE';
      const severity = severityMap[dev.deviationClass] ?? 'ADVISORY';

      findings.push({
        fact: `Claimant-stated impact speed: ${dev.claimedSpeedKmh} km/h`,
        category: 'SPEED',
        verdict,
        severity,
        agreeingSignals: verdict === 'CORROBORATED' ? ['M7 Claimant Speed', 'Physics Ensemble (M1–M6)'] : [],
        contradictingSignals: verdict === 'CONTRADICTED' ? ['Physics Ensemble (M1–M6)'] : [],
        unavailableSignals: [],
        explanation: dev.interpretation,
        recommendedAction: dev.requiresVerification
          ? 'Verify stated speed against witness statements, CCTV footage, or road speed limit.'
          : null,
      });
    } else if (dev.claimedSpeedKmh == null) {
      findings.push({
        fact: 'Claimant-stated impact speed: not provided',
        category: 'SPEED',
        verdict: 'UNVERIFIABLE',
        severity: 'ADVISORY',
        agreeingSignals: [],
        contradictingSignals: [],
        unavailableSignals: ['M7 Claimant Speed'],
        explanation: 'No claimant-stated speed in claim documents. Physics-only speed estimate used.',
        recommendedAction: 'Request driver statement specifying impact speed.',
      });
    }
  }

  // ── FACT 2: Collision Direction ──────────────────────────────────────────
  if (input.directionContradiction) {
    const dc = input.directionContradiction;
    const verdict: CrossValidationVerdict = dc.contradicts ? 'CONTRADICTED' : 'CORROBORATED';
    const severity: CrossValidationSeverity = dc.contradicts
      ? (dc.severity === 'CRITICAL' ? 'FLAG' : 'CONCERN')
      : 'INFO';

    findings.push({
      fact: `Collision direction: ${input.claimRecord.accidentDetails?.collisionDirection ?? 'unknown'}`,
      category: 'DIRECTION',
      verdict,
      severity,
      agreeingSignals: !dc.contradicts ? ['Incident Narrative', 'Physics Classification'] : ['Physics Classification'],
      contradictingSignals: dc.contradicts ? ['Incident Narrative'] : [],
      unavailableSignals: [],
      explanation: dc.explanation,
      recommendedAction: dc.contradicts
        ? 'Clarify collision direction with claimant. Narrative implies a different direction than the physics classification.'
        : null,
    });
  }

  // ── FACT 3: Damage Consistency with Stated Incident ──────────────────────
  if (input.damageClassification) {
    const dc = input.damageClassification;
    const totalComponents = dc.possibleCount + dc.impossibleCount + dc.unexplainedCount;
    const unexplainedPct = totalComponents > 0
      ? Math.round((dc.unexplainedCount / totalComponents) * 100)
      : 0;

    const verdict: CrossValidationVerdict =
      dc.overallVerdict === 'CONSISTENT' ? 'CORROBORATED' :
      dc.overallVerdict === 'CONTRADICTORY' ? 'CONTRADICTED' : 'CONTRADICTED';

    const severity: CrossValidationSeverity =
      dc.overallVerdict === 'CONSISTENT' ? 'INFO' :
      dc.impossibleCount > 0 ? 'FLAG' :
      unexplainedPct > 50 ? 'CONCERN' : 'ADVISORY';

    findings.push({
      fact: `Damage pattern consistent with ${input.claimRecord.accidentDetails?.collisionDirection ?? 'stated'} impact at ${input.claimRecord.accidentDetails?.estimatedSpeedKmh ?? 'stated'} km/h`,
      category: 'DAMAGE',
      verdict,
      severity,
      agreeingSignals: dc.possibleCount > 0 ? [`${dc.possibleCount} component(s) consistent with stated impact`] : [],
      contradictingSignals: [
        ...(dc.impossibleCount > 0 ? [`${dc.impossibleCount} component(s) physically impossible for stated impact`] : []),
        ...(dc.unexplainedCount > 0 ? [`${dc.unexplainedCount} component(s) unexplained by stated impact`] : []),
      ],
      unavailableSignals: [],
      explanation: dc.summary,
      recommendedAction: dc.overallVerdict !== 'CONSISTENT'
        ? 'Investigate unexplained damage. Request repair history and prior damage declaration.'
        : null,
    });
  }

  // ── FACT 4: Quote vs Photo Damage Agreement ──────────────────────────────
  if (input.quotePhotoAgreement) {
    const qa = input.quotePhotoAgreement;
    // agreementScore: 0–1; 0.7+ = HIGH, 0.4–0.7 = MEDIUM, <0.4 = LOW
    const agreementLevel = qa.agreementScore >= 0.7 ? 'HIGH' : qa.agreementScore >= 0.4 ? 'MEDIUM' : 'LOW';

    const verdict: CrossValidationVerdict =
      agreementLevel === 'HIGH' ? 'CORROBORATED' :
      agreementLevel === 'MEDIUM' ? 'CORROBORATED' : 'CONTRADICTED';

    const severity: CrossValidationSeverity =
      agreementLevel === 'HIGH' ? 'INFO' :
      agreementLevel === 'MEDIUM' ? 'ADVISORY' :
      qa.structuralGapsInQuotes.length > 0 ? 'FLAG' : 'CONCERN';

    findings.push({
      fact: `Repair quote components vs photo-detected damage zones (agreement: ${Math.round(qa.agreementScore * 100)}%)`,
      category: 'COST',
      verdict,
      severity,
      agreeingSignals: qa.agreementScore > 0 ? [`${Math.round(qa.agreementScore * 100)}% component agreement across ${qa.quotesAnalysed} quote(s)`] : [],
      contradictingSignals: [
        ...(qa.quotedNotVisible.length > 0 ? [`${qa.quotedNotVisible.length} quoted component(s) not visible in photos: ${qa.quotedNotVisible.slice(0, 3).join(', ')}`] : []),
        ...(qa.structuralGapsInQuotes.length > 0 ? [`STRUCTURAL GAP: ${qa.structuralGapsInQuotes.join(', ')} visible in photos but absent from all quotes`] : []),
      ],
      unavailableSignals: [],
      explanation: qa.summary,
      recommendedAction: qa.quotedNotVisible.length > 0
        ? `${qa.quotedNotVisible.length} quoted component(s) not visible in damage photos. Request additional photos or assessor inspection.`
        : qa.structuralGapsInQuotes.length > 0
        ? `Structural damage visible in photos not included in any repair quote. Verify quote completeness.`
        : null,
    });
  }

  // ── FACT 5: Weather Conditions ───────────────────────────────────────────
  if (input.weatherCrossCheck) {
    const wc = input.weatherCrossCheck;
    if (wc.status === 'PENDING_DEPENDENCY') {
      findings.push({
        fact: `Stated weather conditions: ${input.claimRecord.accidentDetails?.weatherConditions ?? 'not stated'}`,
        category: 'WEATHER',
        verdict: 'PENDING',
        severity: 'INFO',
        agreeingSignals: [],
        contradictingSignals: [],
        unavailableSignals: ['Historical Weather API (Open-Meteo)'],
        explanation: wc.pendingDependencyNote ?? 'Weather cross-check pending external API.',
        recommendedAction: 'Enable WEATHER_API_ENABLED=true to activate weather cross-check.',
      });
    } else if (wc.conditionsContradiction?.contradicts) {
      findings.push({
        fact: `Stated weather conditions: ${input.claimRecord.accidentDetails?.weatherConditions ?? 'not stated'}`,
        category: 'WEATHER',
        verdict: 'CONTRADICTED',
        severity: wc.conditionsContradiction.severity === 'SIGNIFICANT' ? 'CONCERN' : 'ADVISORY',
        agreeingSignals: [],
        contradictingSignals: ['Historical Weather Records'],
        unavailableSignals: [],
        explanation: wc.conditionsContradiction.explanation,
        recommendedAction: 'Verify stated weather conditions against official meteorological records.',
      });
    } else if (wc.status === 'COMPLETED') {
      findings.push({
        fact: `Stated weather conditions: ${input.claimRecord.accidentDetails?.weatherConditions ?? 'not stated'}`,
        category: 'WEATHER',
        verdict: 'CORROBORATED',
        severity: 'INFO',
        agreeingSignals: ['Historical Weather Records'],
        contradictingSignals: [],
        unavailableSignals: [],
        explanation: 'Stated weather conditions are consistent with historical weather records for the incident location and time.',
        recommendedAction: null,
      });
    }
  }

  // ── FACT 6: Evidence Independence ────────────────────────────────────────
  if (input.evidenceTiers) {
    const et = input.evidenceTiers;
    const verdict: CrossValidationVerdict =
      et.independenceLevel === 'HIGH' ? 'CORROBORATED' :
      et.independenceLevel === 'MEDIUM' ? 'CORROBORATED' :
      et.independenceLevel === 'LOW' ? 'UNVERIFIABLE' : 'UNVERIFIABLE';

    const severity: CrossValidationSeverity =
      et.independenceLevel === 'HIGH' ? 'INFO' :
      et.independenceLevel === 'MEDIUM' ? 'INFO' :
      et.independenceLevel === 'LOW' ? 'ADVISORY' : 'CONCERN';

    findings.push({
      fact: 'Claim supported by independent evidence',
      category: 'EVIDENCE',
      verdict,
      severity,
      agreeingSignals: et.items.filter(i => i.present && (i.tier === 'TIER_1_INDEPENDENT' || i.tier === 'TIER_2_CORROBORATED')).map(i => i.description),
      contradictingSignals: [],
      unavailableSignals: et.evidenceGaps,
      explanation: et.independenceNote,
      recommendedAction: et.evidenceGaps.length > 0
        ? `Evidence gaps: ${et.evidenceGaps.slice(0, 2).join('; ')}${et.evidenceGaps.length > 2 ? ` (+${et.evidenceGaps.length - 2} more)` : ''}`
        : null,
    });
  }

  // ── FACT 7: Three-Way Speed Comparison ─────────────────────────────────────
  // Compare claimed speed, consensus speed, and severity-implied speed band.
  // This is an independent XV line item — not collapsed into M7's claimedSpeedDeviationFlag.
  const SEVERITY_SPEED_BANDS: Record<string, { label: string; min: number; max: number; midpoint: number }> = {
    minor:    { label: 'LOW (10–25 km/h)',      min: 10,  max: 25,  midpoint: 17 },
    moderate: { label: 'MODERATE (25–45 km/h)', min: 25,  max: 45,  midpoint: 35 },
    severe:   { label: 'HIGH (40–70 km/h)',     min: 40,  max: 70,  midpoint: 55 },
    critical: { label: 'SEVERE (55–90 km/h)',   min: 55,  max: 90,  midpoint: 72 },
  };

  const severityBandData = SEVERITY_SPEED_BANDS[(input.damageSeverity ?? '').toLowerCase()] ?? null;
  const claimedKmh = input.speedEnsemble?.claimedSpeedDeviationFlag?.claimedSpeedKmh ?? null;
  const consensusKmh = input.speedEnsemble?.consensusSpeedKmh ?? null;

  // Helper: check if a speed falls within a band (with 20% tolerance on each side)
  const inBand = (speed: number, band: { min: number; max: number }): boolean => {
    const tol = (band.max - band.min) * 0.20;
    return speed >= band.min - tol && speed <= band.max + tol;
  };
  // Helper: check if two speed values are within 20% of each other
  const speedsAgree = (a: number, b: number): boolean => {
    const avg = (a + b) / 2;
    return Math.abs(a - b) / avg <= 0.20;
  };

  let threeWaySpeedComparison: MultiSignalCrossValidationResult['threeWaySpeedComparison'] = null;

  const availablePoints = [claimedKmh, consensusKmh, severityBandData?.midpoint ?? null].filter(v => v != null).length;
  if (availablePoints >= 2) {
    const cvC = (claimedKmh != null && consensusKmh != null)
      ? (speedsAgree(claimedKmh, consensusKmh) ? 'CONSISTENT' : 'DIVERGENT')
      : 'N/A';
    const cvS = (claimedKmh != null && severityBandData != null)
      ? (inBand(claimedKmh, severityBandData) ? 'CONSISTENT' : 'DIVERGENT')
      : 'N/A';
    const coS = (consensusKmh != null && severityBandData != null)
      ? (inBand(consensusKmh, severityBandData) ? 'CONSISTENT' : 'DIVERGENT')
      : 'N/A';

    const agreementCount = [cvC, cvS, coS].filter(v => v === 'CONSISTENT').length;
    const divergeCount   = [cvC, cvS, coS].filter(v => v === 'DIVERGENT').length;
    const naCount        = [cvC, cvS, coS].filter(v => v === 'N/A').length;

    let overallAgreement: MultiSignalCrossValidationResult['threeWaySpeedComparison'] extends null ? never : NonNullable<MultiSignalCrossValidationResult['threeWaySpeedComparison']>['overallAgreement'];
    if (naCount >= 2) {
      overallAgreement = 'INSUFFICIENT_DATA';
    } else if (divergeCount === 0) {
      overallAgreement = 'ALL_AGREE';
    } else if (agreementCount >= 1 && divergeCount <= 1 && naCount <= 1) {
      overallAgreement = 'TWO_AGREE';
    } else {
      overallAgreement = 'ALL_DIVERGE';
    }

    const parts: string[] = [];
    if (claimedKmh != null) parts.push(`claimed=${claimedKmh} km/h`);
    if (consensusKmh != null) parts.push(`consensus=${consensusKmh} km/h`);
    if (severityBandData) parts.push(`severity-implied=${severityBandData.label}`);
    const note = `Three-way speed comparison: ${parts.join(', ')}. ` +
      `Claimed vs Consensus: ${cvC}. Claimed vs Severity-Implied: ${cvS}. Consensus vs Severity-Implied: ${coS}. ` +
      `Overall: ${overallAgreement}. ` +
      (overallAgreement === 'ALL_AGREE' ? 'All available speed signals agree — strong internal consistency.' :
       overallAgreement === 'TWO_AGREE' ? 'Two of three speed signals agree. Minor inconsistency warrants review.' :
       overallAgreement === 'ALL_DIVERGE' ? 'All three speed signals diverge — material inconsistency. Specialist review recommended.' :
       'Insufficient data for full three-way comparison.');

    threeWaySpeedComparison = {
      claimedSpeedKmh: claimedKmh,
      consensusSpeedKmh: consensusKmh,
      severityImpliedBand: severityBandData?.label ?? null,
      severityImpliedMidpointKmh: severityBandData?.midpoint ?? null,
      claimedVsConsensus: cvC,
      claimedVsSeverity: cvS,
      consensusVsSeverity: coS,
      overallAgreement,
      note,
    };

    // ── Asymmetric braking-aware finding logic ──────────────────────────────
    // Braking applies ONLY to claimed-speed comparisons (claimed vs consensus,
    // claimed vs severity-implied). It does NOT apply to consensus vs severity
    // (both are physics/evidence derived, braking is irrelevant).
    //
    // Asymmetric rules for claimed-speed comparisons:
    //   claimed < expected (shallow):  ADVISORY  — braking is a plausible explanation
    //   claimed > expected (excess):   CONCERN/FLAG — harder to explain innocently
    //   claimed << expected (extreme): FLAG — strong fraud signal
    //
    // Consensus vs severity is symmetric (same-source consistency check).

    // Determine if claimed speed is below or above the consensus/severity band
    const claimedBelowConsensus = claimedKmh != null && consensusKmh != null && claimedKmh < consensusKmh * 0.80;
    const claimedAboveConsensus = claimedKmh != null && consensusKmh != null && claimedKmh > consensusKmh * 1.20;
    const claimedBelowSeverity  = claimedKmh != null && severityBandData != null && claimedKmh < severityBandData.min * 0.80;
    const claimedAboveSeverity  = claimedKmh != null && severityBandData != null && claimedKmh > severityBandData.max * 1.20;

    // Determine severity for the finding
    let findingSeverity: CrossValidationSeverity;
    let findingVerdict: CrossValidationVerdict;
    let recommendedAction: string | null;

    if (overallAgreement === 'ALL_AGREE' || overallAgreement === 'INSUFFICIENT_DATA') {
      findingSeverity = overallAgreement === 'ALL_AGREE' ? 'INFO' : 'ADVISORY';
      findingVerdict = overallAgreement === 'ALL_AGREE' ? 'CORROBORATED' : 'UNVERIFIABLE';
      recommendedAction = null;
    } else if (claimedAboveConsensus || claimedAboveSeverity) {
      // Claimed speed exceeds physics/severity evidence — strong fraud signal
      // (claimant overstated speed relative to observed damage)
      findingSeverity = 'FLAG';
      findingVerdict = 'CONTRADICTED';
      recommendedAction = 'Claimed speed exceeds both physics-derived and severity-implied estimates. ' +
        'Claimant may have overstated impact speed. Obtain independent speed evidence (CCTV, witness, EDR).';
    } else if (claimedBelowConsensus || claimedBelowSeverity) {
      // Claimed speed is lower than physics/severity evidence.
      // Braking is a plausible explanation — downgrade to ADVISORY.
      // Note: this is the case where crush depth > expected for claimed speed.
      findingSeverity = 'ADVISORY';
      findingVerdict = 'CORROBORATED'; // Not a contradiction — braking explains the gap
      recommendedAction = 'Claimed speed is lower than physics-derived and/or severity-implied estimates. ' +
        'Pre-impact braking may explain the gap. Request driver statement on braking before impact.';
    } else if (coS === 'DIVERGENT') {
      // Consensus vs severity diverges (same-source consistency) — symmetric, no braking excuse
      findingSeverity = 'CONCERN';
      findingVerdict = 'CONTRADICTED';
      recommendedAction = 'Physics consensus speed and severity-implied speed disagree. ' +
        'This may indicate a measurement inconsistency in the crush depth or severity extraction. ' +
        'Review Stage 6 and Stage 7 outputs for this claim.';
    } else {
      findingSeverity = 'ADVISORY';
      findingVerdict = 'CORROBORATED';
      recommendedAction = 'Minor speed signal inconsistency. Review the diverging pair for data quality issues.';
    }

    findings.push({
      fact: `Three-way speed consistency: ${parts.join(' / ')}`,
      category: 'SPEED',
      verdict: findingVerdict,
      severity: findingSeverity,
      agreeingSignals: [cvC === 'CONSISTENT' ? 'Claimed vs Consensus' : '', cvS === 'CONSISTENT' ? 'Claimed vs Severity' : '', coS === 'CONSISTENT' ? 'Consensus vs Severity' : ''].filter(Boolean),
      contradictingSignals: [cvC === 'DIVERGENT' ? 'Claimed vs Consensus' : '', cvS === 'DIVERGENT' ? 'Claimed vs Severity' : '', coS === 'DIVERGENT' ? 'Consensus vs Severity' : ''].filter(Boolean),
      unavailableSignals: [claimedKmh == null ? 'Claimed Speed (M7)' : '', severityBandData == null ? 'Severity-Implied Speed' : ''].filter(Boolean),
      explanation: note,
      recommendedAction,
    });
  }

  // ── Compute summary ────────────────────────────────────────────────────────
  const verdictSummary = {
    corroborated: findings.filter(f => f.verdict === 'CORROBORATED').length,
    contradicted: findings.filter(f => f.verdict === 'CONTRADICTED').length,
    unverifiable: findings.filter(f => f.verdict === 'UNVERIFIABLE').length,
    pending: findings.filter(f => f.verdict === 'PENDING').length,
  };

  const severitySummary = {
    info: findings.filter(f => f.severity === 'INFO').length,
    advisory: findings.filter(f => f.severity === 'ADVISORY').length,
    concern: findings.filter(f => f.severity === 'CONCERN').length,
    flag: findings.filter(f => f.severity === 'FLAG').length,
  };

  const hasMaterialContradictions = severitySummary.flag > 0 || severitySummary.concern > 0;

  let overallRisk: MultiSignalCrossValidationResult['overallRisk'];
  if (severitySummary.flag > 0) {
    overallRisk = 'CRITICAL';
  } else if (severitySummary.concern > 0) {
    overallRisk = 'HIGH';
  } else if (severitySummary.advisory > 0 || verdictSummary.contradicted > 0) {
    overallRisk = 'MEDIUM';
  } else {
    overallRisk = 'LOW';
  }

  const summary = buildSummary(findings, verdictSummary, severitySummary, overallRisk);

  return {
    findings,
    verdictSummary,
    severitySummary,
    overallRisk,
    summary,
    hasMaterialContradictions,
    threeWaySpeedComparison,
    // Echo back signal inputs so they are persisted in cross_validation_json
    quotePhotoAgreement: input.quotePhotoAgreement ?? null,
    evidenceTiers: input.evidenceTiers ?? null,
    directionContradiction: input.directionContradiction ?? null,
    weatherCrossCheck: input.weatherCrossCheck ?? null,
  };
}

function buildSummary(
  findings: CrossValidationFinding[],
  verdictSummary: MultiSignalCrossValidationResult['verdictSummary'],
  severitySummary: MultiSignalCrossValidationResult['severitySummary'],
  overallRisk: MultiSignalCrossValidationResult['overallRisk']
): string {
  const total = findings.length;
  if (total === 0) return 'No cross-validation findings — insufficient data.';

  const parts: string[] = [];

  if (overallRisk === 'LOW') {
    parts.push(`Cross-validation: LOW RISK. ${verdictSummary.corroborated}/${total} facts corroborated by independent signals.`);
  } else if (overallRisk === 'MEDIUM') {
    parts.push(`Cross-validation: MEDIUM RISK. ${verdictSummary.contradicted} fact(s) show minor inconsistencies requiring review.`);
  } else if (overallRisk === 'HIGH') {
    parts.push(`Cross-validation: HIGH RISK. ${severitySummary.concern} significant inconsistency(ies) detected — adjuster investigation required.`);
  } else {
    parts.push(`Cross-validation: CRITICAL RISK. ${severitySummary.flag} material contradiction(s) detected — specialist review recommended.`);
  }

  const flagFindings = findings.filter(f => f.severity === 'FLAG');
  if (flagFindings.length > 0) {
    parts.push(`Material contradictions: ${flagFindings.map(f => f.fact).join('; ')}.`);
  }

  const concernFindings = findings.filter(f => f.severity === 'CONCERN');
  if (concernFindings.length > 0) {
    parts.push(`Significant concerns: ${concernFindings.map(f => f.fact).join('; ')}.`);
  }

  return parts.join(' ');
}
