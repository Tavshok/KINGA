import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  quote: {
    id: 73,
    tenantId: "tenant-insurer-b",
    customerId: 902,
    quoteNumber: "TEST-QUOTE-73",
  } as any,
}));

vi.mock("./insurance/insurance-db", () => ({
  getQuoteById: vi.fn(async () => fixture.quote),
}));

import { appRouter } from "./routers";

const insuranceCoreSource = readFileSync(resolve(import.meta.dirname, "routers/insurance-core.ts"), "utf8");

function callerFor(role: string, tenantId: string, userId: number) {
  return appRouter.createCaller({
    user: { id: userId, role, tenantId, openId: `insurer-read-${userId}`, name: "Insurer read fixture" },
    req: {} as any,
    res: {} as any,
  });
}

describe("insurer quote and policy read authority", () => {
  it("denies an administrative-shell user a quote from another tenant", async () => {
    const caller = callerFor("admin", "tenant-insurer-a", 1);
    await expect(caller.insurance.getQuote({ quoteId: fixture.quote.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("retains a same-tenant customer's own quote read", async () => {
    fixture.quote = { ...fixture.quote, tenantId: "tenant-insurer-a", customerId: 73 };
    const caller = callerFor("claimant", "tenant-insurer-a", 73);
    await expect(caller.insurance.getQuote({ quoteId: fixture.quote.id })).resolves.toMatchObject({ id: 73, tenantId: "tenant-insurer-a" });
  });

  it("keeps pending-payment and policy-PDF evidence paths tenant-bound", () => {
    expect(insuranceCoreSource).toContain("eq(insuranceQuotes.tenantId, actorTenantId)");
    expect(insuranceCoreSource).toContain("if (policy.tenantId !== actorTenantId)");
    expect(insuranceCoreSource).not.toContain("const paymentScope = isAdminRole(ctx.user.role)");
  });
});
