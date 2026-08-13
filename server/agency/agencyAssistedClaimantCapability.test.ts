import { describe, expect, it } from "vitest";
import { assertRestrictedAgencyAssistedCapability } from "./agencyAssistedClaimantIdentity";

describe("restricted agency-assisted claimant capability guard", () => {
  it("permits verified or ordinary claimant identities through sensitive actions", () => {
    expect(() => assertRestrictedAgencyAssistedCapability({ isUnregisteredClaimant: 0 }, "settlement_instruction")).not.toThrow();
    expect(() => assertRestrictedAgencyAssistedCapability({ isUnregisteredClaimant: false }, "insurance_document_access")).not.toThrow();
  });

  it("denies independent portal, report, insurance, communication, settlement, dispute, payment, and fraud authority", () => {
    for (const capability of ["portal_access", "report_access", "insurance_request", "insurance_quote_acceptance", "insurance_document_access", "communication_authority", "settlement_instruction", "dispute_instruction", "payment_authority", "fraud_authority"] as const) {
      expect(() => assertRestrictedAgencyAssistedCapability({ isUnregisteredClaimant: 1 }, capability)).toThrow(/Verify and link a My Portal identity first/);
    }
  });
});
