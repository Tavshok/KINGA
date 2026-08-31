import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { aiAssessments, claims } from "../drizzle/schema";
import { getDb } from "./db";
import {
  assessmentPdfExportInputSchema,
  generateAssessmentReportHTML,
  toAssessmentPdfCanonicalInput,
} from "./pdf-export";
import { resolveReportRecord } from "./reporting/resolvedReportRecord";

describe("Assessment PDF server authority", () => {
  it("renders canonical persisted values, strips injected report values, and denies a foreign tenant", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable in test");
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tenantId = `assessment-pdf-owner-${stamp}`;
    const foreignTenantId = `assessment-pdf-foreign-${stamp}`;
    let claimId: number | undefined;
    let assessmentId: number | undefined;
    try {
      await db.insert(claims).values({
        claimNumber: `ASSESS-PDF-${stamp}`, tenantId, status: "submitted",
        vehicleMake: "Kinga", vehicleModel: "Authority", vehicleYear: 2025,
        vehicleRegistration: `APDF-${stamp.slice(-6)}`, currencyCode: "USD",
        incidentDescription: `CANONICAL-INCIDENT-${stamp}`, incidentDate: "2025-02-01 08:00:00",
      });
      const row = await db.select({ id: claims.id }).from(claims).where(and(
        eq(claims.claimNumber, `ASSESS-PDF-${stamp}`), eq(claims.tenantId, tenantId),
      )).limit(1);
      claimId = row[0]?.id;
      if (!claimId) throw new Error("Owned assessment-PDF test claim was not created");
      await db.insert(aiAssessments).values({
        claimId, tenantId, createdAt: "2025-02-02 08:00:00", estimatedCost: 2222,
        fraudRiskLevel: "critical", damageDescription: `CANONICAL-DAMAGE-${stamp}`,
      });
      const assessment = await db.select({ id: aiAssessments.id }).from(aiAssessments).where(and(
        eq(aiAssessments.claimId, claimId), eq(aiAssessments.damageDescription, `CANONICAL-DAMAGE-${stamp}`),
      )).limit(1);
      assessmentId = assessment[0]?.id;

      // Runtime parser admits only a claim identifier; injected presentation fields are stripped.
      expect(assessmentPdfExportInputSchema.parse({ claimId, estimatedCost: 1, damageDescription: "TAMPERED" }))
        .toEqual({ claimId });
      const canonical = await resolveReportRecord({ claimId, tenantId, audience: "claim_assessment" });
      const html = generateAssessmentReportHTML(toAssessmentPdfCanonicalInput(canonical));
      expect(html).toContain("2,222");
      expect(html).toContain(`CANONICAL-DAMAGE-${stamp}`);
      expect(html).not.toContain("TAMPERED");
      await expect(resolveReportRecord({ claimId, tenantId: foreignTenantId, audience: "claim_assessment" }))
        .rejects.toThrow(/not found|tenant/i);
    } finally {
      if (assessmentId) await db.delete(aiAssessments).where(eq(aiAssessments.id, assessmentId));
      if (claimId) await db.delete(claims).where(eq(claims.id, claimId));
    }
  });
});
