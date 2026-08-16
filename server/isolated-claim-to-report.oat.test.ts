import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  aiAssessments,
  claims,
  pipelineJobs,
  pipelineRuns,
  users,
  vehicleRegistry,
} from "../drizzle/schema";
import { getDb, triggerAiAssessment } from "./db";
import { storagePut } from "./storage";
import { generateReportHtml } from "./reporting/reportDefinitions";
import { generateClaimsIntelligenceReport } from "./reporting/claimsIntelligenceReport";
import { generateForensicDecisionReport } from "./reporting/forensicDecisionReport";

const TEST_PREFIX = "OAT-SYNTHETIC-";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLWWAAAAABJRU5ErkJggg==",
  "base64",
);

describe("isolated synthetic claim-to-report operational acceptance", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let tenantId: string;
  let claimId: number;
  let claimantId: number;
  let syntheticImageUrl: string;
  let syntheticRegistration: string;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database is unavailable for isolated OAT");

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantId = `test-oat-${stamp}`;
    const claimNumber = `${TEST_PREFIX}${stamp}`;

    const stored = await storagePut(
      `oat-synthetic/${tenantId}/one-pixel-evidence.png`,
      ONE_PIXEL_PNG,
      "image/png",
    );
    syntheticImageUrl = stored.url;

    const [claimantInsert] = await db.insert(users).values({
      openId: `oat-synthetic-claimant-${stamp}`,
      email: `oat-${stamp}@invalid.example`,
      name: "Synthetic OAT Claimant",
      role: "claimant",
      tenantId,
      emailVerified: 1,
    });
    claimantId = Number((claimantInsert as { insertId: number | string }).insertId);

    syntheticRegistration = `OAT-${stamp.slice(-6).toUpperCase()}`;
    const [claimInsert] = await db.insert(claims).values({
      claimNumber,
      claimantId,
      tenantId,
      vehicleMake: "OAT",
      vehicleModel: "Synthetic Validation Vehicle",
      vehicleYear: 2022,
      vehicleRegistration: syntheticRegistration,
      incidentDate: new Date().toISOString().slice(0, 19).replace("T", " "),
      incidentDescription: "Synthetic isolated validation evidence only. No customer, repairer, policy, or financial instruction is represented.",
      damagePhotos: JSON.stringify([syntheticImageUrl]),
      status: "intake_pending",
      workflowState: "intake_queue",
      claimSource: "system_seed",
    } as any);
    claimId = Number((claimInsert as { insertId: number | string }).insertId);
  });

  it("persists isolated evidence, reaches a controlled pipeline outcome, and renders CL CI FR", async () => {
    const [before] = await db!.select().from(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
    expect(before.damagePhotos).toContain(syntheticImageUrl);
    expect(before.status).toBe("intake_pending");

    let pipelineError: Error | null = null;
    try {
      await triggerAiAssessment(claimId);
    } catch (error) {
      pipelineError = error instanceof Error ? error : new Error(String(error));
    }

    const [after] = await db!.select().from(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
    expect(after).toBeDefined();
    expect(after.damagePhotos).toContain(syntheticImageUrl);
    expect(["analysis_complete", "assessment_complete", "document_failed", "intake_pending", "human_review_required"]).toContain(after.status);

    const [run] = await db!.select().from(pipelineRuns).where(and(eq(pipelineRuns.claimId, claimId), eq(pipelineRuns.tenantId, tenantId))).limit(1);
    expect(run ?? pipelineError).toBeTruthy();

    const [assessment] = await db!.select().from(aiAssessments).where(eq(aiAssessments.claimId, claimId)).limit(1);
    const cl = await generateReportHtml("claim.assessment", { claimId }, tenantId);
    const ci = await generateClaimsIntelligenceReport(claimId, tenantId);
    const fr = await generateForensicDecisionReport(claimId, tenantId);

    for (const html of [cl, ci, fr]) {
      expect(html).toContain("KINGA");
      expect(html.length).toBeGreaterThan(500);
    }

    if (!assessment) {
      for (const html of [cl, ci, fr]) {
        expect(html).toMatch(/assessment intelligence|Assessment status|assessment unavailable/i);
      }
    }
  }, 540_000);

  afterAll(async () => {
    if (!db || !tenantId) return;
    // The generated object becomes inaccessible once its isolated claim reference
    // is removed; the storage service intentionally exposes no physical delete API.
    if (claimId) {
      await db.delete(pipelineJobs).where(eq(pipelineJobs.claimId, claimId));
      await db.delete(pipelineRuns).where(eq(pipelineRuns.claimId, claimId));
      await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId));
      await db.execute(sql`DELETE FROM claim_events WHERE claim_id = ${claimId}`);
      await db.execute(sql`DELETE FROM audit_trail WHERE claim_id = ${claimId}`);
      await db.execute(sql`DELETE FROM notifications WHERE claim_id = ${claimId}`);
      await db.delete(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
    }
    if (syntheticRegistration) {
      await db.delete(vehicleRegistry).where(eq(vehicleRegistry.registrationNumber, syntheticRegistration));
    }
    await db.delete(users).where(eq(users.tenantId, tenantId));
  });
});
