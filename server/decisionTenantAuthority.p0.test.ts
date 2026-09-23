import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { decisionRouter } from "./routers/decision";
import { aiAssessments, claims } from "../drizzle/schema";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/decision.ts"),
  "utf8"
);

function block(from: string, to: string) {
  return source.slice(source.indexOf(from), source.indexOf(to));
}

describe("decision intelligence tenant authority", () => {
  it("tenant-scopes decision summary evidence and preserves a session-tenant check before the contradiction hold", () => {
    const decisionSummary = block(
      "getDecisionSummary: protectedProcedure",
      "checkContradictions: protectedProcedure"
    );
    const contradictionSummary = block(
      "getContradictionStats: protectedProcedure",
      "generateDecisionTrace: protectedProcedure"
    );
    for (const section of [decisionSummary]) {
      expect(section).toContain("ctx.user?.tenantId");
      expect(section).toContain("eq(aiAssessments.tenantId, tenantId)");
      expect(section).toContain("eq(claims.tenantId, tenantId)");
    }
    expect(contradictionSummary).toContain("ctx.user?.tenantId");
    expect(contradictionSummary).toContain(
      'status: "CONTRADICTION_DECISION_WITHHELD"'
    );
    expect(contradictionSummary.indexOf("ctx.user?.tenantId")).toBeLessThan(
      contradictionSummary.indexOf('status: "CONTRADICTION_DECISION_WITHHELD"')
    );
  });

  it("tenant-scopes direct claim decision traces", () => {
    const trace = block(
      "getDecisionTrace: protectedProcedure",
      "checkReportReadiness: protectedProcedure"
    );
    expect(trace).toContain("ctx.user?.tenantId");
    expect(trace).toContain("eq(aiAssessments.claimId, input.claimId)");
    expect(trace).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(trace).toContain("eq(claims.tenantId, tenantId)");
    expect(trace.indexOf("eq(claims.tenantId, tenantId)")).toBeLessThan(
      trace.indexOf("buildP0B1DecisionTraceHold")
    );
  });

  it("tenant-scopes readiness, explanation, routing, and escalation evidence", () => {
    const readiness = block(
      "getReadinessSummary: protectedProcedure",
      "generateClaimExplanation: protectedProcedure"
    );
    const explanation = block(
      "getClaimExplanation: protectedProcedure",
      "routeClaim: protectedProcedure"
    );
    const routing = block(
      "routeClaimById: protectedProcedure",
      "getEscalationSummary: protectedProcedure"
    );
    const escalation = source.slice(
      source.indexOf("getEscalationSummary: protectedProcedure")
    );

    for (const section of [readiness, explanation, routing, escalation]) {
      expect(section).toContain("ctx.user?.tenantId");
      expect(section).toContain("eq(aiAssessments.tenantId, tenantId)");
      expect(section).toContain("eq(claims.tenantId, tenantId)");
    }
  });
});

describe("decision trace P0 hold authorization ordering", () => {
  const fixtureStamp = `decision-trace-p0-b1a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantA = `${fixtureStamp}-a`;
  const tenantB = `${fixtureStamp}-b`;
  let foreignClaimId = 0;
  let foreignAssessmentId = 0;

  const insertId = (result: unknown): number => {
    const value = Number(
      (result as any)[0]?.insertId ?? (result as any).insertId
    );
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error("Expected an owned decision-trace fixture ID");
    return value;
  };

  const callerFor = (tenantId: string | null) =>
    decisionRouter.createCaller({
      user: {
        id: 90401,
        openId: `decision-trace-p0-b1a-${tenantId ?? "none"}`,
        name: "Decision Trace P0-B1a Fixture",
        email: "decision-trace-p0-b1a@example.invalid",
        role: "insurer",
        tenantId,
      },
      req: {} as any,
      res: {} as any,
    } as any);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    foreignClaimId = insertId(
      await db.insert(claims).values({
        claimNumber: `P0-B1A-TRACE-${fixtureStamp}`,
        tenantId: tenantB,
        vehicleMake: "Fixture Motors",
        vehicleModel: "Decision Trace",
        vehicleYear: 2020,
        vehicleRegistration: `DT${fixtureStamp.slice(-8).toUpperCase()}`,
        incidentDate: new Date().toISOString().slice(0, 19).replace("T", " "),
        incidentDescription: "Owned decision-trace tenant-authority fixture.",
        incidentLocation: "Fixture location",
        policyNumber: `P0-B1A-POLICY-${fixtureStamp}`,
        status: "intake_pending",
        workflowState: "created",
        incidentType: "collision",
      })
    );
    foreignAssessmentId = insertId(
      await db.insert(aiAssessments).values({
        claimId: foreignClaimId,
        tenantId: tenantB,
        confidenceScore: 90,
        fraudScore: 5,
        damageDescription: "Owned decision-trace fixture assessment.",
      })
    );
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (foreignAssessmentId > 0)
      await db
        .delete(aiAssessments)
        .where(eq(aiAssessments.id, foreignAssessmentId));
    if (foreignClaimId > 0)
      await db.delete(claims).where(eq(claims.id, foreignClaimId));
    if (foreignAssessmentId > 0) {
      expect(
        await db
          .select({ id: aiAssessments.id })
          .from(aiAssessments)
          .where(eq(aiAssessments.id, foreignAssessmentId))
      ).toHaveLength(0);
    }
    if (foreignClaimId > 0) {
      expect(
        await db
          .select({ id: claims.id })
          .from(claims)
          .where(eq(claims.id, foreignClaimId))
      ).toHaveLength(0);
    }
  });

  it("returns FORBIDDEN for a tenantless session before claim lookup or P0 hold", async () => {
    await expect(
      callerFor(null).getDecisionTrace({ claimId: foreignClaimId })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "A tenant-scoped session is required",
    });
  });

  it("returns null rather than a hold or trace for a cross-tenant claim", async () => {
    await expect(
      callerFor(tenantA).getDecisionTrace({ claimId: foreignClaimId })
    ).resolves.toBeNull();
  });
});
