/**
 * Epic 4 — Intelligence Platform
 * Shared Aggregation Service
 *
 * This service is the ONLY write path for the three Epic 4 aggregation tables:
 *   - vehicle_passport_snapshots
 *   - fleet_intelligence_snapshots
 *   - predictive_risk_scores
 *
 * All Epic 4 routers READ from canonical tables via the 12 database views.
 * This service writes derived snapshots for caching and performance.
 *
 * Governance: ADR-001 (Shared Intelligence Architecture), ADR-014 (Platform Service Reuse)
 * P-01: Intelligence belongs to the platform.
 * P-03: Reuse before create.
 * P-04: No duplicate engines.
 */

import { getDb } from "../db";
import {
  vehiclePassportSnapshots,
  fleetIntelligenceSnapshots,
  predictiveRiskScores,
  vehicleRegistry,
  claims,
  vehicleDamageHistory,
  crossClaimSignals,
  inspections,
  fleetVehicles,
  fleetDrivers,
  drivers,
  driverClaims,
  aiAssessments,
  claimConfidenceScores,
  fraudAlerts,
} from "../../drizzle/schema";
import { eq, and, sql, desc, count, avg, sum, max, min } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VehiclePassportIntelligence {
  vehicleRegistryId: number;
  registrationNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  totalClaims: number;
  completedClaims: number;
  openClaims: number;
  totalSettlementCents: number;
  avgSettlementCents: number;
  totalFraudSignals: number;
  repeatDamageSignals: number;
  stagedAccidentSignals: number;
  totalDamageEvents: number;
  repeatZoneCount: number;
  distinctDamageZones: number;
  totalInspections: number;
  lastClaimDate: string | null;
  lastInspectionDate: string | null;
  lastFraudSignalDate: string | null;
  avgConfidenceScore: number | null;
  fraudAlertCount: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  dataSourceMap: Record<string, string>;
}

export interface FleetIntelligence {
  fleetId: number;
  tenantId: string;
  totalVehicles: number;
  totalDrivers: number;
  totalClaims: number;
  openClaims: number;
  totalSettlementCents: number;
  avgSettlementCents: number;
  totalFraudSignals: number;
  highRiskVehicleCount: number;
  highRiskDriverCount: number;
  fleetRiskScore: number;
}

export interface PredictiveRiskFactors {
  claimFrequency: number;
  fraudSignalDensity: number;
  repeatDamageRate: number;
  avgSettlementTrend: number;
  confidenceScore: number;
}

// ─── Vehicle Passport Aggregation ────────────────────────────────────────────

/**
 * Aggregate all canonical intelligence for a vehicle.
 * Reads from: vehicle_registry, claims, vehicle_damage_history,
 *             cross_claim_signals, inspections, claim_confidence_scores, fraud_alerts
 * Writes to: vehicle_passport_snapshots (cache only)
 *
 * Every value is traceable to its originating canonical table.
 */
export async function aggregateVehiclePassport(
  vehicleRegistryId: number,
  tenantId?: string
): Promise<VehiclePassportIntelligence | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // 1. Canonical vehicle record (SR-12: Vehicle Registry)
  const [vehicle] = await db
    .select()
    .from(vehicleRegistry)
    .where(eq(vehicleRegistry.id, vehicleRegistryId))
    .limit(1);

  if (!vehicle) return null;

  const regNum = vehicle.registrationNumber ?? "";

  // 2. Claim summary (canonical: claims table)
  const [claimSummary] = await db
    .select({
      totalClaims: count(claims.id),
      completedClaims: sql<number>`SUM(CASE WHEN ${claims.status} = 'completed' THEN 1 ELSE 0 END)`,
      openClaims: sql<number>`SUM(CASE WHEN ${claims.status} IN ('submitted','triage','assessment_pending','assessment_in_progress') THEN 1 ELSE 0 END)`,
      totalSettlement: sql<number>`SUM(CAST(${claims.finalApprovedAmount} AS DECIMAL(15,2)))`,
      avgSettlement: sql<number>`AVG(CAST(${claims.finalApprovedAmount} AS DECIMAL(15,2)))`,
      lastClaimDate: max(claims.createdAt),
    })
    .from(claims)
    .where(eq(claims.vehicleRegistration, regNum));

  // 3. Damage history (canonical: vehicle_damage_history table)
  const [damageSummary] = await db
    .select({
      totalDamageEvents: count(vehicleDamageHistory.id),
      repeatZoneCount: sql<number>`SUM(CASE WHEN ${vehicleDamageHistory.isRepeatZone} = 1 THEN 1 ELSE 0 END)`,
      distinctDamageZones: sql<number>`COUNT(DISTINCT ${vehicleDamageHistory.damageZone})`,
    })
    .from(vehicleDamageHistory)
    .where(eq(vehicleDamageHistory.vehicleId, vehicleRegistryId));

  // 4. Fraud signals (canonical: cross_claim_signals via claims)
  const [fraudSummary] = await db
    .select({
      totalFraudSignals: count(crossClaimSignals.id),
      repeatDamageSignals: sql<number>`SUM(CASE WHEN ${crossClaimSignals.signalType} = 'repeat_damage_zone' THEN 1 ELSE 0 END)`,
      stagedAccidentSignals: sql<number>`SUM(CASE WHEN ${crossClaimSignals.signalType} = 'staged_accident' THEN 1 ELSE 0 END)`,
      lastSignalDate: max(crossClaimSignals.createdAt),
    })
    .from(crossClaimSignals)
    .innerJoin(claims, eq(claims.id, crossClaimSignals.claimId))
    .where(eq(claims.vehicleRegistration, regNum));

  // 5. Inspection history (canonical: inspections table)
  const [inspectionSummary] = await db
    .select({
      totalInspections: count(inspections.id),
      lastInspectionDate: max(inspections.completedAt),
    })
    .from(inspections)
    .where(eq(inspections.vehicleRegistration, regNum));

  // 6. Confidence scores (canonical: claim_confidence_scores table)
  const [confidenceSummary] = await db
    .select({
      avgConfidenceScore: sql<number>`AVG(CAST(${claimConfidenceScores.compositeConfidenceScore} AS DECIMAL(5,2)))`,
    })
    .from(claimConfidenceScores)
    .innerJoin(claims, eq(claims.id, claimConfidenceScores.claimId))
    .where(eq(claims.vehicleRegistration, regNum));

  // 7. Fraud alerts (canonical: fraud_alerts table)
  const [fraudAlertSummary] = await db
    .select({ fraudAlertCount: count(fraudAlerts.id) })
    .from(fraudAlerts)
    .innerJoin(claims, eq(claims.id, fraudAlerts.claimId))
    .where(eq(claims.vehicleRegistration, regNum));

  // Compute risk level from canonical signals
  const totalSignals = Number(fraudSummary?.totalFraudSignals ?? 0);
  const repeatDamage = Number(damageSummary?.repeatZoneCount ?? 0);
  const totalClaimsCount = Number(claimSummary?.totalClaims ?? 0);

  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (totalSignals >= 3 || repeatDamage >= 3) riskLevel = "critical";
  else if (totalSignals >= 2 || repeatDamage >= 2 || totalClaimsCount >= 5) riskLevel = "high";
  else if (totalSignals >= 1 || repeatDamage >= 1 || totalClaimsCount >= 3) riskLevel = "medium";

  const intelligence: VehiclePassportIntelligence = {
    vehicleRegistryId,
    registrationNumber: regNum,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    year: vehicle.year ?? null,
    totalClaims: Number(claimSummary?.totalClaims ?? 0),
    completedClaims: Number(claimSummary?.completedClaims ?? 0),
    openClaims: Number(claimSummary?.openClaims ?? 0),
    totalSettlementCents: Math.round((Number(claimSummary?.totalSettlement ?? 0)) * 100),
    avgSettlementCents: Math.round((Number(claimSummary?.avgSettlement ?? 0)) * 100),
    totalFraudSignals: Number(fraudSummary?.totalFraudSignals ?? 0),
    repeatDamageSignals: Number(fraudSummary?.repeatDamageSignals ?? 0),
    stagedAccidentSignals: Number(fraudSummary?.stagedAccidentSignals ?? 0),
    totalDamageEvents: Number(damageSummary?.totalDamageEvents ?? 0),
    repeatZoneCount: Number(damageSummary?.repeatZoneCount ?? 0),
    distinctDamageZones: Number(damageSummary?.distinctDamageZones ?? 0),
    totalInspections: Number(inspectionSummary?.totalInspections ?? 0),
    lastClaimDate: claimSummary?.lastClaimDate ?? null,
    lastInspectionDate: inspectionSummary?.lastInspectionDate ?? null,
    lastFraudSignalDate: fraudSummary?.lastSignalDate ?? null,
    avgConfidenceScore: confidenceSummary?.avgConfidenceScore
      ? Number(confidenceSummary.avgConfidenceScore)
      : null,
    fraudAlertCount: Number(fraudAlertSummary?.fraudAlertCount ?? 0),
    riskLevel,
    // Data source map — every value is traceable to its canonical table
    dataSourceMap: {
      vehicleRecord: "vehicle_registry",
      claimSummary: "claims",
      damageSummary: "vehicle_damage_history",
      fraudSignals: "cross_claim_signals",
      inspections: "inspections",
      confidenceScores: "claim_confidence_scores",
      fraudAlerts: "fraud_alerts",
    },
  };

  // Write snapshot to aggregation cache (non-blocking)
  setImmediate(async () => {
    try {
      await db.insert(vehiclePassportSnapshots).values({
        vehicleRegistryId,
        registrationNumber: regNum,
        tenantId: tenantId ?? vehicle.tenantId ?? null,
        totalClaims: intelligence.totalClaims,
        completedClaims: intelligence.completedClaims,
        openClaims: intelligence.openClaims,
        totalSettlementCents: intelligence.totalSettlementCents,
        avgSettlementCents: intelligence.avgSettlementCents,
        totalFraudSignals: intelligence.totalFraudSignals,
        repeatDamageSignals: intelligence.repeatDamageSignals,
        totalDamageEvents: intelligence.totalDamageEvents,
        repeatZoneCount: intelligence.repeatZoneCount,
        distinctDamageZones: intelligence.distinctDamageZones,
        totalInspections: intelligence.totalInspections,
        lastClaimDate: intelligence.lastClaimDate ?? undefined,
        lastInspectionDate: intelligence.lastInspectionDate ?? undefined,
        lastFraudSignalDate: intelligence.lastFraudSignalDate ?? undefined,
        intelligenceJson: intelligence as unknown as Record<string, unknown>,
        generatedBy: "epic4-aggregation-service",
      });
    } catch {
      // Non-blocking — snapshot failure never stalls the response
    }
  });

  return intelligence;
}

// ─── Fleet Intelligence Aggregation ──────────────────────────────────────────

/**
 * Aggregate fleet-level intelligence.
 * Reads from: fleet_vehicles, fleet_drivers, claims, cross_claim_signals
 * Writes to: fleet_intelligence_snapshots (cache only)
 */
export async function aggregateFleetIntelligence(
  fleetId: number,
  tenantId: string
): Promise<FleetIntelligence> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Vehicle count (canonical: fleet_vehicles)
  const [vehicleCount] = await db
    .select({ total: count(fleetVehicles.id) })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.fleetId, fleetId));

  // Driver count (canonical: fleet_drivers)
  const [driverCount] = await db
    .select({ total: count(fleetDrivers.id) })
    .from(fleetDrivers)
    .where(and(eq(fleetDrivers.fleetId, fleetId), eq(fleetDrivers.tenantId, tenantId)));

  // Claim summary via fleet_vehicles → claims
  const [claimSummary] = await db
    .select({
      totalClaims: count(claims.id),
      openClaims: sql<number>`SUM(CASE WHEN ${claims.status} NOT IN ('completed','rejected','closed') THEN 1 ELSE 0 END)`,
      totalSettlement: sql<number>`SUM(CAST(${claims.finalApprovedAmount} AS DECIMAL(15,2)))`,
      avgSettlement: sql<number>`AVG(CAST(${claims.finalApprovedAmount} AS DECIMAL(15,2)))`,
    })
    .from(fleetVehicles)
    .leftJoin(claims, eq(claims.vehicleRegistration, fleetVehicles.registrationNumber))
    .where(eq(fleetVehicles.fleetId, fleetId));

  // Fraud signals via fleet_vehicles → claims → cross_claim_signals
  const [fraudSummary] = await db
    .select({ totalFraudSignals: count(crossClaimSignals.id) })
    .from(fleetVehicles)
    .innerJoin(claims, eq(claims.vehicleRegistration, fleetVehicles.registrationNumber))
    .innerJoin(crossClaimSignals, eq(crossClaimSignals.claimId, claims.id))
    .where(eq(fleetVehicles.fleetId, fleetId));

  // High-risk vehicles (risk_score >= 70)
  const [highRiskVehicles] = await db
    .select({
      count: sql<number>`SUM(CASE WHEN ${fleetVehicles.riskScore} >= 70 THEN 1 ELSE 0 END)`,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.fleetId, fleetId));

  const totalV = Number(vehicleCount?.total ?? 0);
  const totalD = Number(driverCount?.total ?? 0);
  const totalC = Number(claimSummary?.totalClaims ?? 0);
  const openC = Number(claimSummary?.openClaims ?? 0);
  const totalS = Math.round((Number(claimSummary?.totalSettlement ?? 0)) * 100);
  const avgS = Math.round((Number(claimSummary?.avgSettlement ?? 0)) * 100);
  const totalF = Number(fraudSummary?.totalFraudSignals ?? 0);
  const highRiskV = Number(highRiskVehicles?.count ?? 0);

  // Fleet risk score: weighted composite (P-03: reuse canonical risk scores)
  const fleetRiskScore = Math.min(
    100,
    Math.round(
      (highRiskV / Math.max(totalV, 1)) * 40 +
        (totalF / Math.max(totalC, 1)) * 30 +
        (openC / Math.max(totalC, 1)) * 30
    )
  );

  const intelligence: FleetIntelligence = {
    fleetId,
    tenantId,
    totalVehicles: totalV,
    totalDrivers: totalD,
    totalClaims: totalC,
    openClaims: openC,
    totalSettlementCents: totalS,
    avgSettlementCents: avgS,
    totalFraudSignals: totalF,
    highRiskVehicleCount: highRiskV,
    highRiskDriverCount: 0, // Populated by driver-level aggregation
    fleetRiskScore,
  };

  // Write snapshot to aggregation cache (non-blocking)
  setImmediate(async () => {
    try {
      await db.insert(fleetIntelligenceSnapshots).values({
        fleetId,
        tenantId,
        totalVehicles: intelligence.totalVehicles,
        totalDrivers: intelligence.totalDrivers,
        totalClaims: intelligence.totalClaims,
        openClaims: intelligence.openClaims,
        totalSettlementCents: intelligence.totalSettlementCents,
        avgSettlementCents: intelligence.avgSettlementCents,
        totalFraudSignals: intelligence.totalFraudSignals,
        highRiskVehicleCount: intelligence.highRiskVehicleCount,
        highRiskDriverCount: intelligence.highRiskDriverCount,
        fleetRiskScore: intelligence.fleetRiskScore,
        intelligenceJson: intelligence as unknown as Record<string, unknown>,
        generatedBy: "epic4-aggregation-service",
      });
    } catch {
      // Non-blocking
    }
  });

  return intelligence;
}

// ─── Predictive Risk Score Computation ───────────────────────────────────────

/**
 * Compute a deterministic predictive risk score for a vehicle.
 * Reads from canonical tables only — never from other scores.
 * Writes to: predictive_risk_scores
 *
 * Governance: ADR-001, P-04 (no duplicate engines), P-09 (AI is advisory)
 * This is a deterministic statistical model, not an AI model.
 */
export async function computeVehicleRenewalRisk(
  vehicleRegistryId: number,
  registrationNumber: string,
  tenantId?: string
): Promise<{
  scoreValue: number;
  scoreLabel: "very_low" | "low" | "medium" | "high" | "very_high" | "critical";
  confidenceLevel: number;
  factors: PredictiveRiskFactors;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // All inputs from canonical tables
  const [claimStats] = await db
    .select({
      totalClaims: count(claims.id),
      avgSettlement: sql<number>`AVG(CAST(${claims.finalApprovedAmount} AS DECIMAL(15,2)))`,
    })
    .from(claims)
    .where(eq(claims.vehicleRegistration, registrationNumber));

  const [damageStats] = await db
    .select({
      repeatZoneCount: sql<number>`SUM(CASE WHEN ${vehicleDamageHistory.isRepeatZone} = 1 THEN 1 ELSE 0 END)`,
      totalEvents: count(vehicleDamageHistory.id),
    })
    .from(vehicleDamageHistory)
    .where(eq(vehicleDamageHistory.vehicleId, vehicleRegistryId));

  const [fraudStats] = await db
    .select({ totalSignals: count(crossClaimSignals.id) })
    .from(crossClaimSignals)
    .innerJoin(claims, eq(claims.id, crossClaimSignals.claimId))
    .where(eq(claims.vehicleRegistration, registrationNumber));

  const totalC = Number(claimStats?.totalClaims ?? 0);
  const totalEvents = Number(damageStats?.totalEvents ?? 0);
  const repeatZones = Number(damageStats?.repeatZoneCount ?? 0);
  const totalSignals = Number(fraudStats?.totalSignals ?? 0);

  // Deterministic scoring model v1.0
  const claimFrequency = Math.min(totalC / 5, 1.0); // normalised 0-1
  const fraudSignalDensity = Math.min(totalSignals / 3, 1.0);
  const repeatDamageRate = totalEvents > 0 ? Math.min(repeatZones / totalEvents, 1.0) : 0;
  const avgSettlementTrend = Math.min((Number(claimStats?.avgSettlement ?? 0)) / 50000, 1.0);

  // Weighted composite score (0–100)
  const scoreValue = Math.round(
    claimFrequency * 30 +
      fraudSignalDensity * 35 +
      repeatDamageRate * 25 +
      avgSettlementTrend * 10
  );

  const scoreLabel =
    scoreValue >= 80 ? "critical" :
    scoreValue >= 65 ? "very_high" :
    scoreValue >= 50 ? "high" :
    scoreValue >= 35 ? "medium" :
    scoreValue >= 20 ? "low" : "very_low";

  // Confidence: higher with more data points
  const confidenceLevel = Math.min(Math.round((totalC + totalEvents) / 10 * 100), 95);

  const factors: PredictiveRiskFactors = {
    claimFrequency,
    fraudSignalDensity,
    repeatDamageRate,
    avgSettlementTrend,
    confidenceScore: confidenceLevel,
  };

  // Write to predictive_risk_scores (non-blocking)
  setImmediate(async () => {
    try {
      await db.insert(predictiveRiskScores).values({
        entityType: "vehicle",
        entityId: String(vehicleRegistryId),
        tenantId: tenantId ?? null,
        scoreType: "vehicle_renewal_risk",
        scoreValue: String(scoreValue),
        scoreLabel,
        confidenceLevel: String(confidenceLevel),
        modelVersion: "v1.0",
        factorsJson: factors as unknown as Record<string, unknown>,
        computedBy: "epic4-aggregation-service",
      });
    } catch {
      // Non-blocking
    }
  });

  return { scoreValue, scoreLabel, confidenceLevel, factors };
}
