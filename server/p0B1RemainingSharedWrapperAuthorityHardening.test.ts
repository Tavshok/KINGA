import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { P0_B1_FRAUD_DECISION_HOLD } from "./evidence-governance/p0FraudDecisionHold";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  select: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
}));

import { adminRouter } from "./routers/admin";
import { analyticsRouter } from "./routers/analytics";
import { claimsManagerRouter } from "./routers/claims-manager";
import { treGovernanceRouter } from "./routers/tre-governance";

const tenantId = "p0-b1-wrapper-tenant";
const callerContext = (user: Record<string, unknown>) =>
  ({
    user,
    req: { headers: {} },
    insurerTenantId: user.tenantId ?? null,
  }) as any;

const analyticsExecutive = callerContext({
  id: 41001,
  role: "insurer",
  insurerRole: "executive",
  tenantId,
});
const analyticsRiskManager = callerContext({
  id: 41002,
  role: "insurer",
  insurerRole: "risk_manager",
  tenantId,
});
const analyticsWrongRole = callerContext({
  id: 41003,
  role: "insurer",
  insurerRole: "claims_processor",
  tenantId,
});
const analyticsTenantlessExecutive = callerContext({
  id: 41004,
  role: "insurer",
  insurerRole: "executive",
  tenantId: null,
});
const platformSuperAdminWithoutTenant = callerContext({
  id: 41005,
  role: "platform_super_admin",
  insurerRole: null,
  tenantId: null,
});
const platformSuperAdmin = callerContext({
  id: 41006,
  role: "platform_super_admin",
  insurerRole: null,
  tenantId,
});
const ordinaryAdmin = callerContext({
  id: 41007,
  role: "admin",
  insurerRole: null,
  tenantId,
});
const treTenantUser = callerContext({
  id: 41008,
  role: "insurer",
  insurerRole: "claims_manager",
  tenantId,
});
const treTenantlessUser = callerContext({
  id: 41009,
  role: "insurer",
  insurerRole: "claims_manager",
  tenantId: null,
});

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function routeBlock(sourceText: string, route: string): string {
  const start = sourceText.indexOf(`  ${route}:`);
  if (start < 0) throw new Error(`Cannot locate ${route}`);
  const next = sourceText.slice(start + 1).search(/\n  [A-Za-z0-9_]+:/);
  return next < 0
    ? sourceText.slice(start)
    : sourceText.slice(start, start + 1 + next);
}

function ownedClaimDb(exists = true) {
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => (exists ? [{ id: 77 }] : []),
      }),
    }),
  });
  return { select: mocks.select };
}

function enterpriseTierDb() {
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [{ tier: "tier-enterprise" }],
      }),
    }),
  });
  return { select: mocks.select };
}

const analyticsCalls = [
  ["getKPIs", {}],
  ["getCriticalAlerts", undefined],
  ["getFinancialOverview", undefined],
  ["getMonthComparison", undefined],
  ["getExecutiveAlerts", undefined],
  ["getEscalationCounts", {}],
  ["getSettlementTrend", {}],
  ["getFraudInvestigationFunnel", undefined],
] as const;

const treClaimCalls = [
  ["getClaimTruthObject", { claimId: 77 }],
  ["getCanonicalValues", { claimId: 77 }],
  ["verifyCertificate", { claimId: 77 }],
  ["getGovernanceSummary", { claimId: 77 }],
  ["evaluateTruthRules", { claimId: 77 }],
  ["getRegulatoryCompliance", { claimId: 77 }],
  ["getExplanation", { claimId: 77 }],
  ["getTruthQualityIndex", { claimId: 77 }],
] as const;

describe("P0-B1 remaining shared wrapper authority hardening", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.select.mockReset();
  });

  it("removes all four historical fraud-hold middleware wrappers and binds affected routes directly", () => {
    const admin = source("server/routers/admin.ts");
    const analytics = source("server/routers/analytics.ts");
    const claimsManager = source("server/routers/claims-manager.ts");
    const tre = source("server/routers/tre-governance.ts");

    for (const [file, wrapper] of [
      [admin, "p0FraudSuperAdminProcedure"],
      [analytics, "p0FraudAnalyticsProcedure"],
      [claimsManager, "p0FraudClaimsManagerProcedure"],
      [tre, "p0FraudTreProcedure"],
    ]) {
      expect(file).not.toContain(wrapper);
    }

    expect(routeBlock(admin, "getPlatformHealth")).toContain(
      "getPlatformHealth: superAdminProcedure"
    );
    expect(routeBlock(admin, "getPlatformHealth")).not.toContain("getDb()");
    for (const route of [
      "getKPIs",
      "getCriticalAlerts",
      "getFinancialOverview",
      "getRiskManagerKPIs",
      "sendRiskAnalyticsReport",
      "getMonthComparison",
      "getExecutiveAlerts",
      "getEscalationCounts",
      "getSettlementTrend",
      "getFraudInvestigationFunnel",
    ]) {
      const block = routeBlock(analytics, route);
      expect(block).toContain(`${route}: analyticsRoleProcedure`);
      expect(block).toContain("requireP0FraudAnalyticsTenant(ctx)");
      expect(block).toContain("throwP0B1FraudDecisionHold()");
      expect(block).not.toContain("fraudRisk");
      if (route !== "getRiskManagerKPIs") {
        expect(block).not.toContain("getDb()");
      }
    }
    for (const route of [
      "getAttentionRequired",
      "getApprovalWorkbenchMetrics",
    ]) {
      const block = routeBlock(claimsManager, route);
      expect(block).toContain(`${route}: insurerDomainProcedure`);
      expect(block).toContain("requireP0FraudClaimsManagerTenant(ctx)");
      expect(block).toContain("throwP0B1FraudDecisionHold()");
      expect(block).not.toContain("getDb()");
    }
    for (const route of [
      "getClaimTruthObject",
      "getCanonicalValues",
      "verifyCertificate",
      "getGovernanceSummary",
      "evaluateTruthRules",
      "getRegulatoryCompliance",
      "getExplanation",
      "getTruthQualityIndex",
      "getGovernanceDashboard",
    ]) {
      const block = routeBlock(tre, route);
      expect(block).toContain(`${route}: protectedProcedure`);
      expect(block).toContain("throwP0B1FraudDecisionHold()");
      expect(block).not.toContain("getAssessmentCTO");
      expect(block).not.toContain("fraudRiskScore");
      if (route !== "getGovernanceDashboard") {
        expect(block.indexOf("await requireTreClaim")).toBeLessThan(
          block.indexOf("throwP0B1FraudDecisionHold()")
        );
      } else {
        expect(block).not.toContain("getDb()");
      }
    }
  });

  it("keeps platform health behind the exact super-admin guard and before data reads", async () => {
    await expect(
      adminRouter.createCaller(platformSuperAdmin).getPlatformHealth()
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.getDb).not.toHaveBeenCalled();

    await expect(
      adminRouter.createCaller(ordinaryAdmin).getPlatformHealth()
    ).rejects.toThrow("Super-admin access required");
    expect(mocks.getDb).not.toHaveBeenCalled();

    await expect(
      adminRouter
        .createCaller(platformSuperAdminWithoutTenant)
        .getPlatformHealth()
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each(analyticsCalls)(
    "holds analytics %s only after role and tenant authority, without a protected data read",
    async (procedure, input) => {
      const caller = analyticsRouter.createCaller(analyticsExecutive) as any;
      const invoke = () =>
        input === undefined ? caller[procedure]() : caller[procedure](input);

      await expect(invoke()).rejects.toThrow(
        P0_B1_FRAUD_DECISION_HOLD.explanation
      );
      expect(mocks.getDb).not.toHaveBeenCalled();
    }
  );

  it("preserves risk-manager role and enterprise-tier authorization before its hold", async () => {
    const riskManager = analyticsRouter.createCaller(
      analyticsRiskManager
    ) as any;
    mocks.getDb.mockResolvedValue(enterpriseTierDb());

    await expect(riskManager.getRiskManagerKPIs({})).rejects.toThrow(
      P0_B1_FRAUD_DECISION_HOLD.explanation
    );
    expect(mocks.getDb).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledOnce();

    mocks.getDb.mockReset();
    await expect(
      riskManager.sendRiskAnalyticsReport({
        months: 3,
        recipientEmail: "risk@example.invalid",
        summaryKpis: {
          totalClaims: 0,
          avgRepairCost: 0,
          fraudRate: 0,
          totalQuantum: 0,
          avgCycleDays: 0,
          repeatOffenderRate: 0,
        },
      })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.getDb).not.toHaveBeenCalled();

    mocks.getDb.mockReset();
    await expect(
      (
        analyticsRouter.createCaller(analyticsExecutive) as any
      ).sendRiskAnalyticsReport({
        months: 3,
        recipientEmail: "risk@example.invalid",
        summaryKpis: {
          totalClaims: 0,
          avgRepairCost: 0,
          fraudRate: 0,
          totalQuantum: 0,
          avgCycleDays: 0,
          repeatOffenderRate: 0,
        },
      })
    ).rejects.toThrow("Risk Manager role required");
    expect(mocks.getDb).not.toHaveBeenCalled();

    mocks.getDb.mockReset();
    await expect(
      (
        analyticsRouter.createCaller(analyticsExecutive) as any
      ).getRiskManagerKPIs({})
    ).rejects.toThrow("Risk Manager role required");
    expect(mocks.getDb).not.toHaveBeenCalled();

    mocks.getDb.mockReset();
    await expect(
      (
        analyticsRouter.createCaller(analyticsWrongRole) as any
      ).getRiskManagerKPIs({})
    ).rejects.toThrow("Analytics access requires");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies analytics role and tenant failures before a P0 hold", async () => {
    await expect(
      (analyticsRouter.createCaller(analyticsWrongRole) as any).getKPIs({})
    ).rejects.toThrow("Analytics access requires");
    expect(mocks.getDb).not.toHaveBeenCalled();

    mocks.getDb.mockReset();
    mocks.select.mockReset();
    await expect(
      (
        analyticsRouter.createCaller(analyticsTenantlessExecutive) as any
      ).getKPIs({})
    ).rejects.toThrow("not associated with a tenant");
    expect(mocks.select).not.toHaveBeenCalled();

    mocks.getDb.mockReset();
    mocks.select.mockReset();
    await expect(
      (
        analyticsRouter.createCaller(platformSuperAdminWithoutTenant) as any
      ).getKPIs({})
    ).rejects.toThrow("explicitly selected tenant-scoped session");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    ["getAttentionRequired", undefined],
    ["getApprovalWorkbenchMetrics", undefined],
  ] as const)(
    "holds Claims Manager %s after insurer-domain and concrete tenant authority",
    async (procedure, input) => {
      const caller = claimsManagerRouter.createCaller(
        analyticsExecutive
      ) as any;
      const invoke = () =>
        input === undefined ? caller[procedure]() : caller[procedure](input);

      await expect(invoke()).rejects.toThrow(
        P0_B1_FRAUD_DECISION_HOLD.explanation
      );
      expect(mocks.getDb).not.toHaveBeenCalled();
    }
  );

  it("denies a tenantless platform super-admin at Claims Manager before the hold", async () => {
    await expect(
      (
        claimsManagerRouter.createCaller(platformSuperAdminWithoutTenant) as any
      ).getAttentionRequired()
    ).rejects.toThrow(
      "tenant-scoped session is required for fraud-related claims management"
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each(treClaimCalls)(
    "holds TRE %s only after the tenant-owned claim check",
    async (procedure, input) => {
      mocks.getDb.mockResolvedValue(ownedClaimDb(true));
      const caller = treGovernanceRouter.createCaller(treTenantUser) as any;

      await expect(caller[procedure](input)).rejects.toThrow(
        P0_B1_FRAUD_DECISION_HOLD.explanation
      );
      expect(mocks.getDb).toHaveBeenCalledOnce();
      expect(mocks.select).toHaveBeenCalledOnce();
    }
  );

  it("denies a foreign TRE claim before the P0 hold and never reads the assessment", async () => {
    mocks.getDb.mockResolvedValue(ownedClaimDb(false));

    await expect(
      (
        treGovernanceRouter.createCaller(treTenantUser) as any
      ).getClaimTruthObject({
        claimId: 77,
      })
    ).rejects.toThrow("Claim not found");
    expect(mocks.getDb).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("denies a tenantless TRE session before any resource check or P0 hold", async () => {
    await expect(
      (
        treGovernanceRouter.createCaller(treTenantlessUser) as any
      ).getClaimTruthObject({
        claimId: 77,
      })
    ).rejects.toThrow("tenant-scoped session is required");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("holds the aggregate TRE dashboard after tenant authority without database access", async () => {
    await expect(
      (
        treGovernanceRouter.createCaller(treTenantUser) as any
      ).getGovernanceDashboard({})
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
