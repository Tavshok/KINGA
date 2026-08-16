/**
 * Epic 4 — Intelligence Platform
 * Vehicle Passport Router
 *
 * Aggregates all canonical intelligence for a vehicle into a unified passport.
 * Every value is traceable to its originating canonical table or platform service.
 *
 * Governance: ADR-001 (Shared Intelligence Architecture), ADR-011 (Vehicle Passport Strategy)
 * P-01: Intelligence belongs to the platform.
 * P-03: Reuse before create.
 * P-04: No duplicate engines.
 * P-13: Evidence must preserve provenance.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  vehicleRegistry,
  claims,
  vehicleDamageHistory,
  crossClaimSignals,
  inspections,
  claimConfidenceScores,
  fraudAlerts,
  aiAssessments,
  vehiclePassportSnapshots,
  vehicleConditionSnapshots,
  agencyInsuranceServiceRequestInsurers,
  agencyInsuranceServiceRequests,
} from "../../drizzle/schema";
import {
  eq,
  and,
  sql,
  desc,
  count,
  avg,
  sum,
  max,
  isNotNull,
} from "drizzle-orm";
import {
  aggregateVehiclePassport,
  computeVehicleRenewalRisk,
} from "../services/epic4-aggregation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimelineEvent {
  eventType: string;
  eventDate: string;
  description: string;
  sourceTable: string;
  sourceId: number;
  metadata: Record<string, unknown>;
}

async function getAuthorisedPreLossConditionSnapshots(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  vehicleRegistryId: number,
  tenantId?: string | null,
) {
  if (!tenantId) return [];
  return db.select({
    id: vehicleConditionSnapshots.id,
    snapshotVersion: vehicleConditionSnapshots.snapshotVersion,
    snapshotDate: vehicleConditionSnapshots.snapshotDate,
    exteriorCondition: vehicleConditionSnapshots.exteriorCondition,
    interiorCondition: vehicleConditionSnapshots.interiorCondition,
    mechanicalCondition: vehicleConditionSnapshots.mechanicalCondition,
    existingDamageNotes: vehicleConditionSnapshots.existingDamageNotes,
    tyreCondition: vehicleConditionSnapshots.tyreCondition,
    glassCondition: vehicleConditionSnapshots.glassCondition,
    odometerKm: vehicleConditionSnapshots.odometerKm,
    modificationsJson: vehicleConditionSnapshots.modificationsJson,
    photographsJson: vehicleConditionSnapshots.photographsJson,
    evidenceSourcesJson: vehicleConditionSnapshots.evidenceSourcesJson,
    observations: vehicleConditionSnapshots.observations,
    serviceRequestId: agencyInsuranceServiceRequests.id,
    requestNumber: agencyInsuranceServiceRequests.requestNumber,
    valuationDate: agencyInsuranceServiceRequests.valuationDate,
    valuationProvenanceJson: agencyInsuranceServiceRequests.valuationProvenanceJson,
  }).from(vehicleConditionSnapshots)
    .innerJoin(agencyInsuranceServiceRequests, eq(agencyInsuranceServiceRequests.id, vehicleConditionSnapshots.insuranceServiceRequestId))
    .innerJoin(agencyInsuranceServiceRequestInsurers, eq(agencyInsuranceServiceRequestInsurers.serviceRequestId, agencyInsuranceServiceRequests.id))
    .where(and(
      eq(vehicleConditionSnapshots.vehicleRegistryId, vehicleRegistryId),
      eq(agencyInsuranceServiceRequestInsurers.insurerTenantId, tenantId),
      inArray(agencyInsuranceServiceRequestInsurers.status, ["invited", "viewed", "responded"]),
    ))
    .orderBy(desc(vehicleConditionSnapshots.snapshotDate));
}

async function canAccessVehiclePassport(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  vehicle: { tenantId: string | null },
  vehicleRegistryId: number,
  tenantId?: string | null,
) {
  if (!vehicle.tenantId || vehicle.tenantId === tenantId) return true;
  return (await getAuthorisedPreLossConditionSnapshots(db, vehicleRegistryId, tenantId)).length > 0;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const vehiclePassportRouter = router({
  /**
   * Get the full Vehicle Passport for a vehicle by registry ID.
   * Aggregates data from all canonical tables.
   * Source: vehicle_registry + claims + vehicle_damage_history +
   *         cross_claim_signals + inspections + claim_confidence_scores + fraud_alerts
   */
  getPassport: protectedProcedure
    .input(
      z.object({
        vehicleRegistryId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });

      // Verify vehicle exists and belongs to tenant
      const [vehicle] = await db
        .select()
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.id, input.vehicleRegistryId))
        .limit(1);

      if (!vehicle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      }

      // Tenant isolation with an explicit insurer-invitation evidence exception.
      if (!await canAccessVehiclePassport(db, vehicle, input.vehicleRegistryId, tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Aggregate all intelligence from canonical tables
      const intelligence = await aggregateVehiclePassport(input.vehicleRegistryId, tenantId);

      if (!intelligence) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle intelligence unavailable" });
      }

      // Compute predictive renewal risk (deterministic model v1.0)
      const renewalRisk = await computeVehicleRenewalRisk(
        input.vehicleRegistryId,
        vehicle.registrationNumber ?? "",
        tenantId
      );
      const preLossConditionSnapshots = await getAuthorisedPreLossConditionSnapshots(db, input.vehicleRegistryId, tenantId);

      return {
        vehicle,
        intelligence,
        renewalRisk,
        preLossConditionSnapshots,
        preLossEvidenceBoundary: "These dated snapshots are pre-loss valuation evidence only. They do not determine a claim outcome, repair cost, policy, premium, settlement, or fraud conclusion.",
        generatedAt: new Date().toISOString(),
        dataVersion: "v1.0",
      };
    }),

  /**
   * Get Vehicle Passport by registration number.
   * Looks up vehicle_registry first, then aggregates.
   */
  getPassportByRegistration: protectedProcedure
    .input(
      z.object({
        registrationNumber: z.string().min(1).max(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });

      const regNum = input.registrationNumber.toUpperCase().replace(/\s+/g, "");

      const [vehicle] = await db
        .select()
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.registrationNumber, regNum))
        .limit(1);

      if (!vehicle) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found in registry" });
      }

      if (!await canAccessVehiclePassport(db, vehicle, vehicle.id, tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const intelligence = await aggregateVehiclePassport(vehicle.id, tenantId);

      const renewalRisk = await computeVehicleRenewalRisk(
        vehicle.id,
        regNum,
        tenantId
      );
      const preLossConditionSnapshots = await getAuthorisedPreLossConditionSnapshots(db, vehicle.id, tenantId);

      return {
        vehicle,
        intelligence,
        renewalRisk,
        preLossConditionSnapshots,
        preLossEvidenceBoundary: "These dated snapshots are pre-loss valuation evidence only. They do not determine a claim outcome, repair cost, policy, premium, settlement, or fraud conclusion.",
        generatedAt: new Date().toISOString(),
        dataVersion: "v1.0",
      };
    }),

  /**
   * Get the unified timeline for a vehicle.
   * Reads from: claims, inspections, vehicle_damage_history, fraud_alerts
   * Returns events in reverse chronological order.
   * Source table is included with every event for full traceability.
   */
  getTimeline: protectedProcedure
    .input(
      z.object({
        vehicleRegistryId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [vehicle] = await db
        .select({ id: vehicleRegistry.id, registrationNumber: vehicleRegistry.registrationNumber, tenantId: vehicleRegistry.tenantId })
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.id, input.vehicleRegistryId))
        .limit(1);

      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      if (!await canAccessVehiclePassport(db, vehicle, input.vehicleRegistryId, ctx.user.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const regNum = vehicle.registrationNumber ?? "";
      const events: TimelineEvent[] = [];

      // 1. Claims (canonical: claims table)
      const claimEvents = await db
        .select({
          id: claims.id,
          createdAt: claims.createdAt,
          status: claims.status,
          claimReference: claims.claimReference,
          finalApprovedAmount: claims.finalApprovedAmount,
          currencyCode: claims.currencyCode,
        })
        .from(claims)
        .where(eq(claims.vehicleRegistration, regNum))
        .orderBy(desc(claims.createdAt))
        .limit(input.limit);

      for (const c of claimEvents) {
        events.push({
          eventType: "claim",
          eventDate: c.createdAt ?? "",
          description: `Claim ${c.claimReference ?? c.id} — ${c.status}`,
          sourceTable: "claims",
          sourceId: c.id,
          metadata: {
            status: c.status,
            claimReference: c.claimReference,
            finalApprovedAmount: c.finalApprovedAmount,
            currencyCode: c.currencyCode,
          },
        });
      }

      // 2. Damage history (canonical: vehicle_damage_history table)
      const damageEvents = await db
        .select({
          id: vehicleDamageHistory.id,
          createdAt: vehicleDamageHistory.createdAt,
          damageZone: vehicleDamageHistory.damageZone,
          severity: vehicleDamageHistory.severity,
          isRepeatZone: vehicleDamageHistory.isRepeatZone,
          repairCostEstimateCents: vehicleDamageHistory.repairCostEstimateCents,
          actualRepairCostCents: vehicleDamageHistory.actualRepairCostCents,
        })
        .from(vehicleDamageHistory)
        .where(eq(vehicleDamageHistory.vehicleId, input.vehicleRegistryId))
        .orderBy(desc(vehicleDamageHistory.createdAt))
        .limit(input.limit);

      for (const d of damageEvents) {
        events.push({
          eventType: "damage_event",
          eventDate: d.createdAt ?? "",
          description: `Damage: ${d.damageZone ?? "unknown zone"} — ${d.severity ?? "unknown severity"}${d.isRepeatZone ? " (REPEAT ZONE)" : ""}`,
          sourceTable: "vehicle_damage_history",
          sourceId: d.id,
          metadata: {
            damageZone: d.damageZone,
            severity: d.severity,
            isRepeatZone: d.isRepeatZone === 1,
            repairCostEstimateCents: d.repairCostEstimateCents,
            actualRepairCostCents: d.actualRepairCostCents,
          },
        });
      }

      // 3. Inspections (canonical: inspections table)
      const inspectionEvents = await db
        .select({
          id: inspections.id,
          completedAt: inspections.completedAt,
          status: inspections.status,
          inspectionType: inspections.inspectionType,
          aiAnalysisApproved: inspections.aiAnalysisApproved,
          physicsReconciled: inspections.physicsReconciled,
        })
        .from(inspections)
        .where(eq(inspections.vehicleRegistration, regNum))
        .orderBy(desc(inspections.completedAt))
        .limit(input.limit);

      for (const i of inspectionEvents) {
        events.push({
          eventType: "inspection",
          eventDate: i.completedAt ?? "",
          description: `Inspection: ${i.inspectionType ?? "standard"} — ${i.status}`,
          sourceTable: "inspections",
          sourceId: i.id,
          metadata: {
            status: i.status,
            inspectionType: i.inspectionType,
            aiAnalysisApproved: i.aiAnalysisApproved === 1,
            physicsReconciled: i.physicsReconciled === 1,
          },
        });
      }

      // 4. Dated pre-loss valuation condition evidence. It is not a claim outcome.
      const preLossSnapshots = await getAuthorisedPreLossConditionSnapshots(db, input.vehicleRegistryId, ctx.user.tenantId);
      for (const snapshot of preLossSnapshots) {
        events.push({
          eventType: "pre_loss_condition_snapshot",
          eventDate: snapshot.snapshotDate ?? "",
          description: `Pre-loss valuation condition snapshot v${snapshot.snapshotVersion} — exterior ${snapshot.exteriorCondition}, interior ${snapshot.interiorCondition}, mechanical ${snapshot.mechanicalCondition}`,
          sourceTable: "vehicle_condition_snapshots",
          sourceId: snapshot.id,
          metadata: {
            serviceRequestId: snapshot.serviceRequestId,
            requestNumber: snapshot.requestNumber,
            valuationDate: snapshot.valuationDate,
            evidenceSources: snapshot.evidenceSourcesJson,
            boundary: "Pre-loss evidence only; not a claim outcome, repair estimate, settlement, premium, policy, or fraud conclusion.",
          },
        });
      }

      // 5. Fraud alerts (canonical: fraud_alerts table)
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
        .where(eq(claims.vehicleRegistration, regNum))
        .orderBy(desc(fraudAlerts.createdAt))
        .limit(input.limit);

      for (const f of fraudAlertEvents) {
        events.push({
          eventType: "fraud_alert",
          eventDate: f.createdAt ?? "",
          description: `Fraud Alert: ${f.alertType ?? "unknown"} — ${f.alertSeverity ?? "unknown"} severity`,
          sourceTable: "fraud_alerts",
          sourceId: f.id,
          metadata: {
            alertType: f.alertType,
            alertSeverity: f.alertSeverity,
            alertDescription: f.alertDescription,
          },
        });
      }

      // Sort all events by date descending
      events.sort((a, b) => {
        const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return dateB - dateA;
      });

      return {
        registrationNumber: regNum,
        totalEvents: events.length,
        events: events.slice(0, input.limit),
        dataSourceMap: {
          claims: "claims",
          damageEvents: "vehicle_damage_history",
          inspections: "inspections",
          preLossConditionSnapshots: "vehicle_condition_snapshots",
          fraudAlerts: "fraud_alerts",
        },
      };
    }),

  /**
   * Get the claim history for a vehicle.
   * Source: claims + ai_assessments tables.
   */
  getClaimHistory: protectedProcedure
    .input(
      z.object({
        vehicleRegistryId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [vehicle] = await db
        .select({ registrationNumber: vehicleRegistry.registrationNumber, tenantId: vehicleRegistry.tenantId })
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.id, input.vehicleRegistryId))
        .limit(1);

      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      if (vehicle.tenantId && vehicle.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const regNum = vehicle.registrationNumber ?? "";

      const claimHistory = await db
        .select({
          claimId: claims.id,
          claimReference: claims.claimReference,
          status: claims.status,
          createdAt: claims.createdAt,
          finalApprovedAmount: claims.finalApprovedAmount,
          currencyCode: claims.currencyCode,
          fraudScore: aiAssessments.fraudScore,
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          recommendation: aiAssessments.recommendation,
          confidenceScore: aiAssessments.confidenceScore,
        })
        .from(claims)
        .leftJoin(aiAssessments, eq(aiAssessments.claimId, claims.id))
        .where(eq(claims.vehicleRegistration, regNum))
        .orderBy(desc(claims.createdAt))
        .limit(input.limit);

      return {
        registrationNumber: regNum,
        totalClaims: claimHistory.length,
        claims: claimHistory,
        dataSourceMap: {
          claims: "claims",
          assessments: "ai_assessments",
        },
      };
    }),

  /**
   * Get the fraud signal summary for a vehicle.
   * Source: cross_claim_signals + fraud_alerts + ai_assessments tables.
   */
  getFraudSignals: protectedProcedure
    .input(
      z.object({
        vehicleRegistryId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [vehicle] = await db
        .select({ registrationNumber: vehicleRegistry.registrationNumber, tenantId: vehicleRegistry.tenantId })
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.id, input.vehicleRegistryId))
        .limit(1);

      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      if (vehicle.tenantId && vehicle.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const regNum = vehicle.registrationNumber ?? "";

      // Cross-claim signals (canonical: cross_claim_signals)
      const signals = await db
        .select({
          id: crossClaimSignals.id,
          signalType: crossClaimSignals.signalType,
          confidence: crossClaimSignals.confidence,
          signalLabel: crossClaimSignals.signalLabel,
          createdAt: crossClaimSignals.createdAt,
          claimId: crossClaimSignals.claimId,
        })
        .from(crossClaimSignals)
        .innerJoin(claims, eq(claims.id, crossClaimSignals.claimId))
        .where(eq(claims.vehicleRegistration, regNum))
        .orderBy(desc(crossClaimSignals.createdAt));

      // Fraud alerts (canonical: fraud_alerts)
      const alerts = await db
        .select({
          id: fraudAlerts.id,
          alertType: fraudAlerts.alertType,
          alertSeverity: fraudAlerts.alertSeverity,
          alertDescription: fraudAlerts.alertDescription,
          createdAt: fraudAlerts.createdAt,
          claimId: fraudAlerts.claimId,
        })
        .from(fraudAlerts)
        .innerJoin(claims, eq(claims.id, fraudAlerts.claimId))
        .where(eq(claims.vehicleRegistration, regNum))
        .orderBy(desc(fraudAlerts.createdAt));

      return {
        registrationNumber: regNum,
        totalSignals: signals.length,
        totalAlerts: alerts.length,
        signals,
        alerts,
        dataSourceMap: {
          signals: "cross_claim_signals",
          alerts: "fraud_alerts",
        },
      };
    }),

  /**
   * Get the latest cached passport snapshot.
   * Returns the most recent entry from vehicle_passport_snapshots.
   */
  getLatestSnapshot: protectedProcedure
    .input(
      z.object({
        vehicleRegistryId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (!ctx.user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant required" });
      }

      const [vehicle] = await db
        .select({ id: vehicleRegistry.id, tenantId: vehicleRegistry.tenantId })
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.id, input.vehicleRegistryId))
        .limit(1);
      if (!vehicle || !await canAccessVehiclePassport(db, vehicle, input.vehicleRegistryId, ctx.user.tenantId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found or access denied" });
      }

      const [snapshot] = await db
        .select()
        .from(vehiclePassportSnapshots)
        .where(
          and(
            eq(vehiclePassportSnapshots.vehicleRegistryId, input.vehicleRegistryId),
            eq(vehiclePassportSnapshots.tenantId, ctx.user.tenantId)
          )
        )
        .orderBy(desc(vehiclePassportSnapshots.generatedAt))
        .limit(1);

      return snapshot ?? null;
    }),
});
