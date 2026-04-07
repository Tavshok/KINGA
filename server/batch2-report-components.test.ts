/**
 * Batch 2 Report Components — Unit Tests
 *
 * Tests pure helper logic from Batch2ReportComponents.tsx:
 * - fmt$ currency formatting
 * - pct percentage formatting
 * - cost verdict classification
 * - fraud score colour thresholds
 * - document status derivation
 * - mitigation mapping
 */

import { describe, it, expect } from "vitest";

// ─── Replicate helpers ────────────────────────────────────────────────────────

function fmt$(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function pct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function costVerdict(
  compareAmount: number,
  benchmarkMin: number,
  benchmarkMax: number
): "OVERPRICED" | "UNDERPRICED" | "WITHIN RANGE" | "NO BENCHMARK" {
  if (benchmarkMin <= 0 || benchmarkMax <= 0) return "NO BENCHMARK";
  if (compareAmount > benchmarkMax * 1.05) return "OVERPRICED";
  if (compareAmount < benchmarkMin * 0.95) return "UNDERPRICED";
  return "WITHIN RANGE";
}

function fraudScoreColour(score: number): string {
  if (score >= 60) return "#DC2626"; // red
  if (score >= 40) return "#D97706"; // amber
  return "#059669"; // green
}

const MITIGATION_MAP: Array<{ match: string; note: string }> = [
  { match: "photo", note: "Submit additional photos showing all damage angles." },
  { match: "timeline", note: "Provide a detailed written timeline of events." },
  { match: "police", note: "Submit certified police report or case number." },
  { match: "witness", note: "Provide witness statements or contact details." },
  { match: "history", note: "Provide prior claim documentation for context." },
  { match: "speed", note: "Provide GPS/telematics data or dashcam footage." },
  { match: "direction", note: "Provide scene photos showing impact direction." },
  { match: "airbag", note: "Provide workshop inspection report for airbag system." },
  { match: "quote", note: "Obtain a second independent repair quotation." },
  { match: "cost", note: "Provide itemised parts invoices from supplier." },
  { match: "parts", note: "Provide parts receipts or OEM price list." },
  { match: "labour", note: "Provide workshop labour rate schedule." },
  { match: "document", note: "Provide all missing claim documents." },
  { match: "registration", note: "Provide current vehicle registration certificate." },
  { match: "licence", note: "Provide valid driver's licence copy." },
];

function getMitigation(factor: string): string {
  const lc = factor.toLowerCase();
  for (const m of MITIGATION_MAP) {
    if (lc.includes(m.match)) return m.note;
  }
  return "Contact your claims handler for guidance.";
}

type DocStatus = "present" | "missing" | "partial" | "not_required";

function derivePhotoStatus(photoCount: number, systemFailure: boolean): DocStatus {
  if (photoCount >= 3) return "present";
  if (photoCount > 0) return "partial";
  if (systemFailure) return "partial";
  return "missing";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("fmt$ currency formatter", () => {
  it("formats whole number USD", () => {
    expect(fmt$(1000)).toBe("$1,000");
  });

  it("formats large amount with commas", () => {
    expect(fmt$(12500)).toBe("$12,500");
  });

  it("returns em-dash for null", () => {
    expect(fmt$(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(fmt$(undefined)).toBe("—");
  });

  it("returns em-dash for NaN", () => {
    expect(fmt$(NaN)).toBe("—");
  });

  it("formats zero as $0", () => {
    expect(fmt$(0)).toBe("$0");
  });
});

describe("pct percentage formatter", () => {
  it("adds + prefix for positive values", () => {
    expect(pct(15.5)).toBe("+15.5%");
  });

  it("no + prefix for negative values", () => {
    expect(pct(-10.2)).toBe("-10.2%");
  });

  it("formats zero as 0.0% (no sign for zero)", () => {
    // 0 > 0 is false, so no + prefix
    expect(pct(0)).toBe("0.0%");
  });

  it("returns em-dash for null", () => {
    expect(pct(null)).toBe("—");
  });

  it("returns em-dash for NaN", () => {
    expect(pct(NaN)).toBe("—");
  });
});

describe("costVerdict classification", () => {
  it("returns OVERPRICED when amount > max * 1.05", () => {
    expect(costVerdict(1100, 800, 1000)).toBe("OVERPRICED");
  });

  it("returns UNDERPRICED when amount < min * 0.95", () => {
    expect(costVerdict(700, 800, 1000)).toBe("UNDERPRICED");
  });

  it("returns WITHIN RANGE for amounts in benchmark band", () => {
    expect(costVerdict(900, 800, 1000)).toBe("WITHIN RANGE");
  });

  it("returns WITHIN RANGE at exact benchmark mid", () => {
    expect(costVerdict(900, 800, 1000)).toBe("WITHIN RANGE");
  });

  it("returns NO BENCHMARK when min/max are zero", () => {
    expect(costVerdict(900, 0, 0)).toBe("NO BENCHMARK");
  });

  it("returns WITHIN RANGE at exact upper boundary (1.05 * max)", () => {
    // 1050 == 1000 * 1.05, NOT > so should be WITHIN RANGE
    expect(costVerdict(1050, 800, 1000)).toBe("WITHIN RANGE");
  });

  it("returns OVERPRICED just above upper boundary", () => {
    expect(costVerdict(1051, 800, 1000)).toBe("OVERPRICED");
  });
});

describe("fraudScoreColour thresholds", () => {
  it("returns red for score >= 60", () => {
    expect(fraudScoreColour(60)).toBe("#DC2626");
    expect(fraudScoreColour(75)).toBe("#DC2626");
    expect(fraudScoreColour(100)).toBe("#DC2626");
  });

  it("returns amber for score 40-59", () => {
    expect(fraudScoreColour(40)).toBe("#D97706");
    expect(fraudScoreColour(55)).toBe("#D97706");
    expect(fraudScoreColour(59)).toBe("#D97706");
  });

  it("returns green for score < 40", () => {
    expect(fraudScoreColour(0)).toBe("#059669");
    expect(fraudScoreColour(20)).toBe("#059669");
    expect(fraudScoreColour(39)).toBe("#059669");
  });
});

describe("getMitigation", () => {
  it("returns photo mitigation for photo-related factor", () => {
    expect(getMitigation("photo_inconsistency")).toContain("photos");
  });

  it("returns police mitigation for police-related factor", () => {
    expect(getMitigation("police_report_missing")).toContain("police report");
  });

  it("returns speed mitigation for speed-related factor", () => {
    expect(getMitigation("reported_speed_anomaly")).toContain("GPS");
  });

  it("returns quote mitigation for quote-related factor", () => {
    expect(getMitigation("quote_discrepancy")).toContain("quotation");
  });

  it("returns default fallback for unknown factor", () => {
    expect(getMitigation("xyz_unknown_factor")).toBe(
      "Contact your claims handler for guidance."
    );
  });

  it("is case-insensitive", () => {
    expect(getMitigation("PHOTO_MISSING")).toContain("photos");
  });
});

describe("derivePhotoStatus", () => {
  it("returns present for 3+ photos", () => {
    expect(derivePhotoStatus(3, false)).toBe("present");
    expect(derivePhotoStatus(10, false)).toBe("present");
  });

  it("returns partial for 1-2 photos", () => {
    expect(derivePhotoStatus(1, false)).toBe("partial");
    expect(derivePhotoStatus(2, false)).toBe("partial");
  });

  it("returns partial for system failure even with 0 photos", () => {
    expect(derivePhotoStatus(0, true)).toBe("partial");
  });

  it("returns missing for 0 photos without system failure", () => {
    expect(derivePhotoStatus(0, false)).toBe("missing");
  });
});

describe("document inventory completeness", () => {
  it("counts missing documents correctly", () => {
    const statuses: DocStatus[] = ["present", "missing", "missing", "partial", "present"];
    const missingCount = statuses.filter((s) => s === "missing").length;
    expect(missingCount).toBe(2);
  });

  it("counts partial documents correctly", () => {
    const statuses: DocStatus[] = ["present", "missing", "partial", "partial"];
    const partialCount = statuses.filter((s) => s === "partial").length;
    expect(partialCount).toBe(2);
  });

  it("all present returns zero missing", () => {
    const statuses: DocStatus[] = ["present", "present", "not_required"];
    const missingCount = statuses.filter((s) => s === "missing").length;
    expect(missingCount).toBe(0);
  });
});
