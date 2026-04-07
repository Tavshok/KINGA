/**
 * Batch 3 Report Components — Unit Tests
 *
 * Tests pure helper logic from Batch3ReportComponents.tsx:
 * - djb2Hash determinism and uniqueness
 * - buildReportHash stability and sensitivity
 * - Decision colour mapping
 */

import { describe, it, expect } from "vitest";

// ─── Replicate helpers ────────────────────────────────────────────────────────

function djb2Hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, "0");
}

function buildReportHash(
  claimId: string | number,
  decision: string,
  fraudScore: number,
  totalCost: number,
  consistencyScore: number
): string {
  const raw = `${claimId}|${decision}|${fraudScore}|${totalCost.toFixed(2)}|${consistencyScore}`;
  return djb2Hash(raw);
}

const decisionColourMap: Record<string, { bg: string; text: string }> = {
  APPROVE: { bg: "#059669", text: "#FFFFFF" },
  FINALISE: { bg: "#059669", text: "#FFFFFF" },
  FINALISE_CLAIM: { bg: "#059669", text: "#FFFFFF" },
  REVIEW: { bg: "#D97706", text: "#FFFFFF" },
  REVIEW_REQUIRED: { bg: "#D97706", text: "#FFFFFF" },
  ESCALATE: { bg: "#DC2626", text: "#FFFFFF" },
  REJECT: { bg: "#DC2626", text: "#FFFFFF" },
};

function getDecisionColour(decision: string): { bg: string; text: string } {
  return decisionColourMap[decision] ?? { bg: "#475569", text: "#FFFFFF" };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("djb2Hash", () => {
  it("produces a deterministic 8-char uppercase hex string", () => {
    const h = djb2Hash("hello");
    expect(h).toMatch(/^[0-9A-F]{8}$/);
  });

  it("same input always produces same hash", () => {
    expect(djb2Hash("KINGA-TEST")).toBe(djb2Hash("KINGA-TEST"));
  });

  it("different inputs produce different hashes", () => {
    expect(djb2Hash("APPROVE")).not.toBe(djb2Hash("REJECT"));
  });

  it("empty string produces a valid hash (not empty)", () => {
    const h = djb2Hash("");
    expect(h.length).toBe(8);
    expect(h).toMatch(/^[0-9A-F]{8}$/);
  });

  it("is case-sensitive", () => {
    expect(djb2Hash("approve")).not.toBe(djb2Hash("APPROVE"));
  });

  it("handles unicode characters without throwing", () => {
    expect(() => djb2Hash("claim #123 · vehicle")).not.toThrow();
  });
});

describe("buildReportHash", () => {
  const base = { claimId: "CLM-001", decision: "REVIEW", fraudScore: 45, totalCost: 3500, consistencyScore: 72 };

  it("produces a deterministic 8-char hash", () => {
    const h = buildReportHash(base.claimId, base.decision, base.fraudScore, base.totalCost, base.consistencyScore);
    expect(h).toMatch(/^[0-9A-F]{8}$/);
  });

  it("same inputs produce same hash", () => {
    const h1 = buildReportHash(base.claimId, base.decision, base.fraudScore, base.totalCost, base.consistencyScore);
    const h2 = buildReportHash(base.claimId, base.decision, base.fraudScore, base.totalCost, base.consistencyScore);
    expect(h1).toBe(h2);
  });

  it("changing decision changes hash", () => {
    const h1 = buildReportHash(base.claimId, "REVIEW", base.fraudScore, base.totalCost, base.consistencyScore);
    const h2 = buildReportHash(base.claimId, "APPROVE", base.fraudScore, base.totalCost, base.consistencyScore);
    expect(h1).not.toBe(h2);
  });

  it("changing fraud score changes hash", () => {
    const h1 = buildReportHash(base.claimId, base.decision, 45, base.totalCost, base.consistencyScore);
    const h2 = buildReportHash(base.claimId, base.decision, 46, base.totalCost, base.consistencyScore);
    expect(h1).not.toBe(h2);
  });

  it("changing total cost changes hash", () => {
    const h1 = buildReportHash(base.claimId, base.decision, base.fraudScore, 3500, base.consistencyScore);
    const h2 = buildReportHash(base.claimId, base.decision, base.fraudScore, 3501, base.consistencyScore);
    expect(h1).not.toBe(h2);
  });

  it("changing consistency score changes hash", () => {
    const h1 = buildReportHash(base.claimId, base.decision, base.fraudScore, base.totalCost, 72);
    const h2 = buildReportHash(base.claimId, base.decision, base.fraudScore, base.totalCost, 73);
    expect(h1).not.toBe(h2);
  });

  it("changing claim ID changes hash", () => {
    const h1 = buildReportHash("CLM-001", base.decision, base.fraudScore, base.totalCost, base.consistencyScore);
    const h2 = buildReportHash("CLM-002", base.decision, base.fraudScore, base.totalCost, base.consistencyScore);
    expect(h1).not.toBe(h2);
  });

  it("numeric claimId produces same hash as string equivalent", () => {
    // Both stringify to "123" in the raw string
    const h1 = buildReportHash(123, base.decision, base.fraudScore, base.totalCost, base.consistencyScore);
    const h2 = buildReportHash("123", base.decision, base.fraudScore, base.totalCost, base.consistencyScore);
    expect(h1).toBe(h2);
  });

  it("cost is normalised to 2 decimal places (3500 vs 3500.00 same hash)", () => {
    const h1 = buildReportHash(base.claimId, base.decision, base.fraudScore, 3500, base.consistencyScore);
    const h2 = buildReportHash(base.claimId, base.decision, base.fraudScore, 3500.00, base.consistencyScore);
    expect(h1).toBe(h2);
  });
});

describe("getDecisionColour", () => {
  it("APPROVE returns green", () => {
    expect(getDecisionColour("APPROVE").bg).toBe("#059669");
  });

  it("FINALISE returns green", () => {
    expect(getDecisionColour("FINALISE").bg).toBe("#059669");
  });

  it("FINALISE_CLAIM returns green", () => {
    expect(getDecisionColour("FINALISE_CLAIM").bg).toBe("#059669");
  });

  it("REVIEW returns amber", () => {
    expect(getDecisionColour("REVIEW").bg).toBe("#D97706");
  });

  it("REVIEW_REQUIRED returns amber", () => {
    expect(getDecisionColour("REVIEW_REQUIRED").bg).toBe("#D97706");
  });

  it("ESCALATE returns red", () => {
    expect(getDecisionColour("ESCALATE").bg).toBe("#DC2626");
  });

  it("REJECT returns red", () => {
    expect(getDecisionColour("REJECT").bg).toBe("#DC2626");
  });

  it("unknown decision returns neutral slate", () => {
    expect(getDecisionColour("UNKNOWN").bg).toBe("#475569");
  });

  it("all known decisions return white text", () => {
    const decisions = ["APPROVE", "FINALISE", "REVIEW", "ESCALATE", "REJECT"];
    for (const d of decisions) {
      expect(getDecisionColour(d).text).toBe("#FFFFFF");
    }
  });
});

describe("hash collision resistance (spot check)", () => {
  it("produces 10 unique hashes for 10 different claim IDs", () => {
    const hashes = new Set<string>();
    for (let i = 1; i <= 10; i++) {
      hashes.add(buildReportHash(`CLM-${i}`, "REVIEW", 40, 2000, 70));
    }
    expect(hashes.size).toBe(10);
  });

  it("produces unique hashes for different fraud scores 0-100", () => {
    const hashes = new Set<string>();
    for (let s = 0; s <= 100; s += 10) {
      hashes.add(buildReportHash("CLM-001", "REVIEW", s, 2000, 70));
    }
    expect(hashes.size).toBe(11);
  });
});
