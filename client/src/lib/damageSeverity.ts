/**
 * Damage Severity Scoring System
 * 
 * Calculates a 1-10 severity score for each damaged vehicle zone based on:
 * 1. Repair Cost (40% weight)
 * 2. Structural Impact (35% weight)
 * 3. Safety Implications (25% weight)
 */

export interface DamageSeverity {
  zone: string;
  score: number; // 1-10 scale
  level: "Minor" | "Moderate" | "Severe" | "Critical";
  repairCost: number;
  structuralImpact: boolean;
  safetyImplications: string[];
  priorityRank: number;
}

export interface SeverityFactors {
  estimatedCost: number;
  structuralDamage: boolean;
  airbagDeployment: boolean;
  accidentType: string;
  damagedComponents: string[];
}

/**
 * Calculate damage severity score for a specific zone
 */
export function calculateZoneSeverity(
  zone: string,
  componentsInZone: string[],
  factors: SeverityFactors
): DamageSeverity {
  let score = 0;
  const safetyImplications: string[] = [];

  // === REPAIR COST FACTOR (40% weight) ===
  const costPerComponent = factors.estimatedCost / Math.max(factors.damagedComponents.length, 1);
  const zoneCost = costPerComponent * componentsInZone.length;
  
  // Cost scoring (0-4 points)
  if (zoneCost > 200000) score += 4; // >$2000
  else if (zoneCost > 100000) score += 3; // >$1000
  else if (zoneCost > 50000) score += 2; // >$500
  else if (zoneCost > 20000) score += 1; // >$200
  else score += 0.5;

  // === STRUCTURAL IMPACT FACTOR (35% weight) ===
  const structuralZones = ["front", "rear", "roof", "left_side", "right_side"];
  const isStructuralZone = structuralZones.includes(zone);
  
  if (factors.structuralDamage && isStructuralZone) {
    score += 3.5;
    safetyImplications.push("Structural integrity compromised");
  } else if (isStructuralZone && componentsInZone.length > 2) {
    score += 2;
    safetyImplications.push("Potential frame/unibody damage");
  } else if (isStructuralZone) {
    score += 1;
  }

  // Specific structural components
  const hasFrameDamage = componentsInZone.some(c => 
    c.toLowerCase().includes("frame") || 
    c.toLowerCase().includes("pillar") ||
    c.toLowerCase().includes("subframe")
  );
  if (hasFrameDamage) {
    score += 1.5;
    safetyImplications.push("Frame damage affects vehicle rigidity");
  }

  // === SAFETY IMPLICATIONS FACTOR (25% weight) ===
  
  // Airbag deployment
  if (factors.airbagDeployment && (zone === "front" || zone === "left_side" || zone === "right_side")) {
    score += 1.5;
    safetyImplications.push("Airbag system requires replacement");
  }

  // Critical safety components
  const hasSuspensionDamage = componentsInZone.some(c => 
    c.toLowerCase().includes("suspension") ||
    c.toLowerCase().includes("wheel") ||
    c.toLowerCase().includes("axle")
  );
  if (hasSuspensionDamage) {
    score += 1;
    safetyImplications.push("Suspension damage affects vehicle control");
  }

  // Visibility components
  const hasVisibilityDamage = componentsInZone.some(c =>
    c.toLowerCase().includes("windshield") ||
    c.toLowerCase().includes("mirror") ||
    c.toLowerCase().includes("headlight")
  );
  if (hasVisibilityDamage) {
    score += 0.5;
    safetyImplications.push("Visibility components affected");
  }

  // Rollover accidents (high safety risk)
  if (factors.accidentType === "rollover" && zone === "roof") {
    score += 1.5;
    safetyImplications.push("Rollover damage - high injury risk");
  }

  // Multi-impact accidents
  if (factors.accidentType === "multi_impact") {
    score += 0.5;
    safetyImplications.push("Multiple impact points detected");
  }

  // Cap score at 10
  score = Math.min(score, 10);

  // Determine severity level
  let level: "Minor" | "Moderate" | "Severe" | "Critical";
  if (score >= 8) level = "Critical";
  else if (score >= 6) level = "Severe";
  else if (score >= 4) level = "Moderate";
  else level = "Minor";

  return {
    zone,
    score: Math.round(score * 10) / 10, // Round to 1 decimal
    level,
    repairCost: zoneCost,
    structuralImpact: factors.structuralDamage && isStructuralZone,
    safetyImplications,
    priorityRank: 0, // Will be set after calculating all zones
  };
}

/**
 * Calculate severity scores for all damaged zones
 */
export function calculateAllZoneSeverities(
  damagedZones: Map<string, string[]>,
  factors: SeverityFactors
): DamageSeverity[] {
  const severities: DamageSeverity[] = [];

  damagedZones.forEach((components, zone) => {
    const severity = calculateZoneSeverity(zone, components, factors);
    severities.push(severity);
  });

  // Sort by score (descending) and assign priority ranks
  severities.sort((a, b) => b.score - a.score);
  severities.forEach((severity, index) => {
    severity.priorityRank = index + 1;
  });

  return severities;
}

/**
 * Get color for severity level
 */
export function getSeverityColor(level: string): string {
  switch (level) {
    case "Critical":
      return "#dc2626"; // red-600
    case "Severe":
      return "#f97316"; // orange-500
    case "Moderate":
      return "#eab308"; // yellow-500
    case "Minor":
      return "#22c55e"; // green-500
    default:
      return "#9ca3af"; // gray-400
  }
}

/**
 * Get severity description
 */
export function getSeverityDescription(level: string): string {
  switch (level) {
    case "Critical":
      return "Immediate attention required. Major structural or safety concerns.";
    case "Severe":
      return "High priority repair needed. Significant damage detected.";
    case "Moderate":
      return "Standard repair required. Moderate damage level.";
    case "Minor":
      return "Low priority repair. Cosmetic or minor damage.";
    default:
      return "Unknown severity level.";
  }
}
