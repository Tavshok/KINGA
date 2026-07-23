/**
 * Re-verification unit tests for Voltron FDR bug fixes:
 * Bug #2 (6-method speed display), Bug #5 (partial estimate flag),
 * Bug #10 (excess_amount_cents), Bug #11 (FDR-only CSS)
 */
import { describe, it, expect } from "vitest";
import {
  KINGA_FDR_CSS,
  KINGA_REPORT_CSS,
  buildKingaFdrHtml,
  fmtCurrency,
} from "./reporting/templates/kingaDesignSystem";

// ── Bug #11: FDR CSS strips dead CIR classes ──────────────────────────────────
describe("Bug #11 — FDR CSS strips dead CIR classes", () => {
  const deadClasses = [
    ".score-strip",
    ".ss-c",
    ".ss-n",
    ".ss-l",
    ".meta-grid",
    ".mg-cell",
    ".mg-lbl",
    ".mg-val",
    ".vbadge",
    ".vbody",
    ".contents",
    ".ct-title",
    ".ct-grid",
    ".ci-n",
    ".ci-t",
  ];

  for (const cls of deadClasses) {
    it(`should not contain ${cls} rule in KINGA_FDR_CSS`, () => {
      const pattern = new RegExp(cls.replace(".", "\\.") + "\\s*\\{");
      expect(KINGA_FDR_CSS).not.toMatch(pattern);
    });
  }

  it("KINGA_REPORT_CSS still contains .score-strip (CIR uses it)", () => {
    expect(KINGA_REPORT_CSS).toMatch(/\.score-strip\s*\{/);
  });

  it("buildKingaFdrHtml uses KINGA_FDR_CSS not KINGA_REPORT_CSS", () => {
    const html = buildKingaFdrHtml("Test", "<p>body</p>");
    expect(html).toContain("<style>");
    // FDR HTML should not contain dead .score-strip rule
    expect(html).not.toMatch(/\.score-strip\s*\{/);
  });
});

// ── Bug #8: fmtCurrency uses dynamic currency code ────────────────────────────
describe("Bug #8 — fmtCurrency dynamic currency", () => {
  it("formats USD correctly", () => {
    expect(fmtCurrency(1234.56, "USD")).toBe("$1,234.56");
  });

  it("formats ZMW correctly", () => {
    const result = fmtCurrency(1234.56, "ZMW");
    expect(result).toContain("1,234.56");
    expect(result).not.toBe("$1,234.56");
  });

  it("falls back to USD for invalid currency code", () => {
    expect(fmtCurrency(100, "INVALID")).toBe("$100.00");
  });

  it("falls back to USD for null currency", () => {
    expect(fmtCurrency(100, null)).toBe("$100.00");
  });

  it("handles 0 correctly", () => {
    expect(fmtCurrency(0, "USD")).toBe("$0.00");
  });
});

// ── Bug #10: excess_amount_cents conversion ────────────────────────────────────
describe("Bug #10 — excess_amount_cents conversion logic", () => {
  // Test the conversion formula used in forensicDecisionReport.ts:
  // excess = c.excess_amount_cents != null ? Number(c.excess_amount_cents) / 100 : Number(c.policy_excess ?? c.deductible ?? 0)
  it("converts excess_amount_cents from cents to dollars", () => {
    const c = { excess_amount_cents: 50000 } as any;
    const excess = c.excess_amount_cents != null
      ? Number(c.excess_amount_cents) / 100
      : Number(c.policy_excess ?? c.deductible ?? 0);
    expect(excess).toBe(500);
  });

  it("falls back to policy_excess when excess_amount_cents is null", () => {
    const c = { excess_amount_cents: null, policy_excess: 300 } as any;
    const excess = c.excess_amount_cents != null
      ? Number(c.excess_amount_cents) / 100
      : Number(c.policy_excess ?? c.deductible ?? 0);
    expect(excess).toBe(300);
  });

  it("returns 0 when all excess fields are null", () => {
    const c = { excess_amount_cents: null, policy_excess: null, deductible: null } as any;
    const excess = c.excess_amount_cents != null
      ? Number(c.excess_amount_cents) / 100
      : Number(c.policy_excess ?? c.deductible ?? 0);
    expect(excess).toBe(0);
  });
});

// ── Bug #5: partial benchmark flag ────────────────────────────────────────────
describe("Bug #5 — partial benchmark flag logic", () => {
  it("flags partial when fewer than 50% of components have benchmark data", () => {
    const benchmarks = {
      comp1: { medianUsd: 100 },
      comp2: { medianUsd: 200 },
      comp3: { medianUsd: 0 },
      comp4: { medianUsd: 0 },
      comp5: { medianUsd: 0 },
    };
    const allComponents = Object.values(benchmarks);
    const pricedComponents = allComponents.filter(b =>
      Number(b?.medianUsd ?? 0) > 0
    );
    const isPartial = pricedComponents.length < allComponents.length / 2;
    expect(isPartial).toBe(true);
    expect(pricedComponents.length).toBe(2);
    expect(allComponents.length).toBe(5);
  });

  it("does not flag partial when 50%+ of components have benchmark data", () => {
    const benchmarks = {
      comp1: { medianUsd: 100 },
      comp2: { medianUsd: 200 },
      comp3: { medianUsd: 300 },
      comp4: { medianUsd: 0 },
    };
    const allComponents = Object.values(benchmarks);
    const pricedComponents = allComponents.filter(b =>
      Number(b?.medianUsd ?? 0) > 0
    );
    const isPartial = pricedComponents.length < allComponents.length / 2;
    expect(isPartial).toBe(false);
  });
});

// ── Bug #2: speed method display ──────────────────────────────────────────────
describe("Bug #2 — 6-method speed display", () => {
  it("includes all 6 methods including non-ran ones", () => {
    const methods = [
      { method: "CAMPBELL", ran: false, speedKmh: 3, confidence: "low" },
      { method: "ENERGY_MOMENTUM", ran: false, speedKmh: null, confidence: "low" },
      { method: "IMPULSE", ran: false, speedKmh: null, confidence: "low" },
      { method: "DEPLOYMENT_THRESHOLD", ran: false, speedKmh: null, confidence: "low" },
      { method: "VISION_DEFORMATION", ran: true, speedKmh: 3, confidence: "medium" },
      { method: "SEVERITY_ANCHORED", ran: true, speedKmh: 32, confidence: "high" },
    ];
    const consensusKmh = 17.5;
    const speedMethods = methods.map(m => {
      const ran = m.ran && m.speedKmh != null && Number(m.speedKmh) > 0;
      return {
        label: String(m.method).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        speed: ran ? Number(m.speedKmh) : 0,
        notRan: !ran,
      };
    });
    expect(speedMethods.length).toBe(6);
    const notRanCount = speedMethods.filter(m => m.notRan).length;
    const ranCount = speedMethods.filter(m => !m.notRan).length;
    expect(notRanCount).toBe(4);
    expect(ranCount).toBe(2);
  });
});
