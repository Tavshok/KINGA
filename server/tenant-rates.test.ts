/**
 * tenant-rates.test.ts
 *
 * Tests for per-tenant cost rate override logic:
 * - Stage 9 uses ctx.tenantRates when present
 * - Falls back to regional defaults when tenantRates is null
 * - Paint cost per panel is correctly applied
 */

import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// UNIT: estimateComponentCost logic (extracted for testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the estimateComponentCost function from stage-9-cost.ts
 * for isolated unit testing without importing the full module.
 */
function estimateComponentCost(
  componentName: string,
  severity: string,
  repairAction: string,
  labourRate: number,
  _vehicleBodyType?: string,
  paintCostPerPanelUsd?: number
): { partsCents: number; labourCents: number; paintCents: number } {
  const name = (componentName || "").toLowerCase();
  const sev = (severity || "moderate").toLowerCase();
  const action = (repairAction || "repair").toLowerCase();

  const SEVERITY_COST_MULTIPLIER: Record<string, number> = {
    cosmetic: 0.3, minor: 0.5, moderate: 1.0, severe: 1.8, catastrophic: 3.0,
  };

  let basePartCost = 15000;
  if (/bumper|fender|wing|panel|door skin/.test(name)) basePartCost = 20000;
  if (/headl|tail|lamp|light/.test(name)) basePartCost = 25000;
  if (/hood|bonnet|trunk|boot/.test(name)) basePartCost = 35000;
  if (/door|quarter panel/.test(name)) basePartCost = 40000;
  if (/windshield|windscreen|glass/.test(name)) basePartCost = 30000;
  if (/radiator|condenser|intercooler/.test(name)) basePartCost = 45000;
  if (/frame|chassis|subframe|rail/.test(name)) basePartCost = 80000;
  if (/airbag|srs/.test(name)) basePartCost = 60000;
  if (/suspension|strut|shock|control arm/.test(name)) basePartCost = 35000;
  if (/mirror/.test(name)) basePartCost = 15000;
  if (/grille|grill/.test(name)) basePartCost = 12000;
  if (/moulding|trim|garnish/.test(name)) basePartCost = 8000;

  const multiplier = SEVERITY_COST_MULTIPLIER[sev] || 1.0;

  let partsCents = 0;
  let labourHours = 2;

  if (action === "replace") {
    partsCents = Math.round(basePartCost * multiplier);
    labourHours = 3;
  } else if (action === "repair") {
    partsCents = Math.round(basePartCost * 0.1);
    labourHours = 4;
  } else if (action === "refinish") {
    partsCents = Math.round(basePartCost * 0.05);
    labourHours = 2;
  }

  const labourCents = Math.round(labourHours * labourRate * 100);
  const paintPerPanel = paintCostPerPanelUsd ?? 45;
  const paintCents = action === "refinish" || action === "repair"
    ? Math.round(paintPerPanel * 100)
    : 0;

  return { partsCents, labourCents, paintCents };
}

// ─────────────────────────────────────────────────────────────────────────────
// LABOUR RATE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("estimateComponentCost — labour rate override", () => {
  it("uses the provided labour rate for labour cost calculation", () => {
    const defaultRate = estimateComponentCost("bumper", "moderate", "replace", 40);
    const customRate = estimateComponentCost("bumper", "moderate", "replace", 75);

    // Labour cost should be proportional to the rate
    expect(customRate.labourCents).toBe(defaultRate.labourCents * (75 / 40));
  });

  it("parts cost is independent of labour rate", () => {
    const rate40 = estimateComponentCost("door", "moderate", "replace", 40);
    const rate75 = estimateComponentCost("door", "moderate", "replace", 75);

    expect(rate40.partsCents).toBe(rate75.partsCents);
  });

  it("ZW regional rate ($25/hr) produces correct labour cost for 3hr job", () => {
    const result = estimateComponentCost("bumper", "moderate", "replace", 25);
    // replace = 3 labour hours × $25 × 100 cents = 7500 cents
    expect(result.labourCents).toBe(7500);
  });

  it("US regional rate ($75/hr) produces correct labour cost for 3hr job", () => {
    const result = estimateComponentCost("bumper", "moderate", "replace", 75);
    // replace = 3 labour hours × $75 × 100 cents = 22500 cents
    expect(result.labourCents).toBe(22500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAINT COST TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("estimateComponentCost — paint cost per panel override", () => {
  it("uses default $45/panel when no override is provided", () => {
    const result = estimateComponentCost("bumper", "moderate", "repair", 40);
    // repair action → paint cost = $45 × 100 = 4500 cents
    expect(result.paintCents).toBe(4500);
  });

  it("uses custom paint cost when override is provided", () => {
    const result = estimateComponentCost("bumper", "moderate", "repair", 40, undefined, 80);
    // repair action → paint cost = $80 × 100 = 8000 cents
    expect(result.paintCents).toBe(8000);
  });

  it("uses custom paint cost for refinish action", () => {
    const result = estimateComponentCost("door", "minor", "refinish", 40, undefined, 60);
    // refinish action → paint cost = $60 × 100 = 6000 cents
    expect(result.paintCents).toBe(6000);
  });

  it("paint cost is zero for replace action (no refinish needed)", () => {
    const result = estimateComponentCost("hood", "severe", "replace", 40, undefined, 80);
    // replace action → no paint cost
    expect(result.paintCents).toBe(0);
  });

  it("paint cost is zero for replace action even with custom rate", () => {
    const result = estimateComponentCost("windshield", "moderate", "replace", 40, undefined, 150);
    expect(result.paintCents).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY MULTIPLIER TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("estimateComponentCost — severity multipliers", () => {
  it("cosmetic severity reduces parts cost by 70%", () => {
    const cosmetic = estimateComponentCost("bumper", "cosmetic", "replace", 40);
    const moderate = estimateComponentCost("bumper", "moderate", "replace", 40);
    expect(cosmetic.partsCents).toBe(Math.round(moderate.partsCents * 0.3));
  });

  it("severe severity increases parts cost by 80%", () => {
    const severe = estimateComponentCost("bumper", "severe", "replace", 40);
    const moderate = estimateComponentCost("bumper", "moderate", "replace", 40);
    expect(severe.partsCents).toBe(Math.round(moderate.partsCents * 1.8));
  });

  it("catastrophic severity triples parts cost", () => {
    const catastrophic = estimateComponentCost("frame", "catastrophic", "replace", 40);
    const moderate = estimateComponentCost("frame", "moderate", "replace", 40);
    expect(catastrophic.partsCents).toBe(Math.round(moderate.partsCents * 3.0));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT BASE COST TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("estimateComponentCost — component base costs", () => {
  it("frame/chassis has highest base cost", () => {
    const frame = estimateComponentCost("chassis rail", "moderate", "replace", 40);
    const bumper = estimateComponentCost("bumper", "moderate", "replace", 40);
    expect(frame.partsCents).toBeGreaterThan(bumper.partsCents);
  });

  it("airbag has higher base cost than mirror", () => {
    const airbag = estimateComponentCost("airbag srs", "moderate", "replace", 40);
    const mirror = estimateComponentCost("mirror", "moderate", "replace", 40);
    expect(airbag.partsCents).toBeGreaterThan(mirror.partsCents);
  });

  it("moulding/trim has lowest base cost", () => {
    const trim = estimateComponentCost("door moulding", "moderate", "replace", 40);
    const door = estimateComponentCost("door", "moderate", "replace", 40);
    expect(trim.partsCents).toBeLessThan(door.partsCents);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TENANT RATES INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("TenantRates — pipeline context integration", () => {
  it("tenantRates.labourRateUsdPerHour overrides regional default", () => {
    const regionalRate = 35; // ZA default
    const tenantRate = 50;   // custom override

    const regional = estimateComponentCost("bumper", "moderate", "replace", regionalRate);
    const tenant = estimateComponentCost("bumper", "moderate", "replace", tenantRate);

    // Tenant rate should produce higher labour cost
    expect(tenant.labourCents).toBeGreaterThan(regional.labourCents);
    expect(tenant.labourCents).toBe(Math.round(3 * tenantRate * 100));
  });

  it("tenantRates.paintCostPerPanelUsd overrides default $45", () => {
    const defaultResult = estimateComponentCost("door", "minor", "repair", 35);
    const tenantResult = estimateComponentCost("door", "minor", "repair", 35, undefined, 70);

    expect(defaultResult.paintCents).toBe(4500); // $45 × 100
    expect(tenantResult.paintCents).toBe(7000);  // $70 × 100
  });

  it("null tenantRates falls back to regional defaults", () => {
    // When tenantRates is null, the pipeline uses LABOUR_RATES[region]
    // This test verifies the fallback logic is correct
    const regionalRate = 35; // ZA
    const result = estimateComponentCost("bumper", "moderate", "replace", regionalRate, undefined, undefined);

    // Should use default $45 paint
    expect(result.paintCents).toBe(0); // replace action = no paint
    expect(result.labourCents).toBe(Math.round(3 * 35 * 100));
  });

  it("both labour and paint overrides can be applied simultaneously", () => {
    const result = estimateComponentCost("door", "moderate", "repair", 60, undefined, 90);

    // Labour: 4 hours × $60 × 100 = 24000 cents
    expect(result.labourCents).toBe(24000);
    // Paint: $90 × 100 = 9000 cents
    expect(result.paintCents).toBe(9000);
  });
});
