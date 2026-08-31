import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  auditLogs,
  claimDocuments,
  claimEvents,
  claimIntakeRequests,
  claims,
  insuranceAuditLogs,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { persistCanonicalClaimIntake, type CanonicalIntakeActor } from "../services/canonicalClaimIntake";
import { generateClaimsIntelligenceReport } from "./claimsIntelligenceReport";
import { generateForensicDecisionReport } from "./forensicDecisionReport";
import { resolveReportRecord } from "./resolvedReportRecord";

describe("P0 canonical intake evidence downstream visibility", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let tenantId = "";
  let actorId = 0;
  let claimId = 0;
  let intakeRequestId = 0;
  let documentId = 0;
  const claimEventIds: number[] = [];
  const insuranceAuditLogIds: number[] = [];
  const auditLogIds: string[] = [];
  let expectedFileName = "";

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Live database is required for canonical intake evidence coverage");

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantId = `test-intake-evidence-${stamp}`;
    expectedFileName = `intake-evidence-${stamp}.pdf`;
    const [actorInsert] = await db.insert(users).values({
      openId: `intake-evidence-user-${stamp}`,
      email: `intake-evidence-${stamp}@invalid.example`,
      name: "Canonical Intake Evidence Fixture Actor",
      role: "claimant",
      tenantId,
      emailVerified: 1,
    });
    actorId = Number(actorInsert.insertId);

    const actor: CanonicalIntakeActor = { id: actorId, tenantId, role: "claimant" };
    const idempotencyKey = `intake-evidence-${stamp}`;
    const persisted = await persistCanonicalClaimIntake(actor, {
      idempotencyKey,
      channel: "claimant_portal",
      vehicleMake: "Kinga",
      vehicleModel: "Evidence Fixture",
      vehicleYear: 2024,
      vehicleRegistration: `IE-${stamp.slice(-6).toUpperCase()}`,
      incidentDate: "2026-08-27T09:30:00.000Z",
      incidentLocation: "Test-only canonical intake location",
      incidentDescription: "A test-only document-evidence intake claim.",
      attachments: [{
        key: `claims/${actorId}/intake-evidence/${stamp}/police-report.pdf`,
        url: "https://example.invalid/intake-evidence-police-report.pdf",
        fileName: expectedFileName,
        fileSize: 1,
        mimeType: "application/pdf",
        category: "police_report",
        title: "Test-only police report",
      }],
      repairerPreferences: [],
    });
    claimId = persisted.claimId;

    const [intakeRequest] = await db.select({ id: claimIntakeRequests.id })
      .from(claimIntakeRequests)
      .where(and(
        eq(claimIntakeRequests.tenantId, tenantId),
        eq(claimIntakeRequests.userId, actorId),
        eq(claimIntakeRequests.idempotencyKey, idempotencyKey),
        eq(claimIntakeRequests.claimId, claimId),
      ));
    intakeRequestId = intakeRequest?.id ?? 0;

    const [document] = await db.select({ id: claimDocuments.id })
      .from(claimDocuments)
      .where(and(eq(claimDocuments.claimId, claimId), eq(claimDocuments.uploadedBy, actorId), eq(claimDocuments.fileName, expectedFileName)));
    documentId = document?.id ?? 0;

    const events = await db.select({ id: claimEvents.id }).from(claimEvents)
      .where(and(eq(claimEvents.claimId, claimId), eq(claimEvents.tenantId, tenantId)));
    claimEventIds.push(...events.map((event) => event.id));
    const insuranceLogs = await db.select({ id: insuranceAuditLogs.id }).from(insuranceAuditLogs)
      .where(and(eq(insuranceAuditLogs.entityId, claimId), eq(insuranceAuditLogs.tenantId, tenantId)));
    insuranceAuditLogIds.push(...insuranceLogs.map((entry) => entry.id));
    const auditEntries = await db.select({ id: auditLogs.id }).from(auditLogs)
      .where(and(eq(auditLogs.resourceId, String(claimId)), eq(auditLogs.tenantId, tenantId)));
    auditLogIds.push(...auditEntries.map((entry) => entry.id));
  });

  it("preserves an intake-persisted document in the canonical claim record", async () => {
    const record = await resolveReportRecord({ claimId, tenantId, audience: "claim_assessment" });

    expect(documentId).toBeGreaterThan(0);
    expect(record.evidence.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentCategory: "police_report",
        fileName: expectedFileName,
        fileUrl: "https://example.invalid/intake-evidence-police-report.pdf",
      }),
    ]));
  });

  it("renders the same canonical intake document evidence in Claims Intelligence and Forensic reports", async () => {
    const record = await resolveReportRecord({ claimId, tenantId, audience: "claim_assessment" });
    const canonicalDocument = record.evidence.documents.find((document) => document.fileName === expectedFileName);
    expect(canonicalDocument).toBeDefined();
    expect(canonicalDocument?.documentCategory).toBe("police_report");

    const [claimsIntelligenceHtml, forensicHtml] = await Promise.all([
      generateClaimsIntelligenceReport(claimId, tenantId),
      generateForensicDecisionReport(claimId, tenantId),
    ]);

    // Renderers deliberately present the canonical category as a human-readable
    // label; exact file metadata remains asserted against the canonical record.
    expect(claimsIntelligenceHtml).toContain("Police Report");
    expect(forensicHtml).toContain("police report");
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of auditLogIds) await db.delete(auditLogs).where(and(eq(auditLogs.id, id), eq(auditLogs.tenantId, tenantId)));
    for (const id of insuranceAuditLogIds) await db.delete(insuranceAuditLogs).where(and(eq(insuranceAuditLogs.id, id), eq(insuranceAuditLogs.entityId, claimId), eq(insuranceAuditLogs.tenantId, tenantId)));
    for (const id of claimEventIds) await db.delete(claimEvents).where(and(eq(claimEvents.id, id), eq(claimEvents.claimId, claimId), eq(claimEvents.tenantId, tenantId)));
    if (documentId) await db.delete(claimDocuments).where(and(eq(claimDocuments.id, documentId), eq(claimDocuments.claimId, claimId), eq(claimDocuments.uploadedBy, actorId)));
    if (intakeRequestId) await db.delete(claimIntakeRequests).where(and(eq(claimIntakeRequests.id, intakeRequestId), eq(claimIntakeRequests.claimId, claimId), eq(claimIntakeRequests.tenantId, tenantId)));
    if (claimId) await db.delete(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
    if (actorId) await db.delete(users).where(and(eq(users.id, actorId), eq(users.tenantId, tenantId)));

    if (documentId) {
      const leakedDocuments = await db.select({ id: claimDocuments.id }).from(claimDocuments).where(eq(claimDocuments.id, documentId));
      expect(leakedDocuments).toHaveLength(0);
    }
    if (claimId) {
      const leakedClaims = await db.select({ id: claims.id }).from(claims).where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
      expect(leakedClaims).toHaveLength(0);
    }
  });
});
