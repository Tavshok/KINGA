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
  // Honest photo accounting from Stage 6 (see docs/image-processing-architecture.md)
  const visionPhotosAvailable = damageAnalysis.photosAvailable ?? damageAnalysis.photosProcessed ?? 0;
  const visionPhotosProcessed = damageAnalysis.photosProcessed ?? 0;
  const visionPhotosDeferred = damageAnalysis.photosDeferred ?? 0;
  const visionPhotosFailed = damageAnalysis.photosFailed ?? 0;
  const visionCoverageRatio = visionPhotosAvailable > 0 ? (visionPhotosProcessed / visionPhotosAvailable) : 0;
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
- Vision analysis (Stage 6): ${visionPhotosAvailable} available, ${visionPhotosProcessed} processed (${(visionCoverageRatio * 100).toFixed(0)}% coverage), ${visionPhotosDeferred} deferred, ${visionPhotosFailed} failed, ${detectedDamage.length} damage components detected
- Image confidence score: ${imageConfidenceScore}
- Detected damage components: ${safeJson(detectedDamage)}
- Damage description: ${damage.description ?? "N/A"}
- IMPORTANT: If vision analysis processed photos and detected damage components, the image analysis is SUCCESSFUL regardless of photo forensics (EXIF/GPS) results. Photo forensics is a supplementary fraud check, not a damage detection system.
- NOTE: 'deferred' photos are photos that were available but not processed in this run due to processing budget. This is NOT a failure — it means the highest-priority photos were processed first.
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
    // Honest photo accounting fields from Stage 6 (see docs/image-processing-architecture.md)
    const photosAvailable: number = da.photosAvailable ?? da.photosProcessed ?? 0;
    const photosProcessed: number = da.photosProcessed ?? 0;
    const photosDeferred: number = da.photosDeferred ?? 0;
    const photosFailed: number = da.photosFailed ?? 0;
    const visionComponents: number = (da.damagedParts ?? da.detectedComponents ?? []).length;
    // Coverage ratio: how much of the available evidence was actually examined
    const coverageRatio = photosAvailable > 0 ? photosProcessed / photosAvailable : 0;

    // Compute correct imageAnalysis dimension using honest accounting:
    //   PASS    — processed ≥50% of available photos AND found components
    //   WARNING — processed some photos but coverage <50%, OR processed all but found 0 components
    //   FAIL    — photos were available but NONE were processed (complete vision failure)
    let correctImageDimension: "PASS" | "WARNING" | "FAIL";
    if (photosAvailable === 0) {
      // No photos available — PDF-only claim, not a vision failure
      correctImageDimension = visionComponents > 0 ? "PASS" : "WARNING";
    } else if (photosProcessed === 0) {
      // Photos were available but vision was never run — genuine failure
      correctImageDimension = "FAIL";
    } else if (coverageRatio >= 0.5 && visionComponents > 0) {
      correctImageDimension = "PASS";
    } else if (photosProcessed > 0 && visionComponents > 0) {
      // Processed some photos (coverage <50%) but still found components — acceptable
      correctImageDimension = "WARNING";
    } else {
      // Processed photos but found 0 components
      correctImageDimension = "WARNING";
    }

    // ── Policy number CLEARED state: reclassify (not suppress) MISSING_MANDATORY_FIELD flags ───
    // When the domain corrector (Stage 2.5) identifies that the policy number field contained
    // a label fragment (e.g., "EXCESS", "NO", "YES") rather than an actual policy number,
    // it sets policyNumber = 'INVALID_EXTRACTION'. This is CORRECT system behaviour.
    // The LLM may still flag this as MISSING_MANDATORY_FIELD despite the system prompt instruction.
    // We do NOT suppress these flags — we reclassify them as INFO severity so they remain
    // visible for audits, disputes, and regulator reviews, but do not drive FAIL/WARNING status.
    const r3 = result as any;
    const policyNumber: string | null = r3.claimRecord?.insuranceContext?.policyNumber ?? null;
    const policyIsCleared = policyNumber === 'INVALID_EXTRACTION' || policyNumber === null;
    const POLICY_RECLASSIFY_CODES = [
      "MISSING_MANDATORY_FIELD",
      "POLICY_NUMBER_MISSING",
      "POLICY_NOT_EXTRACTED",
      "MISSING_POLICY",
    ];
    const isPolicyReclassifiable = (issue: any) =>
      policyIsCleared &&
      POLICY_RECLASSIFY_CODES.some(code =>
        (issue.code ?? "").toUpperCase().includes(code.toUpperCase()) ||
        (issue.description ?? "").toLowerCase().includes("policy number")
      );
    // Reclassify policy number issues: move from critical/high/medium to lowIssues with INFO marker
    const policyReclassifiedIssues: any[] = [];
    const filteredCritical = (parsed.criticalFailures ?? []).filter((i: any) => {
      if (isPolicyReclassifiable(i)) {
        policyReclassifiedIssues.push({
          ...i,
          dimension: i.dimension ?? 'dataExtraction',
          code: 'POLICY_NUMBER_CLEARED',
          description: `[INFO — system intervention] Policy number field contained a label fragment, not a real policy number. Domain corrector cleared this field. Original issue: ${i.description}`,
          severity: 'INFO',
        });
        return false;
      }
      return true;
    });
    const filteredHigh = (parsed.highSeverityIssues ?? []).filter((i: any) => {
      if (isPolicyReclassifiable(i)) {
        policyReclassifiedIssues.push({
          ...i,
          dimension: i.dimension ?? 'dataExtraction',
          code: 'POLICY_NUMBER_CLEARED',
          description: `[INFO — system intervention] Policy number field contained a label fragment, not a real policy number. Domain corrector cleared this field. Original issue: ${i.description}`,
          severity: 'INFO',
        });
        return false;
      }
      return true;
    });
    const filteredMedium = (parsed.mediumIssues ?? []).filter((i: any) => {
      if (isPolicyReclassifiable(i)) {
        policyReclassifiedIssues.push({
          ...i,
          dimension: i.dimension ?? 'dataExtraction',
          code: 'POLICY_NUMBER_CLEARED',
          description: `[INFO — system intervention] Policy number field contained a label fragment, not a real policy number. Domain corrector cleared this field. Original issue: ${i.description}`,
          severity: 'INFO',
        });
        return false;
      }
      return true;
    });
    const filteredLow = [
      ...(parsed.lowIssues ?? []),
      ...policyReclassifiedIssues,
    ];

    // ── SCENARIO-AWARE POST-PROCESSING ──────────────────────────────────────────────────────────
    // Each collision scenario has distinct evidence requirements. We apply deterministic corrections
    // AFTER the LLM has run, so the LLM still sees and flags everything — we only adjust severity.
    // Order: (A) hit-and-run escalation → (B) parking lot suppression → (C) head-on advisory
    // These run before the image/speed filters so all arrays are consistent downstream.
    const collisionScenario: string = r3.claimRecord?.accidentDetails?.collisionScenario ?? 'unknown';
    const isHitAndRun: boolean = !!(r3.claimRecord?.accidentDetails?.isHitAndRun);
    const isParkingLot: boolean = !!(r3.claimRecord?.accidentDetails?.isParkingLotDamage);
    const hasPoliceSummaryForScenario: boolean = !!(r3.claimRecord?.policeReport?.reportNumber ||
      r3.claimRecord?.policeReport?.officerName ||
      r3.claimRecord?.policeReport?.station ||
      r3.claimRecord?.policeReport?.chargeNumber);
    const POLICE_REPORT_CODES = [
      'POLICE_REPORT_MISSING', 'POLICE_REPORT_NOT_PROVIDED', 'MISSING_POLICE_REPORT',
      'NO_POLICE_REPORT', 'POLICE_REPORT_ABSENT', 'POLICE_REPORT_REQUIRED',
    ];
    const isPoliceReportIssue = (issue: any) =>
      POLICE_REPORT_CODES.some(code =>
        (issue.code ?? '').toUpperCase().includes(code.toUpperCase()) ||
        (issue.description ?? '').toLowerCase().includes('police report')
      );

    // (A) Hit-and-run: missing police report → CRITICAL ─────────────────────────────────────────
    // Without a police report, a hit-and-run claim has no independent verification whatsoever.
    const scenarioEscalatedCritical: any[] = [];
    const scenarioEscalatedHigh: any[] = [];
    let workingCritical = filteredCritical;
    let workingHigh = filteredHigh;
    let workingMedium = filteredMedium;
    let workingLow = filteredLow;

    if (isHitAndRun && !hasPoliceSummaryForScenario) {
      const escalated: any[] = [];
      workingHigh = workingHigh.filter((i: any) => { if (isPoliceReportIssue(i)) { escalated.push(i); return false; } return true; });
      workingMedium = workingMedium.filter((i: any) => { if (isPoliceReportIssue(i)) { escalated.push(i); return false; } return true; });
      workingLow = workingLow.filter((i: any) => { if (isPoliceReportIssue(i)) { escalated.push(i); return false; } return true; });
      const escalatedAsCritical = escalated.map((i: any) => ({
        ...i,
        code: 'POLICE_REPORT_MANDATORY_HIT_AND_RUN',
        description: `[ESCALATED TO CRITICAL — hit-and-run] A police report is mandatory for hit-and-run claims. Without it the claim has no independent verification. Original: ${i.description}`,
        severity: 'CRITICAL',
      }));
      // If LLM did not flag it at all, inject a new critical failure
      const alreadyInCritical = workingCritical.some(isPoliceReportIssue);
      if (escalatedAsCritical.length === 0 && !alreadyInCritical) {
        escalatedAsCritical.push({
          dimension: 'dataExtraction',
          code: 'POLICE_REPORT_MANDATORY_HIT_AND_RUN',
          description: '[CRITICAL — hit-and-run] Police report is mandatory for hit-and-run claims. No police report details were found. This claim cannot proceed without a police report number or officer details.',
          evidence: `collisionScenario=${collisionScenario}; policeReport fields are empty`,
          severity: 'CRITICAL',
        });
      }
      workingCritical = [...workingCritical, ...escalatedAsCritical];
    }

    // (B) Parking lot: police report gap → INFO (not expected for parking lot damage) ──────────
    if (isParkingLot) {
      const reclassified: any[] = [];
      const reclassify = (i: any) => ({
        ...i,
        code: 'POLICE_REPORT_NOT_REQUIRED_PARKING_LOT',
        description: `[INFO — parking lot] Police attendance is not standard for parking lot damage. Original: ${i.description}`,
        severity: 'INFO',
      });
      workingCritical = workingCritical.filter((i: any) => { if (isPoliceReportIssue(i)) { reclassified.push(reclassify(i)); return false; } return true; });
      workingHigh = workingHigh.filter((i: any) => { if (isPoliceReportIssue(i)) { reclassified.push(reclassify(i)); return false; } return true; });
      workingMedium = workingMedium.filter((i: any) => { if (isPoliceReportIssue(i)) { reclassified.push(reclassify(i)); return false; } return true; });
      workingLow = [...workingLow, ...reclassified];
    }

    // (C) Head-on: missing police report → inject HIGH advisory if LLM missed it ──────────────
    if (collisionScenario === 'head_on' && !hasPoliceSummaryForScenario) {
      const alreadyFlagged = [...workingCritical, ...workingHigh].some(isPoliceReportIssue);
      if (!alreadyFlagged) {
        workingHigh = [...workingHigh, {
          dimension: 'dataExtraction',
          code: 'POLICE_REPORT_EXPECTED_HEAD_ON',
          description: '[HIGH — head-on] Police attendance is expected for head-on collisions. No police report details found. Recommend requesting police report before settlement.',
          evidence: `collisionScenario=${collisionScenario}; policeReport fields are empty`,
          severity: 'HIGH',
        }];
      }
    }

    // (D) Scenario-damage mismatch: inject HIGH forensic flag when Stage 7 detected inconsistency
    // e.g. scenario = rear_end_struck but primary damage is frontal — contradicts the claimed scenario
    const scenarioDamageMismatch: boolean = !!(r3.claimRecord?.accidentDetails?.scenarioDamageMismatch);
    if (scenarioDamageMismatch) {
      const alreadyFlagged = [...workingCritical, ...workingHigh].some((i: any) =>
        (i.code ?? '').includes('SCENARIO_DAMAGE_MISMATCH') ||
        (i.description ?? '').toLowerCase().includes('scenario') && (i.description ?? '').toLowerCase().includes('damage')
      );
      if (!alreadyFlagged) {
        workingHigh = [...workingHigh, {
          dimension: 'incidentClassification',
          code: 'SCENARIO_DAMAGE_MISMATCH',
          description: `[HIGH — physics] The claimed collision scenario (${collisionScenario}) is inconsistent with the primary damage zone identified by the physics engine. This contradiction requires adjuster review before settlement.`,
          evidence: `collisionScenario=${collisionScenario}; scenarioDamageMismatch=true (Stage 7 flag)`,
          severity: 'HIGH',
        }];
      }
    }

    // (E) Stakeholder contradiction: inject HIGH advisory when narrative engine detected contradictions
    // between claimant, third party, and police accounts — these require adjuster investigation
    const stakeholderAnalysis = r3.claimRecord?.accidentDetails?.narrativeAnalysis?.stakeholder_analysis;
    if (stakeholderAnalysis) {
      const contradictions: string[] = stakeholderAnalysis.contradiction_points ?? [];
      const liabilityPosture: string = stakeholderAnalysis.liability_posture ?? 'UNDETERMINED';
      const liabilityConfidence: number = stakeholderAnalysis.liability_confidence ?? 0;

      // Inject HIGH advisory for each material contradiction between stakeholder accounts
      if (contradictions.length > 0) {
        const alreadyFlagged = [...workingCritical, ...workingHigh].some((i: any) =>
          (i.code ?? '').includes('STAKEHOLDER_CONTRADICTION')
        );
        if (!alreadyFlagged) {
          const contradictionSummary = contradictions.slice(0, 3).join('; ');
          workingHigh = [...workingHigh, {
            dimension: 'crossStageConsistency',
            code: 'STAKEHOLDER_CONTRADICTION',
            description: `[HIGH — multi-stakeholder] Contradictions detected between stakeholder accounts. Adjuster must resolve before settlement. Contradictions: ${contradictionSummary}`,
            evidence: `liability_posture=${liabilityPosture}; liability_confidence=${liabilityConfidence}; contradiction_count=${contradictions.length}`,
            severity: 'HIGH',
          }];
        }
      }

      // Inject INFO advisory when liability posture is UNDER_INVESTIGATION (police matter still open)
      if (liabilityPosture === 'UNDER_INVESTIGATION') {
        const alreadyFlagged = [...workingCritical, ...workingHigh, ...workingMedium].some((i: any) =>
          (i.code ?? '').includes('LIABILITY_UNDER_INVESTIGATION')
        );
        if (!alreadyFlagged) {
          workingMedium = [...workingMedium, {
            dimension: 'incidentClassification',
            code: 'LIABILITY_UNDER_INVESTIGATION',
            description: '[MEDIUM — liability] Police investigation is ongoing. Liability posture is UNDER_INVESTIGATION. Settlement should be deferred until police close the matter or a charge is confirmed.',
            evidence: `liability_posture=${liabilityPosture}; liability_confidence=${liabilityConfidence}`,
            severity: 'MEDIUM',
          }];
        }
      }

      // Inject MEDIUM advisory when liability confidence is low (< 40) and posture is not UNDETERMINED
      if (liabilityConfidence < 40 && liabilityPosture !== 'UNDETERMINED' && liabilityPosture !== 'UNDER_INVESTIGATION') {
        const alreadyFlagged = [...workingMedium].some((i: any) =>
          (i.code ?? '').includes('LOW_LIABILITY_CONFIDENCE')
        );
        if (!alreadyFlagged) {
          workingMedium = [...workingMedium, {
            dimension: 'incidentClassification',
            code: 'LOW_LIABILITY_CONFIDENCE',
            description: `[MEDIUM — liability] Liability posture is ${liabilityPosture} but confidence is low (${liabilityConfidence}/100). Insufficient corroborating evidence to confirm liability. Adjuster should obtain additional statements or police report.`,
            evidence: `liability_posture=${liabilityPosture}; liability_confidence=${liabilityConfidence}`,
            severity: 'MEDIUM',
          }];
        }
      }
    }

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
      photosProcessed > 0 &&
      FALSE_IMAGE_CODES.some(code =>
        (issue.code ?? "").includes(code) ||
        (issue.dimension ?? "").includes("IMAGE_ANALYSIS")
      );

    // ── Step 2: Apply image false-positive filter to the scenario-corrected arrays
    const cleanedCritical = workingCritical.filter((i: any) => !isImageFalsePositive(i));
    const cleanedHigh = workingHigh.filter((i: any) => !isImageFalsePositive(i));
    const cleanedMedium = workingMedium.filter((i: any) => !isImageFalsePositive(i));
    const cleanedLow = workingLow.filter((i: any) => !isImageFalsePositive(i));

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
