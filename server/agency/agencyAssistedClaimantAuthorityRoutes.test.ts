import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("P0 restricted agency-assisted claimant route authority", () => {
  it("denies independent portal access while preserving the separate agency-assisted canonical claim route", () => {
    const protectedRoute = read("client/src/components/ProtectedRoute.tsx");
    const agencyService = read("server/routers/agency-insurance-service.ts");
    expect(protectedRoute).toContain("isUnregisteredClaimant");
    expect(protectedRoute).toContain('Redirect to="/unauthorized"');
    expect(agencyService).toContain("createAgencyAssistedClaim");
    expect(agencyService).toContain("submitAgencyAssistedCanonicalClaim");
  });

  it("denies restricted identities before independent report, insurance document, settlement, and dispute side effects", () => {
    const reports = read("server/routers/reports.ts");
    const claims = read("server/routers/claims-core.ts");
    const insurance = read("server/routers/insurance-phase7.ts");
    const notifications = read("server/routers/notifications.ts");
    expect(reports.match(/assertRestrictedAgencyAssistedCapability\(ctx\.user, "report_access"\)/g)).toHaveLength(3);
    expect(claims).toContain('assertRestrictedAgencyAssistedCapability(ctx.user, "settlement_instruction")');
    expect(claims).toContain('assertRestrictedAgencyAssistedCapability(ctx.user, "dispute_instruction")');
    expect(claims).toContain('assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_document_access")');
    expect(insurance).toContain('assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_request")');
    expect(insurance).toContain('assertRestrictedAgencyAssistedCapability(ctx.user, "insurance_quote_acceptance")');
    expect(insurance.match(/assertRestrictedAgencyAssistedCapability\(ctx\.user, "insurance_document_access"\)/g)).toHaveLength(3);
    expect(notifications).toContain('assertRestrictedAgencyAssistedCapability(ctx.user, "communication_authority")');
    expect(notifications).toContain("const restrictedCommunicationProcedure = protectedProcedure.use");
  });

  it("retains auditable verified-link fields on the restricted identity ledger", () => {
    const identity = read("server/agency/agencyAssistedClaimantIdentity.ts");
    const router = read("server/routers/agency-insurance-service.ts");
    expect(identity).toContain('status: "linked_to_verified_claimant"');
    expect(identity).toContain("linkedBy: input.agencyUserId");
    expect(identity).toContain("linkedAt:");
    expect(router).toContain("linkAgencyAssistedClaimantToVerifiedMyPortal");
    expect(router).toContain("eq(agencyAssistedClaimantIdentities.agencyTenantId, agencyTenantId)");
    expect(router).toContain("eq(users.tenantId, identity.insurerTenantId)");
    expect(router).toContain("eq(users.isUnregisteredClaimant, 0)");
    expect(router).toContain("linkConfirmationStatement: input.confirmationStatement");
    expect(router).toContain("historicalClaimOwnershipChanged: false");
  });
});
