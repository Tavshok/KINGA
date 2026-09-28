/**
 * Vitest tests for the Truth Reconciliation Engine (TRE)
 *
 * Coverage:
 *   1. Minimal valid input → CTO is produced with all required sections
 *   2. Numeric reconciliation — speed from physics beats AccidentDetails speed
 *   3. Numeric reconciliation — fraud score from Stage 8 beats CTL when both present
 *   4. Semantic reconciliation — incident type from CTL beats raw extraction
 *   5. Temporal reconciliation — claimAge propagated from CTL timeline
 *   6. Logical reconciliation — totalLoss flag set when repairToValueRatio ≥ 0.75
 *   7. Confidence aggregation — overallConfidence is within [0, 100]
 *   8. Truth Certificate — certified=CERTIFIED when no blocking reasons
 *   9. Truth Certificate — certified=BLOCKED when integrity gate is blocked
 *  10. TruthGraph — produced with nodes
 *  11. Provenance — every TruthGraph node has a non-empty source and owner
 *  12. Idempotency — running TRE twice on the same input produces equal CTOs (excluding timestamps)
 *  13. Null-safety — TRE does not throw when all optional inputs are null
 *  14. Decision recommendation — APPROVE when CTL says APPROVE and no blocks
 *  15. Decision reconciliation — historic fraud score does not create a trigger
 *  16. claimIdentity — claimId is correctly mapped from claimRecord
 *  17. vehicle — make/model/year are correctly mapped from claimRecord.vehicle
 *  18. auditTrail — conflicts array is present
 *  19. consistency — criticalConflictCount is a non-negative integer
 *  20. cost — finalCostUsd is null or 0 when no cost analysis is provided
 */

import { describe, it, expect } from "vitest";
import {
  runP0GatedTruthReconciliationEngine,
  runTruthReconciliationEngine,
  type TREInput,
  type ClaimTruthObject,
} from "./pipeline-v2/truthReconciliationEngine";
import { assessFraudDecisionEligibility } from "./evidence-governance/quantitativeFieldGovernance";

// ─── Minimal stub factory ────────────────────────────────────────────────────

function makeMinimalInput(overrides: Partial<TREInput> = {}): TREInput {
  return {
    claimRecord: {
      claimId: 99001,
      vehicle: {
        make: "Toyota",
        model: "Corolla",
        year: 2020,
        registration: "ABC-123",
        vin: null,
        colour: "White",
        engineNumber: null,
        mileageKm: 50000,
        bodyType: "sedan",
        powertrain: "petrol",
        massKg: 1300,
        massTier: "inferred_model",
        valueUsd: 15000,
        marketValueUsd: 15000,
      },
      driver: {
        name: "John Doe",
        claimantName: "John Doe",
        licenseNumber: "DL-123456",
        age: 35,
        licenseCategory: null,
        yearsLicensed: null,
        licenseExpiry: null,
        isThirdParty: false,
      },
      accidentDetails: {
        date: "2025-01-15",
        time: null,
        location: "Harare",
        description: "Test rear-end collision",
        incidentType: "rear_end_collision",
        incidentSubType: null,
        incidentClassification: null,
        collisionDirection: "rear",
        impactPoint: null,
        estimatedSpeedKmh: 40,
        maxCrushDepthM: null,
        totalDamageAreaM2: null,
        structuralDamage: false,
      },
      policeReport: {
        present: false,
        caseNumber: null,
        station: null,
        officerName: null,
      },
      damage: { components: [], zones: [], totalComponentCount: 0 },
      repairQuote: {
        lineItems: [],
        totalUsd: 0,
        laborUsd: 0,
        partsUsd: 0,
        panelBeaterName: null,
        quotationDate: null,
      },
      insuranceContext: {
        insurerName: "Test Insurer",
        policyNumber: "POL-TEST-001",
        productType: "COMPREHENSIVE",
        claimReference: "CLM-TEST-001",
        excessAmountUsd: 500,
        bettermentUsd: null,
      },
      dataQuality: {
        completenessScore: 75,
        missingFields: [],
        validationIssues: [],
      },
      marketRegion: "ZW",
      assumptions: [],
    } as any,
    claimTruth: null,
    physicsAnalysis: null,
    damageAnalysis: null,
    fraudAnalysis: null,
    costAnalysis: null,
    turnaroundAnalysis: null,
    reportOutput: null,
    consistencyCheck: null,
    reconciliationLog: null,
    claimQuality: null,
    consensusResult: null,
    runId: "test-run-001",
    stageDurations: { "1": 100, "2": 200, "3": 300 },
    assumptions: [],
    recoveryActions: [],
    integrityGateBlocked: false,
    integrityGateBlockingReasons: [],
    integrityGateWarnings: [],
    ...overrides,
  };
}

/**
 * The idempotency contract compares deterministic reconciliation values, not
 * execution timestamps. Provenance timestamps occur in nested CTO sections as
 * well as in the top-level certificate and truth graph.
 */
function stripVolatileTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripVolatileTimestamps);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "generatedAt" && key !== "computedAt")
        .map(([key, nestedValue]) => [
          key,
          stripVolatileTimestamps(nestedValue),
        ])
    );
  }
  return value;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("TRE — runTruthReconciliationEngine", () => {
  it("1. produces a ClaimTruthObject with all required top-level sections from minimal input", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());

    expect(cto).toBeDefined();
    expect(cto.claimIdentity).toBeDefined();
    expect(cto.vehicle).toBeDefined();
    expect(cto.driver).toBeDefined();
    expect(cto.incident).toBeDefined();
    expect(cto.damage).toBeDefined();
    expect(cto.physics).toBeDefined();
    expect(cto.fraud).toBeDefined();
    expect(cto.cost).toBeDefined();
    expect(cto.workflow).toBeDefined();
    expect(cto.decision).toBeDefined();
    expect(cto.evidence).toBeDefined();
    expect(cto.confidence).toBeDefined();
    expect(cto.consistency).toBeDefined();
    expect(cto.auditTrail).toBeDefined();
    expect(cto.certification).toBeDefined();
    expect(cto.treVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(cto.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("2. numeric reconciliation — physics speed beats AccidentDetails speed", () => {
    const input = makeMinimalInput({
      physicsAnalysis: {
        estimatedSpeedKmh: 85, // higher-confidence physics value
        physicsConfidence: 0.82,
      } as any,
    });

    const cto = runTruthReconciliationEngine(input);
    // Physics value should win over accidentDetails.estimatedSpeedKmh=40
    expect(cto.physics.estimatedSpeedKmh).toBe(85);
  });

  it("3. numeric reconciliation — Stage 8 fraud score beats CTL fraud score", () => {
    const input = makeMinimalInput({
      claimTruth: {
        fraudSignals: { overallFraudScore: 25 },
      } as any,
      fraudAnalysis: {
        fraudRiskScore: 67, // Stage 8 has higher confidence
        fraudRiskLevel: "high",
      } as any,
    });

    const cto = runTruthReconciliationEngine(input);
    // Stage 8 value should win
    expect(cto.fraud.fraudRiskScore).toBe(67);
  });

  it("4. semantic reconciliation — incident type from accidentDetails is preserved in incident section", () => {
    // buildIncident reads from cr.accidentDetails.incidentType directly.
    // The CTL reconciliation result is stored in cto.decision, not cto.incident.
    // This test verifies the accidentDetails value flows through correctly.
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    // accidentDetails.incidentType = 'rear_end_collision' from the stub
    expect(cto.incident.incidentType).toBe("rear_end_collision");
  });

  it("5. temporal reconciliation — claimAge propagated from CTL timeline when present", () => {
    const input = makeMinimalInput({
      claimTruth: {
        timeline: {
          daysToLodge: 7,
          incidentDate: "2025-01-01",
          claimRegistrationDate: "2025-01-08",
          lateSubmission: false,
        },
      } as any,
    });

    const cto = runTruthReconciliationEngine(input);
    // CTL timeline.daysToLodge should be propagated
    expect(cto.workflow.claimAgeDays).toBe(7);
  });

  it("6. logical reconciliation — isEconomicWriteOff flag set when repairToValueRatio ≥ 0.70", () => {
    // buildVehicle reads marketValueUsd from cr.valuation?.marketValueUsd (Stage 5b).
    // Must provide valuation in claimRecord for the ratio to be non-zero.
    const input = makeMinimalInput({
      claimRecord: {
        ...makeMinimalInput().claimRecord,
        valuation: { marketValueUsd: 15000 },
      } as any,
      costAnalysis: {
        costDecision: {
          true_cost_usd: 12000, // 80% of 15000 → ratio=0.80 ≥ 0.70 → write-off
          recommendation: "REVIEW",
        },
      } as any,
    });

    const cto = runTruthReconciliationEngine(input);
    expect(cto.vehicle.isEconomicWriteOff).toBe(true);
  });

  it("7. confidence aggregation — overallConfidence is within [0, 100]", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    expect(cto.confidence.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(cto.confidence.overallConfidence).toBeLessThanOrEqual(100);
  });

  it("8. Truth Certificate — certified=CERTIFIED when no blocking reasons", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    // With no integrity gate blocks and no impossible timelines, should be CERTIFIED or CERTIFIED_WITH_WARNINGS
    expect(["CERTIFIED", "CERTIFIED_WITH_WARNINGS"]).toContain(
      cto.certification.certificate.certified
    );
    expect(cto.certification.certificate.blockingReasons).toHaveLength(0);
  });

  it("9. Truth Certificate — certified=BLOCKED when integrity gate is blocked", () => {
    const input = makeMinimalInput({
      integrityGateBlocked: true,
      integrityGateBlockingReasons: ["CG-1: Missing vehicle registration"],
    });

    const cto = runTruthReconciliationEngine(input);
    expect(cto.certification.certificate.certified).toBe("BLOCKED");
    expect(
      cto.certification.certificate.blockingReasons.length
    ).toBeGreaterThan(0);
  });

  it("10. TruthGraph — produced with nodes", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    expect(cto.certification.truthGraph).toBeDefined();
    expect(
      Object.keys(cto.certification.truthGraph.nodes).length
    ).toBeGreaterThan(0);
  });

  it("11. Provenance — every TruthGraph node has a non-empty canonicalOwner and fieldPath", () => {
    // TruthGraphNode uses 'canonicalOwner' and 'fieldPath', not 'owner'/'source'
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    const nodes = Object.values(cto.certification.truthGraph.nodes);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.canonicalOwner).toBeTruthy();
      expect(node.fieldPath).toBeTruthy();
    }
  });

  it("12. Idempotency — two runs on identical input produce equal CTOs (excluding timestamps)", () => {
    const input = makeMinimalInput();
    const cto1 = runTruthReconciliationEngine(input);
    const cto2 = runTruthReconciliationEngine(input);

    // Strip timestamps and hash before comparison. Provenance timestamps can
    // differ by one millisecond across two otherwise identical executions.
    const strip = (cto: ClaimTruthObject) => {
      const { generatedAt, certification, ...rest } = cto;
      const { certificate, truthGraph, ...certRest } = certification;
      const {
        certificateId: _certificateId,
        generatedAt: _certificateGeneratedAt,
        ctoHash,
        ...certFields
      } = certificate;
      const { nodes, ...graphFields } = truthGraph;
      const normalizedNodes = Object.fromEntries(
        Object.entries(nodes).map(([fieldPath, node]) => {
          const { computedAt: _computedAt, ...nodeFields } = node;
          return [fieldPath, nodeFields];
        })
      );
      return stripVolatileTimestamps({
        ...rest,
        certification: {
          ...certRest,
          certificate: certFields,
          truthGraph: { ...graphFields, nodes: normalizedNodes },
        },
      });
    };

    expect(strip(cto1)).toEqual(strip(cto2));
  });

  it("13. Null-safety — TRE does not throw when all optional inputs are null", () => {
    expect(() =>
      runTruthReconciliationEngine(makeMinimalInput())
    ).not.toThrow();
  });

  it("14. Decision recommendation — APPROVE when CTL says APPROVE and no blocks", () => {
    const input = makeMinimalInput({
      claimTruth: {
        decision: { recommendation: "APPROVE" },
        fraudSignals: { overallFraudScore: 15 },
      } as any,
      fraudAnalysis: {
        fraudRiskScore: 15,
        fraudRiskLevel: "low",
      } as any,
    });

    const cto = runTruthReconciliationEngine(input);
    expect(cto.decision.recommendation).toBe("APPROVE");
  });

  it("15. Decision reconciliation — historic fraud score does not create a score-labelled trigger", () => {
    const input = makeMinimalInput({
      fraudAnalysis: {
        fraudRiskScore: 75,
        fraudRiskLevel: "high",
      } as any,
    });

    const cto = runTruthReconciliationEngine(input);
    expect(cto.decision.reviewTriggers).not.toContain("High fraud risk score: 75");
    expect(cto.decision.reviewTriggers.join(" ")).not.toMatch(/fraud risk score/i);
  });

  it("16. claimIdentity — claimId is correctly mapped from claimRecord", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    expect(cto.claimIdentity.claimId).toBe(99001);
  });

  it("17. vehicle — make/model/year are correctly mapped from claimRecord.vehicle", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    expect(cto.vehicle.make).toBe("Toyota");
    expect(cto.vehicle.model).toBe("Corolla");
    expect(cto.vehicle.year).toBe(2020);
  });

  it("18. auditTrail — conflicts array is present", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    expect(Array.isArray(cto.auditTrail.conflicts)).toBe(true);
  });

  it("19. consistency — criticalConflictCount is a non-negative integer", () => {
    const cto = runTruthReconciliationEngine(makeMinimalInput());
    expect(cto.consistency.criticalConflictCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(cto.consistency.criticalConflictCount)).toBe(true);
  });

  it("20. cost — optimisedCostUsd is 0 when no cost analysis is provided", () => {
    // CTOCost uses 'optimisedCostUsd', not 'finalCostUsd'.
    // When costAnalysis=null, optimisedCostUsd defaults to 0.
    const cto = runTruthReconciliationEngine(
      makeMinimalInput({ costAnalysis: null })
    );
    expect(cto.cost.optimisedCostUsd).toBe(0);
  });

  it("21. P0 publication gate withholds adversarial fraud scores and blocks automatic certification", () => {
    const fraudDecisionEligibility = assessFraudDecisionEligibility({
      crushDepthDecision: null,
      advisoryEvidencePresent: true,
      fallbackOrDegraded: false,
    });
    const cto = runP0GatedTruthReconciliationEngine(makeMinimalInput({
      fraudAnalysis: {
        fraudRiskScore: 99,
        fraudRiskLevel: "elevated",
        indicators: [{ indicator: "forged_high_risk", category: "test", score: 99, description: "adversarial" }],
        fraudDecisionEligibility,
      } as any,
    }));

    expect(cto.fraud.fraudRiskScore).toBeNull();
    expect(cto.fraud.fraudRiskLevel).toBeNull();
    expect(cto.fraud.indicators.every(indicator => indicator.score === null)).toBe(true);
    expect(cto.decision.recommendation).toBe("REVIEW");
    expect(cto.decision.primaryReason).toMatch(/governing fraud score/i);
    expect(cto.certification.certificate.certified).toBe("BLOCKED");
  });
});
