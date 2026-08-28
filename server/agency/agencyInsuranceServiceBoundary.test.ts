import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const serviceRouter = readFileSync(resolve(projectRoot, "server/routers/agency-insurance-service.ts"), "utf8");
const brokerRouter = readFileSync(resolve(projectRoot, "server/routers/agency-broker.ts"), "utf8");
const assistedSubmissionService = readFileSync(resolve(projectRoot, "server/agency/agencyAssistedClaimSubmission.ts"), "utf8");
const vehiclePassportRouter = readFileSync(resolve(projectRoot, "server/routers/vehicle-passport.ts"), "utf8");
const claimsLedgerReport = readFileSync(resolve(projectRoot, "server/reporting/claimsIntelligenceReport.ts"), "utf8");
const forensicReport = readFileSync(resolve(projectRoot, "server/reporting/forensicDecisionReport.ts"), "utf8");
const resolvedReportRecord = readFileSync(resolve(projectRoot, "server/reporting/resolvedReportRecord.ts"), "utf8");
const forensicReportModel = readFileSync(resolve(projectRoot, "server/reporting/forensicReportModel.ts"), "utf8");

describe("agency feature-separation contract", () => {
  it("removes the legacy synthetic claim writer from the agency broker router", () => {
    expect(brokerRouter).not.toContain("createAgencyClaim:");
  });

  it("keeps insurance service request creation outside canonical claim intake", () => {
    const insuranceRequestWriter = serviceRouter.split("createInsuranceServiceRequest:")[1]?.split("confirmAndDispatchInsuranceServiceRequest:")[0] ?? "";
    expect(insuranceRequestWriter).toContain("agencyInsuranceServiceRequests");
    expect(insuranceRequestWriter).toContain("vehicleConditionSnapshots");
    expect(insuranceRequestWriter).not.toContain("persistCanonicalClaimIntake");
    expect(insuranceRequestWriter).not.toContain("startCanonicalIntakeAssessment");
    expect(insuranceRequestWriter).not.toContain("estimatedRepairCost");
    expect(insuranceRequestWriter).toContain("buildInsuranceRequestValuationPresentation");
  });

  it("projects client and professional valuation variance without creating policy or claim authority", () => {
    expect(serviceRouter).toContain("varianceDecisionSupport");
    expect(serviceRouter).toContain("agencyDeviation");
    expect(serviceRouter).toContain("Decision support only");
  });

  it("routes only an actual agency-assisted accident through canonical claim intake", () => {
    const assistedClaimWriter = serviceRouter.split("createAgencyAssistedClaim:")[1]?.split("linkAgencyAssistedClaimantToVerifiedMyPortal:")[0] ?? "";
    expect(assistedClaimWriter).toContain("submitAgencyAssistedCanonicalClaim");
    expect(assistedSubmissionService).toContain("assertCanonicalAttachmentOwnership");
    expect(assistedSubmissionService).toContain("channel: \"agency_assisted\"");
    expect(assistedSubmissionService).toContain("startAssessment");
  });

  it("retains dated snapshots in the Vehicle Passport as pre-loss evidence rather than a claim outcome", () => {
    expect(vehiclePassportRouter).toContain('eventType: "pre_loss_condition_snapshot"');
    expect(vehiclePassportRouter).toContain("Pre-loss evidence only; not a claim outcome");
    expect(vehiclePassportRouter).toContain("vehicle_condition_snapshots");
  });

  it("renders the same qualified pre-loss evidence boundary in Claims Ledger and Forensic reports", () => {
    for (const report of [claimsLedgerReport, forensicReport]) {
      expect(report).toContain("Vehicle Passport — Pre-Loss Condition Evidence");
      expect(report).toContain("Dated pre-loss valuation evidence only");
    }
    expect(claimsLedgerReport).toContain("resolveReportRecord({ claimId, tenantId");
    expect(resolvedReportRecord).toContain("vehicle_condition_snapshots");
    expect(forensicReport).toContain("resolveForensicReportModel({ claimId, tenantId, audience: \"forensic\" })");
    expect(forensicReportModel).toContain("vehicle_condition_snapshots");
  });
});
