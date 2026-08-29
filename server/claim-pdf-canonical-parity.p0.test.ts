/**
 * Claim PDF canonical latest-assessment parity.
 *
 * Creates only uniquely stamped test records, deliberately writes a stale and
 * a newer assessment with conflicting visible values, and removes every owned
 * child row before deleting the parent claim.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { aiAssessments, claims } from "../drizzle/schema";
import { getDb } from "./db";
import { generateClaimPDFHTML, toClaimPdfCanonicalInput } from "./claim-pdf-export";
import { resolveReportRecord } from "./reporting/resolvedReportRecord";

describe("Claim PDF canonical latest-assessment parity", () => {
  it("renders the tenant-scoped canonical latest assessment rather than the oldest assessment", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable in test");

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ownerTenantId = `claim-pdf-owner-${stamp}`;
    const foreignTenantId = `claim-pdf-foreign-${stamp}`;
    const claimNumber = `PDF-CANON-${stamp}`;
    let claimId: number | undefined;
    let staleAssessmentId: number | undefined;
    let latestAssessmentId: number | undefined;

    try {
      await db.insert(claims).values({
        claimNumber,
        tenantId: ownerTenantId,
        status: "submitted",
        vehicleMake: "Kinga",
        vehicleModel: "Parity Fixture",
        vehicleYear: 2025,
        vehicleRegistration: `PDF-${stamp.slice(-6)}`,
        currencyCode: "USD",
        incidentDescription: "Canonical Claim PDF parity fixture",
        incidentDate: "2025-01-01 08:00:00",
      });
      const insertedClaim = await db.select({ id: claims.id }).from(claims).where(and(
        eq(claims.claimNumber, claimNumber),
        eq(claims.tenantId, ownerTenantId),
      )).limit(1);
      claimId = insertedClaim[0]?.id;
      if (!claimId) throw new Error("Owned Claim PDF test claim was not created");

      await db.insert(aiAssessments).values({
        claimId,
        tenantId: ownerTenantId,
        createdAt: "2025-01-02 08:00:00",
        estimatedCost: 1111,
        fraudRiskLevel: "low",
        confidenceScore: 41,
        damageDescription: `STALE-PDF-ASSESSMENT-${stamp}`,
        causalVerdictJson: JSON.stringify({ thirdPartyLiabilityPct: 0, wrongedParty: "unknown" }),
      });
      const staleRow = await db.select({ id: aiAssessments.id }).from(aiAssessments).where(and(
        eq(aiAssessments.claimId, claimId),
        eq(aiAssessments.damageDescription, `STALE-PDF-ASSESSMENT-${stamp}`),
      )).limit(1);
      staleAssessmentId = staleRow[0]?.id;

      await db.insert(aiAssessments).values({
        claimId,
        tenantId: ownerTenantId,
        createdAt: "2025-02-02 08:00:00",
        estimatedCost: 2222,
        fraudRiskLevel: "critical",
        confidenceScore: 92,
        damageDescription: `LATEST-PDF-ASSESSMENT-${stamp}`,
        causalVerdictJson: JSON.stringify({ thirdPartyLiabilityPct: 80, wrongedParty: "insured" }),
      });
      const latestRow = await db.select({ id: aiAssessments.id }).from(aiAssessments).where(and(
        eq(aiAssessments.claimId, claimId),
        eq(aiAssessments.damageDescription, `LATEST-PDF-ASSESSMENT-${stamp}`),
      )).limit(1);
      latestAssessmentId = latestRow[0]?.id;
      expect(staleAssessmentId).toBeTypeOf("number");
      expect(latestAssessmentId).toBeTypeOf("number");

      const canonical = await resolveReportRecord({
        claimId,
        tenantId: ownerTenantId,
        audience: "audit",
      });
      const pdfInput = toClaimPdfCanonicalInput(canonical);
      const html = generateClaimPDFHTML({
        ...pdfInput,
        quotes: [],
        optimisation: null,
        decisionUser: null,
        panelBeaterChoices: [],
        assignedRepairerName: null,
      });

      expect(canonical.assessment.assessmentId).toBe(latestAssessmentId);
      expect(canonical.assessment.estimatedCost).toBe(2222);
      expect(canonical.assessment.fraudRiskLevel).toBe("critical");
      expect(canonical.assessment.confidenceScore).toBe(92);
      expect(pdfInput.aiAssessment).toMatchObject({
        estimatedCost: 2222,
        fraudRiskLevel: "critical",
        confidenceScore: 92,
        damageDescription: `LATEST-PDF-ASSESSMENT-${stamp}`,
      });
      expect(html).toContain("US$2,222.00");
      expect(html).toContain("CRITICAL");
      expect(html).toContain("92%");
      expect(html).toContain(`LATEST-PDF-ASSESSMENT-${stamp}`);
      expect(html).toContain("Substantial third-party liability (80%)");
      expect(html).not.toContain("US$1,111.00");
      expect(html).not.toContain(`STALE-PDF-ASSESSMENT-${stamp}`);

      await expect(resolveReportRecord({
        claimId,
        tenantId: foreignTenantId,
        audience: "audit",
      })).rejects.toThrow(/not found|tenant/i);
    } finally {
      if (latestAssessmentId) await db.delete(aiAssessments).where(eq(aiAssessments.id, latestAssessmentId));
      if (staleAssessmentId) await db.delete(aiAssessments).where(eq(aiAssessments.id, staleAssessmentId));
      if (claimId) await db.delete(claims).where(eq(claims.id, claimId));
    }
  });
});
