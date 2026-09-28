import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: mocks.getDb,
}));

const { adminRouter } = await import("./routers/admin");

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/admin.ts"),
  "utf8"
);
const pipelineHealth = source.slice(
  source.indexOf("getPipelineHealth: protectedProcedure"),
  source.indexOf("serverDiagnostics: superAdminProcedure")
);

describe("administrative pipeline health tenant authority", () => {
  it("requires an authorised role and session tenant before the P0 hold", () => {
    expect(pipelineHealth).toContain(
      "Pipeline health requires an authorised administrative role."
    );
    expect(pipelineHealth).toContain(
      "A tenant-scoped session is required for pipeline health."
    );
    expect(pipelineHealth).toContain("isAdminRole(ctx.user.role)");
    expect(pipelineHealth).toContain('code: "PRECONDITION_FAILED"');
    expect(pipelineHealth.indexOf("isAdminRole(ctx.user.role)")).toBeLessThan(
      pipelineHealth.indexOf('code: "PRECONDITION_FAILED"')
    );
    expect(
      pipelineHealth.indexOf(
        "A tenant-scoped session is required for pipeline health."
      )
    ).toBeLessThan(pipelineHealth.indexOf('code: "PRECONDITION_FAILED"'));
  });

  it("does not read pipeline assessments before withholding fraud-derived health metrics", () => {
    expect(pipelineHealth).not.toContain(".from(aiAssessments)");
  });
});

function caller({
  role = "admin",
  insurerRole,
  tenantId = "pipeline-health-p0-b1a-tenant",
}: {
  role?: string;
  insurerRole?: string;
  tenantId?: string | null;
} = {}) {
  return adminRouter.createCaller({
    user: {
      id: 90201,
      openId: "pipeline-health-p0-b1a",
      name: "Pipeline Health P0-B1a Fixture",
      email: "pipeline-health-p0-b1a@example.invalid",
      role,
      insurerRole,
      tenantId,
    },
    req: { headers: {} },
  } as any);
}

describe("administrative pipeline health P0 hold ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns authorization denials before the P0 hold and never opens the database", async () => {
    await expect(
      caller({
        role: "insurer",
        insurerRole: "claims_processor",
      }).getPipelineHealth({})
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Pipeline health requires an authorised administrative role.",
    });

    await expect(
      caller({ tenantId: null }).getPipelineHealth({})
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "A tenant-scoped session is required for pipeline health.",
    });

    await expect(caller().getPipelineHealth({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining(
        "Fraud classifications and fraud-derived platform health metrics are withheld"
      ),
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
