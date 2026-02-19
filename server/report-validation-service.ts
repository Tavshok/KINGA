// @ts-nocheck
/**
 * KINGA Report Validation Service
 * 
 * Validates report completeness and ensures all required data is present
 * before generating professional insurance-grade reports
 */

import type { ClaimIntelligence } from "./report-intelligence-aggregator";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  completenessScore: number;
}

export interface ReportCompletenessChecklist {
  hasClaimData: boolean;
  hasAIAssessment: boolean;
  hasAssessorEvaluation: boolean;
  hasPanelBeaterQuotes: boolean;
  hasDamagePhotos: boolean;
  hasFraudDetection: boolean;
  hasPhysicsValidation: boolean;
  hasAuditTrail: boolean;
}

/**
 * Validate claim intelligence for report generation
 */
export function validateReportData(
  intelligence: ClaimIntelligence,
  role: "insurer" | "assessor" | "regulatory"
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check claim core data
  if (!intelligence.claim) {
    errors.push("Missing claim core data");
  } else {
    if (!intelligence.claim.claimNumber) {
      errors.push("Missing claim number");
    }
    if (!intelligence.claim.incidentDate) {
      errors.push("Missing incident date");
    }
    if (!intelligence.claim.incidentDescription) {
      warnings.push("Missing incident description - report may lack context");
    }
  }

  // Check AI assessment
  if (!intelligence.aiAssessment) {
    errors.push("Missing AI assessment - cannot generate comprehensive report");
  } else {
    if (!intelligence.aiAssessment.damageAnalysis) {
      warnings.push("Missing AI damage analysis");
    }
    if (!intelligence.aiAssessment.estimatedRepairCost) {
      warnings.push("Missing AI cost estimate");
    }
    if (!intelligence.aiAssessment.confidenceScore) {
      warnings.push("Missing AI confidence score");
    }
  }

  // Check assessor evaluation (role-specific)
  if (role === "assessor" || role === "regulatory") {
    if (!intelligence.assessorEvaluation) {
      errors.push("Missing assessor evaluation - required for this report type");
    }
  } else if (role === "insurer") {
    if (!intelligence.assessorEvaluation) {
      warnings.push("Missing assessor evaluation - report will rely solely on AI assessment");
    }
  }

  // Check panel beater quotes
  if (!intelligence.panelBeaterQuotes || intelligence.panelBeaterQuotes.length === 0) {
    warnings.push("No panel beater quotes available - cost comparison will be limited");
  }

  // Check fraud detection
  if (!intelligence.fraudDetection) {
    warnings.push("Missing fraud detection data");
  } else {
    if (intelligence.fraudDetection.aiRiskScore === undefined || intelligence.fraudDetection.aiRiskScore === null) {
      warnings.push("Missing AI fraud risk score");
    }
  }

  // Check physics validation
  if (!intelligence.physicsValidation) {
    warnings.push("Missing physics validation data");
  }

  // Check workflow audit trail
  if (!intelligence.workflowAuditTrail || intelligence.workflowAuditTrail.length === 0) {
    if (role === "regulatory") {
      errors.push("Missing workflow audit trail - required for regulatory compliance");
    } else {
      warnings.push("Missing workflow audit trail");
    }
  }

  // Check supporting evidence
  if (!intelligence.supportingEvidence || !intelligence.supportingEvidence.damagePhotos || intelligence.supportingEvidence.damagePhotos.length === 0) {
    warnings.push("No damage photos available - report will lack visual evidence");
  }

  // Calculate completeness score
  const completenessScore = calculateCompletenessScore(intelligence);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    completenessScore,
  };
}

/**
 * Calculate report completeness score (0-100)
 */
function calculateCompletenessScore(intelligence: ClaimIntelligence): number {
  const checklist = getCompletenessChecklist(intelligence);
  
  const weights = {
    hasClaimData: 15,
    hasAIAssessment: 20,
    hasAssessorEvaluation: 15,
    hasPanelBeaterQuotes: 10,
    hasDamagePhotos: 10,
    hasFraudDetection: 10,
    hasPhysicsValidation: 10,
    hasAuditTrail: 10,
  };

  let score = 0;
  for (const [key, value] of Object.entries(checklist)) {
    if (value) {
      score += weights[key as keyof typeof weights];
    }
  }

  return score;
}

/**
 * Get report completeness checklist
 */
export function getCompletenessChecklist(
  intelligence: ClaimIntelligence
): ReportCompletenessChecklist {
  return {
    hasClaimData: !!intelligence.claim && !!intelligence.claim.claimNumber,
    hasAIAssessment: !!intelligence.aiAssessment,
    hasAssessorEvaluation: !!intelligence.assessorEvaluation,
    hasPanelBeaterQuotes: !!intelligence.panelBeaterQuotes && intelligence.panelBeaterQuotes.length > 0,
    hasDamagePhotos: !!intelligence.supportingEvidence && !!intelligence.supportingEvidence.damagePhotos && intelligence.supportingEvidence.damagePhotos.length > 0,
    hasFraudDetection: !!intelligence.fraudDetection && intelligence.fraudDetection.aiRiskScore !== undefined,
    hasPhysicsValidation: !!intelligence.physicsValidation,
    hasAuditTrail: !!intelligence.workflowAuditTrail && intelligence.workflowAuditTrail.length > 0,
  };
}

/**
 * Validate AI explainability inclusion
 */
export function validateAIExplainability(intelligence: ClaimIntelligence): {
  hasExplanation: boolean;
  missingElements: string[];
} {
  const missingElements: string[] = [];

  if (!intelligence.aiAssessment) {
    missingElements.push("AI assessment");
    return { hasExplanation: false, missingElements };
  }

  if (!intelligence.aiAssessment.damageAnalysis) {
    missingElements.push("Damage analysis explanation");
  }

  if (!intelligence.aiAssessment.confidenceScore) {
    missingElements.push("Confidence score");
  }

  if (!intelligence.physicsValidation || !intelligence.physicsValidation.impactAnalysis) {
    missingElements.push("Physics validation explanation");
  }

  return {
    hasExplanation: missingElements.length === 0,
    missingElements,
  };
}

/**
 * Validate audit trail inclusion
 */
export function validateAuditTrail(intelligence: ClaimIntelligence): {
  hasAuditTrail: boolean;
  missingEvents: string[];
} {
  const missingEvents: string[] = [];

  if (!intelligence.workflowAuditTrail || intelligence.workflowAuditTrail.length === 0) {
    missingEvents.push("Complete audit trail");
    return { hasAuditTrail: false, missingEvents };
  }

  const statuses = intelligence.workflowAuditTrail.map(event => event.newStatus);

  if (!statuses.includes("submitted")) {
    missingEvents.push("Claim submission event");
  }

  if (intelligence.aiAssessment && !statuses.includes("ai_assessed")) {
    missingEvents.push("AI assessment event");
  }

  if (intelligence.assessorEvaluation && !statuses.includes("assessor_evaluated")) {
    missingEvents.push("Assessor evaluation event");
  }

  return {
    hasAuditTrail: missingEvents.length === 0,
    missingEvents,
  };
}

/**
 * Validate template compliance
 */
export function validateTemplateCompliance(
  role: "insurer" | "assessor" | "regulatory",
  intelligence: ClaimIntelligence
): {
  isCompliant: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // Insurer template requirements
  if (role === "insurer") {
    if (!intelligence.aiAssessment) {
      violations.push("Insurer reports require AI assessment");
    }
    if (!intelligence.fraudDetection) {
      violations.push("Insurer reports require fraud detection analysis");
    }
  }

  // Assessor template requirements
  if (role === "assessor") {
    if (!intelligence.assessorEvaluation) {
      violations.push("Assessor reports require professional assessor evaluation");
    }
    if (!intelligence.supportingEvidence || !intelligence.supportingEvidence.damagePhotos || intelligence.supportingEvidence.damagePhotos.length === 0) {
      violations.push("Assessor reports require damage photos");
    }
  }

  // Regulatory template requirements
  if (role === "regulatory") {
    if (!intelligence.workflowAuditTrail || intelligence.workflowAuditTrail.length === 0) {
      violations.push("Regulatory reports require complete workflow audit trail");
    }
    if (!intelligence.aiAssessment) {
      violations.push("Regulatory reports require AI assessment for transparency");
    }
    if (!intelligence.fraudDetection) {
      violations.push("Regulatory reports require fraud detection analysis");
    }
  }

  return {
    isCompliant: violations.length === 0,
    violations,
  };
}

/**
 * Get comprehensive validation report
 */
export function getValidationReport(
  intelligence: ClaimIntelligence,
  role: "insurer" | "assessor" | "regulatory"
): {
  dataValidation: ValidationResult;
  aiExplainability: ReturnType<typeof validateAIExplainability>;
  auditTrail: ReturnType<typeof validateAuditTrail>;
  templateCompliance: ReturnType<typeof validateTemplateCompliance>;
  completenessChecklist: ReportCompletenessChecklist;
  overallStatus: "ready" | "warnings" | "errors";
} {
  const dataValidation = validateReportData(intelligence, role);
  const aiExplainability = validateAIExplainability(intelligence);
  const auditTrail = validateAuditTrail(intelligence);
  const templateCompliance = validateTemplateCompliance(role, intelligence);
  const completenessChecklist = getCompletenessChecklist(intelligence);

  let overallStatus: "ready" | "warnings" | "errors" = "ready";
  if (dataValidation.errors.length > 0 || !templateCompliance.isCompliant) {
    overallStatus = "errors";
  } else if (dataValidation.warnings.length > 0 || !aiExplainability.hasExplanation || !auditTrail.hasAuditTrail) {
    overallStatus = "warnings";
  }

  return {
    dataValidation,
    aiExplainability,
    auditTrail,
    templateCompliance,
    completenessChecklist,
    overallStatus,
  };
}
