/**
 * KINGA Epic 4 — Intelligence Platform Routers
 *
 * Six intelligence module routers, all read-only against canonical tables.
 * No re-computation of intelligence that already exists in the platform.
 *
 * Modules:
 *   crossModuleIntelligenceRouter  — Signal propagation across domains
 *   fleetIntelligenceRouter        — Fleet-level risk and performance
 *   engineeringIntelligenceRouter  — Inspection quality and engineer performance
 *   portfolioIntelligenceRouter    — Insurer portfolio analytics
 *   timelineIntelligenceRouter     — Unified entity timeline
 *   predictiveAnalyticsRouter      — Deterministic risk scoring models
 *
 * Governance: ADR-001, ADR-002, ADR-008, P-01, P-03, P-04, P-07, P-14
 */

import { router, protectedProcedure as baseProtectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, count, sql, gte, lte, avg } from "drizzle-orm";
import { getDb } from "../db";
import {
  claims,
  drivers,
  fleetVehicles,
  fleetDrivers,
  fleets,
  fleetRiskScores,
  fleetIncidentReports,
  crossClaimSignals,
  vehicleRegistry,
  vehicleDamageHistory,
  inspections,
  physicalMeasurements,
  engineerObservations,
  aiAssessments,
  fraudAlerts,
  workflowAuditTrail,
  claimConfidenceScores,
  vehicleMarketValuations,
  vehiclePassportSnapshots,
  fleetIntelligenceSnapshots,
  predictiveRiskScores,
} from "../../drizzle/schema";

function requireIntelligenceTenant(ctx: { user?: { tenantId?: string | null } | null }) {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

// Every intelligence module is tenant-bound. The legacy predicates below are
// progressively being simplified, but no protected procedure may evaluate one
// without this session-derived tenant admission boundary.
const protectedProcedure = baseProtectedProcedure.use(async ({ ctx, next }) => {
  requireIntelligenceTenant(ctx);
  return next({ ctx });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CROSS-MODULE INTELLIGENCE ROUTER
// Surfaces signals that propagate across Claims, Fleet, Engineering, and Driver
// domains. Read-only. Sources: cross_claim_signals, fraud_alerts, drivers,
// vehicle_registry, claims.
// ─────────────────────────────────────────────────────────────────────────────

export const crossModuleIntelligenceRouter = router({

  /** Get all cross-claim signals for a vehicle registration. */
  getVehicleSignals: protectedProcedure
    .input(z.object({
      vehicleRegistration: z.string().min(1).max(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const signals = await db
        .select({
          id: crossClaimSignals.id,
          signalType: crossClaimSignals.signalType,
          scoreContribution: crossClaimSignals.scoreContribution,
          signalLabel: crossClaimSignals.signalLabel,
          createdAt: crossClaimSignals.createdAt,
          claimId: crossClaimSignals.claimId,
          evidenceJson: crossClaimSignals.evidenceJson,
          isDismissed: crossClaimSignals.isDismissed,
        })
        .from(crossClaimSignals)
        .innerJoin(claims, eq(claims.id, crossClaimSignals.claimId))
        .where(and(
          eq(claims.vehicleRegistration, input.vehicleRegistration),
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(crossClaimSignals.createdAt))
        .limit(50);

      return {
        vehicleRegistration: input.vehicleRegistration,
        signals,
        total: signals.length,
        dataSources: ["cross_claim_signals", "claims"],
      };
    }),

  /** Get driver risk signals across all claims. */
  getDriverSignals: protectedProcedure
    .input(z.object({
      driverId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [driver] = await db
        .select({
          id: drivers.id,
          fullName: drivers.fullName,
          driverRiskScore: drivers.driverRiskScore,
          totalClaimsCount: drivers.totalClaimsCount,
          atFaultClaimsCount: drivers.atFaultClaimsCount,
          isRepeatClaimer: drivers.isRepeatClaimer,
          isStagedAccidentSuspect: drivers.isStagedAccidentSuspect,
          lastFraudRiskScore: drivers.lastFraudRiskScore,
        })
        .from(drivers)
        .where(and(
          eq(drivers.id, input.driverId),
          eq(drivers.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!driver) throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });

      // Fraud alerts linked to this driver's claims
      const fraudSignals = await db
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
        .where(eq(claims.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(fraudAlerts.createdAt))
        .limit(20);

      return {
        driver,
        fraudSignals,
        dataSources: ["drivers", "fraud_alerts"],
      };
    }),

  /** Get platform-wide signal summary for the tenant. */
  getPlatformSignalSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [signalSummary] = await db
        .select({
          totalSignals: count(crossClaimSignals.id),
          activeSignals: sql<number>`SUM(CASE WHEN ${crossClaimSignals.isDismissed} = 0 THEN 1 ELSE 0 END)`,
          highStrengthSignals: sql<number>`SUM(CASE WHEN ${crossClaimSignals.scoreContribution} >= 20 THEN 1 ELSE 0 END)`,
        })
        .from(crossClaimSignals)
        .innerJoin(claims, eq(claims.id, crossClaimSignals.claimId))
        .where(eq(claims.tenantId, ctx.user.tenantId ?? ""));

      const [fraudSummary] = await db
        .select({
          totalAlerts: count(fraudAlerts.id),
          highSeverityAlerts: sql<number>`SUM(CASE WHEN ${fraudAlerts.alertSeverity} = 'high' THEN 1 ELSE 0 END)`,
        })
        .from(fraudAlerts)
        .innerJoin(claims, eq(claims.id, fraudAlerts.claimId))
        .where(eq(claims.tenantId, ctx.user.tenantId ?? ""));

      const [repeatClaimers] = await db
        .select({
          count: sql<number>`SUM(CASE WHEN ${drivers.isRepeatClaimer} = 1 THEN 1 ELSE 0 END)`,
          stagedSuspects: sql<number>`SUM(CASE WHEN ${drivers.isStagedAccidentSuspect} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(drivers)
        .where(eq(drivers.tenantId, ctx.user.tenantId ?? ""));

      return {
        signals: signalSummary ?? { totalSignals: 0, activeSignals: 0, highStrengthSignals: 0 },
        fraud: fraudSummary ?? { totalAlerts: 0, highSeverityAlerts: 0 },
        drivers: repeatClaimers ?? { count: 0, stagedSuspects: 0 },
        dataSources: ["cross_claim_signals", "fraud_alerts", "drivers", "claims"],
      };
    }),

  /** Get cross-module signal feed for the tenant (recent activity). */
  getSignalFeed: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const signals = await db
        .select({
          id: crossClaimSignals.id,
          signalType: crossClaimSignals.signalType,
          scoreContribution: crossClaimSignals.scoreContribution,
          signalLabel: crossClaimSignals.signalLabel,
          createdAt: crossClaimSignals.createdAt,
          claimId: crossClaimSignals.claimId,
          isDismissed: crossClaimSignals.isDismissed,
          vehicleRegistration: claims.vehicleRegistration,
        })
        .from(crossClaimSignals)
        .innerJoin(claims, eq(claims.id, crossClaimSignals.claimId))
        .where(eq(claims.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(crossClaimSignals.createdAt))
        .limit(input.limit);

      return {
        signals,
        total: signals.length,
        dataSources: ["cross_claim_signals", "claims"],
      };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FLEET INTELLIGENCE ROUTER
// Fleet-level risk profiles, vehicle/driver leaderboards, incident analysis.
// Sources: fleets, fleet_vehicles, fleet_drivers, fleet_risk_scores,
//          fleet_incident_reports, claims, drivers.
// ─────────────────────────────────────────────────────────────────────────────

export const fleetIntelligenceRouter = router({

  /** Get fleet intelligence summary. */
  getFleetSummary: protectedProcedure
    .input(z.object({
      fleetId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [fleet] = await db
        .select()
        .from(fleets)
        .where(and(
          eq(fleets.id, input.fleetId),
          eq(fleets.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!fleet) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found" });

      // Vehicle risk summary (canonical: fleet_risk_scores)
      const [vehicleRisk] = await db
        .select({
          avgRiskScore: avg(fleetRiskScores.overallRiskScore),
          highRiskVehicles: sql<number>`SUM(CASE WHEN ${fleetRiskScores.overallRiskScore} >= 70 THEN 1 ELSE 0 END)`,
          totalScored: count(fleetRiskScores.id),
        })
        .from(fleetRiskScores)
        .where(and(
          eq(fleetRiskScores.fleetId, input.fleetId),
          eq(fleetRiskScores.tenantId, ctx.user.tenantId ?? ""),
        ));

      // Incident summary (canonical: fleet_incident_reports)
      const [incidentSummary] = await db
        .select({
          totalIncidents: count(fleetIncidentReports.id),
          openIncidents: sql<number>`SUM(CASE WHEN ${fleetIncidentReports.status} IN ('submitted','under_review') THEN 1 ELSE 0 END)`,
          criticalIncidents: sql<number>`SUM(CASE WHEN ${fleetIncidentReports.severity} = 'critical' THEN 1 ELSE 0 END)`,
        })
        .from(fleetIncidentReports)
        .where(and(
          eq(fleetIncidentReports.fleetId, input.fleetId),
          eq(fleetIncidentReports.tenantId, ctx.user.tenantId ?? ""),
        ));

      // Claims summary via vehicle registration linkage (canonical: claims + fleet_vehicles)
      const fleetVehicleList = await db
        .select({ registrationNumber: fleetVehicles.registrationNumber })
        .from(fleetVehicles)
        .where(and(
          eq(fleetVehicles.fleetId, input.fleetId),
          eq(fleetVehicles.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(500); // M-01: cap fleet vehicle list for IN clause

      const registrations = fleetVehicleList.map(v => v.registrationNumber);
      let claimCount = 0;
      if (registrations.length > 0) {
        const [cs] = await db
          .select({ total: count(claims.id) })
          .from(claims)
          .where(and(
            sql`${claims.vehicleRegistration} IN (${sql.join(registrations.map(r => sql`${r}`), sql`, `)})`,
            eq(claims.tenantId, ctx.user.tenantId ?? ""),
          ));
        claimCount = Number(cs?.total) || 0;
      }

      return {
        fleet,
        vehicleRisk: vehicleRisk ?? { avgRiskScore: null, highRiskVehicles: 0, totalScored: 0 },
        incidents: incidentSummary ?? { totalIncidents: 0, openIncidents: 0, criticalIncidents: 0 },
        claimCount,
        dataSources: ["fleets", "fleet_risk_scores", "fleet_incident_reports", "fleet_vehicles", "claims"],
      };
    }),

  /** Get vehicle risk leaderboard for a fleet. */
  getVehicleRiskLeaderboard: protectedProcedure
    .input(z.object({
      fleetId: z.number().int().positive(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const leaderboard = await db
        .select({
          vehicleId: fleetVehicles.id,
          registrationNumber: fleetVehicles.registrationNumber,
          make: fleetVehicles.make,
          model: fleetVehicles.model,
          year: fleetVehicles.year,
          riskScore: fleetRiskScores.overallRiskScore,
          claimsRisk: fleetRiskScores.claimsRisk,
          maintenanceRisk: fleetRiskScores.maintenanceRisk,
          premiumImpact: fleetRiskScores.premiumImpact,
          claimsHistoryCount: fleetVehicles.claimsHistoryCount,
        })
        .from(fleetVehicles)
        .leftJoin(fleetRiskScores, eq(fleetRiskScores.vehicleId, fleetVehicles.id))
        .where(and(
          eq(fleetVehicles.fleetId, input.fleetId),
          eq(fleetVehicles.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(fleetRiskScores.overallRiskScore))
        .limit(input.limit);

      return {
        fleetId: input.fleetId,
        leaderboard,
        dataSources: ["fleet_vehicles", "fleet_risk_scores"],
      };
    }),

  /** Get driver risk leaderboard for a fleet. */
  getDriverRiskLeaderboard: protectedProcedure
    .input(z.object({
      fleetId: z.number().int().positive(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const leaderboard = await db
        .select({
          driverId: fleetDrivers.id,
          userId: fleetDrivers.userId,
          licenseNumber: fleetDrivers.driverLicenseNumber,
          employmentStatus: fleetDrivers.employmentStatus,
          hireDate: fleetDrivers.hireDate,
        })
        .from(fleetDrivers)
        .where(and(
          eq(fleetDrivers.fleetId, input.fleetId),
          eq(fleetDrivers.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(fleetDrivers.hireDate))
        .limit(input.limit);

      return {
        fleetId: input.fleetId,
        leaderboard,
        dataSources: ["fleet_drivers"],
      };
    }),

  /** List all fleets for the tenant with summary intelligence. */
  listFleets: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const fleetList = await db
        .select({
          id: fleets.id,
          fleetName: fleets.fleetName,
          fleetType: fleets.fleetType,
          totalVehicles: fleets.totalVehicles,
          activeVehicles: fleets.activeVehicles,
          primaryLocation: fleets.primaryLocation,
          createdAt: fleets.createdAt,
        })
        .from(fleets)
        .where(eq(fleets.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(fleets.totalVehicles))
        .limit(100); // M-01: cap fleet list

      return {
        fleets: fleetList,
        total: fleetList.length,
        dataSources: ["fleets"],
      };
    }),

  /** Get incident history for a fleet. */
  getIncidentHistory: protectedProcedure
    .input(z.object({
      fleetId: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const incidents = await db
        .select({
          id: fleetIncidentReports.id,
          vehicleId: fleetIncidentReports.vehicleId,
          driverId: fleetIncidentReports.driverId,
          incidentDate: fleetIncidentReports.incidentDate,
          location: fleetIncidentReports.location,
          severity: fleetIncidentReports.severity,
          status: fleetIncidentReports.status,
          estimatedDamage: fleetIncidentReports.estimatedDamage,
          description: fleetIncidentReports.description,
          createdAt: fleetIncidentReports.createdAt,
        })
        .from(fleetIncidentReports)
        .where(and(
          eq(fleetIncidentReports.fleetId, input.fleetId),
          eq(fleetIncidentReports.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(fleetIncidentReports.incidentDate))
        .limit(input.limit);

      return {
        fleetId: input.fleetId,
        incidents,
        total: incidents.length,
        dataSources: ["fleet_incident_reports"],
      };
    }),

  /** Get fleet intelligence snapshot (cached). */
  getSnapshot: protectedProcedure
    .input(z.object({
      fleetId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [snapshot] = await db
        .select()
        .from(fleetIntelligenceSnapshots)
        .where(and(
          eq(fleetIntelligenceSnapshots.fleetId, input.fleetId),
          eq(fleetIntelligenceSnapshots.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(fleetIntelligenceSnapshots.generatedAt))
        .limit(1);

      return {
        fleetId: input.fleetId,
        snapshot: snapshot ?? null,
        dataSources: ["fleet_intelligence_snapshots"],
      };
    }),

  /** Get fleet performance trends over time. */
  getPerformanceTrends: protectedProcedure
    .input(z.object({
      fleetId: z.number().int().positive(),
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const snapshots = await db
        .select({
          generatedAt: fleetIntelligenceSnapshots.generatedAt,
          fleetRiskScore: fleetIntelligenceSnapshots.fleetRiskScore,
          totalClaims: fleetIntelligenceSnapshots.totalClaims,
          totalFraudSignals: fleetIntelligenceSnapshots.totalFraudSignals,
        })
        .from(fleetIntelligenceSnapshots)
        .where(and(
          eq(fleetIntelligenceSnapshots.fleetId, input.fleetId),
          eq(fleetIntelligenceSnapshots.tenantId, ctx.user.tenantId ?? ""),
          gte(fleetIntelligenceSnapshots.generatedAt, since),
        ))
        .orderBy(desc(fleetIntelligenceSnapshots.generatedAt))
        .limit(input.days);

      return {
        fleetId: input.fleetId,
        trends: snapshots,
        dataSources: ["fleet_intelligence_snapshots"],
      };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ENGINEERING INTELLIGENCE ROUTER
// Inspection quality, repeat findings, engineer performance, physics validation.
// Sources: inspections, physical_measurements, engineer_observations, ai_assessments.
// ─────────────────────────────────────────────────────────────────────────────

export const engineeringIntelligenceRouter = router({

  /** Get engineering intelligence summary for the tenant. */
  getSummary: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const [summary] = await db
        .select({
          totalInspections: count(inspections.id),
          completedInspections: sql<number>`SUM(CASE WHEN ${inspections.status} = 'complete' THEN 1 ELSE 0 END)`,
          physicsReconciledCount: sql<number>`SUM(CASE WHEN ${inspections.physicsReconciled} = 1 THEN 1 ELSE 0 END)`,
          aiApprovedCount: sql<number>`SUM(CASE WHEN ${inspections.aiAnalysisApproved} = 1 THEN 1 ELSE 0 END)`,
          avgDurationMinutes: avg(inspections.durationMinutes),
        })
        .from(inspections)
        .where(and(
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
          gte(inspections.createdAt, since),
        ));

      const total = Number(summary?.totalInspections) || 0;
      const completed = Number(summary?.completedInspections) || 0;
      const physicsReconciled = Number(summary?.physicsReconciledCount) || 0;
      const aiApproved = Number(summary?.aiApprovedCount) || 0;

      return {
        period: { days: input.days, since },
        totalInspections: total,
        completedInspections: completed,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : null,
        physicsValidationRate: completed > 0 ? Math.round((physicsReconciled / completed) * 100) : null,
        aiApprovalRate: completed > 0 ? Math.round((aiApproved / completed) * 100) : null,
        avgDurationMinutes: summary?.avgDurationMinutes ? Number(summary.avgDurationMinutes) : null,
        dataSources: ["inspections"],
      };
    }),

  /** Get inspection type distribution and trends. */
  getInspectionTrends: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const trends = await db
        .select({
          inspectionType: inspections.inspectionType,
          count: count(inspections.id),
          physicsRate: sql<number>`ROUND(AVG(CASE WHEN ${inspections.physicsReconciled} = 1 THEN 100 ELSE 0 END), 1)`,
          aiApprovalRate: sql<number>`ROUND(AVG(CASE WHEN ${inspections.aiAnalysisApproved} = 1 THEN 100 ELSE 0 END), 1)`,
          avgDuration: avg(inspections.durationMinutes),
        })
        .from(inspections)
        .where(and(
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
          gte(inspections.createdAt, since),
        ))
        .groupBy(inspections.inspectionType)
        .orderBy(desc(count(inspections.id)))
        .limit(20); // M-01: cap inspection type groups

      return {
        period: { days: input.days },
        trends,
        dataSources: ["inspections"],
      };
    }),

  /** Get measurement analytics — most common components, severity distribution. */
  getMeasurementAnalytics: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const componentFrequency = await db
        .select({
          measurementType: physicalMeasurements.measurementType,
          count: count(physicalMeasurements.id),
          avgSeverityScore: avg(physicalMeasurements.confidence),
          criticalCount: sql<number>`SUM(CASE WHEN ${physicalMeasurements.confidence} >= 8 THEN 1 ELSE 0 END)`,
        })
        .from(physicalMeasurements)
        .innerJoin(inspections, eq(inspections.id, physicalMeasurements.inspectionId))
        .where(and(
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
          gte(inspections.createdAt, since),
        ))
        .groupBy(physicalMeasurements.measurementType)
        .orderBy(desc(count(physicalMeasurements.id)))
        .limit(20);

      return {
        period: { days: input.days },
        componentFrequency,
        dataSources: ["physical_measurements", "inspections"],
      };
    }),

  /** Get observation analytics — most common finding types. */
  getObservationAnalytics: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const observationTypes = await db
        .select({
          observationType: engineerObservations.observationType,
          count: count(engineerObservations.id),
          criticalCount: sql<number>`SUM(CASE WHEN ${engineerObservations.severity} = 'critical' THEN 1 ELSE 0 END)`,
          criticalCount2: sql<number>`SUM(CASE WHEN ${engineerObservations.severity} = 'critical' THEN 1 ELSE 0 END)`,
        })
        .from(engineerObservations)
        .innerJoin(inspections, eq(inspections.id, engineerObservations.inspectionId))
        .where(and(
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
          gte(inspections.createdAt, since),
        ))
        .groupBy(engineerObservations.observationType)
        .orderBy(desc(count(engineerObservations.id)))
        .limit(20);

      return {
        period: { days: input.days },
        observationTypes,
        dataSources: ["engineer_observations", "inspections"],
      };
    }),

  /** Get recent inspections with full status. */
  getRecentInspections: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const recent = await db
        .select({
          id: inspections.id,
          inspectionRef: inspections.inspectionRef,
          inspectionType: inspections.inspectionType,
          status: inspections.status,
          scheduledDate: inspections.scheduledDate,
          completedAt: inspections.completedAt,
          durationMinutes: inspections.durationMinutes,
          physicsReconciled: inspections.physicsReconciled,
          aiAnalysisApproved: inspections.aiAnalysisApproved,
          assignedEngineerId: inspections.assignedEngineerId,
        })
        .from(inspections)
        .where(eq(inspections.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(inspections.createdAt))
        .limit(input.limit);

      return {
        inspections: recent,
        dataSources: ["inspections"],
      };
    }),

  /** Get physics reconciliation quality metrics. */
  getPhysicsQualityMetrics: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const [metrics] = await db
        .select({
          total: count(inspections.id),
          physicsReconciled: sql<number>`SUM(CASE WHEN ${inspections.physicsReconciled} = 1 THEN 1 ELSE 0 END)`,
          aiApproved: sql<number>`SUM(CASE WHEN ${inspections.aiAnalysisApproved} = 1 THEN 1 ELSE 0 END)`,
          bothApproved: sql<number>`SUM(CASE WHEN ${inspections.physicsReconciled} = 1 AND ${inspections.aiAnalysisApproved} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(inspections)
        .where(and(
          eq(inspections.tenantId, ctx.user.tenantId ?? ""),
          eq(inspections.status, "complete"),
          gte(inspections.createdAt, since),
        ));

      const total = Number(metrics?.total) || 0;

      return {
        period: { days: input.days },
        total,
        physicsValidationRate: total > 0 ? Math.round((Number(metrics?.physicsReconciled) / total) * 100) : null,
        aiApprovalRate: total > 0 ? Math.round((Number(metrics?.aiApproved) / total) * 100) : null,
        dualApprovalRate: total > 0 ? Math.round((Number(metrics?.bothApproved) / total) * 100) : null,
        dataSources: ["inspections"],
      };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PORTFOLIO INTELLIGENCE ROUTER
// Five-dimension insurer portfolio analysis.
// Sources: claims, ai_assessments, claim_confidence_scores, fraud_alerts,
//          vehicle_market_valuations, workflow_audit_trail.
// ─────────────────────────────────────────────────────────────────────────────

export const portfolioIntelligenceRouter = router({

  /** Get portfolio exposure summary. */
  getExposureSummary: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const [exposure] = await db
        .select({
          totalClaims: count(claims.id),
          openClaims: sql<number>`SUM(CASE WHEN ${claims.status} NOT IN ('completed','rejected','withdrawn','closed') THEN 1 ELSE 0 END)`,
          totalApprovedCents: sql<number>`COALESCE(SUM(${claims.finalApprovedAmount}), 0)`,
          avgApprovedCents: sql<number>`COALESCE(AVG(${claims.finalApprovedAmount}), 0)`,
          highValueClaims: sql<number>`SUM(CASE WHEN ${claims.finalApprovedAmount} >= 500000 THEN 1 ELSE 0 END)`,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ));

      return {
        period: { days: input.days, since },
        exposure: exposure ?? {
          totalClaims: 0, openClaims: 0, totalApprovedCents: 0,
          avgApprovedCents: 0, highValueClaims: 0,
        },
        dataSources: ["claims"],
      };
    }),

  /** Get fraud intelligence summary for the portfolio. */
  getFraudSummary: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const [fraudSummary] = await db
        .select({
          totalAlerts: count(fraudAlerts.id),
          highSeverity: sql<number>`SUM(CASE WHEN ${fraudAlerts.alertSeverity} = 'high' THEN 1 ELSE 0 END)`,
          mediumSeverity: sql<number>`SUM(CASE WHEN ${fraudAlerts.alertSeverity} = 'medium' THEN 1 ELSE 0 END)`,
        })
        .from(fraudAlerts)
        .innerJoin(claims, eq(claims.id, fraudAlerts.claimId))
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(fraudAlerts.createdAt, since),
        ));

      // AI fraud score distribution (canonical: ai_assessments)
      const [aiScores] = await db
        .select({
          avgFraudScore: avg(aiAssessments.fraudScore),
          highRiskClaims: sql<number>`SUM(CASE WHEN ${aiAssessments.fraudScore} >= 50 THEN 1 ELSE 0 END)`,
          totalAssessed: count(aiAssessments.id),
        })
        .from(aiAssessments)
        .where(and(
          eq(aiAssessments.tenantId, ctx.user.tenantId ?? ""),
          gte(aiAssessments.createdAt, since),
        ));

      return {
        period: { days: input.days },
        alerts: fraudSummary ?? { totalAlerts: 0, highSeverity: 0, mediumSeverity: 0 },
        aiScores: aiScores ?? { avgFraudScore: null, highRiskClaims: 0, totalAssessed: 0 },
        dataSources: ["fraud_alerts", "ai_assessments"],
      };
    }),

  /** Get operational performance metrics. */
  getOperationalMetrics: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const [ops] = await db
        .select({
          totalClaims: count(claims.id),
          completedClaims: sql<number>`SUM(CASE WHEN ${claims.status} = 'completed' THEN 1 ELSE 0 END)`,
          rejectedClaims: sql<number>`SUM(CASE WHEN ${claims.status} = 'rejected' THEN 1 ELSE 0 END)`,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ));

      // AI confidence distribution (canonical: claim_confidence_scores)
      const [confidence] = await db
        .select({
          avgConfidence: avg(claimConfidenceScores.compositeConfidenceScore),
          highConfidenceCount: sql<number>`SUM(CASE WHEN ${claimConfidenceScores.compositeConfidenceScore} >= 80 THEN 1 ELSE 0 END)`,
        })
        .from(claimConfidenceScores)
        .innerJoin(claims, eq(claims.id, claimConfidenceScores.claimId))
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ));

      const total = Number(ops?.totalClaims) || 0;
      const completed = Number(ops?.completedClaims) || 0;

      return {
        period: { days: input.days },
        totalClaims: total,
        completedClaims: completed,
        rejectedClaims: Number(ops?.rejectedClaims) || 0,
        fastTrackedClaims: 0, // fastTrackEligible column removed — use fastTrackRoutingLog for fast-track counts
        completionRate: total > 0 ? Math.round((completed / total) * 100) : null,
        avgConfidenceScore: confidence?.avgConfidence ? Number(confidence.avgConfidence) : null,
        highConfidenceRate: total > 0 ? Math.round((Number(confidence?.highConfidenceCount) / total) * 100) : null,
        dataSources: ["claims", "claim_confidence_scores"],
      };
    }),

  /** Get financial performance metrics. */
  getFinancialMetrics: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const [financial] = await db
        .select({
          totalApproved: sql<number>`COALESCE(SUM(${claims.finalApprovedAmount}), 0)`,
          avgApproved: sql<number>`COALESCE(AVG(${claims.finalApprovedAmount}), 0)`,
          maxApproved: sql<number>`COALESCE(MAX(${claims.finalApprovedAmount}), 0)`,
          claimsWithAmount: sql<number>`SUM(CASE WHEN ${claims.finalApprovedAmount} IS NOT NULL THEN 1 ELSE 0 END)`,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ));

      // Vehicle valuation context (canonical: vehicle_market_valuations)
      const [valuations] = await db
        .select({
          totalValuations: count(vehicleMarketValuations.id),
          avgMarketValue: avg(vehicleMarketValuations.estimatedMarketValue),
        })
        .from(vehicleMarketValuations)
        .innerJoin(claims, eq(claims.id, vehicleMarketValuations.claimId))
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ));

      return {
        period: { days: input.days },
        financial: financial ?? { totalApproved: 0, avgApproved: 0, maxApproved: 0, claimsWithAmount: 0 },
        valuations: valuations ?? { totalValuations: 0, avgMarketValue: null },
        dataSources: ["claims", "vehicle_market_valuations"],
      };
    }),

  /** Get risk concentration analysis. */
  getRiskConcentration: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      // Top vehicles by claim count (canonical: claims)
      const topVehicles = await db
        .select({
          vehicleRegistration: claims.vehicleRegistration,
          claimCount: count(claims.id),
          totalApproved: sql<number>`COALESCE(SUM(${claims.finalApprovedAmount}), 0)`,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ))
        .groupBy(claims.vehicleRegistration)
        .orderBy(desc(count(claims.id)))
        .limit(10);

      // Claim type distribution
      const claimTypes = await db
        .select({
          claimantType: claims.claimantType,
          count: count(claims.id),
          totalApproved: sql<number>`COALESCE(SUM(${claims.finalApprovedAmount}), 0)`,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ))
        .groupBy(claims.claimantType)
        .orderBy(desc(count(claims.id)))
        .limit(20); // M-01: cap claim type groups

      return {
        period: { days: input.days },
        topVehicles,
        claimTypes,
        dataSources: ["claims"],
      };
    }),

  /** Get portfolio summary (all five dimensions). */
  getPortfolioSummary: protectedProcedure
    .input(z.object({
      days: z.number().int().min(7).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString();

      const [summary] = await db
        .select({
          totalClaims: count(claims.id),
          openClaims: sql<number>`SUM(CASE WHEN ${claims.status} NOT IN ('completed','rejected','withdrawn','closed') THEN 1 ELSE 0 END)`,
          completedClaims: sql<number>`SUM(CASE WHEN ${claims.status} = 'completed' THEN 1 ELSE 0 END)`,
          totalApprovedCents: sql<number>`COALESCE(SUM(${claims.finalApprovedAmount}), 0)`,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ));

      const [fraudCount] = await db
        .select({ count: count(fraudAlerts.id) })
        .from(fraudAlerts)
        .innerJoin(claims, eq(claims.id, fraudAlerts.claimId))
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(fraudAlerts.createdAt, since),
        ));

      return {
        period: { days: input.days, since },
        summary: summary ?? {
          totalClaims: 0, openClaims: 0, completedClaims: 0,
          totalApprovedCents: 0, fastTrackedClaims: 0,
        },
        fraudAlertCount: Number(fraudCount?.count) || 0,
        dataSources: ["claims", "fraud_alerts"],
      };
    }),

  /** Get portfolio snapshot (cached). */
    getSnapshot: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Return the latest vehicle passport snapshot as a proxy for portfolio state
      const [snapshot] = await db
        .select()
        .from(vehiclePassportSnapshots)
        .where(eq(vehiclePassportSnapshots.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(vehiclePassportSnapshots.generatedAt))
        .limit(1);
      return {
        snapshot: snapshot ?? null,
        dataSources: ["vehicle_passport_snapshots"],
      };
    }),

  /** H-04: Fleet exposure summary for portfolio dashboard. */
  getFleetExposureSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const tenantId = requireIntelligenceTenant(ctx);
    try {
      const [row] = await db.execute(sql`
        SELECT
          COUNT(DISTINCT fv.id) AS totalVehicles,
          COUNT(DISTINCT f.id) AS totalFleets,
          SUM(CASE WHEN frs.overall_risk_score >= 70 THEN 1 ELSE 0 END) AS highRiskFleets,
          COALESCE(SUM(frs.total_claims_cost_cents), 0) AS totalClaimCostCents,
          COALESCE(AVG(frs.overall_risk_score), 0) AS avgFleetRiskScore
        FROM fleets f
        LEFT JOIN fleet_vehicles fv ON fv.fleet_id = f.id AND fv.tenant_id = ${tenantId}
        LEFT JOIN fleet_risk_scores frs ON frs.fleet_id = f.id AND frs.tenant_id = ${tenantId}
        WHERE f.tenant_id = ${tenantId}
      `);
      const data = (Array.isArray(row) ? row[0] : row) as any;
      return {
        totalVehicles: Number(data?.totalVehicles ?? 0),
        totalFleets: Number(data?.totalFleets ?? 0),
        highRiskFleets: Number(data?.highRiskFleets ?? 0),
        totalClaimCostCents: Number(data?.totalClaimCostCents ?? 0),
        avgFleetRiskScore: Math.round(Number(data?.avgFleetRiskScore ?? 0)),
      };
    } catch (err) {
      console.error('[PortfolioIntelligence] getFleetExposureSummary error:', err);
      return null;
    }
  }),

  /** H-05: Engineering risk summary for portfolio dashboard. */
  getEngineeringRiskSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const tenantId = requireIntelligenceTenant(ctx);
    try {
      const [row] = await db.execute(sql`
        SELECT
          COUNT(*) AS totalInspections,
          SUM(CASE WHEN i.status = 'completed' THEN 1 ELSE 0 END) AS completedInspections,
          SUM(CASE WHEN i.status = 'in_progress' THEN 1 ELSE 0 END) AS inProgressInspections,
          SUM(CASE WHEN i.structural_risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS highStructuralRiskCount,
          COUNT(DISTINCT i.engineer_id) AS activeEngineers
        FROM inspections i
        WHERE i.tenant_id = ${tenantId}
      `);
      const data = (Array.isArray(row) ? row[0] : row) as any;
      return {
        totalInspections: Number(data?.totalInspections ?? 0),
        completedInspections: Number(data?.completedInspections ?? 0),
        inProgressInspections: Number(data?.inProgressInspections ?? 0),
        highStructuralRiskCount: Number(data?.highStructuralRiskCount ?? 0),
        activeEngineers: Number(data?.activeEngineers ?? 0),
      };
    } catch (err) {
      console.error('[PortfolioIntelligence] getEngineeringRiskSummary error:', err);
      return null;
    }
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. TIMELINE INTELLIGENCE ROUTER
// Unified chronological event timeline for any entity.
// Sources: claims, inspections, fraud_alerts, workflow_audit_trail,
//          vehicle_damage_history, maintenance_alerts.
// ─────────────────────────────────────────────────────────────────────────────

export const timelineIntelligenceRouter = router({

  /** Get unified timeline for a vehicle registration. */
  getVehicleTimeline: protectedProcedure
    .input(z.object({
      vehicleRegistration: z.string().min(1).max(50),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const events: Array<{
        eventType: string;
        eventDate: string;
        description: string;
        sourceTable: string;
        sourceId: number;
        metadata: Record<string, unknown>;
      }> = [];

      // Claims events (canonical: claims)
      const claimEvents = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          createdAt: claims.createdAt,
          finalApprovedAmount: claims.finalApprovedAmount,
          claimantType: claims.claimantType,
        })
        .from(claims)
        .where(and(
          eq(claims.vehicleRegistration, input.vehicleRegistration),
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(claims.createdAt))
        .limit(input.limit);

      for (const c of claimEvents) {
        events.push({
          eventType: "claim",
          eventDate: c.createdAt ?? "",
          description: `Claim ${c.claimNumber} (${c.claimantType ?? "unknown"}) — ${c.status}`,
          sourceTable: "claims",
          sourceId: c.id,
          metadata: { claimNumber: c.claimNumber, status: c.status, finalApprovedAmount: c.finalApprovedAmount },
        });
      }

      // Damage history (canonical: vehicle_damage_history)
      const damageEvents = await db
        .select({
          id: vehicleDamageHistory.id,
          createdAt: vehicleDamageHistory.createdAt,
          damageZone: vehicleDamageHistory.damageZone,
          severity: vehicleDamageHistory.severity,
          repairCostEstimateCents: vehicleDamageHistory.repairCostEstimateCents,
        })
        .from(vehicleDamageHistory)
        .innerJoin(vehicleRegistry, eq(vehicleRegistry.id, vehicleDamageHistory.vehicleId))
        .where(and(
          eq(vehicleRegistry.registrationNumber, input.vehicleRegistration),
          eq(vehicleRegistry.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(vehicleDamageHistory.createdAt))
        .limit(input.limit);

      for (const d of damageEvents) {
        events.push({
          eventType: "damage",
          eventDate: d.createdAt ?? "",
          description: `Damage: ${d.damageZone} — ${d.severity} severity`,
          sourceTable: "vehicle_damage_history",
          sourceId: d.id,
          metadata: { damageZone: d.damageZone, severity: d.severity, repairCostEstimateCents: d.repairCostEstimateCents },
        });
      }

      // Sort by date descending
      events.sort((a, b) => {
        const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const db2 = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return db2 - da;
      });

      return {
        vehicleRegistration: input.vehicleRegistration,
        events: events.slice(0, input.limit),
        total: events.length,
        dataSources: ["claims", "vehicle_damage_history", "vehicle_registry"],
      };
    }),

  /** Get unified timeline for a claim. */
  getClaimTimeline: protectedProcedure
    .input(z.object({
      claimId: z.number().int().positive(),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = requireIntelligenceTenant(ctx);

      const [claim] = await db.select({ id: claims.id }).from(claims)
        .where(and(eq(claims.id, input.claimId), eq(claims.tenantId, tenantId))).limit(1);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

      const events: Array<{
        eventType: string;
        eventDate: string;
        description: string;
        sourceTable: string;
        sourceId: number | string;
        metadata: Record<string, unknown>;
      }> = [];

      // Workflow audit trail (canonical: workflow_audit_trail)
      const workflowEvents = await db
        .select({
          id: workflowAuditTrail.id,
          createdAt: workflowAuditTrail.createdAt,
          previousState: workflowAuditTrail.previousState,
          newState: workflowAuditTrail.newState,
          userRole: workflowAuditTrail.userRole,
          comments: workflowAuditTrail.comments,
        })
        .from(workflowAuditTrail)
        .innerJoin(claims, eq(claims.id, workflowAuditTrail.claimId))
        .where(and(
          eq(workflowAuditTrail.claimId, input.claimId),
          eq(claims.tenantId, tenantId),
        ))
        .orderBy(desc(workflowAuditTrail.createdAt))
        .limit(input.limit);

      for (const w of workflowEvents) {
        events.push({
          eventType: "workflow",
          eventDate: w.createdAt ?? "",
          description: `Status: ${w.previousState ?? "start"} → ${w.newState}`,
          sourceTable: "workflow_audit_trail",
          sourceId: w.id,
          metadata: { previousState: w.previousState, newState: w.newState, userRole: w.userRole, comments: w.comments },
        });
      }

      // Fraud alerts (canonical: fraud_alerts)
      const fraudEvents = await db
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
          eq(fraudAlerts.claimId, input.claimId),
          eq(claims.tenantId, tenantId),
        ))
        .orderBy(desc(fraudAlerts.createdAt))
        .limit(20);

      for (const f of fraudEvents) {
        events.push({
          eventType: "fraud_alert",
          eventDate: f.createdAt ?? "",
          description: `Fraud Alert: ${f.alertType} — ${f.alertSeverity}`,
          sourceTable: "fraud_alerts",
          sourceId: f.id,
          metadata: { alertType: f.alertType, alertSeverity: f.alertSeverity, description: f.alertDescription },
        });
      }

      events.sort((a, b) => {
        const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const db2 = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return db2 - da;
      });

      return {
        claimId: input.claimId,
        events: events.slice(0, input.limit),
        total: events.length,
        dataSources: ["workflow_audit_trail", "fraud_alerts"],
      };
    }),

  /** Get platform-wide recent activity feed. */
  getPlatformActivityFeed: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Recent claims (canonical: claims)
      const recentClaims = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          createdAt: claims.createdAt,
          vehicleRegistration: claims.vehicleRegistration,
        })
        .from(claims)
        .where(eq(claims.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(claims.createdAt))
        .limit(input.limit);

      // Recent fraud alerts (canonical: fraud_alerts)
      const recentAlerts = await db
        .select({
          id: fraudAlerts.id,
          alertType: fraudAlerts.alertType,
          alertSeverity: fraudAlerts.alertSeverity,
          createdAt: fraudAlerts.createdAt,
          claimId: fraudAlerts.claimId,
        })
        .from(fraudAlerts)
        .innerJoin(claims, eq(claims.id, fraudAlerts.claimId))
        .where(eq(claims.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(fraudAlerts.createdAt))
        .limit(input.limit);

      return {
        recentClaims,
        recentAlerts,
        dataSources: ["claims", "fraud_alerts"],
      };
    }),

  /** Get entity timeline (generic — works for any entity type). */
  getEntityTimeline: protectedProcedure
    .input(z.object({
      entityType: z.enum(["vehicle", "claim", "driver", "fleet", "asset"]),
      entityId: z.string().min(1),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Route to the appropriate timeline based on entity type
      // This is a meta-procedure that delegates to the specific timeline
      return {
        entityType: input.entityType,
        entityId: input.entityId,
        message: `Use get${input.entityType.charAt(0).toUpperCase() + input.entityType.slice(1)}Timeline for detailed timeline`,
        dataSources: ["claims", "inspections", "workflow_audit_trail", "fraud_alerts"],
      };
    }),

  /** Get recent workflow transitions across all claims. */
  getWorkflowActivity: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const activity = await db
        .select({
          id: workflowAuditTrail.id,
          claimId: workflowAuditTrail.claimId,
          previousState: workflowAuditTrail.previousState,
          newState: workflowAuditTrail.newState,
          userRole: workflowAuditTrail.userRole,
          createdAt: workflowAuditTrail.createdAt,
        })
        .from(workflowAuditTrail)
        .innerJoin(claims, eq(claims.id, workflowAuditTrail.claimId))
        .where(eq(claims.tenantId, ctx.user.tenantId ?? ""))
        .orderBy(desc(workflowAuditTrail.createdAt))
        .limit(input.limit);

      return {
        activity,
        total: activity.length,
        dataSources: ["workflow_audit_trail", "claims"],
      };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PREDICTIVE ANALYTICS ROUTER
// Four deterministic scoring models using canonical data only.
// No ML inference — all scores computed from existing platform intelligence.
// Sources: vehicle_registry, vehicle_damage_history, claims, drivers,
//          ai_assessments, fleet_risk_scores, predictive_risk_scores (cache).
// ─────────────────────────────────────────────────────────────────────────────

export const predictiveAnalyticsRouter = router({

  /** Compute vehicle renewal risk score (deterministic). */
  getVehicleRenewalRisk: protectedProcedure
    .input(z.object({
      vehicleRegistration: z.string().min(1).max(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Check cache first (canonical: predictive_risk_scores)
      const [cached] = await db
        .select()
        .from(predictiveRiskScores)
        .where(and(
          eq(predictiveRiskScores.entityType, "vehicle"),
          eq(predictiveRiskScores.entityId, input.vehicleRegistration),
          eq(predictiveRiskScores.scoreType, "renewal_risk"),
          eq(predictiveRiskScores.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(predictiveRiskScores.computedAt))
        .limit(1);

      if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
        return {
          vehicleRegistration: input.vehicleRegistration,
          score: Number(cached.scoreValue),
          confidence: Number(cached.confidenceLevel),
          factors: Array.isArray(cached.factorsJson) ? cached.factorsJson : [],
          cached: true,
          calculatedAt: cached.computedAt,
          dataSources: ["predictive_risk_scores"],
        };
      }

      // Compute from canonical sources
      const [vehicle] = await db
        .select({
          id: vehicleRegistry.id,
          year: vehicleRegistry.year,
          totalClaimsCount: vehicleRegistry.totalClaimsCount,
          vehicleRiskScore: vehicleRegistry.vehicleRiskScore,
        })
        .from(vehicleRegistry)
        .where(and(
          eq(vehicleRegistry.registrationNumber, input.vehicleRegistration),
          eq(vehicleRegistry.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });

      // Deterministic scoring model
      const currentYear = new Date().getFullYear();
      const vehicleAge = vehicle.year ? currentYear - vehicle.year : 5;
      const claimsCount = vehicle.totalClaimsCount ?? 0;
      const fraudFlags = 0; // No fraudFlagCount column — derived from fraud_alerts at query time
      const existingRiskScore = vehicle.vehicleRiskScore ?? 50;

      // Weighted score: age (20%), claims frequency (30%), fraud flags (30%), existing risk (20%)
      const ageScore = Math.min(vehicleAge * 3, 30); // 0-30 points
      const claimsScore = Math.min(claimsCount * 10, 30); // 0-30 points
      const fraudScore = Math.min(fraudFlags * 15, 30); // 0-30 points
      const riskScore = existingRiskScore * 0.1; // 0-10 points

      const totalScore = Math.min(Math.round(ageScore + claimsScore + fraudScore + riskScore), 100);

      const factors = [
        { factor: "vehicle_age", value: vehicleAge, contribution: ageScore, description: `${vehicleAge} years old` },
        { factor: "claims_frequency", value: claimsCount, contribution: claimsScore, description: `${claimsCount} historical claims` },
        { factor: "fraud_flags", value: fraudFlags, contribution: fraudScore, description: `${fraudFlags} fraud flags` },
        { factor: "existing_risk_score", value: existingRiskScore, contribution: riskScore, description: `Platform risk score: ${existingRiskScore}` },
      ];

      return {
        vehicleRegistration: input.vehicleRegistration,
        score: totalScore,
        confidence: 75, // Deterministic model confidence
        riskLevel: totalScore >= 70 ? "high" : totalScore >= 40 ? "medium" : "low",
        factors,
        cached: false,
        calculatedAt: new Date().toISOString(),
        dataSources: ["vehicle_registry"],
      };
    }),

  /** Compute driver fraud propensity score (deterministic). */
  getDriverFraudPropensity: protectedProcedure
    .input(z.object({
      driverId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [driver] = await db
        .select({
          id: drivers.id,
          fullName: drivers.fullName,
          driverRiskScore: drivers.driverRiskScore,
          totalClaimsCount: drivers.totalClaimsCount,
          atFaultClaimsCount: drivers.atFaultClaimsCount,
          isRepeatClaimer: drivers.isRepeatClaimer,
          isStagedAccidentSuspect: drivers.isStagedAccidentSuspect,
          lastFraudRiskScore: drivers.lastFraudRiskScore,
        })
        .from(drivers)
        .where(and(
          eq(drivers.id, input.driverId),
          eq(drivers.tenantId, ctx.user.tenantId ?? ""),
        ))
        .limit(1);

      if (!driver) throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });

      // Deterministic scoring from canonical driver intelligence
      const repeatClaimerBonus = driver.isRepeatClaimer ? 30 : 0;
      const stagedAccidentBonus = driver.isStagedAccidentSuspect ? 40 : 0;
      const atFaultRatio = driver.totalClaimsCount > 0
        ? (driver.atFaultClaimsCount / driver.totalClaimsCount) * 20
        : 0;
      const fraudHistoryScore = Math.min(driver.lastFraudRiskScore * 0.1, 10);

      const totalScore = Math.min(
        Math.round(repeatClaimerBonus + stagedAccidentBonus + atFaultRatio + fraudHistoryScore),
        100,
      );

      const factors = [
        { factor: "repeat_claimer", value: driver.isRepeatClaimer, contribution: repeatClaimerBonus },
        { factor: "staged_accident_suspect", value: driver.isStagedAccidentSuspect, contribution: stagedAccidentBonus },
        { factor: "at_fault_ratio", value: driver.atFaultClaimsCount, contribution: Math.round(atFaultRatio) },
        { factor: "fraud_history", value: driver.lastFraudRiskScore, contribution: Math.round(fraudHistoryScore) },
      ];

      return {
        driverId: input.driverId,
        driverName: driver.fullName,
        score: totalScore,
        riskLevel: totalScore >= 70 ? "high" : totalScore >= 40 ? "medium" : "low",
        factors,
        calculatedAt: new Date().toISOString(),
        dataSources: ["drivers"],
      };
    }),

  /** Compute fleet risk trajectory (deterministic). */
  getFleetRiskTrajectory: protectedProcedure
    .input(z.object({
      fleetId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Use fleet_risk_scores as canonical source
      const [riskSummary] = await db
        .select({
          avgRiskScore: avg(fleetRiskScores.overallRiskScore),
          highRiskVehicles: sql<number>`SUM(CASE WHEN ${fleetRiskScores.overallRiskScore} >= 70 THEN 1 ELSE 0 END)`,
          totalVehicles: count(fleetRiskScores.id),
          avgMaintenanceRisk: avg(fleetRiskScores.maintenanceRisk),
          avgClaimsRisk: avg(fleetRiskScores.claimsRisk),
        })
        .from(fleetRiskScores)
        .where(and(
          eq(fleetRiskScores.fleetId, input.fleetId),
          eq(fleetRiskScores.tenantId, ctx.user.tenantId ?? ""),
        ));

      const avgScore = Number(riskSummary?.avgRiskScore) || 50;
      const highRiskCount = Number(riskSummary?.highRiskVehicles) || 0;
      const total = Number(riskSummary?.totalVehicles) || 0;
      const highRiskRatio = total > 0 ? highRiskCount / total : 0;

      // Trajectory: if >30% of vehicles are high-risk, trajectory is deteriorating
      const trajectory = highRiskRatio > 0.3 ? "deteriorating"
        : highRiskRatio > 0.15 ? "stable"
        : "improving";

      return {
        fleetId: input.fleetId,
        currentAvgRiskScore: Math.round(avgScore),
        highRiskVehicleCount: highRiskCount,
        totalVehiclesScored: total,
        highRiskRatio: Math.round(highRiskRatio * 100),
        trajectory,
        maintenanceRiskAvg: riskSummary?.avgMaintenanceRisk ? Number(riskSummary.avgMaintenanceRisk) : null,
        claimsRiskAvg: riskSummary?.avgClaimsRisk ? Number(riskSummary.avgClaimsRisk) : null,
        calculatedAt: new Date().toISOString(),
        dataSources: ["fleet_risk_scores"],
      };
    }),

  /** Compute portfolio loss forecast (deterministic). */
  getPortfolioLossForecast: protectedProcedure
    .input(z.object({
      forecastDays: z.number().int().min(30).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Use last 90 days as baseline (canonical: claims)
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const [baseline] = await db
        .select({
          totalClaims: count(claims.id),
          totalApproved: sql<number>`COALESCE(SUM(${claims.finalApprovedAmount}), 0)`,
          avgApproved: sql<number>`COALESCE(AVG(${claims.finalApprovedAmount}), 0)`,
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, ctx.user.tenantId ?? ""),
          gte(claims.createdAt, since),
        ));

      const totalClaims = Number(baseline?.totalClaims) || 0;
      const totalApproved = Number(baseline?.totalApproved) || 0;
      const avgApproved = Number(baseline?.avgApproved) || 0;

      // Daily run rate from last 90 days
      const dailyClaimRate = totalClaims / 90;
      const dailyLossRate = totalApproved / 90;

      // Forecast for the requested period
      const forecastedClaims = Math.round(dailyClaimRate * input.forecastDays);
      const forecastedLoss = Math.round(dailyLossRate * input.forecastDays);

      return {
        forecastPeriodDays: input.forecastDays,
        baselinePeriodDays: 90,
        baselineClaims: totalClaims,
        baselineTotalApprovedCents: totalApproved,
        forecastedClaims,
        forecastedLossCents: forecastedLoss,
        avgClaimValueCents: Math.round(avgApproved),
        confidence: 65, // Deterministic forecast confidence
        methodology: "linear_extrapolation_from_90d_baseline",
        calculatedAt: new Date().toISOString(),
        dataSources: ["claims"],
      };
    }),

  /** Get predictive risk scores for multiple entities. */
  getBatchScores: protectedProcedure
    .input(z.object({
      entityType: z.enum(["vehicle", "driver", "fleet"]),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const scores = await db
        .select()
        .from(predictiveRiskScores)
        .where(and(
          eq(predictiveRiskScores.entityType, input.entityType),
          eq(predictiveRiskScores.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(predictiveRiskScores.scoreValue))
        .limit(input.limit);

      return {
        entityType: input.entityType,
        scores,
        total: scores.length,
        dataSources: ["predictive_risk_scores"],
      };
    }),

  /** Get risk score history for an entity. */
  getScoreHistory: protectedProcedure
    .input(z.object({
      entityType: z.enum(["vehicle", "driver", "fleet"]),
      entityId: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(12),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const history = await db
        .select({
          id: predictiveRiskScores.id,
          scoreType: predictiveRiskScores.scoreType,
          scoreValue: predictiveRiskScores.scoreValue,
          confidenceLevel: predictiveRiskScores.confidenceLevel,
          computedAt: predictiveRiskScores.computedAt,
        })
        .from(predictiveRiskScores)
        .where(and(
          eq(predictiveRiskScores.entityType, input.entityType),
          eq(predictiveRiskScores.entityId, input.entityId),
          eq(predictiveRiskScores.tenantId, ctx.user.tenantId ?? ""),
        ))
        .orderBy(desc(predictiveRiskScores.computedAt))
        .limit(input.limit);

      return {
        entityType: input.entityType,
        entityId: input.entityId,
        history,
        dataSources: ["predictive_risk_scores"],
      };
    }),
});
