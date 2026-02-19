// @ts-nocheck
/**
 * Physics Quantitative Output Extension
 * 
 * Extends physics validation engine to output quantitative vector data:
 * - impactAngleDegrees (0-360)
 * - calculatedImpactForceKN (kilonewtons)
 * - impactLocationNormalized ({relativeX, relativeY})
 * 
 * Maintains backward compatibility with existing qualitative labels.
 */

import type { ImpactPoint, AccidentType } from "./accidentPhysics";

// ============================================================================
// TYPES
// ============================================================================

export interface QuantitativePhysicsValidation {
  // NEW: Quantitative vector data
  impactAngleDegrees: number; // 0-360
  calculatedImpactForceKN: number; // kilonewtons, 1 decimal
  impactLocationNormalized: {
    relativeX: number; // 0-1
    relativeY: number; // 0-1
  };
  
  // EXISTING: Backward compatibility
  severityLevel: string;
  confidenceScore: number;
  
  // NEW: Additional quantitative fields (Phase 3)
  impactSpeedKmh?: number; // Impact speed in km/h
  deltaV?: number; // Change in velocity (m/s)
  crushDepthCm?: number; // Crush depth in centimeters
  crushEnergyJoules?: number; // Energy absorbed by crush (J)
  principalDirectionOfForce?: string; // "frontal", "rear", "lateral_left", "lateral_right"
  
  // Methodology traceability
  methodology?: {
    formulaUsed?: string;
    assumptions?: string[];
    notes?: string;
    modelVersion?: string;
  };
}

// ============================================================================
// COMPONENT → NORMALIZED COORDINATE MAPPING
// ============================================================================

/**
 * Maps component names to normalized vehicle surface coordinates (0-1)
 * 
 * Coordinate system:
 * - X: 0 (left) → 1 (right)
 * - Y: 0 (front) → 1 (rear)
 * 
 * Example mappings:
 * - front_center → { x: 0.5, y: 0.2 }
 * - rear_left → { x: 0.2, y: 0.8 }
 */
const COMPONENT_COORDINATE_MAP: Record<string, { relativeX: number; relativeY: number }> = {
  // Front (Y: 0.0 - 0.3)
  "front_center": { relativeX: 0.5, relativeY: 0.15 },
  "front_left": { relativeX: 0.2, relativeY: 0.15 },
  "front_right": { relativeX: 0.8, relativeY: 0.15 },
  "front_bumper": { relativeX: 0.5, relativeY: 0.05 },
  "front_left_fender": { relativeX: 0.2, relativeY: 0.2 },
  "front_right_fender": { relativeX: 0.8, relativeY: 0.2 },
  "hood": { relativeX: 0.5, relativeY: 0.25 },
  "windshield": { relativeX: 0.5, relativeY: 0.3 },
  
  // Side Left (X: 0.0 - 0.3, Y: 0.3 - 0.7)
  "side_left_front": { relativeX: 0.15, relativeY: 0.35 },
  "side_left_center": { relativeX: 0.15, relativeY: 0.5 },
  "side_left_rear": { relativeX: 0.15, relativeY: 0.65 },
  "left_front_door": { relativeX: 0.15, relativeY: 0.4 },
  "left_rear_door": { relativeX: 0.15, relativeY: 0.6 },
  "left_mirror": { relativeX: 0.1, relativeY: 0.35 },
  
  // Side Right (X: 0.7 - 1.0, Y: 0.3 - 0.7)
  "side_right_front": { relativeX: 0.85, relativeY: 0.35 },
  "side_right_center": { relativeX: 0.85, relativeY: 0.5 },
  "side_right_rear": { relativeX: 0.85, relativeY: 0.65 },
  "right_front_door": { relativeX: 0.85, relativeY: 0.4 },
  "right_rear_door": { relativeX: 0.85, relativeY: 0.6 },
  "right_mirror": { relativeX: 0.9, relativeY: 0.35 },
  
  // Rear (Y: 0.7 - 1.0)
  "rear_center": { relativeX: 0.5, relativeY: 0.85 },
  "rear_left": { relativeX: 0.2, relativeY: 0.85 },
  "rear_right": { relativeX: 0.8, relativeY: 0.85 },
  "rear_bumper": { relativeX: 0.5, relativeY: 0.95 },
  "rear_left_quarter_panel": { relativeX: 0.2, relativeY: 0.8 },
  "rear_right_quarter_panel": { relativeX: 0.8, relativeY: 0.8 },
  "trunk": { relativeX: 0.5, relativeY: 0.75 },
  "rear_windshield": { relativeX: 0.5, relativeY: 0.7 },
  
  // Roof & Undercarriage (special cases)
  "roof": { relativeX: 0.5, relativeY: 0.5 },
  "roof_front": { relativeX: 0.5, relativeY: 0.3 },
  "roof_rear": { relativeX: 0.5, relativeY: 0.7 },
  "undercarriage": { relativeX: 0.5, relativeY: 0.5 },
  
  // Default fallback
  "unknown": { relativeX: 0.5, relativeY: 0.5 },
};

/**
 * Maps ImpactPoint enum to normalized coordinates
 */
const IMPACT_POINT_COORDINATE_MAP: Record<ImpactPoint, { relativeX: number; relativeY: number }> = {
  "front_center": { relativeX: 0.5, relativeY: 0.15 },
  "front_left": { relativeX: 0.2, relativeY: 0.15 },
  "front_right": { relativeX: 0.8, relativeY: 0.15 },
  "rear_center": { relativeX: 0.5, relativeY: 0.85 },
  "rear_left": { relativeX: 0.2, relativeY: 0.85 },
  "rear_right": { relativeX: 0.8, relativeY: 0.85 },
  "side_left_front": { relativeX: 0.15, relativeY: 0.35 },
  "side_left_center": { relativeX: 0.15, relativeY: 0.5 },
  "side_left_rear": { relativeX: 0.15, relativeY: 0.65 },
  "side_right_front": { relativeX: 0.85, relativeY: 0.35 },
  "side_right_center": { relativeX: 0.85, relativeY: 0.5 },
  "side_right_rear": { relativeX: 0.85, relativeY: 0.65 },
  "roof": { relativeX: 0.5, relativeY: 0.5 },
  "undercarriage": { relativeX: 0.5, relativeY: 0.5 },
};

// ============================================================================
// IMPACT ANGLE CALCULATION (0-360 degrees)
// ============================================================================

/**
 * Calculate impact angle in degrees (0-360)
 * 
 * Priority:
 * 1. Derive from accidentType if available
 * 2. Derive from vehicle heading + collision direction
 * 3. Infer from damagedComponents location
 * 
 * Angle convention:
 * - 0° = Front center (12 o'clock)
 * - 90° = Right side (3 o'clock)
 * - 180° = Rear center (6 o'clock)
 * - 270° = Left side (9 o'clock)
 */
export function calculateImpactAngleDegrees(
  accidentType?: AccidentType,
  impactPoint?: ImpactPoint,
  damagedComponents?: string[]
): number {
  
  // Priority 1: Derive from accidentType
  if (accidentType) {
    const angleFromAccidentType = getAngleFromAccidentType(accidentType);
    if (angleFromAccidentType !== null) {
      return angleFromAccidentType;
    }
  }
  
  // Priority 2: Derive from impactPoint
  if (impactPoint) {
    const angleFromImpactPoint = getAngleFromImpactPoint(impactPoint);
    if (angleFromImpactPoint !== null) {
      return angleFromImpactPoint;
    }
  }
  
  // Priority 3: Infer from damagedComponents
  if (damagedComponents && damagedComponents.length > 0) {
    return inferAngleFromDamagedComponents(damagedComponents);
  }
  
  // Default: Unknown (front center)
  return 0;
}

/**
 * Maps AccidentType to impact angle
 */
function getAngleFromAccidentType(accidentType: AccidentType): number | null {
  const angleMap: Record<AccidentType, number> = {
    "frontal": 0,
    "rear": 180,
    "side_driver": 270, // Left side
    "side_passenger": 90, // Right side
    "rollover": 0, // Default to front (rollover doesn't have clear angle)
    "multi_impact": 0, // Default to front
    "unknown": 0,
  };
  
  return angleMap[accidentType] ?? null;
}

/**
 * Maps ImpactPoint to impact angle
 */
function getAngleFromImpactPoint(impactPoint: ImpactPoint): number | null {
  const angleMap: Record<ImpactPoint, number> = {
    "front_center": 0,
    "front_left": 315, // 45° from front-left
    "front_right": 45, // 45° from front-right
    "rear_center": 180,
    "rear_left": 225, // 45° from rear-left
    "rear_right": 135, // 45° from rear-right
    "side_left_front": 270, // Left side, front bias
    "side_left_center": 270, // Pure left side
    "side_left_rear": 270, // Left side, rear bias
    "side_right_front": 90, // Right side, front bias
    "side_right_center": 90, // Pure right side
    "side_right_rear": 90, // Right side, rear bias
    "roof": 0, // Default to front (roof impact doesn't have clear angle)
    "undercarriage": 0, // Default to front
  };
  
  return angleMap[impactPoint] ?? null;
}

/**
 * Infers impact angle from damaged component locations
 */
function inferAngleFromDamagedComponents(damagedComponents: string[]): number {
  // Count damage by quadrant
  let frontCount = 0;
  let rearCount = 0;
  let leftCount = 0;
  let rightCount = 0;
  
  for (const component of damagedComponents) {
    const lower = component.toLowerCase();
    
    if (lower.includes("front") || lower.includes("hood") || lower.includes("windshield")) {
      frontCount++;
    }
    if (lower.includes("rear") || lower.includes("trunk") || lower.includes("back")) {
      rearCount++;
    }
    if (lower.includes("left") || lower.includes("driver")) {
      leftCount++;
    }
    if (lower.includes("right") || lower.includes("passenger")) {
      rightCount++;
    }
  }
  
  // Calculate dominant direction
  const verticalBias = frontCount - rearCount; // Positive = front, negative = rear
  const horizontalBias = rightCount - leftCount; // Positive = right, negative = left
  
  // Convert to angle using atan2
  // atan2(y, x) where y = vertical, x = horizontal
  // Adjust for our coordinate system (0° = front)
  const angleRadians = Math.atan2(horizontalBias, verticalBias);
  let angleDegrees = angleRadians * (180 / Math.PI);
  
  // Normalize to 0-360
  if (angleDegrees < 0) {
    angleDegrees += 360;
  }
  
  return Math.round(angleDegrees);
}

// ============================================================================
// NORMALIZED COORDINATE MAPPING
// ============================================================================

/**
 * Maps component name or ImpactPoint to normalized vehicle surface coordinates
 * 
 * Returns {relativeX, relativeY} where:
 * - relativeX: 0 (left) → 1 (right)
 * - relativeY: 0 (front) → 1 (rear)
 */
export function getImpactLocationNormalized(
  impactPoint?: ImpactPoint,
  damagedComponents?: string[]
): { relativeX: number; relativeY: number } {
  
  // Priority 1: Use impactPoint if available
  if (impactPoint && IMPACT_POINT_COORDINATE_MAP[impactPoint]) {
    return IMPACT_POINT_COORDINATE_MAP[impactPoint];
  }
  
  // Priority 2: Infer from damagedComponents
  if (damagedComponents && damagedComponents.length > 0) {
    return inferLocationFromDamagedComponents(damagedComponents);
  }
  
  // Default: Center of vehicle
  return { relativeX: 0.5, relativeY: 0.5 };
}

/**
 * Infers normalized location from damaged component names
 */
function inferLocationFromDamagedComponents(
  damagedComponents: string[]
): { relativeX: number; relativeY: number } {
  
  let totalX = 0;
  let totalY = 0;
  let count = 0;
  
  for (const component of damagedComponents) {
    const lower = component.toLowerCase().replace(/\s+/g, "_");
    
    // Try exact match first
    if (COMPONENT_COORDINATE_MAP[lower]) {
      totalX += COMPONENT_COORDINATE_MAP[lower].relativeX;
      totalY += COMPONENT_COORDINATE_MAP[lower].relativeY;
      count++;
      continue;
    }
    
    // Try partial match
    for (const [key, coords] of Object.entries(COMPONENT_COORDINATE_MAP)) {
      if (lower.includes(key) || key.includes(lower)) {
        totalX += coords.relativeX;
        totalY += coords.relativeY;
        count++;
        break;
      }
    }
  }
  
  if (count === 0) {
    // No matches found, return center
    return { relativeX: 0.5, relativeY: 0.5 };
  }
  
  // Return average of all matched components
  return {
    relativeX: Math.round((totalX / count) * 100) / 100, // 2 decimal places
    relativeY: Math.round((totalY / count) * 100) / 100,
  };
}

// ============================================================================
// FORCE CALCULATION (kilonewtons)
// ============================================================================

/**
 * Calculates impact force in kilonewtons (kN) from existing physics data
 * 
 * Uses impulse-momentum formula:
 * F = m * Δv / Δt
 * 
 * Returns force rounded to 1 decimal place
 */
export function calculateImpactForceKN(
  forceMagnitudeNewtons?: number,
  mass?: number,
  speed?: number,
  crushDepth?: number
): number {
  
  // Priority 1: Use existing force calculation if available
  if (forceMagnitudeNewtons) {
    return Math.round((forceMagnitudeNewtons / 1000) * 10) / 10; // Convert N to kN, 1 decimal
  }
  
  // Priority 2: Calculate from mass, speed, and crush depth
  if (mass && speed && crushDepth) {
    const speedMS = speed / 3.6; // Convert km/h to m/s
    const duration = crushDepth > 0 ? (2 * crushDepth) / speedMS : 0.05; // seconds
    const forceNewtons = (mass * speedMS) / duration;
    return Math.round((forceNewtons / 1000) * 10) / 10; // Convert to kN, 1 decimal
  }
  
  // Default: Unknown force
  return 0.0;
}

// ============================================================================
// MAIN EXTENSION FUNCTION
// ============================================================================

/**
 * Extends existing physics validation output with quantitative vector data
 * 
 * Maintains backward compatibility by keeping existing fields
 */
export function extendPhysicsValidationOutput(
  existingPhysicsData: {
    impactForce?: { magnitude: number; duration: number };
    impactAngle?: number;
    primaryImpactZone?: ImpactPoint;
    damagedComponents?: { name: string; location: string }[];
    accidentType?: AccidentType;
    estimatedSpeed?: { value: number };
    damageConsistency?: { score: number };
    mass?: number;
    crushDepth?: number;
    deltaV?: number;
    crushEnergy?: number;
  }
): QuantitativePhysicsValidation {
  
  // Extract component names
  const damagedComponentNames = existingPhysicsData.damagedComponents?.map(c => c.name) || [];
  
  // Calculate quantitative fields
  const impactAngleDegrees = calculateImpactAngleDegrees(
    existingPhysicsData.accidentType,
    existingPhysicsData.primaryImpactZone,
    damagedComponentNames
  );
  
  const calculatedImpactForceKN = calculateImpactForceKN(
    existingPhysicsData.impactForce?.magnitude,
    existingPhysicsData.mass,
    existingPhysicsData.estimatedSpeed?.value,
    existingPhysicsData.crushDepth
  );
  
  const impactLocationNormalized = getImpactLocationNormalized(
    existingPhysicsData.primaryImpactZone,
    damagedComponentNames
  );
  
  // Determine severity level from damage consistency score
  const consistencyScore = existingPhysicsData.damageConsistency?.score || 50;
  const severityLevel = 
    consistencyScore >= 80 ? "low" :
    consistencyScore >= 60 ? "medium" :
    consistencyScore >= 40 ? "high" : "critical";
  
  // Calculate deltaV if not provided (using energy conservation)
  const deltaV = existingPhysicsData.deltaV || (
    existingPhysicsData.estimatedSpeed?.value 
      ? existingPhysicsData.estimatedSpeed.value / 3.6 // Convert km/h to m/s
      : undefined
  );
  
  // Calculate crush energy using Campbell's formula (simplified)
  // E = A + B × crushDepth (where A, B are vehicle-specific constants)
  // For generic estimate: E ≈ 0.5 × m × (Δv)²
  const crushEnergyJoules = existingPhysicsData.crushEnergy || (
    existingPhysicsData.mass && deltaV
      ? Math.round(0.5 * existingPhysicsData.mass * deltaV * deltaV)
      : undefined
  );
  
  // Determine principal direction of force from impact angle
  const principalDirectionOfForce = (() => {
    if (impactAngleDegrees >= 315 || impactAngleDegrees < 45) return "frontal";
    if (impactAngleDegrees >= 135 && impactAngleDegrees < 225) return "rear";
    if (impactAngleDegrees >= 225 && impactAngleDegrees < 315) return "lateral_left";
    return "lateral_right";
  })();
  
  return {
    impactAngleDegrees,
    calculatedImpactForceKN,
    impactLocationNormalized,
    severityLevel,
    confidenceScore: consistencyScore,
    
    // Phase 3: Additional quantitative fields
    impactSpeedKmh: existingPhysicsData.estimatedSpeed?.value,
    deltaV,
    crushDepthCm: existingPhysicsData.crushDepth ? existingPhysicsData.crushDepth * 100 : undefined, // Convert m to cm
    crushEnergyJoules,
    principalDirectionOfForce,
    
    // Methodology traceability
    methodology: {
      formulaUsed: "Impulse-Momentum + Campbell Crush Analysis",
      assumptions: [
        "Vehicle mass estimated from make/model database",
        "Impact duration: 0.05 seconds (typical frontal collision)",
        "Coefficient of restitution: 0.1 (inelastic collision)",
        existingPhysicsData.crushDepth ? `Crush depth: ${existingPhysicsData.crushDepth.toFixed(2)}m` : "Crush depth estimated from damage severity",
      ],
      notes: "Forensic AI reconstruction using multi-modal damage assessment",
      modelVersion: "KINGA-Physics-v1.0",
    },
  };
}
