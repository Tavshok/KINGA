/**
 * decision-governance.ts
 *
 * Governance layer for all human actions on claim decisions.
 *
 * RULES ENFORCED:
 *   Rule 1 — Mandatory justification (min 10 chars) for REVIEWED, FINALISED, LOCKED, OVERRIDE
 *   Rule 2 — Override tracking: if human decision ≠ AI decision, record override object
 *   Rule 3 — Lock protection: claim must be FINALISED + final snapshot exists + reason provided
 *   Rule 4 — Bulk action safety: each claim must individually pass validation
 *   Rule 5 — Audit trail: every action appends to governance_audit_log
 *   Rule 6 — UI enforcement: enforced server-side; UI reads validation_errors to block/display
 *
 * Every lifecycle response includes:
 *   { action_allowed: boolean, validation_errors: string[], override_flag: boolean }
 */

import { getDb } from "./db";
import {
  governanceAuditLog,
  claimDecisionLifecycle,
  decisionSnapshots,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { LifecycleState } from "./decision-lifecycle";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type GovernedAction =
  | "REVIEWED"
  | "FINALISED"
  | "LOCKED"
  | "OVERRIDE"
  | "REPLAY"
  | "SNAPSHOT_SAVED";

export interface GovernanceInput {
  claimId: string;
  tenantId: string;
  action: GovernedAction;
  performedBy: string;
  performedByName?: string;
  reason: string;
  /** The AI-generated decision verdict (for override detection) */
  aiDecision?: string;
  /** The human-chosen decision (for override detection) */
  humanDecision?: string;
  /** Extra metadata to store alongside the audit entry */
  metadata?: Record<string, unknown>;
}

export interface GovernanceResult {
  action_allowed: boolean;
  validation_errors: string[];
  override_flag: boolean;
  override?: {
    override: true;
    ai_decision: string;
    human_decision: string;
    reason: string;
  };
  audit_entry_id?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MIN_REASON_LENGTH = 10;

const ACTIONS_REQUIRING_REASON: GovernedAction[] = [
  "REVIEWED",
  "FINALISED",
  "LOCKED",
  "OVERRIDE",
];

// ─────────────────────────────────────────────────────────────────────────────
// RULE 1 — MANDATORY JUSTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export function validateReason(action: GovernedAction, reason: string): string[] {
  const errors: string[] = [];
  if (ACTIONS_REQUIRING_REASON.includes(action)) {
    if (!reason || reason.trim().length === 0) {
      errors.push(`A written reason is required for the ${action} action.`);
    } else if (reason.trim().length < MIN_REASON_LENGTH) {
      errors.push(
        `Reason must be at least ${MIN_REASON_LENGTH} characters (currently ${reason.trim().length}).`
      );
    }
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 2 — OVERRIDE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectOverride(
  aiDecision: string | undefined,
  humanDecision: string | undefined
): boolean {
  if (!aiDecision || !humanDecision) return false;
  // Normalise for comparison (trim + uppercase)
  return aiDecision.trim().toUpperCase() !== humanDecision.trim().toUpperCase();
}

export function buildOverrideRecord(
  aiDecision: string,
  humanDecision: string,
  reason: string
) {
  return {
    override: true as const,
    ai_decision: aiDecision,
    human_decision: humanDecision,
    reason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 3 — LOCK PROTECTION
// ─────────────────────────────────────────────────────────────────────────────

export async function validateLockConditions(
  claimId: string
): Promise<string[]> {
  const errors: string[] = [];
  const db = await getDb();
  if (!db) {
    errors.push("Database unavailable — cannot verify lock conditions.");
    return errors;
  }

  // Check lifecycle is FINALISED
  const lifecycleRows = await db
    .select()
    .from(claimDecisionLifecycle)
    .where(eq(claimDecisionLifecycle.claimId, claimId))
    .limit(1);

  if (lifecycleRows.length === 0) {
    errors.push("No lifecycle record found for this claim. Cannot lock.");
    return errors;
  }

  const lc = lifecycleRows[0];
  if (lc.lifecycleState !== "FINALISED") {
    errors.push(
      `Claim must be FINALISED before it can be LOCKED. Current state: ${lc.lifecycleState}.`
    );
  }

  // Check a final snapshot exists
  if (!lc.authoritativeSnapshotId) {
    errors.push(
      "No authoritative final snapshot exists for this claim. Finalise the claim first to create one."
    );
  } else {
    // Verify the snapshot row actually exists and is marked final
    const snapRows = await db
      .select()
      .from(decisionSnapshots)
      .where(
        and(
          eq(decisionSnapshots.id, lc.authoritativeSnapshotId),
          eq(decisionSnapshots.isFinalSnapshot, 1)
        )
      )
      .limit(1);

    if (snapRows.length === 0) {
      errors.push(
        `Authoritative snapshot #${lc.authoritativeSnapshotId} not found or not marked as final.`
      );
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 4 — BULK ACTION SAFETY (pure validation, no DB)
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkActionItem {
  claimId: string;
  reason: string;
  humanDecision?: string;
  aiDecision?: string;
}

export interface BulkValidationResult {
  claimId: string;
  action_allowed: boolean;
  validation_errors: string[];
  override_flag: boolean;
}

export function validateBulkActions(
  action: GovernedAction,
  items: BulkActionItem[]
): BulkValidationResult[] {
  return items.map((item) => {
    const errors = validateReason(action, item.reason);
    const override = detectOverride(item.aiDecision, item.humanDecision);

    // Each item must have its own non-empty reason — no silent batch approvals
    if (!item.reason || item.reason.trim().length === 0) {
      if (!errors.includes(`A written reason is required for the ${action} action.`)) {
        errors.push(`Claim ${item.claimId}: individual reason is required — no silent batch approvals.`);
      }
    }

    return {
      claimId: item.claimId,
      action_allowed: errors.length === 0,
      validation_errors: errors,
      override_flag: override,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE 5 — AUDIT TRAIL WRITER
// ─────────────────────────────────────────────────────────────────────────────

export async function writeAuditEntry(
  input: GovernanceInput & {
    actionAllowed: boolean;
    validationErrors: string[];
    overrideFlag: boolean;
  }
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const [result] = await db.insert(governanceAuditLog).values({
      claimId: input.claimId,
      tenantId: input.tenantId,
      action: input.action,
      performedBy: input.performedBy,
      performedByName: input.performedByName,
      timestampMs: Date.now(),
      reason: input.reason,
      overrideFlag: input.overrideFlag ? 1 : 0,
      aiDecision: input.aiDecision,
      humanDecision: input.humanDecision,
      actionAllowed: input.actionAllowed ? 1 : 0,
      validationErrorsJson: input.validationErrors.length > 0
        ? JSON.stringify(input.validationErrors)
        : null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    return (result as { insertId: number }).insertId;
  } catch (err) {
    console.error("[governance] Failed to write audit entry:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN GOVERNANCE GATE
// Validates all rules, writes audit entry, returns GovernanceResult
// ─────────────────────────────────────────────────────────────────────────────

export async function enforceGovernance(
  input: GovernanceInput
): Promise<GovernanceResult> {
  const errors: string[] = [];

  // Rule 1: mandatory justification
  const reasonErrors = validateReason(input.action, input.reason);
  errors.push(...reasonErrors);

  // Rule 3: lock protection (additional DB checks)
  if (input.action === "LOCKED" && reasonErrors.length === 0) {
    const lockErrors = await validateLockConditions(input.claimId);
    errors.push(...lockErrors);
  }

  // Rule 2: override detection
  const overrideFlag = detectOverride(input.aiDecision, input.humanDecision);
  const overrideRecord =
    overrideFlag && input.aiDecision && input.humanDecision
      ? buildOverrideRecord(input.aiDecision, input.humanDecision, input.reason)
      : undefined;

  const actionAllowed = errors.length === 0;

  // Rule 5: always write audit entry (even for blocked actions — for forensics)
  const auditId = await writeAuditEntry({
    ...input,
    actionAllowed,
    validationErrors: errors,
    overrideFlag,
  });

  return {
    action_allowed: actionAllowed,
    validation_errors: errors,
    override_flag: overrideFlag,
    override: overrideRecord,
    audit_entry_id: auditId ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG READER
// ─────────────────────────────────────────────────────────────────────────────

export async function getAuditLog(claimId: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(governanceAuditLog)
    .where(eq(governanceAuditLog.claimId, claimId))
    .orderBy(governanceAuditLog.timestampMs);

  return rows.map((row) => ({
    id: row.id,
    claimId: row.claimId,
    action: row.action as GovernedAction,
    performedBy: row.performedBy,
    performedByName: row.performedByName,
    timestamp: new Date(row.timestampMs).toISOString(),
    reason: row.reason,
    overrideFlag: row.overrideFlag === 1,
    aiDecision: row.aiDecision,
    humanDecision: row.humanDecision,
    actionAllowed: row.actionAllowed === 1,
    validationErrors: row.validationErrorsJson
      ? (JSON.parse(row.validationErrorsJson) as string[])
      : [],
    metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
  }));
}
