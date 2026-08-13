import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P0 Package 2 direct-ID intake boundary", () => {
  it("derives web/My Portal tenant and claimant identity from the authenticated context rather than submission fields", () => {
    const source = readFileSync("server/routers/claims-core.ts", "utf8");
    const submitStart = source.indexOf("submit: protectedProcedure");
    const submitEnd = source.indexOf("return { success: true, claimId: result.claimId", submitStart);
    const submitMutation = source.slice(submitStart, submitEnd);
    expect(submitMutation).toContain("const tenantId = ctx.user.tenantId ?? \"\"");
    expect(submitMutation).toContain("const actor = { id: ctx.user.id, tenantId, role: ctx.user.role }");
    expect(submitMutation).not.toContain("input.tenantId");
    expect(submitMutation).not.toContain("input.claimantId");
    expect(submitMutation).not.toContain("input.existingClaimId");
  });

  it("scopes agency client identity to the agency tenant and resolves the restricted claimant through the selected insurer tenant", () => {
    const source = readFileSync("server/routers/agency-insurance-service.ts", "utf8");
    expect(source).toContain("requireTenantScope(ctx, undefined, \"agency-assisted-claim\")");
    expect(source).toContain("eq(agencyClients.agencyTenantId, agencyTenantId)");
    expect(source).toContain("resolveAgencyAssistedClaimantIdentity");
  });

  it("resolves WhatsApp identity server-side and retains canonical attachment ownership validation", () => {
    const whatsapp = readFileSync("server/whatsapp/engine.ts", "utf8");
    const canonical = readFileSync("server/services/canonicalClaimIntake.ts", "utf8");
    expect(whatsapp).toContain("resolveWhatsAppCanonicalActor(phone, data.insurerName)");
    expect(whatsapp).not.toContain("data.tenantId");
    expect(canonical).toContain("assertCanonicalAttachmentOwnership(actor, input.attachments)");
    expect(canonical).toContain("claimIntakeRequests.tenantId, actor.tenantId");
  });
});
