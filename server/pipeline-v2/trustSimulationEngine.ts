/**
 * TRE v4.0 — Enhancement 8: Trust Simulation Engine
 *
 * Enables what-if analysis on claim truth objects.
 * Simulates the effect of changing individual inputs (speed, fraud score,
 * cost, damage severity) on the final CTO recommendation, integrity score,
 * and certificate status — without touching the live pipeline.
 */

import type { ClaimTruthObject } from "./truthReconciliationEngine";
import { computeIntegrityScore } from "./truthGovernanceRegistry";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SimulationParameterKey =
  | "estimatedSpeedKmh"
  | "fraudRiskScore"
  | "optimisedCostUsd"
  | "overallConfidence"
  | "physicsConfidence"
  | "fraudConfidence"
  | "costConfidence"
  | "visionSourceReliability"
  | "recommendation";

export interface SimulationParameter {
  key: SimulationParameterKey;
  originalValue: number | string;
  simulatedValue: number | string;
  description: string;
}

export interface SimulationScenario {
  scenarioId: string;
  scenarioName: string;
  description: string;
  parameters: SimulationParameter[];
  createdAt: string;
}

export interface SimulationResult {
  scenarioId: string;
  scenarioName: string;
  claimId: string;
  simulatedAt: string;
  originalCTO: SimulationSnapshot;
  simulatedCTO: SimulationSnapshot;
  delta: SimulationDelta;
  sensitivityAnalysis: SensitivityAnalysis;
  recommendation: string;
  riskAssessment: SimulationRiskAssessment;
}

export interface SimulationSnapshot {
  recommendation: string;
  integrityScore: number;
  integrityLabel: string;
  overallConfidence: number;
  fraudRiskScore: number;
  estimatedSpeedKmh: number;
  optimisedCostUsd: number;
  certificateStatus: string;
  blockingReasonsCount: number;
  warningCount: number;
}

export interface SimulationDelta {
  recommendationChanged: boolean;
  integrityScoreDelta: number;
  confidenceDelta: number;
  fraudScoreDelta: number;
  speedDelta: number;
  costDelta: number;
  certificateStatusChanged: boolean;
  blockingReasonsAdded: number;
  blockingReasonsRemoved: number;
}

export interface SensitivityAnalysis {
  mostSensitiveParameter: SimulationParameterKey | null;
  sensitivityScores: Record<string, number>;
  tippingPoints: TippingPoint[];
}

export interface TippingPoint {
  parameter: SimulationParameterKey;
  currentValue: number | string;
  tippingValue: number | string;
  effect: string;
}

export interface SimulationRiskAssessment {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskFactors: string[];
  mitigationSuggestions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function snapshotCTO(cto: ClaimTruthObject): SimulationSnapshot {
  const integrity = computeIntegrityScore(
    0, // numericConflicts — simplified for simulation
    0, // semanticConflicts
    0, // temporalConflicts
    cto.consistency.criticalConflictCount, // logicalConflicts
    0, // manualOverrides
    0, // missingEvidenceItems
    cto.confidence.decayApplied ? 5 : 0, // confidenceDecayPoints
    0  // provenanceGaps
  );

  return {
    recommendation: cto.decision.recommendation,
    integrityScore: integrity.score,
    integrityLabel: integrity.label,
    overallConfidence: cto.confidence.overallConfidence,
    fraudRiskScore: cto.fraud.fraudRiskScore,
    estimatedSpeedKmh: cto.physics.estimatedSpeedKmh ?? 0,
    optimisedCostUsd: cto.cost.optimisedCostUsd,
    certificateStatus: cto.certification.certificate.certified,
    blockingReasonsCount: cto.certification.certificate.blockingReasons.length,
    warningCount: cto.certification.certificate.warnings.length,
  };
}

function applyParameters(
  cto: ClaimTruthObject,
  parameters: SimulationParameter[]
): ClaimTruthObject {
  // Deep clone to avoid mutating the original
  const simulated: ClaimTruthObject = JSON.parse(JSON.stringify(cto));

  for (const param of parameters) {
    switch (param.key) {
      case "estimatedSpeedKmh":
        simulated.physics.estimatedSpeedKmh = Number(param.simulatedValue);
        break;
      case "fraudRiskScore":
        simulated.fraud.fraudRiskScore = Number(param.simulatedValue);
        // Recalculate fraud level
        const fraudScore = Number(param.simulatedValue);
        simulated.fraud.fraudRiskLevel =
          fraudScore >= 80 ? "elevated" :
          fraudScore >= 60 ? "high" :
          fraudScore >= 40 ? "moderate" : "low";
        // Recalculate decision if fraud is now critical
        if (fraudScore >= 80 && simulated.decision.recommendation !== "ESCALATE") {
          simulated.decision.recommendation = "ESCALATE";
          simulated.decision.primaryReason = "Simulated fraud score exceeds critical threshold";
        }
        break;
      case "optimisedCostUsd":
        simulated.cost.optimisedCostUsd = Number(param.simulatedValue);
        break;
      case "overallConfidence":
        simulated.confidence.overallConfidence = Number(param.simulatedValue);
        break;
      case "physicsConfidence":
        simulated.confidence.physicsConfidence = Number(param.simulatedValue);
        break;
      case "fraudConfidence":
        simulated.confidence.fraudConfidence = Number(param.simulatedValue);
        break;
      case "costConfidence":
        simulated.confidence.costConfidence = Number(param.simulatedValue);
        break;
      case "visionSourceReliability":
        simulated.damage.visionSourceReliability =
          param.simulatedValue as "HIGH" | "MEDIUM" | "LOW" | "NONE";
        break;
      case "recommendation":
        simulated.decision.recommendation =
          param.simulatedValue as "APPROVE" | "REVIEW" | "ESCALATE" | "REJECT";
        break;
    }
  }

  return simulated;
}

function computeDelta(
  original: SimulationSnapshot,
  simulated: SimulationSnapshot
): SimulationDelta {
  return {
    recommendationChanged: original.recommendation !== simulated.recommendation,
    integrityScoreDelta: simulated.integrityScore - original.integrityScore,
    confidenceDelta: simulated.overallConfidence - original.overallConfidence,
    fraudScoreDelta: simulated.fraudRiskScore - original.fraudRiskScore,
    speedDelta: simulated.estimatedSpeedKmh - original.estimatedSpeedKmh,
    costDelta: simulated.optimisedCostUsd - original.optimisedCostUsd,
    certificateStatusChanged: original.certificateStatus !== simulated.certificateStatus,
    blockingReasonsAdded: Math.max(0, simulated.blockingReasonsCount - original.blockingReasonsCount),
    blockingReasonsRemoved: Math.max(0, original.blockingReasonsCount - simulated.blockingReasonsCount),
  };
}

function computeSensitivity(
  cto: ClaimTruthObject,
  parameters: SimulationParameter[]
): SensitivityAnalysis {
  const sensitivityScores: Record<string, number> = {};
  const tippingPoints: TippingPoint[] = [];

  for (const param of parameters) {
    const original = Number(param.originalValue);
    const simulated = Number(param.simulatedValue);
    if (!isNaN(original) && !isNaN(simulated) && original !== 0) {
      sensitivityScores[param.key] = Math.abs((simulated - original) / original);
    }
  }

  // Compute tipping points for known thresholds
  const fraudScore = cto.fraud.fraudRiskScore;
  if (fraudScore < 80) {
    tippingPoints.push({
      parameter: "fraudRiskScore",
      currentValue: fraudScore,
      tippingValue: 80,
      effect: "Recommendation changes from REVIEW to ESCALATE",
    });
  }
  if (fraudScore < 60) {
    tippingPoints.push({
      parameter: "fraudRiskScore",
      currentValue: fraudScore,
      tippingValue: 60,
      effect: "Fraud risk level changes from MEDIUM to HIGH",
    });
  }

  const confidence = cto.confidence.overallConfidence;
  if (confidence > 40) {
    tippingPoints.push({
      parameter: "overallConfidence",
      currentValue: confidence,
      tippingValue: 40,
      effect: "Integrity score drops to POOR range",
    });
  }

  const entries = Object.entries(sensitivityScores);
  const mostSensitive = entries.length > 0
    ? (entries.sort((a, b) => b[1] - a[1])[0][0] as SimulationParameterKey)
    : null;

  return { mostSensitiveParameter: mostSensitive, sensitivityScores, tippingPoints };
}

function assessRisk(delta: SimulationDelta, simulated: SimulationSnapshot): SimulationRiskAssessment {
  const riskFactors: string[] = [];
  const mitigations: string[] = [];

  if (delta.recommendationChanged) {
    riskFactors.push(`Recommendation changed to ${simulated.recommendation}`);
    mitigations.push("Review the simulated parameters against actual evidence");
  }
  if (delta.integrityScoreDelta < -10) {
    riskFactors.push(`Integrity score dropped by ${Math.abs(delta.integrityScoreDelta).toFixed(1)} points`);
    mitigations.push("Investigate the root cause of confidence reduction");
  }
  if (delta.blockingReasonsAdded > 0) {
    riskFactors.push(`${delta.blockingReasonsAdded} new blocking reason(s) introduced`);
    mitigations.push("Resolve blocking reasons before publication");
  }
  if (delta.certificateStatusChanged) {
    riskFactors.push(`Certificate status changed to ${simulated.certificateStatus}`);
    mitigations.push("Re-certify after resolving underlying conflicts");
  }
  if (delta.fraudScoreDelta > 20) {
    riskFactors.push(`Fraud risk score increased by ${delta.fraudScoreDelta.toFixed(0)} points`);
    mitigations.push("Escalate to fraud analyst for manual review");
  }

  const riskLevel: SimulationRiskAssessment["riskLevel"] =
    riskFactors.length === 0 ? "LOW" :
    riskFactors.length === 1 ? "MEDIUM" :
    riskFactors.length <= 3 ? "HIGH" : "CRITICAL";

  return { riskLevel, riskFactors, mitigationSuggestions: mitigations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation Engine
// ─────────────────────────────────────────────────────────────────────────────

class TrustSimulationEngineImpl {
  private scenarios: Map<string, SimulationScenario> = new Map();
  private results: Map<string, SimulationResult> = new Map();
  private counter = 0;

  private nextId(): string {
    this.counter += 1;
    return `SIM-${String(this.counter).padStart(6, "0")}`;
  }

  defineScenario(
    name: string,
    description: string,
    parameters: Array<Omit<SimulationParameter, "originalValue">>
  ): SimulationScenario {
    const scenario: SimulationScenario = {
      scenarioId: this.nextId(),
      scenarioName: name,
      description,
      parameters: parameters.map((p) => ({ ...p, originalValue: 0 })),
      createdAt: new Date().toISOString(),
    };
    this.scenarios.set(scenario.scenarioId, scenario);
    return scenario;
  }

  simulate(
    claimId: string,
    cto: ClaimTruthObject,
    scenario: SimulationScenario
  ): SimulationResult {
    // Populate originalValue from the live CTO
    const populatedParams: SimulationParameter[] = scenario.parameters.map((p) => {
      let originalValue: number | string = 0;
      switch (p.key) {
        case "estimatedSpeedKmh": originalValue = cto.physics.estimatedSpeedKmh ?? 0; break;
        case "fraudRiskScore": originalValue = cto.fraud.fraudRiskScore; break;
        case "optimisedCostUsd": originalValue = cto.cost.optimisedCostUsd; break;
        case "overallConfidence": originalValue = cto.confidence.overallConfidence ?? 0; break;
        case "physicsConfidence": originalValue = cto.confidence.physicsConfidence ?? 0; break;
        case "fraudConfidence": originalValue = cto.confidence.fraudConfidence ?? 0; break;
        case "costConfidence": originalValue = cto.confidence.costConfidence ?? 0; break;
        case "visionSourceReliability": originalValue = cto.damage.visionSourceReliability; break;
        case "recommendation": originalValue = cto.decision.recommendation; break;
      }
      return { ...p, originalValue };
    });

    const originalSnapshot = snapshotCTO(cto);
    const simulatedCTO = applyParameters(cto, populatedParams);
    const simulatedSnapshot = snapshotCTO(simulatedCTO);
    const delta = computeDelta(originalSnapshot, simulatedSnapshot);
    const sensitivity = computeSensitivity(cto, populatedParams);
    const risk = assessRisk(delta, simulatedSnapshot);

    const result: SimulationResult = {
      scenarioId: scenario.scenarioId,
      scenarioName: scenario.scenarioName,
      claimId,
      simulatedAt: new Date().toISOString(),
      originalCTO: originalSnapshot,
      simulatedCTO: simulatedSnapshot,
      delta,
      sensitivityAnalysis: sensitivity,
      recommendation: delta.recommendationChanged
        ? `Recommendation would change from ${originalSnapshot.recommendation} to ${simulatedSnapshot.recommendation}`
        : `Recommendation remains ${originalSnapshot.recommendation}`,
      riskAssessment: risk,
    };

    this.results.set(`${claimId}:${scenario.scenarioId}`, result);
    return result;
  }

  runBatch(
    claimId: string,
    cto: ClaimTruthObject,
    scenarios: SimulationScenario[]
  ): SimulationResult[] {
    return scenarios.map((s) => this.simulate(claimId, cto, s));
  }

  getResult(claimId: string, scenarioId: string): SimulationResult | undefined {
    return this.results.get(`${claimId}:${scenarioId}`);
  }

  getScenario(scenarioId: string): SimulationScenario | undefined {
    return this.scenarios.get(scenarioId);
  }

  listScenarios(): SimulationScenario[] {
    return [...this.scenarios.values()];
  }

  // Pre-built standard scenarios
  getStandardScenarios(): SimulationScenario[] {
    return [
      this.defineScenario(
        "HIGH_FRAUD_RISK",
        "What if fraud risk score was 85?",
        [{ key: "fraudRiskScore", simulatedValue: 85, description: "Elevate fraud risk to critical" }]
      ),
      this.defineScenario(
        "LOW_CONFIDENCE",
        "What if overall confidence dropped to 35?",
        [{ key: "overallConfidence", simulatedValue: 35, description: "Drop confidence to POOR range" }]
      ),
      this.defineScenario(
        "VISION_UNRELIABLE",
        "What if vision source reliability was NONE?",
        [{ key: "visionSourceReliability", simulatedValue: "NONE", description: "No confirmed damage photos" }]
      ),
      this.defineScenario(
        "COST_SPIKE",
        "What if repair cost doubled?",
        [{ key: "optimisedCostUsd", simulatedValue: 999999, description: "Cost spike to total loss threshold" }]
      ),
    ];
  }

  clear(): void {
    this.scenarios.clear();
    this.results.clear();
    this.counter = 0;
  }
}

export const trustSimulationEngine = new TrustSimulationEngineImpl();
