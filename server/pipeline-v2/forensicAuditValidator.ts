/**
 * forensicAuditValidator.ts — Stage 36: Forensic Audit Validator
 *
 * A post-pipeline validation layer that runs after Stage 10 (Quality Scorer).
 * Uses the 10-dimension validation prompt to determine whether the pipeline output is:
 *   1. Factually correct
 *   2. Internally consistent
 *   3. Fully supported by extracted evidence
 *   4. Defensible for an insurance decision
 *
 * Returns a structured ValidationReport with overallStatus, issue lists,
 * consistencyScore, and confidenceInAssessment.
 */

import { invokeLLM } from "../_core/llm";
import type { PipelineResult } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationStatus = "PASS" | "WARNING" | "FAIL";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ValidationIssue {
  dimension: string;
  code: string;
  description: string;
  evidence?: string;
}

export interface ForensicAuditValidationReport {
  overallStatus: ValidationStatus;
  criticalFailures: ValidationIssue[];
  highSeverityIssues: ValidationIssue[];
  mediumIssues: ValidationIssue[];
  lowIssues: ValidationIssue[];
  consistencyScore: number;
  confidenceInAssessment: ConfidenceLevel;
  summary: string;
  validatedAt: string;
  dimensionResults: {
    dataExtraction: "PASS" | "WARNING" | "FAIL";
    incidentClassification: "PASS" | "WARNING" | "FAIL";
    imageAnalysis: "PASS" | "WARNING" | "FAIL";
    physics: "PASS" | "WARNING" | "FAIL";
    costModel: "PASS" | "WARNING" | "FAIL";
    fraudAnalysis: "PASS" | "WARNING" | "FAIL";
    crossStageConsistency: "PASS" | "WARNING" | "FAIL";
    assumptionRegistry: "PASS" | "WARNING" | "FAIL";
    reportCompleteness: "PASS" | "WARNING" | "FAIL";
    claimQualityScore: "PASS" | "WARNING" | "FAIL";
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const VALIDATOR_SYSTEM_PROMPT = `You are a forensic audit validator for the KINGA claims intelligence system.

Your task is NOT to perform a claim assessment.

Your task is to VALIDATE whether the KINGA pipeline output is:
1. Factually correct
2. Internally consistent
3. Fully supported by extracted evidence
4. Defensible for an insurance decision

Perform a full system validation across 10 dimensions:

### 1. DATA EXTRACTION VALIDATION
Check whether these fields were correctly extracted:
- Incident description
- Speed (numeric, not null if present in document)
- Vehicle details (make, model, registration, year)
- Insurer name
- Policy number (must not be a label like "EXCESS")
- Police report details (officer, charge, fine, date)
- Third-party details (if present)

Flag: Missing fields clearly present in source, incorrect mappings (label vs value confusion), suspicious defaults (e.g., speed = 0 when narrative mentions speed).

### 2. INCIDENT CLASSIFICATION VALIDATION
Check whether the classification matches the narrative.
Rules: "hit from behind", "rear-end" MUST result in rear collision. Road condition mentions (e.g. pothole) must NOT override explicit collision.
Flag: Misclassification, low-confidence classification, conflicting signals not resolved.

### 3. IMAGE ANALYSIS VALIDATION
Check: Were images actually processed? Is imageConfidenceScore consistent with number and quality of images? Does detected damage match expected damage from the narrative?
Flag: Images available but not used, damage zones inconsistent with classification, overconfidence with low image quality.

### 4. PHYSICS VALIDATION
Check: Was physics executed only when valid inputs exist? If speed was missing, was fallback estimation used? Are delta-V and force values realistic?
Flag: Physics executed with invalid inputs, all values = 0 or N/A when data exists, physics contradicts damage or narrative.

### 5. COST MODEL VALIDATION
Check: Is AI benchmark consistent with extracted quote? Does recommended cost range bracket the benchmark? Is aiEstimateSource appropriate (learning_db, quote_derived, hardcoded_fallback, insufficient_data)?
Flag: Contradictions between benchmark and range, use of fallback when sufficient data exists, missing quote-first behaviour.

### 6. FRAUD ANALYSIS VALIDATION
Check: Are fraud flags supported by evidence? Does fraud score align with classification, image evidence, police report presence?
Flag: False positives driven by missing data, high fraud score without supporting evidence.

### 7. CROSS-STAGE CONSISTENCY VALIDATION
Check for contradictions: Classification vs damage zone, physics vs damage severity, cost vs damage severity, fraud signals vs evidence.
Flag: Any inconsistency not resolved or explained.

### 8. ASSUMPTION REGISTRY VALIDATION
Check: Are assumptions explicitly listed? Are they correctly classified by type and impact?
Flag: Hidden assumptions, high-impact assumptions not surfaced.

### 9. REPORT COMPLETENESS VALIDATION
Check: All required sections present (assessor remarks, police summary, cost breakdown, evidence summary).
Flag: Missing sections, data extracted but not displayed.

### 10. CLAIM QUALITY SCORE VALIDATION
Check: Does the quality score reflect data completeness, image confidence, cost reliability?
Flag: High score with poor data, low score despite strong evidence.

---

FINAL RULE:
- If ANY critical inconsistency or contradiction exists → overallStatus MUST be "FAIL"
- If minor issues exist but core logic is sound → overallStatus = "WARNING"
- If all dimensions are consistent and supported → overallStatus = "PASS"

---

Return ONLY valid JSON in this exact schema (no markdown, no explanation outside JSON):
{
  "overallStatus": "PASS|WARNING|FAIL",
  "criticalFailures": [{"dimension": "string", "code": "string", "description": "string", "evidence": "string"}],
  "highSeverityIssues": [{"dimension": "string", "code": "string", "description": "string", "evidence": "string"}],
  "mediumIssues": [{"dimension": "string", "code": "string", "description": "string", "evidence": "string"}],
  "lowIssues": [{"dimension": "string", "code": "string", "description": "string", "evidence": "string"}],
  "consistencyScore": 0,
  "confidenceInAssessment": "HIGH|MEDIUM|LOW",
  "summary": "string",
  "dimensionResults": {
    "dataExtraction": "PASS|WARNING|FAIL",
    "incidentClassification": "PASS|WARNING|FAIL",
    "imageAnalysis": "PASS|WARNING|FAIL",
    "physics": "PASS|WARNING|FAIL",
    "costModel": "PASS|WARNING|FAIL",
    "fraudAnalysis": "PASS|WARNING|FAIL",
    "crossStageConsistency": "PASS|WARNING|FAIL",
    "assumptionRegistry": "PASS|WARNING|FAIL",
    "reportCompleteness": "PASS|WARNING|FAIL",
    "claimQualityScore": "PASS|WARNING|FAIL"
  }
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeJson(v: unknown): string {
  try { return JSON.stringify(v, null, 0); } catch { return "null"; }
}

function buildValidationPayload(result: PipelineResult): string {
  // Read from the actual pipeline result field names (PipelineV2Result shape)
  const r = result as any;
  const cr = r.claimRecord ?? {};
  const vehicle = cr.vehicle ?? {};
  const accident = cr.accidentDetails ?? {};
  const police = cr.policeReport ?? {};
  const insurance = cr.insuranceContext ?? {};
  const damage = cr.damage ?? {};
  const repairQuote = cr.repairQuote ?? {};
  const assumptions = cr.assumptions ?? [];

  // Analysis outputs use the correct field names from PipelineV2Result
  const phys = r.physicsAnalysis ?? {};
  const cost = r.costAnalysis ?? {};
  const fraud = r.fraudAnalysis ?? {};
  const damageAnalysis = r.damageAnalysis ?? {};
  const report = r.report ?? {};
  const quality = report.claimQuality ?? {};
  const narrative = accident.narrativeAnalysis ?? {};

  // Image analysis
  const photoUrls: string[] = damage.imageUrls ?? [];
  const photosProcessed = photoUrls.length;
  const imageConfidenceScore = damageAnalysis.confidenceScore ?? damageAnalysis.imageAnalysisSuccessRate ?? "N/A";
  const detectedDamage = damageAnalysis.detectedComponents ?? damageAnalysis.components ?? [];

  // Cost fields
  const costTotalCents = cost.totalExpectedCents ?? cost.agreedCostCents ?? null;
  const costSource = cost.aiEstimateSource ?? cost.source ?? "N/A";
  const quoteTotalCents = repairQuote.quoteTotalCents ?? cost.quoteTotalCents ?? null;
  const quoteFirstApplied = cost.quoteFirstApplied ?? (quoteTotalCents && costTotalCents === quoteTotalCents ? "YES" : "NO");
  const recommendedRange = cost.recommendedRange ?? cost.range ?? {};

  // Fraud fields
  const fraudScore = fraud.overallScore ?? fraud.fraudScore ?? null;
  const fraudRiskLevel = fraud.riskLevel ?? fraud.fraudRiskLevel ?? null;
  const fraudFlags = fraud.flags ?? fraud.fraudFlags ?? [];

  // Report completeness
  const reportSections: any[] = report.sections ?? [];
  const hasAssessorRemarks = reportSections.some((s: any) => s.type === 'assessor_remarks' || (s.title ?? '').toLowerCase().includes('assessor'));
  const hasPoliceSummary = !!(police.reportNumber || police.officerName || police.station);
  const hasCostBreakdown = !!(costTotalCents || (repairQuote.lineItems?.length ?? 0) > 0);
  const hasEvidenceSummary = reportSections.some((s: any) => s.type === 'evidence' || (s.title ?? '').toLowerCase().includes('evidence'));

  return `## PIPELINE OUTPUT FOR VALIDATION

### EXTRACTED DATA
- Incident description: ${accident.description ?? "NOT EXTRACTED"}
- Speed: ${accident.estimatedSpeedKmh ?? "NOT EXTRACTED"}
- Vehicle make: ${vehicle.make ?? "NOT EXTRACTED"}
- Vehicle model: ${vehicle.model ?? "NOT EXTRACTED"}
- Vehicle registration: ${vehicle.registration ?? "NOT EXTRACTED"}
- Vehicle year: ${vehicle.year ?? "NOT EXTRACTED"}
- Insurer: ${insurance.insurerName ?? "NOT EXTRACTED"}
- Policy number: ${insurance.policyNumber ?? "NOT EXTRACTED"}
- Police officer: ${police.officerName ?? "NOT EXTRACTED"}
- Police charge: ${police.chargeNumber ?? "NOT EXTRACTED"}
- Police fine: ${police.fineAmountCents ? (police.fineAmountCents / 100).toFixed(2) : "NOT EXTRACTED"}
- Third party present: ${cr.thirdParty ? "YES" : (accident.description?.toLowerCase().includes('third') ? "POSSIBLE" : "NOT EXTRACTED")}

### INCIDENT CLASSIFICATION
- Type: ${accident.incidentType ?? accident.incidentClassification ?? "NOT CLASSIFIED"}
- Sub-type: ${accident.incidentSubType ?? "N/A"}
- Collision direction: ${accident.collisionDirection ?? "N/A"}
- Damage zones: ${safeJson((damage.components ?? []).map((c: any) => c.zone ?? c.component ?? c))}

### IMAGE ANALYSIS
- Photos processed: ${photosProcessed}
- Image confidence score: ${imageConfidenceScore}
- Detected damage components: ${safeJson(detectedDamage)}
- Damage description: ${damage.description ?? "N/A"}

### PHYSICS ANALYSIS
${safeJson(phys)}

### COST ANALYSIS
- AI estimate source: ${costSource}
- Total expected (cents): ${costTotalCents ?? "N/A"}
- Recommended range: ${safeJson(recommendedRange)}
- Quote total (cents): ${quoteTotalCents ?? "N/A"}
- Quote first applied: ${quoteFirstApplied}
- Labour cost (cents): ${repairQuote.labourCostCents ?? "N/A"}
- Parts cost (cents): ${repairQuote.partsCostCents ?? "N/A"}
- Line items count: ${repairQuote.lineItems?.length ?? 0}

### FRAUD ANALYSIS
- Fraud score: ${fraudScore ?? "N/A"}
- Fraud risk level: ${fraudRiskLevel ?? "N/A"}
- Fraud flags: ${safeJson(fraudFlags)}
- Police report present: ${hasPoliceSummary ? "YES" : "NO"}

### NARRATIVE ANALYSIS
${safeJson(narrative)}

### ASSUMPTION REGISTRY
- Total assumptions: ${Array.isArray(assumptions) ? assumptions.length : 0}
- High impact: ${Array.isArray(assumptions) ? assumptions.filter((a: any) => a.impact === 'HIGH').length : 0}
- Sample assumptions: ${safeJson(Array.isArray(assumptions) ? assumptions.slice(0, 5) : [])}

### CLAIM QUALITY SCORE
- Grade: ${quality.grade ?? "N/A"}
- Score: ${quality.overallScore ?? "N/A"}/100
- Manual review required: ${quality.requiresManualReview ?? "N/A"}
- Dimensions: ${safeJson(quality.dimensions ?? {})}

### REPORT SECTIONS PRESENT
- Assessor remarks: ${hasAssessorRemarks ? "YES" : "NO"}
- Police summary: ${hasPoliceSummary ? "YES" : "NO"}
- Cost breakdown: ${hasCostBreakdown ? "YES" : "NO"}
- Evidence summary: ${hasEvidenceSummary ? "YES" : "NO"}
- Total report sections: ${reportSections.length}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function runForensicAuditValidation(
  result: PipelineResult
): Promise<ForensicAuditValidationReport | null> {
  try {
    const payload = buildValidationPayload(result);

    const response = await invokeLLM({
      messages: [
        { role: "system", content: VALIDATOR_SYSTEM_PROMPT },
        { role: "user", content: payload },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "forensic_audit_validation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              overallStatus: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
              criticalFailures: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    dimension: { type: "string" },
                    code: { type: "string" },
                    description: { type: "string" },
                    evidence: { type: "string" },
                  },
                  required: ["dimension", "code", "description", "evidence"],
                  additionalProperties: false,
                },
              },
              highSeverityIssues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    dimension: { type: "string" },
                    code: { type: "string" },
                    description: { type: "string" },
                    evidence: { type: "string" },
                  },
                  required: ["dimension", "code", "description", "evidence"],
                  additionalProperties: false,
                },
              },
              mediumIssues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    dimension: { type: "string" },
                    code: { type: "string" },
                    description: { type: "string" },
                    evidence: { type: "string" },
                  },
                  required: ["dimension", "code", "description", "evidence"],
                  additionalProperties: false,
                },
              },
              lowIssues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    dimension: { type: "string" },
                    code: { type: "string" },
                    description: { type: "string" },
                    evidence: { type: "string" },
                  },
                  required: ["dimension", "code", "description", "evidence"],
                  additionalProperties: false,
                },
              },
              consistencyScore: { type: "number" },
              confidenceInAssessment: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
              summary: { type: "string" },
              dimensionResults: {
                type: "object",
                properties: {
                  dataExtraction: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  incidentClassification: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  imageAnalysis: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  physics: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  costModel: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  fraudAnalysis: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  crossStageConsistency: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  assumptionRegistry: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  reportCompleteness: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                  claimQualityScore: { type: "string", enum: ["PASS", "WARNING", "FAIL"] },
                },
                required: [
                  "dataExtraction", "incidentClassification", "imageAnalysis", "physics",
                  "costModel", "fraudAnalysis", "crossStageConsistency", "assumptionRegistry",
                  "reportCompleteness", "claimQualityScore",
                ],
                additionalProperties: false,
              },
            },
            required: [
              "overallStatus", "criticalFailures", "highSeverityIssues", "mediumIssues",
              "lowIssues", "consistencyScore", "confidenceInAssessment", "summary", "dimensionResults",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    return {
      ...parsed,
      validatedAt: new Date().toISOString(),
    } as ForensicAuditValidationReport;
  } catch (err: any) {
    console.error("[ForensicAuditValidator] Validation failed:", err?.message ?? err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback for when LLM is unavailable
// ─────────────────────────────────────────────────────────────────────────────

export function buildFallbackValidationReport(reason: string): ForensicAuditValidationReport {
  return {
    overallStatus: "WARNING",
    criticalFailures: [],
    highSeverityIssues: [
      {
        dimension: "System",
        code: "VALIDATOR_UNAVAILABLE",
        description: `Forensic audit validator could not run: ${reason}`,
        evidence: "LLM service unavailable or timed out",
      },
    ],
    mediumIssues: [],
    lowIssues: [],
    consistencyScore: 0,
    confidenceInAssessment: "LOW",
    summary: "Validation could not be completed due to a system error. Manual review is required.",
    validatedAt: new Date().toISOString(),
    dimensionResults: {
      dataExtraction: "WARNING",
      incidentClassification: "WARNING",
      imageAnalysis: "WARNING",
      physics: "WARNING",
      costModel: "WARNING",
      fraudAnalysis: "WARNING",
      crossStageConsistency: "WARNING",
      assumptionRegistry: "WARNING",
      reportCompleteness: "WARNING",
      claimQualityScore: "WARNING",
    },
  };
}
