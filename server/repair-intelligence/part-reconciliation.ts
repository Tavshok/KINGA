/**
 * Part Reconciliation Service
 *
 * Compares computer-vision detected parts with parts quoted by garages.
 * Produces:
 *   - missingParts:  detected by AI but absent from the quote
 *   - extraParts:    in the quote but not detected by AI
 *   - matchedParts:  present in both
 *   - coverageScore: fraction of detected parts that are quoted (0–1)
 *
 * All part names are normalised through the SA parts dictionary before
 * comparison so that "Front Bumper Cover" and "front facia" are treated
 * as the same part.
 */

import { normalisePart } from "./parts-dictionary";

export interface DetectedPart {
  name: string;
  location?: string;
  damageType?: string;
  severity?: string;
}

export interface QuotedPart {
  componentName: string;
  action?: string;
  partsCost?: number;
  laborCost?: number;
}

export interface ReconciliationResult {
  missingParts: string[];     // Detected but not quoted
  extraParts: string[];       // Quoted but not detected
  matchedParts: string[];     // Present in both
  coverageScore: number;      // 0–1: fraction of detected parts covered by quote
  detectedCount: number;
  quotedCount: number;
}

/**
 * Reconcile detected parts against quoted parts.
 *
 * @param detectedParts - Array from ai_assessments.damaged_components_json
 * @param quotedParts   - Array from panel_beater_quotes.components_json
 */
export function reconcileParts(
  detectedParts: DetectedPart[],
  quotedParts: QuotedPart[]
): ReconciliationResult {
  // Normalise all names
  const normalisedDetected = detectedParts.map((p) => normalisePart(p.name));
  const normalisedQuoted = quotedParts.map((p) => normalisePart(p.componentName));

  // Deduplicate
  const detectedSet = new Set(normalisedDetected);
  const quotedSet = new Set(normalisedQuoted);

  const matchedParts: string[] = [];
  const missingParts: string[] = [];
  const extraParts: string[] = [];

  // Parts detected but not quoted
  for (const part of Array.from(detectedSet)) {
    if (quotedSet.has(part)) {
      matchedParts.push(part);
    } else {
      missingParts.push(part);
    }
  }

  // Parts quoted but not detected
  for (const part of Array.from(quotedSet)) {
    if (!detectedSet.has(part)) {
      extraParts.push(part);
    }
  }

  const coverageScore =
    detectedSet.size === 0 ? 1 : matchedParts.length / detectedSet.size;

  return {
    missingParts,
    extraParts,
    matchedParts,
    coverageScore: Math.round(coverageScore * 100) / 100,
    detectedCount: detectedSet.size,
    quotedCount: quotedSet.size,
  };
}
