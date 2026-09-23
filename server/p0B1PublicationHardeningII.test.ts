import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildP0B1FraudDecisionHold,
  P0_B1_FRAUD_DECISION_HOLD,
} from "../shared/p0FraudDecisionHoldPresentation";
import { projectP0B1GlobalSearchClaim } from "./routers/analytics";
import { buildP0B1FraudPdfHoldRows } from "../client/src/lib/export-pdf";

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("P0-B1 Publication Hardening II", () => {
  it("allows only descriptive operational fields in a global-search claim result", () => {
    const projected = projectP0B1GlobalSearchClaim(
      {
        id: 71,
        claimNumber: "P0B1-GS-71",
        kingaRef: "KNG-P0B1-71",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        vehicleYear: 2024,
        vehicleRegistration: "P0B1-71",
        policyNumber: "POL-71",
        incidentDate: "2026-09-23",
        incidentType: "collision",
        status: "assessment_complete",
        workflowState: "manual_review",
        estimatedClaimValue: "1250.00",
        approvedAmount: 1000,
        currencyCode: "USD",
        createdAt: "2026-09-23T08:00:00.000Z",
        updatedAt: "2026-09-23T08:05:00.000Z",
        fraudRiskScore: 98,
        fraudRiskLevel: "high",
        fraudFlags: '["P0B1 forbidden indicator"]',
        earlyFraudSuspicion: 1,
      },
      { name: "Claimant", email: "claimant@example.test" }
    );

    expect(projected).toMatchObject({
      id: 71,
      claimNumber: "P0B1-GS-71",
      vehicleRegistration: "P0B1-71",
      status: "assessment_complete",
      claimantName: "Claimant",
      claimantEmail: "claimant@example.test",
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /fraudRiskScore|fraudRiskLevel|fraudFlags|earlyFraudSuspicion|P0B1 forbidden indicator/
    );
  });

  it("attaches the immutable shared manual-review hold to global-search output", () => {
    const held = buildP0B1FraudDecisionHold({ results: [{ id: 71 }] });

    expect(held).toMatchObject({
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
      actionAllowed: false,
      results: [{ id: 71 }],
      requiredEvidence: P0_B1_FRAUD_DECISION_HOLD.requiredEvidence,
      resolver: P0_B1_FRAUD_DECISION_HOLD.resolver,
    });
  });

  it("uses a query allowlist rather than selecting or spreading the full claim record", () => {
    const analytics = source("server/routers/analytics.ts");
    const globalSearch = analytics.slice(
      analytics.indexOf("globalSearch: analyticsRoleProcedure"),
      analytics.indexOf("getKPIs: analyticsRoleProcedure")
    );

    expect(globalSearch).toContain("projectP0B1GlobalSearchClaim");
    expect(globalSearch).toContain("buildP0B1FraudDecisionHold");
    expect(globalSearch).toContain("claim: {");
    expect(globalSearch).not.toContain("claim: claims");
    expect(globalSearch).not.toContain("...claim");
    expect(globalSearch).not.toContain("fraudRiskScore: claims.fraudRiskScore");
    expect(globalSearch).not.toContain("fraudRiskLevel: claims.fraudRiskLevel");
    expect(globalSearch).not.toContain("fraudFlags: claims.fraudFlags");
  });

  it("removes raw fraud fields from browser PDF payloads and prints actionable resolution guidance", () => {
    const rows = buildP0B1FraudPdfHoldRows();
    const pdf = source("client/src/lib/export-pdf.ts");
    const dialog = source("client/src/components/ClaimReviewDialog.tsx");
    const exportHandler = dialog.slice(
      dialog.indexOf("const handleExportPDF"),
      dialog.indexOf("if (!claimId) return null")
    );

    expect(rows).toEqual([
      ["Status:", "Withheld — Manual Review Required"],
      [
        "What is missing:",
        P0_B1_FRAUD_DECISION_HOLD.requiredEvidence.join("; "),
      ],
      ["What resolves this:", P0_B1_FRAUD_DECISION_HOLD.resolver.action],
    ]);
    expect(pdf).toContain("buildP0B1FraudPdfHoldRows");
    expect(pdf).toContain("Fraud Decision");
    expect(pdf).not.toContain("['Fraud Risk Level:'");
    expect(pdf).not.toContain("['Fraud Indicators:'");
    expect(exportHandler).not.toContain("fraudRiskLevel:");
    expect(exportHandler).not.toContain("fraudIndicators:");
  });

  it("mounts the rendered P0-B1 result component in the active Global Search card", () => {
    const dashboard = source("client/src/pages/ExecutiveDashboard.tsx");
    const activeSearchCard = dashboard.slice(
      dashboard.indexOf("{/* ── Row 3 Col 1-2: Global Claim Search ── */}"),
      dashboard.indexOf("{/* ── Row 3 Col 3: Fast-Track Analytics ── */}")
    );

    expect(activeSearchCard).toContain("P0B1GlobalSearchResults");
    expect(activeSearchCard).toContain("payload={searchResults}");
    expect(activeSearchCard).not.toContain("fraud_flag");
  });
});
