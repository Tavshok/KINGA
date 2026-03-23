/**
 * claimsEscalationRouter.test.ts
 *
 * Comprehensive test suite for the Claims Escalation Router engine.
 * Covers all 13 routing rules, edge cases, batch processing, and aggregation.
 */

import { describe, it, expect } from "vitest";
import {
  routeClaim,
  routeClaimBatch,
  aggregateEscalationStats,
  type EscalationInput,
  type BatchEscalationItem,
} from "./claimsEscalationRouter";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseApproveHighConf: EscalationInput = {
  recommendation: "APPROVE",
  confidence: 85,
  anomalies: [],
  fraud_risk_level: "low",
  fraud_flagged: false,
};

const baseApproveMedConf: EscalationInput = {
  recommendation: "APPROVE",
  confidence: 65,
  anomalies: [],
  fraud_risk_level: "low",
};

const baseApproveLowConf: EscalationInput = {
  recommendation: "APPROVE",
  confidence: 50,
  anomalies: [],
  fraud_risk_level: "low",
};

const baseReview: EscalationInput = {
  recommendation: "REVIEW",
  confidence: 55,
  anomalies: [],
  fraud_risk_level: "low",
};

const baseReject: EscalationInput = {
  recommendation: "REJECT",
  confidence: 70,
  anomalies: [],
  fraud_risk_level: "low",
};

// ─── Rule 1: REJECT + fraud → FRAUD_TEAM / HIGH ───────────────────────────────

describe("Rule 1: REJECT + fraud indicators → FRAUD_TEAM / HIGH", () => {
  it("routes REJECT + fraud_flagged=true to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReject, fraud_flagged: true });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
    expect(result.metadata.routing_rule).toBe("RULE_1_REJECT_FRAUD");
  });

  it("routes REJECT + fraud_risk_level=high to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReject, fraud_risk_level: "high" });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
  });

  it("routes REJECT + fraud_risk_level=critical to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReject, fraud_risk_level: "critical" });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
  });

  it("routes REJECT + fraud_risk_level=elevated to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReject, fraud_risk_level: "elevated" });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
  });

  it("routes REJECT + critical_fraud_flag_count=2 to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReject, critical_fraud_flag_count: 2 });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
  });

  it("includes 'fraud' in the reason text", () => {
    const result = routeClaim({ ...baseReject, fraud_flagged: true });
    expect(result.reason.toLowerCase()).toContain("fraud");
  });
});

// ─── Rule 2: REJECT (no fraud) → ADJUSTER_REVIEW / HIGH ──────────────────────

describe("Rule 2: REJECT (no fraud) → ADJUSTER_REVIEW / HIGH", () => {
  it("routes REJECT + no fraud to ADJUSTER_REVIEW", () => {
    const result = routeClaim(baseReject);
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("HIGH");
    expect(result.metadata.routing_rule).toBe("RULE_2_REJECT_NO_FRAUD");
  });

  it("mentions physics inconsistency in reason when present", () => {
    const result = routeClaim({ ...baseReject, physics_inconsistency: true });
    expect(result.reason.toLowerCase()).toContain("physical inconsistency");
  });

  it("mentions damage discrepancy in reason when present", () => {
    const result = routeClaim({ ...baseReject, damage_inconsistent: true });
    expect(result.reason.toLowerCase()).toContain("damage discrepancy");
  });

  it("mentions both issues when both present", () => {
    const result = routeClaim({ ...baseReject, physics_inconsistency: true, damage_inconsistent: true });
    expect(result.reason.toLowerCase()).toContain("physical inconsistency");
    expect(result.reason.toLowerCase()).toContain("damage discrepancy");
  });

  it("uses generic description when no specific issue", () => {
    const result = routeClaim(baseReject);
    expect(result.reason.toLowerCase()).toContain("critical assessment findings");
  });
});

// ─── Rule 3: REVIEW + fraud → FRAUD_TEAM / HIGH ───────────────────────────────

describe("Rule 3: REVIEW + fraud indicators → FRAUD_TEAM / HIGH", () => {
  it("routes REVIEW + fraud_flagged=true to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReview, fraud_flagged: true });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
    expect(result.metadata.routing_rule).toBe("RULE_3_REVIEW_FRAUD");
  });

  it("routes REVIEW + fraud_risk_level=high to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReview, fraud_risk_level: "high" });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
  });

  it("routes REVIEW + fraud_risk_level=medium to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReview, fraud_risk_level: "medium" });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
  });

  it("routes REVIEW + fraud_risk_level=elevated to FRAUD_TEAM", () => {
    const result = routeClaim({ ...baseReview, fraud_risk_level: "elevated" });
    expect(result.route_to).toBe("FRAUD_TEAM");
    expect(result.priority).toBe("HIGH");
  });

  it("uses 'elevated' language for high fraud", () => {
    const result = routeClaim({ ...baseReview, fraud_risk_level: "high" });
    expect(result.reason.toLowerCase()).toContain("elevated");
  });

  it("uses 'medium' language for medium fraud", () => {
    const result = routeClaim({ ...baseReview, fraud_risk_level: "medium" });
    expect(result.reason.toLowerCase()).toContain("medium");
  });
});

// ─── Rule 4: REVIEW + critical anomalies → ADJUSTER_REVIEW / HIGH ────────────

describe("Rule 4: REVIEW + critical anomalies → ADJUSTER_REVIEW / HIGH", () => {
  it("routes REVIEW + 1 critical anomaly to ADJUSTER_REVIEW / HIGH", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: [{ description: "Unexplained damage", is_critical: true }],
    });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("HIGH");
    expect(result.metadata.routing_rule).toBe("RULE_4_REVIEW_CRITICAL_ANOMALIES");
  });

  it("routes REVIEW + 3 critical anomalies to ADJUSTER_REVIEW / HIGH", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: [
        { description: "A", is_critical: true },
        { description: "B", is_critical: true },
        { description: "C", is_critical: true },
      ],
    });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("HIGH");
    expect(result.metadata.critical_anomaly_count).toBe(3);
  });

  it("mentions the count of critical anomalies in reason", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: [{ description: "A", is_critical: true }],
    });
    expect(result.reason).toContain("1 critical anomaly");
  });
});

// ─── Rule 5: REVIEW + moderate anomalies → ADJUSTER_REVIEW / MEDIUM ──────────

describe("Rule 5: REVIEW + moderate anomalies → ADJUSTER_REVIEW / MEDIUM", () => {
  it("routes REVIEW + non-critical anomalies to ADJUSTER_REVIEW / MEDIUM", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: [{ description: "Minor discrepancy", is_critical: false }],
    });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.routing_rule).toBe("RULE_5_REVIEW_ANOMALIES");
  });

  it("routes REVIEW + string anomalies to ADJUSTER_REVIEW / MEDIUM", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: ["Cost deviation", "Missing document"],
    });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.anomaly_count).toBe(2);
  });

  it("mentions anomaly count in reason", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: ["A", "B"],
    });
    expect(result.reason).toContain("2 anomalies");
  });
});

// ─── Rule 6: REVIEW (clean) → ADJUSTER_REVIEW / LOW ─────────────────────────

describe("Rule 6: REVIEW (clean) → ADJUSTER_REVIEW / LOW", () => {
  it("routes clean REVIEW to ADJUSTER_REVIEW / LOW", () => {
    const result = routeClaim(baseReview);
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("LOW");
    expect(result.metadata.routing_rule).toBe("RULE_6_REVIEW_CLEAN");
  });

  it("mentions insufficient data when confidence is null", () => {
    const result = routeClaim({ ...baseReview, confidence: null });
    expect(result.reason.toLowerCase()).toContain("insufficient data");
  });

  it("mentions limited confidence when confidence is LOW band", () => {
    const result = routeClaim({ ...baseReview, confidence: 45 });
    expect(result.reason.toLowerCase()).toContain("limited");
  });

  it("uses standard review language when confidence is MEDIUM", () => {
    const result = routeClaim({ ...baseReview, confidence: 65 });
    expect(result.reason.toLowerCase()).toContain("standard adjuster review");
  });
});

// ─── Rule 7: APPROVE + insufficient confidence → ADJUSTER_REVIEW / MEDIUM ────

describe("Rule 7: APPROVE + insufficient confidence → ADJUSTER_REVIEW / MEDIUM", () => {
  it("routes APPROVE + confidence=null to ADJUSTER_REVIEW", () => {
    const result = routeClaim({ ...baseApproveHighConf, confidence: null });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.routing_rule).toBe("RULE_7_APPROVE_INSUFFICIENT_CONFIDENCE");
  });

  it("routes APPROVE + confidence=30 to ADJUSTER_REVIEW", () => {
    const result = routeClaim({ ...baseApproveHighConf, confidence: 30 });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
  });

  it("routes APPROVE + confidence=0 to ADJUSTER_REVIEW", () => {
    const result = routeClaim({ ...baseApproveHighConf, confidence: 0 });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
  });
});

// ─── Rule 8: APPROVE + anomalies → ADJUSTER_REVIEW / MEDIUM ──────────────────

describe("Rule 8: APPROVE + anomalies → ADJUSTER_REVIEW / MEDIUM", () => {
  it("routes APPROVE + anomalies to ADJUSTER_REVIEW / MEDIUM", () => {
    const result = routeClaim({
      ...baseApproveHighConf,
      anomalies: [{ description: "Cost deviation", is_critical: false }],
    });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.routing_rule).toBe("RULE_8_APPROVE_ANOMALIES");
  });

  it("mentions anomaly count in reason", () => {
    const result = routeClaim({
      ...baseApproveHighConf,
      anomalies: ["A"],
    });
    expect(result.reason).toContain("1 anomaly");
  });
});

// ─── Rule 9: APPROVE + cost_escalated → ADJUSTER_REVIEW / MEDIUM ─────────────

describe("Rule 9: APPROVE + cost escalated → ADJUSTER_REVIEW / MEDIUM", () => {
  it("routes APPROVE + cost_escalated=true to ADJUSTER_REVIEW / MEDIUM", () => {
    const result = routeClaim({ ...baseApproveHighConf, cost_escalated: true });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.routing_rule).toBe("RULE_9_APPROVE_COST_ESCALATED");
  });

  it("mentions cost in reason", () => {
    const result = routeClaim({ ...baseApproveHighConf, cost_escalated: true });
    expect(result.reason.toLowerCase()).toContain("cost");
  });
});

// ─── Rule 10: APPROVE + high value → ADJUSTER_REVIEW / MEDIUM ────────────────

describe("Rule 10: APPROVE + high value → ADJUSTER_REVIEW / MEDIUM", () => {
  it("routes APPROVE + is_high_value=true to ADJUSTER_REVIEW / MEDIUM", () => {
    const result = routeClaim({ ...baseApproveHighConf, is_high_value: true });
    expect(result.route_to).toBe("ADJUSTER_REVIEW");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.routing_rule).toBe("RULE_10_APPROVE_HIGH_VALUE");
  });

  it("mentions high-value in reason", () => {
    const result = routeClaim({ ...baseApproveHighConf, is_high_value: true });
    expect(result.reason.toLowerCase()).toContain("high-value");
  });
});

// ─── Rule 11: APPROVE + LOW confidence → AUTO_APPROVE / MEDIUM ───────────────

describe("Rule 11: APPROVE + LOW confidence → AUTO_APPROVE / MEDIUM", () => {
  it("routes APPROVE + confidence=50 to AUTO_APPROVE / MEDIUM", () => {
    const result = routeClaim(baseApproveLowConf);
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.routing_rule).toBe("RULE_11_APPROVE_LOW_CONFIDENCE");
  });

  it("routes APPROVE + confidence=40 to AUTO_APPROVE / MEDIUM", () => {
    const result = routeClaim({ ...baseApproveLowConf, confidence: 40 });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.priority).toBe("MEDIUM");
  });
});

// ─── Rule 12: APPROVE + MEDIUM confidence → AUTO_APPROVE / MEDIUM ────────────

describe("Rule 12: APPROVE + MEDIUM confidence → AUTO_APPROVE / MEDIUM", () => {
  it("routes APPROVE + confidence=65 to AUTO_APPROVE / MEDIUM", () => {
    const result = routeClaim(baseApproveMedConf);
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.priority).toBe("MEDIUM");
    expect(result.metadata.routing_rule).toBe("RULE_12_APPROVE_MEDIUM_CONFIDENCE");
  });

  it("routes APPROVE + confidence=74 to AUTO_APPROVE / MEDIUM", () => {
    const result = routeClaim({ ...baseApproveMedConf, confidence: 74 });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.priority).toBe("MEDIUM");
  });
});

// ─── Rule 13: APPROVE + HIGH confidence → AUTO_APPROVE / LOW ─────────────────

describe("Rule 13: APPROVE + HIGH confidence → AUTO_APPROVE / LOW", () => {
  it("routes APPROVE + confidence=85 to AUTO_APPROVE / LOW", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.priority).toBe("LOW");
    expect(result.metadata.routing_rule).toBe("RULE_13_APPROVE_HIGH_CONFIDENCE");
  });

  it("routes APPROVE + confidence=75 to AUTO_APPROVE / LOW", () => {
    const result = routeClaim({ ...baseApproveHighConf, confidence: 75 });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.priority).toBe("LOW");
  });

  it("routes APPROVE + confidence=100 to AUTO_APPROVE / LOW", () => {
    const result = routeClaim({ ...baseApproveHighConf, confidence: 100 });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.priority).toBe("LOW");
  });

  it("includes confidence value in reason", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(result.reason).toContain("85%");
  });
});

// ─── Metadata Tests ───────────────────────────────────────────────────────────

describe("Metadata fields", () => {
  it("sets recommendation correctly", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(result.metadata.recommendation).toBe("APPROVE");
  });

  it("sets confidence correctly", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(result.metadata.confidence).toBe(85);
  });

  it("sets confidence_band to HIGH for confidence=85", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(result.metadata.confidence_band).toBe("HIGH");
  });

  it("sets confidence_band to MEDIUM for confidence=65", () => {
    const result = routeClaim(baseApproveMedConf);
    expect(result.metadata.confidence_band).toBe("MEDIUM");
  });

  it("sets confidence_band to LOW for confidence=50", () => {
    const result = routeClaim(baseApproveLowConf);
    expect(result.metadata.confidence_band).toBe("LOW");
  });

  it("sets confidence_band to INSUFFICIENT for confidence=null", () => {
    const result = routeClaim({ ...baseApproveHighConf, confidence: null });
    expect(result.metadata.confidence_band).toBe("INSUFFICIENT");
  });

  it("sets fraud_detected=true when fraud_flagged=true", () => {
    const result = routeClaim({ ...baseReject, fraud_flagged: true });
    expect(result.metadata.fraud_detected).toBe(true);
  });

  it("sets fraud_detected=false when no fraud signals", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(result.metadata.fraud_detected).toBe(false);
  });

  it("sets anomaly_count correctly", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: ["A", "B", "C"],
    });
    expect(result.metadata.anomaly_count).toBe(3);
  });

  it("sets critical_anomaly_count correctly", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: [
        { description: "A", is_critical: true },
        { description: "B", is_critical: false },
        { description: "C", is_critical: true },
      ],
    });
    expect(result.metadata.critical_anomaly_count).toBe(2);
  });

  it("sets claim_reference when provided", () => {
    const result = routeClaim({ ...baseApproveHighConf, claim_reference: "CLM-2024-001" });
    expect(result.metadata.claim_reference).toBe("CLM-2024-001");
  });

  it("sets claim_reference to null when not provided", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(result.metadata.claim_reference).toBeNull();
  });

  it("sets routed_at as a valid ISO string", () => {
    const result = routeClaim(baseApproveHighConf);
    expect(() => new Date(result.metadata.routed_at)).not.toThrow();
    expect(new Date(result.metadata.routed_at).getTime()).toBeGreaterThan(0);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles null anomalies gracefully", () => {
    const result = routeClaim({ ...baseApproveHighConf, anomalies: null });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.metadata.anomaly_count).toBe(0);
  });

  it("handles undefined anomalies gracefully", () => {
    const result = routeClaim({ ...baseApproveHighConf, anomalies: undefined });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.metadata.anomaly_count).toBe(0);
  });

  it("handles empty anomalies array", () => {
    const result = routeClaim({ ...baseApproveHighConf, anomalies: [] });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.metadata.anomaly_count).toBe(0);
  });

  it("handles mixed string and object anomalies", () => {
    const result = routeClaim({
      ...baseReview,
      anomalies: ["string anomaly", { description: "object anomaly", is_critical: false }],
    });
    expect(result.metadata.anomaly_count).toBe(2);
  });

  it("handles uppercase fraud_risk_level gracefully", () => {
    const result = routeClaim({ ...baseReject, fraud_risk_level: "HIGH" });
    expect(result.route_to).toBe("FRAUD_TEAM");
  });

  it("handles fraud_risk_level=minimal as no fraud", () => {
    const result = routeClaim({ ...baseApproveHighConf, fraud_risk_level: "minimal" });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.metadata.fraud_detected).toBe(false);
  });

  it("handles fraud_risk_level=low as no fraud", () => {
    const result = routeClaim({ ...baseApproveHighConf, fraud_risk_level: "low" });
    expect(result.route_to).toBe("AUTO_APPROVE");
    expect(result.metadata.fraud_detected).toBe(false);
  });

  it("handles critical_fraud_flag_count=0 as no fraud", () => {
    const result = routeClaim({ ...baseApproveHighConf, critical_fraud_flag_count: 0 });
    expect(result.route_to).toBe("AUTO_APPROVE");
  });

  it("produces a non-empty reason for all routes", () => {
    const inputs: EscalationInput[] = [
      { ...baseReject, fraud_flagged: true },
      baseReject,
      { ...baseReview, fraud_risk_level: "high" },
      { ...baseReview, anomalies: [{ is_critical: true }] },
      { ...baseReview, anomalies: ["minor"] },
      baseReview,
      { ...baseApproveHighConf, confidence: null },
      { ...baseApproveHighConf, anomalies: ["x"] },
      { ...baseApproveHighConf, cost_escalated: true },
      { ...baseApproveHighConf, is_high_value: true },
      baseApproveLowConf,
      baseApproveMedConf,
      baseApproveHighConf,
    ];
    for (const input of inputs) {
      const result = routeClaim(input);
      expect(result.reason.length).toBeGreaterThan(10);
    }
  });
});

// ─── Batch Processing ─────────────────────────────────────────────────────────

describe("routeClaimBatch", () => {
  it("returns one result per input", () => {
    const items: BatchEscalationItem[] = [
      { claim_id: 1, input: baseApproveHighConf },
      { claim_id: 2, input: baseReview },
      { claim_id: 3, input: { ...baseReject, fraud_flagged: true } },
    ];
    const results = routeClaimBatch(items);
    expect(results).toHaveLength(3);
  });

  it("preserves claim_id in results", () => {
    const items: BatchEscalationItem[] = [
      { claim_id: "CLM-001", input: baseApproveHighConf },
      { claim_id: 42, input: baseReview },
    ];
    const results = routeClaimBatch(items);
    expect(results[0].claim_id).toBe("CLM-001");
    expect(results[1].claim_id).toBe(42);
  });

  it("routes each claim independently", () => {
    const items: BatchEscalationItem[] = [
      { claim_id: 1, input: baseApproveHighConf },
      { claim_id: 2, input: { ...baseReject, fraud_flagged: true } },
    ];
    const results = routeClaimBatch(items);
    expect(results[0].result.route_to).toBe("AUTO_APPROVE");
    expect(results[1].result.route_to).toBe("FRAUD_TEAM");
  });

  it("handles empty batch", () => {
    const results = routeClaimBatch([]);
    expect(results).toHaveLength(0);
  });
});

// ─── Aggregation ──────────────────────────────────────────────────────────────

describe("aggregateEscalationStats", () => {
  it("returns zero stats for empty results", () => {
    const stats = aggregateEscalationStats([]);
    expect(stats.total).toBe(0);
    expect(stats.auto_approve_count).toBe(0);
    expect(stats.adjuster_review_count).toBe(0);
    expect(stats.fraud_team_count).toBe(0);
    expect(stats.auto_approve_rate_pct).toBe(0);
  });

  it("counts routes correctly", () => {
    const items: BatchEscalationItem[] = [
      { claim_id: 1, input: baseApproveHighConf },
      { claim_id: 2, input: baseApproveHighConf },
      { claim_id: 3, input: baseReview },
      { claim_id: 4, input: { ...baseReject, fraud_flagged: true } },
    ];
    const results = routeClaimBatch(items);
    const stats = aggregateEscalationStats(results);
    expect(stats.total).toBe(4);
    expect(stats.auto_approve_count).toBe(2);
    expect(stats.adjuster_review_count).toBe(1);
    expect(stats.fraud_team_count).toBe(1);
  });

  it("calculates percentages correctly", () => {
    const items: BatchEscalationItem[] = [
      { claim_id: 1, input: baseApproveHighConf },
      { claim_id: 2, input: baseApproveHighConf },
      { claim_id: 3, input: baseApproveHighConf },
      { claim_id: 4, input: baseApproveHighConf },
    ];
    const results = routeClaimBatch(items);
    const stats = aggregateEscalationStats(results);
    expect(stats.auto_approve_rate_pct).toBe(100);
    expect(stats.adjuster_review_rate_pct).toBe(0);
    expect(stats.fraud_team_rate_pct).toBe(0);
  });

  it("counts priorities correctly", () => {
    const items: BatchEscalationItem[] = [
      { claim_id: 1, input: baseApproveHighConf },          // LOW
      { claim_id: 2, input: baseApproveMedConf },           // MEDIUM
      { claim_id: 3, input: { ...baseReject, fraud_flagged: true } }, // HIGH
    ];
    const results = routeClaimBatch(items);
    const stats = aggregateEscalationStats(results);
    expect(stats.low_priority_count).toBe(1);
    expect(stats.medium_priority_count).toBe(1);
    expect(stats.high_priority_count).toBe(1);
  });

  it("handles single-item batch", () => {
    const items: BatchEscalationItem[] = [
      { claim_id: 1, input: baseApproveHighConf },
    ];
    const results = routeClaimBatch(items);
    const stats = aggregateEscalationStats(results);
    expect(stats.total).toBe(1);
    expect(stats.auto_approve_rate_pct).toBe(100);
  });
});
