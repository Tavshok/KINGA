/**
 * Tests for the KINGA Impossibility Detection Engine
 */
import { describe, it, expect } from "vitest";
import {
  detectImpossibilities,
  impossibilityFraudPoints,
  impossibilitySummary,
} from "./services/impossibilityDetector";

// ── T1: Vehicle pre-existence ────────────────────────────────────────────────
describe("T1 — Vehicle pre-existence", () => {
  it("fires when incident year < vehicle year", () => {
    const flags = detectImpossibilities({
      incidentDate: "2013-05-15",
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].code).toBe("T1");
    expect(flags[0].severity).toBe("CRITICAL");
    expect(flags[0].fraudPoints).toBe(35);
  });

  it("does NOT fire when incident year === vehicle year", () => {
    const flags = detectImpossibilities({
      incidentDate: "2020-01-01",
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "T1")).toBeUndefined();
  });

  it("does NOT fire when incident year > vehicle year", () => {
    const flags = detectImpossibilities({
      incidentDate: "2023-05-15",
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "T1")).toBeUndefined();
  });

  it("does NOT fire when incidentDate is null", () => {
    const flags = detectImpossibilities({
      incidentDate: null,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "T1")).toBeUndefined();
  });
});

// ── T2: Future incident date ─────────────────────────────────────────────────
describe("T2 — Future incident date", () => {
  it("fires when incident date is 30 days in the future", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const flags = detectImpossibilities({
      incidentDate: future,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "T2")).toBeDefined();
  });

  it("does NOT fire for today's date", () => {
    const today = new Date().toISOString().split("T")[0];
    const flags = detectImpossibilities({
      incidentDate: today,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "T2")).toBeUndefined();
  });
});

// ── T3: Claim submitted before incident ──────────────────────────────────────
describe("T3 — Claim submitted before incident", () => {
  it("fires when submission is 3 days before incident", () => {
    const incidentDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const submittedAt = Date.now();
    const flags = detectImpossibilities({
      incidentDate,
      vehicleYear: 2020,
      submittedAt,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "T3")).toBeDefined();
  });

  it("does NOT fire when submission is after incident", () => {
    const incidentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const submittedAt = Date.now();
    const flags = detectImpossibilities({
      incidentDate,
      vehicleYear: 2020,
      submittedAt,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "T3")).toBeUndefined();
  });
});

// ── P2: Odometer impossibility ───────────────────────────────────────────────
describe("P2 — Odometer impossibility", () => {
  it("fires for 1,200,000 km on a 3-year-old vehicle (400k/yr)", () => {
    const vehicleYear = new Date().getFullYear() - 3;
    const flags = detectImpossibilities({
      incidentDate: null,
      vehicleYear,
      submittedAt: null,
      vehicleMileageKm: 1_200_000,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "P2")).toBeDefined();
  });

  it("does NOT fire for 150,000 km on a 3-year-old vehicle (50k/yr)", () => {
    const vehicleYear = new Date().getFullYear() - 3;
    const flags = detectImpossibilities({
      incidentDate: null,
      vehicleYear,
      submittedAt: null,
      vehicleMileageKm: 150_000,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "P2")).toBeUndefined();
  });
});

// ── P3: Repair cost exceeds 150% market value ────────────────────────────────
describe("P3 — Repair cost exceeds market value × 1.5", () => {
  it("fires when repair cost is 200% of market value", () => {
    const flags = detectImpossibilities({
      incidentDate: null,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: 40_000,
      vehicleMarketValue: 20_000,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "P3")).toBeDefined();
  });

  it("does NOT fire when repair cost is 120% of market value (total loss territory but not impossible)", () => {
    const flags = detectImpossibilities({
      incidentDate: null,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: 24_000,
      vehicleMarketValue: 20_000,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "P3")).toBeUndefined();
  });

  it("does NOT fire when market value is 0 (no market value data)", () => {
    const flags = detectImpossibilities({
      incidentDate: null,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: 50_000,
      vehicleMarketValue: 0,
      vehicleRegistration: null,
    });
    expect(flags.find((f) => f.code === "P3")).toBeUndefined();
  });
});

// ── I2: Duplicate registration + date window ─────────────────────────────────
describe("I2 — Duplicate registration within 7 days", () => {
  it("fires when another claim for same registration is 3 days apart", () => {
    const baseDate = "2024-06-15";
    const nearDate = "2024-06-12"; // 3 days before
    const flags = detectImpossibilities({
      incidentDate: baseDate,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: "ABC-1234",
      otherClaimsForRegistration: [
        { claimId: 99, claimNumber: "CLM-ABCDE12345", incidentDate: nearDate },
      ],
    });
    expect(flags.find((f) => f.code === "I2")).toBeDefined();
  });

  it("does NOT fire when other claim is 30 days apart", () => {
    const baseDate = "2024-06-15";
    const farDate = "2024-05-15"; // 31 days before
    const flags = detectImpossibilities({
      incidentDate: baseDate,
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: "ABC-1234",
      otherClaimsForRegistration: [
        { claimId: 99, claimNumber: "CLM-ABCDE12345", incidentDate: farDate },
      ],
    });
    expect(flags.find((f) => f.code === "I2")).toBeUndefined();
  });
});

// ── Fraud points cap ─────────────────────────────────────────────────────────
describe("impossibilityFraudPoints", () => {
  it("caps at 60 even when multiple flags fire", () => {
    const flags = detectImpossibilities({
      incidentDate: "2013-05-15",
      vehicleYear: 2020,
      submittedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // submitted 10 days ago, incident 7 years before vehicle
      vehicleMileageKm: 2_000_000,
      quotedRepairCost: 100_000,
      vehicleMarketValue: 10_000,
      vehicleRegistration: "ABC-1234",
      otherClaimsForRegistration: [
        { claimId: 99, claimNumber: "CLM-ABCDE12345", incidentDate: "2013-05-14" },
      ],
    });
    const points = impossibilityFraudPoints(flags);
    expect(points).toBeLessThanOrEqual(60);
  });
});

// ── Summary ──────────────────────────────────────────────────────────────────
describe("impossibilitySummary", () => {
  it("returns clean message when no flags", () => {
    const summary = impossibilitySummary([]);
    expect(summary).toContain("No logical");
  });

  it("includes all flag codes when flags present", () => {
    const flags = detectImpossibilities({
      incidentDate: "2013-05-15",
      vehicleYear: 2020,
      submittedAt: null,
      vehicleMileageKm: null,
      quotedRepairCost: null,
      vehicleMarketValue: null,
      vehicleRegistration: null,
    });
    const summary = impossibilitySummary(flags);
    expect(summary).toContain("T1");
  });
});
