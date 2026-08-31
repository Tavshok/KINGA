// @ts-nocheck
/**
 * inspections.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T7, E3-T8, E3-T9
 *
 * Engineering Workspace tRPC Router
 *
 * Provides all procedures for the Engineering Workspace:
 *   T7 — CRUD: create, list, get, update status, cancel
 *   T8 — Capture: addMeasurement, addObservation, linkEvidence, transcribeVoice
 *   T9 — Intelligence: runAiAnalysis, runPhysicsReconciliation, approveAiAnalysis
 *
 * Access guard: engineerDomainProcedure (engineer, admin, platform_super_admin)
 *
 * DESIGN NOTES
 * ────────────
 * - All write procedures check that the requesting user owns the inspection
 *   (or is admin/platform_super_admin).
 * - The physics engine (stage-7-physics.ts) is NOT called here. Reconciliation
 *   uses reconcileEngineerMeasurements() from crossStageConsistencyEngine.ts.
 * - AI analysis uses invokeLLM() with a structured JSON schema response.
 * - Voice transcription uses transcribeAudio() from voiceTranscription.ts.
 * - Tenant/object authority hardening is maintained here; session-derived tenant
 *   predicates must remain in place for every inspection read and mutation.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { router } from "../_core/trpc";
import { engineerDomainProcedure } from "../_core/domain-middleware";
import { isAdminRole } from "@shared/role-permissions";
import {
  inspections,
  physicalMeasurements,
  engineerObservations,
  engineerProfiles,
  assetRegistry,
  claimDocuments,
  claims,
  users,
  inspectionProjects,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { assignInspection } from "../workload-balancing";
import { reconcileEngineerMeasurements } from "../pipeline-v2/crossStageConsistencyEngine";
import type { EngineerMeasurementRow } from "../pipeline-v2/engineerMeasurementAdapter";
import type { PhysicsMeasurement } from "../pipeline-v2/physicsTruth";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const INSPECTION_TYPES = [
  "vehicle", "engineering", "risk_survey", "fleet", "property", "equipment", "industrial",
] as const;

const INSPECTION_STATUSES = [
  "scheduled", "assigned", "in_progress", "evidence_capture",
  "measurements_complete", "observations_complete", "ai_analysis",
  "engineer_review", "physics_reconciliation", "report_generation",
  "complete", "cancelled",
] as const;

const MEASUREMENT_CATEGORIES = [
  "vehicle_crush", "structural", "mechanical", "electrical", "fire_protection", "industrial",
] as const;

const MEASUREMENT_METHODS = [
  "manual", "laser", "ai_assisted", "imported", "photogrammetric",
  "ultrasonic", "thermal", "load_cell", "other",
] as const;

const OBSERVATION_TYPES = [
  "defect", "hazard", "compliance", "maintenance", "recommendation", "general_note",
] as const;

const OBSERVATION_MODES = ["structured", "free_text", "voice"] as const;

const SEVERITIES = ["info", "minor", "moderate", "major", "critical"] as const;

// ── Helper: ownership check ───────────────────────────────────────────────────

async function requireInspectionAccess(
  db: any,
  inspectionId: number,
  userId: number,
  userRole: string,
  actorTenantId?: string | null,
): Promise<typeof inspections.$inferSelect> {
  const [inspection] = await db
    .select()
    .from(inspections)
    .where(eq(inspections.id, inspectionId))
    .limit(1);

  if (!inspection) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Inspection not found." });
  }

  if (!actorTenantId || inspection.tenantId !== actorTenantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Inspection not found." });
  }

  const isAdmin = isAdminRole(userRole);
  if (!isAdmin && inspection.assignedEngineerId !== userId && inspection.createdBy !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this inspection.",
    });
  }

  return inspection;
}

// ── Reference generator ───────────────────────────────────────────────────────

function generateInspectionRef(): string {
  const now = new Date();
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INS-${yymmdd}-${rand}`;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const inspectionsRouter = router({

  // ── T7: CRUD ────────────────────────────────────────────────────────────────

  /**
   * Create a new inspection.
   * Optionally auto-assigns an engineer using the workload-balancing service.
   */
  create: engineerDomainProcedure
    .input(z.object({
      inspectionType: z.enum(INSPECTION_TYPES),
      assetType: z.string().min(1).max(50),
      assetRegistryId: z.number().int().positive().optional(),
      assetRef: z.string().max(100).optional(),
      vehicleRegistration: z.string().max(50).optional(),
      claimId: z.number().int().positive().optional(),
      projectId: z.number().int().positive().optional(), // DEF-003: link to inspection_projects
      scheduledDate: z.string().datetime().optional(),
      locationAddress: z.string().max(500).optional(),
      locationLat: z.number().optional(),
      locationLng: z.number().optional(),
      autoAssign: z.boolean().default(false),
      requiredSkills: z.array(z.string()).optional(),
      requiredCertifications: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const ref = generateInspectionRef();
      // Guaranteed by engineerDomainProcedure; no synthetic tenant fallback.
      const tenantId = ctx.user!.tenantId!;

      let assignedEngineerId: number | null = null;
      let assignedAt: Date | null = null;
      let status: string = "scheduled";

      if (input.autoAssign) {
        const candidate = await assignInspection({
          tenantId,
          requiredSkills: input.requiredSkills,
          requiredCertifications: input.requiredCertifications,
          locationLat: input.locationLat,
          locationLng: input.locationLng,
        });
        if (candidate) {
          assignedEngineerId = candidate.userId;
          assignedAt = new Date();
          status = "assigned";
          // Increment active_inspections counter
          await ctx.db
            .update(engineerProfiles)
            .set({ activeInspections: sql`${engineerProfiles.activeInspections} + 1` })
            .where(eq(engineerProfiles.userId, candidate.userId));
        }
      }

      const [result] = await ctx.db.insert(inspections).values({
        tenantId,
        inspectionRef: ref,
        inspectionType: input.inspectionType,
        status,
        assetType: input.assetType,
        assetRegistryId: input.assetRegistryId ?? null,
        assetRef: input.assetRef ?? null,
        vehicleRegistration: input.vehicleRegistration ?? null,
        claimId: input.claimId ?? null,
        projectId: input.projectId ?? null, // DEF-003
        assignedEngineerId,
        assignedAt,
        scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
        locationAddress: input.locationAddress ?? null,
        locationLat: input.locationLat ? String(input.locationLat) : null,
        locationLng: input.locationLng ? String(input.locationLng) : null,
        createdBy: ctx.user!.id,
      });

      return { inspectionRef: ref, id: result.insertId, status };
    }),

  /**
   * List inspections for the current engineer (or all for admin).
   */
  list: engineerDomainProcedure
    .input(z.object({
      status: z.enum(INSPECTION_STATUSES).optional(),
      inspectionType: z.enum(INSPECTION_TYPES).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const isAdmin = isAdminRole(ctx.user!.role);
      const tenantId = ctx.user!.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      const offset = (input.page - 1) * input.pageSize;

      const conditions: any[] = [eq(inspections.tenantId, tenantId)];
      if (!isAdmin) {
        conditions.push(
          sql`(${inspections.assignedEngineerId} = ${ctx.user!.id} OR ${inspections.createdBy} = ${ctx.user!.id})`
        );
      }
      if (input.status) conditions.push(eq(inspections.status, input.status));
      if (input.inspectionType) conditions.push(eq(inspections.inspectionType, input.inspectionType));

      const whereClause = conditions.length > 0
        ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
        : undefined;

      const rows = await ctx.db
        .select()
        .from(inspections)
        .where(whereClause)
        .orderBy(desc(inspections.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const [{ total }] = await ctx.db
        .select({ total: sql<number>`COUNT(*)` })
        .from(inspections)
        .where(whereClause);

      return {
        inspections: rows,
        total: Number(total),
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(Number(total) / input.pageSize),
      };
    }),

  /**
   * Get a single inspection with all its measurements, observations, and evidence.
   */
  get: engineerDomainProcedure
    .input(z.object({ inspectionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const inspection = await requireInspectionAccess(
        ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId
      );

      const [measurements, observations] = await Promise.all([
        ctx.db
          .select()
          .from(physicalMeasurements)
          .where(eq(physicalMeasurements.inspectionId, input.inspectionId))
          .orderBy(physicalMeasurements.capturedAt),
        ctx.db
          .select()
          .from(engineerObservations)
          .where(eq(engineerObservations.inspectionId, input.inspectionId))
          .orderBy(engineerObservations.authoredAt),
      ]);

      return { inspection, measurements, observations };
    }),

  /**
   * Update the workflow status of an inspection.
   */
  updateStatus: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      status: z.enum(INSPECTION_STATUSES),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireInspectionAccess(ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId);

      const updatePayload: any = { status: input.status };
      if (input.status === "complete") {
        updatePayload.completedAt = new Date();
      }

      await ctx.db
        .update(inspections)
        .set(updatePayload)
        .where(eq(inspections.id, input.inspectionId));

      return { success: true, status: input.status };
    }),

  /**
   * Assign an engineer to an inspection (manual assignment).
   */
  assign: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      engineerUserId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const isAdmin = isAdminRole(ctx.user!.role);
      if (!isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can manually assign engineers." });
      }
      const tenantId = ctx.user!.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });

      await requireInspectionAccess(ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, tenantId);
      const [engineerProfile] = await ctx.db
        .select({ userId: engineerProfiles.userId })
        .from(engineerProfiles)
        .where(and(
          eq(engineerProfiles.userId, input.engineerUserId),
          eq(engineerProfiles.tenantId, tenantId),
        ))
        .limit(1);
      if (!engineerProfile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Engineer not found." });
      }

      await ctx.db
        .update(inspections)
        .set({
          assignedEngineerId: input.engineerUserId,
          assignedAt: new Date(),
          status: "assigned",
        })
        .where(eq(inspections.id, input.inspectionId));

      await ctx.db
        .update(engineerProfiles)
        .set({ activeInspections: sql`${engineerProfiles.activeInspections} + 1` })
        .where(and(
          eq(engineerProfiles.userId, input.engineerUserId),
          eq(engineerProfiles.tenantId, tenantId),
        ));

      return { success: true };
    }),

  // ── T8: Capture ─────────────────────────────────────────────────────────────

  /**
   * Add a physical measurement to an inspection.
   */
  addMeasurement: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      measurementCategory: z.enum(MEASUREMENT_CATEGORIES),
      measurementType: z.string().min(1).max(100),
      value: z.number(),
      valueMin: z.number().optional(),
      valueMax: z.number().optional(),
      unit: z.string().min(1).max(30),
      instrument: z.string().max(255).optional(),
      measurementMethod: z.enum(MEASUREMENT_METHODS).default("manual"),
      calibrationReference: z.string().max(255).optional(),
      confidence: z.number().min(0).max(1).default(0.9),
      locationReference: z.string().max(255).optional(),
      locationImageUrl: z.string().url().optional(),
      standardsBody: z.string().max(50).optional(),
      standardsCode: z.string().max(100).optional(),
      standardsClause: z.string().max(100).optional(),
      standardsDescription: z.string().max(1000).optional(),
      evidenceDocumentIds: z.array(z.number()).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inspection = await requireInspectionAccess(
        ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId
      );

      const tenantId = inspection.tenantId;

      if (input.evidenceDocumentIds && input.evidenceDocumentIds.length > 0) {
        const scopedDocuments = await ctx.db
          .select({ id: claimDocuments.id })
          .from(claimDocuments)
          .innerJoin(claims, eq(claimDocuments.claimId, claims.id))
          .where(and(
            inArray(claimDocuments.id, input.evidenceDocumentIds),
            eq(claims.tenantId, tenantId),
          ));
        if (scopedDocuments.length !== input.evidenceDocumentIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Evidence document not found." });
        }
      }

      const [result] = await ctx.db.insert(physicalMeasurements).values({
        tenantId,
        inspectionId: input.inspectionId,
        measurementCategory: input.measurementCategory,
        measurementType: input.measurementType,
        value: String(input.value),
        valueMin: input.valueMin != null ? String(input.valueMin) : null,
        valueMax: input.valueMax != null ? String(input.valueMax) : null,
        unit: input.unit,
        instrument: input.instrument ?? null,
        measurementMethod: input.measurementMethod,
        calibrationReference: input.calibrationReference ?? null,
        confidence: String(input.confidence),
        capturedBy: ctx.user!.id,
        capturedAt: new Date(),
        source: "ENGINEER_MEASUREMENT",
        evidenceDocumentIds: input.evidenceDocumentIds
          ? JSON.stringify(input.evidenceDocumentIds)
          : null,
        locationReference: input.locationReference ?? null,
        locationImageUrl: input.locationImageUrl ?? null,
        standardsBody: input.standardsBody ?? null,
        standardsCode: input.standardsCode ?? null,
        standardsClause: input.standardsClause ?? null,
        standardsDescription: input.standardsDescription ?? null,
        notes: input.notes ?? null,
      });

      // Backfill inspectionId on any linked claimDocuments so the FK is populated.
      if (input.evidenceDocumentIds && input.evidenceDocumentIds.length > 0) {
        for (const docId of input.evidenceDocumentIds) {
          await ctx.db
            .update(claimDocuments)
            .set({ inspectionId: input.inspectionId })
            .where(eq(claimDocuments.id, docId));
        }
      }

      return { success: true, measurementId: result.insertId };
    }),

  /**
   * Add an observation to an inspection.
   */
  addObservation: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      observationType: z.enum(OBSERVATION_TYPES).default("general_note"),
      observationMode: z.enum(OBSERVATION_MODES).default("free_text"),
      component: z.string().max(255).optional(),
      conditionCode: z.string().max(50).optional(),
      conditionDetail: z.string().max(2000).optional(),
      observationText: z.string().max(5000).optional(),
      severity: z.enum(SEVERITIES).default("info"),
      recommendation: z.string().max(2000).optional(),
      standardsBody: z.string().max(50).optional(),
      standardsCode: z.string().max(100).optional(),
      standardsClause: z.string().max(100).optional(),
      standardsDescription: z.string().max(1000).optional(),
      linkedMeasurementIds: z.array(z.number()).optional(),
      linkedEvidenceIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inspection = await requireInspectionAccess(
        ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId
      );

      if (input.linkedEvidenceIds && input.linkedEvidenceIds.length > 0) {
        const scopedDocuments = await ctx.db
          .select({ id: claimDocuments.id })
          .from(claimDocuments)
          .innerJoin(claims, eq(claimDocuments.claimId, claims.id))
          .where(and(
            inArray(claimDocuments.id, input.linkedEvidenceIds),
            eq(claims.tenantId, inspection.tenantId),
          ));
        if (scopedDocuments.length !== input.linkedEvidenceIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Evidence document not found." });
        }
      }

      const [result] = await ctx.db.insert(engineerObservations).values({
        tenantId: inspection.tenantId,
        inspectionId: input.inspectionId,
        observationType: input.observationType,
        observationMode: input.observationMode,
        component: input.component ?? null,
        conditionCode: input.conditionCode ?? null,
        conditionDetail: input.conditionDetail ?? null,
        observationText: input.observationText ?? null,
        severity: input.severity,
        recommendation: input.recommendation ?? null,
        standardsBody: input.standardsBody ?? null,
        standardsCode: input.standardsCode ?? null,
        standardsClause: input.standardsClause ?? null,
        standardsDescription: input.standardsDescription ?? null,
        linkedMeasurementIds: input.linkedMeasurementIds
          ? JSON.stringify(input.linkedMeasurementIds)
          : null,
        linkedEvidenceIds: input.linkedEvidenceIds
          ? JSON.stringify(input.linkedEvidenceIds)
          : null,
        aiDraftUsed: 0,
        aiDraftApproved: 0,
        authoredBy: ctx.user!.id,
        authoredAt: new Date(),
      });

      // Backfill inspectionId on any linked claimDocuments so the FK is populated.
      if (input.linkedEvidenceIds && input.linkedEvidenceIds.length > 0) {
        for (const docId of input.linkedEvidenceIds) {
          await ctx.db
            .update(claimDocuments)
            .set({ inspectionId: input.inspectionId })
            .where(eq(claimDocuments.id, docId));
        }
      }

      return { success: true, observationId: result.insertId };
    }),

  /**
   * Transcribe a voice recording and save it as an observation.
   */
  transcribeVoice: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      audioUrl: z.string().url(),
      language: z.string().max(10).default("en"),
      observationType: z.enum(OBSERVATION_TYPES).default("general_note"),
      severity: z.enum(SEVERITIES).default("info"),
      component: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inspection = await requireInspectionAccess(
        ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId
      );

      // Transcribe the audio
      const transcription = await transcribeAudio({
        audioUrl: input.audioUrl,
        language: input.language,
        prompt: "Transcribe an engineering field observation.",
      });

      const transcript = transcription.text ?? "";

      // Save as a voice observation
      const [result] = await ctx.db.insert(engineerObservations).values({
        tenantId: inspection.tenantId,
        inspectionId: input.inspectionId,
        observationType: input.observationType,
        observationMode: "voice",
        component: input.component ?? null,
        observationText: transcript,
        voiceAudioUrl: input.audioUrl,
        voiceTranscript: transcript,
        transcriptionLanguage: transcription.language ?? input.language,
        severity: input.severity,
        aiDraftUsed: 0,
        aiDraftApproved: 0,
        authoredBy: ctx.user!.id,
        authoredAt: new Date(),
      });

      return {
        success: true,
        observationId: result.insertId,
        transcript,
        language: transcription.language ?? input.language,
      };
    }),

  /**
   * Generate an AI draft for an observation using the existing observation text.
   */
  draftObservationWithAi: engineerDomainProcedure
    .input(z.object({
      observationId: z.number().int().positive(),
      context: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [obs] = await ctx.db
        .select()
        .from(engineerObservations)
        .where(eq(engineerObservations.id, input.observationId))
        .limit(1);

      if (!obs) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Observation not found." });
      }

      await requireInspectionAccess(ctx.db, obs.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId);

      const prompt = [
        "You are an expert engineering inspector. Improve the following field observation into a",
        "professional, concise, and technically precise observation statement suitable for an",
        "engineering inspection report. Preserve all factual content. Do not add information",
        "that is not present in the original text.",
        "",
        `Component: ${obs.component ?? "unspecified"}`,
        `Severity: ${obs.severity}`,
        `Original text: ${obs.observationText ?? obs.voiceTranscript ?? ""}`,
        input.context ? `Additional context: ${input.context}` : "",
      ].filter(Boolean).join("\n");

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are an expert engineering inspector writing professional inspection reports." },
          { role: "user", content: prompt },
        ],
      });

      const aiDraft = response.choices?.[0]?.message?.content ?? "";

      await ctx.db
        .update(engineerObservations)
        .set({ aiDraftUsed: 1, aiDraftPrompt: prompt })
        .where(eq(engineerObservations.id, input.observationId));

      return { success: true, aiDraft };
    }),

  // ── T9: Intelligence ─────────────────────────────────────────────────────────

  /**
   * Run AI analysis on the full inspection (measurements + observations).
   * Produces a structured JSON summary stored in inspections.ai_analysis_json.
   */
  runAiAnalysis: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inspection = await requireInspectionAccess(
        ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId
      );

      const [measurements, observations] = await Promise.all([
        ctx.db
          .select()
          .from(physicalMeasurements)
          .where(eq(physicalMeasurements.inspectionId, input.inspectionId)),
        ctx.db
          .select()
          .from(engineerObservations)
          .where(eq(engineerObservations.inspectionId, input.inspectionId)),
      ]);

      const measurementSummary = measurements.map((m) =>
        `${m.measurementType}: ${m.value} ${m.unit} (${m.measurementMethod}, confidence ${m.confidence})`
      ).join("\n");

      const observationSummary = observations.map((o) =>
        `[${o.severity.toUpperCase()}] ${o.observationType} — ${o.component ?? "general"}: ${o.observationText ?? o.voiceTranscript ?? ""}`
      ).join("\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert engineering inspector. Analyse the following inspection data and produce a structured JSON summary. Be objective and precise. Do not fabricate findings.",
          },
          {
            role: "user",
            content: [
              `Inspection: ${inspection.inspectionRef}`,
              `Asset type: ${inspection.assetType}`,
              `Inspection type: ${inspection.inspectionType}`,
              "",
              "MEASUREMENTS:",
              measurementSummary || "None captured.",
              "",
              "OBSERVATIONS:",
              observationSummary || "None recorded.",
            ].join("\n"),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "inspection_ai_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                overallCondition: {
                  type: "string",
                  enum: ["good", "fair", "poor", "critical"],
                  description: "Overall condition assessment",
                },
                riskLevel: {
                  type: "string",
                  enum: ["low", "medium", "high", "critical"],
                  description: "Overall risk level",
                },
                keyFindings: {
                  type: "array",
                  items: { type: "string" },
                  description: "Up to 5 key findings",
                },
                recommendedActions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Recommended actions in priority order",
                },
                measurementAnomalies: {
                  type: "array",
                  items: { type: "string" },
                  description: "Any measurement anomalies detected",
                },
                complianceConcerns: {
                  type: "array",
                  items: { type: "string" },
                  description: "Any compliance or standards concerns",
                },
                summary: {
                  type: "string",
                  description: "One-paragraph executive summary",
                },
              },
              required: [
                "overallCondition", "riskLevel", "keyFindings",
                "recommendedActions", "measurementAnomalies",
                "complianceConcerns", "summary",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content ?? "{}";
      let aiAnalysis: Record<string, unknown>;
      try {
        aiAnalysis = JSON.parse(rawContent);
      } catch {
        aiAnalysis = { summary: rawContent, parseError: true };
      }

      await ctx.db
        .update(inspections)
        .set({
          aiAnalysisJson: JSON.stringify(aiAnalysis),
          aiAnalysisAt: new Date(),
          status: "engineer_review",
        })
        .where(eq(inspections.id, input.inspectionId));

      return { success: true, analysis: aiAnalysis };
    }),

  /**
   * Approve or reject the AI analysis draft.
   */
  approveAiAnalysis: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      approved: z.boolean(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireInspectionAccess(ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId);

      await ctx.db
        .update(inspections)
        .set({
          aiAnalysisApproved: input.approved ? 1 : 0,
          status: input.approved ? "physics_reconciliation" : "ai_analysis",
          reconciliationNotes: input.notes ?? null,
        })
        .where(eq(inspections.id, input.inspectionId));

      return { success: true, approved: input.approved };
    }),

  /**
   * Run physics reconciliation for a vehicle inspection.
   * Compares engineer measurements against pipeline physics values and raises
   * ConsistencyFlags for deviations > 15%.
   */
  runPhysicsReconciliation: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      /**
       * Pipeline physics measurements to compare against.
       * Key = measurementType (e.g. "crush_depth_m"), value = PhysicsMeasurement.
       * Passed from the frontend which reads them from the claim's physics truth.
       */
      pipelineMeasurements: z.record(z.object({
        value: z.number(),
        min: z.number(),
        max: z.number(),
        confidence: z.number(),
        source: z.string(),
        provenanceNote: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inspection = await requireInspectionAccess(
        ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, ctx.user!.tenantId
      );

      const measurementRows = await ctx.db
        .select()
        .from(physicalMeasurements)
        .where(eq(physicalMeasurements.inspectionId, input.inspectionId));

      // Convert DB rows to EngineerMeasurementRow shape
      const engineerRows: EngineerMeasurementRow[] = measurementRows.map((m) => ({
        id: m.id,
        measurementType: m.measurementType,
        value: Number(m.value),
        valueMin: m.valueMin != null ? Number(m.valueMin) : null,
        valueMax: m.valueMax != null ? Number(m.valueMax) : null,
        unit: m.unit,
        confidence: Number(m.confidence),
        instrument: m.instrument,
        measurementMethod: m.measurementMethod,
        calibrationReference: m.calibrationReference,
        capturedBy: m.capturedBy,
        capturedAt: m.capturedAt,
        notes: m.notes,
      }));

      // Build pipeline measurements map
      const pipelineMap = new Map<string, PhysicsMeasurement>();
      if (input.pipelineMeasurements) {
        for (const [key, val] of Object.entries(input.pipelineMeasurements)) {
          pipelineMap.set(key, val as PhysicsMeasurement);
        }
      }

      const { measurements, flags } = reconcileEngineerMeasurements(
        engineerRows,
        pipelineMap,
        inspection.inspectionRef
      );

      await ctx.db
        .update(inspections)
        .set({
          physicsReconciled: 1,
          physicsReconciledAt: new Date(),
          reconciliationNotes: flags.length > 0
            ? `${flags.length} deviation flag(s) raised. Review required.`
            : "All measurements within 15% tolerance. No deviations detected.",
          status: "report_generation",
        })
        .where(eq(inspections.id, input.inspectionId));

      return {
        success: true,
        measurementsConverted: measurements.length,
        flagsRaised: flags.length,
        flags,
      };
    }),

  /**
   * Get the engineer profile for the current user.
   */
  getMyProfile: engineerDomainProcedure
    .query(async ({ ctx }) => {
      const [profile] = await ctx.db
        .select()
        .from(engineerProfiles)
        .where(eq(engineerProfiles.userId, ctx.user!.id))
        .limit(1);

      return profile ?? null;
    }),

  /**
   * Create or update the engineer profile for the current user.
   */
  upsertMyProfile: engineerDomainProcedure
    .input(z.object({
      skills: z.array(z.string()).optional(),
      certifications: z.array(z.string()).optional(),
      region: z.string().max(100).optional(),
      regionLat: z.number().optional(),
      regionLng: z.number().optional(),
      maxTravelRadiusKm: z.number().int().min(0).max(5000).optional(),
      isAvailable: z.boolean().optional(),
      availabilityNotes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Guaranteed by engineerDomainProcedure; no synthetic tenant fallback.
      const tenantId = ctx.user!.tenantId!;

      const [existing] = await ctx.db
        .select({ id: engineerProfiles.id })
        .from(engineerProfiles)
        .where(eq(engineerProfiles.userId, ctx.user!.id))
        .limit(1);

      const payload: any = {
        userId: ctx.user!.id,
        tenantId,
        skills: input.skills ? JSON.stringify(input.skills) : undefined,
        certifications: input.certifications ? JSON.stringify(input.certifications) : undefined,
        region: input.region,
        regionLat: input.regionLat != null ? String(input.regionLat) : undefined,
        regionLng: input.regionLng != null ? String(input.regionLng) : undefined,
        maxTravelRadiusKm: input.maxTravelRadiusKm,
        isAvailable: input.isAvailable != null ? (input.isAvailable ? 1 : 0) : undefined,
        availabilityNotes: input.availabilityNotes,
      };

      // Remove undefined fields
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      if (existing) {
        await ctx.db
          .update(engineerProfiles)
          .set(payload)
          .where(eq(engineerProfiles.userId, ctx.user!.id));
      } else {
        await ctx.db.insert(engineerProfiles).values(payload);
      }

      return { success: true };
    }),

  // ── M-04: Link Inspection to Claim ───────────────────────────────────────────

  linkToClaim: engineerDomainProcedure
    .input(z.object({
      inspectionId: z.number().int().positive(),
      claimId: z.number().int().positive().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
      await requireInspectionAccess(
        ctx.db, input.inspectionId, ctx.user!.id, ctx.user!.role, tenantId,
      );
      if (input.claimId !== null) {
        const [claim] = await ctx.db
          .select({ id: claims.id })
          .from(claims)
          .where(and(eq(claims.id, input.claimId), eq(claims.tenantId, tenantId)))
          .limit(1);
        if (!claim) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found." });
        }
      }
      await ctx.db.update(inspections)
        .set({ claimId: input.claimId })
        .where(eq(inspections.id, input.inspectionId));
      return { success: true, claimId: input.claimId };
    }),

  // ── M-05: Inspection Projects ───────────────────────────────────────────────

  createProject: engineerDomainProcedure
    .input(z.object({
      projectName: z.string().min(1).max(255),
      clientName: z.string().optional(),
      description: z.string().optional(),
      startDate: z.string().optional(),
      targetEndDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const projectRef = `PROJ-${Date.now().toString(36).toUpperCase()}`;
      const [result] = await ctx.db.insert(inspectionProjects).values({
        // Guaranteed by engineerDomainProcedure; no null-tenant project rows.
        tenantId: ctx.user!.tenantId!,
        projectRef,
        projectName: input.projectName,
        clientName: input.clientName,
        description: input.description,
        startDate: input.startDate,
        targetEndDate: input.targetEndDate,
        createdBy: ctx.user!.id,
      });
      return { success: true, id: (result as any).insertId, projectRef };
    }),

  listProjects: engineerDomainProcedure
    .input(z.object({
      status: z.enum(['active','completed','on_hold','cancelled','all']).default('all'),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      // Guaranteed by engineerDomainProcedure; no owner-only tenantless fallback.
      const tenantId = ctx.user!.tenantId!;
      const conditions: any[] = [eq(inspectionProjects.tenantId, tenantId)];
      if (input.status !== 'all') conditions.push(eq(inspectionProjects.status, input.status as any));
      const rows = await ctx.db.select().from(inspectionProjects)
        .where(and(...conditions))
        .orderBy(desc(inspectionProjects.createdAt))
        .limit(input.limit).offset(input.offset);
      const [countRow] = await ctx.db.select({ count: sql`COUNT(*)` })
        .from(inspectionProjects).where(and(...conditions));
      return { projects: rows, total: Number(countRow?.count ?? 0) };
    }),

  updateProject: engineerDomainProcedure
    .input(z.object({
      id: z.number().int().positive(),
      projectName: z.string().min(1).max(255).optional(),
      clientName: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['active','completed','on_hold','cancelled']).optional(),
      targetEndDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const updateData: any = { ...updates };
      if (updates.status === 'completed') updateData.completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await ctx.db.update(inspectionProjects)
        .set(updateData)
        .where(and(
          eq(inspectionProjects.id, id),
          eq(inspectionProjects.createdBy, ctx.user!.id)
        ));
      return { success: true };
    }),

  /**
   * getProjectDashboard — KPI summary for the Engineer Dashboard KPI strip.
   * Returns: activeProjects, totalInspections, dueThisWeek, pendingReports, recentInspections
   */
  getProjectDashboard: engineerDomainProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id;
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const [[activeProjectsResult], [totalInspectionsResult], [dueThisWeekResult], [pendingReportsResult], recentInspections] = await Promise.all([
      ctx.db.select({ count: sql`count(*)` }).from(inspectionProjects)
        .where(and(eq(inspectionProjects.createdBy, userId), eq(inspectionProjects.status, 'active'))),
      ctx.db.select({ count: sql`count(*)` }).from(inspections)
        .where(eq(inspections.createdBy, userId)),
      ctx.db.select({ count: sql`count(*)` }).from(inspections)
        .where(and(eq(inspections.createdBy, userId), eq(inspections.status, 'scheduled'), sql`DATE(${inspections.scheduledDate}) <= ${weekEndStr}`)),
      ctx.db.select({ count: sql`count(*)` }).from(inspections)
        .where(and(eq(inspections.createdBy, userId), eq(inspections.status, 'complete'), sql`${inspections.aiAnalysisJson} IS NULL`)),
      ctx.db.select({
        id: inspections.id,
        referenceNumber: inspections.inspectionRef,
        status: inspections.status,
        vehicleRegistration: inspections.vehicleRegistration,
        scheduledDate: inspections.scheduledDate,
        createdAt: inspections.createdAt,
      }).from(inspections).where(eq(inspections.createdBy, userId)).orderBy(desc(inspections.createdAt)).limit(5),
    ]);

    return {
      activeProjects: Number(activeProjectsResult?.count ?? 0),
      totalInspections: Number(totalInspectionsResult?.count ?? 0),
      dueThisWeek: Number(dueThisWeekResult?.count ?? 0),
      pendingReports: Number(pendingReportsResult?.count ?? 0),
      recentInspections,
    };
  }),
});
