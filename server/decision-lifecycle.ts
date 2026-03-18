/**
 * decision-lifecycle.ts
 *
 * State machine for the claim decision lifecycle.
 *
 * States:   DRAFT → REVIEWED → FINALISED → LOCKED
 * Rules:
 *   - DRAFT:      Initial state when first snapshot is created
 *   - REVIEWED:   Set when a user views/reviews the decision
 *   - FINALISED:  Set when user selects FINALISE_CLAIM | REVIEW_REQUIRED | ESCALATE_INVESTIGATION
 *                 A final authoritative snapshot is created at this point
 *   - LOCKED:     No further replays or recalculations allowed; snapshot is immutable legal record
 *
 * Every decision response MUST include:
 *   { lifecycle_state, is_final, is_locked }
 */

import { getDb } from "./db";
import { claimDecisionLifecycle, replayLogs, decisionSnapshots, type ReplayLog } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LifecycleState = "DRAFT" | "REVIEWED" | "FINALISED" | "LOCKED";

export type FinalDecisionChoice =
  | "FINALISE_CLAIM"
  | "REVIEW_REQUIRED"
  | "ESCALATE_INVESTIGATION";

export interface LifecycleStatus {
  lifecycle_state: LifecycleState;
  is_final: boolean;
  is_locked: boolean;
  authoritative_snapshot_id?: number | null;
  final_decision_choice?: string | null;
  drafted_at?: number | null;
  reviewed_at?: number | null;
  reviewed_by_user_id?: string | null;
  finalised_at?: number | null;
  finalised_by_user_id?: string | null;
  locked_at?: number | null;
  locked_by_user_id?: string | null;
}

export interface LifecycleTransitionResult {
  success: boolean;
  lifecycle_state: LifecycleState;
  is_final: boolean;
  is_locked: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALID TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  DRAFT: ["REVIEWED", "FINALISED"],   // Can skip REVIEWED if user acts directly
  REVIEWED: ["FINALISED"],
  FINALISED: ["LOCKED"],
  LOCKED: [],                          // Terminal state — no further transitions
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isReplayAllowed(state: LifecycleState): boolean {
  return state !== "LOCKED";
}

export function isRecalculationAllowed(state: LifecycleState): boolean {
  return state !== "LOCKED" && state !== "FINALISED";
}

// ─────────────────────────────────────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create the lifecycle record for a claim.
 * Returns the current lifecycle status.
 */
export async function getOrCreateLifecycle(
  claimId: string,
  tenantId: string,
): Promise<LifecycleStatus> {
  const db = await getDb();
  if (!db) throw new Error("[decision-lifecycle] Database not available");
  const rows = await db
    .select()
    .from(claimDecisionLifecycle)
    .where(eq(claimDecisionLifecycle.claimId, claimId))
    .limit(1);

  if (rows.length > 0) {
    const row = rows[0];
    return {
      lifecycle_state: row.lifecycleState as LifecycleState,
      is_final: row.isFinal === 1,
      is_locked: row.isLocked === 1,
      authoritative_snapshot_id: row.authoritativeSnapshotId,
      final_decision_choice: row.finalDecisionChoice,
      drafted_at: row.draftedAt,
      reviewed_at: row.reviewedAt,
      reviewed_by_user_id: row.reviewedByUserId,
      finalised_at: row.finalisedAt,
      finalised_by_user_id: row.finalisedByUserId,
      locked_at: row.lockedAt,
      locked_by_user_id: row.lockedByUserId,
    };
  }

  // Create initial DRAFT record
  const now = Date.now();
  const db2 = await getDb();
  if (!db2) throw new Error("[decision-lifecycle] Database not available");
  await db2.insert(claimDecisionLifecycle).values({
    claimId,
    tenantId,
    lifecycleState: "DRAFT",
    isFinal: 0,
    isLocked: 0,
    draftedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return {
    lifecycle_state: "DRAFT",
    is_final: false,
    is_locked: false,
    drafted_at: now,
  };
}

/**
 * Transition a claim's lifecycle state.
 * Enforces valid transition rules.
 */
export async function transitionLifecycle(
  claimId: string,
  tenantId: string,
  toState: LifecycleState,
  options: {
    userId?: string;
    finalDecisionChoice?: FinalDecisionChoice;
    authoritativeSnapshotId?: number;
  } = {},
): Promise<LifecycleTransitionResult> {
  const current = await getOrCreateLifecycle(claimId, tenantId);
  const fromState = current.lifecycle_state;

  // Guard: check valid transition
  if (!canTransition(fromState, toState)) {
    return {
      success: false,
      lifecycle_state: fromState,
      is_final: current.is_final,
      is_locked: current.is_locked,
      error: `Invalid transition: ${fromState} → ${toState}. Allowed from ${fromState}: [${VALID_TRANSITIONS[fromState].join(", ") || "none"}]`,
    };
  }

  const db = await getDb();
  if (!db) throw new Error("[decision-lifecycle] Database not available");
  const now = Date.now();
  const updates: Partial<typeof claimDecisionLifecycle.$inferInsert> = {
    lifecycleState: toState,
    updatedAt: now,
  };

  if (toState === "REVIEWED") {
    updates.reviewedAt = now;
    updates.reviewedByUserId = options.userId;
  }

  if (toState === "FINALISED") {
    updates.isFinal = 1;
    updates.finalisedAt = now;
    updates.finalisedByUserId = options.userId;
    updates.finalDecisionChoice = options.finalDecisionChoice;
    if (options.authoritativeSnapshotId) {
      updates.authoritativeSnapshotId = options.authoritativeSnapshotId;
    }
  }

  if (toState === "LOCKED") {
    updates.isLocked = 1;
    updates.lockedAt = now;
    updates.lockedByUserId = options.userId;
  }

  await db
    .update(claimDecisionLifecycle)
    .set(updates as typeof claimDecisionLifecycle.$inferInsert)
    .where(eq(claimDecisionLifecycle.claimId, claimId));

  return {
    success: true,
    lifecycle_state: toState,
    is_final: toState === "FINALISED" || toState === "LOCKED",
    is_locked: toState === "LOCKED",
  };
}

/**
 * Mark a snapshot as the authoritative final record.
 * Called when state transitions to FINALISED.
 */
export async function markAuthoritativeSnapshot(snapshotId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("[decision-lifecycle] Database not available");
  await db
    .update(decisionSnapshots)
    .set({
      lifecycleState: "FINALISED",
      isFinalSnapshot: 1,
    })
    .where(eq(decisionSnapshots.id, snapshotId));
}

/**
 * Save a replay result to the replay_logs table.
 * Replay results NEVER overwrite the original snapshot.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveReplayLog(params: {
  claimId: string;
  tenantId: string;
  originalSnapshotId?: number;
  originalSnapshotVersion: number;
  originalVerdict: string;
  newVerdict: string;
  changed: boolean;
  differences: Array<{ field: string; original: unknown; new: unknown }>;
  impactAnalysis: string;
  replayResult: object;
  replayedByUserId?: string;
  lifecycleStateAtReplay: LifecycleState;
}): Promise<number> {
  const now = Date.now();
  const db = await getDb();
  if (!db) throw new Error("[decision-lifecycle] Database not available");
  const [result] = await db.insert(replayLogs).values({
    claimId: params.claimId,
    tenantId: params.tenantId,
    originalSnapshotId: params.originalSnapshotId,
    originalSnapshotVersion: params.originalSnapshotVersion,
    originalVerdict: params.originalVerdict,
    newVerdict: params.newVerdict,
    changed: params.changed ? 1 : 0,
    differencesJson: JSON.stringify(params.differences),
    impactAnalysis: params.impactAnalysis,
    replayResultJson: JSON.stringify(params.replayResult),
    replayedAt: now,
    replayedByUserId: params.replayedByUserId,
    lifecycleStateAtReplay: params.lifecycleStateAtReplay,
  });
  return (result as { insertId: number }).insertId;
}

/**
 * Get replay logs for a claim (most recent first).
 */
export async function getReplayLogs(claimId: string) {
  const db = await getDb();
  if (!db) throw new Error("[decision-lifecycle] Database not available");
  const rows = await db
    .select()
    .from(replayLogs)
    .where(eq(replayLogs.claimId, claimId))
    .orderBy(replayLogs.replayedAt);

  return rows.map((row: ReplayLog) => ({
    id: row.id,
    claimId: row.claimId,
    originalSnapshotVersion: row.originalSnapshotVersion,
    originalVerdict: row.originalVerdict,
    newVerdict: row.newVerdict,
    changed: row.changed === 1,
    differences: JSON.parse(row.differencesJson || "[]"),
    impactAnalysis: row.impactAnalysis,
    replayedAt: row.replayedAt,
    replayedByUserId: row.replayedByUserId,
    lifecycleStateAtReplay: row.lifecycleStateAtReplay as LifecycleState,
  }));
}
