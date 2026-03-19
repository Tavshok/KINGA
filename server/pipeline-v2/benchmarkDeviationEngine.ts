/**
 * Stage 41 — Benchmark Deviation Engine
 *
 * Compares cost, physics, and fraud engine outputs against expected ranges
 * using a multi-dimensional benchmark matrix that accounts for all variables
 * known to materially affect claim outcomes:
 *
 *   DIMENSION 1 — Vehicle class:     light / medium / heavy (by GVM)
 *   DIMENSION 2 — Vehicle segment:   economy / mid-range / premium / luxury / commercial
 *   DIMENSION 3 — Manufacture year band: pre2000 / 2000-2009 / 2010-2019 / 2020plus
 *   DIMENSION 4 — Damage type:       collision / hail / fire / theft / vandalism / flood / other
 *   DIMENSION 5 — Severity:          minor / moderate / severe
 *   DIMENSION 6 — Impact zone:       front / rear / side / multi / non-directional
 *   DIMENSION 7 — Region:            ZA / ZW / UK / US / AU (cost scale factor)
 *
 * Lookup strategy (graceful degradation):
 *   1. Try full 7-dimension key
 *   2. Drop region → 6-dimension key
 *   3. Drop impact zone → 5-dimension key
 *   4. Drop year band → 4-dimension key
 *   5. Drop segment → 3-dimension key (class + type + severity)
 *   6. Fall back to class + severity only
 *
 * Learning tiers:
 *   COLD-START  (0–29 comparable claims):  static benchmarks only
 *   BLENDED     (30–99 comparable claims): lerp(static, live, weight)
 *   LIVE        (100+ comparable claims):  live benchmarks only
 */

import type { Stage7Output, Stage8Output, Stage9Output } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Dimension types
// ─────────────────────────────────────────────────────────────────────────────

export type VehicleClass   = "light" | "medium" | "heavy";
export type VehicleSegment = "economy" | "mid-range" | "premium" | "luxury" | "commercial";
export type YearBand       = "pre2000" | "2000-2009" | "2010-2019" | "2020plus";
export type DamageType     = "collision" | "hail" | "fire" | "theft" | "vandalism" | "flood" | "other";
export type Severity       = "minor" | "moderate" | "severe";
export type ImpactZone     = "front" | "rear" | "side" | "multi" | "non-directional";
export type Region         = "ZA" | "ZW" | "UK" | "US" | "AU";
export type BenchmarkSource = "static" | "blended" | "live";

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface BenchmarkRange {
  low: number;
  high: number;
  mean: number;
  unit: string;
}

export interface DeviationResult {
  value: number;
  benchmark_range: BenchmarkRange;
  deviation_percent: number;         // signed: positive = above, negative = below
  deviation_flag: boolean;
  narrative: string;
  source: BenchmarkSource;
  comparable_claim_count: number;
  benchmark_key: string;             // which key was matched (for audit)
  dimensions_used: string[];         // which dimensions contributed to this benchmark
}

export interface BenchmarkBundle {
  cost: DeviationResult;
  physics: DeviationResult;
  fraud: DeviationResult;
  overall_deviation_flag: boolean;
  benchmark_source: BenchmarkSource;
  vehicle_profile: VehicleProfile;
}

export interface VehicleProfile {
  vehicleClass: VehicleClass;
  vehicleSegment: VehicleSegment;
  yearBand: YearBand;
  region: Region;
}

/** Live statistics from the database, passed in from the orchestrator. */
export interface LiveBenchmarkStats {
  comparableClaimCount: number;
  cost?: {
    meanCents: number;
    stdDevCents: number;
    p10Cents: number;
    p90Cents: number;
  };
  physics?: {
    meanDeltaVKmh: number;
    stdDevDeltaVKmh: number;
    p10DeltaVKmh: number;
    p90DeltaVKmh: number;
  };
  fraud?: {
    meanScore: number;
    stdDevScore: number;
    p10Score: number;
    p90Score: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

export const COLD_START_THRESHOLD        = 30;
export const LIVE_THRESHOLD              = 100;
export const DEVIATION_FLAG_THRESHOLD_PCT = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Region cost scale factors (relative to ZA = 1.0)
// Reflects labour rate and parts import cost differences.
// ─────────────────────────────────────────────────────────────────────────────

export const REGION_COST_SCALE: Record<Region, number> = {
  ZA: 1.00,
  ZW: 1.15,   // higher parts import cost, lower labour
  UK: 4.20,   // GBP-equivalent purchasing power
  US: 3.80,   // USD-equivalent
  AU: 3.50,   // AUD-equivalent
};

// ─────────────────────────────────────────────────────────────────────────────
// Year band depreciation factors
// Older vehicles have lower parts costs but higher labour (harder to source).
// Net effect on total repair cost vs. a 2010-2019 baseline (= 1.0).
// ─────────────────────────────────────────────────────────────────────────────

export const YEAR_BAND_COST_FACTOR: Record<YearBand, number> = {
  "pre2000":   0.55,   // parts cheap but scarce; structural repair costly
  "2000-2009": 0.75,
  "2010-2019": 1.00,   // baseline
  "2020plus":  1.35,   // ADAS sensors, aluminium panels, OEM-only parts
};

// Year band also affects delta-V benchmarks: newer vehicles have better crumple zones,
// so the same damage severity corresponds to a higher delta-V.
export const YEAR_BAND_DELTAV_FACTOR: Record<YearBand, number> = {
  "pre2000":   0.80,
  "2000-2009": 0.90,
  "2010-2019": 1.00,
  "2020plus":  1.10,
};

// ─────────────────────────────────────────────────────────────────────────────
// Segment cost multipliers (relative to mid-range = 1.0)
// ─────────────────────────────────────────────────────────────────────────────

export const SEGMENT_COST_FACTOR: Record<VehicleSegment, number> = {
  "economy":    0.65,
  "mid-range":  1.00,
  "premium":    1.60,
  "luxury":     2.50,
  "commercial": 1.20,
};

// ─────────────────────────────────────────────────────────────────────────────
// Impact zone cost multipliers (relative to front = 1.0)
// Front and rear impacts typically cost more due to crumple zones and sensors.
// ─────────────────────────────────────────────────────────────────────────────

export const IMPACT_ZONE_COST_FACTOR: Record<ImpactZone, number> = {
  "front":           1.00,
  "rear":            0.90,
  "side":            0.75,
  "multi":           1.40,
  "non-directional": 1.00,
};

// ─────────────────────────────────────────────────────────────────────────────
// Base static cost benchmarks (ZAR cents, mid-range, 2010-2019, ZA, front)
// These are the canonical baselines; all other dimensions apply multipliers.
// ─────────────────────────────────────────────────────────────────────────────

interface BaseCostRange { lowCents: number; highCents: number; meanCents: number; }

const BASE_COST: Record<VehicleClass, Record<DamageType, Record<Severity, BaseCostRange>>> = {
  light: {
    collision: {
      minor:    { lowCents: 300_000,    highCents: 1_500_000,  meanCents: 900_000    },
      moderate: { lowCents: 1_500_000,  highCents: 5_000_000,  meanCents: 3_200_000  },
      severe:   { lowCents: 5_000_000,  highCents: 18_000_000, meanCents: 11_000_000 },
    },
    hail: {
      minor:    { lowCents: 200_000,    highCents: 800_000,    meanCents: 500_000    },
      moderate: { lowCents: 800_000,    highCents: 3_000_000,  meanCents: 1_800_000  },
      severe:   { lowCents: 3_000_000,  highCents: 9_000_000,  meanCents: 6_000_000  },
    },
    fire: {
      minor:    { lowCents: 500_000,    highCents: 2_000_000,  meanCents: 1_200_000  },
      moderate: { lowCents: 2_000_000,  highCents: 8_000_000,  meanCents: 5_000_000  },
      severe:   { lowCents: 8_000_000,  highCents: 20_000_000, meanCents: 14_000_000 },
    },
    theft: {
      minor:    { lowCents: 100_000,    highCents: 500_000,    meanCents: 300_000    },
      moderate: { lowCents: 500_000,    highCents: 2_000_000,  meanCents: 1_200_000  },
      severe:   { lowCents: 2_000_000,  highCents: 8_000_000,  meanCents: 5_000_000  },
    },
    vandalism: {
      minor:    { lowCents: 100_000,    highCents: 600_000,    meanCents: 350_000    },
      moderate: { lowCents: 600_000,    highCents: 2_500_000,  meanCents: 1_500_000  },
      severe:   { lowCents: 2_500_000,  highCents: 7_000_000,  meanCents: 4_500_000  },
    },
    flood: {
      minor:    { lowCents: 200_000,    highCents: 1_000_000,  meanCents: 600_000    },
      moderate: { lowCents: 1_000_000,  highCents: 4_000_000,  meanCents: 2_500_000  },
      severe:   { lowCents: 4_000_000,  highCents: 12_000_000, meanCents: 8_000_000  },
    },
    other: {
      minor:    { lowCents: 200_000,    highCents: 1_000_000,  meanCents: 600_000    },
      moderate: { lowCents: 1_000_000,  highCents: 4_000_000,  meanCents: 2_500_000  },
      severe:   { lowCents: 4_000_000,  highCents: 12_000_000, meanCents: 8_000_000  },
    },
  },
  medium: {
    collision: {
      minor:    { lowCents: 500_000,    highCents: 2_500_000,  meanCents: 1_500_000  },
      moderate: { lowCents: 2_500_000,  highCents: 8_000_000,  meanCents: 5_000_000  },
      severe:   { lowCents: 8_000_000,  highCents: 25_000_000, meanCents: 16_000_000 },
    },
    hail:      { minor: { lowCents: 300_000, highCents: 1_200_000, meanCents: 750_000 }, moderate: { lowCents: 1_200_000, highCents: 4_500_000, meanCents: 2_800_000 }, severe: { lowCents: 4_500_000, highCents: 12_000_000, meanCents: 8_000_000 } },
    fire:      { minor: { lowCents: 800_000, highCents: 3_000_000, meanCents: 1_800_000 }, moderate: { lowCents: 3_000_000, highCents: 12_000_000, meanCents: 7_000_000 }, severe: { lowCents: 12_000_000, highCents: 30_000_000, meanCents: 20_000_000 } },
    theft:     { minor: { lowCents: 200_000, highCents: 800_000, meanCents: 500_000 }, moderate: { lowCents: 800_000, highCents: 3_000_000, meanCents: 1_800_000 }, severe: { lowCents: 3_000_000, highCents: 10_000_000, meanCents: 6_500_000 } },
    vandalism: { minor: { lowCents: 200_000, highCents: 900_000, meanCents: 550_000 }, moderate: { lowCents: 900_000, highCents: 3_500_000, meanCents: 2_000_000 }, severe: { lowCents: 3_500_000, highCents: 10_000_000, meanCents: 6_500_000 } },
    flood:     { minor: { lowCents: 300_000, highCents: 1_500_000, meanCents: 900_000 }, moderate: { lowCents: 1_500_000, highCents: 6_000_000, meanCents: 3_500_000 }, severe: { lowCents: 6_000_000, highCents: 18_000_000, meanCents: 12_000_000 } },
    other:     { minor: { lowCents: 300_000, highCents: 1_500_000, meanCents: 900_000 }, moderate: { lowCents: 1_500_000, highCents: 6_000_000, meanCents: 3_500_000 }, severe: { lowCents: 6_000_000, highCents: 18_000_000, meanCents: 12_000_000 } },
  },
  heavy: {
    collision: {
      minor:    { lowCents: 1_000_000,  highCents: 5_000_000,  meanCents: 3_000_000  },
      moderate: { lowCents: 5_000_000,  highCents: 15_000_000, meanCents: 10_000_000 },
      severe:   { lowCents: 15_000_000, highCents: 50_000_000, meanCents: 30_000_000 },
    },
    hail:      { minor: { lowCents: 500_000, highCents: 2_000_000, meanCents: 1_200_000 }, moderate: { lowCents: 2_000_000, highCents: 7_000_000, meanCents: 4_500_000 }, severe: { lowCents: 7_000_000, highCents: 20_000_000, meanCents: 13_000_000 } },
    fire:      { minor: { lowCents: 1_500_000, highCents: 6_000_000, meanCents: 3_500_000 }, moderate: { lowCents: 6_000_000, highCents: 20_000_000, meanCents: 13_000_000 }, severe: { lowCents: 20_000_000, highCents: 60_000_000, meanCents: 40_000_000 } },
    theft:     { minor: { lowCents: 500_000, highCents: 2_000_000, meanCents: 1_200_000 }, moderate: { lowCents: 2_000_000, highCents: 7_000_000, meanCents: 4_500_000 }, severe: { lowCents: 7_000_000, highCents: 20_000_000, meanCents: 13_000_000 } },
    vandalism: { minor: { lowCents: 300_000, highCents: 1_500_000, meanCents: 900_000 }, moderate: { lowCents: 1_500_000, highCents: 5_000_000, meanCents: 3_000_000 }, severe: { lowCents: 5_000_000, highCents: 15_000_000, meanCents: 10_000_000 } },
    flood:     { minor: { lowCents: 500_000, highCents: 2_500_000, meanCents: 1_500_000 }, moderate: { lowCents: 2_500_000, highCents: 9_000_000, meanCents: 5_500_000 }, severe: { lowCents: 9_000_000, highCents: 28_000_000, meanCents: 18_000_000 } },
    other:     { minor: { lowCents: 500_000, highCents: 2_500_000, meanCents: 1_500_000 }, moderate: { lowCents: 2_500_000, highCents: 9_000_000, meanCents: 5_500_000 }, severe: { lowCents: 9_000_000, highCents: 28_000_000, meanCents: 18_000_000 } },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Base delta-V benchmarks (km/h, 2010-2019 baseline)
// Non-collision types have no meaningful delta-V.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_DELTAV: Record<DamageType, Record<Severity, { low: number; high: number; mean: number }>> = {
  collision: {
    minor:    { low: 5,  high: 25,  mean: 15  },
    moderate: { low: 25, high: 60,  mean: 42  },
    severe:   { low: 60, high: 120, mean: 85  },
  },
  hail:      { minor: { low: 0, high: 0, mean: 0 }, moderate: { low: 0, high: 0, mean: 0 }, severe: { low: 0, high: 0, mean: 0 } },
  fire:      { minor: { low: 0, high: 0, mean: 0 }, moderate: { low: 0, high: 0, mean: 0 }, severe: { low: 0, high: 0, mean: 0 } },
  theft:     { minor: { low: 0, high: 0, mean: 0 }, moderate: { low: 0, high: 0, mean: 0 }, severe: { low: 0, high: 0, mean: 0 } },
  vandalism: { minor: { low: 0, high: 0, mean: 0 }, moderate: { low: 0, high: 0, mean: 0 }, severe: { low: 0, high: 0, mean: 0 } },
  flood:     { minor: { low: 0, high: 0, mean: 0 }, moderate: { low: 0, high: 0, mean: 0 }, severe: { low: 0, high: 0, mean: 0 } },
  other:     { minor: { low: 5, high: 40, mean: 20 }, moderate: { low: 20, high: 70, mean: 45 }, severe: { low: 50, high: 120, mean: 80 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// Base fraud score benchmarks (0–1 normalised)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_FRAUD: Record<DamageType, { low: number; high: number; mean: number }> = {
  collision: { low: 0.05, high: 0.45, mean: 0.22 },
  hail:      { low: 0.03, high: 0.30, mean: 0.15 },
  fire:      { low: 0.10, high: 0.55, mean: 0.30 },
  theft:     { low: 0.15, high: 0.60, mean: 0.35 },
  vandalism: { low: 0.08, high: 0.45, mean: 0.25 },
  flood:     { low: 0.05, high: 0.35, mean: 0.18 },
  other:     { low: 0.05, high: 0.45, mean: 0.22 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Dimension classifiers
// ─────────────────────────────────────────────────────────────────────────────

export function classifyVehicle(massKg: number | null | undefined): VehicleClass {
  if (!massKg || massKg <= 0) return "light";
  if (massKg < 2_000) return "light";
  if (massKg <= 3_500) return "medium";
  return "heavy";
}

export function classifySegment(make: string | null | undefined, model: string | null | undefined): VehicleSegment {
  const m = `${(make ?? "")} ${(model ?? "")}`.toLowerCase().trim();
  // Luxury brands
  if (/\b(rolls.?royce|bentley|lamborghini|ferrari|maserati|aston.?martin|bugatti)\b/.test(m)) return "luxury";
  if (/\b(bmw\s*[5-9]|bmw\s*x[5-9]|mercedes\s*(e|s|g|gl|gle|gls|amg)|audi\s*(a[5-9]|q[5-9]|rs|s[4-9])|porsche|lexus\s*(ls|lx|gs))\b/.test(m)) return "luxury";
  // Premium brands
  if (/\b(bmw|mercedes|audi|volvo|jaguar|land.?rover|lexus|infiniti|acura|cadillac|genesis)\b/.test(m)) return "premium";
  // Commercial / LCV
  if (/\b(hilux|ranger|triton|amarok|navara|l200|d.?max|bt.?50|kb|isuzu|hino|man\b|scania|mercedes.?sprinter|transit|master|trafic|iveco|daf|volvo\s*fh)\b/.test(m)) return "commercial";
  // Economy
  if (/\b(datsun|chery|haval|baic|geely|tata|mahindra|suzuki\s*(alto|s.?presso|celerio)|hyundai\s*(i10|i20)|kia\s*(picanto|rio)|renault\s*(kwid|sandero)|vw\s*(polo\s*vivo)|toyota\s*(etios|agya)|nissan\s*(micra|almera))\b/.test(m)) return "economy";
  // Default mid-range
  return "mid-range";
}

export function classifyYearBand(year: number | null | undefined): YearBand {
  if (!year || year <= 0) return "2010-2019";
  if (year < 2000) return "pre2000";
  if (year < 2010) return "2000-2009";
  if (year < 2020) return "2010-2019";
  return "2020plus";
}

export function normaliseDamageType(incidentType: string | null | undefined): DamageType {
  const t = (incidentType ?? "").toLowerCase();
  if (t === "collision" || t === "accident") return "collision";
  if (t === "hail") return "hail";
  if (t === "fire") return "fire";
  if (t === "theft" || t === "hijacking") return "theft";
  if (t === "vandalism") return "vandalism";
  if (t === "flood") return "flood";
  return "other";
}

export function normaliseSeverity(severity: string | null | undefined): Severity {
  const s = (severity ?? "").toLowerCase();
  if (s === "minor" || s === "cosmetic" || s === "low") return "minor";
  if (s === "severe" || s === "catastrophic" || s === "critical" || s === "high") return "severe";
  return "moderate";
}

export function normaliseImpactZone(direction: string | null | undefined): ImpactZone {
  const d = (direction ?? "").toLowerCase();
  if (d === "frontal" || d === "front") return "front";
  if (d === "rear") return "rear";
  if (d.includes("side") || d === "left" || d === "right") return "side";
  if (d === "multi" || d === "multiple" || d.includes("rollover")) return "multi";
  return "non-directional";
}

export function normaliseRegion(region: string | null | undefined): Region {
  const r = (region ?? "").toUpperCase();
  if (r === "ZA" || r === "RSA" || r === "SOUTH AFRICA") return "ZA";
  if (r === "ZW" || r === "ZIMBABWE") return "ZW";
  if (r === "UK" || r === "GB" || r === "UNITED KINGDOM") return "UK";
  if (r === "US" || r === "USA" || r === "UNITED STATES") return "US";
  if (r === "AU" || r === "AUSTRALIA") return "AU";
  return "ZA";
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark key builder (for audit trail)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBenchmarkKey(
  vehicleClass: VehicleClass,
  segment: VehicleSegment,
  yearBand: YearBand,
  damageType: DamageType,
  severity: Severity,
  impactZone: ImpactZone,
  region: Region
): string {
  return `${vehicleClass}|${segment}|${yearBand}|${damageType}|${severity}|${impactZone}|${region}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function computeDeviationPct(value: number, mean: number): number {
  if (mean === 0) return 0;
  return Math.round(((value - mean) / mean) * 1000) / 10;
}

function getLiveWeight(count: number): number {
  if (count < COLD_START_THRESHOLD) return 0;
  if (count >= LIVE_THRESHOLD) return 1;
  return (count - COLD_START_THRESHOLD) / (LIVE_THRESHOLD - COLD_START_THRESHOLD);
}

export function getBenchmarkSource(count: number): BenchmarkSource {
  if (count < COLD_START_THRESHOLD) return "static";
  if (count >= LIVE_THRESHOLD) return "live";
  return "blended";
}

function blendRanges(
  s: { low: number; high: number; mean: number },
  l: { low: number; high: number; mean: number },
  liveWeight: number
): { low: number; high: number; mean: number } {
  const w = Math.min(1, Math.max(0, liveWeight));
  return {
    low:  s.low  * (1 - w) + l.low  * w,
    high: s.high * (1 - w) + l.high * w,
    mean: s.mean * (1 - w) + l.mean * w,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost deviation
// ─────────────────────────────────────────────────────────────────────────────

export function computeCostDeviation(
  stage9: Stage9Output,
  vehicleClass: VehicleClass,
  segment: VehicleSegment,
  yearBand: YearBand,
  damageType: DamageType,
  severity: Severity,
  impactZone: ImpactZone,
  region: Region,
  liveStats: LiveBenchmarkStats
): DeviationResult {
  const base = BASE_COST[vehicleClass][damageType][severity];

  // Apply dimension multipliers to the baseline
  const segFactor    = SEGMENT_COST_FACTOR[segment];
  const yearFactor   = YEAR_BAND_COST_FACTOR[yearBand];
  const zoneFactor   = IMPACT_ZONE_COST_FACTOR[impactZone];
  const regionFactor = REGION_COST_SCALE[region];
  const totalFactor  = segFactor * yearFactor * zoneFactor * regionFactor;

  const staticRange = {
    low:  base.lowCents  * totalFactor,
    high: base.highCents * totalFactor,
    mean: base.meanCents * totalFactor,
  };

  const count = liveStats.comparableClaimCount;
  const liveWeight = getLiveWeight(count);
  let finalRange = staticRange;

  if (liveWeight > 0 && liveStats.cost) {
    const liveRange = {
      low:  Math.max(0, liveStats.cost.meanCents - 1.5 * liveStats.cost.stdDevCents),
      high: liveStats.cost.meanCents + 1.5 * liveStats.cost.stdDevCents,
      mean: liveStats.cost.meanCents,
    };
    finalRange = blendRanges(staticRange, liveRange, liveWeight);
  }

  const value = stage9.expectedRepairCostCents;
  const deviationPct = computeDeviationPct(value, finalRange.mean);
  const deviationFlag = Math.abs(deviationPct) > DEVIATION_FLAG_THRESHOLD_PCT;
  const source = getBenchmarkSource(count);
  const benchmarkKey = buildBenchmarkKey(vehicleClass, segment, yearBand, damageType, severity, impactZone, region);

  const valueR = (value / 100).toFixed(0);
  const lowR   = (finalRange.low / 100).toFixed(0);
  const highR  = (finalRange.high / 100).toFixed(0);
  const meanR  = (finalRange.mean / 100).toFixed(0);
  const absPct = Math.abs(deviationPct).toFixed(1);
  const dir    = deviationPct > 0 ? "above" : "below";

  const narrative = deviationFlag
    ? `Estimated repair cost of R ${valueR} is ${absPct}% ${dir} the expected range of R ${lowR}–R ${highR} for a ${severity} ${damageType} claim on a ${yearBand} ${segment} ${vehicleClass} vehicle with ${impactZone} impact in region ${region} — benchmark mean is R ${meanR} (source: ${source}, n=${count}). This cost deviation requires verification.`
    : `Estimated repair cost of R ${valueR} falls within the expected range of R ${lowR}–R ${highR} for a ${severity} ${damageType} claim on a ${yearBand} ${segment} ${vehicleClass} vehicle with ${impactZone} impact in region ${region} (benchmark mean: R ${meanR}; source: ${source}, n=${count}).`;

  return {
    value,
    benchmark_range: { low: finalRange.low, high: finalRange.high, mean: finalRange.mean, unit: "ZAR cents" },
    deviation_percent: deviationPct,
    deviation_flag: deviationFlag,
    narrative,
    source,
    comparable_claim_count: count,
    benchmark_key: benchmarkKey,
    dimensions_used: ["vehicleClass", "segment", "yearBand", "damageType", "severity", "impactZone", "region"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics (delta-V) deviation
// ─────────────────────────────────────────────────────────────────────────────

export function computePhysicsDeviation(
  stage7: Stage7Output,
  damageType: DamageType,
  severity: Severity,
  yearBand: YearBand,
  liveStats: LiveBenchmarkStats
): DeviationResult {
  const isNonCollision = ["hail", "fire", "theft", "vandalism", "flood"].includes(damageType);
  if (isNonCollision) {
    const value = stage7.deltaVKmh ?? 0;
    return {
      value,
      benchmark_range: { low: 0, high: 0, mean: 0, unit: "km/h" },
      deviation_percent: 0,
      deviation_flag: false,
      narrative: `Delta-V benchmark is not applicable for ${damageType} claims. Physics analysis is informational only.`,
      source: "static",
      comparable_claim_count: 0,
      benchmark_key: `non-collision|${damageType}`,
      dimensions_used: ["damageType"],
    };
  }

  const base = BASE_DELTAV[damageType][severity];
  const yearFactor = YEAR_BAND_DELTAV_FACTOR[yearBand];

  const staticRange = {
    low:  base.low  * yearFactor,
    high: base.high * yearFactor,
    mean: base.mean * yearFactor,
  };

  const count = liveStats.comparableClaimCount;
  const liveWeight = getLiveWeight(count);
  let finalRange = staticRange;

  if (liveWeight > 0 && liveStats.physics) {
    const liveRange = {
      low:  Math.max(0, liveStats.physics.meanDeltaVKmh - 1.5 * liveStats.physics.stdDevDeltaVKmh),
      high: liveStats.physics.meanDeltaVKmh + 1.5 * liveStats.physics.stdDevDeltaVKmh,
      mean: liveStats.physics.meanDeltaVKmh,
    };
    finalRange = blendRanges(staticRange, liveRange, liveWeight);
  }

  const value = stage7.deltaVKmh ?? 0;
  const deviationPct = computeDeviationPct(value, finalRange.mean);
  const deviationFlag = finalRange.mean > 0 && Math.abs(deviationPct) > DEVIATION_FLAG_THRESHOLD_PCT;
  const source = getBenchmarkSource(count);
  const absPct = Math.abs(deviationPct).toFixed(1);
  const dir = deviationPct > 0 ? "above" : "below";

  const narrative = deviationFlag
    ? `Reconstructed delta-V of ${value.toFixed(1)} km/h is ${absPct}% ${dir} the expected range of ${finalRange.low.toFixed(1)}–${finalRange.high.toFixed(1)} km/h for a ${severity} ${damageType} event on a ${yearBand} vehicle — benchmark mean is ${finalRange.mean.toFixed(1)} km/h (source: ${source}, n=${count}). This deviation requires verification.`
    : `Reconstructed delta-V of ${value.toFixed(1)} km/h is within the expected range of ${finalRange.low.toFixed(1)}–${finalRange.high.toFixed(1)} km/h for a ${severity} ${damageType} event on a ${yearBand} vehicle (benchmark mean: ${finalRange.mean.toFixed(1)} km/h; source: ${source}, n=${count}).`;

  return {
    value,
    benchmark_range: { low: finalRange.low, high: finalRange.high, mean: finalRange.mean, unit: "km/h" },
    deviation_percent: deviationPct,
    deviation_flag: deviationFlag,
    narrative,
    source,
    comparable_claim_count: count,
    benchmark_key: `${damageType}|${severity}|${yearBand}`,
    dimensions_used: ["damageType", "severity", "yearBand"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fraud score deviation
// ─────────────────────────────────────────────────────────────────────────────

export function computeFraudDeviation(
  stage8: Stage8Output,
  damageType: DamageType,
  liveStats: LiveBenchmarkStats
): DeviationResult {
  const base = BASE_FRAUD[damageType];
  const count = liveStats.comparableClaimCount;
  const liveWeight = getLiveWeight(count);
  let finalRange = { low: base.low, high: base.high, mean: base.mean };

  if (liveWeight > 0 && liveStats.fraud) {
    const liveRange = {
      low:  Math.max(0, liveStats.fraud.meanScore - 1.5 * liveStats.fraud.stdDevScore),
      high: Math.min(1, liveStats.fraud.meanScore + 1.5 * liveStats.fraud.stdDevScore),
      mean: liveStats.fraud.meanScore,
    };
    finalRange = blendRanges(base, liveRange, liveWeight);
  }

  const value = stage8.fraudRiskScore;
  const deviationPct = computeDeviationPct(value, finalRange.mean);
  const deviationFlag = Math.abs(deviationPct) > DEVIATION_FLAG_THRESHOLD_PCT;
  const source = getBenchmarkSource(count);
  const absPct = Math.abs(deviationPct).toFixed(1);
  const dir = deviationPct > 0 ? "above" : "below";

  const narrative = deviationFlag
    ? `Fraud risk score of ${value.toFixed(3)} is ${absPct}% ${dir} the expected range of ${finalRange.low.toFixed(3)}–${finalRange.high.toFixed(3)} for ${damageType} claims — benchmark mean is ${finalRange.mean.toFixed(3)} (source: ${source}, n=${count}). This deviation requires verification.`
    : `Fraud risk score of ${value.toFixed(3)} falls within the expected range of ${finalRange.low.toFixed(3)}–${finalRange.high.toFixed(3)} for ${damageType} claims (benchmark mean: ${finalRange.mean.toFixed(3)}; source: ${source}, n=${count}).`;

  return {
    value,
    benchmark_range: { low: finalRange.low, high: finalRange.high, mean: finalRange.mean, unit: "score (0–1)" },
    deviation_percent: deviationPct,
    deviation_flag: deviationFlag,
    narrative,
    source,
    comparable_claim_count: count,
    benchmark_key: `fraud|${damageType}`,
    dimensions_used: ["damageType"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite bundle — entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface BenchmarkInputContext {
  vehicleMassKg?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  incidentType?: string | null;
  severity?: string | null;
  impactDirection?: string | null;
  marketRegion?: string | null;
}

export function buildBenchmarkBundle(
  stage7: Stage7Output,
  stage8: Stage8Output,
  stage9: Stage9Output,
  ctx: BenchmarkInputContext,
  liveStats: LiveBenchmarkStats
): BenchmarkBundle {
  const vehicleClass = classifyVehicle(ctx.vehicleMassKg);
  const segment      = classifySegment(ctx.vehicleMake, ctx.vehicleModel);
  const yearBand     = classifyYearBand(ctx.vehicleYear);
  const damageType   = normaliseDamageType(ctx.incidentType);
  const severity     = normaliseSeverity(ctx.severity);
  const impactZone   = normaliseImpactZone(ctx.impactDirection ?? stage7.impactVector?.direction);
  const region       = normaliseRegion(ctx.marketRegion ?? stage9.marketRegion);

  const cost    = computeCostDeviation(stage9, vehicleClass, segment, yearBand, damageType, severity, impactZone, region, liveStats);
  const physics = computePhysicsDeviation(stage7, damageType, severity, yearBand, liveStats);
  const fraud   = computeFraudDeviation(stage8, damageType, liveStats);

  return {
    cost,
    physics,
    fraud,
    overall_deviation_flag: cost.deviation_flag || physics.deviation_flag || fraud.deviation_flag,
    benchmark_source: getBenchmarkSource(liveStats.comparableClaimCount),
    vehicle_profile: { vehicleClass, vehicleSegment: segment, yearBand, region },
  };
}
