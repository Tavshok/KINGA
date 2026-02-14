import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * KINGA Integration Tests
 * 
 * Tests critical paths against the actual tRPC router:
 * 1. Claims query by status (triage system)
 * 2. Assessor listing
 * 3. PDF export endpoint
 * 4. AI assessment query
 * 5. Image extraction module
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "insurer@kinga.co.za",
    name: "Test Insurer",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Claims Triage Queries", () => {
  it("returns claims filtered by 'submitted' status", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const claims = await caller.claims.byStatus({ status: "submitted" });
    expect(Array.isArray(claims)).toBe(true);
    for (const claim of claims) {
      expect(claim).toHaveProperty("id");
      expect(claim).toHaveProperty("claimNumber");
      expect(claim).toHaveProperty("status");
    }
  });

  it("returns claims filtered by 'triage' status", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const claims = await caller.claims.byStatus({ status: "triage" });
    expect(Array.isArray(claims)).toBe(true);
  });

  it("returns claims filtered by 'assessment_pending' status", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const claims = await caller.claims.byStatus({ status: "assessment_pending" });
    expect(Array.isArray(claims)).toBe(true);
  });

  it("returns claims filtered by 'completed' status", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const claims = await caller.claims.byStatus({ status: "completed" });
    expect(Array.isArray(claims)).toBe(true);
  });

  it("rejects unauthenticated requests", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.claims.byStatus({ status: "submitted" })
    ).rejects.toThrow();
  });

  it("rejects invalid status values", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      // @ts-expect-error - testing invalid input
      caller.claims.byStatus({ status: "invalid_status" })
    ).rejects.toThrow();
  });
});

describe("Assessor Listing", () => {
  it("returns list of assessors", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const assessors = await caller.assessors.list();
    expect(Array.isArray(assessors)).toBe(true);
    for (const assessor of assessors) {
      expect(assessor).toHaveProperty("id");
      expect(assessor).toHaveProperty("name");
    }
  });
});

describe("PDF Export", () => {
  it("generates PDF with valid input data", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.insurers.exportAssessmentPDF({
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleYear: 2022,
      vehicleRegistration: "CA 123-456",
      damageDescription: "Front bumper damage from rear-end collision.",
      estimatedCost: 45000,
      physicsAnalysis: {
        physics_analysis: {
          impact_speed_ms: 12.5,
          kinetic_energy_joules: 78125,
          g_force: 3.2,
        },
        damageConsistency: "consistent",
        confidence: 0.85,
      },
      fraudAnalysis: {
        fraud_probability: 0.15,
        risk_level: "low",
        indicators: {},
        top_risk_factors: [],
      },
      damagePhotos: [],
      damagedComponents: ["Front bumper", "Headlight assembly"],
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("pdfUrl");
    expect(result.pdfUrl).toMatch(/^https?:\/\//);
    expect(result).toHaveProperty("fileName");
  }, 60000);

  it("handles missing optional fields gracefully", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.insurers.exportAssessmentPDF({
      vehicleMake: "Unknown",
      estimatedCost: 10000,
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("pdfUrl");
  }, 60000);

  it("rejects unauthenticated PDF export", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.insurers.exportAssessmentPDF({
        vehicleMake: "Toyota",
      })
    ).rejects.toThrow();
  });
});

describe("Claim Data Integrity", () => {
  it("returns null for non-existent claim ID", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    try {
      const claim = await caller.claims.getById({ id: 999999 });
      expect(claim).toBeFalsy();
    } catch (error: any) {
      expect(error).toBeDefined();
    }
  });
});

describe("AI Assessment Query", () => {
  it("returns null for claim without AI assessment", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const assessment = await caller.aiAssessments.byClaim({ claimId: 999999 });
    expect(assessment).toBeFalsy();
  });
});

describe("Image Extraction Module", () => {
  it("exports extractImagesFromPDFBuffer function", async () => {
    const { extractImagesFromPDFBuffer } = await import("./pdf-image-extractor");
    expect(typeof extractImagesFromPDFBuffer).toBe("function");
  });

  it("returns empty array for invalid PDF buffer", async () => {
    const { extractImagesFromPDFBuffer } = await import("./pdf-image-extractor");
    const result = await extractImagesFromPDFBuffer(Buffer.from("not a pdf"), "test.pdf");
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array for empty buffer", async () => {
    const { extractImagesFromPDFBuffer } = await import("./pdf-image-extractor");
    const result = await extractImagesFromPDFBuffer(Buffer.alloc(0), "empty.pdf");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});
