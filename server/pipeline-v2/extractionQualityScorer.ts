/**
 * extractionQualityScorer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extraction Quality Scorer
 *
 * Computes a 0–100 quality score for each Stage 3 extraction result and
 * produces a list of weak/missing fields that should be flagged for the
 * Document Read Verification Engine and the pipeline trace viewer.
 *
 * SCORING MODEL:
 *   Core identity fields (vehicle, claimant)  — 30 points
 *   Incident fields (description, date, type) — 25 points
 *   Financial fields (quote, costs)           — 25 points
 *   Supporting fields (police, assessor)      — 20 points
 *
 * A score ≥ 80 → HIGH confidence extraction
 * A score 50–79 → MEDIUM confidence — downstream engines should apply
 *                 additional recovery steps
 * A score < 50 → LOW confidence — pipeline should escalate for manual review
 */

import type { ExtractedClaimFields } from "./types";

export interface ExtractionQualityResult {
  score: number;
  tier: "HIGH" | "MEDIUM" | "LOW";
  presentFields: string[];
  missingFields: string[];
  weakFields: string[];
  notes: string[];
}

interface FieldSpec {
  key: keyof ExtractedClaimFields;
  label: string;
  points: number;
  group: "identity" | "incident" | "financial" | "supporting";
  /** Minimum string length to be considered non-trivial */
  minLength?: number;
}

const FIELD_SPECS: FieldSpec[] = [
  // Identity — 30 pts
  { key: "vehicleRegistration", label: "Vehicle Registration", points: 8, group: "identity" },
  { key: "vehicleMake",         label: "Vehicle Make",         points: 5, group: "identity" },
  { key: "vehicleModel",        label: "Vehicle Model",        points: 5, group: "identity" },
  { key: "claimantName",        label: "Claimant Name",        points: 7, group: "identity" },
  { key: "vehicleYear",         label: "Vehicle Year",         points: 5, group: "identity" },

  // Incident — 25 pts
  { key: "accidentDescription", label: "Accident Description", points: 10, group: "incident", minLength: 20 },
  { key: "accidentDate",        label: "Accident Date",        points: 7,  group: "incident" },
  { key: "incidentType",        label: "Incident Type",        points: 5,  group: "incident" },
  { key: "accidentLocation",    label: "Accident Location",    points: 3,  group: "incident" },

  // Financial — 25 pts
  { key: "quoteTotalCents",     label: "Quote Total",          points: 12, group: "financial" },
  { key: "labourCostCents",     label: "Labour Cost",          points: 5,  group: "financial" },
  { key: "partsCostCents",      label: "Parts Cost",           points: 5,  group: "financial" },
  { key: "agreedCostCents",     label: "Agreed Cost",          points: 3,  group: "financial" },

  // Supporting — 20 pts
  { key: "policeReportNumber",  label: "Police Report Number", points: 8,  group: "supporting" },
  { key: "assessorName",        label: "Assessor Name",        points: 5,  group: "supporting" },
  { key: "panelBeater",         label: "Panel Beater",         points: 4,  group: "supporting" },
  { key: "estimatedSpeedKmh",   label: "Speed at Impact",      points: 3,  group: "supporting" },
];

/**
 * isFieldPresent
 *
 * Returns true if the field value is non-null, non-empty, and meets the
 * minimum length requirement (for string fields).
 */
function isFieldPresent(value: unknown, spec: FieldSpec): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    if (spec.minLength && trimmed.length < spec.minLength) return false;
  }
  if (typeof value === "number" && value <= 0) return false;
  return true;
}

/**
 * isFieldWeak
 *
 * Returns true if the field is present but suspiciously short or generic.
 * Used to flag fields that were extracted but may be low quality.
 */
function isFieldWeak(value: unknown, spec: FieldSpec): boolean {
  if (!isFieldPresent(value, spec)) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    // Very short strings for description fields are suspicious
    if (spec.key === "accidentDescription" && trimmed.length < 50) return true;
    // Generic placeholder values
    if (/^(n\/a|na|none|unknown|tbc|tbd|nil)$/i.test(trimmed)) return true;
  }
  return false;
}

/**
 * scoreExtraction
 *
 * Main entry point. Returns a quality score and diagnostic breakdown.
 */
export function scoreExtraction(fields: ExtractedClaimFields): ExtractionQualityResult {
  let score = 0;
  const presentFields: string[] = [];
  const missingFields: string[] = [];
  const weakFields: string[] = [];
  const notes: string[] = [];

  for (const spec of FIELD_SPECS) {
    const value = fields[spec.key];
    if (isFieldWeak(value, spec)) {
      // Partial credit for weak fields
      score += Math.floor(spec.points * 0.4);
      weakFields.push(spec.label);
    } else if (isFieldPresent(value, spec)) {
      score += spec.points;
      presentFields.push(spec.label);
    } else {
      missingFields.push(spec.label);
    }
  }

  // Bonus: damaged components list
  if (fields.damagedComponents && fields.damagedComponents.length >= 3) {
    score = Math.min(100, score + 5);
    notes.push(`${fields.damagedComponents.length} damaged components extracted`);
  } else if (fields.damagedComponents && fields.damagedComponents.length > 0) {
    score = Math.min(100, score + 2);
    notes.push(`${fields.damagedComponents.length} damaged component(s) extracted (expected ≥3)`);
  } else {
    notes.push("No damaged components extracted");
  }

  // Penalty: if quoteTotalCents is missing but damagedComponents has items,
  // the quote page was likely missed
  if (!fields.quoteTotalCents && fields.damagedComponents.length > 0) {
    notes.push("Quote total missing despite component list — repair quote page may not have been read");
  }

  const tier: "HIGH" | "MEDIUM" | "LOW" =
    score >= 80 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";

  return {
    score: Math.min(100, score),
    tier,
    presentFields,
    missingFields,
    weakFields,
    notes,
  };
}
