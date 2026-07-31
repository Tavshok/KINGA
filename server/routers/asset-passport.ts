/**
 * KINGA Epic 4 — Asset Passport Router
 *
 * Provides a persistent longitudinal intelligence record for every non-vehicle
 * asset in the platform. Aggregates data from canonical tables only — no
 * re-computation of intelligence that already exists.
 *
 * Canonical sources:
 *   asset_registry       → identity, type, location, risk rating
 *   inspections          → inspection history, physics reconciliation status
 *   physical_measurements → measurement records per inspection
 *   engineer_observations → observation records per inspection
 *   risk_register        → risk events linked to claims
 *   maintenance_alerts   → maintenance history (vehicle assets)
 *   claims               → claim history linked to asset via vehicle_registration
 *   fraud_alerts         → fraud alerts via claim linkage
 *   workflow_audit_trail → workflow events via claim linkage
 *
 * Governance: ADR-001, ADR-012, P-01, P-03, P-14
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  assetRegistry,
  inspections,
  physicalMeasurements,
  engineerObservations,
  riskRegister,
  maintenanceAlerts,
  claims,
  fraudAlerts,
} from "../../drizzle/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

interface AssetTimelineEvent {
  eventType: string;
  eventDate: string;
  description: string;
  sourceTable: string;
  sourceId: number;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const assetPassportRouter = router({

  /**
   * getPassport — Full asset passport aggregation.
   * Returns identity, inspection summary, risk summary, and recent timeline.
   * Source: asset_registry (identity) + inspections + risk_register + claims.
   */
  getPassport: protectedProcedure
    .input(z.object({
      assetId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // 1. Asset identity (canonical: asset_registry)
      const [asset] = await db
        .select()
        .from(assetRegistry)
        .where(and(
          eq(assetRegistry.id, input.assetId),
          eq(assetRegistry.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
      }

      // 2. Inspection summary (canonical: inspections)
      const inspectionSummary = await db
        .select({
          totalInspections: count(inspections.id),
          completedInspections: sql<number>`SUM(CASE WHEN ${inspections.status} = 'complete' THEN 1 ELSE 0 END)`,
          physicsReconciledCount: sql<number>`SUM(CASE WHEN ${inspections.physicsReconciled} = 1 THEN 1 ELSE 0 END)`,
          aiApprovedCount: sql<number>`SUM(CASE WHEN ${inspections.aiAnalysisApproved} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(inspections)
        .where(and(
          eq(inspections.assetRegistryId, input.assetId),
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
        ));

      // 3. Claim summary via vehicle_registration linkage (canonical: claims)
      let claimSummary = { totalClaims: 0, totalApprovedCents: 0 };
      if (asset.vehicleRegistration) {
        const [cs] = await db
          .select({
            totalClaims: count(claims.id),
            totalApprovedCents: sql<number>`COALESCE(SUM(${claims.finalApprovedAmount}), 0)`,
          })
          .from(claims)
          .where(and(
            eq(claims.vehicleRegistration, asset.vehicleRegistration),
            eq(claims.tenantId, ctx.user.tenantId ?? ""),
          ));
        if (cs) {
          claimSummary = {
            totalClaims: Number(cs.totalClaims) || 0,
            totalApprovedCents: Number(cs.totalApprovedCents) || 0,
          };
        }
      }

      // 4. Risk register summary (canonical: risk_register via claim linkage)
      const [riskSummary] = await db
        .select({
          openRisks: sql<number>`SUM(CASE WHEN ${riskRegister.status} = 'open' THEN 1 ELSE 0 END)`,
          highRisks: sql<number>`SUM(CASE WHEN ${riskRegister.riskScore} >= 15 THEN 1 ELSE 0 END)`,
          avgRiskScore: sql<number>`COALESCE(AVG(${riskRegister.riskScore}), 0)`,
        })
        .from(riskRegister)
        .where(eq(riskRegister.tenantId, ctx.user.tenantId ?? ""));

      return {
        asset,
        inspectionSummary: inspectionSummary[0] ?? {
          totalInspections: 0,
          completedInspections: 0,
          physicsReconciledCount: 0,
          aiApprovedCount: 0,
        },
        claimSummary,
        riskSummary: riskSummary ?? { openRisks: 0, highRisks: 0, avgRiskScore: 0 },
        // Traceability: every value sourced from canonical tables
        dataSources: [
          "asset_registry",
          "inspections",
          "claims",
          "risk_register",
        ],
      };
    }),

  /**
   * getInspectionHistory — Full inspection history for an asset.
   * Source: inspections + physical_measurements + engineer_observations.
   */
  getInspectionHistory: protectedProcedure
    .input(z.object({
      assetId: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const inspectionList = await db
        .select({
          id: inspections.id,
          inspectionRef: inspections.inspectionRef,
          inspectionType: inspections.inspectionType,
          status: inspections.status,
          scheduledDate: inspections.scheduledDate,
          completedAt: inspections.completedAt,
          durationMinutes: inspections.durationMinutes,
          aiAnalysisApproved: inspections.aiAnalysisApproved,
          physicsReconciled: inspections.physicsReconciled,
          assignedEngineerId: inspections.assignedEngineerId,
          reportId: inspections.reportId,
        })
        .from(inspections)
        .where(and(
          eq(inspections.assetRegistryId, input.assetId),
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(inspections.completedAt))
        .limit(input.limit);

      // For each inspection, get measurement and observation counts
      const enriched = await Promise.all(inspectionList.map(async (insp) => {
        const [measurementCount] = await db
          .select({ count: count(physicalMeasurements.id) })
          .from(physicalMeasurements)
          .where(eq(physicalMeasurements.inspectionId, insp.id));

        const [observationCount] = await db
          .select({ count: count(engineerObservations.id) })
          .from(engineerObservations)
          .where(eq(engineerObservations.inspectionId, insp.id));

        return {
          ...insp,
          measurementCount: Number(measurementCount?.count) || 0,
          observationCount: Number(observationCount?.count) || 0,
        };
      }));

      return {
        inspections: enriched,
        total: enriched.length,
        dataSources: ["inspections", "physical_measurements", "engineer_observations"],
      };
    }),

  /**
   * getTimeline — Chronological event timeline for an asset.
   * Source: inspections + claims + risk_register + maintenance_alerts + fraud_alerts.
   */
  getTimeline: protectedProcedure
    .input(z.object({
      assetId: z.number().int().positive(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [asset] = await db
        .select({ vehicleRegistration: assetRegistry.vehicleRegistration })
        .from(assetRegistry)
        .where(and(
          eq(assetRegistry.id, input.assetId),
          eq(assetRegistry.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });

      const events: AssetTimelineEvent[] = [];

      // 1. Inspection events (canonical: inspections)
      const inspectionEvents = await db
        .select({
          id: inspections.id,
          completedAt: inspections.completedAt,
          scheduledDate: inspections.scheduledDate,
          status: inspections.status,
          inspectionType: inspections.inspectionType,
          physicsReconciled: inspections.physicsReconciled,
          aiAnalysisApproved: inspections.aiAnalysisApproved,
        })
        .from(inspections)
        .where(and(
          eq(inspections.assetRegistryId, input.assetId),
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(inspections.completedAt))
        .limit(input.limit);

      for (const i of inspectionEvents) {
        events.push({
          eventType: "inspection",
          eventDate: i.completedAt ?? i.scheduledDate ?? "",
          description: `Inspection: ${i.inspectionType} — ${i.status}`,
          sourceTable: "inspections",
          sourceId: i.id,
          metadata: {
            status: i.status,
            inspectionType: i.inspectionType,
            physicsReconciled: i.physicsReconciled === 1,
            aiAnalysisApproved: i.aiAnalysisApproved === 1,
          },
        });
      }

      // 2. Claim events via vehicle_registration (canonical: claims)
      if (asset.vehicleRegistration) {
        const claimEvents = await db
          .select({
            id: claims.id,
            claimNumber: claims.claimNumber,
            status: claims.status,
            createdAt: claims.createdAt,
            finalApprovedAmount: claims.finalApprovedAmount,
          })
          .from(claims)
          .where(and(
            eq(claims.vehicleRegistration, asset.vehicleRegistration),
            eq(claims.tenantId, ctx.user.tenantId ?? ""),
          ))
          .orderBy(desc(claims.createdAt))
          .limit(input.limit);

        for (const c of claimEvents) {
          events.push({
            eventType: "claim",
            eventDate: c.createdAt ?? "",
            description: `Claim ${c.claimNumber} — ${c.status}`,
            sourceTable: "claims",
            sourceId: c.id,
            metadata: {
              claimNumber: c.claimNumber,
              status: c.status,
              finalApprovedAmount: c.finalApprovedAmount,
            },
          });
        }

        // 3. Fraud alerts via claim linkage (canonical: fraud_alerts)
        const fraudAlertEvents = await db
          .select({
            id: fraudAlerts.id,
            createdAt: fraudAlerts.createdAt,
            alertType: fraudAlerts.alertType,
            alertSeverity: fraudAlerts.alertSeverity,
            alertDescription: fraudAlerts.alertDescription,
          })
          .from(fraudAlerts)
          .innerJoin(claims, eq(claims.id, fraudAlerts.claimId))
          .where(and(
            eq(claims.vehicleRegistration, asset.vehicleRegistration),
            eq(claims.tenantId, ctx.user.tenantId ?? ""),
          ))
          .orderBy(desc(fraudAlerts.createdAt))
          .limit(input.limit);

        for (const f of fraudAlertEvents) {
          events.push({
            eventType: "fraud_alert",
            eventDate: f.createdAt ?? "",
            description: `Fraud Alert: ${f.alertType} — ${f.alertSeverity} severity`,
            sourceTable: "fraud_alerts",
            sourceId: f.id,
            metadata: {
              alertType: f.alertType,
              alertSeverity: f.alertSeverity,
              alertDescription: f.alertDescription,
            },
          });
        }
      }

      // 4. Maintenance alerts (canonical: maintenance_alerts)
      const maintenanceEvents = await db
        .select({
          id: maintenanceAlerts.id,
          createdAt: maintenanceAlerts.createdAt,
          alertType: maintenanceAlerts.alertType,
          severity: maintenanceAlerts.severity,
          message: maintenanceAlerts.message,
          status: maintenanceAlerts.status,
        })
        .from(maintenanceAlerts)
        .where(eq(maintenanceAlerts.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(maintenanceAlerts.createdAt))
        .limit(input.limit);

      for (const m of maintenanceEvents) {
        events.push({
          eventType: "maintenance",
          eventDate: m.createdAt ?? "",
          description: `Maintenance: ${m.alertType} — ${m.severity}${m.status === 'resolved' ? " (resolved)" : ""}`,
          sourceTable: "maintenance_alerts",
          sourceId: m.id,
          metadata: {
            alertType: m.alertType,
            severity: m.severity,
            message: m.message,
            status: m.status,
          },
        });
      }

      // Sort all events by date descending
      events.sort((a, b) => {
        const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const db2 = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return db2 - da;
      });

      return {
        assetId: input.assetId,
        events: events.slice(0, input.limit),
        total: events.length,
        dataSources: ["inspections", "claims", "fraud_alerts", "maintenance_alerts"],
      };
    }),

  /**
   * getRiskProfile — Risk intelligence for an asset.
   * Source: risk_register + inspections (physics/AI validation rates).
   */
  getRiskProfile: protectedProcedure
    .input(z.object({
      assetId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify asset belongs to tenant
      const [asset] = await db
        .select({ id: assetRegistry.id, riskRating: assetRegistry.riskRating, assetType: assetRegistry.assetType })
        .from(assetRegistry)
        .where(and(
          eq(assetRegistry.id, input.assetId),
          eq(assetRegistry.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });

      // Risk register entries for this tenant
      const riskEntries = await db
        .select({
          id: riskRegister.id,
          riskType: riskRegister.riskType,
          likelihood: riskRegister.likelihood,
          impact: riskRegister.impact,
          riskScore: riskRegister.riskScore,
          description: riskRegister.description,
          status: riskRegister.status,
          treatmentPlan: riskRegister.treatmentPlan,
          identifiedAt: riskRegister.identifiedAt,
        })
        .from(riskRegister)
        .where(eq(riskRegister.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(riskRegister.riskScore))
        .limit(20);

      // Inspection quality metrics (canonical: inspections)
      const [inspQuality] = await db
        .select({
          total: count(inspections.id),
          physicsValidated: sql<number>`SUM(CASE WHEN ${inspections.physicsReconciled} = 1 THEN 1 ELSE 0 END)`,
          aiApproved: sql<number>`SUM(CASE WHEN ${inspections.aiAnalysisApproved} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(inspections)
        .where(and(
          eq(inspections.assetRegistryId, input.assetId),
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
        ));

      const total = Number(inspQuality?.total) || 0;
      const physicsValidated = Number(inspQuality?.physicsValidated) || 0;
      const aiApproved = Number(inspQuality?.aiApproved) || 0;

      return {
        assetId: input.assetId,
        currentRiskRating: asset.riskRating,
        riskEntries,
        inspectionQuality: {
          total,
          physicsValidationRate: total > 0 ? Math.round((physicsValidated / total) * 100) : null,
          aiApprovalRate: total > 0 ? Math.round((aiApproved / total) * 100) : null,
        },
        dataSources: ["asset_registry", "risk_register", "inspections"],
      };
    }),

  /**
   * listAssets — List all assets for the tenant with summary intelligence.
   * Source: asset_registry + inspections (aggregated).
   */
  listAssets: protectedProcedure
    .input(z.object({
      assetType: z.string().optional(),
      riskRating: z.enum(["low", "medium", "high", "critical"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const conditions = [eq(assetRegistry.tenantId, ctx.user.tenantId ?? "")];
      if (input.riskRating) {
        conditions.push(eq(assetRegistry.riskRating, input.riskRating));
      }

      const assets = await db
        .select({
          id: assetRegistry.id,
          assetRef: assetRegistry.assetRef,
          assetType: assetRegistry.assetType,
          assetName: assetRegistry.assetName,
          manufacturer: assetRegistry.manufacturer,
          model: assetRegistry.model,
          yearManufactured: assetRegistry.yearManufactured,
          riskRating: assetRegistry.riskRating,
          inspectionCount: assetRegistry.inspectionCount,
          lastInspectedAt: assetRegistry.lastInspectedAt,
          vehicleRegistration: assetRegistry.vehicleRegistration,
          locationAddress: assetRegistry.locationAddress,
        })
        .from(assetRegistry)
        .where(and(...conditions))
        .orderBy(desc(assetRegistry.lastInspectedAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        assets,
        count: assets.length,
        dataSources: ["asset_registry"],
      };
    }),

  /**
   * getMaintenanceHistory — Maintenance history for an asset.
   * Source: maintenance_alerts (canonical maintenance table).
   */
  getMaintenanceHistory: protectedProcedure
    .input(z.object({
      assetId: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify asset belongs to tenant
      const [asset] = await db
        .select({ id: assetRegistry.id })
        .from(assetRegistry)
        .where(and(
          eq(assetRegistry.id, input.assetId),
          eq(assetRegistry.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });

      const alerts = await db
        .select({
          id: maintenanceAlerts.id,
          alertType: maintenanceAlerts.alertType,
          severity: maintenanceAlerts.severity,
          message: maintenanceAlerts.message,
          status: maintenanceAlerts.status,
          resolvedAt: maintenanceAlerts.resolvedAt,
          createdAt: maintenanceAlerts.createdAt,
        })
        .from(maintenanceAlerts)
        .where(eq(maintenanceAlerts.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(maintenanceAlerts.createdAt))
        .limit(input.limit);

      return {
        assetId: input.assetId,
        maintenanceAlerts: alerts,
        total: alerts.length,
        dataSources: ["maintenance_alerts"],
      };
    }),
});
