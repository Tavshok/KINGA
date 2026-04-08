/**
 * pipeline-v2/stage-4-validation.ts
 *
 * STAGE 4 — DATA VALIDATION & VEHICLE DATA RECOVERY (Self-Healing)
 *
 * Validates extracted data, fills missing fields from claim DB,
 * infers vehicle data from manufacturer lookups / historical data.
 * NEVER halts — produces a validated record even if all fields are NULL.
 */

import type {
  PipelineContext,
  StageResult,
  Stage2Output,
  Stage3Output,
  Stage4Output,
  ExtractedClaimFields,
  ValidationIssue,
  DamagedComponentExtracted,
  Assumption,
  RecoveryAction,
} from "./types";
import { validateFields, extractSpeedFromText } from "./fieldValidationEngine";
import type { FieldValidationResult } from "./fieldValidationEngine";
import { checkClaimConsistency } from "./claimConsistencyChecker";
import type { ConsistencyCheckResult } from "./claimConsistencyChecker";
import { evaluateGate } from "./pipelineGateController";
import type { GateControllerResult } from "./pipelineGateController";

const CRITICAL_FIELDS: Array<{ field: keyof ExtractedClaimFields; label: string; severity: "critical" | "warning" }> = [
  { field: "vehicleMake", label: "Vehicle make", severity: "critical" },
  { field: "vehicleModel", label: "Vehicle model", severity: "critical" },
  { field: "accidentDate", label: "Accident date", severity: "warning" },
  { field: "accidentDescription", label: "Accident description", severity: "warning" },
  { field: "incidentType", label: "Incident type", severity: "warning" },
  { field: "policeReportNumber", label: "Police report number", severity: "warning" },
  { field: "quoteTotalCents", label: "Repair quote total", severity: "warning" },
  { field: "vehicleRegistration", label: "Vehicle registration", severity: "warning" },
];

function mergeExtractions(extractions: ExtractedClaimFields[]): ExtractedClaimFields {
  if (extractions.length === 0) {
    // Self-healing: return empty extraction instead of throwing
    return emptyExtraction();
  }
  if (extractions.length === 1) {
    return { ...extractions[0] };
  }

  const merged: ExtractedClaimFields = { ...extractions[0] };

  for (let i = 1; i < extractions.length; i++) {
    const ext = extractions[i];
    for (const key of Object.keys(ext) as Array<keyof ExtractedClaimFields>) {
      if (key === "damagedComponents") continue;
      if (key === "uploadedImageUrls") continue;
      if (key === "sourceDocumentIndex") continue;

      const currentVal = merged[key];
      const newVal = ext[key];

      if (currentVal === null && newVal !== null) {
        (merged as any)[key] = newVal;
      }
    }
  }

  const allComponents: DamagedComponentExtracted[] = [];
  const seen = new Set<string>();
  for (const ext of extractions) {
    for (const comp of ext.damagedComponents) {
      const key = `${(comp.name || "").toLowerCase()}|${(comp.location || "").toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allComponents.push(comp);
      }
    }
  }
  merged.damagedComponents = allComponents;

  const allImages = new Set<string>();
  for (const ext of extractions) {
    for (const url of ext.uploadedImageUrls) {
      allImages.add(url);
    }
  }
  merged.uploadedImageUrls = Array.from(allImages);

  return merged;
}

function emptyExtraction(): ExtractedClaimFields {
  return {
    claimId: null, claimantName: null, driverName: null,
    vehicleRegistration: null, vehicleMake: null, vehicleModel: null,
    vehicleYear: null, vehicleVin: null, vehicleColour: null,
    vehicleEngineNumber: null, vehicleMileage: null,
    accidentDate: null, accidentLocation: null, accidentDescription: null,
    incidentType: null, accidentType: null, impactPoint: null,
    estimatedSpeedKmh: null, policeReportNumber: null, policeStation: null,
    assessorName: null, panelBeater: null, repairerCompany: null,
    quoteTotalCents: null, agreedCostCents: null, labourCostCents: null, partsCostCents: null,
    damageDescription: null, damagedComponents: [],
    structuralDamage: null, airbagDeployment: null,
    maxCrushDepthM: null, totalDamageAreaM2: null,
    thirdPartyVehicle: null, thirdPartyRegistration: null,
    // New fields
    insurerName: null, policyNumber: null, claimReference: null,
    incidentTime: null, animalType: null, weatherConditions: null, visibilityConditions: null, roadSurface: null,
    marketValueCents: null, excessAmountCents: null, bettermentCents: null,
    driverLicenseNumber: null,
    uploadedImageUrls: [], sourceDocumentIndex: -1,
  };
}

function fillFromClaimRecord(
  fields: ExtractedClaimFields,
  claim: Record<string, any>
): { fields: ExtractedClaimFields; filledFields: string[] } {
  const filled: string[] = [];

  const mappings: [keyof ExtractedClaimFields, string][] = [
    ["vehicleMake", "vehicleMake"],
    ["vehicleModel", "vehicleModel"],
    ["vehicleYear", "vehicleYear"],
    ["vehicleRegistration", "vehicleRegistration"],
    ["vehicleMileage", "vehicleMileage"],
    ["accidentDate", "accidentDate"],
    ["accidentLocation", "accidentLocation"],
    ["accidentDescription", "incidentDescription"],
    ["incidentType", "incidentType"],
    ["claimantName", "claimantName"],
    ["driverName", "driverName"],
    ["vehicleColour", "vehicleColour"],
    ["assessorName", "assessorName"],
    ["panelBeater", "panelBeater"],
    ["repairerCompany", "repairerCompany"],
  ];

  for (const [fieldKey, claimKey] of mappings) {
    if (!fields[fieldKey] && claim[claimKey]) {
      (fields as any)[fieldKey] = claim[claimKey];
      filled.push(fieldKey);
    }
  }

  return { fields, filledFields: filled };
}

/**
 * Infer vehicle data from make/model when specific fields are missing.
 * Uses industry-standard lookup tables.
 */
function inferVehicleData(
  fields: ExtractedClaimFields,
  assumptions: Assumption[],
  recoveryActions: RecoveryAction[]
): void {
  // If we have make but no year, estimate from typical fleet age
  if (fields.vehicleMake && !fields.vehicleYear) {
    const estimatedYear = new Date().getFullYear() - 5; // Assume 5-year-old vehicle
    fields.vehicleYear = estimatedYear;
    assumptions.push({
      field: "vehicleYear",
      assumedValue: estimatedYear,
      reason: `Vehicle year not found in documents. Estimated as ${estimatedYear} based on typical fleet age (5 years).`,
      strategy: "industry_average",
      confidence: 40,
      stage: "Stage 4",
    });
    recoveryActions.push({
      target: "vehicleYear",
      strategy: "industry_average",
      success: true,
      description: `Estimated vehicle year as ${estimatedYear} (typical fleet age).`,
      recoveredValue: estimatedYear,
    });
  }

  // If we have make+model but no mileage, estimate from age
  if (fields.vehicleMake && !fields.vehicleMileage && fields.vehicleYear) {
    const age = new Date().getFullYear() - fields.vehicleYear;
    const estimatedMileage = age * 15000; // 15,000 km/year average
    fields.vehicleMileage = estimatedMileage;
    assumptions.push({
      field: "vehicleMileage",
      assumedValue: estimatedMileage,
      reason: `Mileage not found. Estimated at ${estimatedMileage.toLocaleString()} km based on vehicle age (${age} years × 15,000 km/year).`,
      strategy: "industry_average",
      confidence: 35,
      stage: "Stage 4",
    });
    recoveryActions.push({
      target: "vehicleMileage",
      strategy: "industry_average",
      success: true,
      description: `Estimated mileage as ${estimatedMileage.toLocaleString()} km.`,
      recoveredValue: estimatedMileage,
    });
  }

  // If no incident type, try to infer from accident description
  if (!fields.incidentType && fields.accidentDescription) {
    const desc = fields.accidentDescription.toLowerCase();
    let inferred: string | null = null;
    if (/collid|crash|hit|struck|impact|rear-end|head-on|t-bone/i.test(desc)) inferred = "collision";
    else if (/stol|theft|hijack|break-in/i.test(desc)) inferred = "theft";
    else if (/vandal|scratch|key|graffiti/i.test(desc)) inferred = "vandalism";
    else if (/flood|water|submerge/i.test(desc)) inferred = "flood";
    else if (/fire|burn|ignit/i.test(desc)) inferred = "fire";

    if (inferred) {
      fields.incidentType = inferred;
      assumptions.push({
        field: "incidentType",
        assumedValue: inferred,
        reason: `Incident type inferred from accident description keywords.`,
        strategy: "contextual_inference",
        confidence: 65,
        stage: "Stage 4",
      });
      recoveryActions.push({
        target: "incidentType",
        strategy: "contextual_inference",
        success: true,
        description: `Inferred incident type as "${inferred}" from accident description.`,
        recoveredValue: inferred,
      });
    }
  }

  // If no accident type (collision direction), infer from impact point
  if (!fields.accidentType && fields.impactPoint) {
    const impact = fields.impactPoint.toLowerCase();
    let inferred: string | null = null;
    if (/front|head|bonnet|bumper front|hood/i.test(impact)) inferred = "frontal";
    else if (/rear|back|boot|trunk|bumper rear/i.test(impact)) inferred = "rear";
    else if (/left|driver|right|passenger|side/i.test(impact)) {
      inferred = /left|driver/i.test(impact) ? "side_driver" : "side_passenger";
    }
    else if (/roll|overturn/i.test(impact)) inferred = "rollover";

    if (inferred) {
      fields.accidentType = inferred;
      assumptions.push({
        field: "accidentType",
        assumedValue: inferred,
        reason: `Collision direction inferred from impact point: "${fields.impactPoint}".`,
        strategy: "contextual_inference",
        confidence: 60,
        stage: "Stage 4",
      });
    }
  }
}

export async function runValidationStage(
  ctx: PipelineContext,
  stage3: Stage3Output,
  stage2?: Stage2Output
): Promise<StageResult<Stage4Output>> {
  const start = Date.now();
  ctx.log("Stage 4", "Data validation starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const issues: ValidationIssue[] = [];

    // Step 1: Merge all document extractions
    let validatedFields = mergeExtractions(stage3.perDocumentExtractions);
    if (stage3.perDocumentExtractions.length === 0) {
      isDegraded = true;
      ctx.log("Stage 4", "DEGRADED: No document extractions to merge — starting from empty record");
    } else {
      ctx.log("Stage 4", `Merged ${stage3.perDocumentExtractions.length} extraction(s) into unified record`);
    }

    // Step 2: Check for missing critical fields
    const missingBefore: string[] = [];
    for (const { field } of CRITICAL_FIELDS) {
      const val = validatedFields[field];
      if (val === null || val === undefined || val === "") {
        missingBefore.push(field);
      }
    }

    // Step 3: Secondary extraction — fill from claim record in DB
    if (missingBefore.length > 0) {
      ctx.log("Stage 4", `${missingBefore.length} critical field(s) missing. Attempting recovery from claim record.`);
      const { fields: filledFields, filledFields: filled } = fillFromClaimRecord(validatedFields, ctx.claim);
      validatedFields = filledFields;

      for (const fieldName of filled) {
        issues.push({
          field: fieldName,
          severity: "info",
          message: `Field "${fieldName}" was missing from documents but recovered from claim record.`,
          secondaryExtractionAttempted: true,
          resolved: true,
        });
        recoveryActions.push({
          target: fieldName,
          strategy: "cross_document_search",
          success: true,
          description: `Recovered "${fieldName}" from claim database record.`,
          recoveredValue: validatedFields[fieldName as keyof ExtractedClaimFields],
        });
      }
      ctx.log("Stage 4", `DB recovery filled ${filled.length} field(s): ${filled.join(", ")}`);
    }

    // Step 3b: Input Recovery backfill — apply stage-3 recovered fields into validatedFields.
    // This is the fix for the Mazda BT50 audit failure:
    // stage-3 ran the 5-step input recovery (accident description, quote, speed) but
    // stage-4 never applied those recovered values back into validatedFields, so
    // downstream engines (stage-7 physics, stage-9 cost) received null for these fields.
    const ir = stage3.inputRecovery;
    if (ir) {
      // Backfill accident description from input recovery
      if (!validatedFields.accidentDescription && ir.accident_description) {
        validatedFields.accidentDescription = ir.accident_description;
        recoveryActions.push({
          target: "accidentDescription",
          strategy: "cross_document_search",
          success: true,
          description: `Accident description recovered from stage-3 input recovery (regex/LLM fallback).`,
          recoveredValue: ir.accident_description,
        });
        ctx.log("Stage 4", `Input recovery backfill: accidentDescription recovered (${ir.accident_description.length} chars)`);
      }

      // Backfill quote total from input recovery — prefer agreed/adjusted cost
      if (!validatedFields.quoteTotalCents) {
        // Priority 1: LLM-extracted quotes (highest confidence)
        const llmQuote = ir.extracted_quotes?.find(q => q.total_cost !== null && q.confidence !== 'low');
        if (llmQuote?.total_cost) {
          validatedFields.quoteTotalCents = Math.round(llmQuote.total_cost * 100);
          recoveryActions.push({
            target: "quoteTotalCents",
            strategy: "cross_document_search",
            success: true,
            description: `Quote total recovered from stage-3 LLM quote extraction: ${llmQuote.currency} ${llmQuote.total_cost} (confidence: ${llmQuote.confidence}).`,
            recoveredValue: validatedFields.quoteTotalCents,
          });
          ctx.log("Stage 4", `Input recovery backfill: quoteTotalCents = ${validatedFields.quoteTotalCents} (LLM, ${llmQuote.confidence})`);
        } else if (ir.recovered_quote?.total) {
          // Priority 2: regex-recovered quote
          validatedFields.quoteTotalCents = Math.round(ir.recovered_quote.total * 100);
          if (!validatedFields.labourCostCents && ir.recovered_quote.labour) {
            validatedFields.labourCostCents = Math.round(ir.recovered_quote.labour * 100);
          }
          if (!validatedFields.partsCostCents && ir.recovered_quote.parts) {
            validatedFields.partsCostCents = Math.round(ir.recovered_quote.parts * 100);
          }
          recoveryActions.push({
            target: "quoteTotalCents",
            strategy: "cross_document_search",
            success: true,
            description: `Quote total recovered from stage-3 regex recovery: ${ir.recovered_quote.total} (source: ${ir.recovered_quote.source}, confidence: ${ir.recovered_quote.confidence}).`,
            recoveredValue: validatedFields.quoteTotalCents,
          });
          ctx.log("Stage 4", `Input recovery backfill: quoteTotalCents = ${validatedFields.quoteTotalCents} (regex, ${ir.recovered_quote.confidence})`);
        }
      }

      // Backfill speed — search ALL available text sources if still missing
      if (!validatedFields.estimatedSpeedKmh) {
        // Collect all text sources: accident description + all raw OCR text
        const stage2Texts = stage2?.extractedTexts?.map((t: { rawText: string }) => t.rawText) ?? [];
        const allRawText = [
          ir?.accident_description || "",
          ...stage2Texts,
        ].filter(Boolean).join("\n");

        // Pattern 1: Form field label followed by speed value (most reliable)
        // e.g. "Speed: 90KM/HRS", "Speed at time of accident: 90", "What was your speed?: 90"
        const formFieldSpeed = allRawText.match(
          /(?:speed|speed\s+at\s+time|speed\s+of\s+vehicle|what\s+was\s+your\s+speed|approximate\s+speed)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:km\/h|kmh|kph|km\/hrs?|km\/hour|mph)?/i
        );

        // Pattern 2: Speed mentioned in narrative with keyword context
        // e.g. "travelling at 90 KM/HRS", "doing 60 km/h", "speed of 80"
        const narrativeSpeed = allRawText.match(
          /(?:travelling|traveling|driving|doing|going|at\s+a\s+speed\s+of|speed\s+of)\s+(?:approximately\s+)?([0-9]+(?:\.[0-9]+)?)\s*(?:km\/h|kmh|kph|km\/hrs?|km\/hour|mph)?/i
        );

        // Pattern 3: Bare speed value with unit (no keyword needed)
        // e.g. "90KM/HRS", "90 km/h", "90kph"
        const bareSpeed = allRawText.match(
          /\b([0-9]{2,3})\s*(?:km\/hrs?|km\/h|kmh|kph|km\/hour)\b/i
        );

        const speedMatch = formFieldSpeed || narrativeSpeed || bareSpeed;
        if (speedMatch) {
          const speedVal = parseFloat(speedMatch[1]);
          if (!isNaN(speedVal) && speedVal > 0 && speedVal < 300) {
            validatedFields.estimatedSpeedKmh = speedVal;
            const source = formFieldSpeed ? "form field" : narrativeSpeed ? "narrative" : "bare unit value";
            recoveryActions.push({
              target: "estimatedSpeedKmh",
              strategy: "contextual_inference",
              success: true,
              description: `Speed recovered from ${source} in raw OCR text: ${speedVal} km/h.`,
              recoveredValue: speedVal,
            });
            ctx.log("Stage 4", `Input recovery backfill: estimatedSpeedKmh = ${speedVal} (from ${source})`);
          }
        }
      }
    }

    // Step 4: Vehicle data recovery — infer missing vehicle/accident data
    inferVehicleData(validatedFields, assumptions, recoveryActions);

    // Step 5: Final validation pass — record remaining issues
    // IMPORTANT: Only set isDegraded for CRITICAL severity fields.
    // Warning-severity fields (policeReportNumber, accidentDate, incidentType)
    // may legitimately be absent in many claims and must NOT degrade the
    // extraction status — doing so causes downstream engines to treat a
    // high-quality extraction as low-quality and skip cost/physics analysis.
    const missingAfter: string[] = [];
    for (const { field, label, severity } of CRITICAL_FIELDS) {
      const val = validatedFields[field];
      if (val === null || val === undefined || val === "") {
        missingAfter.push(field);
        if (severity === "critical") {
          isDegraded = true;
        }
        issues.push({
          field,
          severity,
          message: `${label} is missing after all recovery attempts.`,
          secondaryExtractionAttempted: missingBefore.includes(field),
          resolved: false,
        });
      }
    }

    // Step 6: Validate damaged components
    if (validatedFields.damagedComponents.length === 0) {
      issues.push({
        field: "damagedComponents",
        severity: "warning",
        message: "No damaged components were extracted. Damage analysis will use text-based inference.",
        secondaryExtractionAttempted: false,
        resolved: false,
      });
    }

    // Step 7: Calculate completeness score
    const totalFields = CRITICAL_FIELDS.length + 3;
    const presentFields = CRITICAL_FIELDS.filter(({ field }) => {
      const val = validatedFields[field];
      return val !== null && val !== undefined && val !== "";
    }).length
      + (validatedFields.damagedComponents.length > 0 ? 1 : 0)
      + (validatedFields.uploadedImageUrls.length > 0 ? 1 : 0)
      + (validatedFields.damageDescription ? 1 : 0);

    const completenessScore = Math.round((presentFields / totalFields) * 100);

    // Step 7a: Field Validation Engine — source-priority arbitration for focus fields
    let fieldValidation: FieldValidationResult | null = null;
    try {
      fieldValidation = validateFields({
        // speed_kmh — prefer claim form, then narrative text
        speed_claim_form: validatedFields.estimatedSpeedKmh ?? undefined,
        narrative_text: validatedFields.accidentDescription ?? undefined,
        // incident_type — prefer claim form, then damage description
        incident_type_claim_form: validatedFields.incidentType ?? undefined,
        incident_type_narrative: (() => {
          const desc = (validatedFields.accidentDescription || "").toLowerCase();
          if (/\bcow\b|\bgoat\b|\bdonkey\b|\bhorse\b|\bpig\b|\bdog\b|\bcat\b|\blivestock\b|\banimal\b|\bwildlife\b/i.test(desc)) return "animal_strike";
          if (/collid|crash|hit|struck|impact|rear.end|head.on|t.bone/i.test(desc)) return "vehicle_collision";
          if (/stol|theft|hijack|break.in/i.test(desc)) return "theft";
          if (/vandal|scratch|key|graffiti/i.test(desc)) return "vandalism";
          if (/flood|water|submerge/i.test(desc)) return "flood";
          if (/fire|burn|ignit/i.test(desc)) return "fire";
          return undefined;
        })(),
        // repair_cost — prefer claim form (quoteTotalCents / 100), then assessor
        repair_cost_claim_form: validatedFields.quoteTotalCents != null ? validatedFields.quoteTotalCents / 100 : undefined,
        // market_value — not typically on claim form; leave for downstream
      });
      if (fieldValidation.conflicts.length > 0) {
        ctx.log("Stage 4", `Field validation: ${fieldValidation.conflicts.length} conflict(s) detected — ${fieldValidation.conflicts.map((c) => c.field).join(", ")}`);
        for (const conflict of fieldValidation.conflicts) {
          issues.push({
            field: conflict.field,
            severity: "warning",
            message: `Source conflict on "${conflict.field}": ${conflict.resolution}`,
            secondaryExtractionAttempted: true,
            resolved: true,
          });
        }
      } else {
        ctx.log("Stage 4", "Field validation: no source conflicts detected");
      }
    } catch (fvErr) {
      ctx.log("Stage 4", `Field validation engine error (non-fatal): ${String(fvErr)}`);
    }

    // Step 7b: Claim Consistency Checker — pre-analysis gate
    let consistencyCheck: ConsistencyCheckResult | null = null;
    try {
      const fv = fieldValidation;
      consistencyCheck = checkClaimConsistency({
        // Speed: prefer field validation result, then raw extracted value
        stated_speed_kmh: fv?.validated_fields.speed_kmh.source !== "inferred"
          ? (fv?.validated_fields.speed_kmh.value ?? validatedFields.estimatedSpeedKmh ?? undefined)
          : (validatedFields.estimatedSpeedKmh ?? undefined),
        estimated_speed_kmh: fv?.validated_fields.speed_kmh.source === "inferred"
          ? (fv?.validated_fields.speed_kmh.value ?? undefined)
          : undefined,
        // Incident type: prefer field validation result
        classified_incident_type: fv?.validated_fields.incident_type.value ?? validatedFields.incidentType ?? undefined,
        claim_form_incident_type: validatedFields.incidentType ?? undefined,
        narrative_text: validatedFields.accidentDescription ?? undefined,
        // Damage: from extracted fields
        airbag_deployed: validatedFields.airbagDeployment ?? undefined,
      });
      if (!consistencyCheck.proceed) {
        ctx.log("Stage 4", `Consistency check BLOCKED: ${consistencyCheck.critical_conflicts.length} HIGH conflict(s) — ${consistencyCheck.critical_conflicts.filter(c => c.severity === "HIGH").map(c => c.type).join(", ")}`);
        for (const conflict of consistencyCheck.critical_conflicts.filter(c => c.severity === "HIGH")) {
          issues.push({
            field: conflict.type,
            severity: "critical",
            message: `[CONSISTENCY BLOCK] ${conflict.description}`,
            secondaryExtractionAttempted: false,
            resolved: false,
          });
        }
      } else {
        const medCount = consistencyCheck.critical_conflicts.filter(c => c.severity === "MEDIUM").length;
        ctx.log("Stage 4", `Consistency check PASSED${medCount > 0 ? ` (${medCount} MEDIUM conflict(s) for review)` : ""}`);
      }
    } catch (ccErr) {
      ctx.log("Stage 4", `Consistency checker error (non-fatal): ${String(ccErr)}`);
    }

    // Step 7c: Pipeline Gate Controller — go/no-go decision
    let gateDecision: GateControllerResult | null = null;
    try {
      const fv = fieldValidation;
      const cc = consistencyCheck;
      gateDecision = evaluateGate({
        evidence_registry: {
          damage_photos: ctx.evidenceRegistry?.evidence_registry?.damage_photos ?? "UNKNOWN",
          repair_quote: ctx.evidenceRegistry?.evidence_registry?.repair_quote ?? "UNKNOWN",
          assessor_report: ctx.evidenceRegistry?.evidence_registry?.assessor_report ?? "UNKNOWN",
          claim_form: ctx.evidenceRegistry?.evidence_registry?.claim_form ?? "UNKNOWN",
          driver_statement: ctx.evidenceRegistry?.evidence_registry?.driver_statement ?? "UNKNOWN",
          incident_details: ctx.evidenceRegistry?.evidence_registry?.incident_details ?? "UNKNOWN",
          vehicle_details: ctx.evidenceRegistry?.evidence_registry?.vehicle_details ?? "UNKNOWN",
        },
        validated_fields: {
          incident_type: fv?.validated_fields.incident_type ?? null,
          repair_cost: fv?.validated_fields.repair_cost ?? null,
          speed_kmh: fv?.validated_fields.speed_kmh ?? null,
          market_value: fv?.validated_fields.market_value ?? null,
        },
        conflict_report: cc ?? { critical_conflicts: [], proceed: true },
        assessment_mode: (fv?.validated_fields.repair_cost?.value ?? 0) > 0 ? "POST_ASSESSMENT" : "PRE_ASSESSMENT",
      });
      if (gateDecision.status === "HOLD") {
        ctx.log("Stage 4", `Gate HOLD: ${gateDecision.reasons.length} reason(s) — ${gateDecision.rules_triggered.filter(r => r.triggered).map(r => r.rule_id).join(", ")}`);
        for (const action of gateDecision.required_actions) {
          issues.push({
            field: "gate_controller",
            severity: "critical",
            message: `[GATE HOLD] ${action}`,
            secondaryExtractionAttempted: false,
            resolved: false,
          });
        }
      } else {
        ctx.log("Stage 4", "Gate PROCEED — all four rules passed");
      }
    } catch (gateErr) {
      ctx.log("Stage 4", `Gate controller error (non-fatal): ${String(gateErr)}`);
    }

    const output: Stage4Output = {
      validatedFields,
      issues,
      completenessScore,
      missingFields: missingAfter,
      fieldValidation,
      consistencyCheck,
      gateDecision,
    };

    ctx.log("Stage 4", `Validation complete. Completeness: ${completenessScore}%. Missing: ${missingAfter.length}. Assumptions: ${assumptions.length}`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 4", `Validation failed: ${String(err)} — producing empty validated record`);

    return {
      status: "degraded",
      data: {
        validatedFields: emptyExtraction(),
        issues: [{
          field: "all",
          severity: "critical",
          message: `Validation stage failed: ${String(err)}. Using empty record.`,
          secondaryExtractionAttempted: false,
          resolved: false,
        }],
        completenessScore: 0,
        missingFields: CRITICAL_FIELDS.map(f => f.field),
        fieldValidation: null,
        consistencyCheck: null,
        gateDecision: null,
      },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "validatedFields",
        assumedValue: "empty",
        reason: `Validation failed: ${String(err)}. Using empty record for downstream stages.`,
        strategy: "default_value",
        confidence: 5,
        stage: "Stage 4",
      }],
      recoveryActions: [{
        target: "validation_error_recovery",
        strategy: "default_value",
        success: true,
        description: `Validation error caught. Producing empty validated record to allow pipeline to continue.`,
      }],
      degraded: true,
    };
  }
}
