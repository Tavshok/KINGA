/**
 * pipeline-v2/stage-10-report.ts
 *
 * STAGE 10 — REPORT GENERATION
 *
 * Compiles the final assessment report from structured data ONLY.
 * No LLM calls — this is a deterministic compilation stage.
 *
 * Input: ClaimRecord + all stage outputs
 * Output: Stage10Output (structured report sections)
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  Stage10Output,
  ReportSection,
} from "./types";

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

function buildDamageSection(damageAnalysis: Stage6Output, claimRecord: ClaimRecord): ReportSection {
  return {
    title: "Damage Analysis",
    content: {
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

function buildPhysicsSection(physicsAnalysis: Stage7Output): ReportSection {
  if (!physicsAnalysis.physicsExecuted) {
    return {
      title: "Physics Reconstruction",
      content: {
        executed: false,
        note: "Physics analysis was not applicable for this incident type.",
      },
    };
  }

  return {
    title: "Physics Reconstruction",
    content: {
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

function buildCostSection(costAnalysis: Stage9Output, claimRecord: ClaimRecord): ReportSection {
  return {
    title: "Cost Optimisation",
    content: {
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

function buildFraudSection(fraudAnalysis: Stage8Output): ReportSection {
  return {
    title: "Fraud Risk Indicators",
    content: {
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

function buildImageSection(claimRecord: ClaimRecord): ReportSection {
  return {
    title: "Supporting Images",
    content: {
      imageCount: claimRecord.damage.imageUrls.length,
      imageUrls: claimRecord.damage.imageUrls,
    },
  };
}

export async function runReportGenerationStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  physicsAnalysis: Stage7Output,
  fraudAnalysis: Stage8Output,
  costAnalysis: Stage9Output
): Promise<StageResult<Stage10Output>> {
  const start = Date.now();
  ctx.log("Stage 10", "Report generation starting");

  try {
    const claimSummary = buildClaimSummary(claimRecord);
    const damageSection = buildDamageSection(damageAnalysis, claimRecord);
    const physicsSection = buildPhysicsSection(physicsAnalysis);
    const costSection = buildCostSection(costAnalysis, claimRecord);
    const fraudSection = buildFraudSection(fraudAnalysis);
    const imageSection = buildImageSection(claimRecord);

    // Compile full report as a single JSON object
    const fullReport = {
      reportVersion: "2.0",
      generatedAt: new Date().toISOString(),
      claimId: claimRecord.claimId,
      sections: {
        claimSummary: claimSummary.content,
        damageAnalysis: damageSection.content,
        physicsReconstruction: physicsSection.content,
        costOptimisation: costSection.content,
        fraudRiskIndicators: fraudSection.content,
        supportingImages: imageSection.content,
      },
    };

    const output: Stage10Output = {
      claimSummary,
      damageAnalysis: damageSection,
      physicsReconstruction: physicsSection,
      costOptimisation: costSection,
      fraudRiskIndicators: fraudSection,
      supportingImages: imageSection,
      fullReport,
      generatedAt: new Date().toISOString(),
    };

    ctx.log("Stage 10", `Report generation complete. ${Object.keys(fullReport.sections).length} sections compiled.`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 10", `Report generation failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
