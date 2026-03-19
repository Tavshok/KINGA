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
import {
  buildDamageNarrative,
  buildPhysicsNarrative,
  buildFraudNarrative,
  buildCostNarrative,
} from "./narrativeEngine";

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
      policeReport: claimRecord.policeReport,
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
      quoteDeviationPct: costAnalysis.quoteDeviationPct,
      recommendedRange: {
        lowFormatted: `${costAnalysis.currency} ${(costAnalysis.recommendedCostRange.lowCents / 100).toFixed(2)}`,
        highFormatted: `${costAnalysis.currency} ${(costAnalysis.recommendedCostRange.highCents / 100).toFixed(2)}`,
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

function buildImageSection(claimRecord: ClaimRecord): ReportSection {
  return {
    title: "Supporting Images",
    content: {
      imageCount: claimRecord.damage.imageUrls.length,
      imageUrls: claimRecord.damage.imageUrls,
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
  causalChain?: CausalChainOutput | null
): Promise<StageResult<Stage10Output>> {
  const start = Date.now();
  ctx.log("Stage 10", "Report generation starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    // Build each section — null-safe, always produces output
    const claimSummary = buildClaimSummary(claimRecord);
    const damageSection = buildDamageSection(damageAnalysis, claimRecord);
    const physicsSection = buildPhysicsSection(physicsAnalysis);
    const costSection = buildCostSection(costAnalysis, claimRecord);
    const fraudSection = buildFraudSection(fraudAnalysis);
    const turnaroundSection = buildTurnaroundSection(turnaroundAnalysis);
    const imageSection = buildImageSection(claimRecord);
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
      },
    };

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
