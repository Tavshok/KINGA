/**
 * reportVersionGate.ts
 *
 * Phase 5C — Report Version Gate
 *
 * Detects the version of a KINGA AI assessment report based on field presence,
 * and provides structured legacy classification, missing capability lists,
 * and banner messages for the adjudication UI.
 *
 * Version hierarchy (newest → oldest):
 *   4.0  — IFE (Data Attribution Layer) + DOE (Decision Optimisation Engine) present
 *   3.x  — Economic Context Engine (ECE) + Forensic Execution Ledger (FEL) present, no IFE/DOE
 *   2.x  — FCDI Score present, no ECE/FEL/IFE/DOE
 *   1.x  — Only legacy confidenceScore present
 *   unknown — No recognisable fields
 */

export type ReportVersion = "4.0" | "3.x" | "2.x" | "1.x" | "unknown";

export interface VersionDetectionInput {
  ifeResultJson?: string | null;
  doeResultJson?: string | null;
  felVersionSnapshotJson?: string | null;
  fcdiScore?: number | null;
  economicContextJson?: string | null;
  forensicExecutionLedgerJson?: string | null;
  confidenceScore?: number | null;
}

export interface MissingCapability {
  capability: string;
  description: string;
  impact: "critical" | "high" | "medium" | "low";
  addedInVersion: ReportVersion;
}

export interface VersionGateResult {
  version: ReportVersion;
  isLegacy: boolean;
  isAdjudicationReady: boolean;
  rerunRecommended: boolean;
  missingCapabilities: MissingCapability[];
  legacyBannerMessage: string | null;
  assessorGuidance: string;
}

// ─── Capability catalogue ─────────────────────────────────────────────────────

const ALL_CAPABILITIES: MissingCapability[] = [
  {
    capability: "Data Attribution Layer (IFE)",
    description: "Integrated Field Evidence layer that attributes each finding to source documents.",
    impact: "critical",
    addedInVersion: "4.0",
  },
  {
    capability: "Decision Optimisation Engine (DOE)",
    description: "Optimises the final adjudication recommendation using multi-factor scoring.",
    impact: "critical",
    addedInVersion: "4.0",
  },
  {
    capability: "FEL Version Snapshot",
    description: "Forensic Execution Ledger version snapshot for audit reproducibility.",
    impact: "medium",
    addedInVersion: "4.0",
  },
  {
    capability: "Economic Context Engine (ECE)",
    description: "Provides regional economic context for cost benchmarking.",
    impact: "high",
    addedInVersion: "3.x",
  },
  {
    capability: "Forensic Execution Ledger (FEL)",
    description: "Full audit trail of pipeline stage execution and decisions.",
    impact: "high",
    addedInVersion: "3.x",
  },
  {
    capability: "FCDI Score",
    description: "Fraud & Cost Deviation Index — composite risk score.",
    impact: "critical",
    addedInVersion: "2.x",
  },
];

// ─── detectReportVersion ──────────────────────────────────────────────────────

/**
 * Infers the report version from field presence.
 * Uses the highest version whose required fields are all present.
 */
export function detectReportVersion(input: VersionDetectionInput): ReportVersion {
  const {
    ifeResultJson,
    doeResultJson,
    fcdiScore,
    economicContextJson,
    forensicExecutionLedgerJson,
    confidenceScore,
  } = input;

  // v4.0: IFE + DOE both present
  if (ifeResultJson != null && doeResultJson != null) {
    return "4.0";
  }

  // v3.x: ECE + FEL both present (but no IFE/DOE)
  if (economicContextJson != null && forensicExecutionLedgerJson != null) {
    return "3.x";
  }

  // v2.x: FCDI Score present (but no ECE/FEL/IFE/DOE)
  if (fcdiScore != null) {
    return "2.x";
  }

  // v1.x: legacy confidenceScore present
  if (confidenceScore != null) {
    return "1.x";
  }

  return "unknown";
}

// ─── buildVersionGateResult ───────────────────────────────────────────────────

/**
 * Builds a full version gate result including legacy classification,
 * missing capabilities, banner messages, and assessor guidance.
 */
export function buildVersionGateResult(input: VersionDetectionInput): VersionGateResult {
  const version = detectReportVersion(input);
  const isLegacy = version !== "4.0";
  const isAdjudicationReady = version === "4.0";

  // Determine which capabilities are missing based on version
  const missingCapabilities = _computeMissingCapabilities(version, input);

  // Sort: critical first, then high, then medium, then low
  const impactOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  missingCapabilities.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  const legacyBannerMessage = isLegacy ? _buildLegacyBannerMessage(version, missingCapabilities) : null;
  const assessorGuidance = _buildAssessorGuidance(version, isAdjudicationReady);

  // Rerun is recommended for legacy reports that can be upgraded by re-running the pipeline
  const rerunRecommended = isLegacy;

  return {
    version,
    isLegacy,
    isAdjudicationReady,
    rerunRecommended,
    missingCapabilities,
    legacyBannerMessage,
    assessorGuidance,
  };
}

// ─── isLegacyReport ───────────────────────────────────────────────────────────

/**
 * Lightweight check: returns true if the report is NOT a v4.0 report.
 * A v4.0 report requires both ifeResultJson and doeResultJson to be present.
 */
export function isLegacyReport(input: Pick<VersionDetectionInput, "ifeResultJson" | "doeResultJson">): boolean {
  return !(input.ifeResultJson != null && input.doeResultJson != null);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _computeMissingCapabilities(
  version: ReportVersion,
  input: VersionDetectionInput
): MissingCapability[] {
  const missing: MissingCapability[] = [];

  // v4.0 capabilities
  if (input.ifeResultJson == null) {
    missing.push(ALL_CAPABILITIES.find(c => c.capability === "Data Attribution Layer (IFE)")!);
  }
  if (input.doeResultJson == null) {
    missing.push(ALL_CAPABILITIES.find(c => c.capability === "Decision Optimisation Engine (DOE)")!);
  }
  if (input.felVersionSnapshotJson == null) {
    missing.push(ALL_CAPABILITIES.find(c => c.capability === "FEL Version Snapshot")!);
  }

  // v3.x capabilities
  if (input.economicContextJson == null) {
    missing.push(ALL_CAPABILITIES.find(c => c.capability === "Economic Context Engine (ECE)")!);
  }
  if (input.forensicExecutionLedgerJson == null) {
    missing.push(ALL_CAPABILITIES.find(c => c.capability === "Forensic Execution Ledger (FEL)")!);
  }

  // v2.x capabilities
  if (input.fcdiScore == null) {
    missing.push(ALL_CAPABILITIES.find(c => c.capability === "FCDI Score")!);
  }

  return missing;
}

function _buildLegacyBannerMessage(
  version: ReportVersion,
  missingCapabilities: MissingCapability[]
): string {
  const capNames = missingCapabilities.map(c => c.capability).join(", ");

  switch (version) {
    case "3.x":
      return `This is a legacy v3.x report. The following v4.0 capabilities are unavailable: ${capNames}. ` +
        `The Data Attribution Layer (IFE) and Decision Optimisation Engine (DOE) were not available when this claim was processed.`;
    case "2.x":
      return `This is a legacy v2.x report. Missing capabilities: ${capNames}. ` +
        `Economic Context Engine (ECE), Forensic Execution Ledger (FEL), Data Attribution Layer (IFE), and ` +
        `Decision Optimisation Engine (DOE) were not available when this claim was processed.`;
    case "1.x":
      return `This is a legacy v1.x report. Missing capabilities: ${capNames}. ` +
        `This report was generated with an early version of the KINGA AI engine and lacks most modern analysis capabilities.`;
    default:
      return `This report version (${version}) is unrecognised. Manual review is required.`;
  }
}

function _buildAssessorGuidance(version: ReportVersion, isAdjudicationReady: boolean): string {
  if (isAdjudicationReady) {
    return `This is a v4.0 report with full Data Attribution Layer (IFE) and Decision Optimisation Engine (DOE) coverage. ` +
      `All modern KINGA AI capabilities are present. You may proceed to a final decision with confidence.`;
  }

  switch (version) {
    case "3.x":
      return `This v3.x report has Economic Context Engine and Forensic Execution Ledger data but lacks the v4.0 ` +
        `Data Attribution Layer (IFE) and Decision Optimisation Engine (DOE). Apply additional manual scrutiny before deciding.`;
    case "2.x":
      return `This v2.x report provides a FCDI Score but lacks ECE, FEL, IFE, and DOE capabilities. ` +
        `Significant manual review is required before adjudication.`;
    case "1.x":
      return `This v1.x report uses only legacy confidence scoring. Full manual review is mandatory before any decision.`;
    default:
      return `Report version is unrecognised. Full manual review is mandatory.`;
  }
}
