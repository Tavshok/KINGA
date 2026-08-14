import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isAdminRole } from "@shared/role-permissions";
import { agencyDomainProcedure as agencyProcedure } from "../_core/domain-middleware";
import { protectedProcedure, requireTenantScope, router } from "../_core/trpc";
import {
  agencyAssistedClaimantIdentities,
  agencyClients,
  agencyInsuranceServiceRequestInsurers,
  agencyInsuranceServiceRequests,
  agencyInsuranceValuationDeviations,
  insurerTenants,
  users,
  vehicleConditionSnapshots,
  vehicleRegistry,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { valuateVehicle } from "../services/vehicleValuation";
import { resolveAgencyAssistedClaimantIdentity } from "../agency/agencyAssistedClaimantIdentity";
import { submitAgencyAssistedCanonicalClaim } from "../agency/agencyAssistedClaimSubmission";
import {
  buildClientAcknowledgementRequired,
  buildInsuranceRequestValuationPresentation,
  compareClientValueToMarketValuation,
  normaliseVehicleRegistration,
} from "../agency/insuranceRequestValuation";
import { buildValuationReliabilityEvidence } from "../valuation/valuationReliabilityEvidence";

const conditionInput = z.object({
  exteriorCondition: z.string().min(1).max(50),
  interiorCondition: z.string().min(1).max(50),
  mechanicalCondition: z.string().min(1).max(50),
  existingDamageNotes: z.string().max(5000).optional(),
  tyreCondition: z.string().max(50).optional(),
  glassCondition: z.string().max(50).optional(),
  observations: z.string().max(5000).optional(),
  assessorNotes: z.string().max(5000).optional(),
  modifications: z.array(z.string().max(250)).max(50).default([]),
  photographs: z.array(z.object({ url: z.string().url(), source: z.string().min(1).max(100), capturedAt: z.string().optional() })).max(30).default([]),
  evidenceSources: z.array(z.object({ source: z.string().min(1).max(100), reference: z.string().max(500).optional(), capturedAt: z.string().optional() })).min(1).max(30),
});

const createInsuranceServiceRequestInput = z.object({
  agencyClientId: z.number().int().positive(),
  coverType: z.enum(["comprehensive", "third_party", "third_party_fire_theft", "commercial", "other"]),
  clientInstruction: z.string().min(1).max(5000),
  vehicleRiskNotes: z.string().max(5000).optional(),
  vehicleRegistration: z.string().min(2).max(50),
  vehicleMake: z.string().min(1).max(100),
  vehicleModel: z.string().min(1).max(100),
  vehicleYear: z.number().int().min(1900).max(2100),
  vehicleVin: z.string().max(50).optional(),
  vehicleMileageKm: z.number().int().min(0).max(5_000_000).optional(),
  clientProposedValueCents: z.number().int().positive(),
  conditionSnapshot: conditionInput,
});

const confirmationInput = z.object({
  serviceRequestId: z.number().int().positive(),
  insurerTenantIds: z.array(z.string().min(1).max(64)).min(1).max(20),
  clientConfirmedVehicleFacts: z.literal(true),
  clientConfirmedSelectedValue: z.literal(true),
  acknowledgesValuationImplications: z.boolean(),
  acknowledgementStatement: z.string().min(10).max(2000),
});

const assistedAttachment = z.object({
  key: z.string().min(1), url: z.string().url(), fileName: z.string().min(1), fileSize: z.number().int().min(0), mimeType: z.string().min(1),
  category: z.enum(["damage_photo", "repair_quote", "invoice", "police_report", "medical_report", "insurance_policy", "correspondence", "other"]), title: z.string().max(255).optional(), description: z.string().max(2000).optional(),
});

const assistedClaimInput = z.object({
  agencyClientId: z.number().int().positive(),
  insurerTenantId: z.string().min(1).max(64),
  idempotencyKey: z.string().min(8).max(255),
  vehicleMake: z.string().min(1), vehicleModel: z.string().min(1), vehicleYear: z.number().int().min(1900).max(2100).optional(), vehicleRegistration: z.string().min(2), vehicleVin: z.string().max(50).optional(), vehicleMileage: z.string().max(50).optional(),
  incidentDate: z.string().min(10), incidentLocation: z.string().min(1), incidentDescription: z.string().min(1), incidentTime: z.string().max(20).optional(), incidentType: z.enum(["collision", "theft", "hail", "fire", "vandalism", "flood", "hijacking", "other"]).optional(),
  policyNumber: z.string().max(100).optional(), policeReportNumber: z.string().max(100).optional(), policeStation: z.string().max(255).optional(),
  attachments: z.array(assistedAttachment).max(50), repairerPreferences: z.array(z.string().max(255)).max(50).default([]),
});

async function resolveServiceVehicle(input: z.infer<typeof createInsuranceServiceRequestInput>, tenantId: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const registrationNumber = normaliseVehicleRegistration(input.vehicleRegistration);
  const vin = input.vehicleVin?.trim().toUpperCase().replace(/\s+/g, "") || null;
  let vehicle = vin ? (await db.select().from(vehicleRegistry).where(and(eq(vehicleRegistry.vin, vin), eq(vehicleRegistry.tenantId, tenantId))).limit(1))[0] : undefined;
  if (!vehicle && registrationNumber) vehicle = (await db.select().from(vehicleRegistry).where(and(eq(vehicleRegistry.registrationNumber, registrationNumber), eq(vehicleRegistry.tenantId, tenantId))).limit(1))[0];
  if (vehicle) return vehicle;
  const [created] = await db.insert(vehicleRegistry).values({
    vin, registrationNumber, make: input.vehicleMake, model: input.vehicleModel, year: input.vehicleYear, tenantId,
    totalClaimsCount: 0, totalRepairCostCents: 0, hasSuspiciousDamagePattern: 0, isRepeatClaimer: 0, isSalvageTitle: 0, isStolen: 0, isWrittenOff: 0, vehicleRiskScore: 0,
  }).$returningId() as { id: number }[];
  return { id: created.id, registrationNumber, vin, make: input.vehicleMake, model: input.vehicleModel, year: input.vehicleYear };
}

function marketValuationProvenance(result: Awaited<ReturnType<typeof valuateVehicle>>, vehicle: { make: string; model: string; year: number; mileage?: number; condition?: string }) {
  const reliability = buildValuationReliabilityEvidence({
    vehicle,
    asOf: result.valuationDate,
    source: "fallback",
    reportedSourceCount: result.dataPointsCount,
    ledger: [],
    adjustments: [
      { type: "condition", amountCents: result.conditionAdjustment, basis: `Declared condition: ${vehicle.condition ?? "not recorded"}` },
      { type: "mileage", amountCents: result.mileageAdjustment, basis: vehicle.mileage ? `Declared mileage: ${vehicle.mileage}` : "Mileage not recorded" },
      { type: "market_trend", amountCents: result.marketTrendAdjustment, basis: "No external market trend source connected" },
    ],
  });
  return {
    label: "KINGA Market Valuation",
    evidenceStatus: reliability.clientEvidenceState === "market_supported" ? "Market-supported" : reliability.clientEvidenceState === "provisional" ? "Provisional" : "Expert review needed",
    method: result.valuationMethod,
    valuationDate: result.valuationDate.toISOString(),
    dataPointsCount: result.dataPointsCount,
    priceRangeCents: result.priceRange,
    adjustmentsCents: { condition: result.conditionAdjustment, mileage: result.mileageAdjustment, marketTrend: result.marketTrendAdjustment },
    professionalReliability: reliability.professionalEvidence,
    clientMessage: reliability.clientMessage,
    decisionSupportBoundary: "This is evidence-qualified market decision support. It is not a policy term, premium, claim decision, settlement value, repair cost, or independently verified valuation.",
  };
}

function professionalValuationEvidence(request: {
  requestNumber: string;
  clientProposedValueCents: number | null;
  kingaMarketValuationCents: number | null;
  variancePercent: string | null;
  valuationDate: string | null;
  valuationProvenanceJson: unknown;
  clientAcknowledgementJson?: unknown;
}) {
  const raw = request.valuationProvenanceJson && typeof request.valuationProvenanceJson === "string"
    ? JSON.parse(request.valuationProvenanceJson)
    : (request.valuationProvenanceJson ?? {});
  const valuationPresentation = buildInsuranceRequestValuationPresentation({
    clientProposedValueCents: request.clientProposedValueCents,
    kingaMarketValuationCents: request.kingaMarketValuationCents,
    acknowledgementRecorded: Boolean(request.clientAcknowledgementJson),
  });
  return {
    requestNumber: request.requestNumber,
    clientProposedValueCents: request.clientProposedValueCents,
    kingaMarketValuationCents: request.kingaMarketValuationCents,
    variancePercent: request.variancePercent,
    valuationDate: request.valuationDate,
    evidence: {
      label: raw.label ?? "KINGA Market Valuation",
      evidenceStatus: raw.evidenceStatus ?? "Provisional",
      method: raw.method ?? "Not recorded",
      sourceCoverage: raw.professionalReliability?.sourceCoverage ?? raw.dataPointsCount ?? 0,
      vehicleMatch: raw.professionalReliability?.vehicleMatch ?? null,
      recency: raw.professionalReliability?.recency ?? null,
      priceRangeCents: raw.priceRangeCents ?? null,
      adjustmentsCents: raw.adjustmentsCents ?? null,
      limitations: raw.professionalReliability?.limitations ?? "Evidence provenance has not been recorded.",
      requiresHumanReview: raw.professionalReliability?.requiresHumanReview ?? true,
    },
    clientAcknowledgementRecorded: Boolean(request.clientAcknowledgementJson),
    varianceDecisionSupport: valuationPresentation.insurer,
    agencyDeviation: valuationPresentation.agency,
    decisionBoundary: "Professional decision support only. This information does not create or change a policy, premium, sum insured, claim, repair cost, settlement, payment, or underwriting decision.",
  };
}

export const agencyInsuranceServiceRouter = router({
  createInsuranceServiceRequest: agencyProcedure.input(createInsuranceServiceRequestInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const agencyTenantId = requireTenantScope(ctx, undefined, "agency-insurance-service") as string;
    const [client] = await db.select({ id: agencyClients.id }).from(agencyClients).where(and(eq(agencyClients.id, input.agencyClientId), eq(agencyClients.agencyTenantId, agencyTenantId))).limit(1);
    if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Agency client not found." });
    const vehicle = await resolveServiceVehicle(input, agencyTenantId);
    const valuation = await valuateVehicle({ make: input.vehicleMake, model: input.vehicleModel, year: input.vehicleYear, registration: input.vehicleRegistration, mileage: input.vehicleMileageKm, condition: input.conditionSnapshot.exteriorCondition.toLowerCase() as "excellent" | "good" | "fair" | "poor", country: "Zimbabwe" });
    const marketValueCents = valuation.finalAdjustedValue;
    const variance = compareClientValueToMarketValuation(input.clientProposedValueCents, marketValueCents);
    const valuationProvenance = marketValuationProvenance(valuation, { make: input.vehicleMake, model: input.vehicleModel, year: input.vehicleYear, mileage: input.vehicleMileageKm, condition: input.conditionSnapshot.exteriorCondition });
    const valuationPresentation = buildInsuranceRequestValuationPresentation({
      clientProposedValueCents: input.clientProposedValueCents,
      kingaMarketValuationCents: marketValueCents,
    });
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const requestNumber = `ASR-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const [created] = await db.transaction(async (tx) => {
      const [request] = await tx.insert(agencyInsuranceServiceRequests).values({
        requestNumber, agencyTenantId, agencyClientId: input.agencyClientId, vehicleRegistryId: vehicle.id, coverType: input.coverType, status: "awaiting_client_acknowledgement",
        clientInstruction: input.clientInstruction, vehicleRiskNotes: input.vehicleRiskNotes ?? null, vehicleRegistration: normaliseVehicleRegistration(input.vehicleRegistration), vehicleMake: input.vehicleMake, vehicleModel: input.vehicleModel, vehicleYear: input.vehicleYear, vehicleVin: input.vehicleVin ?? null, vehicleMileageKm: input.vehicleMileageKm ?? null,
        clientProposedValueCents: input.clientProposedValueCents, kingaMarketValuationCents: marketValueCents, valuationDate: now, valuationProvenanceJson: valuationProvenance, variancePercent: variance.variancePercent === null ? null : String(variance.variancePercent), createdBy: ctx.user.id,
      }).$returningId() as { id: number }[];
      const [snapshot] = await tx.insert(vehicleConditionSnapshots).values({
        vehicleRegistryId: vehicle.id, insuranceServiceRequestId: request.id, snapshotVersion: 1, snapshotDate: now,
        exteriorCondition: input.conditionSnapshot.exteriorCondition, interiorCondition: input.conditionSnapshot.interiorCondition, mechanicalCondition: input.conditionSnapshot.mechanicalCondition,
        existingDamageNotes: input.conditionSnapshot.existingDamageNotes ?? null, tyreCondition: input.conditionSnapshot.tyreCondition ?? null, glassCondition: input.conditionSnapshot.glassCondition ?? null, odometerKm: input.vehicleMileageKm ?? null,
        modificationsJson: input.conditionSnapshot.modifications, photographsJson: input.conditionSnapshot.photographs, evidenceSourcesJson: input.conditionSnapshot.evidenceSources, observations: input.conditionSnapshot.observations ?? null, assessorNotes: input.conditionSnapshot.assessorNotes ?? null, capturedBy: ctx.user.id, tenantId: agencyTenantId,
      }).$returningId() as { id: number }[];
      return [{ id: request.id, snapshotId: snapshot.id }];
    });
    return {
      id: created.id, snapshotId: created.snapshotId, requestNumber, status: "awaiting_client_acknowledgement" as const,
      clientProposedValueCents: input.clientProposedValueCents, kingaMarketValuationCents: marketValueCents, variance, valuationDate: valuation.valuationDate, valuationEvidenceStatus: valuationProvenance.evidenceStatus,
      valuationComparison: valuationPresentation.client,
      agencyDeviation: valuationPresentation.agency,
    };
  }),

  confirmAndDispatchInsuranceServiceRequest: agencyProcedure.input(confirmationInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const agencyTenantId = requireTenantScope(ctx, undefined, "agency-insurance-service") as string;
    const [request] = await db.select().from(agencyInsuranceServiceRequests).where(and(eq(agencyInsuranceServiceRequests.id, input.serviceRequestId), eq(agencyInsuranceServiceRequests.agencyTenantId, agencyTenantId))).limit(1);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Insurance service request not found." });
    if (request.status !== "awaiting_client_acknowledgement") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This service request is not awaiting client confirmation." });
    const variance = compareClientValueToMarketValuation(request.clientProposedValueCents, request.kingaMarketValuationCents);
    if (buildClientAcknowledgementRequired(variance, input.acknowledgesValuationImplications)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Client acknowledgement of the material valuation difference is required before insurer review." });
    const insurers = [...new Set(input.insurerTenantIds)];
    const available = await db.select({ id: insurerTenants.id }).from(insurerTenants).where(inArray(insurerTenants.id, insurers));
    if (available.length !== insurers.length) throw new TRPCError({ code: "NOT_FOUND", message: "One or more selected insurer tenants are unavailable." });
    const acknowledgement = { clientConfirmedVehicleFacts: true, clientConfirmedSelectedValue: true, acknowledgesValuationImplications: input.acknowledgesValuationImplications, statement: input.acknowledgementStatement, recordedByAgencyUserId: ctx.user.id, recordedAt: new Date().toISOString(), clientResponsibility: "The client confirms that the vehicle facts and selected insured value are accurate." };
    const valuationPresentation = buildInsuranceRequestValuationPresentation({
      clientProposedValueCents: request.clientProposedValueCents,
      kingaMarketValuationCents: request.kingaMarketValuationCents,
      acknowledgementRecorded: input.acknowledgesValuationImplications,
    });
    await db.transaction(async (tx) => {
      await tx.update(agencyInsuranceServiceRequests).set({ status: "ready_for_insurer_review", clientAcknowledgementJson: acknowledgement }).where(and(eq(agencyInsuranceServiceRequests.id, request.id), eq(agencyInsuranceServiceRequests.agencyTenantId, agencyTenantId)));
      await tx.insert(agencyInsuranceServiceRequestInsurers).values(insurers.map((insurerTenantId) => ({ serviceRequestId: request.id, agencyTenantId, insurerTenantId, status: "invited" }))).onDuplicateKeyUpdate({ set: { status: "invited" } });
      if (variance.materiallyDifferent && request.clientProposedValueCents && request.kingaMarketValuationCents && variance.variancePercent !== null) {
        await tx.insert(agencyInsuranceValuationDeviations).values({ serviceRequestId: request.id, agencyTenantId, clientProposedValueCents: request.clientProposedValueCents, kingaMarketValuationCents: request.kingaMarketValuationCents, variancePercent: String(variance.variancePercent), acknowledgementJson: acknowledgement, recordedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { acknowledgementJson: acknowledgement, recordedBy: ctx.user.id } });
      }
    });
    return {
      success: true,
      status: "ready_for_insurer_review" as const,
      insurerInvitations: insurers.length,
      variance,
      valuationComparison: valuationPresentation.client,
      agencyDeviation: valuationPresentation.agency,
    };
  }),

  recordVehicleConditionSnapshot: agencyProcedure.input(z.object({ serviceRequestId: z.number().int().positive(), conditionSnapshot: conditionInput })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const agencyTenantId = requireTenantScope(ctx, undefined, "agency-insurance-service") as string;
    const [request] = await db.select({ id: agencyInsuranceServiceRequests.id, vehicleRegistryId: agencyInsuranceServiceRequests.vehicleRegistryId, vehicleMileageKm: agencyInsuranceServiceRequests.vehicleMileageKm }).from(agencyInsuranceServiceRequests).where(and(eq(agencyInsuranceServiceRequests.id, input.serviceRequestId), eq(agencyInsuranceServiceRequests.agencyTenantId, agencyTenantId))).limit(1);
    if (!request?.vehicleRegistryId) throw new TRPCError({ code: "NOT_FOUND", message: "Service-request vehicle not found." });
    const [versionRow] = await db.select({ version: sql<number>`COALESCE(MAX(${vehicleConditionSnapshots.snapshotVersion}), 0)` }).from(vehicleConditionSnapshots).where(eq(vehicleConditionSnapshots.insuranceServiceRequestId, request.id));
    const snapshotVersion = Number(versionRow?.version ?? 0) + 1;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const [snapshot] = await db.insert(vehicleConditionSnapshots).values({ vehicleRegistryId: request.vehicleRegistryId, insuranceServiceRequestId: request.id, snapshotVersion, snapshotDate: now, exteriorCondition: input.conditionSnapshot.exteriorCondition, interiorCondition: input.conditionSnapshot.interiorCondition, mechanicalCondition: input.conditionSnapshot.mechanicalCondition, existingDamageNotes: input.conditionSnapshot.existingDamageNotes ?? null, tyreCondition: input.conditionSnapshot.tyreCondition ?? null, glassCondition: input.conditionSnapshot.glassCondition ?? null, odometerKm: request.vehicleMileageKm ?? null, modificationsJson: input.conditionSnapshot.modifications, photographsJson: input.conditionSnapshot.photographs, evidenceSourcesJson: input.conditionSnapshot.evidenceSources, observations: input.conditionSnapshot.observations ?? null, assessorNotes: input.conditionSnapshot.assessorNotes ?? null, capturedBy: ctx.user.id, tenantId: agencyTenantId }).$returningId() as { id: number }[];
    return { id: snapshot.id, snapshotVersion, status: "recorded" as const };
  }),

  getInsuranceServiceRequests: agencyProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const agencyTenantId = requireTenantScope(ctx, undefined, "agency-insurance-service") as string;
    const requests = await db.select({ id: agencyInsuranceServiceRequests.id, requestNumber: agencyInsuranceServiceRequests.requestNumber, status: agencyInsuranceServiceRequests.status, coverType: agencyInsuranceServiceRequests.coverType, clientInstruction: agencyInsuranceServiceRequests.clientInstruction, clientName: agencyClients.fullName, vehicleRegistration: agencyInsuranceServiceRequests.vehicleRegistration, clientProposedValueCents: agencyInsuranceServiceRequests.clientProposedValueCents, kingaMarketValuationCents: agencyInsuranceServiceRequests.kingaMarketValuationCents, variancePercent: agencyInsuranceServiceRequests.variancePercent, valuationDate: agencyInsuranceServiceRequests.valuationDate, createdAt: agencyInsuranceServiceRequests.createdAt }).from(agencyInsuranceServiceRequests).innerJoin(agencyClients, eq(agencyClients.id, agencyInsuranceServiceRequests.agencyClientId)).where(eq(agencyInsuranceServiceRequests.agencyTenantId, agencyTenantId)).orderBy(desc(agencyInsuranceServiceRequests.createdAt)).limit(input.limit).offset(input.offset);
    return { requests };
  }),

  getAgencyProfessionalValuationEvidence: agencyProcedure.input(z.object({ serviceRequestId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const agencyTenantId = requireTenantScope(ctx, undefined, "agency-professional-valuation-evidence") as string;
    const [request] = await db.select({
      requestNumber: agencyInsuranceServiceRequests.requestNumber,
      clientProposedValueCents: agencyInsuranceServiceRequests.clientProposedValueCents,
      kingaMarketValuationCents: agencyInsuranceServiceRequests.kingaMarketValuationCents,
      variancePercent: agencyInsuranceServiceRequests.variancePercent,
      valuationDate: agencyInsuranceServiceRequests.valuationDate,
      valuationProvenanceJson: agencyInsuranceServiceRequests.valuationProvenanceJson,
      clientAcknowledgementJson: agencyInsuranceServiceRequests.clientAcknowledgementJson,
    }).from(agencyInsuranceServiceRequests).where(and(
      eq(agencyInsuranceServiceRequests.id, input.serviceRequestId),
      eq(agencyInsuranceServiceRequests.agencyTenantId, agencyTenantId),
    )).limit(1);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Insurance service request not found." });
    return professionalValuationEvidence(request);
  }),

  getInsurerDecisionSupport: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "insurer" && !isAdminRole(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Insurer decision-support access is required." });
    const db = await getDb();
    if (!db || !ctx.user.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Insurer tenant context is required." });
    const requests = await db.select({ serviceRequestId: agencyInsuranceServiceRequests.id, requestNumber: agencyInsuranceServiceRequests.requestNumber, coverType: agencyInsuranceServiceRequests.coverType, vehicleRegistration: agencyInsuranceServiceRequests.vehicleRegistration, vehicleMake: agencyInsuranceServiceRequests.vehicleMake, vehicleModel: agencyInsuranceServiceRequests.vehicleModel, vehicleYear: agencyInsuranceServiceRequests.vehicleYear, clientProposedValueCents: agencyInsuranceServiceRequests.clientProposedValueCents, kingaMarketValuationCents: agencyInsuranceServiceRequests.kingaMarketValuationCents, variancePercent: agencyInsuranceServiceRequests.variancePercent, valuationDate: agencyInsuranceServiceRequests.valuationDate, valuationProvenanceJson: agencyInsuranceServiceRequests.valuationProvenanceJson, status: agencyInsuranceServiceRequests.status }).from(agencyInsuranceServiceRequestInsurers).innerJoin(agencyInsuranceServiceRequests, eq(agencyInsuranceServiceRequests.id, agencyInsuranceServiceRequestInsurers.serviceRequestId)).where(and(eq(agencyInsuranceServiceRequestInsurers.insurerTenantId, ctx.user.tenantId), inArray(agencyInsuranceServiceRequestInsurers.status, ["invited", "viewed", "responded"]))).orderBy(desc(agencyInsuranceServiceRequests.createdAt)).limit(input.limit);
    return {
      requests: requests.map((request) => professionalValuationEvidence(request)),
      decisionBoundary: "Decision support only. No value shown here creates or changes a policy, premium, sum insured, claim, repair cost, settlement, or underwriting decision.",
    };
  }),

  createAgencyAssistedClaim: agencyProcedure.input(assistedClaimInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const agencyTenantId = requireTenantScope(ctx, undefined, "agency-assisted-claim") as string;
    return submitAgencyAssistedCanonicalClaim({
      agencyTenantId,
      agencyUserId: ctx.user.id,
      loadScopedClient: async (agencyClientId) => (await db.select({ id: agencyClients.id, fullName: agencyClients.fullName, phone: agencyClients.phone }).from(agencyClients).where(and(eq(agencyClients.id, agencyClientId), eq(agencyClients.agencyTenantId, agencyTenantId))).limit(1))[0] ?? null,
      insurerExists: async (insurerTenantId) => Boolean((await db.select({ id: insurerTenants.id }).from(insurerTenants).where(eq(insurerTenants.id, insurerTenantId)).limit(1))[0]),
      resolveActor: () => resolveAgencyAssistedClaimantIdentity({ agencyTenantId, agencyClientId: input.agencyClientId, insurerTenantId: input.insurerTenantId, agencyUserId: ctx.user.id }),
      persist: async (actor, canonicalInput) => (await import("../services/canonicalClaimIntake")).persistCanonicalClaimIntake(actor, canonicalInput),
      startAssessment: async (actor, claimId, idempotencyKey) => (await import("../services/canonicalClaimIntake")).startCanonicalIntakeAssessment(actor, claimId, idempotencyKey),
    }, input);
  }),

  linkAgencyAssistedClaimantToVerifiedMyPortal: agencyProcedure.input(z.object({ identityId: z.number().int().positive(), verifiedClaimantUserId: z.number().int().positive(), confirmationStatement: z.string().min(10).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const agencyTenantId = requireTenantScope(ctx, undefined, "agency-assisted-claim") as string;
    const [identity] = await db.select().from(agencyAssistedClaimantIdentities).where(and(eq(agencyAssistedClaimantIdentities.id, input.identityId), eq(agencyAssistedClaimantIdentities.agencyTenantId, agencyTenantId))).limit(1);
    if (!identity) throw new TRPCError({ code: "NOT_FOUND", message: "Restricted claimant identity not found." });
    const [verifiedClaimant] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, input.verifiedClaimantUserId), eq(users.tenantId, identity.insurerTenantId), eq(users.role, "claimant"), eq(users.isUnregisteredClaimant, 0), eq(users.isActive, 1))).limit(1);
    if (!verifiedClaimant) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A verified claimant in the same insurer tenant is required." });
    await db.update(agencyAssistedClaimantIdentities).set({ verifiedClaimantUserId: verifiedClaimant.id, status: "linked_to_verified_claimant", linkedBy: ctx.user.id, linkedAt: new Date().toISOString().slice(0, 19).replace("T", " "), linkConfirmationStatement: input.confirmationStatement }).where(eq(agencyAssistedClaimantIdentities.id, identity.id));
    return { success: true, status: "linked_to_verified_claimant" as const, historicalClaimOwnershipChanged: false };
  }),
});
