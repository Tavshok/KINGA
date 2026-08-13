import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const routerSource = readFileSync(resolve(projectRoot, "server/routers/insurance-phase7.ts"), "utf8");
const schemaSource = readFileSync(resolve(projectRoot, "drizzle/schema.ts"), "utf8");
const agencyServiceSource = readFileSync(resolve(projectRoot, "server/routers/agency-insurance-service.ts"), "utf8");
const insuranceCoreSource = readFileSync(resolve(projectRoot, "server/routers/insurance-core.ts"), "utf8");
const policyIssuanceSource = readFileSync(resolve(projectRoot, "server/insurance/policy-issuance.ts"), "utf8");

function procedureBlock(start: string, end: string) {
  return routerSource.split(start)[1]?.split(end)[0] ?? "";
}

describe("legacy phase-7 valuation and insurance request separation", () => {
  it("persists new standalone valuations outside quotation requests", () => {
    const writer = procedureBlock("submitValuationRequest:", "getTeaserReport:");
    expect(writer).toContain("clientVehicleValuationRequests");
    expect(writer).not.toContain("db.insert(quotationRequests)");
    expect(schemaSource).toContain("client_vehicle_valuation_requests");
  });

  it("persists new client insurance submissions outside quotation and policy records", () => {
    const writer = procedureBlock("submitRequest:", "getMyDocuments:");
    expect(writer).toContain("clientInsuranceServiceRequests");
    expect(writer).not.toContain("db.insert(quotationRequests)");
    expect(writer).toContain("requestPayloadJson");
    expect(writer).not.toContain("quotedPremium");
    expect(schemaSource).toContain("client_insurance_service_requests");
  });

  it("labels legacy quotation rows as history and provides a bounded professional valuation evidence projection", () => {
    expect(routerSource).toContain('sourceLifecycle: "legacy_quotation_history"');
    expect(agencyServiceSource).toContain("getAgencyProfessionalValuationEvidence");
    expect(agencyServiceSource).toContain("Professional decision support only");
    expect(agencyServiceSource).not.toContain("internalConfidenceScore: raw");
  });

  it("keeps future valuation, service request, quote, and policy writers in distinct lifecycle modules", () => {
    const valuationWriter = procedureBlock("submitValuationRequest:", "getTeaserReport:");
    const serviceRequestWriter = procedureBlock("submitRequest:", "getMyDocuments:");
    const quoteWriter = insuranceCoreSource.split("requestQuote:")[1]?.split("getQuote:")[0] ?? "";

    expect(valuationWriter).toContain("clientVehicleValuationRequests");
    expect(valuationWriter).not.toContain("insuranceQuotes");
    expect(valuationWriter).not.toContain("insurancePolicies");

    expect(serviceRequestWriter).toContain("clientInsuranceServiceRequests");
    expect(serviceRequestWriter).not.toContain("insuranceQuotes");
    expect(serviceRequestWriter).not.toContain("insurancePolicies");

    expect(quoteWriter).toContain("createQuote");
    expect(quoteWriter).not.toContain("clientVehicleValuationRequests");
    expect(quoteWriter).not.toContain("clientInsuranceServiceRequests");

    expect(policyIssuanceSource).toContain("issuePolicyFromQuote");
    expect(policyIssuanceSource).toContain("insurancePolicies");
    expect(policyIssuanceSource).not.toContain("clientVehicleValuationRequests");
    expect(policyIssuanceSource).not.toContain("clientInsuranceServiceRequests");
  });
});
