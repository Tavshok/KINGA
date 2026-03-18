/**
 * decision-replay.ts
 *
 * KINGA Decision Replay Engine
 *
 * PURPOSE
 * -------
 * Re-runs the current enforcement logic against the data that was captured
 * in an original immutable Decision Snapshot, then produces a structured
 * field-by-field diff.
 *
 * This enables:
 *   - Logic drift detection  — did a rule change alter the verdict?
 *   - Improvement validation — did a bug fix change outcomes for the better?
 *   - Consistency auditing   — are two snapshots of the same claim consistent?
 *
 * CONTRACT
 * --------
 * The original snapshot is NEVER modified. The replay produces a new
 * ReplayResult object that stands alongside the original.
 *
 * OUTPUT SHAPE
 * ------------
 * {
 *   original_verdict: string,
 *   new_verdict:      string,
 *   changed:          boolean,
 *   differences: [
 *     { field: string, original: any, new: any }
 *   ],
 *   impact_analysis: string
 * }
 */

import {
  applyIntelligenceEnforcement,
  enforceFraudLevel,
  type EnforcementInput,
  type IntelligenceEnforcementResult,
} from './intelligence-enforcement';
import { buildSpecSnapshot, type SpecSnapshot, type DecisionSnapshotInput } from './db';

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayDifference {
  /** Dot-notation field path, e.g. "fraud_score" or "verdict_decision" */
  field: string;
  /** Value from the original immutable snapshot */
  original: unknown;
  /** Value produced by the current engine logic */
  new: unknown;
}

export interface ReplayResult {
  /** Verdict from the original immutable snapshot */
  original_verdict: string;
  /** Verdict produced by re-running the current engine logic */
  new_verdict: string;
  /** True if any tracked field changed between original and replay */
  changed: boolean;
  /** Ordered list of all field-level differences */
  differences: ReplayDifference[];
  /** Human-readable analysis of the drift and its operational impact */
  impact_analysis: string;
  /** ISO timestamp of when this replay was executed */
  replayed_at: string;
  /** Version of the original snapshot that was replayed */
  original_snapshot_version: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD COMPARATORS
// ─────────────────────────────────────────────────────────────────────────────

/** Fields tracked for drift detection, in priority order */
const TRACKED_FIELDS: Array<{
  key: keyof SpecSnapshot;
  label: string;
  compare?: (a: unknown, b: unknown) => boolean;
}> = [
  { key: 'verdict_decision',       label: 'Verdict Decision' },
  { key: 'verdict_confidence',     label: 'Verdict Confidence' },
  { key: 'verdict_color',          label: 'Verdict Color' },
  { key: 'fraud_score',            label: 'Fraud Score' },
  { key: 'fraud_level',            label: 'Fraud Level' },
  { key: 'fraud_level_label',      label: 'Fraud Level Label' },
  { key: 'cost_verdict',           label: 'Cost Verdict' },
  { key: 'cost_deviation_percent', label: 'Cost Deviation %' },
  { key: 'cost_ai_estimate_display', label: 'AI Cost Estimate ($)' },
  { key: 'cost_fair_range_min_display', label: 'Fair Range Min ($)' },
  { key: 'cost_fair_range_max_display', label: 'Fair Range Max ($)' },
  { key: 'consistency_score',      label: 'Damage Consistency Score' },
  { key: 'delta_v',                label: 'Delta-V (km/h)' },
  { key: 'velocity_range',         label: 'Velocity Range' },
  { key: 'physics_estimated',      label: 'Physics Estimated' },
  { key: 'damage_severity',        label: 'Damage Severity' },
  { key: 'extraction_confidence',  label: 'Extraction Confidence' },
  {
    key: 'enforcement_trace',
    label: 'Enforcement Trace (triggered rules)',
    compare: (a, b) => {
      // Compare only the triggered flags, not the full trace
      const aTriggered = (a as Array<{ triggered: boolean }>).filter(r => r.triggered).map(r => (r as any).rule).sort().join('|');
      const bTriggered = (b as Array<{ triggered: boolean }>).filter(r => r.triggered).map(r => (r as any).rule).sort().join('|');
      return aTriggered === bTriggered;
    },
  },
  {
    key: 'fraud_contributions',
    label: 'Fraud Contributions',
    compare: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  },
  {
    key: 'missing_fields',
    label: 'Missing Fields',
    compare: (a, b) => JSON.stringify((a as string[]).sort()) === JSON.stringify((b as string[]).sort()),
  },
];

function fieldsAreEqual(
  field: typeof TRACKED_FIELDS[number],
  original: unknown,
  replayed: unknown,
): boolean {
  if (field.compare) return field.compare(original, replayed);
  return original === replayed;
}

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOT → ENFORCEMENT INPUT RECONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconstructs an EnforcementInput from the data captured in a SpecSnapshot.
 *
 * The snapshot stores the derived outputs, not the raw inputs. We reconstruct
 * the inputs from the stored derived values so the engine can re-run.
 * Where the original raw value is not stored in the snapshot, we use the
 * snapshot's derived value as the input (idempotent reconstruction).
 */
export function reconstructEnforcementInput(
  snap: SpecSnapshot,
  /** Optional: live claim data to supplement snapshot fields */
  liveData?: {
    damageComponents?: string[];
    impactDirection?: string;
    vehicleMake?: string;
    vehicleMassKg?: number;
    hasPreviousClaims?: boolean;
    fraudScoreBreakdownJson?: Array<{ indicator: string; score: number }> | null;
  },
): EnforcementInput {
  // Parse velocity range to extract min/max for delta-V estimation
  const velocityRangeMatch = snap.velocity_range.match(/(\d+)[–\-](\d+)/);
  const velocityMin = velocityRangeMatch ? parseInt(velocityRangeMatch[1]) : 0;
  const velocityMax = velocityRangeMatch ? parseInt(velocityRangeMatch[2]) : 0;
  const estimatedSpeedKmh = velocityMin > 0 ? Math.round((velocityMin + velocityMax) / 2) : 0;

  return {
    fraudScore: snap.fraud_score,
    fraudRiskLevel: snap.fraud_level,
    estimatedSpeedKmh: snap.physics_estimated ? 0 : estimatedSpeedKmh,
    deltaVKmh: snap.delta_v,
    impactForceKn: snap.physics_estimated ? 0 : snap.force_kn,
    energyKj: snap.physics_estimated ? 0 : snap.energy_kj,
    vehicleMassKg: liveData?.vehicleMassKg ?? 1600,
    accidentSeverity: snap.damage_severity,
    consistencyScore: snap.consistency_score,
    impactDirection: liveData?.impactDirection ?? (snap.damage_zones[0] ?? 'front'),
    damageZones: snap.damage_zones,
    damageComponents: liveData?.damageComponents ?? snap.damage_zones,
    aiEstimatedCost: snap.cost_ai_estimate_display,
    quotedAmounts: snap.cost_quoted_display > 0 ? [snap.cost_quoted_display] : [],
    vehicleMake: liveData?.vehicleMake ?? 'Unknown',
    hasPreviousClaims: liveData?.hasPreviousClaims ?? false,
    fraudScoreBreakdownJson: liveData?.fraudScoreBreakdownJson ?? null,
    extractionConfidence: snap.extraction_confidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLAY → SPEC SNAPSHOT CONVERSION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts an IntelligenceEnforcementResult back into a SpecSnapshot shape
 * so it can be compared field-by-field with the original SpecSnapshot.
 */
export function enforcementResultToSpecSnapshot(
  result: IntelligenceEnforcementResult,
  originalSnap: SpecSnapshot,
): SpecSnapshot {
  const fd = result.finalDecision;
  const cv = result.costVerdict;
  const cb = result.confidenceBreakdown;
  const pe = result.physicsEstimate;
  const wf = result.fraudScoreBreakdown;

  // Build a DecisionSnapshotInput from the replay result so buildSpecSnapshot
  // can produce the canonical spec shape (with all labels, display values, etc.)
  const replayInput: DecisionSnapshotInput = {
    claimId: originalSnap.claim_id,
    tenantId: 'replay',
    createdByUserId: 'replay-engine',
    verdict: {
      decision: fd.decision,
      primaryReason: fd.primaryReason,
      confidence: cb.score,
    },
    cost: {
      aiEstimate: Math.round(cv.aiEstimatedCost * 100),
      quoted: Math.round(cv.quotedCost * 100),
      deviationPercent: cv.deviationPercent ?? 0,
      fairRangeMin: Math.round(cv.fairMin * 100),
      fairRangeMax: Math.round(cv.fairMax * 100),
      verdict: cv.verdict === 'NO_QUOTE' ? 'FAIR' : cv.verdict,
    },
    fraud: {
      score: wf.totalScore,
      level: wf.level,
      contributions: wf.components.map(c => ({ factor: c.factor, value: c.contribution })),
    },
    physics: {
      deltaV: pe?.deltaVKmh ?? originalSnap.delta_v,
      velocityRange: pe
        ? `${pe.velocityRangeKmh.min}–${pe.velocityRangeKmh.max} km/h`
        : originalSnap.velocity_range,
      energyKj: pe?.energyKj.min ?? originalSnap.energy_kj,
      forceKn: pe?.impactForceKn.min ?? originalSnap.force_kn,
      estimated: pe !== null,
    },
    damage: {
      zones: result.directionFlag.damageZones,
      severity: originalSnap.damage_severity,
      consistencyScore: result.consistencyFlag.score,
    },
    enforcementTrace: fd.ruleTrace.map(r => ({
      rule: r.rule,
      value: r.value,
      threshold: r.threshold,
      triggered: r.triggered,
    })),
    confidenceBreakdown: cb.penalties.map(p => ({
      factor: p.reason,
      penalty: p.deduction,
    })),
    dataQuality: {
      missingFields: originalSnap.missing_fields,
      estimatedFields: originalSnap.estimated_fields,
      extractionConfidence: originalSnap.extraction_confidence,
    },
  };

  return buildSpecSnapshot(replayInput, originalSnap.snapshot_version);
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPACT ANALYSIS GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function buildImpactAnalysis(
  original: SpecSnapshot,
  replayed: SpecSnapshot,
  differences: ReplayDifference[],
): string {
  if (differences.length === 0) {
    return `No drift detected. The current engine logic produces an identical decision to the original snapshot (v${original.snapshot_version}). ` +
      `Verdict: ${original.verdict_label} · Fraud: ${original.fraud_level_label} (${original.fraud_score}/100) · Cost: ${original.cost_verdict}.`;
  }

  const verdictChanged = original.verdict_decision !== replayed.verdict_decision;
  const fraudChanged = original.fraud_level !== replayed.fraud_level;
  const costChanged = original.cost_verdict !== replayed.cost_verdict;
  const confidenceChanged = original.verdict_confidence !== replayed.verdict_confidence;

  const parts: string[] = [];

  if (verdictChanged) {
    const direction = getDecisionSeverity(replayed.verdict_decision) > getDecisionSeverity(original.verdict_decision)
      ? 'escalated' : 'de-escalated';
    parts.push(
      `VERDICT DRIFT (${direction.toUpperCase()}): The decision changed from "${original.verdict_label}" to "${replayed.verdict_label}". ` +
      `This is a high-impact change — any claims processed under the original logic may need to be reviewed.`
    );
  }

  if (fraudChanged) {
    const direction = getFraudSeverity(replayed.fraud_level) > getFraudSeverity(original.fraud_level)
      ? 'increased' : 'decreased';
    parts.push(
      `FRAUD LEVEL DRIFT (${direction.toUpperCase()}): Fraud level changed from "${original.fraud_level_label}" (${original.fraud_score}/100) ` +
      `to "${replayed.fraud_level_label}" (${replayed.fraud_score}/100). ` +
      (direction === 'increased'
        ? 'Claims previously passed may now require escalation under the updated scoring logic.'
        : 'The updated logic is more permissive — verify that the change is intentional.')
    );
  }

  if (costChanged) {
    parts.push(
      `COST VERDICT DRIFT: Cost verdict changed from "${original.cost_verdict}" to "${replayed.cost_verdict}". ` +
      `Original deviation: ${original.cost_deviation_percent}% · Replayed deviation: ${replayed.cost_deviation_percent}%.`
    );
  }

  if (confidenceChanged && !verdictChanged) {
    const delta = replayed.verdict_confidence - original.verdict_confidence;
    parts.push(
      `CONFIDENCE DRIFT: Assessment confidence changed by ${delta > 0 ? '+' : ''}${delta} points ` +
      `(${original.verdict_confidence} → ${replayed.verdict_confidence}/100). ` +
      `This may reflect updated penalty rules in the confidence scoring engine.`
    );
  }

  // Non-verdict

  const nonVerdictDiffs = differences.filter(
    d => !['verdict_decision', 'verdict_color', 'verdict_confidence', 'fraud_level', 'fraud_level_label', 'fraud_score', 'cost_verdict'].includes(d.field)
  );
  if (nonVerdictDiffs.length > 0) {
    parts.push(
      `FIELD-LEVEL DRIFT (${nonVerdictDiffs.length} field${nonVerdictDiffs.length > 1 ? 's' : ''}): ` +
      nonVerdictDiffs.map(d => `${d.field}: ${JSON.stringify(d.original)} → ${JSON.stringify(d.new)}`).join('; ') + '.'
    );
  }

  parts.push(
    `Total fields changed: ${differences.length} of ${TRACKED_FIELDS.length} tracked. ` +
    `Original snapshot: v${original.snapshot_version} · Claim: ${original.claim_id}.`
  );

  return parts.join('\n\n');
}

function getDecisionSeverity(decision: string): number {
  if (decision === 'ESCALATE_INVESTIGATION') return 3;
  if (decision === 'REVIEW_REQUIRED') return 2;
  return 1; // FINALISE_CLAIM
}

function getFraudSeverity(level: string): number {
  const map: Record<string, number> = { minimal: 1, low: 2, moderate: 3, high: 4, elevated: 5, critical: 5 };
  return map[level] ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN REPLAY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-runs the current enforcement logic against the data captured in the
 * original snapshot and returns a structured diff.
 *
 * The original snapshot is NEVER modified.
 */
export function replayDecision(
  originalSnapshot: SpecSnapshot,
  liveData?: Parameters<typeof reconstructEnforcementInput>[1],
): ReplayResult {
  // 1. Reconstruct enforcement input from the original snapshot data
  const enforcementInput = reconstructEnforcementInput(originalSnapshot, liveData);

  // 2. Re-run the current engine logic
  const replayResult = applyIntelligenceEnforcement(enforcementInput);

  // 3. Convert replay result to spec snapshot shape for comparison
  const replayedSnapshot = enforcementResultToSpecSnapshot(replayResult, originalSnapshot);

  // 4. Field-by-field diff
  const differences: ReplayDifference[] = [];
  for (const field of TRACKED_FIELDS) {
    const original = originalSnapshot[field.key];
    const replayed = replayedSnapshot[field.key];
    if (!fieldsAreEqual(field, original, replayed)) {
      differences.push({
        field: String(field.key),
        original,
        new: replayed,
      });
    }
  }

  // 5. Build impact analysis
  const impact_analysis = buildImpactAnalysis(originalSnapshot, replayedSnapshot, differences);

  return {
    original_verdict: originalSnapshot.verdict_decision,
    new_verdict: replayedSnapshot.verdict_decision,
    changed: differences.length > 0,
    differences,
    impact_analysis,
    replayed_at: new Date().toISOString(),
    original_snapshot_version: originalSnapshot.snapshot_version,
  };
}
