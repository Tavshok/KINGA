/**
 * pipeline-v2/stage-10-report.ts
 *
 * STAGE 10 — REPORT GENERATION (Self-Healing)
 *
 * Compiles the final assessment report from structured data ONLY.
 * No LLM calls — this is a deterministic compilation stage.
 * ALWAYS produces output — marks sections as unavailable if data is missing.
 *
 * Includes: confidence score, assumptions log, missing documents/fields.
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  TurnaroundTimeOutput,
  Stage10Output,
  ReportSection,
  Assumption,
  RecoveryAction,
  MissingDocument,
} from "./types";
import type { CausalChainOutput } from "./causalChainBuilder";
import { evaluateDecisionReadiness } from "./decisionReadinessEngine";
import {
  buildDamageNarrative,
  buildPhysicsNarrative,
  buildFraudNarrative,
  buildCostNarrative,
} from "./narrativeEngine";
import { buildDataResponsibilityMatrix } from "./dataResponsibilityMatrix";
import { buildDecisionTransparencyLayer } from "./decisionTransparencyLayer";
import { runCrossStageConsistencyCheck } from "./crossStageConsistencyEngine";
import { scoreClaimQuality } from "./claimQualityScorer";

function buildClaimSummary(claimRecord: ClaimRecord): ReportSection {
  return {
    title: "Claim Summary",
    content: {
      claimId: claimRecord.claimId,
      vehicle: {
        make: claimRecord.vehicle.make,
        model: claimRecord.vehicle.model,
        year: claimRecord.vehicle.year,
        registration: claimRecord.vehicle.registration,
        vin: claimRecord.vehicle.vin,
        colour: claimRecord.vehicle.colour,
        mileageKm: claimRecord.vehicle.mileageKm,
        bodyType: claimRecord.vehicle.bodyType,
        powertrain: claimRecord.vehicle.powertrain,
        massKg: claimRecord.vehicle.massKg,
      },
      driver: claimRecord.driver,
      incident: {
        date: claimRecord.accidentDetails.date,
        location: claimRecord.accidentDetails.location,
        type: claimRecord.accidentDetails.incidentType,
        collisionDirection: claimRecord.accidentDetails.collisionDirection,
        description: claimRecord.accidentDetails.description,
      },
      policeReport: {
        reportNumber: claimRecord.policeReport?.reportNumber ?? null,
        station: claimRecord.policeReport?.station ?? null,
        // Extended SA police report fields (populated by Stage 3 when present in documents)
        officerName: (claimRecord.policeReport as any)?.officerName ?? null,
        chargeNumber: (claimRecord.policeReport as any)?.chargeNumber ?? null,
        fineAmount: (claimRecord.policeReport as any)?.fineAmount ?? null,
        trafficReportDate: (claimRecord.policeReport as any)?.trafficReportDate ?? null,
      },
      dataQuality: {
        completenessScore: claimRecord.dataQuality.completenessScore,
        missingFields: claimRecord.dataQuality.missingFields,
        issueCount: claimRecord.dataQuality.validationIssues.length,
      },
    },
  };
}

function buildDamageSection(damageAnalysis: Stage6Output | null, claimRecord: ClaimRecord): ReportSection {
  if (!damageAnalysis) {
    return {
      title: "Damage Analysis",
      content: { available: false, note: "Damage analysis data unavailable." },
    };
  }
  return {
    title: "Damage Analysis",
    content: {
      available: true,
      overallSeverityScore: damageAnalysis.overallSeverityScore,
      structuralDamageDetected: damageAnalysis.structuralDamageDetected,
      totalDamageArea: damageAnalysis.totalDamageArea,
      totalComponentsAffected: damageAnalysis.damagedParts.length,
      damageZones: damageAnalysis.damageZones.map(z => ({
        zone: z.zone,
        componentCount: z.componentCount,
        maxSeverity: z.maxSeverity,
      })),
      damagedComponents: damageAnalysis.damagedParts.map(p => ({
        name: p.name,
        location: p.location,
        damageType: p.damageType,
        severity: p.severity,
      })),
      damageDescription: claimRecord.damage.description,
    },
  };
}

function buildPhysicsSection(physicsAnalysis: Stage7Output | null): ReportSection {
  if (!physicsAnalysis) {
    return {
      title: "Physics Reconstruction",
      content: { available: false, executed: false, note: "Physics analysis data unavailable." },
    };
  }

  if (!physicsAnalysis.physicsExecuted) {
    return {
      title: "Physics Reconstruction",
      content: { available: true, executed: false, note: "Physics analysis was not applicable for this incident type." },
    };
  }

  return {
    title: "Physics Reconstruction",
    content: {
      available: true,
      executed: true,
      impactForceKn: physicsAnalysis.impactForceKn,
      impactVector: physicsAnalysis.impactVector,
      energyDistribution: {
        kineticEnergyJ: physicsAnalysis.energyDistribution.kineticEnergyJ,
        energyDissipatedKj: physicsAnalysis.energyDistribution.energyDissipatedKj,
      },
      estimatedSpeedKmh: physicsAnalysis.estimatedSpeedKmh,
      deltaVKmh: physicsAnalysis.deltaVKmh,
      decelerationG: physicsAnalysis.decelerationG,
      accidentSeverity: physicsAnalysis.accidentSeverity,
      reconstructionSummary: physicsAnalysis.accidentReconstructionSummary,
      damageConsistencyScore: physicsAnalysis.damageConsistencyScore,
      latentDamageProbability: physicsAnalysis.latentDamageProbability,
    },
  };
}

function buildCostSection(costAnalysis: Stage9Output | null, claimRecord: ClaimRecord): ReportSection {
  if (!costAnalysis) {
    return {
      title: "Cost Optimisation",
      content: { available: false, note: "Cost analysis data unavailable." },
    };
  }

  return {
    title: "Cost Optimisation",
    content: {
      available: true,
      expectedRepairCost: {
        totalCents: costAnalysis.expectedRepairCostCents,
        formatted: `${costAnalysis.currency} ${(costAnalysis.expectedRepairCostCents / 100).toFixed(2)}`,
      },
      quotedRepairCost: claimRecord.repairQuote.quoteTotalCents
        ? {
            totalCents: claimRecord.repairQuote.quoteTotalCents,
            formatted: `${costAnalysis.currency} ${(claimRecord.repairQuote.quoteTotalCents / 100).toFixed(2)}`,
          }
        : null,
      // aiEstimateSource tells the adjuster what data underpins the AI benchmark
      // Values: "learning_db" | "quote_proportional" | "insufficient_data"
      aiEstimateSource: (costAnalysis as any).aiEstimateSource ?? "unknown",
      aiEstimateNote: (costAnalysis as any).aiEstimateNote ?? null,
      quoteDeviationPct: costAnalysis.quoteDeviationPct,
      recommendedRange: {
        lowFormatted: `${costAnalysis.currency} ${(costAnalysis.recommendedCostRange.lowCents / 100).toFixed(2)}`,
        highFormatted: `${costAnalysis.currency} ${(costAnalysis.recommendedCostRange.highCents / 100).toFixed(2)}`,
        basis: "AI benchmark ±20%",
      },
      savingsOpportunity: {
        cents: costAnalysis.savingsOpportunityCents,
        formatted: `${costAnalysis.currency} ${(costAnalysis.savingsOpportunityCents / 100).toFixed(2)}`,
      },
      breakdown: {
        parts: `${costAnalysis.currency} ${(costAnalysis.breakdown.partsCostCents / 100).toFixed(2)}`,
        labour: `${costAnalysis.currency} ${(costAnalysis.breakdown.labourCostCents / 100).toFixed(2)}`,
        paint: `${costAnalysis.currency} ${(costAnalysis.breakdown.paintCostCents / 100).toFixed(2)}`,
        hiddenDamage: `${costAnalysis.currency} ${(costAnalysis.breakdown.hiddenDamageCostCents / 100).toFixed(2)}`,
        total: `${costAnalysis.currency} ${(costAnalysis.breakdown.totalCents / 100).toFixed(2)}`,
      },
      labourRate: `${costAnalysis.currency} ${costAnalysis.labourRateUsdPerHour}/hr`,
      marketRegion: costAnalysis.marketRegion,
    },
  };
}

function buildFraudSection(fraudAnalysis: Stage8Output | null): ReportSection {
  if (!fraudAnalysis) {
    return {
      title: "Fraud Risk Indicators",
      content: { available: false, note: "Fraud analysis data unavailable." },
    };
  }

  return {
    title: "Fraud Risk Indicators",
    content: {
      available: true,
      riskScore: fraudAnalysis.fraudRiskScore,
      riskLevel: fraudAnalysis.fraudRiskLevel,
      indicatorCount: fraudAnalysis.indicators.length,
      indicators: fraudAnalysis.indicators.map(i => ({
        indicator: i.indicator,
        category: i.category,
        score: i.score,
        description: i.description,
      })),
      damageConsistency: {
        score: fraudAnalysis.damageConsistencyScore,
        notes: fraudAnalysis.damageConsistencyNotes,
      },
      repairerHistory: fraudAnalysis.repairerHistory,
      claimantHistory: fraudAnalysis.claimantClaimFrequency,
      vehicleHistory: fraudAnalysis.vehicleClaimHistory,
    },
  };
}

function buildTurnaroundSection(turnaround: TurnaroundTimeOutput | null): ReportSection {
  if (!turnaround) {
    return {
      title: "Turnaround Time Estimate",
      content: { available: false, note: "Turnaround time analysis data unavailable." },
    };
  }

  return {
    title: "Turnaround Time Estimate",
    content: {
      available: true,
      estimatedRepairDays: turnaround.estimatedRepairDays,
      bestCaseDays: turnaround.bestCaseDays,
      worstCaseDays: turnaround.worstCaseDays,
      confidence: turnaround.confidence,
      breakdown: turnaround.breakdown,
      bottlenecks: turnaround.bottlenecks,
      marketRegion: turnaround.marketRegion,
    },
  };
}

function buildImageSection(claimRecord: ClaimRecord, pdfPageImageUrls?: string[]): ReportSection {
  const uploadedPhotos = claimRecord.damage.imageUrls ?? [];
  // Include PDF page renders as fallback when no uploaded photos exist
  const pdfFallback = uploadedPhotos.length === 0 ? (pdfPageImageUrls ?? []) : [];
  const allImages = [...uploadedPhotos, ...pdfFallback];
  return {
    title: "Supporting Images",
    content: {
      imageCount: allImages.length,
      imageUrls: allImages,
      uploadedPhotoCount: uploadedPhotos.length,
      pdfPageRenderCount: pdfFallback.length,
      note: allImages.length === 0
        ? "No photos were submitted with this claim. Damage analysis is based on text descriptions only."
        : uploadedPhotos.length === 0 && pdfFallback.length > 0
          ? "No dedicated damage photos were submitted. The images below are PDF page renders from the submitted documents."
          : null,
    },
  };
}

/**
 * Compute overall pipeline confidence from all stage assumptions.
 */
function computeOverallConfidence(allAssumptions: Assumption[], dataCompleteness: number): number {
  if (allAssumptions.length === 0) return Math.min(95, dataCompleteness);

  // Average confidence of all assumptions, weighted by how many there are
  const avgAssumptionConfidence = allAssumptions.reduce((sum, a) => sum + a.confidence, 0) / allAssumptions.length;

  // Penalty for number of assumptions (more assumptions = less reliable)
  const assumptionPenalty = Math.min(40, allAssumptions.length * 3);

  // Base from data completeness
  const base = dataCompleteness * 0.6;

  return Math.max(5, Math.min(95, Math.round(base + avgAssumptionConfidence * 0.2 - assumptionPenalty)));
}

/**
 * Identify missing documents from the pipeline data.
 */
function identifyMissingDocuments(claimRecord: ClaimRecord): MissingDocument[] {
  const missing: MissingDocument[] = [];

  if (!claimRecord.policeReport.reportNumber) {
    missing.push({
      documentType: "police_report",
      impact: "Fraud analysis has reduced accuracy without police report verification.",
      required: false,
    });
  }

  if (claimRecord.damage.imageUrls.length === 0) {
    missing.push({
      documentType: "vehicle_photos",
      impact: "Damage analysis relies entirely on text descriptions without photo verification.",
      required: true,
    });
  }

  if (!claimRecord.repairQuote.quoteTotalCents) {
    missing.push({
      documentType: "repair_quote",
      impact: "Cost deviation analysis cannot be performed without a repair quote.",
      required: false,
    });
  }

  return missing;
}

export async function runReportGenerationStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output | null,
  physicsAnalysis: Stage7Output | null,
  fraudAnalysis: Stage8Output | null,
  costAnalysis: Stage9Output | null,
  turnaroundAnalysis: TurnaroundTimeOutput | null,
  allAssumptions: Assumption[],
  causalChain?: CausalChainOutput | null,
  evidenceTrace?: Stage10Output["evidenceTrace"]
): Promise<StageResult<Stage10Output>> {
  const start = Date.now();
  ctx.log("Stage 10", "Report generation starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    // ── Decision Readiness Gate ────────────────────────────────────────────────
    const decisionReadiness = evaluateDecisionReadiness({
      photos: {
        damage_photos_status:
          (claimRecord.evidenceRegistry?.evidence_registry?.damage_photos as "PRESENT" | "ABSENT" | "UNKNOWN") ??
          (claimRecord.damage.imageUrls && claimRecord.damage.imageUrls.length > 0 ? "PRESENT" : "UNKNOWN"),
        photos_processed_count: claimRecord.damage.imageUrls?.length ?? null,
      },
      incident: {
        incident_type: claimRecord.accidentDetails.incidentClassification?.incident_type ??
          claimRecord.accidentDetails.incidentType ?? null,
        classification_confidence: claimRecord.accidentDetails.incidentClassification?.confidence ?? null,
        conflict_detected: claimRecord.accidentDetails.incidentClassification?.conflict_detected ?? false,
      },
      physics: {
        physics_ran_successfully: physicsAnalysis !== null && (physicsAnalysis as any).runMode !== "fallback",
        physics_marked_invalid: physicsAnalysis !== null &&
          typeof (physicsAnalysis as any).causalPlausibility === "number" &&
          (physicsAnalysis as any).causalPlausibility < 20,
        physics_confidence: (physicsAnalysis as any)?.overallConfidence ?? null,
      },
      cost: {
        true_cost_usd: costAnalysis?.costDecision?.true_cost_usd ?? null,
        cost_basis: (costAnalysis?.costDecision?.cost_basis as "assessor_validated" | "system_optimised" | null) ?? null,
        cost_confidence: costAnalysis?.costDecision?.confidence ?? null,
      },
    });

    if (!decisionReadiness.decision_ready) {
      ctx.log(
        "Stage 10",
        `Decision Readiness Gate: BLOCKED — ${decisionReadiness.blocking_issues.length} blocking issue(s): ` +
        decisionReadiness.blocking_issues.map((i) => i.check_id).join(", ")
      );
      isDegraded = true;
    } else {
      ctx.log("Stage 10", `Decision Readiness Gate: PROCEED — confidence ${decisionReadiness.confidence}%`);
    }

    // ── QUALITY GATES — Structural safeguards against recurring quality issues ────
    // These gates log warnings for data quality issues that have caused report defects.
    // They do NOT block report generation but ensure issues are visible in the audit trail.

    // QG-1: Speed extraction gate
    if (!claimRecord.accidentDetails.estimatedSpeedKmh || claimRecord.accidentDetails.estimatedSpeedKmh <= 0) {
      ctx.log("Stage 10", `⚠️ QUALITY GATE QG-1: No speed extracted from claim form. Physics analysis may use default values.`);
      assumptions.push({
        field: "estimatedSpeedKmh",
        assumedValue: "Not extracted",
        reason: "Speed was not extracted from the claim form. If the form contains a handwritten speed, the OCR may have missed it.",
        strategy: "default_value",
        confidence: 20,
        stage: "Stage 10 (QG-1)",
      });
    }

    // QG-2: Incident description completeness gate
    const desc = claimRecord.accidentDetails.description;
    if (!desc || desc.length < 20) {
      ctx.log("Stage 10", `⚠️ QUALITY GATE QG-2: Incident description is missing or too short (${desc?.length ?? 0} chars).`);
      assumptions.push({
        field: "accidentDescription",
        assumedValue: "Incomplete",
        reason: "The incident description is missing or very short. The report narrative may be incomplete.",
        strategy: "partial_data",
        confidence: 15,
        stage: "Stage 10 (QG-2)",
      });
    }

    // QG-3: Cost source transparency gate
    if (costAnalysis) {
      const hasLearningData = (costAnalysis as any).repairIntelligence?.some?.((r: any) => r.costSource === "learning_db");
      if (!hasLearningData) {
        ctx.log("Stage 10", `ℹ️ QUALITY GATE QG-3: No learning DB data available for cost benchmarks. All benchmarks are estimates.`);
      }
    }

    // QG-4: Weather/visibility/road surface extraction gate
    const weather = claimRecord.accidentDetails.weatherConditions;
    const visibility = claimRecord.accidentDetails.visibilityConditions;
    const roadSurface = claimRecord.accidentDetails.roadSurface;
    if (!weather && !visibility && !roadSurface) {
      ctx.log("Stage 10", `⚠️ QUALITY GATE QG-4: No environmental conditions extracted (weather, visibility, road surface).`);
    }

    // QG-5: Market value gate (needed for valuation section)
    if (!claimRecord.vehicle.marketValueUsd || claimRecord.vehicle.marketValueUsd <= 0) {
      ctx.log("Stage 10", `⚠️ QUALITY GATE QG-5: No market value extracted. Valuation section will show 'Not stated'.`);
    }

    // ── Phase 4C: Data Responsibility Matrix + Decision Transparency Layer ────────
    const ifeResult = costAnalysis?.ifeResult ?? null;
    const doeResult = costAnalysis?.doeResult ?? null;
    const dataResponsibilityMatrix = buildDataResponsibilityMatrix(ifeResult);
    const decisionTransparencyLayer = buildDecisionTransparencyLayer(doeResult);

    // Build each section — null-safe, always produces output
    const claimSummary = buildClaimSummary(claimRecord);
    const damageSection = buildDamageSection(damageAnalysis, claimRecord);
    const physicsSection = buildPhysicsSection(physicsAnalysis);
    const costSection = buildCostSection(costAnalysis, claimRecord);
    const fraudSection = buildFraudSection(fraudAnalysis);
    const turnaroundSection = buildTurnaroundSection(turnaroundAnalysis);
    const imageSection = buildImageSection(claimRecord, (ctx as any).pdfPageImageUrls);
    // Stage 39 — evidence-anchored narratives (no hedging, OEC structure)
    const damageNarrative = damageAnalysis
      ? buildDamageNarrative(damageAnalysis, claimRecord.damage.imageUrls ?? [], claimRecord.damage.description)
      : null;
    const physicsNarrative = physicsAnalysis
      ? buildPhysicsNarrative(physicsAnalysis)
      : null;
    const fraudNarrative = fraudAnalysis
      ? buildFraudNarrative(fraudAnalysis)
      : null;
    const costNarrative = costAnalysis
      ? buildCostNarrative(costAnalysis, claimRecord.repairQuote.quoteTotalCents)
      : null;

    // Track which sections are degraded
    const unavailableSections: string[] = [];
    if (!damageAnalysis) unavailableSections.push("Damage Analysis");
    if (!physicsAnalysis) unavailableSections.push("Physics Reconstruction");
    if (!fraudAnalysis) unavailableSections.push("Fraud Risk Indicators");
    if (!costAnalysis) unavailableSections.push("Cost Optimisation");
    if (!turnaroundAnalysis) unavailableSections.push("Turnaround Time");

    if (unavailableSections.length > 0) {
      isDegraded = true;
      assumptions.push({
        field: "reportSections",
        assumedValue: `${unavailableSections.length} sections unavailable`,
        reason: `The following sections have no data: ${unavailableSections.join(", ")}. Report is partial.`,
        strategy: "partial_data",
        confidence: 30,
        stage: "Stage 10",
      });
    }

    // Compute overall confidence
    const overallConfidence = computeOverallConfidence(
      allAssumptions,
      claimRecord.dataQuality.completenessScore
    );

    // Identify missing documents
    const missingDocuments = identifyMissingDocuments(claimRecord);

    // Compile full report
    const fullReport = {
      reportVersion: "3.0",
      generatedAt: new Date().toISOString(),
      claimId: claimRecord.claimId,
      overallConfidence,
      assumptionCount: allAssumptions.length,
      missingDocumentCount: missingDocuments.length,
      sections: {
        claimSummary: claimSummary.content,
        damageAnalysis: {
          ...damageSection.content,
          ...(damageNarrative ? { narrative: damageNarrative.full_text, narrative_sentences: damageNarrative.sentences } : {}),
        },
        physicsReconstruction: {
          ...physicsSection.content,
          ...(physicsNarrative ? { narrative: physicsNarrative.full_text, narrative_sentences: physicsNarrative.sentences } : {}),
        },
        costOptimisation: {
          ...costSection.content,
          ...(costNarrative ? { narrative: costNarrative.full_text, narrative_sentences: costNarrative.sentences } : {}),
        },
        fraudRiskIndicators: {
          ...fraudSection.content,
          ...(fraudNarrative ? { narrative: fraudNarrative.full_text, narrative_sentences: fraudNarrative.sentences } : {}),
        },
        turnaroundTimeEstimate: turnaroundSection.content,
        supportingImages: imageSection.content,
        ...(causalChain ? {
          decisionReport: {
            causal_chain: causalChain.causal_chain,
            chain_summary: causalChain.chain_summary,
            decision_outcome: causalChain.decision_outcome,
            escalation_required: causalChain.escalation_required,
            step_count: causalChain.step_count,
            critical_step_count: causalChain.critical_step_count,
            warning_step_count: causalChain.warning_step_count,
          },
        } : {}),
        // Phase 4C: Data Responsibility Matrix
        dataResponsibilityMatrix: {
          totalGaps: dataResponsibilityMatrix.totalGaps,
          byAttribution: dataResponsibilityMatrix.byAttribution,
          hasInsurerGaps: dataResponsibilityMatrix.hasInsurerGaps,
          hasSystemFailures: dataResponsibilityMatrix.hasSystemFailures,
          narrative: dataResponsibilityMatrix.narrative,
          entries: dataResponsibilityMatrix.entries,
        },
        // Phase 4C: Decision Transparency Layer
        decisionTransparencyLayer: {
          doeStatus: decisionTransparencyLayer.doeStatus,
          decisionMode: decisionTransparencyLayer.decisionMode,
          selectedPanelBeater: decisionTransparencyLayer.selectedPanelBeater,
          selectedCost: decisionTransparencyLayer.selectedCost,
          currency: decisionTransparencyLayer.currency,
          benchmarkDeviationPct: decisionTransparencyLayer.benchmarkDeviationPct,
          decisionConfidence: decisionTransparencyLayer.decisionConfidence,
          fcdiScoreAtDecision: decisionTransparencyLayer.fcdiScoreAtDecision,
          candidates: decisionTransparencyLayer.candidates,
          disqualifications: decisionTransparencyLayer.disqualifications,
          rationale: decisionTransparencyLayer.rationale,
          narrative: decisionTransparencyLayer.narrative,
        },
      },
    };

    // ── Cross-Stage Consistency Check ──────────────────────────────────────────
    const consistencyCheck = runCrossStageConsistencyCheck({
      claimRecord,
      damageAnalysis: damageAnalysis ?? null,
      physicsAnalysis: physicsAnalysis ?? null,
      fraudAnalysis: fraudAnalysis ?? null,
      costAnalysis: costAnalysis ?? null,
    });

    // Surface blocking consistency flags in fullReport sections
    if (consistencyCheck.blockAutoApproval && consistencyCheck.flags.length > 0) {
      fullReport.sections.consistencyFlags = {
        blockAutoApproval: consistencyCheck.blockAutoApproval,
        overallStatus: consistencyCheck.overallStatus,
        flagCount: consistencyCheck.flags.length,
        criticalCount: consistencyCheck.flags.filter(f => f.severity === 'CRITICAL').length,
        flags: consistencyCheck.flags.map(f => ({
          id: f.id,
          severity: f.severity,
          description: f.description,
          recommendation: f.recommendation,
          affectedStages: f.affectedStages,
        })),
      };
    }

    // ── Claim Quality Score ────────────────────────────────────────────────────
    let claimQuality = null;
    try {
      claimQuality = scoreClaimQuality({
        claimRecord,
        damageAnalysis: damageAnalysis ?? null,
        physicsAnalysis: physicsAnalysis ?? null,
        fraudAnalysis: fraudAnalysis ?? null,
        costAnalysis: costAnalysis ?? null,
        consistencyCheck,
        classifiedImages: ctx.classifiedImages ?? null,
      });
      // Surface quality score in fullReport for downstream consumers
      fullReport.sections.claimQuality = {
        overallScore: claimQuality.overallScore,
        grade: claimQuality.grade,
        adjusterGuidance: claimQuality.adjusterGuidance,
        requiresManualReview: claimQuality.requiresManualReview,
        mandatoryActions: claimQuality.mandatoryActions,
        dimensions: claimQuality.dimensions,
      };
      ctx.log("Stage 10", `Claim quality score: ${claimQuality.overallScore}/100 (Grade ${claimQuality.grade}), manual review: ${claimQuality.requiresManualReview}`);
    } catch (qErr) {
      ctx.log("Stage 10", `Claim quality scoring failed (non-fatal): ${String(qErr)}`);
    }

    // ── MONTH 3 FIX: Structured degradation reasons for UI surfacing ───────────────
    const degradationReasons: Array<{ code: string; section: string; description: string; severity: 'critical' | 'warning' | 'info' }> = [];
    if (unavailableSections.length > 0) {
      unavailableSections.forEach(section => {
        degradationReasons.push({
          code: `SECTION_UNAVAILABLE_${section.toUpperCase().replace(/\s+/g, '_')}`,
          section,
          description: `${section} data was not available for this report. The section is shown with placeholder content.`,
          severity: section === 'Damage Analysis' ? 'critical' : 'warning',
        });
      });
    }
    if (consistencyCheck.blockAutoApproval) {
      degradationReasons.push({
        code: 'CONSISTENCY_CHECK_FAILED',
        section: 'Cross-Stage Consistency',
        description: `${consistencyCheck.flags.filter(f => f.severity === 'CRITICAL').length} critical consistency flag(s) detected. Auto-approval blocked.`,
        severity: 'critical',
      });
    }
    if (claimQuality && claimQuality.requiresManualReview) {
      degradationReasons.push({
        code: 'MANUAL_REVIEW_REQUIRED',
        section: 'Claim Quality',
        description: `Claim quality score ${claimQuality.overallScore}/100 (Grade ${claimQuality.grade}) requires manual adjuster review.`,
        severity: 'warning',
      });
    }

    const output: Stage10Output = {
      claimSummary,
      damageAnalysis: damageSection,
      physicsReconstruction: physicsSection,
      costOptimisation: costSection,
      fraudRiskIndicators: fraudSection,
      turnaroundTimeEstimate: turnaroundSection,
      supportingImages: imageSection,
      fullReport,
      generatedAt: new Date().toISOString(),
      // Self-healing additions
      confidenceScore: overallConfidence,
      assumptions: allAssumptions,
      missingDocuments,
      missingFields: claimRecord.dataQuality.missingFields,
      evidenceTrace: evidenceTrace ?? null,
      decisionReadiness,
      consistencyCheck,
      claimQuality,
      // MONTH 3 FIX: Structured degradation reasons
      degradationReasons,
    };

    ctx.log("Stage 10", `Report generation complete. ${Object.keys(fullReport.sections).length} sections, confidence: ${overallConfidence}%, assumptions: ${allAssumptions.length}, missing docs: ${missingDocuments.length}`);

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
    ctx.log("Stage 10", `Report generation failed: ${String(err)} — producing minimal report`);

    // Self-healing: produce a minimal report
    const minimalReport: Stage10Output = {
      claimSummary: buildClaimSummary(claimRecord),
      damageAnalysis: { title: "Damage Analysis", content: { available: false, note: "Report generation failed." } },
      physicsReconstruction: { title: "Physics Reconstruction", content: { available: false, note: "Report generation failed." } },
      costOptimisation: { title: "Cost Optimisation", content: { available: false, note: "Report generation failed." } },
      fraudRiskIndicators: { title: "Fraud Risk Indicators", content: { available: false, note: "Report generation failed." } },
      turnaroundTimeEstimate: { title: "Turnaround Time Estimate", content: { available: false, note: "Report generation failed." } },
      supportingImages: buildImageSection(claimRecord),
      fullReport: {
        reportVersion: "3.0",
        generatedAt: new Date().toISOString(),
        claimId: claimRecord.claimId,
        overallConfidence: 5,
        error: String(err),
        sections: {},
      },
      generatedAt: new Date().toISOString(),
      confidenceScore: 5,
      assumptions: [{
        field: "report",
        assumedValue: "minimal",
        reason: `Report generation failed: ${String(err)}. Only claim summary and images are available.`,
        strategy: "default_value",
        confidence: 5,
        stage: "Stage 10",
      }],
      missingDocuments: [],
      missingFields: claimRecord.dataQuality.missingFields,
      evidenceTrace: null,
      decisionReadiness: null,
    };

    return {
      status: "degraded",
      data: minimalReport,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "report",
        assumedValue: "minimal",
        reason: `Report generation failed: ${String(err)}.`,
        strategy: "default_value",
        confidence: 5,
        stage: "Stage 10",
      }],
      recoveryActions: [{
        target: "report_error",
        strategy: "default_value",
        success: true,
        description: `Report generation error caught. Produced minimal report with claim summary only.`,
      }],
      degraded: true,
    };
  }
}
