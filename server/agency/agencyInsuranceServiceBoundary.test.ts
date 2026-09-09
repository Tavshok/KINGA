import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderVehiclePassportEvidencePanel } from "../reporting/vehiclePassportEvidencePresentation";

const projectRoot = resolve(import.meta.dirname, "../..");
const serviceRouter = readFileSync(resolve(projectRoot, "server/routers/agency-insurance-service.ts"), "utf8");
const brokerRouter = readFileSync(resolve(projectRoot, "server/routers/agency-broker.ts"), "utf8");
const assistedSubmissionService = readFileSync(resolve(projectRoot, "server/agency/agencyAssistedClaimSubmission.ts"), "utf8");
const vehiclePassportRouter = readFileSync(resolve(projectRoot, "server/routers/vehicle-passport.ts"), "utf8");
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

  it("renders a neutral pre-loss evidence boundary without claim-outcome authority", () => {
    const html = renderVehiclePassportEvidencePanel({
      snapshot: {
        requestNumber: "VP-BOUNDARY",
        snapshotVersion: 1,
        snapshotDate: "2026-01-01",
        exteriorCondition: "Good",
        interiorCondition: "Good",
        mechanicalCondition: "Good",
      },
      formatDate: String,
      escapeHtml: String,
    });

    expect(html).toContain("Vehicle Passport — Pre-Loss Condition Evidence");
    expect(html).toContain("Dated pre-loss valuation evidence only");
    expect(html).toContain("does not determine causation, repair cost, policy, premium, settlement, fraud conclusion, or claim outcome.");
    expect(resolvedReportRecord).toContain("vehicle_condition_snapshots");
    expect(forensicReportModel).toContain("vehicle_condition_snapshots");
  });
});
