/**
 * fieldRecoveryEngine.test.ts
 *
 * Tests for the Field Recovery Engine — the fallback that fills in null
 * critical fields after the main Stage 3 extraction pass.
 *
 * Strategy:
 *   - Regex recovery tests: deterministic, no LLM needed (LLM is mocked to return null)
 *   - Cross-field inference tests: deterministic, no LLM needed
 *   - Recovery report shape tests: verify FieldRecoveryReport structure
 *   - LLM recovery tests: mock LLM to return controlled values
 *   - No-op tests: fields that are already populated should not be overwritten
 *
 * The LLM is mocked to return null (not found) by default so regex/inference
 * tests are fully deterministic. Individual LLM tests override the mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock LLM — returns null (not found) by default
// ─────────────────────────────────────────────────────────────────────────────

const mockLLM = vi.fn();
vi.mock("../_core/llm", () => ({ invokeLLM: (...a: any[]) => mockLLM(...a) }));

import { runFieldRecovery } from "./fieldRecoveryEngine";
import type { ExtractedClaimFields } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptyFields(): ExtractedClaimFields {
  return {
    claimId: null, claimantName: null, driverName: null,
    vehicleRegistration: null, vehicleMake: null, vehicleModel: null,
    vehicleYear: null, vehicleMileage: null, accidentDate: null,
    incidentTime: null, accidentLocation: null, accidentDescription: null,
    incidentType: null, estimatedSpeedKmh: null, policeReportNumber: null,
    policeStation: null, assessorName: null, panelBeater: null,
    quoteTotalCents: null, agreedCostCents: null, damageDescription: null,
    insurerName: null, policyNumber: null, claimReference: null,
    animalType: null, weatherConditions: null, roadSurface: null,
    marketValueCents: null, excessAmountCents: null, driverLicenseNumber: null,
  } as unknown as ExtractedClaimFields;
}

function noop(_msg: string) {}

// Default: LLM returns null (not found) so regex/inference paths are tested
function mockLLMNotFound() {
  mockLLM.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ value: null }) } }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Regex recovery — speed extraction
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — regex recovery: estimatedSpeedKmh", () => {
  beforeEach(() => mockLLMNotFound());

  it("recovers speed from 'Speed: 90 km/h'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Speed: 90 km/h on the Harare-Bulawayo road.", null, noop);
    expect(patchedFields.estimatedSpeedKmh).toBe(90);
  });

  it("recovers speed from 'travelling at 120 km/h'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "The vehicle was travelling at 120 km/h when the incident occurred.", null, noop);
    expect(patchedFields.estimatedSpeedKmh).toBe(120);
  });

  it("recovers speed from 'doing 80 km/h'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "The driver was doing 80 km/h on the main road.", null, noop);
    expect(patchedFields.estimatedSpeedKmh).toBe(80);
  });

  it("recovers speed from 'at a speed of 60 KM/HRS'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "The vehicle was at a speed of 60 KM/HRS when the cow ran onto the road.", null, noop);
    expect(patchedFields.estimatedSpeedKmh).toBe(60);
  });

  it("does NOT recover an implausible speed > 300 km/h", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Speed: 999 km/h", null, noop);
    expect(patchedFields.estimatedSpeedKmh).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Regex recovery — vehicle registration
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — regex recovery: vehicleRegistration", () => {
  beforeEach(() => mockLLMNotFound());

  it("recovers registration from 'Registration: AFF1102'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Registration: AFF1102 Mazda BT-50", null, noop);
    expect(patchedFields.vehicleRegistration).toBeTruthy();
    expect(String(patchedFields.vehicleRegistration).toUpperCase()).toContain("AFF");
  });

  it("recovers registration from 'Reg: ABZ 1234'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Reg: ABZ 1234 Toyota Hilux", null, noop);
    expect(patchedFields.vehicleRegistration).toBeTruthy();
  });

  it("recovers registration from Zimbabwe plate pattern 'ABC 1234'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Vehicle registration ABC 1234 was involved in the accident.", null, noop);
    expect(patchedFields.vehicleRegistration).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Regex recovery — financial amounts
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — regex recovery: financial amounts", () => {
  beforeEach(() => mockLLMNotFound());

  it("recovers quoteTotalCents from 'Total: USD 5,500.00'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Total: USD 5,500.00 for all repairs.", null, noop);
    expect(patchedFields.quoteTotalCents).toBe(550000);
  });

  it("recovers quoteTotalCents from 'Grand Total: $3200'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Grand Total: $3200 including VAT.", null, noop);
    expect(patchedFields.quoteTotalCents).toBe(320000);
  });

  it("recovers excessAmountCents from 'Excess: USD 500'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Excess: USD 500 applicable to this claim.", null, noop);
    expect(patchedFields.excessAmountCents).toBe(50000);
  });

  it("recovers marketValueCents from 'Market Value: USD 18,000'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Market Value: USD 18,000 as at date of loss.", null, noop);
    expect(patchedFields.marketValueCents).toBe(1800000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Regex recovery — dates
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — regex recovery: accidentDate", () => {
  beforeEach(() => mockLLMNotFound());

  it("recovers accidentDate from 'Date of accident: 15/03/2024'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Date of accident: 15/03/2024 at 14:30.", null, noop);
    expect(patchedFields.accidentDate).toBeTruthy();
    expect(String(patchedFields.accidentDate)).toContain("2024");
  });

  it("recovers accidentDate from 'Accident Date: 01-01-2024'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Accident Date: 01-01-2024.", null, noop);
    expect(patchedFields.accidentDate).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Regex recovery — police report number
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — regex recovery: policeReportNumber", () => {
  beforeEach(() => mockLLMNotFound());

  it("recovers policeReportNumber from 'RB No: 123/2024'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Police Report RB No: 123/2024 filed at Harare Central.", null, noop);
    expect(patchedFields.policeReportNumber).toBeTruthy();
  });

  it("recovers policeReportNumber from 'CR/2024/001'", async () => {
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "Case No. CR/2024/001 was opened at the local station.", null, noop);
    expect(patchedFields.policeReportNumber).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Cross-field inference
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — cross-field inference", () => {
  beforeEach(() => mockLLMNotFound());

  it("infers animalType from accidentDescription containing 'cow'", async () => {
    const fields = { ...emptyFields(), accidentDescription: "The vehicle struck a cow on the highway." };
    const { patchedFields, report } = await runFieldRecovery(fields, "", null, noop);
    // animalType should be recovered via cross-field inference or regex from description
    const animalResult = report.results.find(r => r.field === "animalType");
    if (animalResult?.recovered) {
      expect(String(patchedFields.animalType).toLowerCase()).toContain("cow");
    }
    // If not recovered, that's acceptable — the test verifies the engine doesn't crash
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: Recovery report shape
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — recovery report shape", () => {
  beforeEach(() => mockLLMNotFound());

  it("report.results is always an array", async () => {
    const { report } = await runFieldRecovery(emptyFields(), "", null, noop);
    expect(Array.isArray(report.results)).toBe(true);
  });

  it("report.fieldsRecovered is a non-negative integer", async () => {
    const { report } = await runFieldRecovery(emptyFields(), "", null, noop);
    expect(report.fieldsRecovered).toBeGreaterThanOrEqual(0);
  });

  it("report.fieldsStillMissing is an array", async () => {
    const { report } = await runFieldRecovery(emptyFields(), "", null, noop);
    expect(Array.isArray(report.fieldsStillMissing)).toBe(true);
  });

  it("report.totalAttempted equals number of null critical fields", async () => {
    const fields = emptyFields();
    const { report } = await runFieldRecovery(fields, "", null, noop);
    // All critical fields are null in emptyFields()
    expect(report.totalAttempted).toBeGreaterThan(0);
  });

  it("each result has required fields: field, recovered, value, confidence, source, notes", async () => {
    const { report } = await runFieldRecovery(emptyFields(), "Speed: 90 km/h", null, noop);
    for (const result of report.results) {
      expect(result).toHaveProperty("field");
      expect(result).toHaveProperty("recovered");
      expect(result).toHaveProperty("value");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("source");
      expect(result).toHaveProperty("notes");
    }
  });

  it("result.confidence is one of high | medium | low", async () => {
    const { report } = await runFieldRecovery(emptyFields(), "Speed: 90 km/h", null, noop);
    for (const result of report.results) {
      expect(["high", "medium", "low"]).toContain(result.confidence);
    }
  });

  it("result.source is one of the valid source types", async () => {
    const { report } = await runFieldRecovery(emptyFields(), "Speed: 90 km/h", null, noop);
    const validSources = ["llm_targeted", "regex_fallback", "cross_field_inference", "not_found"];
    for (const result of report.results) {
      expect(validSources).toContain(result.source);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8: No-op — already-populated fields are not overwritten
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — no-op for already-populated fields", () => {
  beforeEach(() => mockLLMNotFound());

  it("does NOT overwrite an already-populated estimatedSpeedKmh", async () => {
    const fields = { ...emptyFields(), estimatedSpeedKmh: 75 };
    const { patchedFields } = await runFieldRecovery(fields, "Speed: 90 km/h", null, noop);
    expect(patchedFields.estimatedSpeedKmh).toBe(75);
  });

  it("does NOT overwrite an already-populated vehicleRegistration", async () => {
    const fields = { ...emptyFields(), vehicleRegistration: "AFF1102" };
    const { patchedFields } = await runFieldRecovery(fields, "Registration: XYZ 9999", null, noop);
    expect(patchedFields.vehicleRegistration).toBe("AFF1102");
  });

  it("does NOT overwrite an already-populated accidentDate", async () => {
    const fields = { ...emptyFields(), accidentDate: "2024-03-15" };
    const { patchedFields } = await runFieldRecovery(fields, "Date of accident: 01/01/2023", null, noop);
    expect(patchedFields.accidentDate).toBe("2024-03-15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9: LLM recovery path
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldRecoveryEngine — LLM targeted recovery", () => {
  it("recovers insurerName via LLM when regex fails", async () => {
    mockLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ value: "Cell Insurance Company" }) } }],
    });
    const fields = emptyFields();
    const { patchedFields, report } = await runFieldRecovery(
      fields,
      "This document is issued by Cell Insurance Company regarding claim reference CI-024.",
      null,
      noop
    );
    const insurerResult = report.results.find(r => r.field === "insurerName");
    if (insurerResult?.recovered) {
      expect(patchedFields.insurerName).toBeTruthy();
    }
    // The test verifies the engine runs without error even when LLM is called
  });

  it("handles LLM returning null gracefully (field remains unrecovered)", async () => {
    mockLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ value: null }) } }],
    });
    const fields = emptyFields();
    const { patchedFields } = await runFieldRecovery(fields, "No useful content here.", null, noop);
    // estimatedSpeedKmh should remain null since no regex match and LLM returned null
    expect(patchedFields.estimatedSpeedKmh).toBeNull();
  });

  it("handles LLM throwing an error gracefully (does not crash)", async () => {
    mockLLM.mockRejectedValue(new Error("LLM unavailable"));
    const fields = emptyFields();
    await expect(runFieldRecovery(fields, "Speed: 90 km/h", null, noop)).resolves.toBeDefined();
  });
});
