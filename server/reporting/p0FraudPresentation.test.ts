import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildP0B1FraudAbstentionText,
  redactP0B1FraudReportPayload,
  renderP0B1FraudAbstentionMarker,
} from "./p0FraudPresentation";
import {
  generateAssessmentReportHTML,
  toAssessmentPdfCanonicalInput,
} from "../pdf-export";

describe("P0-B1 fraud presentation boundary", () => {
  it("renders actionable HTML and plaintext abstentions instead of score or risk evidence", () => {
    const html = renderP0B1FraudAbstentionMarker();
    const text = buildP0B1FraudAbstentionText();

    expect(html).toContain('data-p0-fraud-decision="withheld"');
    for (const value of [html, text]) {
      expect(value).toContain("Fraud Decision Withheld");
      expect(value).toContain("Manual Review Required");
      expect(value).toContain("What is missing:");
      expect(value).toContain("What resolves this:");
      expect(value).not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
      expect(value).not.toMatch(/high risk|low risk|fraud probability/i);
    }
  });

  it("recursively strips fraud fields while retaining independently supported evidence", () => {
    const redacted = redactP0B1FraudReportPayload({
      vehicle: { registration: "P0B1-RED-1", make: "Toyota" },
      quotation: { total: 1250, repairer: "Verified Repairer" },
      cost: { estimated: 1100 },
      readiness: { state: "ready_for_report_inputs" },
      approvalRate: 82,
      portfolio: { totalClaims: 47 },
      tenantId: "tenant-p0b1",
      fraudScore: 94,
      fraudRiskLevel: "high",
      fraudIndicators: ["forged indicator"],
      nested: {
        riskScore: 73,
        overallRiskLevel: "high",
        retained: "evidence",
      },
      nestedArray: [{ riskRating: "high", documentName: "Quote.pdf" }],
    });

    expect(redacted).toMatchObject({
      vehicle: { registration: "P0B1-RED-1", make: "Toyota" },
      quotation: { total: 1250, repairer: "Verified Repairer" },
      cost: { estimated: 1100 },
      readiness: { state: "ready_for_report_inputs" },
      approvalRate: 82,
      portfolio: { totalClaims: 47 },
      tenantId: "tenant-p0b1",
      nested: { retained: "evidence" },
      nestedArray: [{ documentName: "Quote.pdf" }],
      fraudDecision: expect.objectContaining({
        status: "FRAUD_DECISION_WITHHELD",
        actionAllowed: false,
      }),
    });
    expect(JSON.stringify(redacted)).not.toMatch(
      /forged indicator|fraudScore|fraudRiskLevel|riskScore|overallRiskLevel|riskRating/
    );
  });

  it("renders the legacy assessment PDF with evidence boundaries instead of physics or fraud numerics", () => {
    const html = generateAssessmentReportHTML({
      vehicleRegistration: "P0B1-PDF-1",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2024,
      estimatedCost: 1250,
      fraudAnalysis: { risk_level: "high", fraud_probability: 0.94 },
      physicsAnalysis: {
        physics_analysis: {
          impact_speed_ms: 22,
          kinetic_energy_joules: 90000,
          g_force: 11,
        },
        damageConsistency: "inconsistent",
        confidence: 0.91,
      },
      crossValidation: null,
      damagedComponents: ["Front bumper"],
      claimNumber: "P0B1-PDF-1",
    });

    expect(html).toContain(
      "Collision Physics Withheld — Manual Review Required"
    );
    expect(html).toContain("Fraud Decision Withheld — Manual Review Required");
    expect(html).toContain("Estimated Repair Cost");
    expect(html).not.toContain("90 km/h");
    expect(html).not.toContain("90kN");
    expect(html).not.toContain("94% Fraud Probability");
    expect(html).not.toContain("HIGH RISK");
    expect(html).not.toContain("Fraud Risk Assessment");
  });

  it("does not pass canonical physics or fraud values into the legacy assessment PDF template", () => {
    const input = toAssessmentPdfCanonicalInput({
      vehicle: {
        make: "Toyota",
        model: "Corolla",
        year: 2024,
        registration: "P0B1-CAN-1",
      },
      assessment: {
        damageDescription: "Documented bumper deformation",
        estimatedCost: 1200,
        fraudRiskLevel: "high",
      },
      evidence: {
        physicsAnalysis: { impact_speed_ms: 22 },
        aiDetectedDamageComponents: [],
        crossValidation: null,
      },
      decision: { normalised: { fraud: { score: 98 } } },
      incident: {
        type: "collision",
        date: "2026-09-22",
        description: "Collision",
      },
      claim: { lodgerName: "Claimant" },
      scope: { claimNumber: "P0B1-CAN-1" },
    } as never);

    expect(input).toMatchObject({
      vehicleRegistration: "P0B1-CAN-1",
      estimatedCost: 1200,
    });
    expect(input).not.toHaveProperty("physicsAnalysis");
    expect(input).not.toHaveProperty("fraudAnalysis");
  });

  it("uses field-level markers in operational reports and whole-document holds only for fraud-only reports", () => {
    const source = readFileSync(
      resolve(__dirname, "reportDefinitions.ts"),
      "utf8"
    );
    const insurer = source.slice(
      source.indexOf("export async function generateExecutiveInsurerSummary"),
      source.indexOf("export async function generateCrossInsurerFraudReport")
    );
    const executive = source.slice(
      source.indexOf("export async function generateExecutiveFullReport")
    );

    expect(insurer).toContain("renderP0B1FraudAbstentionMarker()");
    expect(insurer).not.toContain(
      'renderP0FraudReportHold("executive.insurer_summary"'
    );
    expect(insurer).not.toContain("High-Fraud Rate");
    expect(executive).toContain("renderP0B1FraudAbstentionMarker()");
    expect(executive).not.toContain('renderP0FraudReportHold("executive.full"');
    expect(executive).not.toContain("a.fraud_score");
  });
});
