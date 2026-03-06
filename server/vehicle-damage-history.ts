/**
 * Vehicle Damage History — Helper Module
 * ────────────────────────────────────────
 * Provides:
 *   - mapComponentsToZone()   — derive the primary damage zone from a list of components
 *   - extractAffectedZones()  — collect all distinct zones from components
 *   - normaliseSeverity()     — map free-text severity to the enum set
 *   - insertDamageHistory()   — insert one record per AI assessment
 *   - backfillRepairer()      — update repairer fields when a panel beater is selected
 *   - getDamageHistoryByVehicle()  — full history for a vehicle
 *   - getDamageHistoryByClaim()    — record(s) for a specific claim
 *   - detectRepeatZone()      — check if this zone was previously claimed
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { vehicleDamageHistory, vehicleRegistry } from "../drizzle/schema";
import type { InsertVehicleDamageHistory } from "../drizzle/schema";
import { getDb } from "./db";

// ─── Zone mapping ─────────────────────────────────────────────────────────────

/** Canonical zone names accepted by the enum. */
export type DamageZone =
  | "front"
  | "rear"
  | "left"
  | "right"
  | "roof"
  | "undercarriage"
  | "multiple"
  | "unknown";

/** Severity values accepted by the enum. */
export type DamageSeverity = "minor" | "moderate" | "severe" | "total_loss" | "unknown";

/**
 * Component-name → canonical zone lookup.
 * Covers the most common component names returned by the AI vision engine.
 */
const COMPONENT_ZONE_MAP: Record<string, DamageZone> = {
  // Front
  "front bumper": "front",
  "front bumper cover": "front",
  "front grille": "front",
  "hood": "front",
  "bonnet": "front",
  "radiator": "front",
  "headlight": "front",
  "headlamp": "front",
  "front fender": "front",
  "front wing": "front",
  "windshield": "front",
  "windscreen": "front",
  "front windscreen": "front",
  "front windshield": "front",
  "front apron": "front",
  "front crossmember": "front",
  "front subframe": "front",
  "front axle": "front",
  "front suspension": "front",
  "engine": "front",
  "engine bay": "front",
  "coolant system": "front",
  "intercooler": "front",
  "fog light": "front",
  "fog lamp": "front",
  "front fog light": "front",
  "bumper reinforcement": "front",
  "front bumper reinforcement": "front",
  "crash box": "front",
  "front crash box": "front",
  "number plate": "front",
  "license plate": "front",

  // Rear
  "rear bumper": "rear",
  "rear bumper cover": "rear",
  "boot": "rear",
  "trunk": "rear",
  "boot lid": "rear",
  "trunk lid": "rear",
  "tailgate": "rear",
  "rear windscreen": "rear",
  "rear windshield": "rear",
  "rear window": "rear",
  "tail light": "rear",
  "tail lamp": "rear",
  "brake light": "rear",
  "rear fender": "rear",
  "rear wing": "rear",
  "rear quarter panel": "rear",
  "rear apron": "rear",
  "rear crossmember": "rear",
  "rear subframe": "rear",
  "rear axle": "rear",
  "rear suspension": "rear",
  "exhaust": "rear",
  "muffler": "rear",
  "tow bar": "rear",
  "spare wheel": "rear",

  // Left side
  "left door": "left",
  "left front door": "left",
  "left rear door": "left",
  "driver door": "left",
  "left fender": "left",
  "left front fender": "left",
  "left rear fender": "left",
  "left quarter panel": "left",
  "left side mirror": "left",
  "left mirror": "left",
  "left sill": "left",
  "left rocker panel": "left",
  "left a-pillar": "left",
  "left b-pillar": "left",
  "left c-pillar": "left",
  "left running board": "left",

  // Right side
  "right door": "right",
  "right front door": "right",
  "right rear door": "right",
  "passenger door": "right",
  "right fender": "right",
  "right front fender": "right",
  "right rear fender": "right",
  "right quarter panel": "right",
  "right side mirror": "right",
  "right mirror": "right",
  "right sill": "right",
  "right rocker panel": "right",
  "right a-pillar": "right",
  "right b-pillar": "right",
  "right c-pillar": "right",
  "right running board": "right",

  // Roof
  "roof": "roof",
  "roof panel": "roof",
  "sunroof": "roof",
  "moonroof": "roof",
  "roof lining": "roof",
  "roof rack": "roof",
  "panoramic roof": "roof",

  // Undercarriage
  "undercarriage": "undercarriage",
  "underbody": "undercarriage",
  "chassis": "undercarriage",
  "floor pan": "undercarriage",
  "transmission": "undercarriage",
  "gearbox": "undercarriage",
  "driveshaft": "undercarriage",
  "differential": "undercarriage",
  "fuel tank": "undercarriage",
  "catalytic converter": "undercarriage",
  "catalytic": "undercarriage",
  "suspension arm": "undercarriage",
  "control arm": "undercarriage",
  "tie rod": "undercarriage",
  "steering rack": "undercarriage",
  "brake caliper": "undercarriage",
  "brake disc": "undercarriage",
  "brake rotor": "undercarriage",
  "wheel bearing": "undercarriage",
  "cv joint": "undercarriage",
  "cv axle": "undercarriage",
};

/**
 * Derive the primary damage zone from a component name.
 * Falls back to "unknown" if no match is found.
 */
export function mapComponentToZone(componentName: string): DamageZone {
  const key = componentName.toLowerCase().trim();
  // Exact match
  if (COMPONENT_ZONE_MAP[key]) return COMPONENT_ZONE_MAP[key];
  // Partial match — check if any keyword appears in the component name
  for (const [keyword, zone] of Object.entries(COMPONENT_ZONE_MAP)) {
    if (key.includes(keyword)) return zone;
  }
  // Heuristic fallback: look for zone keywords in the name itself
  if (/\bfront\b/.test(key)) return "front";
  if (/\brear\b/.test(key)) return "rear";
  if (/\bleft\b/.test(key)) return "left";
  if (/\bright\b/.test(key)) return "right";
  if (/\broof\b/.test(key)) return "roof";
  if (/\bunder/.test(key) || /\bchassis\b/.test(key)) return "undercarriage";
  return "unknown";
}

/**
 * Given a list of damaged components, derive the primary zone (most frequent)
 * and the full set of affected zones.
 */
export function mapComponentsToZone(
  components: Array<{ name: string; zone?: string | null }>
): { primaryZone: DamageZone; affectedZones: DamageZone[] } {
  if (!components || components.length === 0) {
    return { primaryZone: "unknown", affectedZones: [] };
  }

  const zoneCounts: Partial<Record<DamageZone, number>> = {};

  for (const comp of components) {
    // Prefer the zone field if already set by the AI
    let zone: DamageZone = "unknown";
    if (comp.zone && comp.zone !== "unknown") {
      zone = normaliseZone(comp.zone);
    } else {
      zone = mapComponentToZone(comp.name);
    }
    if (zone !== "unknown") {
      zoneCounts[zone] = (zoneCounts[zone] ?? 0) + 1;
    }
  }

  const affectedZones = Object.keys(zoneCounts) as DamageZone[];

  if (affectedZones.length === 0) {
    return { primaryZone: "unknown", affectedZones: [] };
  }

  if (affectedZones.length > 2) {
    // Multiple distinct zones — use "multiple" as primary
    const sorted = affectedZones.sort(
      (a, b) => (zoneCounts[b] ?? 0) - (zoneCounts[a] ?? 0)
    );
    return { primaryZone: "multiple", affectedZones: sorted };
  }

  // Single or two zones — use the most frequent as primary
  const primary = affectedZones.sort(
    (a, b) => (zoneCounts[b] ?? 0) - (zoneCounts[a] ?? 0)
  )[0] as DamageZone;

  return { primaryZone: primary, affectedZones };
}

/** Normalise a zone string to the canonical enum value. */
export function normaliseZone(raw: string | null | undefined): DamageZone {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  const valid: DamageZone[] = ["front", "rear", "left", "right", "roof", "undercarriage", "multiple", "unknown"];
  if (valid.includes(s as DamageZone)) return s as DamageZone;
  // Heuristic
  if (s.includes("front")) return "front";
  if (s.includes("rear") || s.includes("back")) return "rear";
  if (s.includes("left") || s.includes("driver")) return "left";
  if (s.includes("right") || s.includes("passenger")) return "right";
  if (s.includes("roof") || s.includes("top")) return "roof";
  if (s.includes("under") || s.includes("chassis") || s.includes("floor")) return "undercarriage";
  return "unknown";
}

/**
 * Normalise a free-text severity string to the canonical enum value.
 */
export function normaliseSeverity(raw: string | null | undefined): DamageSeverity {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  if (s === "minor" || s === "light" || s === "low") return "minor";
  if (s === "moderate" || s === "medium" || s === "significant") return "moderate";
  if (s === "severe" || s === "heavy" || s === "high" || s === "major") return "severe";
  if (
    s === "total_loss" ||
    s === "total loss" ||
    s === "write-off" ||
    s === "writeoff" ||
    s === "written off" ||
    s === "totalled"
  )
    return "total_loss";
  return "unknown";
}

// ─── Repeat zone detection ────────────────────────────────────────────────────

/**
 * Check whether this vehicle has previously had a claim in the same damage zone.
 * Returns true if a prior record exists for the vehicle in the given zone.
 */
export async function detectRepeatZone(
  vehicleId: number,
  zone: DamageZone,
  excludeClaimId?: number
): Promise<boolean> {
  if (zone === "unknown" || zone === "multiple") return false;
  const db = await getDb();
  if (!db) return false;

  const rows = await db
    .select({ id: vehicleDamageHistory.id })
    .from(vehicleDamageHistory)
    .where(
      and(
        eq(vehicleDamageHistory.vehicleId, vehicleId),
        eq(vehicleDamageHistory.damageZone, zone)
      )
    )
    .limit(5);

  if (!excludeClaimId) return rows.length > 0;
  return rows.some((r) => r.id !== excludeClaimId);
}

// ─── Insert ───────────────────────────────────────────────────────────────────

export interface InsertDamageHistoryParams {
  vehicleId: number;
  claimId: number;
  /** Raw component list from AI assessment. */
  damagedComponents: Array<{
    name: string;
    severity?: string | null;
    zone?: string | null;
    estimatedCost?: number | null;
  }>;
  /** Primary impact zone string from AI (may be free-text). */
  impactZoneRaw?: string | null;
  /** Impact direction from physics engine (e.g. "frontal", "rear"). */
  impactDirection?: string | null;
  /** Impact force in kN from physics engine. */
  impactForceKn?: number | null;
  /** Estimated speed at impact in km/h. */
  estimatedSpeedKmh?: number | null;
  /** Overall structural damage severity from AI. */
  structuralDamageSeverity?: string | null;
  /** Whether structural damage was detected. */
  hasStructuralDamage?: boolean;
  /** Whether airbags deployed. */
  airbagsDeployed?: boolean;
  /** AI-estimated repair cost in cents. */
  repairCostEstimateCents?: number;
  /** Fraud risk score for this incident. */
  fraudRiskScore?: number;
  tenantId?: string | null;
}

/**
 * Insert a vehicle_damage_history record after an AI assessment completes.
 * Automatically detects repeat zones and derives the primary zone from components.
 * Returns the inserted record's ID.
 */
export async function insertDamageHistory(
  params: InsertDamageHistoryParams
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const {
    vehicleId,
    claimId,
    damagedComponents,
    impactZoneRaw,
    impactDirection,
    impactForceKn,
    estimatedSpeedKmh,
    structuralDamageSeverity,
    hasStructuralDamage = false,
    airbagsDeployed = false,
    repairCostEstimateCents = 0,
    fraudRiskScore = 0,
    tenantId,
  } = params;

  // Derive zones from components
  const { primaryZone, affectedZones } = mapComponentsToZone(damagedComponents);

  // If AI provided an explicit impact zone, prefer that as the primary zone
  // unless mapComponentsToZone already determined "multiple"
  let finalZone: DamageZone = primaryZone;
  if (impactZoneRaw && primaryZone !== "multiple") {
    const aiZone = normaliseZone(impactZoneRaw);
    if (aiZone !== "unknown") finalZone = aiZone;
  }

  // Ensure the final zone is in affectedZones
  const allZones = Array.from(new Set([...affectedZones, finalZone])).filter(
    (z) => z !== "unknown"
  );

  // Detect repeat zone
  const isRepeatZone = await detectRepeatZone(vehicleId, finalZone, claimId);

  // Derive overall severity from components (take the worst)
  const severityOrder: DamageSeverity[] = ["total_loss", "severe", "moderate", "minor", "unknown"];
  let worstSeverity: DamageSeverity = "unknown";
  for (const comp of damagedComponents) {
    const s = normaliseSeverity(comp.severity);
    if (severityOrder.indexOf(s) < severityOrder.indexOf(worstSeverity)) {
      worstSeverity = s;
    }
  }
  // Override with structural damage severity if provided
  if (structuralDamageSeverity) {
    const s = normaliseSeverity(structuralDamageSeverity);
    if (s !== "unknown" && severityOrder.indexOf(s) < severityOrder.indexOf(worstSeverity)) {
      worstSeverity = s;
    }
  }

  const record: InsertVehicleDamageHistory = {
    vehicleId,
    claimId,
    damageZone: finalZone,
    damagedComponentsJson: JSON.stringify(damagedComponents),
    affectedZonesJson: JSON.stringify(allZones),
    impactDirection: impactDirection ?? null,
    impactForceKn: impactForceKn != null ? String(impactForceKn) : null,
    estimatedSpeedKmh: estimatedSpeedKmh != null ? String(estimatedSpeedKmh) : null,
    severity: worstSeverity,
    hasStructuralDamage: hasStructuralDamage ? 1 : 0,
    airbagsDeployed: airbagsDeployed ? 1 : 0,
    repairCostEstimateCents,
    fraudRiskScore,
    isRepeatZone: isRepeatZone ? 1 : 0,
    tenantId: tenantId ?? null,
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  try {
    const result = await db.insert(vehicleDamageHistory).values(record);
    const insertId = (result as any)[0]?.insertId ?? null;
    console.log(
      `[DamageHistory] Inserted record id=${insertId} for vehicle=${vehicleId} claim=${claimId} zone=${finalZone} severity=${worstSeverity} repeatZone=${isRepeatZone}`
    );
    return insertId;
  } catch (err: any) {
    console.error(`[DamageHistory] Insert failed for claim=${claimId}: ${err.message}`);
    return null;
  }
}

// ─── Repairer backfill ────────────────────────────────────────────────────────

/**
 * Backfill repairer information on a damage history record once a panel beater
 * quote is accepted. Also updates actual_repair_cost_cents.
 */
export async function backfillRepairer(params: {
  claimId: number;
  repairerId: number;
  repairerName: string;
  actualRepairCostCents?: number;
  repairDate?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const { claimId, repairerId, repairerName, actualRepairCostCents, repairDate } = params;

  await db
    .update(vehicleDamageHistory)
    .set({
      repairerId,
      repairerName,
      ...(actualRepairCostCents != null ? { actualRepairCostCents } : {}),
      ...(repairDate ? { repairDate } : {}),
      updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    })
    .where(eq(vehicleDamageHistory.claimId, claimId));

  console.log(
    `[DamageHistory] Backfilled repairer=${repairerName} (id=${repairerId}) for claim=${claimId}`
  );
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Get the full damage history for a vehicle, ordered by most recent first.
 */
export async function getDamageHistoryByVehicle(
  vehicleId: number,
  tenantId?: string
): Promise<typeof vehicleDamageHistory.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(vehicleDamageHistory.vehicleId, vehicleId)];
  if (tenantId) conditions.push(eq(vehicleDamageHistory.tenantId, tenantId));

  return db
    .select()
    .from(vehicleDamageHistory)
    .where(and(...conditions))
    .orderBy(desc(vehicleDamageHistory.createdAt));
}

/**
 * Get damage history record(s) for a specific claim.
 */
export async function getDamageHistoryByClaim(
  claimId: number
): Promise<typeof vehicleDamageHistory.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(vehicleDamageHistory)
    .where(eq(vehicleDamageHistory.claimId, claimId))
    .orderBy(desc(vehicleDamageHistory.createdAt));
}

/**
 * Get damage history records for all vehicles with a specific damage zone.
 * Useful for cross-vehicle pattern analysis.
 */
export async function getDamageHistoryByZone(
  zone: DamageZone,
  tenantId?: string,
  limit = 50
): Promise<typeof vehicleDamageHistory.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(vehicleDamageHistory.damageZone, zone)];
  if (tenantId) conditions.push(eq(vehicleDamageHistory.tenantId, tenantId));

  return db
    .select()
    .from(vehicleDamageHistory)
    .where(and(...conditions))
    .orderBy(desc(vehicleDamageHistory.createdAt))
    .limit(limit);
}

/**
 * Get all repeat-zone records (fraud signal) for a tenant.
 */
export async function getRepeatZoneRecords(
  tenantId?: string,
  limit = 100
): Promise<typeof vehicleDamageHistory.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(vehicleDamageHistory.isRepeatZone, 1)];
  if (tenantId) conditions.push(eq(vehicleDamageHistory.tenantId, tenantId));

  return db
    .select()
    .from(vehicleDamageHistory)
    .where(and(...conditions))
    .orderBy(desc(vehicleDamageHistory.createdAt))
    .limit(limit);
}
