/**
 * KINGA Assessment DB Module
 * AI assessments, assessor evaluations, quotes, appointments.
 * Extracted from server/db.ts — Aug 2026.
 */
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  aiAssessments, InsertAiAssessment, assessorEvaluations, InsertAssessorEvaluation,
  panelBeaterQuotes, InsertPanelBeaterQuote, appointments, InsertAppointment,
} from "../../drizzle/schema";
import { getDb } from "../db-core";

export async function createAiAssessment(data: InsertAiAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(aiAssessments).values(data);
  
  // Mark claim as KINGA assessment completed
  await db.update(claims).set({ 
    aiAssessmentCompleted: 1,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, data.claimId));
  
  return result;
}

export async function getAiAssessmentByClaimId(claimId: number, tenantId?: string) {
  const { parsePhysicsAnalysis } = await import('../../shared/physics-types');
  const db = await getDb();
  if (!db) return null;
  let rawAssessment: typeof aiAssessments.$inferSelect | null = null;
  let claimRow: typeof claims.$inferSelect | null = null;

  // Always query by claimId directly — no innerJoin tenant filter.
  // The tenantId parameter is intentionally ignored here: claimId already uniquely
  // identifies the assessment, and the innerJoin pattern was silently dropping rows
  // when ctx.user.tenantId !== claim.tenantId (the "default" fallback bug).
  const [assessmentResult, claimResult] = await Promise.all([
    db.select().from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(desc(aiAssessments.id))
      .limit(1),
    db.select().from(claims)
      .where(eq(claims.id, claimId))
      .limit(1),
  ]);
  rawAssessment = assessmentResult.length > 0 ? assessmentResult[0] : null;
  claimRow = claimResult.length > 0 ? claimResult[0] : null;
  if (tenantId && claimRow && claimRow.tenantId !== tenantId) return null;

  if (!rawAssessment) return null;

  // Parse physicsAnalysis JSON with typed helper
  return {
    ...rawAssessment,
    physicsAnalysisParsed: parsePhysicsAnalysis(rawAssessment.physicsAnalysis),
    // ── Claim fields (joined) — used by the report router so it doesn't need
    //    a separate query. These are the authoritative values from the claims table.
    claimNumber: claimRow?.claimNumber ?? (rawAssessment as any).claimNumber ?? null,
    vehicleMake: claimRow?.vehicleMake ?? null,
    vehicleModel: claimRow?.vehicleModel ?? null,
    vehicleYear: claimRow?.vehicleYear ?? null,
    vehicleRegistration: claimRow?.vehicleRegistration ?? null,
    accidentDate: claimRow?.incidentDate ?? null,
    accidentLocation: claimRow?.incidentLocation ?? null,
    accidentDescription: claimRow?.incidentDescription ?? null,
    normalisedDescription: claimRow?.normalisedDescription ?? null,
    reportedCauseLabel: claimRow?.reportedCauseLabel ?? null,
    policyNumber: claimRow?.policyNumber ?? null,
    currencyCode: claimRow?.currencyCode ?? null,
    countryCode: (claimRow as any)?.countryCode ?? null,
    // Product type (e.g. COMPREHENSIVE, EXCESS) — stored on claims table
    productType: (claimRow as any)?.productType ?? null,
    // Claim reference from claims table (e.g. KNG-TENANT17-2026-000016-CL)
    claimReference: claimRow?.claimReference ?? null,
    // Insurer name from claims table
    insurerName: claimRow?.insurerName ?? null,
    // Claimant name from claims table
    claimantName: (claimRow as any)?.claimantName ?? null,
  };
}

// ============================================================================
// ASSESSOR EVALUATION OPERATIONS
// ============================================================================

export async function createAssessorEvaluation(data: InsertAssessorEvaluation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessorEvaluations).values(data);
  return result;
}

export async function getAssessorEvaluationByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return null;
  // Enforce tenant isolation: when tenantId is provided, filter by it to prevent cross-tenant access.
  const conditions = tenantId
    ? and(eq(assessorEvaluations.claimId, claimId), eq(assessorEvaluations.tenantId, tenantId))
    : eq(assessorEvaluations.claimId, claimId);
  const result = await db.select().from(assessorEvaluations).where(conditions).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateAssessorEvaluation(id: number, data: Partial<InsertAssessorEvaluation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessorEvaluations).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(assessorEvaluations.id, id));
}

// ============================================================================
// PANEL BEATER QUOTE OPERATIONS
// ============================================================================

export async function createPanelBeaterQuote(data: InsertPanelBeaterQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaterQuotes).values(data);
  return result;
}

export async function getQuotesByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];
  // Always join panelBeaters so repairerName is available for the forensic report column headers
  if (tenantId) {
    const result = await db
      .select({ quote: panelBeaterQuotes, pbName: panelBeaters.businessName })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .leftJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
      .where(and(eq(panelBeaterQuotes.claimId, claimId), eq(claims.tenantId, tenantId)));
    return result.map(r => ({ ...r.quote, repairerName: r.pbName ?? undefined }));
  } else {
    const result = await db
      .select({ quote: panelBeaterQuotes, pbName: panelBeaters.businessName })
      .from(panelBeaterQuotes)
      .leftJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
      .where(eq(panelBeaterQuotes.claimId, claimId));
    return result.map(r => ({ ...r.quote, repairerName: r.pbName ?? undefined }));
  }
}

export async function getQuoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateQuote(id: number, data: Partial<InsertPanelBeaterQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(panelBeaterQuotes).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(panelBeaterQuotes.id, id));
}

export async function getQuotesByPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ quote: panelBeaterQuotes })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .where(and(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(panelBeaterQuotes.createdAt));
    return result.map(r => r.quote);
  } else {
    return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId)).orderBy(desc(panelBeaterQuotes.createdAt));
  }
}

// ============================================================================
// APPOINTMENT OPERATIONS
// ============================================================================

export async function createAppointment(data: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(appointments).values(data);
  return result;
}

export async function getAppointmentsByAssessor(assessorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.assessorId, assessorId)).orderBy(desc(appointments.scheduledDate));
}

export async function getAppointmentsByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.claimId, claimId)).orderBy(desc(appointments.scheduledDate));
}

export async function updateAppointmentStatus(id: number, status: typeof appointments.$inferSelect.status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments).set({ status, updatedAt: new Date().toISOString() }).where(eq(appointments.id, id));
}

// ============================================================================
// AUDIT TRAIL OPERATIONS
// ============================================================================

