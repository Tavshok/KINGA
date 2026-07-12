/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXPLAINABLE TRUTH SUMMARY — TRE v3.0 Enhancement 9
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates human-readable, audience-specific explanations of how the TRE
 * arrived at its canonical truth values. Three audiences:
 *
 *   - CLAIMANT: Plain language, no jargon, focus on outcome and next steps
 *   - ASSESSOR: Technical detail, field-level reconciliation, conflict resolution
 *   - AUDITOR:  Full provenance, all conflicts, regulatory compliance status
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ExplanationAudience = "CLAIMANT" | "ASSESSOR" | "AUDITOR";

export interface TruthExplanationSection {
  /** Section heading */
  heading: string;
  /** Plain-text explanation */
  body: string;
  /** Key facts supporting this section */
  keyFacts: string[];
  /** Confidence level for this section */
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
}

export interface TruthExplanationSummary {
  /** Target audience */
  audience: ExplanationAudience;
  /** One-sentence executive summary */
  headline: string;
  /** Decision outcome in plain language */
  decisionExplanation: string;
  /** Sections */
  sections: TruthExplanationSection[];
  /** Key conflicts and how they were resolved */
  conflictResolutions: Array<{
    field: string;
    conflict: string;
    resolution: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
  }>;
  /** What the claimant / assessor / auditor should do next */
  nextSteps: string[];
  /** Caveats and limitations */
  caveats: string[];
  /** ISO timestamp */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIMANT EXPLANATION
// ─────────────────────────────────────────────────────────────────────────────

function buildClaimantExplanation(params: ExplanationParams): TruthExplanationSummary {
  const { recommendation, fraudScore, costUsd, confidence, visionReliability, conflicts, missingEvidence } = params;

  const decisionText: Record<string, string> = {
    APPROVE: "Your claim has been assessed and is recommended for approval.",
    REVIEW: "Your claim requires further review by a human assessor before a final decision can be made.",
    ESCALATE: "Your claim has been flagged for escalation to a specialist team.",
  };

  const headline = recommendation === "APPROVE"
    ? `Claim recommended for approval — estimated settlement: USD ${costUsd.toFixed(2)}`
    : recommendation === "REVIEW"
    ? "Claim requires human review before a decision can be made"
    : "Claim escalated for specialist assessment";

  const sections: TruthExplanationSection[] = [
    {
      heading: "What happened with your claim",
      body: `Our automated assessment system analysed your claim documents, photographs, and incident details. ` +
        `Based on this analysis, your claim has been ${recommendation === "APPROVE" ? "recommended for approval" : recommendation === "REVIEW" ? "referred for human review" : "escalated for specialist review"}.`,
      keyFacts: [
        `Estimated repair cost: USD ${costUsd.toFixed(2)}`,
        `Assessment confidence: ${confidence}%`,
      ],
      confidence: confidence >= 75 ? "HIGH" : confidence >= 55 ? "MEDIUM" : "LOW",
    },
    {
      heading: "Evidence reviewed",
      body: visionReliability === "HIGH"
        ? "We successfully analysed your damage photographs and used them to verify the reported damage."
        : visionReliability === "MEDIUM"
        ? "We reviewed your claim documents. Damage photographs were used where available."
        : "We reviewed your claim documents. Providing clear damage photographs may help speed up your claim.",
      keyFacts: missingEvidence.length > 0
        ? [`Additional evidence that could help: ${missingEvidence.join(", ")}`]
        : ["All key evidence was available for review"],
      confidence: visionReliability === "HIGH" ? "HIGH" : visionReliability === "MEDIUM" ? "MEDIUM" : "LOW",
    },
  ];

  const nextSteps: string[] = [];
  if (recommendation === "APPROVE") {
    nextSteps.push("Your assessor will review the recommendation and contact you with a final decision.");
    nextSteps.push(`If approved, settlement of approximately USD ${costUsd.toFixed(2)} will be processed.`);
  } else if (recommendation === "REVIEW") {
    nextSteps.push("A human assessor will review your claim and contact you within 2–5 business days.");
    if (missingEvidence.length > 0) {
      nextSteps.push(`You may wish to provide: ${missingEvidence.join(", ")}`);
    }
  } else {
    nextSteps.push("A specialist assessor will contact you to discuss your claim.");
    nextSteps.push("Please have all supporting documentation available.");
  }

  const caveats: string[] = [
    "This is an automated preliminary assessment. All decisions are subject to final review by a licensed assessor.",
    "Settlement amounts are estimates and may change following physical inspection.",
  ];

  return {
    audience: "CLAIMANT",
    headline,
    decisionExplanation: decisionText[recommendation] ?? "Your claim is under review.",
    sections,
    conflictResolutions: [], // Claimants don't need conflict details
    nextSteps,
    caveats,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESSOR EXPLANATION
// ─────────────────────────────────────────────────────────────────────────────

function buildAssessorExplanation(params: ExplanationParams): TruthExplanationSummary {
  const {
    recommendation, fraudScore, costUsd, confidence, visionReliability,
    conflicts, missingEvidence, physicsSpeed, physicsConfidence,
    integrityScore, stabilityIndex, reconciliationSteps,
  } = params;

  const headline = `TRE v3.0 — Recommendation: ${recommendation} | Confidence: ${confidence}% | Integrity: ${integrityScore}/100`;

  const sections: TruthExplanationSection[] = [
    {
      heading: "Decision Basis",
      body: `The TRE produced a ${recommendation} recommendation based on: ` +
        `overall confidence ${confidence}%, fraud risk ${fraudScore}%, ` +
        `estimated cost USD ${costUsd.toFixed(2)}, and ${conflicts.length} reconciliation conflicts.`,
      keyFacts: [
        `Recommendation: ${recommendation}`,
        `Overall confidence: ${confidence}%`,
        `Fraud risk score: ${fraudScore}%`,
        `Estimated cost: USD ${costUsd.toFixed(2)}`,
        `Integrity score: ${integrityScore}/100`,
        `Stability index: ${stabilityIndex}/100`,
      ],
      confidence: confidence >= 75 ? "HIGH" : confidence >= 55 ? "MEDIUM" : "LOW",
    },
    {
      heading: "Physics Analysis",
      body: physicsSpeed !== null
        ? `Physics engine estimated impact speed at ${physicsSpeed.toFixed(1)} km/h with ${physicsConfidence ?? 0}% confidence. ` +
          `Vision source reliability: ${visionReliability}.`
        : `Physics analysis was not available (vision source reliability: ${visionReliability}). ` +
          `Speed estimate derived from narrative and extraction only.`,
      keyFacts: physicsSpeed !== null
        ? [`Impact speed: ${physicsSpeed.toFixed(1)} km/h`, `Physics confidence: ${physicsConfidence ?? "N/A"}%`]
        : ["No physics analysis — insufficient damage photo evidence"],
      confidence: physicsConfidence !== null && physicsConfidence >= 70 ? "HIGH" : physicsConfidence !== null ? "MEDIUM" : "LOW",
    },
    {
      heading: "Reconciliation Summary",
      body: reconciliationSteps.length > 0
        ? `${reconciliationSteps.length} reconciliation steps were applied to resolve conflicts between engines.`
        : "No reconciliation was required — all engines agreed.",
      keyFacts: reconciliationSteps.slice(0, 5).map(s => `${s.field}: ${s.resolution}`),
      confidence: "HIGH",
    },
  ];

  const conflictResolutions = conflicts.map(c => ({
    field: c.field,
    conflict: c.description,
    resolution: c.resolution,
    confidence: c.confidence,
  }));

  const nextSteps: string[] = [];
  if (recommendation === "REVIEW") {
    nextSteps.push("Review the reconciliation conflicts listed above before making a final decision.");
    if (missingEvidence.length > 0) {
      nextSteps.push(`Request additional evidence: ${missingEvidence.join(", ")}`);
    }
  } else if (recommendation === "ESCALATE") {
    nextSteps.push("Escalate to fraud team if fraud score is the trigger.");
    nextSteps.push("Review all CRITICAL conflicts before proceeding.");
  }

  return {
    audience: "ASSESSOR",
    headline,
    decisionExplanation: `Recommendation: ${recommendation} — see sections below for full basis.`,
    sections,
    conflictResolutions,
    nextSteps,
    caveats: [
      `TRE v3.0 — CTO Schema v2.0.0. All values are canonical as of ${new Date().toISOString()}.`,
      "Physics values are estimates based on available evidence and may differ from physical inspection.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDITOR EXPLANATION
// ─────────────────────────────────────────────────────────────────────────────

function buildAuditorExplanation(params: ExplanationParams): TruthExplanationSummary {
  const {
    recommendation, fraudScore, costUsd, confidence, visionReliability,
    conflicts, missingEvidence, physicsSpeed, physicsConfidence,
    integrityScore, stabilityIndex, reconciliationSteps,
    regulatoryProfileId, regulatoryCompliant, complianceViolations,
    certificateId, contentHash, ctoSchemaVersion,
  } = params;

  const headline = `AUDIT RECORD — TRE v3.0 | Cert: ${certificateId ?? "N/A"} | Regulatory: ${regulatoryCompliant ? "COMPLIANT" : "NON-COMPLIANT"}`;

  const sections: TruthExplanationSection[] = [
    {
      heading: "Canonical Truth Object Metadata",
      body: `CTO Schema: ${ctoSchemaVersion}. Certificate: ${certificateId ?? "not issued"}. ` +
        `Content hash: ${contentHash ?? "N/A"}. Regulatory profile: ${regulatoryProfileId ?? "GLOBAL-DEFAULT"}.`,
      keyFacts: [
        `CTO schema version: ${ctoSchemaVersion}`,
        `Certificate ID: ${certificateId ?? "N/A"}`,
        `Content hash (SHA-256): ${contentHash ?? "N/A"}`,
        `Regulatory profile: ${regulatoryProfileId ?? "GLOBAL-DEFAULT"}`,
        `Regulatory compliant: ${regulatoryCompliant ? "YES" : "NO"}`,
      ],
      confidence: "HIGH",
    },
    {
      heading: "Full Reconciliation Log",
      body: `${reconciliationSteps.length} reconciliation steps applied across 5 passes (numeric, semantic, temporal, logical, confidence).`,
      keyFacts: reconciliationSteps.map(s => `[${s.pass}] ${s.field}: ${s.resolution} (confidence: ${s.confidence})`),
      confidence: "HIGH",
    },
    {
      heading: "Conflict Register",
      body: `${conflicts.length} conflicts detected. ${conflicts.filter(c => c.severity === "CRITICAL").length} critical.`,
      keyFacts: conflicts.map(c => `[${c.severity}] ${c.field}: ${c.description} → ${c.resolution}`),
      confidence: "HIGH",
    },
    {
      heading: "Regulatory Compliance",
      body: regulatoryCompliant
        ? `Claim satisfies all requirements of regulatory profile ${regulatoryProfileId ?? "GLOBAL-DEFAULT"}.`
        : `Claim has ${complianceViolations.length} compliance violation(s) under profile ${regulatoryProfileId ?? "GLOBAL-DEFAULT"}.`,
      keyFacts: complianceViolations.length > 0 ? complianceViolations : ["No violations"],
      confidence: "HIGH",
    },
    {
      heading: "Truth Quality Index",
      body: `Integrity score: ${integrityScore}/100. Stability index: ${stabilityIndex}/100. Overall confidence: ${confidence}%.`,
      keyFacts: [
        `Integrity score: ${integrityScore}/100`,
        `Stability index: ${stabilityIndex}/100`,
        `Vision source reliability: ${visionReliability}`,
        `Missing evidence: ${missingEvidence.length > 0 ? missingEvidence.join(", ") : "None"}`,
      ],
      confidence: integrityScore >= 75 ? "HIGH" : integrityScore >= 55 ? "MEDIUM" : "LOW",
    },
  ];

  const conflictResolutions = conflicts.map(c => ({
    field: c.field,
    conflict: `[${c.severity}] ${c.description}`,
    resolution: c.resolution,
    confidence: c.confidence,
  }));

  const nextSteps: string[] = [
    "Verify content hash against stored CTO to confirm integrity.",
    "Confirm regulatory profile is appropriate for the claim jurisdiction.",
  ];
  if (!regulatoryCompliant) {
    nextSteps.push(`Resolve compliance violations: ${complianceViolations.join("; ")}`);
  }
  if (conflicts.filter(c => c.severity === "CRITICAL").length > 0) {
    nextSteps.push("Review all CRITICAL conflicts — these may require manual resolution before archival.");
  }

  return {
    audience: "AUDITOR",
    headline,
    decisionExplanation: `Final canonical decision: ${recommendation}. Fraud: ${fraudScore}%. Cost: USD ${costUsd.toFixed(2)}.`,
    sections,
    conflictResolutions,
    nextSteps,
    caveats: [
      "This audit record is generated by TRE v3.0 and reflects the canonical truth state at time of certification.",
      "Content hash covers: recommendation, fraudRiskScore, optimisedCostUsd, overallConfidence, visionSourceReliability.",
      "Physics values are model-derived estimates — not equivalent to physical inspection findings.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export interface ExplanationConflict {
  field: string;
  description: string;
  resolution: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ExplanationReconciliationStep {
  pass: string;
  field: string;
  resolution: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ExplanationParams {
  recommendation: string;
  fraudScore: number;
  costUsd: number;
  confidence: number;
  visionReliability: string;
  physicsSpeed: number | null;
  physicsConfidence: number | null;
  integrityScore: number;
  stabilityIndex: number;
  conflicts: ExplanationConflict[];
  missingEvidence: string[];
  reconciliationSteps: ExplanationReconciliationStep[];
  regulatoryProfileId: string | null;
  regulatoryCompliant: boolean;
  complianceViolations: string[];
  certificateId: string | null;
  contentHash: string | null;
  ctoSchemaVersion: string;
}

/**
 * Generate an audience-specific explainable truth summary.
 */
export function generateExplanation(
  audience: ExplanationAudience,
  params: ExplanationParams
): TruthExplanationSummary {
  switch (audience) {
    case "CLAIMANT": return buildClaimantExplanation(params);
    case "ASSESSOR": return buildAssessorExplanation(params);
    case "AUDITOR":  return buildAuditorExplanation(params);
  }
}

/**
 * Generate all three audience explanations at once.
 */
export function generateAllExplanations(params: ExplanationParams): {
  claimant: TruthExplanationSummary;
  assessor: TruthExplanationSummary;
  auditor: TruthExplanationSummary;
} {
  return {
    claimant: buildClaimantExplanation(params),
    assessor: buildAssessorExplanation(params),
    auditor: buildAuditorExplanation(params),
  };
}
