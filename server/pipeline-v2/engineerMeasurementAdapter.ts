/**
 * engineerMeasurementAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T4
 *
 * Converts a row from the `physical_measurements` table (as captured by a
 * field engineer) into the canonical PhysicsMeasurement type used by the
 * KINGA physics pipeline.
 *
 * DESIGN PRINCIPLE
 * ────────────────
 * The physics engine (stage-7-physics.ts) is UNTOUCHED. Engineer measurements
 * enter the pipeline through the crossStageConsistencyEngine reconciliation
 * layer, which calls this adapter to produce PhysicsMeasurement objects that
 * the engine can reason about.
 *
 * PROVENANCE RANK
 * ───────────────
 * ENGINEER_MEASUREMENT sits between VGE_CALIBRATED and STAGE6_LLM_VISION in
 * the provenance hierarchy. It is a direct physical measurement — more reliable
 * than an LLM vision estimate, but less reliable than a calibrated multi-image
 * photogrammetric consensus.
 *
 * Hierarchy (highest to lowest):
 *   1. VGR_CONSENSUS
 *   2. VGE_CALIBRATED
 *   3. ENGINEER_MEASUREMENT  ← this adapter
 *   4. STAGE6_LLM_VISION
 *   5. STAGE7_INFERRED
 */

import type { PhysicsMeasurement } from "./physicsTruth";

// ── Input type (matches physical_measurements table row) ─────────────────────

export interface EngineerMeasurementRow {
  id: number;
  measurementType: string;
  value: number;
  valueMin: number | null;
  valueMax: number | null;
  unit: string;
  confidence: number;
  instrument: string | null;
  measurementMethod: string;
  calibrationReference: string | null;
  capturedBy: number;
  capturedAt: Date;
  notes: string | null;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Convert a physical_measurements row to a PhysicsMeasurement object.
 *
 * The confidence value is taken directly from the row (default 0.9).
 * The 90% CI bounds are taken from value_min/value_max when present;
 * otherwise they are estimated as ±5% of the measured value.
 */
export function measurementToPhysicsMeasurement(
  row: EngineerMeasurementRow
): PhysicsMeasurement {
  const value = row.value;
  const confidenceInterval = 0.05; // 5% fallback when no explicit bounds

  const min = row.valueMin ?? value * (1 - confidenceInterval);
  const max = row.valueMax ?? value * (1 + confidenceInterval);

  const instrumentNote = row.instrument
    ? `measured with ${row.instrument}`
    : `method: ${row.measurementMethod}`;

  const calibrationNote = row.calibrationReference
    ? `, calibration ref: ${row.calibrationReference}`
    : "";

  const provenanceNote =
    `Engineer physical measurement (id=${row.id}): ${row.measurementType} = ${value} ${row.unit} ` +
    `(${instrumentNote}${calibrationNote}). ` +
    `Captured by user ${row.capturedBy} at ${row.capturedAt.toISOString()}.` +
    (row.notes ? ` Notes: ${row.notes}` : "");

  return {
    value,
    min,
    max,
    confidence: row.confidence,
    source: "ENGINEER_MEASUREMENT",
    provenanceNote,
  };
}

/**
 * Convert an array of engineer measurement rows to PhysicsMeasurement objects.
 * Filters out rows where value is null/undefined (defensive guard).
 */
export function batchConvertMeasurements(
  rows: EngineerMeasurementRow[]
): Array<{ measurementType: string; unit: string; physics: PhysicsMeasurement }> {
  return rows
    .filter((r) => r.value != null)
    .map((r) => ({
      measurementType: r.measurementType,
      unit: r.unit,
      physics: measurementToPhysicsMeasurement(r),
    }));
}
