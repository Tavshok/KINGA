/**
 * Physics Validation Helper
 * 
 * Converts raw physics engine output into IP-protected confidence scores
 * WITHOUT exposing proprietary formulas (Campbell's, impulse-momentum, etc.)
 */

interface PhysicsResult {
  speedEstimate: number;
  impactForce: number;
  energyDissipated: number;
  deltaV: number;
  fraudIndicators: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
  impossibleDamage: boolean;
  geometricConsistency: boolean;
  severityConsistency: boolean;
}

interface PhysicsValidation {
  overallConfidence: number;
  speedConsistency: number;
  damagePropagation: number;
  impactForceAnalysis: number;
  geometricAlignment: number;
  anomalies: Array<{
    type: "info" | "warning" | "error";
    title: string;
    description: string;
    riskLevel: "low" | "medium" | "high";
  }>;
  recommendation: "approve" | "review" | "reject";
  narrativeSummary: string;
}

export function generatePhysicsValidation(
  physicsResult: PhysicsResult,
  reportedSpeed: number,
  damageDescription: string
): PhysicsValidation {
  // Calculate confidence scores (0-100) without exposing formulas
  
  // Speed consistency: Compare reported speed vs physics-estimated speed
  const speedDifference = Math.abs(reportedSpeed - physicsResult.speedEstimate);
  const speedConsistency = Math.max(0, 100 - (speedDifference / reportedSpeed) * 200);
  
  // Damage propagation: Based on energy dissipation patterns
  const damagePropagation = physicsResult.severityConsistency ? 95 : 65;
  
  // Impact force analysis: Validate force calculations
  const impactForceAnalysis = physicsResult.impactForce > 0 && physicsResult.impactForce < 500000 ? 90 : 60;
  
  // Geometric alignment: Impact point vs damage location
  const geometricAlignment = physicsResult.geometricConsistency ? 92 : 55;
  
  // Overall confidence: Weighted average
  const overallConfidence = Math.round(
    speedConsistency * 0.3 +
    damagePropagation * 0.25 +
    impactForceAnalysis * 0.25 +
    geometricAlignment * 0.2
  );
  
  // Convert fraud indicators to anomalies (IP-protected descriptions)
  const anomalies = physicsResult.fraudIndicators.map(indicator => {
    let type: "info" | "warning" | "error" = "info";
    let riskLevel: "low" | "medium" | "high" = "low";
    
    if (indicator.severity === "high") {
      type = "error";
      riskLevel = "high";
    } else if (indicator.severity === "medium") {
      type = "warning";
      riskLevel = "medium";
    }
    
    return {
      type,
      title: getGenericTitle(indicator.type),
      description: getGenericDescription(indicator.type, indicator.description),
      riskLevel,
    };
  });
  
  // Add impossible damage anomaly if detected
  if (physicsResult.impossibleDamage) {
    anomalies.push({
      type: "error",
      title: "Physics Violation Detected",
      description: "The reported damage pattern is inconsistent with the laws of physics for the stated collision scenario. This warrants immediate investigation.",
      riskLevel: "high",
    });
  }
  
  // Generate recommendation
  let recommendation: "approve" | "review" | "reject" = "approve";
  if (overallConfidence < 70) {
    recommendation = "reject";
  } else if (overallConfidence < 85 || anomalies.some(a => a.riskLevel === "high")) {
    recommendation = "review";
  }
  
  // Generate narrative summary (generic, no formulas)
  const narrativeSummary = generateNarrativeSummary(
    overallConfidence,
    physicsResult,
    reportedSpeed,
    speedDifference,
    anomalies.length
  );
  
  return {
    overallConfidence,
    speedConsistency: Math.round(speedConsistency),
    damagePropagation: Math.round(damagePropagation),
    impactForceAnalysis: Math.round(impactForceAnalysis),
    geometricAlignment: Math.round(geometricAlignment),
    anomalies,
    recommendation,
    narrativeSummary,
  };
}

function getGenericTitle(type: string): string {
  const titles: Record<string, string> = {
    speed_discrepancy: "Speed Discrepancy Detected",
    impossible_damage: "Damage Pattern Anomaly",
    severity_mismatch: "Severity Inconsistency",
    geometric_violation: "Impact Geometry Mismatch",
    energy_anomaly: "Energy Distribution Anomaly",
  };
  return titles[type] || "Anomaly Detected";
}

function getGenericDescription(type: string, originalDescription: string): string {
  // Remove any formula-specific details from description
  const descriptions: Record<string, string> = {
    speed_discrepancy: "The reported collision speed shows minor variance from the physics-based analysis. This may indicate estimation error or require clarification.",
    impossible_damage: "The damage pattern is inconsistent with the reported collision dynamics based on accident reconstruction principles.",
    severity_mismatch: "The extent of damage does not align with the reported collision severity. Further investigation recommended.",
    geometric_violation: "The impact point and damage location show inconsistencies that warrant review.",
    energy_anomaly: "The energy distribution pattern deviates from expected norms for this collision type.",
  };
  return descriptions[type] || "An anomaly has been detected that requires review.";
}

function generateNarrativeSummary(
  confidence: number,
  physics: PhysicsResult,
  reportedSpeed: number,
  speedDiff: number,
  anomalyCount: number
): string {
  if (confidence >= 90) {
    return `Our physics-based analysis validates the reported collision scenario. The damage pattern is consistent with the stated impact conditions. All key parameters fall within expected ranges for this collision type. No significant anomalies detected. Fraud risk: LOW.`;
  } else if (confidence >= 75) {
    return `The collision scenario is generally consistent with physics-based analysis, with ${anomalyCount} minor discrepanc${anomalyCount === 1 ? 'y' : 'ies'} detected. The reported speed of ${reportedSpeed} km/h shows a ${speedDiff.toFixed(0)} km/h variance from our analysis. These discrepancies may represent estimation errors rather than fraud indicators. Recommend standard processing with routine verification. Fraud risk: MEDIUM.`;
  } else {
    return `Significant inconsistencies detected between the reported collision scenario and physics-based analysis. ${anomalyCount} anomal${anomalyCount === 1 ? 'y' : 'ies'} identified that ${anomalyCount === 1 ? 'requires' : 'require'} immediate investigation. The damage pattern and reported conditions show substantial deviations from expected norms. Recommend detailed review before claim approval. Fraud risk: HIGH.`;
  }
}
