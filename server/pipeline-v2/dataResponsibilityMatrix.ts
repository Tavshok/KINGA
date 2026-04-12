/**
 * dataResponsibilityMatrix.ts
 *
 * Phase 4C — Data Responsibility Matrix (DRM)
 *
 * Generates a structured, human-readable breakdown of data gaps in a claim,
 * attributing each gap to its responsible party:
 *
 *   CLAIMANT_DEFICIENCY   — claimant failed to provide required information
 *   INSURER_DATA_GAP      — insurer's own policy record is incomplete
 *   SYSTEM_EXTRACTION_FAILURE — KINGA's OCR/extraction pipeline failed on
 *                               a document that appeared to contain the data
 *   DOCUMENT_LIMITATION   — the document type structurally cannot contain
 *                           the requested field
 *
 * The DRM is designed to prevent insurers from penalising claimants for gaps
 * that are attributable to the insurer's own data or KINGA's extraction limits.
 *
 * Output is included in the Forensic Audit Report under
 * `fullReport.sections.dataResponsibilityMatrix`.
 */

import type { IFEReport, DataAttributionClass } from "./inputFidelityEngine";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Re-export for consumers of the DRM */
export type DRMAttributionClass = DataAttributionClass;

export interface DRMEntry {
  /** Field name that has a data gap */
  field: string;
  /** Responsible party attribution */
  attribution: DataAttributionClass;
  /** Human-readable explanation for the Forensic Audit Report */
  explanation: string;
  /** Whether this gap blocks the DOE (decision optimisation) */
  blocksDOE: boolean;
  /** Recommended remediation action */
  remediation: string;
}

export interface DataResponsibilityMatrix {
  /** Total number of data gaps identified */
  totalGaps: number;
  /** Gaps by attribution class */
  byAttribution: Record<DataAttributionClass, number>;
  /** Detailed entries for each gap */
  entries: DRMEntry[];
  /** Whether any INSURER_DATA_GAP entries exist */
  hasInsurerGaps: boolean;
  /** Whether any SYSTEM_EXTRACTION_FAILURE entries exist */
  hasSystemFailures: boolean;
  /** Narrative summary for the report */
  narrative: string;
  /** ISO timestamp */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPLANATION TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const EXPLANATIONS: Record<DRMAttributionClass, (field: string) => string> = {
  CLAIMANT_DEFICIENCY: (field) =>
    `The field "${field}" was not provided by the claimant and could not be inferred from any submitted document. ` +
    `This gap is attributable to the claimant and may be used to support a request for additional documentation.`,

  INSURER_DATA_GAP: (field) =>
    `The field "${field}" is expected to be present in the insurer's policy record but was not found. ` +
    `This gap is attributable to the insurer's own data systems and must not be used to penalise the claimant. ` +
    `The insurer's policy administration team should be consulted to resolve this gap.`,

  SYSTEM_EXTRACTION_FAILURE: (field) =>
    `The field "${field}" appears to be present in a submitted document, but KINGA's extraction pipeline ` +
    `was unable to reliably extract it (extraction confidence below threshold). ` +
    `This gap is attributable to a system limitation and must not be used to penalise the claimant. ` +
    `Manual review of the original document is recommended.`,

  DOCUMENT_LIMITATION: (field) =>
    `The field "${field}" cannot be extracted from the submitted document type because the document ` +
    `does not structurally contain this information. This is a document-type limitation, not a claimant failure. ` +
    `A supplementary document (e.g., police report, policy schedule) should be requested if this field is critical.`,
};

const REMEDIATIONS: Record<DRMAttributionClass, (field: string) => string> = {
  CLAIMANT_DEFICIENCY: (field) =>
    `Request the claimant to provide documentation containing "${field}".`,

  INSURER_DATA_GAP: (field) =>
    `Escalate to insurer policy administration to retrieve "${field}" from the policy record.`,

  SYSTEM_EXTRACTION_FAILURE: (field) =>
    `Manually review the original submitted document to extract "${field}". ` +
    `Flag for OCR quality improvement if the document is clearly legible.`,

  DOCUMENT_LIMITATION: (field) =>
    `Request a supplementary document that contains "${field}" (e.g., policy schedule, police report).`,
};

// Fields whose absence blocks the DOE
const DOE_BLOCKING_FIELDS = new Set([
  "repairQuoteTotal",
  "agreedCost",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "vehicleRegistration",
  "incidentDate",
  "policyNumber",
  "insuredValue",
]);

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Data Responsibility Matrix from an IFE report.
 *
 * The IFE already classifies each gap — the DRM converts those classifications
 * into a structured, human-readable report section.
 */
export function buildDataResponsibilityMatrix(
  ifeReport: IFEReport | null
): DataResponsibilityMatrix {
  const generatedAt = new Date().toISOString();

  if (!ifeReport || ifeReport.gapCount === 0) {
    return {
      totalGaps: 0,
      byAttribution: {
        CLAIMANT_DEFICIENCY: 0,
        INSURER_DATA_GAP: 0,
        SYSTEM_EXTRACTION_FAILURE: 0,
        DOCUMENT_LIMITATION: 0,
      },
      entries: [],
      hasInsurerGaps: false,
      hasSystemFailures: false,
      narrative:
        "No data gaps were identified. All required fields were successfully extracted " +
        "and attributed to their respective sources.",
      generatedAt,
    };
  }

  const entries: DRMEntry[] = ifeReport.attributedGaps.map((fa) => ({
    field: fa.field,
    attribution: fa.attribution,
    explanation: EXPLANATIONS[fa.attribution](fa.field),
    blocksDOE: DOE_BLOCKING_FIELDS.has(fa.field),
    remediation: REMEDIATIONS[fa.attribution](fa.field),
  }));

  const byAttribution: Record<DataAttributionClass, number> = {
    CLAIMANT_DEFICIENCY: 0,
    INSURER_DATA_GAP: 0,
    SYSTEM_EXTRACTION_FAILURE: 0,
    DOCUMENT_LIMITATION: 0,
  };
  for (const entry of entries) {
    byAttribution[entry.attribution]++;
  }

  const hasInsurerGaps = byAttribution.INSURER_DATA_GAP > 0;
  const hasSystemFailures = byAttribution.SYSTEM_EXTRACTION_FAILURE > 0;

  // Build narrative
  const parts: string[] = [];
  parts.push(
    `${entries.length} data gap${entries.length !== 1 ? "s" : ""} were identified across this claim.`
  );

  if (byAttribution.CLAIMANT_DEFICIENCY > 0) {
    parts.push(
      `${byAttribution.CLAIMANT_DEFICIENCY} gap${byAttribution.CLAIMANT_DEFICIENCY !== 1 ? "s are" : " is"} ` +
      `attributable to the claimant (missing or incomplete documentation submitted).`
    );
  }
  if (hasInsurerGaps) {
    parts.push(
      `${byAttribution.INSURER_DATA_GAP} gap${byAttribution.INSURER_DATA_GAP !== 1 ? "s are" : " is"} ` +
      `attributable to the insurer's policy record and must not be used to penalise the claimant.`
    );
  }
  if (hasSystemFailures) {
    parts.push(
      `${byAttribution.SYSTEM_EXTRACTION_FAILURE} gap${byAttribution.SYSTEM_EXTRACTION_FAILURE !== 1 ? "s are" : " is"} ` +
      `attributable to KINGA's extraction pipeline and must not be used to penalise the claimant. ` +
      `Manual review of the original documents is recommended.`
    );
  }
  if (byAttribution.DOCUMENT_LIMITATION > 0) {
    parts.push(
      `${byAttribution.DOCUMENT_LIMITATION} gap${byAttribution.DOCUMENT_LIMITATION !== 1 ? "s are" : " is"} ` +
      `attributable to structural limitations of the submitted document types.`
    );
  }

  const doeBlockingCount = entries.filter((e) => e.blocksDOE).length;
  if (doeBlockingCount > 0) {
    parts.push(
      `${doeBlockingCount} of these gap${doeBlockingCount !== 1 ? "s" : ""} affect fields required for ` +
      `automated decision optimisation (DOE). Manual assessor review is required before a cost decision is made.`
    );
  }

  return {
    totalGaps: entries.length,
    byAttribution,
    entries,
    hasInsurerGaps,
    hasSystemFailures,
    narrative: parts.join(" "),
    generatedAt,
  };
}
