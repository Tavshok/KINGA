import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: mocks.getDb,
}));

const { appRouter } = await import("./routers");

function caller({
  role = "admin",
  insurerRole,
  tenantId = "governance-export-test-tenant",
}: {
  role?: string;
  insurerRole?: string;
  tenantId?: string | null;
} = {}) {
  return appRouter.createCaller({
    user: {
      id: 101,
      role,
      insurerRole,
      tenantId,
      name: "Governance Test User",
      email: "governance-export@example.test",
    },
    req: { headers: {} },
  } as any);
}

describe("governance export placeholder safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("makes every registered export endpoint explicitly unavailable without emitting a zero-value payload or querying data", async () => {
    const governance = caller().governanceDashboard;
    const requests = [
      governance.exportGovernancePDF(),
      governance.exportGovernanceCSV(),
      governance.getGovernanceExportData(),
    ];

    for (const request of requests) {
      await expect(request).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("No report has been generated"),
      });
    }

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("retains tenant and privileged-role enforcement before the unavailable response", async () => {
    await expect(caller({ tenantId: null }).governanceDashboard.exportGovernancePDF())
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Tenant ID required" });

    await expect(caller({ role: "insurer", insurerRole: "claims_processor" }).governanceDashboard.exportGovernanceCSV())
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
