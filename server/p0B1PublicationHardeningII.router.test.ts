import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./db", () => ({ getDb: getDbMock }));

import { analyticsRouter } from "./routers/analytics";

function context(
  role: string,
  tenantId: string | null,
  insurerRole: string | null = null
) {
  return {
    user: {
      id: 71,
      role,
      tenantId,
      insurerRole,
      openId: "p0b1-hardening-ii",
      isActive: 1,
    },
    req: {},
    res: {},
  } as any;
}

function globalSearchDb(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit }),
        }),
      }),
    }),
  };
}

describe("P0-B1 Publication Hardening II global search procedure", () => {
  it("returns an actionable hold and excludes adversarial stored fraud fields from serialized results", async () => {
    getDbMock.mockResolvedValue(
      globalSearchDb([
        {
          claim: {
            id: 71,
            claimNumber: "P0B1-GS-71",
            kingaRef: "KNG-P0B1-71",
            vehicleMake: "Toyota",
            vehicleModel: "Corolla",
            vehicleYear: 2024,
            vehicleRegistration: "P0B1-71",
            policyNumber: "POL-71",
            incidentDate: "2026-09-23",
            incidentType: "collision",
            status: "assessment_complete",
            workflowState: "manual_review",
            estimatedClaimValue: "1250.00",
            approvedAmount: 1000,
            currencyCode: "USD",
            createdAt: "2026-09-23T08:00:00.000Z",
            updatedAt: "2026-09-23T08:05:00.000Z",
            fraudRiskScore: 99,
            fraudRiskLevel: "high",
            fraudFlags: '["P0B1 forbidden global-search flag"]',
            earlyFraudSuspicion: 1,
          },
          claimant: { name: "Claimant", email: "claimant@example.test" },
        },
      ])
    );

    const caller = analyticsRouter.createCaller(
      context("admin", "tenant-p0b1")
    );
    const response = await caller.globalSearch({ query: "P0B1" });

    expect(response.data).toMatchObject({
      status: "FRAUD_DECISION_WITHHELD",
      reviewRequired: true,
      actionAllowed: false,
      results: [
        {
          id: 71,
          claimNumber: "P0B1-GS-71",
          claimantName: "Claimant",
        },
      ],
    });
    expect(response.data.claims).toEqual(response.data.results);
    expect(JSON.stringify(response.data)).not.toMatch(
      /fraudRiskScore|fraudRiskLevel|fraudFlags|earlyFraudSuspicion|P0B1 forbidden global-search flag/
    );
  });

  it("rejects callers without an analytics role before querying", async () => {
    const caller = analyticsRouter.createCaller(
      context("assessor", "tenant-p0b1")
    );

    await expect(caller.globalSearch({ query: "P0B1" })).rejects.toMatchObject<
      Partial<TRPCError>
    >({ code: "FORBIDDEN" });
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
