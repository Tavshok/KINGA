import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { claimDocuments, claimIntakeRequests, claims } from "../../drizzle/schema";
import { createAuditEntry, createNotification, emitClaimEvent, generateKingaRef, getDb, triggerAiAssessment } from "../db";

export type CanonicalIntakeActor = { id: number; tenantId: string; role: string; uploadKeyPrefixes?: string[] };
export type CanonicalAttachment = { key: string; url: string; fileName: string; fileSize: number; mimeType: string; category: "damage_photo" | "repair_quote" | "invoice" | "police_report" | "medical_report" | "insurance_policy" | "correspondence" | "other"; title?: string; description?: string };
export type CanonicalClaimInput = {
  idempotencyKey: string; channel: string; vehicleMake: string; vehicleModel: string; vehicleYear?: number; vehicleRegistration: string;
  incidentDate: string; incidentLocation: string; incidentDescription: string; incidentTime?: string; incidentType?: "collision" | "theft" | "hail" | "fire" | "vandalism" | "flood" | "hijacking" | "other";
  policyNumber?: string; vehicleVin?: string; vehicleColor?: string; vehicleMileage?: string; vehicleEngineNumber?: string; currencyCode?: string;
  claimantPhone?: string; thirdPartyName?: string; thirdPartyVehicle?: string; thirdPartyRegistration?: string; thirdPartyInsurer?: string; policeReportNumber?: string; policeStation?: string; witnessName?: string; witnessPhone?: string;
  attachments: CanonicalAttachment[]; repairerPreferences: string[]; claimantType?: "individual" | "company"; companyName?: string; companyRegistration?: string; claimantDepartment?: string; fleetAccountId?: number; fleetDriverId?: number; sourceMetadata?: Record<string, unknown>;
};

const hasText = (value?: string | null) => value?.trim() || null;
const hashInput = (input: CanonicalClaimInput) => crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
const claimNumber = () => `CLM-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

export function assertCanonicalAttachmentOwnership(actor: CanonicalIntakeActor, attachments: CanonicalAttachment[]) {
  const seen = new Set<string>();
  for (const attachment of attachments) {
    const allowed = attachment.key.startsWith(`claims/${actor.id}/`) || attachment.key.startsWith(`claim-forms/${actor.id}/`) || actor.uploadKeyPrefixes?.some((prefix) => attachment.key.startsWith(prefix));
    if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "An attachment is not owned by this authenticated intake session." });
    if (!attachment.url || !attachment.fileName || !attachment.mimeType || attachment.fileSize < 0 || seen.has(attachment.key)) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment metadata is incomplete or duplicated." });
    seen.add(attachment.key);
  }
}

export function repairerPreferenceOutcome(preferences: string[]) {
  const supplied = preferences.filter(Boolean);
  const accepted = [...new Set(supplied)];
  const warnings: string[] = [];
  if (!accepted.length) warnings.push("no_repairer_preference_supplied");
  if (accepted.length !== supplied.length) warnings.push("duplicate_repairer_preference_removed");
  if (accepted.length < 3) warnings.push("repairer_preference_exception_requires_operational_routing");
  return { accepted, warnings };
}

function assertClaimTenant(claim: { tenantId: string | null } | undefined, tenantId: string) {
  if (!claim || claim.tenantId !== tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "The canonical intake record is not available in this tenant." });
}

export async function persistCanonicalClaimIntake(actor: CanonicalIntakeActor, input: CanonicalClaimInput) {
  if (!actor.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant is required for claim intake." });
  assertCanonicalAttachmentOwnership(actor, input.attachments);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
  const requestHash = hashInput(input);
  const lookup = and(eq(claimIntakeRequests.tenantId, actor.tenantId), eq(claimIntakeRequests.userId, actor.id), eq(claimIntakeRequests.idempotencyKey, input.idempotencyKey));
  const [prior] = await db.select().from(claimIntakeRequests).where(lookup).limit(1);
  if (prior?.claimId) {
    if (prior.requestHash !== requestHash) throw new TRPCError({ code: "CONFLICT", message: "This idempotency key belongs to a different claim submission." });
    const [claim] = await db.select().from(claims).where(and(eq(claims.id, prior.claimId), eq(claims.tenantId, actor.tenantId))).limit(1);
    assertClaimTenant(claim, actor.tenantId);
    return { claimId: claim.id, claimNumber: claim.claimNumber, idempotent: true, repairerWarnings: [] as string[] };
  }
  const { accepted, warnings } = repairerPreferenceOutcome(input.repairerPreferences);
  const number = claimNumber();
  const kingaRef = await generateKingaRef(actor.tenantId);
  let created: { id: number; claimNumber: string } | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(claimIntakeRequests).values({ tenantId: actor.tenantId, userId: actor.id, idempotencyKey: input.idempotencyKey, requestHash, channel: input.channel, status: "persisted" });
      const [inserted] = await tx.insert(claims).values({
        claimantId: actor.id, tenantId: actor.tenantId, claimNumber: number, kingaRef, claimantPhone: hasText(input.claimantPhone), vehicleMake: hasText(input.vehicleMake), vehicleModel: hasText(input.vehicleModel), vehicleYear: input.vehicleYear, vehicleRegistration: hasText(input.vehicleRegistration), vehicleVin: hasText(input.vehicleVin), vehicleColor: hasText(input.vehicleColor), vehicleMileage: hasText(input.vehicleMileage), vehicleEngineNumber: hasText(input.vehicleEngineNumber), policyNumber: hasText(input.policyNumber), incidentDate: new Date(input.incidentDate).toISOString(), incidentTime: hasText(input.incidentTime), incidentLocation: hasText(input.incidentLocation), incidentDescription: hasText(input.incidentDescription), incidentType: input.incidentType, thirdPartyName: hasText(input.thirdPartyName), thirdPartyVehicle: hasText(input.thirdPartyVehicle), thirdPartyRegistration: hasText(input.thirdPartyRegistration), thirdPartyInsurer: hasText(input.thirdPartyInsurer), policeReportNumber: hasText(input.policeReportNumber), policeStation: hasText(input.policeStation), witnessName: hasText(input.witnessName), witnessPhone: hasText(input.witnessPhone), damagePhotos: JSON.stringify(input.attachments.filter((a) => a.category === "damage_photo").map((a) => a.url)), supportingDocuments: JSON.stringify(input.attachments.filter((a) => a.category !== "damage_photo")), selectedPanelBeaterIds: JSON.stringify(accepted), panelBeaterChoice1: accepted[0] ?? null, panelBeaterChoice2: accepted[1] ?? null, panelBeaterChoice3: accepted[2] ?? null, claimantType: input.claimantType ?? "individual", claimantCompanyName: hasText(input.companyName), claimantCompanyReg: hasText(input.companyRegistration), claimantDepartment: hasText(input.claimantDepartment), fleetAccountId: input.fleetAccountId ?? null, fleetDriverId: input.fleetDriverId ?? null, status: "intake_pending", workflowState: "intake_queue", documentProcessingStatus: "pending", claimSource: input.channel, aiAssessmentTriggered: 0, aiAssessmentCompleted: 0, currencyCode: input.currencyCode ?? "USD", metadata: { canonicalIntakeVersion: 1, repairerWarnings: warnings, attachmentCount: input.attachments.length, sourceMetadata: input.sourceMetadata ?? {} },
      });
      const claimId = Number((inserted as { insertId: number }).insertId);
      for (const attachment of input.attachments) await tx.insert(claimDocuments).values({ claimId, uploadedBy: actor.id, fileName: attachment.fileName, fileKey: attachment.key, fileUrl: attachment.url, fileSize: attachment.fileSize, mimeType: attachment.mimeType, documentTitle: attachment.title ?? null, documentDescription: attachment.description ?? null, documentCategory: attachment.category, visibleToRoles: JSON.stringify(["insurer", "assessor", "panel_beater", "claimant"]) });
      await tx.update(claimIntakeRequests).set({ claimId }).where(lookup);
      created = { id: claimId, claimNumber: number };
    });
  } catch (error) {
    const [race] = await db.select().from(claimIntakeRequests).where(lookup).limit(1);
    if (race?.claimId && race.requestHash === requestHash) {
      const [claim] = await db.select().from(claims).where(and(eq(claims.id, race.claimId), eq(claims.tenantId, actor.tenantId))).limit(1);
      assertClaimTenant(claim, actor.tenantId);
      return { claimId: claim.id, claimNumber: claim.claimNumber, idempotent: true, repairerWarnings: [] as string[] };
    }
    throw error;
  }
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Claim intake was not persisted." });
  await createAuditEntry({ claimId: created.id, userId: actor.id, action: "canonical_claim_intake_persisted", entityType: "claim", changeDescription: `Canonical ${input.channel} intake persisted with ${input.attachments.length} attachments.` });
  await emitClaimEvent({ claimId: created.id, eventType: "claim_submitted", payload: { intakeChannel: input.channel, attachmentCount: input.attachments.length, repairerWarnings: warnings }, userId: actor.id, userRole: actor.role });
  return { claimId: created.id, claimNumber: created.claimNumber, idempotent: false, repairerWarnings: warnings };
}

export async function startCanonicalIntakeAssessment(actor: CanonicalIntakeActor, claimId: number, idempotencyKey: string) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const where = and(eq(claimIntakeRequests.tenantId, actor.tenantId), eq(claimIntakeRequests.userId, actor.id), eq(claimIntakeRequests.idempotencyKey, idempotencyKey), eq(claimIntakeRequests.claimId, claimId));
  const [request] = await db.select().from(claimIntakeRequests).where(where).limit(1);
  if (!request || request.tenantId !== actor.tenantId || request.userId !== actor.id) throw new TRPCError({ code: "NOT_FOUND", message: "The canonical intake request is not available in this tenant." });
  if (["assessment_starting", "assessment_started", "assessment_start_failed"].includes(request.status)) {
    return { status: request.status === "assessment_start_failed" ? "recoverable_failure" as const : "already_recorded" as const };
  }
  await db.update(claimIntakeRequests).set({ status: "assessment_starting" }).where(where);
  try {
    await triggerAiAssessment(claimId);
    await db.update(claimIntakeRequests).set({ status: "assessment_started" }).where(where);
    return { status: "started" as const };
  }
  catch (error) {
    await db.update(claims).set({ status: "intake_pending", workflowState: "intake_queue", documentProcessingStatus: "ASSESSMENT_START_FAILED" }).where(and(eq(claims.id, claimId), eq(claims.tenantId, actor.tenantId)));
    await db.update(claimIntakeRequests).set({ status: "assessment_start_failed" }).where(where);
    await createNotification({ userId: actor.id, title: "Claim received — assessment start needs attention", message: `Claim ${claimId} was saved with all evidence and queued for operational attention.`, type: "system_alert", claimId, entityType: "claim", entityId: claimId, priority: "high" });
    await createAuditEntry({ claimId, userId: actor.id, action: "assessment_start_recoverable_failure", entityType: "claim", changeDescription: error instanceof Error ? error.message : "Unknown assessment-start failure" });
    return { status: "recoverable_failure" as const };
  }
}
