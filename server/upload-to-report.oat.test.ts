import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  aiAssessments,
  claims,
  ingestionBatches,
  ingestionDocuments,
  pipelineJobs,
  pipelineRuns,
  users,
  vehicleRegistry,
} from "../drizzle/schema";
import { getDb } from "./db";
import { generateReportHtml } from "./reporting/reportDefinitions";
import { generateClaimsIntelligenceReport } from "./reporting/claimsIntelligenceReport";
import { generateForensicDecisionReport } from "./reporting/forensicDecisionReport";
import { COOKIE_NAME } from "../shared/const";

const { sdk } = await import("./_core/sdk");
const { uploadDocumentsRouter } = await import("./upload-documents");

const TEST_PREFIX = "OAT-UPLOAD-";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLWWAAAAABJRU5ErkJggg==",
  "base64",
);

async function waitForCompletedAssessment(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, claimId: number, tenantId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const [claim] = await db.select().from(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId))).limit(1);
    if (claim?.aiAssessmentCompleted === 1) return claim;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for isolated upload claim ${claimId} to complete its assessment`);
}

describe("isolated authenticated upload-to-report operational acceptance", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let tenantId: string;
  let uploaderId: number;
  let server: Server;
  let origin: string;
  let claimId = 0;
  let batchId = 0;
  let syntheticVehicleRegistryId = 0;
  let sessionCookie: string;

  beforeAll(async () => {
    const connection = await getDb();
    if (!connection) throw new Error("Database is unavailable for isolated upload OAT");
    db = connection;

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantId = `test-upload-oat-${stamp}`;
    const openId = `oat-upload-user-${stamp}`;
    const [userInsert] = await db.insert(users).values({
      openId,
      email: `oat-upload-${stamp}@invalid.example`,
      name: "Synthetic Upload OAT User",
      role: "insurer",
      insurerRole: "claims_processor",
      tenantId,
      emailVerified: 1,
    });
    uploaderId = Number((userInsert as { insertId: number | string }).insertId);
    sessionCookie = await sdk.createSessionToken(openId, { name: "Synthetic Upload OAT User" });

    const app = express();
    app.use("/api", uploadDocumentsRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to establish isolated upload test server");
    origin = `http://127.0.0.1:${address.port}`;
  });

  it("creates the canonical upload intake records, runs assessment, and renders CL CI FR", async () => {
    const requestBody = new FormData();
    requestBody.append("files", new Blob([ONE_PIXEL_PNG], { type: "image/png" }), "synthetic-oat-evidence.png");
    requestBody.append("batch_name", "Synthetic Upload-to-Report OAT");
    requestBody.append("ingestion_source", "processor_upload");
    requestBody.append("claim_number", `${TEST_PREFIX}${Date.now()}`);

    const response = await fetch(`${origin}/api/upload-documents`, {
      method: "POST",
      body: requestBody,
      headers: { cookie: `${COOKIE_NAME}=${sessionCookie}` },
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { batch_db_id: number; uploaded: number; documents: Array<{ claim_id: number; document_db_id: number; status: string }> };
    expect(payload.uploaded).toBe(1);
    expect(payload.documents[0]).toMatchObject({ status: "uploaded" });
    claimId = payload.documents[0]!.claim_id;
    batchId = payload.batch_db_id;

    const [intakeClaim] = await db.select().from(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId))).limit(1);
    const [document] = await db.select().from(ingestionDocuments).where(and(eq(ingestionDocuments.id, payload.documents[0]!.document_db_id), eq(ingestionDocuments.tenantId, tenantId))).limit(1);
    expect(intakeClaim).toMatchObject({ id: claimId, sourceDocumentId: document.id, claimSource: "document_ingestion" });
    expect(document).toMatchObject({ historicalClaimId: claimId, extractionStatus: "pending", hashVerified: 1 });

    const completedClaim = await waitForCompletedAssessment(db, claimId, tenantId);
    expect(completedClaim.aiAssessmentCompleted).toBe(1);
    expect(["analysis_complete", "assessment_complete", "human_review_required"]).toContain(completedClaim.status);

    const [syntheticVehicle] = await db.select({ id: vehicleRegistry.id })
      .from(vehicleRegistry)
      .where(eq(vehicleRegistry.tenantId, tenantId))
      .limit(1);
    syntheticVehicleRegistryId = syntheticVehicle?.id ?? 0;

    const [run] = await db.select().from(pipelineRuns).where(and(eq(pipelineRuns.claimId, claimId), eq(pipelineRuns.tenantId, tenantId))).limit(1);
    const [assessment] = await db.select().from(aiAssessments).where(eq(aiAssessments.claimId, claimId)).limit(1);
    expect(run).toBeDefined();
    expect(assessment).toBeDefined();

    const cl = await generateReportHtml("claim.assessment", { claimId }, tenantId);
    const ci = await generateClaimsIntelligenceReport(claimId, tenantId);
    const fr = await generateForensicDecisionReport(claimId, tenantId);
    for (const html of [cl, ci, fr]) {
      expect(html).toContain("KINGA");
      expect(html.length).toBeGreaterThan(500);
    }
  }, 540_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!db || !tenantId) return;

    if (claimId) {
      await db.delete(pipelineJobs).where(eq(pipelineJobs.claimId, claimId));
      await db.delete(pipelineRuns).where(eq(pipelineRuns.claimId, claimId));
      await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId));
      await db.execute(sql`DELETE FROM claim_events WHERE claim_id = ${claimId}`);
      await db.execute(sql`DELETE FROM audit_trail WHERE claim_id = ${claimId}`);
      await db.execute(sql`DELETE FROM notifications WHERE claim_id = ${claimId}`);
      await db.delete(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
    }
    if (syntheticVehicleRegistryId) {
      await db.delete(vehicleRegistry).where(and(eq(vehicleRegistry.id, syntheticVehicleRegistryId), eq(vehicleRegistry.tenantId, tenantId)));
    }
    await db.delete(ingestionDocuments).where(eq(ingestionDocuments.tenantId, tenantId));
    await db.delete(ingestionBatches).where(and(eq(ingestionBatches.id, batchId), eq(ingestionBatches.tenantId, tenantId)));
    await db.delete(users).where(eq(users.tenantId, tenantId));
  });
});
