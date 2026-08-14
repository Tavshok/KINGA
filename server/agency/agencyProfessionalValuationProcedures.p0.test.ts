import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", () => ({ getDb: getDbMock }));

import { agencyInsuranceServiceRouter } from "../routers/agency-insurance-service";

const provenance = JSON.stringify({
  label: "KINGA Market Valuation",
  evidenceStatus: "Market-supported",
  method: "Comparable evidence ledger",
  dataPointsCount: 6,
  priceRangeCents: { low: 900_000, high: 1_100_000 },
  adjustmentsCents: { condition: -25_000, mileage: -10_000, marketTrend: 0 },
  professionalReliability: {
    sourceCoverage: 6,
    vehicleMatch: "matched",
    recency: "current",
    limitations: "No independent insurer valuation is required.",
    requiresHumanReview: false,
  },
  confidence: 0.91,
});

const request = {
  requestNumber: "ASR-TRACE-01",
  clientProposedValueCents: 850_000,
  kingaMarketValuationCents: 1_000_000,
  variancePercent: "-15.00",
  valuationDate: "2026-08-14 10:00:00",
  valuationProvenanceJson: provenance,
  clientAcknowledgementJson: { recorded: true },
};

function context(role: string, tenantId: string | null) {
  return {
    user: { id: 17, role, tenantId, openId: "test-open-id", isActive: 1 },
    req: {},
    res: {},
  } as any;
}

function agencyEvidenceDb(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit }),
      }),
    }),
  };
}

function insurerEvidenceDb(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit }),
          }),
        }),
      }),
    }),
  };
}

describe("P0 professional valuation evidence actual procedures", () => {
  it("returns scoped agency professional evidence without raw confidence or insurer valuation dependency", async () => {
    getDbMock.mockResolvedValue(agencyEvidenceDb([request]));
    const caller = agencyInsuranceServiceRouter.createCaller(context("agency", "agency-1"));

    const result = await caller.getAgencyProfessionalValuationEvidence({ serviceRequestId: 1 });

    expect(result).toMatchObject({
      requestNumber: "ASR-TRACE-01",
      evidence: {
        evidenceStatus: "Market-supported",
        sourceCoverage: 6,
        vehicleMatch: "matched",
        recency: "current",
        limitations: "No independent insurer valuation is required.",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/confidence/i);
    expect(result.decisionBoundary).toContain("decision support only");
  });

  it("returns insurer decision support only for insurer tenant scope and keeps the same bounded evidence fields", async () => {
    getDbMock.mockResolvedValue(insurerEvidenceDb([{ ...request, serviceRequestId: 1, coverType: "comprehensive", vehicleRegistration: "ABC123", vehicleMake: "Toyota", vehicleModel: "Corolla", vehicleYear: 2020, status: "ready_for_insurer_review" }]));
    const caller = agencyInsuranceServiceRouter.createCaller(context("insurer", "insurer-1"));

    const result = await caller.getInsurerDecisionSupport({ limit: 10 });

    expect(result.decisionBoundary).toContain("Decision support only");
    expect(result.requests[0]).toMatchObject({
      requestNumber: "ASR-TRACE-01",
      evidence: { sourceCoverage: 6, vehicleMatch: "matched", recency: "current" },
    });
    expect(JSON.stringify(result)).not.toMatch(/confidence/i);
  });

  it("denies non-insurer access before a professional decision-support projection is read", async () => {
    const caller = agencyInsuranceServiceRouter.createCaller(context("claimant", "tenant-1"));
    await expect(caller.getInsurerDecisionSupport({ limit: 10 })).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
