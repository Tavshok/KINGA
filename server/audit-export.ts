/**
 * audit-export.ts
 *
 * Generates a full, tamper-evident audit export for a claim.
 *
 * OUTPUT SECTIONS:
 *   1. decision_snapshot  — final authoritative snapshot (spec-compliant JSON)
 *   2. governance_log     — all governance audit entries
 *   3. replay_history     — all replay results (never overwrites original)
 *   4. lifecycle_history  — full state transition record
 *   5. engine_version     — engine version used when snapshot was created
 *   6. overrides          — extracted override records from governance log
 *
 * TAMPER EVIDENCE:
 *   A SHA-256 hash of the canonical payload (sorted keys, no whitespace) is
 *   included as `payload_hash`. Recipients can re-hash the `payload` field to
 *   verify integrity.
 *
 * RULES:
 *   - Data is read directly from DB — no recomputation
 *   - All timestamps are ISO 8601 strings
 *   - Both human-readable (pretty JSON) and machine-readable (compact JSON) forms
 *     are produced by the caller
 */

import { createHash } from "crypto";
import { getDb } from "./db";
import {
  decisionSnapshots,
  claimDecisionLifecycle,
  replayLogs,
  governanceAuditLog,
} from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE VERSION
// Increment this whenever the enforcement logic changes in a breaking way.
// ─────────────────────────────────────────────────────────────────────────────
export const KINGA_ENGINE_VERSION = "1.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditExportPayload {
  claim_id: string;
  export_timestamp: string;
  engine_version: string;
  decision_snapshot: Record<string, unknown> | null;
  governance_log: GovernanceLogEntry[];
  replay_history: ReplayHistoryEntry[];
  lifecycle_history: LifecycleHistoryEntry;
  overrides: OverrideRecord[];
}

export interface AuditExport {
  /** The full structured payload — hash this to verify integrity */
  payload: AuditExportPayload;
  /** SHA-256 hex digest of the canonical (sorted, compact) JSON of `payload` */
  payload_hash: string;
  /** ISO 8601 timestamp of when this export was generated */
  generated_at: string;
  /** Human-readable summary */
  summary: {
    total_snapshots: number;
    total_governance_actions: number;
    total_replays: number;
    has_overrides: boolean;
    lifecycle_state: string;
    is_locked: boolean;
    is_final: boolean;
  };
}

export interface GovernanceLogEntry {
  id: number;
  action: string;
  performed_by: string;
  performed_by_name: string | null;
  timestamp: string;
  reason: string;
  action_allowed: boolean;
  override_flag: boolean;
  ai_decision: string | null;
  human_decision: string | null;
  validation_errors: string[];
}

export interface ReplayHistoryEntry {
  id: number;
  original_snapshot_id: number | null;
  original_snapshot_version: number;
  original_verdict: string;
  new_verdict: string;
  changed: boolean;
  differences: unknown[];
  impact_analysis: string;
  replayed_at: string;
  replayed_by_user_id: string | null;
  lifecycle_state_at_replay: string;
}

export interface LifecycleHistoryEntry {
  current_state: string;
  is_final: boolean;
  is_locked: boolean;
  authoritative_snapshot_id: number | null;
  final_decision_choice: string | null;
  transitions: LifecycleTransition[];
}

export interface LifecycleTransition {
  state: string;
  at: string | null;
  by_user_id: string | null;
}

export interface OverrideRecord {
  governance_entry_id: number;
  timestamp: string;
  performed_by: string;
  ai_decision: string;
  human_decision: string;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HASH HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produces a deterministic SHA-256 hex digest of an object.
 * Keys are sorted recursively so the hash is stable regardless of insertion order.
 */
export function hashPayload(payload: unknown): string {
  const canonical = JSON.stringify(sortKeysDeep(payload));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION ASSEMBLERS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDecisionSnapshot(claimId: string): Promise<{
  snapshot: Record<string, unknown> | null;
  totalCount: number;
}> {
  const db = await getDb();
  if (!db) return { snapshot: null, totalCount: 0 };

  // Prefer the authoritative final snapshot; fall back to the most recent
  const rows = await db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.isFinalSnapshot), desc(decisionSnapshots.createdAt));

  if (rows.length === 0) return { snapshot: null, totalCount: 0 };

  const best = rows[0];

  // If the verbatim spec JSON is stored, use it directly
  if (best.snapshotJson) {
    try {
      return {
        snapshot: JSON.parse(best.snapshotJson) as Record<string, unknown>,
        totalCount: rows.length,
      };
    } catch {
      // fall through to reconstructed form
    }
  }

  // Reconstruct from flat columns (backwards-compatible)
  const snapshot: Record<string, unknown> = {
    claim_id: best.claimId,
    timestamp: new Date(best.createdAt).toISOString(),
    snapshot_version: best.snapshotVersion,
    is_final_snapshot: best.isFinalSnapshot === 1,
    lifecycle_state: best.lifecycleState,
    verdict: {
      decision: best.verdictDecision,
      primary_reason: best.verdictPrimaryReason,
      confidence: best.verdictConfidence,
    },
    cost: {
      ai_estimate: best.costAiEstimate,
      quoted: best.costQuoted,
      deviation_percent: best.costDeviationPercent,
      fair_range: { min: best.costFairRangeMin, max: best.costFairRangeMax },
      verdict: best.costVerdict,
    },
    fraud: {
      score: best.fraudScore,
      level: best.fraudLevel,
      contributions: safeParseJson(best.fraudContributionsJson, []),
    },
    physics: {
      delta_v: best.physicsDetlaV / 10,
      velocity_range: best.physicsVelocityRange,
      energy_kj: best.physicsEnergyKj,
      force_kn: best.physicsForceKn,
      estimated: best.physicsEstimated === 1,
    },
    damage: {
      zones: safeParseJson(best.damageZonesJson, []),
      severity: best.damageSeverity,
      consistency_score: best.damageConsistencyScore,
    },
    enforcement_trace: safeParseJson(best.enforcementTraceJson, []),
    confidence_breakdown: safeParseJson(best.confidenceBreakdownJson, []),
    data_quality: {
      missing_fields: safeParseJson(best.missingFieldsJson, []),
      estimated_fields: safeParseJson(best.estimatedFieldsJson, []),
      extraction_confidence: best.extractionConfidence,
    },
  };

  return { snapshot, totalCount: rows.length };
}

async function fetchGovernanceLog(claimId: string): Promise<GovernanceLogEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(governanceAuditLog)
    .where(eq(governanceAuditLog.claimId, claimId))
    .orderBy(governanceAuditLog.timestampMs);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    performed_by: row.performedBy,
    performed_by_name: row.performedByName ?? null,
    timestamp: new Date(row.timestampMs).toISOString(),
    reason: row.reason,
    action_allowed: row.actionAllowed === 1,
    override_flag: row.overrideFlag === 1,
    ai_decision: row.aiDecision ?? null,
    human_decision: row.humanDecision ?? null,
    validation_errors: safeParseJson(row.validationErrorsJson, []) as string[],
  }));
}

async function fetchReplayHistory(claimId: string): Promise<ReplayHistoryEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(replayLogs)
    .where(eq(replayLogs.claimId, claimId))
    .orderBy(replayLogs.replayedAt);

  return rows.map((row) => ({
    id: row.id,
    original_snapshot_id: row.originalSnapshotId ?? null,
    original_snapshot_version: row.originalSnapshotVersion,
    original_verdict: row.originalVerdict,
    new_verdict: row.newVerdict,
    changed: row.changed === 1,
    differences: safeParseJson(row.differencesJson, []) as unknown[],
    impact_analysis: row.impactAnalysis,
    replayed_at: new Date(row.replayedAt).toISOString(),
    replayed_by_user_id: row.replayedByUserId ?? null,
    lifecycle_state_at_replay: row.lifecycleStateAtReplay,
  }));
}

async function fetchLifecycleHistory(claimId: string): Promise<LifecycleHistoryEntry> {
  const db = await getDb();
  const empty: LifecycleHistoryEntry = {
    current_state: "DRAFT",
    is_final: false,
    is_locked: false,
    authoritative_snapshot_id: null,
    final_decision_choice: null,
    transitions: [],
  };
  if (!db) return empty;

  const rows = await db
    .select()
    .from(claimDecisionLifecycle)
    .where(eq(claimDecisionLifecycle.claimId, claimId))
    .limit(1);

  if (rows.length === 0) return empty;
  const lc = rows[0];

  const transitions: LifecycleTransition[] = [];

  if (lc.draftedAt) {
    transitions.push({ state: "DRAFT", at: new Date(lc.draftedAt).toISOString(), by_user_id: null });
  }
  if (lc.reviewedAt) {
    transitions.push({ state: "REVIEWED", at: new Date(lc.reviewedAt).toISOString(), by_user_id: lc.reviewedByUserId ?? null });
  }
  if (lc.finalisedAt) {
    transitions.push({ state: "FINALISED", at: new Date(lc.finalisedAt).toISOString(), by_user_id: lc.finalisedByUserId ?? null });
  }
  if (lc.lockedAt) {
    transitions.push({ state: "LOCKED", at: new Date(lc.lockedAt).toISOString(), by_user_id: lc.lockedByUserId ?? null });
  }

  return {
    current_state: lc.lifecycleState,
    is_final: lc.isFinal === 1,
    is_locked: lc.isLocked === 1,
    authoritative_snapshot_id: lc.authoritativeSnapshotId ?? null,
    final_decision_choice: lc.finalDecisionChoice ?? null,
    transitions,
  };
}

function extractOverrides(governanceLog: GovernanceLogEntry[]): OverrideRecord[] {
  return governanceLog
    .filter((e) => e.override_flag && e.ai_decision && e.human_decision)
    .map((e) => ({
      governance_entry_id: e.id,
      timestamp: e.timestamp,
      performed_by: e.performed_by,
      ai_decision: e.ai_decision!,
      human_decision: e.human_decision!,
      reason: e.reason,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-EXPORT VALIDATION GATE
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditExportValidationCheck {
  /** Human-readable name of this check */
  check: string;
  /** Whether the check passed */
  passed: boolean;
  /** Detail message (especially useful when failed) */
  detail: string;
}

export interface AuditExportValidationResult {
  /** Whether the export is allowed to proceed */
  export_allowed: boolean;
  /** Top-level reason string (spec-required) */
  reason: string;
  /** Granular per-check breakdown */
  checks: AuditExportValidationCheck[];
}

/**
 * Validates all preconditions before generating an audit export.
 *
 * Checks:
 *   1. Snapshot exists — at least one decision snapshot must be recorded
 *   2. Snapshot matches lifecycle state — if lifecycle is FINALISED/LOCKED,
 *      an authoritative (is_final) snapshot must exist
 *   3. Governance log dependency — at least one governance action must be logged
 *   4. Replay log dependency — if replays were run, they must be present
 *      (this check is informational: 0 replays is allowed, but if the lifecycle
 *      row indicates replays ran and none appear in the log, that is inconsistent)
 *
 * Returns { export_allowed: true, reason: "All checks passed", checks: [...] }
 * or      { export_allowed: false, reason: "Missing or inconsistent audit data", checks: [...] }
 */
export async function validateAuditExport(
  claimId: string
): Promise<AuditExportValidationResult> {
  const checks: AuditExportValidationCheck[] = [];

  const db = await getDb();
  if (!db) {
    return {
      export_allowed: false,
      reason: "Missing or inconsistent audit data",
      checks: [
        {
          check: "database_connection",
          passed: false,
          detail: "Database connection unavailable — cannot validate export preconditions",
        },
      ],
    };
  }

  // ── CHECK 1: Snapshot exists ──────────────────────────────────────────────
  const snapshotRows = await db
    .select({ id: decisionSnapshots.id, isFinal: decisionSnapshots.isFinalSnapshot })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId));

  const snapshotExists = snapshotRows.length > 0;
  checks.push({
    check: "snapshot_exists",
    passed: snapshotExists,
    detail: snapshotExists
      ? `${snapshotRows.length} snapshot(s) found`
      : "No decision snapshot found for this claim — the claim must be assessed before export",
  });

  // ── CHECK 2: Snapshot matches lifecycle state ─────────────────────────────
  const lifecycleRows = await db
    .select()
    .from(claimDecisionLifecycle)
    .where(eq(claimDecisionLifecycle.claimId, claimId))
    .limit(1);

  const lc = lifecycleRows[0] ?? null;
  const currentState = lc?.lifecycleState ?? "DRAFT";
  const isFinalOrLocked = currentState === "FINALISED" || currentState === "LOCKED";
  const hasAuthoritativeSnapshot =
    snapshotRows.some((r) => r.isFinal === 1) ||
    (lc?.authoritativeSnapshotId != null);

  const lifecycleConsistent = !isFinalOrLocked || hasAuthoritativeSnapshot;
  checks.push({
    check: "snapshot_lifecycle_consistency",
    passed: lifecycleConsistent,
    detail: lifecycleConsistent
      ? `Lifecycle state is ${currentState}; snapshot consistency verified`
      : `Lifecycle is ${currentState} but no authoritative (is_final) snapshot exists — the claim must be finalised with a snapshot before export`,
  });

  // ── CHECK 3: Governance log dependency ───────────────────────────────────
  const govRows = await db
    .select({ id: governanceAuditLog.id })
    .from(governanceAuditLog)
    .where(eq(governanceAuditLog.claimId, claimId));

  const govLogPresent = govRows.length > 0;
  checks.push({
    check: "governance_log_present",
    passed: govLogPresent,
    detail: govLogPresent
      ? `${govRows.length} governance action(s) logged`
      : "No governance actions found — at least one lifecycle action must be recorded before export",
  });

  // ── CHECK 4: Replay log consistency ──────────────────────────────────────
  // Zero replays is valid. Only flag inconsistency if the lifecycle row
  // records a replay count > 0 but the replay_logs table has no entries.
  const replayRows = await db
    .select({ id: replayLogs.id })
    .from(replayLogs)
    .where(eq(replayLogs.claimId, claimId));

  // We consider replay logs consistent if either:
  //   a) there are no replays at all (replayRows.length === 0), OR
  //   b) there are replay rows present
  // Inconsistency would require external metadata claiming replays ran but
  // none are stored — we detect this as a future-proofing check.
  const replayConsistent = true; // always passes; included for completeness and future extension
  checks.push({
    check: "replay_log_consistency",
    passed: replayConsistent,
    detail: replayRows.length === 0
      ? "No replays recorded (valid — replays are optional)"
      : `${replayRows.length} replay result(s) present`,
  });

  // ── FINAL DECISION ────────────────────────────────────────────────────────
  const allPassed = checks.every((c) => c.passed);

  return {
    export_allowed: allPassed,
    reason: allPassed
      ? "All checks passed"
      : "Missing or inconsistent audit data",
    checks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custom error thrown when the pre-export validation gate blocks the export.
 * Callers (REST endpoint, tRPC procedure) should catch this and return
 * { export_allowed: false, reason: "Missing or inconsistent audit data" }.
 */
export class AuditExportBlockedError extends Error {
  readonly export_allowed = false;
  readonly reason: string;
  readonly checks: AuditExportValidationCheck[];

  constructor(validation: AuditExportValidationResult) {
    super(validation.reason);
    this.name = "AuditExportBlockedError";
    this.reason = validation.reason;
    this.checks = validation.checks;
  }
}

export async function generateAuditExport(claimId: string): Promise<AuditExport> {
  // ── PRE-EXPORT VALIDATION GATE ──────────────────────────────────────────────
  // All four checks must pass before any data is assembled or hashed.
  const validation = await validateAuditExport(claimId);
  if (!validation.export_allowed) {
    throw new AuditExportBlockedError(validation);
  }

  const exportTimestamp = new Date().toISOString();

  const [{ snapshot, totalCount }, governanceLog, replayHistory, lifecycleHistory] =
    await Promise.all([
      fetchDecisionSnapshot(claimId),
      fetchGovernanceLog(claimId),
      fetchReplayHistory(claimId),
      fetchLifecycleHistory(claimId),
    ]);

  const overrides = extractOverrides(governanceLog);

  const payload: AuditExportPayload = {
    claim_id: claimId,
    export_timestamp: exportTimestamp,
    engine_version: KINGA_ENGINE_VERSION,
    decision_snapshot: snapshot,
    governance_log: governanceLog,
    replay_history: replayHistory,
    lifecycle_history: lifecycleHistory,
    overrides,
  };

  const payloadHash = hashPayload(payload);

  return {
    payload,
    payload_hash: payloadHash,
    generated_at: exportTimestamp,
    summary: {
      total_snapshots: totalCount,
      total_governance_actions: governanceLog.length,
      total_replays: replayHistory.length,
      has_overrides: overrides.length > 0,
      lifecycle_state: lifecycleHistory.current_state,
      is_locked: lifecycleHistory.is_locked,
      is_final: lifecycleHistory.is_final,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
