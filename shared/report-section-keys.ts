/**
 * Canonical section keys for KINGA report collaboration annotations.
 * These keys are stable semantic identifiers — they must NOT change when
 * report layouts are redesigned or sections are reordered. Annotations
 * in claim_comments.section_key reference these constants.
 */

export const REPORT_SECTION_KEYS = {
  DAMAGE_ANALYSIS:    "damage_analysis",
  PHYSICS_VALIDATION: "physics_validation",
  FRAUD_SCORE:        "fraud_score",
  QUOTE_COMPARISON:   "quote_comparison",
  COST_INTELLIGENCE:  "cost_intelligence",
  VEHICLE_HISTORY:    "vehicle_history",
  POLICY_VERIFICATION:"policy_verification",
  APPROVAL_CHAIN:     "approval_chain",
  EXECUTIVE_SUMMARY:  "executive_summary",
} as const;

export type ReportSectionKey = typeof REPORT_SECTION_KEYS[keyof typeof REPORT_SECTION_KEYS];

/** Human-readable labels for each section key */
export const SECTION_LABELS: Record<ReportSectionKey, string> = {
  damage_analysis:     "Damage Analysis",
  physics_validation:  "Physics Validation",
  fraud_score:         "Fraud Score",
  quote_comparison:    "Quote Comparison",
  cost_intelligence:   "Cost Intelligence",
  vehicle_history:     "Vehicle History",
  policy_verification: "Policy Verification",
  approval_chain:      "Approval Chain",
  executive_summary:   "Executive Summary",
};

/** Severity levels for section annotations */
export const SEVERITY_LEVELS = ["info", "warning", "critical", "fraud_risk", "compliance"] as const;
export type AnnotationSeverity = typeof SEVERITY_LEVELS[number];

/** Disposition states for section annotations */
export const DISPOSITION_STATES = ["accepted", "rejected", "needs_more_info", "resolved", "escalated"] as const;
export type AnnotationDisposition = typeof DISPOSITION_STATES[number];

/** Visibility matrix: which insurer roles can see annotations of each severity */
export const SEVERITY_VISIBILITY: Record<AnnotationSeverity, string[]> = {
  info:        ["claims_processor", "assessor_internal", "risk_manager", "claims_manager", "executive", "insurer_admin"],
  warning:     ["claims_processor", "assessor_internal", "risk_manager", "claims_manager", "executive", "insurer_admin"],
  critical:    ["claims_processor", "assessor_internal", "risk_manager", "claims_manager", "executive", "insurer_admin"],
  fraud_risk:  ["assessor_internal", "risk_manager", "claims_manager", "executive", "insurer_admin"],
  compliance:  ["risk_manager", "claims_manager", "executive", "insurer_admin"],
};
