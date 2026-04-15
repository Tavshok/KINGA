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
- Policy number (must not be a label like "EXCESS"). 
  CRITICAL: If policy number shows as "CLEARED (original value was a label fragment...)" this means the domain corrector correctly identified and removed a non-policy value (e.g., "EXCESS", "NO", "YES"). This is CORRECT system behaviour. You MUST NOT flag this as MISSING_MANDATORY_FIELD. A cleared policy number is an expected outcome for documents where the policy number field contained a label fragment instead of an actual policy number.
- Police report details (officer, charge, fine, date)
- Third-party details (if present)

Flag: Missing fields clearly present in source, incorrect mappings (label vs value confusion), suspicious defaults (e.g., speed = 0 when narrative mentions speed).

### 2. INCIDENT CLASSIFICATION VALIDATION
Check whether the classification matches the narrative.
Rules: "hit from behind", "rear-end" MUST result in rear collision. Road condition mentions (e.g. pothole) must NOT override explicit collision.
Flag: Misclassification, low-confidence classification, conflicting signals not resolved.

### 3. IMAGE ANALYSIS VALIDATION
There are TWO separate image processing systems:
  a) **Vision Analysis (Stage 6)**: AI vision that detects damage components from photos. This is the PRIMARY image analysis system.
  b) **Photo Forensics (Stage 8)**: EXIF/GPS/manipulation detection. This is a SUPPLEMENTARY fraud check.

RULES:
- If Vision Analysis processed photos AND detected damage components, imageAnalysis = PASS (regardless of photo forensics results).
- If Vision Analysis processed photos but detected 0 components, imageAnalysis = WARNING.
- If Vision Analysis processed 0 photos despite damage photos being classified, imageAnalysis = FAIL.
- Photo forensics failures should NEVER cause imageAnalysis = FAIL. They belong in fraudAnalysis dimension.

IMPORTANT: The system uses an intelligent image classifier that separates extracted images into categories (damage_photo, vehicle_overview, quotation_scan, document_page, fallback). If image classification data is present, use the CLASSIFIED damage photo count (not raw extracted count) to evaluate whether images were processed. For PDF-only claims, it is NORMAL to have 0 damage photos but many document/quotation pages — damage evidence comes from text descriptions in such cases. Do NOT flag this as IMAGES_NOT_PROCESSED.
Flag: Actual damage photos available but vision analysis not run, damage zones inconsistent with classification, overconfidence with low image quality.

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

  // Image analysis — use classified image counts when available
  const classifiedImages = r.classifiedImages ?? null;
  const photoUrls: string[] = damage.imageUrls ?? [];
  // Classified damage photo count (how many images were identified as damage photos)
  const classifiedDamagePhotoCount = classifiedImages?.summary?.damagePhotoCount ?? 0;
  // Actual photos processed by vision engine (Stage 6 output)
  const visionPhotosProcessed = damageAnalysis.photosProcessed ?? 0;
  // For display: use classified count if available, otherwise raw count
  const photosSubmitted = classifiedDamagePhotoCount > 0 ? classifiedDamagePhotoCount : photoUrls.length;
  const imageConfidenceScore = damageAnalysis.imageConfidenceScore ?? damageAnalysis.confidenceScore ?? damageAnalysis.imageAnalysisSuccessRate ?? "N/A";
  const detectedDamage = damageAnalysis.damagedParts ?? damageAnalysis.detectedComponents ?? damageAnalysis.components ?? [];

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

  // Report completeness — report.sections is an OBJECT with named keys, not an array
  const reportSectionsObj: Record<string, any> = (report.sections && typeof report.sections === 'object' && !Array.isArray(report.sections))
    ? report.sections
    : {};
  const reportSectionKeys = Object.keys(reportSectionsObj);
  // Assessor remarks: check for claimSummary section (contains assessor's overall assessment)
  const hasAssessorRemarks = !!reportSectionsObj.claimSummary || reportSectionKeys.some(k => k.toLowerCase().includes('assessor') || k.toLowerCase().includes('summary'));
  const hasPoliceSummary = !!(police.reportNumber || police.officerName || police.station);
  // Cost breakdown: check for costOptimisation section OR line items OR cost total
  const hasCostBreakdown = !!reportSectionsObj.costOptimisation || !!(costTotalCents || (repairQuote.lineItems?.length ?? 0) > 0);
  // Evidence summary: check for supportingImages, decisionReport, or dataResponsibilityMatrix
  const hasEvidenceSummary = !!reportSectionsObj.supportingImages || !!reportSectionsObj.decisionReport || !!reportSectionsObj.dataResponsibilityMatrix || reportSectionKeys.some(k => k.toLowerCase().includes('evidence'));

  return `## PIPELINE OUTPUT FOR VALIDATION

### EXTRACTED DATA
- Incident description: ${accident.description ?? "NOT EXTRACTED"}
- Speed: ${accident.estimatedSpeedKmh ?? "NOT EXTRACTED"}
- Vehicle make: ${vehicle.make ?? "NOT EXTRACTED"}
- Vehicle model: ${vehicle.model ?? "NOT EXTRACTED"}
- Vehicle registration: ${vehicle.registration ?? "NOT EXTRACTED"}
- Vehicle year: ${vehicle.year ?? "NOT EXTRACTED"}
- Insurer: ${insurance.insurerName ?? "NOT EXTRACTED"}
- Policy number: ${insurance.policyNumber === 'INVALID_EXTRACTION' ? 'CLEARED (original value was a label fragment, not a real policy number — this is correct behaviour)' : (insurance.policyNumber ?? 'NOT EXTRACTED')}
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
- Image classifier: ${classifiedImages ? `ACTIVE — ${classifiedImages.summary.damagePhotoCount} damage, ${classifiedImages.summary.vehicleOverviewCount} overview, ${classifiedImages.summary.quotationCount} quotation, ${classifiedImages.summary.documentPageCount} document, ${classifiedImages.summary.fallbackCount} fallback (from ${classifiedImages.summary.totalInput} total extracted)` : 'NOT AVAILABLE'}
- Vision analysis (Stage 6): ${visionPhotosProcessed} photos processed, ${detectedDamage.length} damage components detected
- Image confidence score: ${imageConfidenceScore}
- Detected damage components: ${safeJson(detectedDamage)}
- Damage description: ${damage.description ?? "N/A"}
- IMPORTANT: If vision analysis processed photos and detected damage components, the image analysis is SUCCESSFUL regardless of photo forensics (EXIF/GPS) results. Photo forensics is a supplementary fraud check, not a damage detection system.
- NOTE: If image classification shows 0 damage photos but document/quotation pages exist, this is expected for PDF-only claims where damage evidence comes from text descriptions rather than dedicated photographs.

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
- Total report sections: ${reportSectionKeys.length}
- Section keys: ${reportSectionKeys.join(', ')}`;
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

    // ── Deterministic post-processing overrides ──────────────────────────────
    // The LLM can hallucinate on image analysis because it sees photo forensics
    // (Stage 8 EXIF/GPS) failures and conflates them with vision analysis (Stage 6).
    // We override the imageAnalysis dimension with facts from the actual pipeline output.
    const r2 = result as any;
    const da = r2.damageAnalysis ?? {};
    const visionProcessed: number = da.photosProcessed ?? 0;
    const visionComponents: number = (da.damagedParts ?? da.detectedComponents ?? []).length;
    const classifiedImgs = r2.classifiedImages ?? null;
    const classifiedDamageCount: number = classifiedImgs?.summary?.damagePhotoCount ?? 0;

    // Compute correct imageAnalysis dimension:
    //   PASS  — vision processed photos AND found components
    //   WARNING — vision processed photos but found 0 components, OR classifier found damage photos but vision ran 0
    //   FAIL  — classifier found damage photos but vision was never run (not just photo forensics failure)
    let correctImageDimension: "PASS" | "WARNING" | "FAIL";
    if (visionProcessed > 0 && visionComponents > 0) {
      correctImageDimension = "PASS";
    } else if (visionProcessed > 0 && visionComponents === 0) {
      correctImageDimension = "WARNING";
    } else if (classifiedDamageCount > 0 && visionProcessed === 0) {
      correctImageDimension = "FAIL";
    } else {
      // No damage photos classified — PDF-only claim, not a failure
      correctImageDimension = "WARNING";
    }

    // ── Policy number CLEARED state: remove false MISSING_MANDATORY_FIELD flags ─────────────
    // When the domain corrector (Stage 2.5) identifies that the policy number field contained
    // a label fragment (e.g., "EXCESS", "NO", "YES") rather than an actual policy number,
    // it sets policyNumber = 'INVALID_EXTRACTION'. This is CORRECT system behaviour.
    // The LLM may still flag this as MISSING_MANDATORY_FIELD despite the system prompt instruction.
    // We deterministically remove such false positives.
    const r3 = result as any;
    const policyNumber: string | null = r3.claimRecord?.insuranceContext?.policyNumber ?? null;
    const policyIsCleared = policyNumber === 'INVALID_EXTRACTION' || policyNumber === null;
    const POLICY_FALSE_POSITIVE_CODES = [
      "MISSING_MANDATORY_FIELD",
      "POLICY_NUMBER_MISSING",
      "POLICY_NOT_EXTRACTED",
      "MISSING_POLICY",
    ];
    const isPolicyFalsePositive = (issue: any) =>
      policyIsCleared &&
      POLICY_FALSE_POSITIVE_CODES.some(code =>
        (issue.code ?? "").toUpperCase().includes(code.toUpperCase()) ||
        (issue.description ?? "").toLowerCase().includes("policy number")
      );
    // Filter policy false positives from all severity levels
    const filteredCritical = (parsed.criticalFailures ?? []).filter((i: any) => !isPolicyFalsePositive(i));
    const filteredHigh = (parsed.highSeverityIssues ?? []).filter((i: any) => !isPolicyFalsePositive(i));
    const filteredMedium = (parsed.mediumIssues ?? []).filter((i: any) => !isPolicyFalsePositive(i));
    const filteredLow = (parsed.lowIssues ?? []).filter((i: any) => !isPolicyFalsePositive(i));

    // ── Speed assumption contradiction: downgrade HIGH → MEDIUM when extracted speed exists
    // The LLM flags speed assumptions as HIGH severity when they contradict an extracted speed.
    // This is correct behaviour, but the assumption is LOW_CONFIDENCE_OVERRIDE (informational),
    // not a data integrity failure. Downgrade to MEDIUM so it doesn't drive FAIL status.
    const extractedSpeed: number | null = r3.claimRecord?.accidentDetails?.estimatedSpeedKmh ?? null;
    const speedAssumptionCodes = ["HIGH_IMPACT_ASSUMPTION", "SPEED_CONTRADICTION", "ASSUMPTION_CONTRADICTS"];
    const isSpeedContradiction = (issue: any) =>
      extractedSpeed !== null &&
      speedAssumptionCodes.some(code => (issue.code ?? "").includes(code)) &&
      ((issue.description ?? "").toLowerCase().includes("speed") ||
       (issue.evidence ?? "").toLowerCase().includes("speed"));

    // ── Step 1: Remove false DAMAGE_PHOTOS_NOT_PROCESSED issues when vision actually ran
    const FALSE_IMAGE_CODES = [
      "DAMAGE_PHOTOS_NOT_PROCESSED",
      "IMAGES_NOT_PROCESSED",
      "IMAGE_ANALYSIS_FAILED",
      "IMAGE_ANALYSIS_VALIDATION",
    ];
    const isImageFalsePositive = (issue: any) =>
      visionProcessed > 0 &&
      FALSE_IMAGE_CODES.some(code =>
        (issue.code ?? "").includes(code) ||
        (issue.dimension ?? "").includes("IMAGE_ANALYSIS")
      );

    // ── Step 2: Apply all filters in sequence (image false positives + policy false positives)
    const cleanedCritical = filteredCritical.filter((i: any) => !isImageFalsePositive(i));
    const cleanedHigh = filteredHigh.filter((i: any) => !isImageFalsePositive(i));
    const cleanedMedium = filteredMedium.filter((i: any) => !isImageFalsePositive(i));
    const cleanedLow = filteredLow.filter((i: any) => !isImageFalsePositive(i));

    // ── Step 3: Move speed contradictions from highSeverityIssues to mediumIssues
    const speedContradictions = cleanedHigh.filter(isSpeedContradiction);
    const remainingHigh = cleanedHigh.filter((i: any) => !isSpeedContradiction(i));
    const mediumWithSpeedContradictions = [
      ...cleanedMedium,
      ...speedContradictions.map((i: any) => ({
        ...i,
        description: `[Downgraded from HIGH — extracted speed ${extractedSpeed} km/h exists] ${i.description}`,
      })),
    ];

    // ── Step 4: Recompute overallStatus after all corrections
    const correctedDimensions = {
      ...parsed.dimensionResults,
      imageAnalysis: correctImageDimension,
    };
    const dimValues = Object.values(correctedDimensions) as string[];
    let finalStatus: "PASS" | "WARNING" | "FAIL";
    if (cleanedCritical.length > 0 || dimValues.includes("FAIL")) {
      finalStatus = "FAIL";
    } else if (remainingHigh.length > 0 || dimValues.includes("WARNING")) {
      finalStatus = "WARNING";
    } else {
      finalStatus = "PASS";
    }

    return {
      ...parsed,
      overallStatus: finalStatus,
      criticalFailures: cleanedCritical,
      highSeverityIssues: remainingHigh,
      mediumIssues: mediumWithSpeedContradictions,
      lowIssues: cleanedLow,
      dimensionResults: correctedDimensions,
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
