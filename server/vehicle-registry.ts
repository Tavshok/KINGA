/**
 * Vehicle Intelligence Registry
 * ─────────────────────────────
 * Persistent vehicle records linked to claims.
 *
 * Matching priority:
 *   1. VIN (normalised: uppercase, spaces stripped)
 *   2. Registration number (normalised: uppercase, spaces stripped)
 *   3. Create new record if no match found
 *
 * After every claim assessment the registry is enriched with:
 *   - Latest vehicle identity fields (make, model, year, colour, etc.)
 *   - Inferred mass and powertrain type from the physics engine
 *   - Running aggregates (totalClaimsCount, totalRepairCostCents, lastClaimDate)
 *   - Damage zone counts per impact direction
 *   - Risk flags (isRepeatClaimer, hasSuspiciousDamagePattern)
 *   - Composite vehicleRiskScore (0–100)
 */

import { eq, or, and, sql } from "drizzle-orm";
import { vehicleRegistry, claims } from "../drizzle/schema";
import type { VehicleRegistry, InsertVehicleRegistry } from "../drizzle/schema";
import { getDb } from "./db";

// ─── Normalisation helpers ────────────────────────────────────────────────────

/** Normalise a VIN: uppercase, strip all whitespace. Returns null if blank. */
export function normaliseVin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.toUpperCase().replace(/\s+/g, "");
  return v.length >= 5 ? v : null; // reject obviously invalid stubs
}

/** Normalise a registration number: uppercase, strip all whitespace. */
export function normaliseRegistration(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const r = raw.toUpperCase().replace(/\s+/g, "");
  return r.length >= 2 ? r : null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VehicleUpsertInput {
  // Identity
  vin?: string | null;
  registrationNumber?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  engineNumber?: string | null;
  // Technical
  vehicleType?: string | null;
  engineCapacity?: string | null;
  fuelType?: string | null;
  powertrainType?: string | null;
  vehicleMassKg?: number | null;
  vehicleMassSource?: "explicit" | "inferred_model" | "inferred_class" | "not_available" | null;
  // Ownership
  currentOwnerName?: string | null;
  firstRegistrationDate?: string | null;
  licenceExpiryDate?: string | null;
  // Claim context
  claimId: number;
  repairCostCents?: number;
  impactZone?: string | null;
  tenantId?: string | null;
}

export interface VehicleRiskSummary {
  vehicleRegistryId: number;
  totalClaimsCount: number;
  vehicleRiskScore: number;
  isRepeatClaimer: boolean;
  hasSuspiciousDamagePattern: boolean;
  isSalvageTitle: boolean;
  isStolen: boolean;
  isWrittenOff: boolean;
  damageZoneCounts: Record<string, number>;
  claimIds: number[];
}

// ─── Mass source priority ─────────────────────────────────────────────────────

const MASS_SOURCE_PRIORITY: Record<string, number> = {
  explicit: 4,
  inferred_model: 3,
  inferred_class: 2,
  not_available: 1,
};

function isBetterMassSource(
  newSource: string | null | undefined,
  existingSource: string | null | undefined
): boolean {
  const newPriority = MASS_SOURCE_PRIORITY[newSource ?? "not_available"] ?? 1;
  const existingPriority = MASS_SOURCE_PRIORITY[existingSource ?? "not_available"] ?? 1;
  return newPriority > existingPriority;
}

// ─── Risk score computation ───────────────────────────────────────────────────

/**
 * Compute a composite vehicle risk score (0–100).
 *
 * Breakdown:
 *   - Claim frequency (≥5 = 30 pts, ≥3 = 20 pts, ≥2 = 10 pts)
 *   - Suspicious damage pattern (same zone claimed ≥2×): 25 pts
 *   - Salvage title: 20 pts
 *   - Stolen flag: 15 pts
 *   - Written off: 10 pts
 */
export function computeVehicleRiskScore(params: {
  totalClaimsCount: number;
  hasSuspiciousDamagePattern: boolean;
  isSalvageTitle: boolean;
  isStolen: boolean;
  isWrittenOff: boolean;
}): number {
  let score = 0;

  // Claim frequency
  if (params.totalClaimsCount >= 5) score += 30;
  else if (params.totalClaimsCount >= 3) score += 20;
  else if (params.totalClaimsCount >= 2) score += 10;

  if (params.hasSuspiciousDamagePattern) score += 25;
  if (params.isSalvageTitle) score += 20;
  if (params.isStolen) score += 15;
  if (params.isWrittenOff) score += 10;

  return Math.min(100, score);
}

// ─── Damage zone tracking ─────────────────────────────────────────────────────

/**
 * Update damage zone counts and detect suspicious patterns.
 * A suspicious pattern is when any single zone has been claimed 2+ times.
 */
export function updateDamageZoneCounts(
  existing: Record<string, number>,
  newZone: string | null | undefined
): { counts: Record<string, number>; suspicious: boolean } {
  const counts = { ...existing };

  if (newZone && newZone !== "unknown") {
    const zone = newZone.toLowerCase();
    counts[zone] = (counts[zone] ?? 0) + 1;
  }

  const suspicious = Object.values(counts).some((v) => v >= 2);
  return { counts, suspicious };
}

// ─── Core upsert function ─────────────────────────────────────────────────────

/**
 * Upsert a vehicle record in the registry.
 *
 * Returns the registry record ID and a risk summary.
 * Never throws — failures are caught and logged so the claim pipeline continues.
 */
export async function upsertVehicleRegistry(
  input: VehicleUpsertInput
): Promise<VehicleRiskSummary | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[VehicleRegistry] Database not available, skipping upsert");
    return null;
  }

  const normVin = normaliseVin(input.vin);
  const normReg = normaliseRegistration(input.registrationNumber);

  if (!normVin && !normReg) {
    console.warn(
      `[VehicleRegistry] Claim ${input.claimId}: no VIN or registration — cannot upsert`
    );
    return null;
  }

  try {
    // ── Step 1: Find existing record ─────────────────────────────────────────
    let existing: VehicleRegistry | null = null;

    if (normVin) {
      const rows = await db
        .select()
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.vin, normVin))
        .limit(1);
      if (rows.length > 0) existing = rows[0];
    }

    if (!existing && normReg) {
      const rows = await db
        .select()
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.registrationNumber, normReg))
        .limit(1);
      if (rows.length > 0) existing = rows[0];
    }

    // ── Step 2: Compute updated aggregates ───────────────────────────────────
    const prevClaimIds: number[] = existing?.claimIdsJson
      ? JSON.parse(existing.claimIdsJson)
      : [];

    // Avoid double-counting if this claim was already registered
    const isNewClaim = !prevClaimIds.includes(input.claimId);
    const newClaimIds = isNewClaim ? [...prevClaimIds, input.claimId] : prevClaimIds;
    const newTotalClaims = isNewClaim
      ? (existing?.totalClaimsCount ?? 0) + 1
      : (existing?.totalClaimsCount ?? 1);
    const newTotalRepairCost =
      (existing?.totalRepairCostCents ?? 0) + (isNewClaim ? (input.repairCostCents ?? 0) : 0);

    // Damage zone tracking
    const prevZoneCounts: Record<string, number> = existing?.damageZoneCountsJson
      ? JSON.parse(existing.damageZoneCountsJson)
      : {};
    const { counts: newZoneCounts, suspicious: newSuspicious } = isNewClaim
      ? updateDamageZoneCounts(prevZoneCounts, input.impactZone)
      : { counts: prevZoneCounts, suspicious: existing?.hasSuspiciousDamagePattern === 1 };

    // Risk flags
    const isRepeatClaimer = newTotalClaims >= 3;
    const isSalvageTitle = existing?.isSalvageTitle === 1;
    const isStolen = existing?.isStolen === 1;
    const isWrittenOff = existing?.isWrittenOff === 1;

    const vehicleRiskScore = computeVehicleRiskScore({
      totalClaimsCount: newTotalClaims,
      hasSuspiciousDamagePattern: newSuspicious,
      isSalvageTitle,
      isStolen,
      isWrittenOff,
    });

    // ── Step 3: Determine which identity fields to write ─────────────────────
    // Only overwrite existing non-null fields if the new value is non-null.
    // VIN: never overwrite an existing VIN with a different non-null value
    //      (could indicate a VIN swap fraud attempt).
    const shouldUpdateVin =
      normVin !== null &&
      (existing?.vin === null || existing?.vin === undefined || existing?.vin === normVin);

    // Mass: only update if the new source has higher priority
    const shouldUpdateMass =
      input.vehicleMassKg != null &&
      isBetterMassSource(input.vehicleMassSource, existing?.vehicleMassSource);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    // ── Step 4: Insert or update ──────────────────────────────────────────────
    let registryId: number;

    if (!existing) {
      // INSERT new record
      const insertData: InsertVehicleRegistry = {
        vin: shouldUpdateVin ? normVin : null,
        registrationNumber: normReg,
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        color: input.color ?? null,
        engineNumber: input.engineNumber ?? null,
        vehicleType: (input.vehicleType as any) ?? null,
        engineCapacity: input.engineCapacity ?? null,
        fuelType: (input.fuelType as any) ?? null,
        powertrainType: (input.powertrainType as any) ?? null,
        vehicleMassKg: input.vehicleMassKg ?? null,
        vehicleMassSource: (input.vehicleMassSource as any) ?? "not_available",
        currentOwnerName: input.currentOwnerName ?? null,
        firstRegistrationDate: input.firstRegistrationDate ?? null,
        licenceExpiryDate: input.licenceExpiryDate ?? null,
        totalClaimsCount: newTotalClaims,
        totalRepairCostCents: newTotalRepairCost,
        lastClaimDate: now,
        claimIdsJson: JSON.stringify(newClaimIds),
        damageZoneCountsJson: JSON.stringify(newZoneCounts),
        hasSuspiciousDamagePattern: newSuspicious ? 1 : 0,
        isRepeatClaimer: isRepeatClaimer ? 1 : 0,
        isSalvageTitle: 0,
        isStolen: 0,
        isWrittenOff: 0,
        vehicleRiskScore,
        tenantId: input.tenantId ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.insert(vehicleRegistry).values(insertData);
      registryId = (result as any)[0]?.insertId ?? 0;

      console.log(
        `[VehicleRegistry] Created new record id=${registryId} for ${normVin ?? normReg}`
      );
    } else {
      // UPDATE existing record
      registryId = existing.id;

      const updateData: Partial<InsertVehicleRegistry> = {
        // Identity: only fill in missing fields
        ...(shouldUpdateVin && { vin: normVin }),
        ...(normReg && !existing.registrationNumber && { registrationNumber: normReg }),
        ...(input.make && !existing.make && { make: input.make }),
        ...(input.model && !existing.model && { model: input.model }),
        ...(input.year && !existing.year && { year: input.year }),
        ...(input.color && !existing.color && { color: input.color }),
        ...(input.engineNumber && !existing.engineNumber && { engineNumber: input.engineNumber }),
        ...(input.vehicleType && !existing.vehicleType && { vehicleType: input.vehicleType as any }),
        ...(input.engineCapacity && !existing.engineCapacity && { engineCapacity: input.engineCapacity }),
        ...(input.fuelType && !existing.fuelType && { fuelType: input.fuelType as any }),
        ...(input.powertrainType && !existing.powertrainType && { powertrainType: input.powertrainType as any }),
        ...(shouldUpdateMass && {
          vehicleMassKg: input.vehicleMassKg,
          vehicleMassSource: input.vehicleMassSource as any,
        }),
        ...(input.currentOwnerName && { currentOwnerName: input.currentOwnerName }),
        ...(input.firstRegistrationDate && !existing.firstRegistrationDate && {
          firstRegistrationDate: input.firstRegistrationDate,
        }),
        ...(input.licenceExpiryDate && { licenceExpiryDate: input.licenceExpiryDate }),
        // Aggregates: always update
        totalClaimsCount: newTotalClaims,
        totalRepairCostCents: newTotalRepairCost,
        lastClaimDate: now,
        claimIdsJson: JSON.stringify(newClaimIds),
        damageZoneCountsJson: JSON.stringify(newZoneCounts),
        hasSuspiciousDamagePattern: newSuspicious ? 1 : 0,
        isRepeatClaimer: isRepeatClaimer ? 1 : 0,
        vehicleRiskScore,
        lastSeenAt: now,
        updatedAt: now,
      };

      await db
        .update(vehicleRegistry)
        .set(updateData)
        .where(eq(vehicleRegistry.id, existing.id));

      console.log(
        `[VehicleRegistry] Updated record id=${registryId} for ${normVin ?? normReg} (claims: ${newTotalClaims}, riskScore: ${vehicleRiskScore})`
      );
    }

    return {
      vehicleRegistryId: registryId,
      totalClaimsCount: newTotalClaims,
      vehicleRiskScore,
      isRepeatClaimer,
      hasSuspiciousDamagePattern: newSuspicious,
      isSalvageTitle,
      isStolen,
      isWrittenOff,
      damageZoneCounts: newZoneCounts,
      claimIds: newClaimIds,
    };
  } catch (err: any) {
    console.error(`[VehicleRegistry] Upsert failed for claim ${input.claimId}: ${err.message}`);
    return null;
  }
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Get a vehicle registry record by ID. */
export async function getVehicleRegistryById(
  id: number
): Promise<VehicleRegistry | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(vehicleRegistry)
    .where(eq(vehicleRegistry.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Get a vehicle registry record by VIN or registration number. */
export async function findVehicleRegistry(
  vin?: string | null,
  registration?: string | null
): Promise<VehicleRegistry | null> {
  const db = await getDb();
  if (!db) return null;

  const normVin = normaliseVin(vin);
  const normReg = normaliseRegistration(registration);

  if (!normVin && !normReg) return null;

  const conditions = [];
  if (normVin) conditions.push(eq(vehicleRegistry.vin, normVin));
  if (normReg) conditions.push(eq(vehicleRegistry.registrationNumber, normReg));

  const rows = await db
    .select()
    .from(vehicleRegistry)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

/** Get all claims for a vehicle registry record. */
export async function getVehicleClaimHistory(
  vehicleRegistryId: number,
  tenantId?: string
): Promise<Array<{ id: number; claimNumber: string; incidentDate: string | null; status: string; fraudRiskScore: number | null; vehicleRegistration: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(
        eq(claims.vehicleRegistryId, vehicleRegistryId),
        eq(claims.tenantId, tenantId)
      )
    : eq(claims.vehicleRegistryId, vehicleRegistryId);

  const rows = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      incidentDate: claims.incidentDate,
      status: claims.status,
      fraudRiskScore: claims.fraudRiskScore,
      vehicleRegistration: claims.vehicleRegistration,
    })
    .from(claims)
    .where(conditions)
    .orderBy(sql`${claims.createdAt} DESC`);

  return rows;
}

/** List all vehicles in the registry for a tenant, sorted by risk score descending. */
export async function listVehicleRegistry(
  tenantId?: string,
  limit = 50,
  offset = 0
): Promise<VehicleRegistry[]> {
  const db = await getDb();
  if (!db) return [];

  const condition = tenantId
    ? eq(vehicleRegistry.tenantId, tenantId)
    : undefined;

  const rows = await db
    .select()
    .from(vehicleRegistry)
    .where(condition)
    .orderBy(sql`${vehicleRegistry.vehicleRiskScore} DESC`)
    .limit(limit)
    .offset(offset);

  return rows;
}

/** List high-risk vehicles (riskScore ≥ threshold) for a tenant. */
export async function listHighRiskVehicles(
  tenantId?: string,
  minRiskScore = 25
): Promise<VehicleRegistry[]> {
  const db = await getDb();
  if (!db) return [];

  const condition = tenantId
    ? and(
        eq(vehicleRegistry.tenantId, tenantId),
        sql`${vehicleRegistry.vehicleRiskScore} >= ${minRiskScore}`
      )
    : sql`${vehicleRegistry.vehicleRiskScore} >= ${minRiskScore}`;

  const rows = await db
    .select()
    .from(vehicleRegistry)
    .where(condition)
    .orderBy(sql`${vehicleRegistry.vehicleRiskScore} DESC`)
    .limit(100);

  return rows;
}
