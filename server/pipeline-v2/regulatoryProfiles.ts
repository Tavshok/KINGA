/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * REGULATORY GOVERNANCE PROFILES — TRE v3.0 Enhancement 5
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Different jurisdictions have different requirements for:
 *   - Minimum evidence standards
 *   - Fraud threshold escalation requirements
 *   - Mandatory disclosure requirements
 *   - Audit trail retention
 *   - Appeal window requirements
 *
 * Each profile is a named, versioned, immutable governance configuration.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type RegulatoryJurisdiction =
  | "ZA"   // South Africa — FSCA / Short-Term Insurance Act
  | "UK"   // United Kingdom — FCA / Insurance Act 2015
  | "AU"   // Australia — APRA / Insurance Contracts Act
  | "US"   // United States — State DOI / NAIC
  | "EU"   // European Union — EIOPA / Solvency II
  | "GLOBAL"; // No specific jurisdiction — most permissive

export type EvidenceRequirementLevel = "MANDATORY" | "RECOMMENDED" | "OPTIONAL";

export interface EvidenceRequirement {
  /** Evidence type */
  evidenceType: string;
  /** Requirement level */
  level: EvidenceRequirementLevel;
  /** Minimum count required (for MANDATORY) */
  minimumCount?: number;
  /** Description of the requirement */
  description: string;
}

export interface FraudThresholds {
  /** Score above which claim must be escalated to fraud team */
  escalationThreshold: number;
  /** Score above which claim must be reported to regulatory authority */
  regulatoryReportingThreshold: number;
  /** Score above which claim must be declined automatically */
  autoDeclineThreshold: number;
  /** Whether fraud indicators must be disclosed to claimant */
  disclosureRequired: boolean;
}

export interface AuditRequirements {
  /** Minimum retention period in days */
  retentionDays: number;
  /** Whether all reconciliation decisions must be logged */
  reconciliationLoggingRequired: boolean;
  /** Whether truth certificates must be stored */
  certificateStorageRequired: boolean;
  /** Whether lineage must be stored */
  lineageStorageRequired: boolean;
  /** Whether evidence graph must be stored */
  evidenceGraphStorageRequired: boolean;
}

export interface AppealRequirements {
  /** Appeal window in days */
  appealWindowDays: number;
  /** Whether appeal rights must be communicated to claimant */
  communicationRequired: boolean;
  /** Whether internal review is required before external escalation */
  internalReviewRequired: boolean;
}

export interface RegulatoryProfile {
  /** Profile ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Jurisdiction */
  jurisdiction: RegulatoryJurisdiction;
  /** Profile version */
  version: string;
  /** Effective date */
  effectiveDate: string;
  /** Evidence requirements */
  evidenceRequirements: EvidenceRequirement[];
  /** Fraud thresholds */
  fraudThresholds: FraudThresholds;
  /** Audit requirements */
  auditRequirements: AuditRequirements;
  /** Appeal requirements */
  appealRequirements: AppealRequirements;
  /** Whether the TRE must block publication on any CRITICAL conflict */
  blockOnCriticalConflict: boolean;
  /** Whether the amber disclosure banner is mandatory */
  disclosureBannerMandatory: boolean;
  /** Minimum overall confidence required for auto-approval */
  minimumAutoApprovalConfidence: number;
  /** Maximum cost (USD) that can be auto-approved */
  autoApprovalMaxCostUsd: number;
  /** Whether physics analysis is required for structural damage claims */
  physicsAnalysisRequired: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN PROFILES
// ─────────────────────────────────────────────────────────────────────────────

export const REGULATORY_PROFILES: Record<RegulatoryJurisdiction, RegulatoryProfile> = {

  ZA: {
    id: "ZA-FSCA-2024",
    name: "South Africa — FSCA Short-Term Insurance",
    jurisdiction: "ZA",
    version: "2024.1",
    effectiveDate: "2024-01-01",
    evidenceRequirements: [
      { evidenceType: "damage_photos", level: "MANDATORY", minimumCount: 2, description: "Minimum 2 damage photographs required" },
      { evidenceType: "repair_quotation", level: "MANDATORY", minimumCount: 1, description: "Licensed repairer quotation required" },
      { evidenceType: "police_report", level: "RECOMMENDED", description: "SAPS report recommended for accidents involving third parties" },
      { evidenceType: "driver_statement", level: "MANDATORY", minimumCount: 1, description: "Signed driver statement required" },
    ],
    fraudThresholds: {
      escalationThreshold: 60,
      regulatoryReportingThreshold: 85,
      autoDeclineThreshold: 95,
      disclosureRequired: false, // FSCA does not require fraud indicator disclosure
    },
    auditRequirements: {
      retentionDays: 1825, // 5 years
      reconciliationLoggingRequired: true,
      certificateStorageRequired: true,
      lineageStorageRequired: true,
      evidenceGraphStorageRequired: false,
    },
    appealRequirements: {
      appealWindowDays: 90,
      communicationRequired: true,
      internalReviewRequired: true,
    },
    blockOnCriticalConflict: true,
    disclosureBannerMandatory: true,
    minimumAutoApprovalConfidence: 70,
    autoApprovalMaxCostUsd: 15000,
    physicsAnalysisRequired: false,
  },

  UK: {
    id: "UK-FCA-2024",
    name: "United Kingdom — FCA Insurance Act 2015",
    jurisdiction: "UK",
    version: "2024.1",
    effectiveDate: "2024-01-01",
    evidenceRequirements: [
      { evidenceType: "damage_photos", level: "MANDATORY", minimumCount: 3, description: "Minimum 3 damage photographs required" },
      { evidenceType: "repair_quotation", level: "MANDATORY", minimumCount: 1, description: "VAT-registered repairer quotation required" },
      { evidenceType: "police_report", level: "MANDATORY", description: "Police report required for accidents with injuries or third-party property damage" },
      { evidenceType: "driver_statement", level: "MANDATORY", minimumCount: 1, description: "Signed driver statement required" },
      { evidenceType: "witness_statement", level: "RECOMMENDED", description: "Witness statement recommended where available" },
    ],
    fraudThresholds: {
      escalationThreshold: 55,
      regulatoryReportingThreshold: 80,
      autoDeclineThreshold: 90,
      disclosureRequired: true, // FCA Consumer Duty requires transparency
    },
    auditRequirements: {
      retentionDays: 2555, // 7 years
      reconciliationLoggingRequired: true,
      certificateStorageRequired: true,
      lineageStorageRequired: true,
      evidenceGraphStorageRequired: true,
    },
    appealRequirements: {
      appealWindowDays: 180,
      communicationRequired: true,
      internalReviewRequired: true,
    },
    blockOnCriticalConflict: true,
    disclosureBannerMandatory: true,
    minimumAutoApprovalConfidence: 75,
    autoApprovalMaxCostUsd: 10000,
    physicsAnalysisRequired: true,
  },

  AU: {
    id: "AU-APRA-2024",
    name: "Australia — APRA Insurance Contracts Act",
    jurisdiction: "AU",
    version: "2024.1",
    effectiveDate: "2024-01-01",
    evidenceRequirements: [
      { evidenceType: "damage_photos", level: "MANDATORY", minimumCount: 2, description: "Minimum 2 damage photographs required" },
      { evidenceType: "repair_quotation", level: "MANDATORY", minimumCount: 1, description: "Licensed repairer quotation required" },
      { evidenceType: "driver_statement", level: "MANDATORY", minimumCount: 1, description: "Signed driver statement required" },
    ],
    fraudThresholds: {
      escalationThreshold: 65,
      regulatoryReportingThreshold: 85,
      autoDeclineThreshold: 95,
      disclosureRequired: false,
    },
    auditRequirements: {
      retentionDays: 2190, // 6 years
      reconciliationLoggingRequired: true,
      certificateStorageRequired: true,
      lineageStorageRequired: false,
      evidenceGraphStorageRequired: false,
    },
    appealRequirements: {
      appealWindowDays: 60,
      communicationRequired: true,
      internalReviewRequired: false,
    },
    blockOnCriticalConflict: true,
    disclosureBannerMandatory: true,
    minimumAutoApprovalConfidence: 68,
    autoApprovalMaxCostUsd: 12000,
    physicsAnalysisRequired: false,
  },

  US: {
    id: "US-NAIC-2024",
    name: "United States — NAIC Model Regulation",
    jurisdiction: "US",
    version: "2024.1",
    effectiveDate: "2024-01-01",
    evidenceRequirements: [
      { evidenceType: "damage_photos", level: "RECOMMENDED", description: "Photographs recommended" },
      { evidenceType: "repair_quotation", level: "MANDATORY", minimumCount: 1, description: "Written estimate required" },
      { evidenceType: "driver_statement", level: "MANDATORY", minimumCount: 1, description: "Recorded statement required" },
    ],
    fraudThresholds: {
      escalationThreshold: 70,
      regulatoryReportingThreshold: 90,
      autoDeclineThreshold: 95,
      disclosureRequired: false,
    },
    auditRequirements: {
      retentionDays: 1825, // 5 years (varies by state)
      reconciliationLoggingRequired: true,
      certificateStorageRequired: true,
      lineageStorageRequired: false,
      evidenceGraphStorageRequired: false,
    },
    appealRequirements: {
      appealWindowDays: 30,
      communicationRequired: true,
      internalReviewRequired: false,
    },
    blockOnCriticalConflict: false,
    disclosureBannerMandatory: false,
    minimumAutoApprovalConfidence: 65,
    autoApprovalMaxCostUsd: 20000,
    physicsAnalysisRequired: false,
  },

  EU: {
    id: "EU-EIOPA-2024",
    name: "European Union — EIOPA Solvency II",
    jurisdiction: "EU",
    version: "2024.1",
    effectiveDate: "2024-01-01",
    evidenceRequirements: [
      { evidenceType: "damage_photos", level: "MANDATORY", minimumCount: 3, description: "Minimum 3 damage photographs required" },
      { evidenceType: "repair_quotation", level: "MANDATORY", minimumCount: 2, description: "Two independent quotations required for claims above EUR 5,000" },
      { evidenceType: "police_report", level: "RECOMMENDED", description: "Police report recommended" },
      { evidenceType: "driver_statement", level: "MANDATORY", minimumCount: 1, description: "Signed driver statement required" },
    ],
    fraudThresholds: {
      escalationThreshold: 55,
      regulatoryReportingThreshold: 75,
      autoDeclineThreshold: 90,
      disclosureRequired: true, // GDPR Article 22 — automated decision transparency
    },
    auditRequirements: {
      retentionDays: 3650, // 10 years
      reconciliationLoggingRequired: true,
      certificateStorageRequired: true,
      lineageStorageRequired: true,
      evidenceGraphStorageRequired: true,
    },
    appealRequirements: {
      appealWindowDays: 365,
      communicationRequired: true,
      internalReviewRequired: true,
    },
    blockOnCriticalConflict: true,
    disclosureBannerMandatory: true,
    minimumAutoApprovalConfidence: 80,
    autoApprovalMaxCostUsd: 8000,
    physicsAnalysisRequired: true,
  },

  GLOBAL: {
    id: "GLOBAL-DEFAULT-2024",
    name: "Global Default — Minimum Standards",
    jurisdiction: "GLOBAL",
    version: "2024.1",
    effectiveDate: "2024-01-01",
    evidenceRequirements: [
      { evidenceType: "damage_photos", level: "RECOMMENDED", description: "Photographs recommended" },
      { evidenceType: "repair_quotation", level: "RECOMMENDED", description: "Quotation recommended" },
    ],
    fraudThresholds: {
      escalationThreshold: 75,
      regulatoryReportingThreshold: 90,
      autoDeclineThreshold: 98,
      disclosureRequired: false,
    },
    auditRequirements: {
      retentionDays: 1095, // 3 years
      reconciliationLoggingRequired: false,
      certificateStorageRequired: false,
      lineageStorageRequired: false,
      evidenceGraphStorageRequired: false,
    },
    appealRequirements: {
      appealWindowDays: 30,
      communicationRequired: false,
      internalReviewRequired: false,
    },
    blockOnCriticalConflict: false,
    disclosureBannerMandatory: false,
    minimumAutoApprovalConfidence: 60,
    autoApprovalMaxCostUsd: 50000,
    physicsAnalysisRequired: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileComplianceResult {
  profileId: string;
  jurisdiction: RegulatoryJurisdiction;
  compliant: boolean;
  violations: Array<{
    field: string;
    requirement: string;
    actual: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
  }>;
  warnings: Array<{
    field: string;
    recommendation: string;
  }>;
  score: number; // 0–100
}

/**
 * Validate a claim against a regulatory profile.
 */
export function validateAgainstProfile(
  profile: RegulatoryProfile,
  params: {
    photoCount: number;
    hasQuotation: boolean;
    hasPoliceReport: boolean;
    hasDriverStatement: boolean;
    fraudScore: number;
    overallConfidence: number;
    costUsd: number;
    hasPhysicsAnalysis: boolean;
    hasCriticalConflicts: boolean;
    recommendation: string;
  }
): ProfileComplianceResult {
  const violations: ProfileComplianceResult["violations"] = [];
  const warnings: ProfileComplianceResult["warnings"] = [];

  // Check evidence requirements
  for (const req of profile.evidenceRequirements) {
    if (req.level === "MANDATORY") {
      switch (req.evidenceType) {
        case "damage_photos":
          if (params.photoCount < (req.minimumCount ?? 1)) {
            violations.push({
              field: "evidence.photoCount",
              requirement: req.description,
              actual: `${params.photoCount} photos`,
              severity: "HIGH",
            });
          }
          break;
        case "repair_quotation":
          if (!params.hasQuotation) {
            violations.push({
              field: "evidence.hasQuotation",
              requirement: req.description,
              actual: "No quotation",
              severity: "HIGH",
            });
          }
          break;
        case "police_report":
          if (!params.hasPoliceReport) {
            violations.push({
              field: "evidence.hasPoliceReport",
              requirement: req.description,
              actual: "No police report",
              severity: "MEDIUM",
            });
          }
          break;
        case "driver_statement":
          if (!params.hasDriverStatement) {
            violations.push({
              field: "evidence.hasDriverStatement",
              requirement: req.description,
              actual: "No driver statement",
              severity: "HIGH",
            });
          }
          break;
      }
    } else if (req.level === "RECOMMENDED") {
      switch (req.evidenceType) {
        case "damage_photos":
          if (params.photoCount === 0) {
            warnings.push({ field: "evidence.photoCount", recommendation: req.description });
          }
          break;
        case "repair_quotation":
          if (!params.hasQuotation) {
            warnings.push({ field: "evidence.hasQuotation", recommendation: req.description });
          }
          break;
      }
    }
  }

  // Check fraud thresholds
  if (params.fraudScore >= profile.fraudThresholds.autoDeclineThreshold) {
    if (params.recommendation !== "ESCALATE") {
      violations.push({
        field: "fraud.fraudRiskScore",
        requirement: `Score ≥ ${profile.fraudThresholds.autoDeclineThreshold}% requires ESCALATE`,
        actual: `Score: ${params.fraudScore}%, Decision: ${params.recommendation}`,
        severity: "CRITICAL",
      });
    }
  } else if (params.fraudScore >= profile.fraudThresholds.escalationThreshold) {
    if (params.recommendation === "APPROVE") {
      violations.push({
        field: "fraud.fraudRiskScore",
        requirement: `Score ≥ ${profile.fraudThresholds.escalationThreshold}% cannot be auto-approved`,
        actual: `Score: ${params.fraudScore}%, Decision: APPROVE`,
        severity: "HIGH",
      });
    }
  }

  // Check confidence threshold for auto-approval
  if (params.recommendation === "APPROVE" && params.overallConfidence < profile.minimumAutoApprovalConfidence) {
    violations.push({
      field: "confidence.overallConfidence",
      requirement: `Minimum ${profile.minimumAutoApprovalConfidence}% confidence required for auto-approval`,
      actual: `${params.overallConfidence}%`,
      severity: "HIGH",
    });
  }

  // Check cost threshold for auto-approval
  if (params.recommendation === "APPROVE" && params.costUsd > profile.autoApprovalMaxCostUsd) {
    violations.push({
      field: "cost.optimisedCostUsd",
      requirement: `Claims above USD ${profile.autoApprovalMaxCostUsd.toLocaleString()} cannot be auto-approved`,
      actual: `USD ${params.costUsd.toFixed(2)}`,
      severity: "HIGH",
    });
  }

  // Check physics analysis requirement
  if (profile.physicsAnalysisRequired && !params.hasPhysicsAnalysis) {
    violations.push({
      field: "physics.estimatedSpeedKmh",
      requirement: "Physics analysis is required by this regulatory profile",
      actual: "No physics analysis available",
      severity: "MEDIUM",
    });
  }

  // Check critical conflict blocking
  if (profile.blockOnCriticalConflict && params.hasCriticalConflicts && params.recommendation === "APPROVE") {
    violations.push({
      field: "consistency.criticalConflicts",
      requirement: "Critical conflicts block auto-approval under this regulatory profile",
      actual: "Critical conflicts present, decision is APPROVE",
      severity: "CRITICAL",
    });
  }

  // Compute compliance score
  const criticalCount = violations.filter(v => v.severity === "CRITICAL").length;
  const highCount = violations.filter(v => v.severity === "HIGH").length;
  const mediumCount = violations.filter(v => v.severity === "MEDIUM").length;
  const penalty = criticalCount * 30 + highCount * 15 + mediumCount * 5;
  const score = Math.max(0, 100 - penalty);

  return {
    profileId: profile.id,
    jurisdiction: profile.jurisdiction,
    compliant: violations.length === 0,
    violations,
    warnings,
    score,
  };
}

/**
 * Get the regulatory profile for a given jurisdiction.
 */
export function getRegulatoryProfile(jurisdiction: RegulatoryJurisdiction): RegulatoryProfile {
  return REGULATORY_PROFILES[jurisdiction] ?? REGULATORY_PROFILES.GLOBAL;
}

/**
 * Detect the appropriate jurisdiction from claim metadata.
 */
export function detectJurisdiction(params: {
  countryCode?: string;
  insurerJurisdiction?: string;
}): RegulatoryJurisdiction {
  const code = (params.countryCode ?? params.insurerJurisdiction ?? "").toUpperCase();
  if (code === "ZA" || code === "RSA") return "ZA";
  if (code === "GB" || code === "UK") return "UK";
  if (code === "AU" || code === "AUS") return "AU";
  if (code === "US" || code === "USA") return "US";
  if (["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "SE", "DK", "FI", "NO", "PL", "CZ", "HU"].includes(code)) return "EU";
  return "GLOBAL";
}
