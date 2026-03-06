/**
 * Cross-Claim Intelligence Engine
 * ─────────────────────────────────
 * Detects fraud patterns by querying vehicle, driver, repair, and damage
 * history tables after every AI assessment completes.
 *
 * Signal types (9 total):
 *   1. repeat_damage_signal              — same component damaged again within 12 months
 *   2. driver_repeat_claim_signal        — driver appears in multiple claims within 90 days
 *   3. repairer_repeat_pattern_signal    — same repairer involved with same vehicle repeatedly
 *   4. vehicle_high_claim_frequency      — vehicle has ≥3 claims in 12 months
 *   5. damage_zone_repeat_signal         — same damage zone claimed again within 12 months
 *   6. staged_accident_signal            — driver + vehicle + repairer appear together in ≥2 claims
 *   7. repairer_driver_collusion_signal  — same repairer + same driver in ≥3 claims (any vehicle)
 *   8. claim_velocity_signal             — new claim filed within 30 days of a previous claim
 *   9. total_loss_repeat_signal          — vehicle previously flagged as total loss
 *
 * All signals are idempotent (unique on claim_id + signal_type).
 * The engine is designed to run non-blocking after the pipeline completes.
 *
 * Exported pure functions (no DB deps) are exported for unit testing.
 */

import { getDb } from "./db";
import {
  crossClaimSignals,
  vehicleRegistry,
  vehicleDamageHistory,
  drivers,
  driverClaims,
  repairHistory,
  claims,
} from "../drizzle/schema";
import { eq, and, sql, ne } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalType =
  | 'repeat_damage_signal'
  | 'driver_repeat_claim_signal'
  | 'repairer_repeat_pattern_signal'
  | 'vehicle_high_claim_frequency'
  | 'damage_zone_repeat_signal'
  | 'staged_accident_signal'
  | 'repairer_driver_collusion_signal'
  | 'claim_velocity_signal'
  | 'total_loss_repeat_signal';

export interface DetectedSignal {
  signalType: SignalType;
  signalLabel: string;
  confidence: 'low' | 'medium' | 'high';
  scoreContribution: number;
  evidence: Record<string, unknown>;
}

export interface CrossClaimResult {
  claimId: number;
  signals: DetectedSignal[];
  totalScoreContribution: number;
  highestConfidence: 'low' | 'medium' | 'high' | null;
}

// ─── Score weights per signal type ───────────────────────────────────────────

export const SIGNAL_WEIGHTS: Record<SignalType, { low: number; medium: number; high: number }> = {
  repeat_damage_signal:             { low: 5,  medium: 10, high: 15 },
  driver_repeat_claim_signal:       { low: 5,  medium: 10, high: 15 },
  repairer_repeat_pattern_signal:   { low: 3,  medium: 7,  high: 12 },
  vehicle_high_claim_frequency:     { low: 5,  medium: 12, high: 20 },
  damage_zone_repeat_signal:        { low: 4,  medium: 8,  high: 13 },
  staged_accident_signal:           { low: 8,  medium: 15, high: 25 },
  repairer_driver_collusion_signal: { low: 7,  medium: 14, high: 22 },
  claim_velocity_signal:            { low: 5,  medium: 10, high: 18 },
  total_loss_repeat_signal:         { low: 10, medium: 20, high: 30 },
};

// ─── Pure helpers (exported for unit testing) ─────────────────────────────────

/**
 * Derive confidence level from occurrence count.
 */
export function deriveConfidence(occurrences: number): 'low' | 'medium' | 'high' {
  if (occurrences >= 4) return 'high';
  if (occurrences >= 2) return 'medium';
  return 'low';
}

/**
 * Compute score contribution for a signal given its confidence.
 */
export function computeScoreContribution(
  signalType: SignalType,
  confidence: 'low' | 'medium' | 'high'
): number {
  return SIGNAL_WEIGHTS[signalType][confidence];
}

/**
 * Determine the highest confidence level from a list of signals.
 */
export function highestConfidence(
  signals: DetectedSignal[]
): 'low' | 'medium' | 'high' | null {
  if (signals.length === 0) return null;
  if (signals.some(s => s.confidence === 'high')) return 'high';
  if (signals.some(s => s.confidence === 'medium')) return 'medium';
  return 'low';
}

/**
 * Sum score contributions from a list of signals, capped at 100.
 */
export function sumScoreContributions(signals: DetectedSignal[]): number {
  const total = signals.reduce((acc, s) => acc + s.scoreContribution, 0);
  return Math.min(100, total);
}

/**
 * Parse a date string to a UTC timestamp in milliseconds.
 * Returns null if the string is invalid.
 */
export function parseDateMs(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const ms = Date.parse(dateStr);
  return isNaN(ms) ? null : ms;
}

/**
 * Check if two dates are within N days of each other.
 */
export function withinDays(
  dateA: string | null | undefined,
  dateB: string | null | undefined,
  days: number
): boolean {
  const msA = parseDateMs(dateA);
  const msB = parseDateMs(dateB);
  if (msA === null || msB === null) return false;
  return Math.abs(msA - msB) <= days * 24 * 60 * 60 * 1000;
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export interface RunCrossClaimInput {
  claimId: number;
  vehicleRegistryId?: number | null;
  driverRegistryId?: number | null;
  thirdPartyDriverRegistryId?: number | null;
  claimantId?: number | null;
  tenantId?: string | null;
  claimCreatedAt?: string | null;
  incidentDate?: string | null;
}

/**
 * Run all 9 cross-claim signal detectors for a given claim.
 * Persists detected signals to cross_claim_signals (idempotent upsert).
 * Returns the full result including signals and composite score contribution.
 */
export async function runCrossClaimIntelligence(
  input: RunCrossClaimInput
): Promise<CrossClaimResult> {
  const db = await getDb();
  if (!db) {
    return { claimId: input.claimId, signals: [], totalScoreContribution: 0, highestConfidence: null };
  }

  const detected: DetectedSignal[] = [];

  // ── 1. Repeat damage signal ────────────────────────────────────────────────
  if (input.vehicleRegistryId) {
    try {
      const repeatDamage = await db
        .select({
          damagedComponentsJson: vehicleDamageHistory.damagedComponentsJson,
          claimId: vehicleDamageHistory.claimId,
          createdAt: vehicleDamageHistory.createdAt,
        })
        .from(vehicleDamageHistory)
        .where(
          and(
            eq(vehicleDamageHistory.vehicleId, input.vehicleRegistryId),
            ne(vehicleDamageHistory.claimId, input.claimId),
            sql`created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`
          )
        )
        .limit(20);

      // Get current claim's damaged components
      const [currentDmg] = await db
        .select({ damagedComponentsJson: vehicleDamageHistory.damagedComponentsJson })
        .from(vehicleDamageHistory)
        .where(eq(vehicleDamageHistory.claimId, input.claimId))
        .limit(1);

      if (currentDmg?.damagedComponentsJson && repeatDamage.length > 0) {
        let currentComponents: string[] = [];
        try {
          const parsed = JSON.parse(currentDmg.damagedComponentsJson);
          currentComponents = Array.isArray(parsed)
            ? parsed.map((c: any) => (typeof c === 'string' ? c : c?.name || '').toLowerCase())
            : [];
        } catch { /* ignore */ }

        const matchingClaims: number[] = [];
        for (const prev of repeatDamage) {
          try {
            const prevComponents: string[] = JSON.parse(prev.damagedComponentsJson || '[]')
              .map((c: any) => (typeof c === 'string' ? c : c?.name || '').toLowerCase());
            const overlap = currentComponents.filter(c => prevComponents.includes(c));
            if (overlap.length > 0) matchingClaims.push(prev.claimId);
          } catch { /* ignore */ }
        }

        if (matchingClaims.length > 0) {
          const confidence = deriveConfidence(matchingClaims.length + 1);
          detected.push({
            signalType: 'repeat_damage_signal',
            signalLabel: `Same components damaged again within 12 months (${matchingClaims.length} prior claim${matchingClaims.length > 1 ? 's' : ''})`,
            confidence,
            scoreContribution: computeScoreContribution('repeat_damage_signal', confidence),
            evidence: { priorClaimIds: matchingClaims, occurrences: matchingClaims.length + 1 },
          });
        }
      }
    } catch (err: any) {
      console.warn('[CrossClaim] repeat_damage_signal check failed:', err.message);
    }
  }

  // ── 2. Driver repeat claim signal ─────────────────────────────────────────
  if (input.driverRegistryId) {
    try {
      const recentDriverClaims = await db
        .select({ claimId: driverClaims.claimId, createdAt: driverClaims.createdAt })
        .from(driverClaims)
        .where(
          and(
            eq(driverClaims.driverId, input.driverRegistryId),
            ne(driverClaims.claimId, input.claimId),
            sql`created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`
          )
        )
        .limit(20);

      if (recentDriverClaims.length > 0) {
        const confidence = deriveConfidence(recentDriverClaims.length + 1);
        detected.push({
          signalType: 'driver_repeat_claim_signal',
          signalLabel: `Driver appeared in ${recentDriverClaims.length} other claim${recentDriverClaims.length > 1 ? 's' : ''} within 90 days`,
          confidence,
          scoreContribution: computeScoreContribution('driver_repeat_claim_signal', confidence),
          evidence: { driverId: input.driverRegistryId, priorClaimIds: recentDriverClaims.map(r => r.claimId), occurrences: recentDriverClaims.length + 1 },
        });
      }
    } catch (err: any) {
      console.warn('[CrossClaim] driver_repeat_claim_signal check failed:', err.message);
    }
  }

  // ── 3. Repairer repeat pattern signal ─────────────────────────────────────
  if (input.vehicleRegistryId) {
    try {
      const repairerPatterns = await db
        .select({
          repairerId: repairHistory.repairerId,
          repairCount: sql<number>`COUNT(*)`,
        })
        .from(repairHistory)
        .where(
          and(
            eq(repairHistory.vehicleId, input.vehicleRegistryId),
            ne(repairHistory.claimId, input.claimId)
          )
        )
        .groupBy(repairHistory.repairerId)
        .having(sql`COUNT(*) >= 2`)
        .limit(5);

      if (repairerPatterns.length > 0) {
        const maxCount = Math.max(...repairerPatterns.map(r => r.repairCount));
        const confidence = deriveConfidence(maxCount + 1);
        detected.push({
          signalType: 'repairer_repeat_pattern_signal',
          signalLabel: `Same repairer involved in ${maxCount} prior repair${maxCount > 1 ? 's' : ''} on this vehicle`,
          confidence,
          scoreContribution: computeScoreContribution('repairer_repeat_pattern_signal', confidence),
          evidence: { vehicleId: input.vehicleRegistryId, repairerPatterns },
        });
      }
    } catch (err: any) {
      console.warn('[CrossClaim] repairer_repeat_pattern_signal check failed:', err.message);
    }
  }

  // ── 4. Vehicle high claim frequency ───────────────────────────────────────
  if (input.vehicleRegistryId) {
    try {
      const [vehicleRec] = await db
        .select({ totalClaimsCount: vehicleRegistry.totalClaimsCount })
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.id, input.vehicleRegistryId))
        .limit(1);

      if (vehicleRec && vehicleRec.totalClaimsCount >= 3) {
        const confidence = deriveConfidence(vehicleRec.totalClaimsCount);
        detected.push({
          signalType: 'vehicle_high_claim_frequency',
          signalLabel: `Vehicle has ${vehicleRec.totalClaimsCount} claims on record (threshold: 3)`,
          confidence,
          scoreContribution: computeScoreContribution('vehicle_high_claim_frequency', confidence),
          evidence: { vehicleId: input.vehicleRegistryId, totalClaimsCount: vehicleRec.totalClaimsCount },
        });
      }
    } catch (err: any) {
      console.warn('[CrossClaim] vehicle_high_claim_frequency check failed:', err.message);
    }
  }

  // ── 5. Damage zone repeat signal ──────────────────────────────────────────
  if (input.vehicleRegistryId) {
    try {
        const [currentZoneRec] = await db
        .select({ damageZone: vehicleDamageHistory.damageZone, affectedZonesJson: vehicleDamageHistory.affectedZonesJson })
        .from(vehicleDamageHistory)
        .where(eq(vehicleDamageHistory.claimId, input.claimId))
        .limit(1);

      if (currentZoneRec?.damageZone && currentZoneRec.damageZone !== 'unknown') {
        const priorZoneMatches = await db
          .select({ claimId: vehicleDamageHistory.claimId, damageZone: vehicleDamageHistory.damageZone })
          .from(vehicleDamageHistory)
          .where(
            and(
              eq(vehicleDamageHistory.vehicleId, input.vehicleRegistryId),
              eq(vehicleDamageHistory.damageZone, currentZoneRec.damageZone),
              ne(vehicleDamageHistory.claimId, input.claimId),
              sql`created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`
            )
          )
          .limit(10);

        if (priorZoneMatches.length > 0) {
          const confidence = deriveConfidence(priorZoneMatches.length + 1);
          detected.push({
            signalType: 'damage_zone_repeat_signal',
            signalLabel: `${currentZoneRec.damageZone} zone damaged again within 12 months (${priorZoneMatches.length} prior occurrence${priorZoneMatches.length > 1 ? 's' : ''})`,
            confidence,
            scoreContribution: computeScoreContribution('damage_zone_repeat_signal', confidence),
            evidence: { zone: currentZoneRec.damageZone, priorClaimIds: priorZoneMatches.map(r => r.claimId), occurrences: priorZoneMatches.length + 1 },
          });
        }
      }
    } catch (err: any) {
      console.warn('[CrossClaim] damage_zone_repeat_signal check failed:', err.message);
    }
  }

  // ── 6. Staged accident signal ─────────────────────────────────────────────
  // Driver + vehicle + repairer all appear together in ≥2 claims
  if (input.vehicleRegistryId && input.driverRegistryId) {
    try {
      // Find claims where this driver appeared AND this vehicle was involved
      const driverVehicleClaims = await db
        .select({ claimId: driverClaims.claimId })
        .from(driverClaims)
        .innerJoin(claims, eq(claims.id, driverClaims.claimId))
        .where(
          and(
            eq(driverClaims.driverId, input.driverRegistryId),
            eq(claims.vehicleRegistryId, input.vehicleRegistryId),
            ne(driverClaims.claimId, input.claimId)
          )
        )
        .limit(10);

      if (driverVehicleClaims.length >= 1) {
        // Check if same repairer was used in those claims
        const priorClaimIds = driverVehicleClaims.map(r => r.claimId);
        const repairerOverlap = await db
          .select({ repairerId: repairHistory.repairerId, repairCount: sql<number>`COUNT(*)` })
          .from(repairHistory)
          .where(sql`claim_id IN (${sql.join(priorClaimIds.map(id => sql`${id}`), sql`, `)})`)
          .groupBy(repairHistory.repairerId)
          .limit(5);

        const confidence = repairerOverlap.length > 0
          ? deriveConfidence(driverVehicleClaims.length + 2)
          : deriveConfidence(driverVehicleClaims.length + 1);

        detected.push({
          signalType: 'staged_accident_signal',
          signalLabel: `Driver and vehicle appeared together in ${driverVehicleClaims.length} prior claim${driverVehicleClaims.length > 1 ? 's' : ''}${repairerOverlap.length > 0 ? ' with same repairer' : ''}`,
          confidence,
          scoreContribution: computeScoreContribution('staged_accident_signal', confidence),
          evidence: { driverId: input.driverRegistryId, vehicleId: input.vehicleRegistryId, priorClaimIds, repairerOverlap },
        });
      }
    } catch (err: any) {
      console.warn('[CrossClaim] staged_accident_signal check failed:', err.message);
    }
  }

  // ── 7. Repairer-driver collusion signal ───────────────────────────────────
  // Same repairer + same driver in ≥3 claims (any vehicle)
  if (input.driverRegistryId) {
    try {
      // Get claims this driver was involved in
      const allDriverClaimIds = await db
        .select({ claimId: driverClaims.claimId })
        .from(driverClaims)
        .where(
          and(
            eq(driverClaims.driverId, input.driverRegistryId),
            ne(driverClaims.claimId, input.claimId)
          )
        )
        .limit(50);

      if (allDriverClaimIds.length >= 2) {
        const claimIds = allDriverClaimIds.map(r => r.claimId);
        const repairerCounts = await db
          .select({ repairerId: repairHistory.repairerId, count: sql<number>`COUNT(*)` })
          .from(repairHistory)
          .where(sql`claim_id IN (${sql.join(claimIds.map(id => sql`${id}`), sql`, `)})`)
          .groupBy(repairHistory.repairerId)
          .having(sql`COUNT(*) >= 2`)
          .limit(5);

        if (repairerCounts.length > 0) {
          const maxCount = Math.max(...repairerCounts.map(r => r.count));
          const confidence = deriveConfidence(maxCount + 1);
          detected.push({
            signalType: 'repairer_driver_collusion_signal',
            signalLabel: `Same repairer used by this driver in ${maxCount} prior claim${maxCount > 1 ? 's' : ''} (possible collusion ring)`,
            confidence,
            scoreContribution: computeScoreContribution('repairer_driver_collusion_signal', confidence),
            evidence: { driverId: input.driverRegistryId, repairerCounts },
          });
        }
      }
    } catch (err: any) {
      console.warn('[CrossClaim] repairer_driver_collusion_signal check failed:', err.message);
    }
  }

  // ── 8. Claim velocity signal ──────────────────────────────────────────────
  // New claim filed within 30 days of a previous claim by same claimant/driver
  if (input.claimantId || input.driverRegistryId) {
    try {
      let recentClaims: { id: number; createdAt: string }[] = [];

      if (input.claimantId) {
        recentClaims = await db
          .select({ id: claims.id, createdAt: claims.createdAt })
          .from(claims)
          .where(
            and(
              eq(claims.claimantId, input.claimantId),
              ne(claims.id, input.claimId),
              sql`created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
            )
          )
          .limit(10);
      }

      if (recentClaims.length === 0 && input.driverRegistryId) {
        const driverRecentClaims = await db
          .select({ claimId: driverClaims.claimId, createdAt: driverClaims.createdAt })
          .from(driverClaims)
          .where(
            and(
              eq(driverClaims.driverId, input.driverRegistryId),
              ne(driverClaims.claimId, input.claimId),
              sql`created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
            )
          )
          .limit(10);
        recentClaims = driverRecentClaims.map(r => ({ id: r.claimId, createdAt: r.createdAt! }));
      }

      if (recentClaims.length > 0) {
        const confidence = deriveConfidence(recentClaims.length + 1);
        detected.push({
          signalType: 'claim_velocity_signal',
          signalLabel: `${recentClaims.length} other claim${recentClaims.length > 1 ? 's' : ''} filed within 30 days by same claimant/driver`,
          confidence,
          scoreContribution: computeScoreContribution('claim_velocity_signal', confidence),
          evidence: { priorClaimIds: recentClaims.map(r => r.id), occurrences: recentClaims.length + 1 },
        });
      }
    } catch (err: any) {
      console.warn('[CrossClaim] claim_velocity_signal check failed:', err.message);
    }
  }

  // ── 9. Total loss repeat signal ───────────────────────────────────────────
  if (input.vehicleRegistryId) {
    try {
      const [vehicleRec] = await db
        .select({ isSalvageTitle: vehicleRegistry.isSalvageTitle, isStolen: vehicleRegistry.isStolen })
        .from(vehicleRegistry)
        .where(eq(vehicleRegistry.id, input.vehicleRegistryId))
        .limit(1);

      if (vehicleRec?.isSalvageTitle) {
        detected.push({
          signalType: 'total_loss_repeat_signal',
          signalLabel: 'Vehicle was previously flagged as salvage/total loss but appears in a new claim',
          confidence: 'high',
          scoreContribution: computeScoreContribution('total_loss_repeat_signal', 'high'),
          evidence: { vehicleId: input.vehicleRegistryId, isSalvageTitle: true },
        });
      } else if (vehicleRec?.isStolen) {
        detected.push({
          signalType: 'total_loss_repeat_signal',
          signalLabel: 'Vehicle is flagged as stolen in the registry',
          confidence: 'high',
          scoreContribution: computeScoreContribution('total_loss_repeat_signal', 'high'),
          evidence: { vehicleId: input.vehicleRegistryId, isStolen: true },
        });
      }
    } catch (err: any) {
      console.warn('[CrossClaim] total_loss_repeat_signal check failed:', err.message);
    }
  }

  // ── Persist signals (idempotent upsert) ───────────────────────────────────
  for (const signal of detected) {
    try {
      await db
        .insert(crossClaimSignals)
        .values({
          claimId: input.claimId,
          signalType: signal.signalType,
          signalLabel: signal.signalLabel,
          confidence: signal.confidence,
          scoreContribution: signal.scoreContribution,
          evidenceJson: JSON.stringify(signal.evidence),
          tenantId: input.tenantId || null,
        })
        .onDuplicateKeyUpdate({
          set: {
            signalLabel: signal.signalLabel,
            confidence: signal.confidence,
            scoreContribution: signal.scoreContribution,
            evidenceJson: JSON.stringify(signal.evidence),
            updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          },
        });
    } catch (persistErr: any) {
      console.warn(`[CrossClaim] Failed to persist signal ${signal.signalType}:`, persistErr.message);
    }
  }

  const totalScoreContribution = sumScoreContributions(detected);
  const topConfidence = highestConfidence(detected);

  console.log(
    `[CrossClaim] Claim ${input.claimId}: ${detected.length} signal(s) detected, ` +
    `total score contribution: +${totalScoreContribution}`
  );

  return {
    claimId: input.claimId,
    signals: detected,
    totalScoreContribution,
    highestConfidence: topConfidence,
  };
}

/**
 * Fetch all cross-claim signals for a given claim.
 */
export async function getSignalsForClaim(claimId: number): Promise<CrossClaimSignal[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(crossClaimSignals)
    .where(eq(crossClaimSignals.claimId, claimId))
    .orderBy(crossClaimSignals.scoreContribution);
}

// Import type for return value
import type { CrossClaimSignal } from "../drizzle/schema";
