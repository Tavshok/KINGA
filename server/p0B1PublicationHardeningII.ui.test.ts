import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { validationUseQuery, pdfTextCalls } = vi.hoisted(() => ({
  validationUseQuery: vi.fn(),
  pdfTextCalls: [] as string[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    aiAssessments: {
      validate: {
        useQuery: validationUseQuery,
      },
    },
  },
}));

vi.mock("jspdf", () => ({
  default: class MockJsPdf {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    lastAutoTable = { finalY: 20 };
    setFontSize = vi.fn();
    setFont = vi.fn();
    setTextColor = vi.fn();
    text = vi.fn((value: string | string[]) =>
      pdfTextCalls.push(Array.isArray(value) ? value.join("\n") : value)
    );
    splitTextToSize = (text: string) => [text];
    addPage = vi.fn();
    getNumberOfPages = () => 1;
    setPage = vi.fn();
    save = vi.fn();
  },
}));

const { autoTableMock } = vi.hoisted(() => ({ autoTableMock: vi.fn() }));
vi.mock("jspdf-autotable", () => ({ default: autoTableMock }));

import {
  P0B1GlobalSearchResults,
  displayP0B1GlobalSearchStatus,
} from "../client/src/components/P0B1GlobalSearchResults";
import { exportClaimReportToPDF } from "../client/src/lib/export-pdf";
import {
  normalizeP0FraudValidationHold,
  P0_FRAUD_VALIDATION_HOLD_FALLBACK,
} from "../client/src/components/ValidationGate";
import { P0_B1_FRAUD_DECISION_HOLD } from "../shared/p0FraudDecisionHoldPresentation";

describe("P0-B1 Publication Hardening II browser behavior", () => {
  it("renders the actionable hold in the active Global Search result surface", () => {
    const onClaimSelect = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(P0B1GlobalSearchResults, {
        payload: {
          status: "FRAUD_DECISION_WITHHELD",
          explanation:
            "Stored fraud values have no qualified governing authority.",
          requiredEvidence: ["Claim-linked evidence"],
          resolver: { action: "Obtain documented human review." },
          results: [
            {
              id: 71,
              claimNumber: "P0B1-71",
              claimantName: "Claimant",
              vehicleRegistration: "P0B1-71",
              status: "assessment_complete",
              estimatedClaimValue: 1250,
              fraudRiskScore: 99,
              fraudRiskLevel: "high",
              fraudFlags: ["P0B1 forbidden score evidence"],
            },
          ],
        },
        currencySymbol: "US$",
        onClaimSelect,
      })
    );

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).toContain("What is missing:");
    expect(html).toContain("Claim-linked evidence");
    expect(html).toContain("What resolves this:");
    expect(html).toContain("Obtain documented human review.");
    expect(html).toContain("P0B1-71");
    expect(html).toContain("Claimant");
    expect(html).not.toContain("P0B1 forbidden score evidence");
    expect(html).not.toContain("fraudRiskScore");
    expect(html).not.toContain("high");
  });

  it("uses the route's results response shape and downgrades legacy fraud-status text", () => {
    const html = renderToStaticMarkup(
      React.createElement(P0B1GlobalSearchResults, {
        payload: {
          results: [
            {
              id: 72,
              claimNumber: "P0B1-72",
              status: "fraud_flag",
            },
          ],
        },
        currencySymbol: "US$",
        onClaimSelect: vi.fn(),
      })
    );

    expect(html).toContain("P0B1-72");
    expect(html).toContain("manual review");
    expect(html).not.toContain("fraud flag");
    expect(displayP0B1GlobalSearchStatus("fraud_flag")).toBe("manual_review");
  });

  it("builds malformed-hold guidance from the shared immutable evidence contract", () => {
    const malformed = normalizeP0FraudValidationHold({
      status: "FRAUD_DECISION_WITHHELD",
      explanation: "",
      requiredEvidence: [],
      resolver: {},
    });

    expect(malformed.explanation).toContain(
      "withholding response is incomplete"
    );
    expect(malformed.requiredEvidence).toEqual(
      P0_B1_FRAUD_DECISION_HOLD.requiredEvidence
    );
    expect(malformed.resolver.action).toBe(
      P0_B1_FRAUD_DECISION_HOLD.resolver.action
    );
    expect(P0_FRAUD_VALIDATION_HOLD_FALLBACK.requiredEvidence).toBe(
      P0_B1_FRAUD_DECISION_HOLD.requiredEvidence
    );
  });

  it("passes only the actionable hold and non-fraud content to generated PDF tables", () => {
    autoTableMock.mockImplementation((doc: any, options: any) => {
      doc.lastAutoTable = { finalY: (doc.lastAutoTable?.finalY ?? 20) + 20 };
      return doc;
    });
    autoTableMock.mockClear();
    pdfTextCalls.length = 0;

    exportClaimReportToPDF({
      claim: {
        claimNumber: "P0B1-PDF-71",
        vehicleRegistration: "P0B1PDF",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        policyNumber: "POL-71",
        createdAt: new Date("2026-09-23T00:00:00.000Z"),
        incidentDate: new Date("2026-09-22T00:00:00.000Z"),
        incidentType: "collision",
      },
      aiAssessment: {
        estimatedCost: 1250,
        damageDescription: "Visible bumper damage",
        detectedDamageTypes: '["bumper"]',
      },
      assessorEval: {
        damageAssessment: "Repair the bumper",
        estimatedRepairCost: 1100,
        laborCost: 200,
        partsCost: 900,
        estimatedDuration: 3,
        recommendations: "Obtain a quote",
        disagreesWithAi: false,
        aiDisagreementReason: null,
      },
    });

    const tableBodies = autoTableMock.mock.calls.map(([, options]) =>
      JSON.stringify(options.body)
    );
    const renderedTables = tableBodies.join("\n");

    expect(renderedTables).toContain("Withheld — Manual Review Required");
    expect(renderedTables).toContain("What is missing:");
    expect(renderedTables).toContain("What resolves this:");
    expect(pdfTextCalls.join("\n")).toContain("Visible bumper damage");
    expect(pdfTextCalls.join("\n")).toContain("Repair the bumper");
    expect(renderedTables).not.toMatch(
      /Fraud Risk Level|Fraud Indicators|fraudRiskScore|P0B1 forbidden/i
    );
  });
});
