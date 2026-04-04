/**
 * labelUtils.ts — Shared label formatting utilities
 *
 * Converts internal identifiers (snake_case, camelCase, stage numbers, etc.)
 * into human-readable labels for display in the report UI.
 *
 * These utilities are the single authoritative source for label formatting.
 * Any new identifier patterns should be added here rather than inline in components.
 */

// ── Known label overrides ────────────────────────────────────────────────────
// Maps exact internal identifiers to their preferred display labels.
const LABEL_OVERRIDES: Record<string, string> = {
  // Integrity flags
  image_processing_failure: "Damage Photos Not Available",
  physics_not_executed: "Physics Analysis Pending",
  cost_intelligence_missing: "Cost Intelligence Not Available",
  no_photo_evidence: "No Photo Evidence",
  no_document_evidence: "No Document Evidence",
  // Fraud indicators
  staged_accident: "Staged Accident Indicator",
  inflated_claim: "Inflated Claim Indicator",
  prior_damage: "Prior Damage Detected",
  inconsistent_damage: "Inconsistent Damage Pattern",
  duplicate_claim: "Potential Duplicate Claim",
  // Damage zones
  front_bumper: "Front Bumper",
  rear_bumper: "Rear Bumper",
  front_hood: "Front Hood",
  rear_trunk: "Rear Trunk / Boot",
  left_door: "Left Door",
  right_door: "Right Door",
  left_fender: "Left Fender",
  right_fender: "Right Fender",
  windshield: "Windshield",
  rear_windshield: "Rear Windshield",
  left_headlight: "Left Headlight",
  right_headlight: "Right Headlight",
  left_taillight: "Left Tail Light",
  right_taillight: "Right Tail Light",
  // Decision outcomes
  APPROVE: "Approve Claim",
  ESCALATE: "Escalate for Review",
  REJECT: "Reject Claim",
  PARTIAL_APPROVE: "Approve Partial Amount",
  // Risk levels
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "Critical Risk",
  // Confidence bands
  HIGH: "High Confidence",
  MEDIUM: "Medium Confidence",
  LOW: "Low Confidence",
  // Pipeline stages (strip these entirely from user-facing text)
  stage_1: "",
  stage_2: "",
  stage_3: "",
  stage_4: "",
  stage_5: "",
  stage_6: "",
  stage_7: "",
  stage_8: "",
  stage_9: "",
  stage_10: "",
  stage_11: "",
  stage_12: "",
  stage_13: "",
  stage_14: "",
  stage_15: "",
  stage_16: "",
  stage_17: "",
  stage_18: "",
  stage_19: "",
  stage_20: "",
  stage_21: "",
  stage_22: "",
  stage_23: "",
  stage_24: "",
  stage_25: "",
  stage_26: "",
  stage_27: "",
  stage_28: "",
  stage_29: "",
  stage_30: "",
};

// ── Stage number pattern ─────────────────────────────────────────────────────
// Matches "Stage N", "stage_N", "(Stage N)", "[Stage N]" etc.
const STAGE_PATTERN = /\b(?:Stage\s+\d+|stage_\d+)\b[\s:–—]*/gi;

/**
 * Converts a snake_case or camelCase identifier to a human-readable label.
 * Checks the override map first, then falls back to automatic conversion.
 *
 * @example
 *   toHumanLabel("image_processing_failure") → "Damage Photos Not Available"
 *   toHumanLabel("fraudRiskLevel")           → "Fraud Risk Level"
 *   toHumanLabel("ESCALATE")                 → "Escalate for Review"
 */
export function toHumanLabel(key: string): string {
  if (!key) return "";

  // Check exact override
  if (key in LABEL_OVERRIDES) {
    return LABEL_OVERRIDES[key];
  }

  // Check case-insensitive override
  const lower = key.toLowerCase();
  const lowerKey = Object.keys(LABEL_OVERRIDES).find(k => k.toLowerCase() === lower);
  if (lowerKey) return LABEL_OVERRIDES[lowerKey];

  // Convert snake_case → Title Case
  if (key.includes("_")) {
    return key
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  // Convert camelCase → Title Case
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Strips internal stage references (e.g. "Stage 7", "stage_9") from text
 * that will be shown to end users.
 *
 * @example
 *   stripStageRefs("Stage 7 physics engine did not run.")
 *   → "Physics engine did not run."
 */
export function stripStageRefs(text: string): string {
  if (!text) return text;
  return text
    .replace(STAGE_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Formats an integrity flag for user display.
 * Converts the technical flag name and description into user-friendly text.
 */
export function formatIntegrityFlag(flag: {
  flag: string;
  severity: string;
  description: string;
  action: string;
}): { label: string; description: string; action: string } {
  return {
    label: toHumanLabel(flag.flag),
    description: stripStageRefs(flag.description),
    action: stripStageRefs(flag.action),
  };
}

/**
 * Returns a user-friendly severity label with appropriate colour class.
 */
export function severityDisplay(severity: string): { label: string; colorClass: string } {
  switch (severity?.toUpperCase()) {
    case "HIGH":
    case "CRITICAL":
      return { label: "Action Required", colorClass: "text-red-600 dark:text-red-400" };
    case "MEDIUM":
      return { label: "Attention Needed", colorClass: "text-amber-600 dark:text-amber-400" };
    case "LOW":
      return { label: "Advisory", colorClass: "text-blue-600 dark:text-blue-400" };
    default:
      return { label: severity, colorClass: "text-muted-foreground" };
  }
}
