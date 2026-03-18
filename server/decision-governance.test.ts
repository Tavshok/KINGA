/**
 * decision-governance.test.ts
 *
 * Unit tests for the governance layer:
 *   - Rule 1: mandatory justification (validateReason)
 *   - Rule 2: override detection (detectOverride, buildOverrideRecord)
 *   - Rule 4: bulk action safety (validateBulkActions)
 *   - enforceGovernance (pure validation path, no DB)
 */

import { describe, it, expect } from "vitest";
import {
  validateReason,
  detectOverride,
  buildOverrideRecord,
  validateBulkActions,
  type GovernedAction,
  type BulkActionItem,
} from "./decision-governance";

// ─────────────────────────────────────────────────────────────────────────────
// RULE 1 — MANDATORY JUSTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

describe("validateReason — Rule 1: mandatory justification", () => {
  const actionsRequiringReason: GovernedAction[] = [
    "REVIEWED",
    "FINALISED",
    "LOCKED",
    "OVERRIDE",
  ];

  const actionsNotRequiringReason: GovernedAction[] = [
    "REPLAY",
    "SNAPSHOT_SAVED",
  ];

  it("blocks when reason is empty for required actions", () => {
    for (const action of actionsRequiringReason) {
      const errors = validateReason(action, "");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("written reason is required");
    }
  });

  it("blocks when reason is whitespace only", () => {
    for (const action of actionsRequiringReason) {
      const errors = validateReason(action, "   ");
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it("blocks when reason is shorter than 10 characters", () => {
    for (const action of actionsRequiringReason) {
      const errors = validateReason(action, "short");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("at least 10 characters");
    }
  });

  it("blocks reason of exactly 9 characters", () => {
    const errors = validateReason("REVIEWED", "123456789");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("allows reason of exactly 10 characters", () => {
    const errors = validateReason("REVIEWED", "1234567890");
    expect(errors).toHaveLength(0);
  });

  it("allows reason longer than 10 characters", () => {
    const errors = validateReason("FINALISED", "This is a comprehensive justification for the decision.");
    expect(errors).toHaveLength(0);
  });

  it("does NOT require reason for REPLAY or SNAPSHOT_SAVED", () => {
    for (const action of actionsNotRequiringReason) {
      const errors = validateReason(action, "");
      expect(errors).toHaveLength(0);
    }
  });

  it("trims whitespace before checking length", () => {
    // "  abc  " trims to "abc" (3 chars) → should fail
    const errors = validateReason("REVIEWED", "  abc  ");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("allows reason with leading/trailing whitespace if trimmed length >= 10", () => {
    const errors = validateReason("REVIEWED", "  This is a valid reason  ");
    expect(errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 2 — OVERRIDE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

describe("detectOverride — Rule 2: override tracking", () => {
  it("returns false when AI and human decisions match (case-insensitive)", () => {
    expect(detectOverride("FINALISE CLAIM", "FINALISE CLAIM")).toBe(false);
    expect(detectOverride("FINALISE CLAIM", "finalise claim")).toBe(false);
    expect(detectOverride("REVIEW REQUIRED", "review required")).toBe(false);
  });

  it("returns true when human decision differs from AI decision", () => {
    expect(detectOverride("FINALISE CLAIM", "REVIEW REQUIRED")).toBe(true);
    expect(detectOverride("FINALISE CLAIM", "ESCALATE INVESTIGATION")).toBe(true);
    expect(detectOverride("REVIEW REQUIRED", "ESCALATE INVESTIGATION")).toBe(true);
  });

  it("returns false when either value is undefined", () => {
    expect(detectOverride(undefined, "FINALISE CLAIM")).toBe(false);
    expect(detectOverride("FINALISE CLAIM", undefined)).toBe(false);
    expect(detectOverride(undefined, undefined)).toBe(false);
  });

  it("trims whitespace before comparing", () => {
    expect(detectOverride("  FINALISE CLAIM  ", "FINALISE CLAIM")).toBe(false);
  });
});

describe("buildOverrideRecord — Rule 2: override record structure", () => {
  it("builds a correctly shaped override record", () => {
    const record = buildOverrideRecord(
      "FINALISE CLAIM",
      "REVIEW REQUIRED",
      "Assessor believes further investigation is warranted."
    );
    expect(record.override).toBe(true);
    expect(record.ai_decision).toBe("FINALISE CLAIM");
    expect(record.human_decision).toBe("REVIEW REQUIRED");
    expect(record.reason).toBe("Assessor believes further investigation is warranted.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE 4 — BULK ACTION SAFETY
// ─────────────────────────────────────────────────────────────────────────────

describe("validateBulkActions — Rule 4: bulk action safety", () => {
  const makeItem = (claimId: string, reason: string): BulkActionItem => ({
    claimId,
    reason,
  });

  it("allows all items when each has a valid reason", () => {
    const items = [
      makeItem("CLM-001", "Reviewed all supporting documents and photos."),
      makeItem("CLM-002", "Damage consistent with reported incident."),
      makeItem("CLM-003", "No anomalies detected in the claim submission."),
    ];
    const results = validateBulkActions("REVIEWED", items);
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.action_allowed).toBe(true);
      expect(r.validation_errors).toHaveLength(0);
    });
  });

  it("blocks items with missing or short reasons individually", () => {
    const items = [
      makeItem("CLM-001", "Reviewed all supporting documents and photos."),
      makeItem("CLM-002", ""),   // missing reason → blocked
      makeItem("CLM-003", "ok"), // too short → blocked
    ];
    const results = validateBulkActions("FINALISED", items);
    expect(results[0].action_allowed).toBe(true);
    expect(results[1].action_allowed).toBe(false);
    expect(results[2].action_allowed).toBe(false);
  });

  it("does not silently approve items with empty reasons", () => {
    const items = [
      makeItem("CLM-001", ""),
      makeItem("CLM-002", ""),
    ];
    const results = validateBulkActions("LOCKED", items);
    results.forEach((r) => {
      expect(r.action_allowed).toBe(false);
      expect(r.validation_errors.length).toBeGreaterThan(0);
    });
  });

  it("detects overrides per item in bulk", () => {
    const items: BulkActionItem[] = [
      { claimId: "CLM-001", reason: "Override justified by new evidence.", aiDecision: "FINALISE CLAIM", humanDecision: "ESCALATE INVESTIGATION" },
      { claimId: "CLM-002", reason: "Consistent with AI recommendation.", aiDecision: "FINALISE CLAIM", humanDecision: "FINALISE CLAIM" },
    ];
    const results = validateBulkActions("FINALISED", items);
    expect(results[0].override_flag).toBe(true);
    expect(results[1].override_flag).toBe(false);
  });

  it("returns results in the same order as input", () => {
    const items = [
      makeItem("CLM-A", "Valid reason provided here."),
      makeItem("CLM-B", "Another valid reason given."),
      makeItem("CLM-C", "Third valid reason supplied."),
    ];
    const results = validateBulkActions("REVIEWED", items);
    expect(results[0].claimId).toBe("CLM-A");
    expect(results[1].claimId).toBe("CLM-B");
    expect(results[2].claimId).toBe("CLM-C");
  });

  it("handles empty input array", () => {
    const results = validateBulkActions("REVIEWED", []);
    expect(results).toHaveLength(0);
  });

  it("handles single item array", () => {
    const results = validateBulkActions("REVIEWED", [makeItem("CLM-X", "Valid reason for review.")]);
    expect(results).toHaveLength(1);
    expect(results[0].action_allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe("governance edge cases", () => {
  it("validateReason returns empty array for SNAPSHOT_SAVED with no reason", () => {
    expect(validateReason("SNAPSHOT_SAVED", "")).toHaveLength(0);
  });

  it("validateReason returns empty array for REPLAY with no reason", () => {
    expect(validateReason("REPLAY", "")).toHaveLength(0);
  });

  it("detectOverride is case-insensitive", () => {
    expect(detectOverride("FINALISE_CLAIM", "finalise_claim")).toBe(false);
    expect(detectOverride("REVIEW_REQUIRED", "ESCALATE_INVESTIGATION")).toBe(true);
  });

  it("buildOverrideRecord always sets override: true", () => {
    const rec = buildOverrideRecord("A", "B", "reason here");
    expect(rec.override).toBe(true);
  });
});
