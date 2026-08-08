/**
 * KINGA Intelligence DB Module
 * Claim events, decision snapshots, cost learning, benchmarks, tenant rates.
 * Extracted from server/db.ts — Aug 2026.
 */
import { eq, and, desc, sql, inArray, gte, lte, or, count, avg } from "drizzle-orm";
import {
  claimEvents, InsertClaimEvent, decisionSnapshots, DecisionSnapshot,
  tenants, users, claims,
} from "../../drizzle/schema";
import { getDb } from "../db-core";

export async function emitClaimEvent(params: {
  claimId: number;
  eventType: string;
  userId?: number;
  userRole?: string;
  tenantId?: string;
  eventPayload?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Events] Cannot emit event: database not available");
    return;
  }

  try {
    await db.insert(claimEvents).values({
      claimId: params.claimId,
      eventType: params.eventType,
      userId: params.userId,
      userRole: params.userRole,
      tenantId: params.tenantId,
      eventPayload: params.eventPayload || null,
      emittedAt: new Date().toISOString(),
    });
    
    console.log(`[Events] Emitted ${params.eventType} for claim ${params.claimId}`);
  } catch (error) {
    console.error(`[Events] Failed to emit ${params.eventType}:`, error);
    // Non-blocking: don't throw, just log
  }
}

// ============================================================
// DECISION SNAPSHOTS — Immutable audit persistence
// ============================================================

export interface DecisionSnapshotInput {
  claimId: string;
  tenantId: string;
  createdByUserId?: string;

  verdict: {
    decision: string;
    primaryReason: string;
    confidence: number;
  };

  cost: {
    aiEstimate: number;       // in cents
    quoted: number;           // in cents
    deviationPercent: number;
    fairRangeMin: number;     // in cents
    fairRangeMax: number;     // in cents
    verdict: string;
  };

  fraud: {
    score: number;
    level: string;
    contributions: Array<{ factor: string; value: number }>;
  };

  physics: {
    deltaV: number;
    velocityRange: string;
    energyKj: number;
    forceKn: number;
    estimated: boolean;
  };

  damage: {
    zones: string[];
    severity: string;
    consistencyScore: number;
  };

  enforcementTrace: Array<{ rule: string; value: unknown; threshold: string; triggered: boolean }>;
  confidenceBreakdown: Array<{ factor: string; penalty: number }>;

  dataQuality: {
    missingFields: string[];
    estimatedFields: string[];
    extractionConfidence: number;
  };
}

// ─── Spec-compliant snapshot shape (snake_case, no nulls) ───────────────────

export interface SpecSnapshot {
  // Identity
  claim_id: string;
  snapshot_version: number;
  created_at: number;          // Unix ms
  created_by_user_id: string;

  // Verdict
  verdict_decision: string;    // FINALISE_CLAIM | REVIEW_REQUIRED | ESCALATE_INVESTIGATION
  verdict_label: string;       // Human-readable label
  verdict_primary_reason: string;
  verdict_confidence: number;  // 0-100
  verdict_color: string;       // green | amber | red

  // Cost
  cost_ai_estimate_cents: number;
  cost_ai_estimate_display: number;  // dollars
  cost_quoted_cents: number;
  cost_quoted_display: number;       // dollars
  cost_deviation_percent: number;
  cost_fair_range_min_cents: number;
  cost_fair_range_max_cents: number;
  cost_fair_range_min_display: number;
  cost_fair_range_max_display: number;
  cost_verdict: string;              // FAIR | OVERPRICED | UNDERPRICED | NO_QUOTE

  // Fraud
  fraud_score: number;               // 0-100
  fraud_level: string;               // minimal | low | moderate | high | elevated
  fraud_level_label: string;
  fraud_contributions: Array<{ factor: string; value: number }>;

  // Physics
  delta_v: number;                   // km/h
  velocity_range: string;            // e.g. "40–60 km/h"
  energy_kj: number;
  force_kn: number;
  physics_estimated: boolean;

  // Damage
  damage_zones: string[];
  damage_severity: string;
  consistency_score: number;         // 0-100

  // Enforcement trace
  enforcement_trace: Array<{
    rule: string;
    value: string | number;
    threshold: string;
    triggered: boolean;
  }>;

  // Confidence breakdown
  confidence_breakdown: Array<{
    factor: string;
    penalty: number;
  }>;

  // Data quality
  missing_fields: string[];
  estimated_fields: string[];
  extraction_confidence: number;     // 0-100
}

/** Map verdict decision key to human-readable label */
function verdictLabel(decision: string): string {
  if (decision === 'FINALISE_CLAIM') return 'FINALISE CLAIM';
  if (decision === 'REVIEW_REQUIRED') return 'REVIEW REQUIRED';
  if (decision === 'ESCALATE_INVESTIGATION') return 'ESCALATE INVESTIGATION';
  return decision.replace(/_/g, ' ');
}

/** Map verdict decision to color band */
function verdictColor(decision: string): string {
  if (decision === 'FINALISE_CLAIM') return 'green';
  if (decision === 'ESCALATE_INVESTIGATION') return 'red';
  return 'amber';
}

/** Map fraud level key to display label */
function fraudLevelLabel(level: string): string {
  const map: Record<string, string> = {
    minimal: 'Minimal',
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    elevated: 'Elevated',
    critical: 'Elevated', // backward compat
  };
  return map[level.toLowerCase()] ?? level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Build the spec-compliant snake_case snapshot object from the input.
 * All fields are guaranteed non-null/non-undefined.
 */
export function buildSpecSnapshot(
  input: DecisionSnapshotInput,
  version: number,
): SpecSnapshot {
  const aiEstimateDollars = Math.round(input.cost.aiEstimate) / 100;
  const quotedDollars = Math.round(input.cost.quoted) / 100;
  const fairMinDollars = Math.round(input.cost.fairRangeMin) / 100;
  const fairMaxDollars = Math.round(input.cost.fairRangeMax) / 100;

  return {
    // Identity
    claim_id: input.claimId,
    snapshot_version: version,
    created_at: Date.now(),
    created_by_user_id: input.createdByUserId ?? 'system',

    // Verdict
    verdict_decision: input.verdict.decision,
    verdict_label: verdictLabel(input.verdict.decision),
    verdict_primary_reason: input.verdict.primaryReason,
    verdict_confidence: input.verdict.confidence,
    verdict_color: verdictColor(input.verdict.decision),

    // Cost
    cost_ai_estimate_cents: Math.round(input.cost.aiEstimate),
    cost_ai_estimate_display: aiEstimateDollars,
    cost_quoted_cents: Math.round(input.cost.quoted),
    cost_quoted_display: quotedDollars,
    cost_deviation_percent: Math.round(input.cost.deviationPercent),
    cost_fair_range_min_cents: Math.round(input.cost.fairRangeMin),
    cost_fair_range_max_cents: Math.round(input.cost.fairRangeMax),
    cost_fair_range_min_display: fairMinDollars,
    cost_fair_range_max_display: fairMaxDollars,
    cost_verdict: input.cost.verdict || 'FAIR',

    // Fraud
    fraud_score: input.fraud.score,
    fraud_level: input.fraud.level || 'minimal',
    fraud_level_label: fraudLevelLabel(input.fraud.level || 'minimal'),
    fraud_contributions: input.fraud.contributions.map(c => ({
      factor: c.factor,
      value: c.value,
    })),

    // Physics
    delta_v: input.physics.deltaV,
    velocity_range: input.physics.velocityRange || 'Not calculated',
    energy_kj: input.physics.energyKj,
    force_kn: input.physics.forceKn,
    physics_estimated: input.physics.estimated,

    // Damage
    damage_zones: input.damage.zones,
    damage_severity: input.damage.severity || 'unknown',
    consistency_score: input.damage.consistencyScore,

    // Enforcement trace
    enforcement_trace: input.enforcementTrace.map(t => ({
      rule: t.rule,
      value: t.value as string | number,
      threshold: t.threshold,
      triggered: t.triggered,
    })),

    // Confidence breakdown
    confidence_breakdown: input.confidenceBreakdown.map(c => ({
      factor: c.factor,
      penalty: c.penalty,
    })),

    // Data quality
    missing_fields: input.dataQuality.missingFields,
    estimated_fields: input.dataQuality.estimatedFields,
    extraction_confidence: input.dataQuality.extractionConfidence,
  };
}

/**
 * Persist an immutable Decision Snapshot for a claim.
 * Snapshots are append-only — never updated after creation.
 * Returns the new snapshot ID and version number.
 */
export async function saveDecisionSnapshot(input: DecisionSnapshotInput): Promise<{ id: number; version: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Determine next version number for this claim
  const existing = await db
    .select({ version: decisionSnapshots.snapshotVersion })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, input.claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

  const [result] = await db.insert(decisionSnapshots).values({
    claimId: input.claimId,
    tenantId: input.tenantId,
    snapshotVersion: nextVersion,
    createdAt: Date.now(),
    createdByUserId: input.createdByUserId ?? null,

    verdictDecision: input.verdict.decision,
    verdictPrimaryReason: input.verdict.primaryReason,
    verdictConfidence: input.verdict.confidence,

    costAiEstimate: input.cost.aiEstimate,
    costQuoted: input.cost.quoted,
    costDeviationPercent: Math.round(input.cost.deviationPercent),
    costFairRangeMin: input.cost.fairRangeMin,
    costFairRangeMax: input.cost.fairRangeMax,
    costVerdict: input.cost.verdict,

    fraudScore: input.fraud.score,
    fraudLevel: input.fraud.level,
    fraudContributionsJson: JSON.stringify(input.fraud.contributions),

    physicsDetlaV: Math.round(input.physics.deltaV * 10),
    physicsVelocityRange: input.physics.velocityRange,
    physicsEnergyKj: Math.round(input.physics.energyKj),
    physicsForceKn: Math.round(input.physics.forceKn),
    physicsEstimated: input.physics.estimated ? 1 : 0,

    damageZonesJson: JSON.stringify(input.damage.zones),
    damageSeverity: input.damage.severity,
    damageConsistencyScore: input.damage.consistencyScore,

    enforcementTraceJson: JSON.stringify(input.enforcementTrace),
    confidenceBreakdownJson: JSON.stringify(input.confidenceBreakdown),

    missingFieldsJson: JSON.stringify(input.dataQuality.missingFields),
    estimatedFieldsJson: JSON.stringify(input.dataQuality.estimatedFields),
    extractionConfidence: input.dataQuality.extractionConfidence,

    // Verbatim spec-compliant JSON — single source of truth
    snapshotJson: JSON.stringify(buildSpecSnapshot(input, nextVersion)),
  });

  return { id: Number((result as { insertId?: number }).insertId ?? 0), version: nextVersion };
}

/**
 * Retrieve all Decision Snapshots for a claim, ordered newest first.
 */
export async function getDecisionSnapshots(claimId: string): Promise<DecisionSnapshot[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion));
}

/**
 * Get the latest Decision Snapshot for a claim, or null if none exists.
 */
export async function getLatestDecisionSnapshot(claimId: string): Promise<DecisionSnapshot | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get the latest spec-compliant snapshot JSON for a claim.
 * Returns the parsed SpecSnapshot object, or null if no snapshot exists.
 */
export async function getLatestSnapshotJson(claimId: string): Promise<SpecSnapshot | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ snapshotJson: decisionSnapshots.snapshotJson, snapshotVersion: decisionSnapshots.snapshotVersion })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);
  if (!rows[0]) return null;
  const raw = rows[0].snapshotJson;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpecSnapshot;
  } catch {
    return null;
  }
}

// ============================================================================
// COST INTELLIGENCE LEARNING RECORDS
// ============================================================================

import type { CostLearningRecord } from "./pipeline-v2/costLearningRecorder";

/**
 * Persist a CostLearningRecord extracted from Stage 9 to the database.
 * Safe to call fire-and-forget — errors are logged but never thrown.
 */
export async function insertCostLearningRecord(
  record: CostLearningRecord,
  tenantId?: string | null
): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[CostLearning] Database not available — skipping record persistence");
    return null;
  }

  try {
    const { costLearningRecords } = await import("../drizzle/schema");
    const result = await db.insert(costLearningRecords).values({
      claimId: typeof record.claim_id === "number" ? record.claim_id : parseInt(String(record.claim_id), 10),
      tenantId: tenantId ?? null,
      vehicleDescriptor: record.vehicle_descriptor.slice(0, 255),
      collisionDirection: record.collision_direction.slice(0, 50),
      marketRegion: record.market_region.slice(0, 10),
      caseSignature: record.case_signature.slice(0, 100),
      componentCount: record.component_count,
      structuralComponentCount: record.structural_component_count,
      // CX-01-Q/R fix: write the claim's actual currency so benchmark queries can filter by currency
      currency: record.currency_code ?? "USD",
      finalCostUsdCents: record.final_cost_usd !== null ? Math.round(record.final_cost_usd * 100) : null,
      costIsAgreed: record.cost_is_agreed ? 1 : 0,
      quoteCoverageRatioPct: Math.round(record.quote_coverage_ratio * 100),
      highCostDriversJson: JSON.stringify(record.high_cost_drivers),
      componentWeightingJson: JSON.stringify(record.component_weighting),
      componentDetailJson: JSON.stringify(record.component_detail),
      qualityFlagsJson: JSON.stringify(record.quality_flags),
      recordedAt: record.recorded_at,
    });
    const insertId = (result as any)[0]?.insertId ?? null;
    console.log(`[CostLearning] Record persisted for claim ${record.claim_id} (id: ${insertId}, signature: ${record.case_signature})`);
    return insertId;
  } catch (err) {
    console.warn(`[CostLearning] Failed to persist record for claim ${record.claim_id}:`, err);
    return null;
  }
}

/**
 * getActiveCalibrationMultiplier
 *
 * Returns the most recent approved calibration cost multiplier for the given
 * tenant + jurisdiction combination. Falls back to 'global' if no
 * jurisdiction-specific override exists.
 *
 * The multiplier is stored as an integer × 1000 in the DB (e.g. 800 = 0.800).
 * Returns a float (e.g. 0.800) ready to multiply against cost estimates.
 * Returns 1.0 if no approved override exists.
 */
export async function getActiveCalibrationMultiplier(
  tenantId: string | null,
  jurisdiction: string,
  scenarioType?: string | null
): Promise<number> {
  try {
    const { calibrationOverrides } = await import("../drizzle/schema");
    const { eq, and, or, isNull, desc } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return 1.0;

    // Try jurisdiction-specific first, then fall back to 'global'
    const jurisdictions = jurisdiction !== "global"
      ? [jurisdiction, "global"]
      : ["global"];

    for (const jur of jurisdictions) {
      const conditions = [
        eq(calibrationOverrides.status, "approved"),
        eq(calibrationOverrides.jurisdiction, jur),
      ];
      if (tenantId) {
        conditions.push(eq(calibrationOverrides.tenantId, tenantId));
      }

      const rows = await db
        .select({
          costMultiplier: calibrationOverrides.costMultiplier,
          scenarioType: calibrationOverrides.scenarioType,
        })
        .from(calibrationOverrides)
        .where(and(...conditions))
        .orderBy(desc(calibrationOverrides.approvedAt))
        .limit(10);

      if (rows.length === 0) continue;

      // Prefer scenario-specific match, then null (applies to all)
      const scenarioMatch = scenarioType
        ? rows.find((r) => r.scenarioType === scenarioType)
        : null;
      const globalMatch = rows.find((r) => r.scenarioType === null || r.scenarioType === undefined);

      const best = scenarioMatch ?? globalMatch ?? rows[0];
      if (best?.costMultiplier != null) {
        return best.costMultiplier / 1000; // convert int×1000 back to float
      }
    }

    return 1.0; // No override found — use identity multiplier
  } catch (err) {
    console.warn("[CalibrationOverride] Failed to fetch multiplier:", err);
    return 1.0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT RATE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read per-tenant cost rate overrides from tenants.configJson.
 * Returns null if no tenant is found or no rate overrides are configured.
 *
 * Expected configJson shape (all fields optional):
 * {
 *   "labourRateUsdPerHour": 35,
 *   "paintCostPerPanelUsd": 50,
 *   "currencyCode": "ZAR",
 *   "currencySymbol": "R"
 * }
 */
export async function getTenantRates(tenantId: number | string | null): Promise<{
  labourRateUsdPerHour?: number;
  paintCostPerPanelUsd?: number;
  currencyCode?: string;
  currencySymbol?: string;
  /** ISO 3166-1 alpha-2 country code for the tenant's primary operating country */
  country?: string;
} | null> {
  if (!tenantId) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    const tenantIdStr = String(tenantId);
    const rows = await db
      .select({
        configJson: schema.tenants.configJson,
        currencyCode: schema.tenants.currencyCode,
        currencySymbol: schema.tenants.currencySymbol,
        country: schema.tenants.country,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantIdStr))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    const config = (row.configJson as Record<string, unknown> | null) ?? {};
    const result: {
      labourRateUsdPerHour?: number;
      paintCostPerPanelUsd?: number;
      currencyCode?: string;
      currencySymbol?: string;
      country?: string;
    } = {};
    if (typeof config.labourRateUsdPerHour === "number" && config.labourRateUsdPerHour > 0) {
      result.labourRateUsdPerHour = config.labourRateUsdPerHour;
    }
    if (typeof config.paintCostPerPanelUsd === "number" && config.paintCostPerPanelUsd > 0) {
      result.paintCostPerPanelUsd = config.paintCostPerPanelUsd;
    }
    // Currency from configJson takes precedence; fall back to tenants.currencyCode column
    const currencyCode = (typeof config.currencyCode === "string" ? config.currencyCode : null)
      ?? row.currencyCode ?? undefined;
    const currencySymbol = (typeof config.currencySymbol === "string" ? config.currencySymbol : null)
      ?? row.currencySymbol ?? undefined;
    if (currencyCode) result.currencyCode = currencyCode;
    if (currencySymbol) result.currencySymbol = currencySymbol;
    // Country from DB column (set during onboarding or admin settings)
    if (row.country) result.country = row.country;
    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.warn("[TenantRates] Failed to fetch tenant rates:", err);
    return null;
  }
}

/**
 * Update per-tenant cost rate overrides in tenants.configJson.
 * Merges the provided rates into the existing configJson (preserves other fields).
 */
export async function updateTenantRates(
  tenantId: string,
  rates: {
    labourRateUsdPerHour?: number | null;
    paintCostPerPanelUsd?: number | null;
    currencyCode?: string | null;
    currencySymbol?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({ configJson: schema.tenants.configJson })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  const existing = (rows[0]?.configJson as Record<string, unknown> | null) ?? {};
  const updated = { ...existing };
  if (rates.labourRateUsdPerHour !== undefined) {
    if (rates.labourRateUsdPerHour === null) {
      delete updated.labourRateUsdPerHour;
    } else {
      updated.labourRateUsdPerHour = rates.labourRateUsdPerHour;
    }
  }
  if (rates.paintCostPerPanelUsd !== undefined) {
    if (rates.paintCostPerPanelUsd === null) {
      delete updated.paintCostPerPanelUsd;
    } else {
      updated.paintCostPerPanelUsd = rates.paintCostPerPanelUsd;
    }
  }
  if (rates.currencyCode !== undefined) {
    if (rates.currencyCode === null) {
      delete updated.currencyCode;
    } else {
      updated.currencyCode = rates.currencyCode;
    }
  }
  if (rates.currencySymbol !== undefined) {
    if (rates.currencySymbol === null) {
      delete updated.currencySymbol;
    } else {
      updated.currencySymbol = rates.currencySymbol;
    }
  }
  await db
    .update(schema.tenants)
    .set({ configJson: updated })
    .where(eq(schema.tenants.id, tenantId));
}

// ─── Per-Component KINGA Benchmark Query ─────────────────────────────────────
/**
 * Aggregate per-component price benchmarks from componentRepairOutcomes.
 * Returns p25 / median / p75 for each requested component name,
 * optionally filtered by vehicleMake and outcome (repair | replace).
 *
 * Falls back to all makes when no rows exist for the specific make.
 * Returns null for a component when no historical data exists at all.
 */
export interface ComponentBenchmark {
  component: string;
  outcome: "repair" | "replace";
  p25Usd: number;
  medianUsd: number;
  p75Usd: number;
  sampleSize: number;
  vehicleMakeFiltered: boolean;
}

export async function getComponentBenchmarks(
  componentNames: string[],
  vehicleMake?: string | null,
  preferredOutcome?: "repair" | "replace"
): Promise<ComponentBenchmark[]> {
  if (!componentNames.length) return [];
  const db = await getDb();
  if (!db) return [];

  const results: ComponentBenchmark[] = [];

  for (const component of componentNames) {
    // Try make-specific first, then fall back to all makes
    for (const makeFiltered of [true, false]) {
      const whereConditions: any[] = [
        eq(schema.componentRepairOutcomes.componentName, component),
      ];
      if (makeFiltered && vehicleMake) {
        whereConditions.push(
          sql`LOWER(${schema.componentRepairOutcomes.vehicleMake}) = LOWER(${vehicleMake})`
        );
      }
      if (preferredOutcome) {
        whereConditions.push(
          eq(schema.componentRepairOutcomes.outcome, preferredOutcome)
        );
      }

      const rows = await db
        .select({
          repairCostUsd: schema.componentRepairOutcomes.repairCostUsd,
          replaceCostUsd: schema.componentRepairOutcomes.replaceCostUsd,
          outcome: schema.componentRepairOutcomes.outcome,
        })
        .from(schema.componentRepairOutcomes)
        .where(and(...whereConditions))
        .limit(500);

      if (!rows.length) {
        if (makeFiltered) continue;
        break;
      }

      const costs: number[] = rows
        .map((r: any) => {
          const v =
            preferredOutcome === "repair"
              ? r.repairCostUsd
              : preferredOutcome === "replace"
              ? r.replaceCostUsd
              : (r.repairCostUsd ?? r.replaceCostUsd);
          return v != null ? parseFloat(String(v)) : null;
        })
        .filter((v: any): v is number => v !== null && !isNaN(v) && v > 0);

      if (!costs.length) {
        if (makeFiltered) continue;
        break;
      }

      costs.sort((a: number, b: number) => a - b);
      const n = costs.length;
      const p25 = costs[Math.floor(n * 0.25)] ?? costs[0];
      const median =
        n % 2 === 0
          ? ((costs[n / 2 - 1] + costs[n / 2]) / 2)
          : costs[Math.floor(n / 2)];
      const p75 = costs[Math.floor(n * 0.75)] ?? costs[n - 1];

      results.push({
        component,
        outcome: preferredOutcome ?? "repair",
        p25Usd: Math.round(p25 * 100) / 100,
        medianUsd: Math.round(median * 100) / 100,
        p75Usd: Math.round(p75 * 100) / 100,
        sampleSize: n,
        vehicleMakeFiltered: makeFiltered && !!vehicleMake,
      });
      break;
    }
  }

  return results;
}

// ── getComponentBenchmarksFromTrainingData ──────────────────────────────────
// Queries the component_benchmarks table (seeded from training parquet) as a
// fallback when componentRepairOutcomes has no validated historical data.
export async function getComponentBenchmarksFromTrainingData(
  componentNames: string[],
  vehicleMake?: string | null
): Promise<ComponentBenchmark[]> {
  if (!componentNames.length) return [];
  const db = await getDb();
  if (!db) return [];

  const results: ComponentBenchmark[] = [];

  // Mapping from canonical display names (and common aliases) to component_benchmarks.component_id.
  // The DB uses a different naming convention from resolveToCanonicalId(), so we need an
  // explicit bridge. This map is the single source of truth for the display-name → DB-ID alignment.
  // Add entries here when new component_ids are seeded into component_benchmarks.
  const DISPLAY_TO_DB_ID: Record<string, string> = {
    // Airbags
    'Driver Airbag': 'driver_airbag',
    'Passenger Airbag': 'passenger_airbag',
    'Knee Airbag': 'knee_airbag',
    'Curtain Airbag (Left)': 'curtain_airbag_left',
    'Curtain Airbag (Right)': 'curtain_airbag_right',
    'Airbag Control Module': 'airbag_module',
    // Headlights
    'Headlight Assembly (Left)': 'left_headlight',
    'Headlight Assembly (Right)': 'right_headlight',
    // Fenders
    'Front Fender (Left)': 'left_fender',
    'Front Fender (Right)': 'right_fender',
    // Doors
    'Front Door (Left)': 'left_front_door',
    'Front Door (Right)': 'right_front_door',
    'Rear Door (Left)': 'left_rear_door',
    'Rear Door (Right)': 'right_rear_door',
    // Mirrors
    'Side Mirror (Left)': 'left_side_mirror',
    'Side Mirror (Right)': 'right_side_mirror',
    // Shock absorbers
    'Shock Absorber (Left)': 'left_shock',
    'Shock Absorber (Right)': 'right_shock',
    // Body panels
    'Bonnet (Hood)': 'bonnet',
    'Boot Lid': 'boot_lid',
    'Windscreen (Windshield)': 'windscreen',
    'Rear Window': 'rear_window',
    'Front Bumper': 'front_bumper',
    'Rear Bumper': 'rear_bumper',
    'Grille': 'grille',
    'Roof': 'roof',
    // Mechanical
    'Radiator Assembly': 'radiator',
    'Condenser': 'condenser',
    'Intercooler': 'intercooler',
    'Engine': 'engine',
    'Gearbox': 'gearbox',
    'Exhaust System': 'exhaust',
    'Steering Rack': 'steering_rack',
    'Steering Wheel': 'steering_wheel',
    'Tie Rod End': 'tie_rod_end',
    'Wheel Bearing': 'wheel_bearing',
    'Control Arm (Left)': 'control_arm_left',
    'Fog Light': 'fog_light',
    'Dashboard': 'dashboard',
  };

  for (const component of componentNames) {
    // Resolve component name to DB component_id using:
    //   1. Explicit display-name → DB-ID mapping (most accurate)
    //   2. Simple normalisation fallback (spaces → underscores, lowercase)
    const mappedId = DISPLAY_TO_DB_ID[component] ?? null;
    const fallbackId = component.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const componentId = mappedId ?? fallbackId;

    // Try make-specific first, then global fallback
    for (const makeFiltered of [true, false]) {
      const conditions: any[] = [
        eq(schema.componentBenchmarks.componentId, componentId),
      ];
      if (makeFiltered && vehicleMake) {
        conditions.push(
          sql`LOWER(${schema.componentBenchmarks.vehicleMake}) = LOWER(${vehicleMake})`
        );
      } else if (!makeFiltered) {
        // Global fallback: vehicle_make IS NULL
        conditions.push(sql`${schema.componentBenchmarks.vehicleMake} IS NULL`);
      }

      const rows = await db
        .select()
        .from(schema.componentBenchmarks)
        .where(and(...conditions))
        .limit(1);

      if (!rows.length) {
        if (makeFiltered) continue;
        break;
      }

      const row = rows[0];
      results.push({
        component,
        outcome: 'repair',
        p25Usd: Number(row.p25),
        medianUsd: Number(row.median),
        p75Usd: Number(row.p75),
        sampleSize: row.n,
        vehicleMakeFiltered: makeFiltered && !!vehicleMake,
      });
      break;
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// T4: Cross-submission duplicate detection via perceptual hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * T4: Find ingestion documents whose perceptual hash is within `maxHammingDistance`
 * bits of the supplied `queryHash`.
 *
 * MySQL does not support a native Hamming distance function, so we fetch all
 * rows with a non-null p_hash and compute the distance in application code.
 * Acceptable because: the table is bounded (one row per uploaded file), the
 * query is only called during fraud analysis, and the 64-char comparison is O(64).
 *
 * @param queryHash          64-char binary string (output of computeThumbnailHash).
 * @param maxHammingDistance Maximum bit-distance to consider a match (default: 10).
 * @param excludeDocumentId  Document ID to exclude (the source document itself).
 */
export async function findSimilarImagesByPHash(
  queryHash: string,
  maxHammingDistance = 10,
  excludeDocumentId?: string
): Promise<Array<{ documentId: string; tenantId: string; s3Url: string; hammingDistance: number }>> {
  if (!queryHash || queryHash.length !== 64) return [];

  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      documentId: ingestionDocuments.documentId,
      tenantId: ingestionDocuments.tenantId,
      s3Url: ingestionDocuments.s3Url,
      pHash: ingestionDocuments.pHash,
    })
    .from(ingestionDocuments)
    .where(
      and(
        sql`${ingestionDocuments.pHash} IS NOT NULL`,
        excludeDocumentId
          ? sql`${ingestionDocuments.documentId} != ${excludeDocumentId}`
          : sql`1=1`
      )
    );

  const results: Array<{ documentId: string; tenantId: string; s3Url: string; hammingDistance: number }> = [];
  for (const row of rows) {
    if (!row.pHash || row.pHash.length !== 64) continue;
    let dist = 0;
    for (let i = 0; i < 64; i++) {
      if (queryHash[i] !== row.pHash[i]) dist++;
    }
    if (dist <= maxHammingDistance) {
      results.push({
        documentId: row.documentId,
        tenantId: row.tenantId,
        s3Url: row.s3Url,
        hammingDistance: dist,
      });
    }
  }

  return results.sort((a, b) => a.hammingDistance - b.hammingDistance);
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

/**
 * Send an in-app notification to all claims processors, claims managers, and
 * insurer admins belonging to the given tenant.
 *
 * This replaces owner email blasts for automated pipeline events (gate blocks,
 * pipeline failures, fraud alerts). Each relevant user gets a personal in-app
 * notification that appears in their NotificationCentre bell.
 *
 * @param tenantId  - The tenant whose staff should be notified (null = platform admin only)
 * @param payload   - Notification fields (title, message, type, priority, claimId, actionUrl)
 */
export async function notifyTenantProcessors(
  tenantId: string | null | undefined,
  payload: {
    title: string;
    message: string;
    type: typeof notifications.$inferInsert['type'];
    priority?: typeof notifications.$inferInsert['priority'];
    claimId?: number;
    actionUrl?: string;
    entityType?: string;
    entityId?: number;
  }
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Find all processor/admin users for this tenant
    const targetRoles = ['claims_processor', 'claims_manager', 'insurer_admin'];
    const conditions: any[] = [
      eq(users.role, 'insurer' as any),
      inArray(users.insurerRole as any, targetRoles as any),
      eq(users.isActive, 1),
    ];
    if (tenantId) {
      conditions.push(eq(users.tenantId, tenantId));
    }
    // Also include platform admins
    const [processorUsers, adminUsers] = await Promise.all([
      db.select({ id: users.id }).from(users).where(and(...conditions)),
      db.select({ id: users.id }).from(users).where(
        and(
          inArray(users.role as any, ['admin', 'platform_super_admin'] as any),
          eq(users.isActive, 1)
        )
      ),
    ]);

    const allTargets = [...processorUsers, ...adminUsers];
    if (allTargets.length === 0) return;

    // Deduplicate by user ID
    const seen = new Set<number>();
    const uniqueTargets = allTargets.filter(u => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    // Insert notifications in a single batch (up to 50 recipients)
    const batch = uniqueTargets.slice(0, 50).map(u => ({
      userId: u.id,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      priority: payload.priority ?? 'medium',
      claimId: payload.claimId ?? null,
      actionUrl: payload.actionUrl ?? null,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      isRead: 0,
      createdAt: new Date().toISOString(),
    }));

    await db.insert(notifications).values(batch as any[]);
  } catch (err) {
    // Non-fatal — notification failure must never break the pipeline
    console.warn('[notifyTenantProcessors] Failed to send in-app notifications:', err instanceof Error ? err.message : String(err));
  }
}
