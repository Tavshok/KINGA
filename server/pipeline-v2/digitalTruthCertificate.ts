/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DIGITAL TRUTH CERTIFICATE — TRE v3.0 Enhancement 7
 * TRUTH QUALITY METRICS — TRE v3.0 Enhancement 8
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * E7: Digital Truth Certificate
 *   - Cryptographically-inspired certificate (SHA-256 hash of CTO canonical fields)
 *   - Certificate ID, version, issuer, scope, validity period
 *   - Machine-verifiable integrity check
 *   - Revocation support
 *
 * E8: Truth Quality Metrics
 *   - Completeness score (% of expected fields populated)
 *   - Consistency score (% of fields with no conflicts)
 *   - Confidence score (weighted average of field confidences)
 *   - Provenance score (% of fields with complete lineage)
 *   - Composite TQI (Truth Quality Index)
 */

import { createHash } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// E7: DIGITAL TRUTH CERTIFICATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateRevocationReason =
  | "new_evidence"
  | "fraud_detected"
  | "manual_override"
  | "engine_error"
  | "regulatory_requirement"
  | "data_corruption";

export interface CertificateScope {
  /** Which CTO sections are covered by this certificate */
  sections: string[];
  /** Which fields are explicitly excluded (e.g. pending manual review) */
  excludedFields: string[];
  /** Whether the certificate covers the final decision */
  coversDecision: boolean;
  /** Whether the certificate covers cost values */
  coversCost: boolean;
  /** Whether the certificate covers fraud assessment */
  coversFraud: boolean;
}

export interface DigitalTruthCertificate {
  /** Unique certificate ID — format: CERT-{claimRef}-{version}-{timestamp} */
  certificateId: string;
  /** Claim/assessment reference */
  claimReference: string;
  /** Certificate version (increments on re-certification) */
  version: number;
  /** TRE engine version that issued this certificate */
  issuerVersion: string;
  /** ISO timestamp when certificate was issued */
  issuedAt: string;
  /** ISO timestamp when certificate expires (null = no expiry) */
  expiresAt: string | null;
  /** Whether this certificate is currently valid */
  isValid: boolean;
  /** Revocation details (null if not revoked) */
  revocation: {
    revokedAt: string;
    reason: CertificateRevocationReason;
    revokedBy: string;
    replacedByCertificateId: string | null;
  } | null;
  /** SHA-256 hash of the canonical CTO fields */
  contentHash: string;
  /** Scope of this certificate */
  scope: CertificateScope;
  /** Key field values at certification time (for integrity verification) */
  certifiedValues: {
    recommendation: string;
    fraudRiskScore: number;
    optimisedCostUsd: number;
    overallConfidence: number;
    visionSourceReliability: string;
    integrityScore: number;
    stabilityIndex: number;
  };
  /** Regulatory profile applied */
  regulatoryProfileId: string | null;
  /** Whether this certificate satisfies all regulatory requirements */
  regulatoryCompliant: boolean;
  /** Compliance violations (if any) */
  complianceViolations: string[];
  /** Human-readable summary */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// E7: CERTIFICATE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 hash of the canonical CTO fields.
 * This is the content hash used for integrity verification.
 */
export function computeContentHash(certifiedValues: DigitalTruthCertificate["certifiedValues"]): string {
  const canonical = JSON.stringify({
    recommendation: certifiedValues.recommendation,
    fraudRiskScore: certifiedValues.fraudRiskScore,
    optimisedCostUsd: Math.round(certifiedValues.optimisedCostUsd * 100) / 100,
    overallConfidence: certifiedValues.overallConfidence,
    visionSourceReliability: certifiedValues.visionSourceReliability,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Generate a unique certificate ID.
 */
export function generateCertificateId(claimReference: string, version: number): string {
  const ts = Date.now().toString(36).toUpperCase();
  const ref = claimReference.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12);
  return `CERT-${ref}-V${version}-${ts}`;
}

/**
 * Issue a new digital truth certificate.
 */
export function issueDigitalCertificate(params: {
  claimReference: string;
  version: number;
  issuerVersion: string;
  certifiedValues: DigitalTruthCertificate["certifiedValues"];
  scope: CertificateScope;
  regulatoryProfileId: string | null;
  regulatoryCompliant: boolean;
  complianceViolations: string[];
  validityDays?: number; // null = no expiry
}): DigitalTruthCertificate {
  const certificateId = generateCertificateId(params.claimReference, params.version);
  const issuedAt = new Date().toISOString();
  const expiresAt = params.validityDays
    ? new Date(Date.now() + params.validityDays * 86400000).toISOString()
    : null;

  const contentHash = computeContentHash(params.certifiedValues);

  const { recommendation, fraudRiskScore, optimisedCostUsd, overallConfidence } = params.certifiedValues;
  const violationSummary = params.complianceViolations.length > 0
    ? ` Compliance violations: ${params.complianceViolations.join("; ")}.`
    : "";

  const summary = `Certificate ${certificateId} issued for claim ${params.claimReference}. ` +
    `Decision: ${recommendation}. Fraud: ${fraudRiskScore}%. Cost: USD ${optimisedCostUsd.toFixed(2)}. ` +
    `Confidence: ${overallConfidence}%. Regulatory: ${params.regulatoryCompliant ? "COMPLIANT" : "NON-COMPLIANT"}.${violationSummary}`;

  return {
    certificateId,
    claimReference: params.claimReference,
    version: params.version,
    issuerVersion: params.issuerVersion,
    issuedAt,
    expiresAt,
    isValid: true,
    revocation: null,
    contentHash,
    scope: params.scope,
    certifiedValues: params.certifiedValues,
    regulatoryProfileId: params.regulatoryProfileId,
    regulatoryCompliant: params.regulatoryCompliant,
    complianceViolations: params.complianceViolations,
    summary,
  };
}

/**
 * Revoke a digital truth certificate.
 * Returns a new revoked certificate (never mutates the original).
 */
export function revokeCertificate(
  certificate: DigitalTruthCertificate,
  reason: CertificateRevocationReason,
  revokedBy: string,
  replacedByCertificateId: string | null = null
): DigitalTruthCertificate {
  return {
    ...certificate,
    isValid: false,
    revocation: {
      revokedAt: new Date().toISOString(),
      reason,
      revokedBy,
      replacedByCertificateId,
    },
  };
}

/**
 * Verify the integrity of a certificate by recomputing its content hash.
 */
export function verifyCertificateIntegrity(certificate: DigitalTruthCertificate): {
  valid: boolean;
  reason: string;
} {
  if (!certificate.isValid) {
    return { valid: false, reason: `Certificate revoked: ${certificate.revocation?.reason ?? "unknown"}` };
  }
  if (certificate.expiresAt && new Date(certificate.expiresAt) < new Date()) {
    return { valid: false, reason: "Certificate has expired" };
  }
  const recomputedHash = computeContentHash(certificate.certifiedValues);
  if (recomputedHash !== certificate.contentHash) {
    return { valid: false, reason: "Content hash mismatch — certificate may have been tampered with" };
  }
  return { valid: true, reason: "Certificate integrity verified" };
}

// ─────────────────────────────────────────────────────────────────────────────
// E8: TRUTH QUALITY METRICS TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type TQILabel = "EXCELLENT" | "GOOD" | "ACCEPTABLE" | "POOR" | "CRITICAL";

export interface TruthQualityDimension {
  /** Dimension name */
  name: string;
  /** Score 0–100 */
  score: number;
  /** Label */
  label: TQILabel;
  /** Weight in composite TQI */
  weight: number;
  /** Explanation */
  explanation: string;
  /** Fields contributing to this dimension */
  contributingFields: string[];
}

export interface TruthQualityIndex {
  /** Composite TQI score 0–100 */
  compositeScore: number;
  /** TQI label */
  label: TQILabel;
  /** Individual quality dimensions */
  dimensions: {
    completeness: TruthQualityDimension;
    consistency: TruthQualityDimension;
    confidence: TruthQualityDimension;
    provenance: TruthQualityDimension;
    timeliness: TruthQualityDimension;
  };
  /** Fields that are dragging down the TQI */
  weakestFields: Array<{ field: string; score: number; issue: string }>;
  /** Recommended actions to improve TQI */
  improvementActions: Array<{ action: string; expectedGain: number; priority: "HIGH" | "MEDIUM" | "LOW" }>;
  /** ISO timestamp */
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// E8: TRUTH QUALITY METRICS COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function labelFromScore(score: number): TQILabel {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 60) return "ACCEPTABLE";
  if (score >= 40) return "POOR";
  return "CRITICAL";
}

/**
 * Compute the Truth Quality Index for a claim.
 */
export function computeTruthQualityIndex(params: {
  // Completeness inputs
  populatedFieldCount: number;
  expectedFieldCount: number;
  missingCriticalFields: string[];
  // Consistency inputs
  conflictCount: number;
  criticalConflictCount: number;
  totalCheckedFields: number;
  // Confidence inputs
  overallConfidence: number;
  physicsConfidence: number | null;
  fraudConfidence: number;
  // Provenance inputs
  fieldsWithCompleteLineage: number;
  totalTrackedFields: number;
  // Timeliness inputs
  claimAgeDays: number;
  daysToLodge: number;
  processingTimeMs: number;
}): TruthQualityIndex {

  // ── Completeness ──────────────────────────────────────────────────────────
  const completenessRaw = params.expectedFieldCount > 0
    ? (params.populatedFieldCount / params.expectedFieldCount) * 100
    : 100;
  const criticalPenalty = params.missingCriticalFields.length * 15;
  const completenessScore = Math.max(0, Math.min(100, completenessRaw - criticalPenalty));

  const completeness: TruthQualityDimension = {
    name: "Completeness",
    score: Math.round(completenessScore),
    label: labelFromScore(completenessScore),
    weight: 0.25,
    explanation: `${params.populatedFieldCount}/${params.expectedFieldCount} fields populated. ` +
      (params.missingCriticalFields.length > 0 ? `Missing critical: ${params.missingCriticalFields.join(", ")}.` : "All critical fields present."),
    contributingFields: params.missingCriticalFields,
  };

  // ── Consistency ───────────────────────────────────────────────────────────
  const conflictRate = params.totalCheckedFields > 0
    ? params.conflictCount / params.totalCheckedFields
    : 0;
  const consistencyRaw = (1 - conflictRate) * 100;
  const criticalConflictPenalty = params.criticalConflictCount * 20;
  const consistencyScore = Math.max(0, Math.min(100, consistencyRaw - criticalConflictPenalty));

  const consistency: TruthQualityDimension = {
    name: "Consistency",
    score: Math.round(consistencyScore),
    label: labelFromScore(consistencyScore),
    weight: 0.25,
    explanation: `${params.conflictCount} conflicts detected (${params.criticalConflictCount} critical) across ${params.totalCheckedFields} checked fields.`,
    contributingFields: [],
  };

  // ── Confidence ────────────────────────────────────────────────────────────
  const physicsWeight = params.physicsConfidence !== null ? 0.35 : 0;
  const fraudWeight = 0.35;
  const overallWeight = 0.30 + (params.physicsConfidence === null ? 0.35 : 0);
  const confidenceScore = (params.overallConfidence * overallWeight) +
    ((params.physicsConfidence ?? 0) * physicsWeight) +
    (params.fraudConfidence * fraudWeight);

  const confidence: TruthQualityDimension = {
    name: "Confidence",
    score: Math.round(Math.min(100, confidenceScore)),
    label: labelFromScore(confidenceScore),
    weight: 0.25,
    explanation: `Overall: ${params.overallConfidence}%. Physics: ${params.physicsConfidence ?? "N/A"}%. Fraud: ${params.fraudConfidence}%.`,
    contributingFields: ["confidence.overallConfidence", "physics.estimatedSpeedKmh", "fraud.fraudRiskScore"],
  };

  // ── Provenance ────────────────────────────────────────────────────────────
  const provenanceScore = params.totalTrackedFields > 0
    ? (params.fieldsWithCompleteLineage / params.totalTrackedFields) * 100
    : 100;

  const provenance: TruthQualityDimension = {
    name: "Provenance",
    score: Math.round(provenanceScore),
    label: labelFromScore(provenanceScore),
    weight: 0.15,
    explanation: `${params.fieldsWithCompleteLineage}/${params.totalTrackedFields} tracked fields have complete lineage (origin → certification).`,
    contributingFields: [],
  };

  // ── Timeliness ────────────────────────────────────────────────────────────
  // Late lodgement penalty: > 30 days = -20, > 90 days = -40
  const lodgementPenalty = params.daysToLodge > 90 ? 40 : params.daysToLodge > 30 ? 20 : 0;
  // Processing time penalty: > 10 min = -10, > 30 min = -20
  const processingMinutes = params.processingTimeMs / 60000;
  const processingPenalty = processingMinutes > 30 ? 20 : processingMinutes > 10 ? 10 : 0;
  const timelinessScore = Math.max(0, 100 - lodgementPenalty - processingPenalty);

  const timeliness: TruthQualityDimension = {
    name: "Timeliness",
    score: Math.round(timelinessScore),
    label: labelFromScore(timelinessScore),
    weight: 0.10,
    explanation: `Lodgement: ${params.daysToLodge} days after incident. Processing: ${processingMinutes.toFixed(1)} min.`,
    contributingFields: ["workflow.daysToLodge"],
  };

  // ── Composite TQI ─────────────────────────────────────────────────────────
  const compositeScore = Math.round(
    completeness.score * completeness.weight +
    consistency.score * consistency.weight +
    confidence.score * confidence.weight +
    provenance.score * provenance.weight +
    timeliness.score * timeliness.weight
  );

  // ── Weakest fields ────────────────────────────────────────────────────────
  const weakestFields: TruthQualityIndex["weakestFields"] = [];
  if (params.missingCriticalFields.length > 0) {
    weakestFields.push(...params.missingCriticalFields.map(f => ({
      field: f,
      score: 0,
      issue: "Critical field missing",
    })));
  }
  if (params.criticalConflictCount > 0) {
    weakestFields.push({ field: "consistency.criticalConflicts", score: 0, issue: `${params.criticalConflictCount} critical conflicts` });
  }
  if (params.daysToLodge > 90) {
    weakestFields.push({ field: "workflow.daysToLodge", score: 20, issue: `Late lodgement: ${params.daysToLodge} days` });
  }

  // ── Improvement actions ───────────────────────────────────────────────────
  const improvementActions: TruthQualityIndex["improvementActions"] = [];
  if (params.missingCriticalFields.length > 0) {
    improvementActions.push({
      action: `Obtain missing evidence: ${params.missingCriticalFields.join(", ")}`,
      expectedGain: params.missingCriticalFields.length * 10,
      priority: "HIGH",
    });
  }
  if (params.criticalConflictCount > 0) {
    improvementActions.push({
      action: "Resolve critical conflicts before re-certification",
      expectedGain: params.criticalConflictCount * 15,
      priority: "HIGH",
    });
  }
  if (params.physicsConfidence === null) {
    improvementActions.push({
      action: "Obtain damage photographs to enable physics analysis",
      expectedGain: 10,
      priority: "MEDIUM",
    });
  }
  if (params.fieldsWithCompleteLineage < params.totalTrackedFields) {
    improvementActions.push({
      action: "Ensure all key fields have complete evidence lineage",
      expectedGain: 5,
      priority: "LOW",
    });
  }

  return {
    compositeScore,
    label: labelFromScore(compositeScore),
    dimensions: { completeness, consistency, confidence, provenance, timeliness },
    weakestFields: weakestFields.slice(0, 5),
    improvementActions: improvementActions.sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return order[a.priority] - order[b.priority];
    }),
    computedAt: new Date().toISOString(),
  };
}
