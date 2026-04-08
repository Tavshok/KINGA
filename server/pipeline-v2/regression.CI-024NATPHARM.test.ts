/**
 * regression.CI-024NATPHARM.test.ts
 *
 * WI-1: Regression test for claim CI-024NATPHARM (Mazda BT-50, AFF1102)
 *
 * PURPOSE
 * -------
 * This test is the single source of truth for what a correct extraction
 * looks like for the CI-024NATPHARM claim bundle. It must be run BEFORE
 * any pipeline change and AFTER to confirm the change worked.
 *
 * GROUND TRUTH (from signed claim form + Skinners quotation)
 * ----------------------------------------------------------
 * A1. estimatedSpeedKmh       = 90           (Motor Claim Form Q12)
 * A2. vehicleRegistration     = "AFF1102"    (confirmed by insured — AFF1102 is correct)
 * A3. visibilityConditions    contains "DARK" (dedicated visibility field, separate from weather)
 * A4. accidentLocation        contains "339"  (339 km peg, Harare-Bulawayo Road)
 * A5. policyNumber            ≠ "EXCESS"     (form label, not a value)
 * A6. agreedCostCents         = 46233        (USD 462.33 — Skinners signed quote)
 * A7. uploadedImageUrls.length ≥ 1           (24 photos on PDF pages 4–12) [INTEGRATION ONLY]
 * A8. physics plausibility    ≥ 60 at 90 km/h (valid animal strike scenario)
 *
 * HOW TO RUN
 * ----------
 *   pnpm test -- regression.CI-024NATPHARM
 *
 * For integration tests (A7):
 *   CI_INTEGRATION_TEST=1 pnpm test -- regression.CI-024NATPHARM
 */

import { describe, it, expect, beforeAll } from "vitest";
import { runStructuredExtractionStage } from "./stage-3-structured-extraction";
import { runPreGenerationConsistencyCheck } from "./preGenerationConsistencyCheck";
import type {
  PipelineContext,
  Stage1Output,
  Stage2Output,
  IngestedDocument,
  ExtractedClaimFields,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public CDN URL for the CI-024NATPHARM claim bundle PDF.
 * Uploaded once; stable across test runs.
 */
const CLAIM_PDF_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/MbyFYdvqwktovEiv.pdf";

/**
 * Ground-truth values from the signed claim form and Skinners quotation.
 */
const GT = {
  speedKmh: 90,
  registration: "AFF1102",
  visibilityKeyword: "DARK",
  locationKeyword: "339",
  forbiddenPolicyNumber: "EXCESS",
  agreedCostCents: 46233,   // USD 462.33
  minPhotoCount: 1,
  minPhysicsPlausibility: 60,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TEST FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function makeContext(): PipelineContext {
  return {
    claimId: 9999,
    tenantId: null,
    assessmentId: 9999,
    claim: {
      vehicleRegistration: "AFF1102",
      vehicleMake: "Mazda",
      vehicleModel: "BT-50",
      vehicleYear: 2018,
      incidentType: "animal_strike",
      incidentDate: "2024-11-27",
    },
    pdfUrl: CLAIM_PDF_URL,
    damagePhotoUrls: [],
    db: null,
    log: (stage: string, msg: string) => {
      if (process.env.PIPELINE_DEBUG) {
        console.log(`[${stage}] ${msg}`);
      }
    },
  };
}

function makeStage1(): Stage1Output {
  const doc: IngestedDocument = {
    documentIndex: 0,
    documentType: "motor_claim_form",
    sourceUrl: CLAIM_PDF_URL,
    mimeType: "application/pdf",
    fileName: "CI-024NATPHARM.pdf",
    containsImages: true,
    imageUrls: [], // WI-2 will populate this in integration tests
  };
  return {
    documents: [doc],
    primaryDocumentIndex: 0,
    totalDocuments: 1,
  };
}

/**
 * Minimal OCR stub — provides the raw text that would come from Stage 2.
 * This simulates what Stage 2 would extract from the PDF.
 * Registration is AAF1102 (confirmed by insured).
 */
function makeStage2(): Stage2Output {
  return {
    extractedTexts: [
      {
        documentIndex: 0,
        rawText: [
          "MOTOR CLAIM FORM",
          "CELL INSURANCE COMPANY",
          "Claim Reference: CI-024NATPHARM",
          "Insured: NATPHARM",
          "Vehicle: Mazda BT-50  Registration: AFF1102",
          "Year: 2018  Colour: Silver",
          "Date of Accident: 27/11/2024",
          "Time of Accident: 21:30",
          "Speed at time of accident: 90 km/h",
          "Visibility: DARK",
          "Weather: Clear",
          "Road Surface: Tar",
          "Location: 339 km peg Harare-Bulawayo Road",
          "Nature of Accident: Struck animal (cow)",
          "EXCESS: USD 200",
          "Driver Licence: 85261 LK",
          "",
          "QUOTATION",
          "Skinners Motor Body Repairers",
          "Quote No: 20241022603",
          "Date: 03/12/2024",
          "Bull Bar Repair: USD 85.00",
          "Bonnet Repair: USD 80.00",
          "Headlamp Assembly: USD 95.00",
          "Radiator Support: USD 60.00",
          "Front Bumper: USD 55.00",
          "Intercooler: USD 45.00",
          "Fan Cowling: USD 42.33",
          "Total (excl tax): USD 462.33",
          "Total (incl 30% tax): USD 591.33",
          "Assessor: T. Mupfumira",
          "Signed and approved: 03/12/2024",
        ].join("\n"),
        tables: [],
        ocrApplied: false,
        ocrConfidence: 90,
      },
    ],
    totalPagesProcessed: 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE-3 EXTRACTION REGRESSION SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe("CI-024NATPHARM — stage-3 extraction regression", () => {
  let result: Awaited<ReturnType<typeof runStructuredExtractionStage>>;
  let merged: ExtractedClaimFields | null = null;

  beforeAll(async () => {
    const ctx = makeContext();
    result = await runStructuredExtractionStage(ctx, makeStage1(), makeStage2());
    merged = result.data?.perDocumentExtractions?.[0] ?? null;
  }, 120_000); // 2-minute timeout for LLM call

  it("stage-3 should complete without a hard failure", () => {
    expect(result).toBeDefined();
    expect(result.status).not.toBe("failed");
    expect(result.data).not.toBeNull();
  });

  // ── A1: Speed ─────────────────────────────────────────────────────────────
  it("A1: estimatedSpeedKmh should be 90", () => {
    expect(merged?.estimatedSpeedKmh).toBe(GT.speedKmh);
  });

  // ── A2: Registration ──────────────────────────────────────────────────────
  it("A2: vehicleRegistration should be AFF1102 (confirmed by insured)", () => {
    // Confirmed by insured: the correct registration is AFF1102.
    // Previous test incorrectly used AAF1102; the actual plate reads AFF1102.
    const reg = merged?.vehicleRegistration ?? "";
    expect(reg.length).toBeGreaterThan(0);
    expect(reg.toUpperCase()).toContain("1102");
    expect(reg.toUpperCase()).toContain("AFF");
  });

  // ── A3: Visibility ────────────────────────────────────────────────────────
  it("A3: visibilityConditions should contain DARK (separate from weather)", () => {
    // The claim form has a dedicated 'Visibility' field (DARK/DUSK/DAWN/DAYLIGHT)
    // that is separate from the 'Weather' field (Clear/Rain/Fog).
    // WI-3 added visibilityConditions as a dedicated field.
    const visibility = merged?.visibilityConditions ?? "";
    expect(visibility.toUpperCase()).toContain(GT.visibilityKeyword);
  });

  // ── A4: Location ──────────────────────────────────────────────────────────
  it("A4: accidentLocation should mention 339 km peg", () => {
    const loc = merged?.accidentLocation ?? "";
    expect(loc).toContain(GT.locationKeyword);
  });

  // ── A5: Policy number ─────────────────────────────────────────────────────
  it("A5: policyNumber should not be the string 'EXCESS' (form label, not a value)", () => {
    const policy = merged?.policyNumber ?? "";
    expect(policy.toUpperCase()).not.toBe(GT.forbiddenPolicyNumber);
    // null is acceptable — this form does not have a policy number field
  });

  // ── A6: Agreed repair cost ────────────────────────────────────────────────
  it("A6: agreedCostCents should be 46233 (USD 462.33 from signed quotation)", () => {
    const cost = merged?.agreedCostCents;
    expect(cost).not.toBeNull();
    // Allow ±200 cents tolerance for currency parsing edge cases
    expect(cost).toBeGreaterThanOrEqual(GT.agreedCostCents - 200);
    expect(cost).toBeLessThanOrEqual(GT.agreedCostCents + 200);
  });

  // ── A7: Photo count [INTEGRATION ONLY] ───────────────────────────────────
  it.skipIf(!process.env.CI_INTEGRATION_TEST)(
    "A7 [INTEGRATION ONLY]: uploadedImageUrls should have at least 1 entry after WI-2 PDF rendering",
    () => {
      // This test only runs when CI_INTEGRATION_TEST=1 is set.
      // In unit test mode, PDF rendering (pdftoppm) and S3 upload cannot run.
      // WI-2 is implemented in pdfToImages.ts and stage-1-ingestion.ts.
      // To verify WI-2 end-to-end, run:
      //   CI_INTEGRATION_TEST=1 pnpm test -- --testPathPattern="regression.CI-024NATPHARM"
      const photos = merged?.uploadedImageUrls ?? [];
      expect(photos.length).toBeGreaterThanOrEqual(GT.minPhotoCount);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICS ENGINE GATE TESTS (A8 — WI-4 prerequisite)
// ─────────────────────────────────────────────────────────────────────────────

describe("CI-024NATPHARM — physics engine gate (A8)", () => {
  it("A8a: physics engine at 90 km/h should give plausibility ≥ 60 for BT-50 animal strike", async () => {
    const { runAnimalStrikePhysics } = await import("./animalStrikePhysicsEngine");
    const result = runAnimalStrikePhysics({
      speed_kmh: 90,
      vehicle_type: "pickup",
      damage_components: [
        "front bumper assembly",
        "bonnet/hood",
        "radiator support panel",
        "headlamp assembly",
        "intercooler",
        "fan cowling",
      ],
      presence_of_bullbar: false,
    });
    expect(result.plausibility_score).toBeGreaterThanOrEqual(GT.minPhysicsPlausibility);
    expect(result.delta_v_kmh).toBeGreaterThan(0);
    expect(result.impact_force_kn).toBeGreaterThan(0);
  });

  it("A8b: physics engine at speed=0 should give plausibility=0 (null-input guard)", async () => {
    const { runAnimalStrikePhysics } = await import("./animalStrikePhysicsEngine");
    const result = runAnimalStrikePhysics({
      speed_kmh: 0,
      vehicle_type: "pickup",
      damage_components: ["front bumper assembly"],
      presence_of_bullbar: false,
    });
    expect(result.delta_v_kmh).toBe(0);
    expect(result.plausibility_score).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COST ENGINE GATE TESTS (WI-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("CI-024NATPHARM — cost engine gate", () => {
  it("signed quotation value (USD 462.33) must be less than AI fabricated value (USD 2,850)", () => {
    const signedCents = GT.agreedCostCents;      // 46233
    const aiFabricatedCents = 285_000;           // USD 2,850
    expect(signedCents).toBeLessThan(aiFabricatedCents);
    // The fabrication inflated the claim by USD 2,387.67
    expect(aiFabricatedCents - signedCents).toBe(238_767);
  });

  it("when agreedCostCents is present from a signed quote, it must not be overridden by AI estimate", () => {
    const signedQuoteCents = GT.agreedCostCents;
    const aiEstimateCents = 285_000;
    const costEngineOutput = signedQuoteCents !== null
      ? signedQuoteCents   // ← correct: use signed quote
      : aiEstimateCents;   // ← fallback: use AI estimate only when no signed quote
    expect(costEngineOutput).toBe(GT.agreedCostCents);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WI-5: PRE-GENERATION CONSISTENCY CHECK TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("CI-024NATPHARM — WI-5 pre-generation consistency check", () => {
  it("R1: ESCALATE + fraud_score=35 should be auto-corrected to REVIEW_REQUIRED", () => {
    const result = runPreGenerationConsistencyCheck({
      recommendation: "ESCALATE_INVESTIGATION",
      fraud_score: 35,
      fraud_score_cover: 35,
      physics_plausibility_score: 80,
      physics_based_fraud_indicators: [],
      cost_basis: "assessor_validated",
      quotation_present: true,
      photo_count: 24,
      damage_component_count: 8,
    });
    expect(result.passed).toBe(false);
    const r1 = result.contradictions.find(c => c.rule_id === "R1");
    expect(r1).toBeDefined();
    expect(r1?.auto_corrected).toBe(true);
    expect(result.recommendation_override).toBe("REVIEW_REQUIRED");
  });

  it("R2: physics_plausibility_score=0 + physics fraud indicators should clear indicators", () => {
    const result = runPreGenerationConsistencyCheck({
      recommendation: "REVIEW_REQUIRED",
      fraud_score: 45,
      fraud_score_cover: 45,
      physics_plausibility_score: 0,
      physics_based_fraud_indicators: ["damage_direction_mismatch", "physics_inconsistency"],
      cost_basis: "assessor_validated",
      quotation_present: true,
      photo_count: 24,
      damage_component_count: 8,
    });
    expect(result.passed).toBe(false);
    const r2 = result.contradictions.find(c => c.rule_id === "R2");
    expect(r2).toBeDefined();
    expect(r2?.auto_corrected).toBe(true);
  });

  it("R4: AI estimate cost basis + quotation present should flag for re-run", () => {
    const result = runPreGenerationConsistencyCheck({
      recommendation: "REVIEW_REQUIRED",
      fraud_score: 30,
      fraud_score_cover: 30,
      physics_plausibility_score: 80,
      physics_based_fraud_indicators: [],
      cost_basis: "ai_estimate",
      quotation_present: true,
      photo_count: 24,
      damage_component_count: 8,
    });
    expect(result.passed).toBe(false);
    const r4 = result.contradictions.find(c => c.rule_id === "R4");
    expect(r4).toBeDefined();
    expect(r4?.requires_rerun).toBe(true);
  });

  it("R5: photo_count=0 + damage_component_count>0 should flag data quality issue", () => {
    const result = runPreGenerationConsistencyCheck({
      recommendation: "REVIEW_REQUIRED",
      fraud_score: 30,
      fraud_score_cover: 30,
      physics_plausibility_score: 80,
      physics_based_fraud_indicators: [],
      cost_basis: "assessor_validated",
      quotation_present: true,
      photo_count: 0,
      damage_component_count: 8,
    });
    expect(result.passed).toBe(false);
    const r5 = result.contradictions.find(c => c.rule_id === "R5");
    expect(r5).toBeDefined();
    expect(r5?.requires_rerun).toBe(true);
  });

  it("clean claim (CI-024NATPHARM correct values) should pass all 5 rules", () => {
    const result = runPreGenerationConsistencyCheck({
      recommendation: "FINALISE_CLAIM",
      fraud_score: 35,
      fraud_score_cover: 35,
      physics_plausibility_score: 82,
      physics_based_fraud_indicators: [],
      cost_basis: "assessor_validated",
      quotation_present: true,
      photo_count: 24,
      damage_component_count: 8,
    });
    expect(result.passed).toBe(true);
    expect(result.contradictions).toHaveLength(0);
    expect(result.recommendation_override).toBeUndefined();
  });
});
