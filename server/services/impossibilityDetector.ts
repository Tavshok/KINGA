/**
 * KINGA Impossibility Detection Engine
 *
 * Deterministic, rule-based detection of logical, temporal, and physical
 * impossibilities that a senior insurance adjuster would flag on first review.
 *
 * Each rule is self-contained, independently testable, and produces a typed
 * ImpossibilityFlag. The engine is intentionally conservative — it only fires
 * when the data is unambiguous. Borderline cases are left to the fraud scoring
 * engine's probabilistic rules.
 *
 * Rules implemented:
 *   T1 — Vehicle pre-existence       (incident year < vehicle manufacture year)
 *   T2 — Future incident date        (incident date > today)
 *   T3 — Claim submitted before incident (submission timestamp < incident date)
 *   P2 — Odometer impossibility      (km/year > 200,000)
 *   P3 — Repair cost exceeds market value × 1.5
 *   I2 — Duplicate registration + date window (≤7 days apart)
 */

export type ImpossibilityClass = "TEMPORAL" | "PHYSICAL" | "IDENTITY" | "LOGICAL";
export type ImpossibilitySeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface ImpossibilityFlag {
  /** Short rule code, e.g. "T1", "P2" */
  code: string;
  /** Broad category */
  class: ImpossibilityClass;
  /** How serious this is */
  severity: ImpossibilitySeverity;
  /** One-line human-readable title */
  title: string;
  /** Full explanation suitable for display in the adjuster UI */
  detail: string;
  /** Fraud score contribution in points (added on top of weighted fraud score) */
  fraudPoints: number;
}

export interface ImpossibilityInput {
  /** ISO date string of the incident */
  incidentDate: string | null;
  /** Unix ms timestamp of when the claim was submitted to the system */
  submittedAt: number | null;
  /** Vehicle manufacture year (integer) */
  vehicleYear: number | null;
  /** Odometer reading in km at time of claim (integer) */
  vehicleMileageKm: number | null;
  /** Quoted repair cost in the claim's currency (dollars/local unit) */
  quotedRepairCost: number | null;
  /** Vehicle market value in the same currency unit */
  vehicleMarketValue: number | null;
  /** Vehicle registration plate string */
  vehicleRegistration: string | null;
  /** For I2: list of other active claims with the same registration.
   *  Each entry is { claimId: number, incidentDate: string, claimNumber: string } */
  otherClaimsForRegistration?: Array<{
    claimId: number;
    claimNumber: string;
    incidentDate: string;
  }>;
}

/**
 * Run all impossibility rules against the provided claim data.
 * Returns only the flags that fired (empty array = no impossibilities detected).
 */
export function detectImpossibilities(input: ImpossibilityInput): ImpossibilityFlag[] {
  const flags: ImpossibilityFlag[] = [];

  // ── T1: Vehicle pre-existence ────────────────────────────────────────────────
  if (input.incidentDate && input.vehicleYear) {
    const incidentYear = new Date(input.incidentDate).getFullYear();
    if (!isNaN(incidentYear) && incidentYear < input.vehicleYear) {
      flags.push({
        code: "T1",
        class: "TEMPORAL",
        severity: "CRITICAL",
        title: "Incident predates vehicle manufacture",
        detail: `The incident date (${incidentYear}) is before the vehicle's manufacture year (${input.vehicleYear}). A ${input.vehicleYear} model vehicle could not have been involved in an incident in ${incidentYear}. This is a critical data integrity failure — the incident date must be verified and corrected before this claim can be processed.`,
        fraudPoints: 35,
      });
    }
  }

  // ── T2: Future incident date ─────────────────────────────────────────────────
  if (input.incidentDate) {
    const incidentDate = new Date(input.incidentDate);
    const now = new Date();
    // Allow up to 24 hours in the future to account for timezone edge cases
    const tomorrowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (!isNaN(incidentDate.getTime()) && incidentDate > tomorrowEnd) {
      flags.push({
        code: "T2",
        class: "TEMPORAL",
        severity: "CRITICAL",
        title: "Incident date is in the future",
        detail: `The incident date (${incidentDate.toLocaleDateString()}) has not yet occurred. Claims cannot be submitted for future events. This is either a data entry error or a fraudulent pre-submission.`,
        fraudPoints: 35,
      });
    }
  }

  // ── T3: Claim submitted before incident ──────────────────────────────────────
  if (input.incidentDate && input.submittedAt) {
    const incidentDate = new Date(input.incidentDate);
    const submittedDate = new Date(input.submittedAt);
    // Allow up to 1 hour tolerance for same-day submissions with time ambiguity
    const toleranceMs = 60 * 60 * 1000;
    if (
      !isNaN(incidentDate.getTime()) &&
      !isNaN(submittedDate.getTime()) &&
      submittedDate.getTime() < incidentDate.getTime() - toleranceMs
    ) {
      flags.push({
        code: "T3",
        class: "TEMPORAL",
        severity: "CRITICAL",
        title: "Claim submitted before incident date",
        detail: `This claim was submitted on ${submittedDate.toLocaleDateString()} but the reported incident date is ${incidentDate.toLocaleDateString()}. A claim cannot be lodged before the incident it covers. This is either a data entry error or a pre-planned fraudulent submission.`,
        fraudPoints: 40,
      });
    }
  }

  // ── P2: Odometer impossibility ───────────────────────────────────────────────
  if (input.vehicleMileageKm && input.vehicleYear) {
    const currentYear = new Date().getFullYear();
    const vehicleAgeYears = Math.max(1, currentYear - input.vehicleYear);
    const kmPerYear = input.vehicleMileageKm / vehicleAgeYears;
    // 200,000 km/year is physically impossible for a road vehicle
    // (would require driving ~548 km every single day without pause)
    if (kmPerYear > 200_000) {
      flags.push({
        code: "P2",
        class: "PHYSICAL",
        severity: "HIGH",
        title: "Odometer reading is physically impossible",
        detail: `The reported odometer reading of ${input.vehicleMileageKm.toLocaleString()} km on a ${input.vehicleYear} vehicle implies ${Math.round(kmPerYear).toLocaleString()} km/year. The maximum physically possible for a road vehicle is approximately 200,000 km/year (548 km/day, every day). This reading cannot be genuine and must be verified.`,
        fraudPoints: 25,
      });
    }
  }

  // ── P3: Repair cost exceeds market value × 1.5 ──────────────────────────────
  // A repair quote more than 150% of market value is a physical impossibility —
  // no legitimate repairer would quote more than the vehicle is worth to replace.
  // The 1.5× threshold (not 1.0×) accounts for legitimate total-loss scenarios
  // where the insurer may still choose to repair rather than write off.
  if (
    input.quotedRepairCost &&
    input.vehicleMarketValue &&
    input.vehicleMarketValue > 0
  ) {
    const ratio = input.quotedRepairCost / input.vehicleMarketValue;
    if (ratio > 1.5) {
      flags.push({
        code: "P3",
        class: "PHYSICAL",
        severity: "HIGH",
        title: "Repair cost exceeds 150% of vehicle market value",
        detail: `The quoted repair cost (${input.quotedRepairCost.toLocaleString()}) is ${Math.round(ratio * 100)}% of the vehicle's market value (${input.vehicleMarketValue.toLocaleString()}). No legitimate repair quote should exceed 150% of the vehicle's replacement value. This is either a data error, a fraudulent quote, or the vehicle should be declared a total loss.`,
        fraudPoints: 20,
      });
    }
  }

  // ── I2: Duplicate registration + date window ─────────────────────────────────
  // Two claims for the same registration plate within 7 days of each other
  // is highly suspicious — the same vehicle cannot be in two separate accidents
  // within a week without that being noteworthy.
  if (input.vehicleRegistration && input.incidentDate && input.otherClaimsForRegistration?.length) {
    const thisDate = new Date(input.incidentDate).getTime();
    const windowMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const nearDuplicates = input.otherClaimsForRegistration.filter((other) => {
      if (!other.incidentDate) return false;
      const otherDate = new Date(other.incidentDate).getTime();
      return Math.abs(otherDate - thisDate) <= windowMs;
    });
    if (nearDuplicates.length > 0) {
      const refs = nearDuplicates.map((c) => c.claimNumber).join(", ");
      flags.push({
        code: "I2",
        class: "IDENTITY",
        severity: "HIGH",
        title: "Duplicate claim — same registration within 7 days",
        detail: `Registration ${input.vehicleRegistration} appears in ${nearDuplicates.length} other claim${nearDuplicates.length > 1 ? "s" : ""} with an incident date within 7 days of this claim (${refs}). The same vehicle being involved in separate accidents within a week requires immediate verification. This may indicate claim duplication, staged accidents, or an administrative error.`,
        fraudPoints: 30,
      });
    }
  }

  return flags;
}

/**
 * Compute the total fraud score contribution from all triggered impossibility flags.
 * Capped at 60 to prevent a single impossibility from dominating the entire score.
 */
export function impossibilityFraudPoints(flags: ImpossibilityFlag[]): number {
  const total = flags.reduce((sum, f) => sum + f.fraudPoints, 0);
  return Math.min(60, total);
}

/**
 * Return a human-readable summary for the fraud score breakdown.
 */
export function impossibilitySummary(flags: ImpossibilityFlag[]): string {
  if (flags.length === 0) return "No logical or physical impossibilities detected.";
  const titles = flags.map((f) => `[${f.code}] ${f.title}`).join("; ");
  return `${flags.length} impossibility flag${flags.length > 1 ? "s" : ""} detected: ${titles}. Each flag represents a condition that cannot be true under normal circumstances and requires immediate adjuster review.`;
}
