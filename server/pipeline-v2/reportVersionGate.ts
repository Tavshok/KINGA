/**
 * reportVersionGate.ts
 *
 * Phase 5C — Report v4.0 Governance Gate
 *
 * Provides:
 *   - detectReportVersion: infers report version from available data fields
 *   - classifyReportLegacy: determines if a report is legacy (pre-v4.0) and what is missing
 *   - buildVersionGateResult: full governance gate result for UI and audit trail
 *
 * Version history:
 *   v1.x — Basic AI assessment (confidence score, fraud risk, recommendation)
 *   v2.x — Phase 1: FCDI, physics analysis, cost reconciliation
 *   v3.x — Phase 2-3: Economic context, FEL, multi-quote optimisation
 *   v4.0 — Phase 4-5: IFE attribution, DOE, FEL version snapshot, DRM, DTL
 *
 * Design principle: Any report generated before Phase 4 is a legacy report.
 * Legacy reports must be flagged in the UI so assessors do not use them as
 * the basis for final adjudication decisions without re-running the pipeline.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportVersion = "1.x" | "2.x" | "3.x" | "4.0" | "unknown";

export interface ReportVersionGateResult {
  /** Detected version string */
  version: ReportVersion;
  /** Whether this is a legacy report (pre-v4.0) */
  isLegacy: boolean;
  /** Whether the report can be used for automated adjudication */
  isAdjudicationReady: boolean;
  /** Missing capabilities vs v4.0 */
  missingCapabilities: MissingCapability[];
  /** Human-readable summary for UI banner */
  legacyBannerMessage: string | null;
  /** Recommended action for assessor */
  assessorGuidance: string;
  /** Whether re-running the pipeline would improve this report */
  rerunRecommended: boolean;
}

export interface MissingCapability {
  capability: string;
  description: string;
  addedInVersion: string;
  impact: "critical" | "high" | "medium";
}

// ─── Version detection ────────────────────────────────────────────────────────

/**
 * Infers report version from the presence of data fields.
 * Does not require an explicit version field — works retroactively on all existing reports.
 */
export function detectReportVersion(assessment: {
  ifeResultJson?: string | null;
  doeResultJson?: string | null;
  felVersionSnapshotJson?: string | null;
  fcdiScore?: number | null;
  economicContextJson?: string | null;
  forensicExecutionLedgerJson?: string | null;
  confidenceScore?: number | null;
  fraudScore?: number | null;
}): ReportVersion {
  // v4.0: has IFE + DOE + FEL version snapshot
  if (assessment.ifeResultJson && assessment.doeResultJson) {
    return "4.0";
  }

  // v3.x: has economic context + FEL but no IFE/DOE
  if (assessment.economicContextJson && assessment.forensicExecutionLedgerJson) {
    return "3.x";
  }

  // v2.x: has FCDI score but no economic context
  if (assessment.fcdiScore !== null && assessment.fcdiScore !== undefined) {
    return "2.x";
  }

  // v1.x: only basic fields (confidence score, fraud score)
  if (assessment.confidenceScore !== null && assessment.confidenceScore !== undefined) {
    return "1.x";
  }

  return "unknown";
}

// ─── Legacy classification ────────────────────────────────────────────────────

const V4_CAPABILITIES: MissingCapability[] = [
  {
    capability: "Data Attribution Layer (IFE)",
    description: "Classifies each data gap by responsible party (claimant, insurer, system, document). Without this, all gaps are treated as claimant deficiency — which may be incorrect and legally indefensible.",
    addedInVersion: "4.0",
    impact: "critical",
  },
  {
    capability: "Decision Optimisation Engine (DOE)",
    description: "Multi-objective scoring of repair quotes with fraud-aware disqualification and FCDI gate. Without this, cost decisions are not systematically defensible.",
    addedInVersion: "4.0",
    impact: "critical",
  },
  {
    capability: "FEL Version Snapshot",
    description: "Pins the exact model version, prompt hash, and input hash used at execution time. Without this, the decision cannot be replayed or audited to court standard.",
    addedInVersion: "4.0",
    impact: "high",
  },
];

const V3_CAPABILITIES: MissingCapability[] = [
  {
    capability: "Economic Context Engine (ECE)",
    description: "Derives the policy currency, jurisdiction, and exchange rate context. Without this, cost benchmarks may be in the wrong currency.",
    addedInVersion: "3.x",
    impact: "high",
  },
  {
    capability: "Forensic Execution Ledger (FEL)",
    description: "Full per-stage audit trail of inputs, outputs, and confidence scores. Without this, the decision chain cannot be reconstructed.",
    addedInVersion: "3.x",
    impact: "high",
  },
];

const V2_CAPABILITIES: MissingCapability[] = [
  {
    capability: "FCDI Score",
    description: "Forensic Confidence & Data Integrity score. Without this, evidence quality cannot be quantified and the DOE gate cannot be applied.",
    addedInVersion: "2.x",
    impact: "critical",
  },
  {
    capability: "Physics Analysis",
    description: "Damage physics consistency check. Without this, physically impossible damage claims may not be flagged.",
    addedInVersion: "2.x",
    impact: "medium",
  },
];

/**
 * Returns the full governance gate result for a given report version.
 */
export function buildVersionGateResult(assessment: {
  ifeResultJson?: string | null;
  doeResultJson?: string | null;
  felVersionSnapshotJson?: string | null;
  fcdiScore?: number | null;
  economicContextJson?: string | null;
  forensicExecutionLedgerJson?: string | null;
  confidenceScore?: number | null;
  fraudScore?: number | null;
}): ReportVersionGateResult {
  const version = detectReportVersion(assessment);
  const isLegacy = version !== "4.0";
  const isAdjudicationReady = version === "4.0";

  // Build missing capabilities list
  const missingCapabilities: MissingCapability[] = [];

  if (version === "1.x" || version === "unknown") {
    missingCapabilities.push(...V2_CAPABILITIES, ...V3_CAPABILITIES, ...V4_CAPABILITIES);
  } else if (version === "2.x") {
    missingCapabilities.push(...V3_CAPABILITIES, ...V4_CAPABILITIES);
  } else if (version === "3.x") {
    missingCapabilities.push(...V4_CAPABILITIES);
  }

  // Build legacy banner message
  let legacyBannerMessage: string | null = null;
  if (isLegacy) {
    const criticalCount = missingCapabilities.filter(c => c.impact === "critical").length;
    if (version === "1.x" || version === "unknown") {
      legacyBannerMessage = `Legacy Report (v${version}) — This report predates FCDI scoring, the Data Attribution Layer, and the Decision Optimisation Engine. It cannot be used as the basis for a final adjudication decision. Re-run the pipeline to generate a v4.0 report.`;
    } else if (version === "2.x") {
      legacyBannerMessage = `Legacy Report (v2.x) — This report predates the Economic Context Engine, Forensic Execution Ledger, and Decision Optimisation Engine. Cost benchmarks may be in the wrong currency and the decision chain cannot be audited. Re-run the pipeline to generate a v4.0 report.`;
    } else if (version === "3.x") {
      legacyBannerMessage = `Legacy Report (v3.x) — This report predates the Data Attribution Layer and Decision Optimisation Engine. Data gaps cannot be attributed by responsible party and cost decisions are not systematically defensible. Re-run the pipeline to generate a v4.0 report.`;
    }
  }

  // Build assessor guidance
  let assessorGuidance: string;
  if (isAdjudicationReady) {
    assessorGuidance = "This is a v4.0 report. All governance capabilities are present. The Decision Narrative View provides the full adjudication reasoning chain. You may proceed to a final decision.";
  } else if (version === "3.x") {
    assessorGuidance = "This report is missing the Data Attribution Layer and DOE. Data gaps may be incorrectly attributed to the claimant. Do not use this report as the sole basis for a final decision. Re-run the pipeline or manually verify all data gaps before adjudicating.";
  } else {
    assessorGuidance = "This report is significantly outdated. Multiple critical governance capabilities are missing. Do not use this report for adjudication. Re-run the pipeline to generate a current report.";
  }

  return {
    version,
    isLegacy,
    isAdjudicationReady,
    missingCapabilities,
    legacyBannerMessage,
    assessorGuidance,
    rerunRecommended: isLegacy,
  };
}

/**
 * Lightweight check — returns true if the report is legacy (pre-v4.0).
 * Use this for quick UI checks without building the full gate result.
 */
export function isLegacyReport(assessment: {
  ifeResultJson?: string | null;
  doeResultJson?: string | null;
}): boolean {
  return !assessment.ifeResultJson || !assessment.doeResultJson;
}
