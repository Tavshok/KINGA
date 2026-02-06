/**
 * Accident Physics Engine
 * 
 * Scientific accident reconstruction system using:
 * - Collision mechanics (momentum, energy, impulse)
 * - Damage severity modeling
 * - Speed estimation from deformation
 * - Impact force calculations
 * - Damage propagation analysis
 * - Physics-based fraud detection
 * 
 * Based on established accident reconstruction principles and crash test data
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface VehicleData {
  mass: number; // kg
  make: string;
  model: string;
  year: number;
  vehicleType: "sedan" | "suv" | "truck" | "van" | "sports" | "compact";
  powertrainType: "ice" | "hybrid" | "phev" | "bev"; // ICE, Hybrid, Plug-in Hybrid, Battery Electric
  batteryCapacity?: number; // kWh (for EVs/Hybrids)
  batteryLocation?: "undercarriage" | "rear" | "integrated"; // Battery pack location
}

export interface AccidentData {
  accidentType: AccidentType;
  damagePhotos: string[]; // URLs to damage photos
  incidentDescription: string;
  estimatedSpeed?: number; // km/h (if reported)
  weatherConditions?: string;
  roadConditions?: string;
  impactPoint?: ImpactPoint;
}

export type AccidentType = 
  | "frontal"
  | "rear"
  | "side_driver"
  | "side_passenger"
  | "rollover"
  | "multi_impact"
  | "unknown";

export type ImpactPoint = 
  | "front_center"
  | "front_left"
  | "front_right"
  | "rear_center"
  | "rear_left"
  | "rear_right"
  | "side_left_front"
  | "side_left_center"
  | "side_left_rear"
  | "side_right_front"
  | "side_right_center"
  | "side_right_rear"
  | "roof"
  | "undercarriage";

export interface DamageAssessment {
  damagedComponents: DamagedComponent[];
  totalDamageArea: number; // square meters
  maxCrushDepth: number; // meters
  structuralDamage: boolean;
  airbagDeployment: boolean;
}

export interface DamagedComponent {
  name: string;
  location: string; // front, rear, left, right, etc.
  damageType: "cosmetic" | "structural" | "mechanical" | "electrical";
  severity: "minor" | "moderate" | "severe" | "total_loss";
  visible: boolean; // true if visible in photos, false if latent
  distanceFromImpact: number; // meters from primary impact point
}

export interface EVHybridAnalysis {
  batteryDamageRisk: "none" | "low" | "medium" | "high" | "critical";
  thermalRunawayRisk: number; // 0-100
  highVoltageSafetyRisk: boolean;
  batteryIsolationRequired: boolean;
  evCertifiedRepairRequired: boolean;
  estimatedBatteryReplacementCost: number;
  fireExplosionRisk: number; // 0-100
  specialSafetyProtocols: string[];
  batteryDegradationVsAccidentDamage: "accident" | "degradation" | "both" | "unclear";
}

export interface PhysicsAnalysisResult {
  // Speed & Energy
  estimatedSpeed: {
    value: number; // km/h
    confidenceInterval: [number, number]; // [min, max]
    method: string;
  };
  kineticEnergy: number; // Joules
  energyDissipated: number; // Joules
  
  // Impact Analysis
  impactForce: {
    magnitude: number; // Newtons
    duration: number; // seconds
  };
  impactAngle: number; // degrees from vehicle centerline
  deltaV: number; // velocity change in km/h
  
  // Damage Analysis
  primaryImpactZone: ImpactPoint;
  damageConsistency: {
    score: number; // 0-100
    inconsistencies: string[];
  };
  latentDamageProbability: {
    engine: number; // 0-100
    transmission: number;
    suspension: number;
    frame: number;
    electrical: number;
  };
  
  // Fraud Indicators
  fraudIndicators: {
    impossibleDamagePatterns: string[];
    unrelatedDamage: string[];
    severityMismatch: boolean;
    preExistingDamageSuspected: boolean;
    stagedAccidentIndicators: string[];
  };
  
  // Accident Classification
  accidentSeverity: "minor" | "moderate" | "severe" | "catastrophic";
  collisionType: AccidentType;
  occupantInjuryRisk: "low" | "medium" | "high" | "critical";
  
  // EV/Hybrid Specific Analysis
  evHybridAnalysis?: EVHybridAnalysis;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Comprehensive physics-based accident analysis
 */
export async function analyzeAccidentPhysics(
  vehicle: VehicleData,
  accident: AccidentData,
  damage: DamageAssessment
): Promise<PhysicsAnalysisResult> {
  
  // 1. Estimate impact speed from damage severity
  const speedEstimate = estimateImpactSpeed(vehicle, damage, accident.accidentType);
  
  // 2. Calculate kinetic energy and energy dissipation
  const kineticEnergy = calculateKineticEnergy(vehicle.mass, speedEstimate.value);
  const energyDissipated = calculateEnergyDissipation(damage, vehicle);
  
  // 3. Calculate impact force and duration
  const impactForce = calculateImpactForce(vehicle.mass, speedEstimate.value, damage.maxCrushDepth);
  
  // 4. Determine impact angle from damage pattern
  const impactAngle = determineImpactAngle(damage, accident.impactPoint);
  
  // 5. Calculate delta-V (velocity change)
  const deltaV = calculateDeltaV(energyDissipated, vehicle.mass);
  
  // 6. Identify primary impact zone
  const primaryImpactZone = identifyPrimaryImpactZone(damage, accident);
  
  // 7. Assess damage consistency with accident type
  const damageConsistency = assessDamageConsistency(
    damage,
    accident.accidentType,
    primaryImpactZone,
    speedEstimate.value
  );
  
  // 8. Predict latent damage probability
  const latentDamageProbability = predictLatentDamage(
    accident.accidentType,
    speedEstimate.value,
    damage,
    vehicle
  );
  
  // 9. Detect fraud indicators
  const fraudIndicators = detectPhysicsBasedFraud(
    damage,
    accident,
    speedEstimate.value,
    primaryImpactZone,
    damageConsistency
  );
  
  // 10. Classify accident severity
  const accidentSeverity = classifyAccidentSeverity(speedEstimate.value, damage, deltaV);
  
  // 11. Assess occupant injury risk
  const occupantInjuryRisk = assessOccupantInjuryRisk(deltaV, accidentSeverity, damage.airbagDeployment);
  
  // 12. EV/Hybrid specific analysis
  let evHybridAnalysis: EVHybridAnalysis | undefined;
  if (vehicle.powertrainType !== "ice") {
    evHybridAnalysis = analyzeEVHybridDamage(
      vehicle,
      damage,
      accident.accidentType,
      primaryImpactZone,
      speedEstimate.value
    );
  }
  
  return {
    estimatedSpeed: speedEstimate,
    kineticEnergy,
    energyDissipated,
    impactForce,
    impactAngle,
    deltaV,
    primaryImpactZone,
    damageConsistency,
    latentDamageProbability,
    fraudIndicators,
    accidentSeverity,
    collisionType: accident.accidentType,
    occupantInjuryRisk,
  };
}

// ============================================================================
// SPEED ESTIMATION
// ============================================================================

/**
 * Estimate impact speed from damage severity
 * 
 * Uses empirical relationships from crash test data:
 * - Crush depth correlates with impact speed
 * - Energy absorption capacity of vehicle structure
 * - Damage extent and component failures
 * 
 * Based on Campbell's formula and NHTSA crash test data
 */
function estimateImpactSpeed(
  vehicle: VehicleData,
  damage: DamageAssessment,
  accidentType: AccidentType
): { value: number; confidenceInterval: [number, number]; method: string } {
  
  // Get vehicle-specific stiffness coefficient
  const stiffness = getVehicleStiffness(vehicle);
  
  // Campbell's formula: V = √(2 * E / m)
  // where E = energy absorbed, m = mass
  // E = 0.5 * k * C²
  // where k = stiffness coefficient, C = crush depth
  
  const crushDepth = damage.maxCrushDepth; // meters
  const energyAbsorbed = 0.5 * stiffness * Math.pow(crushDepth, 2);
  
  // Speed in m/s
  const speedMS = Math.sqrt((2 * energyAbsorbed) / vehicle.mass);
  
  // Convert to km/h
  let estimatedSpeed = speedMS * 3.6;
  
  // Adjust for accident type (different energy absorption characteristics)
  estimatedSpeed *= getAccidentTypeMultiplier(accidentType);
  
  // Adjust for structural vs cosmetic damage
  if (damage.structuralDamage) {
    estimatedSpeed *= 1.15; // Structural damage indicates higher energy
  }
  
  // Adjust for airbag deployment
  if (damage.airbagDeployment) {
    estimatedSpeed = Math.max(estimatedSpeed, 25); // Airbags typically deploy at 20-30 km/h
  }
  
  // Calculate confidence interval based on data quality
  const uncertainty = 0.15; // ±15% typical uncertainty
  const confidenceInterval: [number, number] = [
    estimatedSpeed * (1 - uncertainty),
    estimatedSpeed * (1 + uncertainty),
  ];
  
  return {
    value: Math.round(estimatedSpeed),
    confidenceInterval: [
      Math.round(confidenceInterval[0]),
      Math.round(confidenceInterval[1]),
    ],
    method: "Campbell's formula with crash test correlation",
  };
}

/**
 * Get vehicle stiffness coefficient (kN/m)
 * Based on vehicle type and construction
 */
function getVehicleStiffness(vehicle: VehicleData): number {
  const stiffnessMap: Record<VehicleData["vehicleType"], number> = {
    compact: 800,    // kN/m - softer structure
    sedan: 1000,     // kN/m - moderate stiffness
    suv: 1200,       // kN/m - stiffer due to size
    truck: 1400,     // kN/m - very stiff frame
    van: 1100,       // kN/m - moderate-high
    sports: 1300,    // kN/m - stiff for performance
  };
  
  return stiffnessMap[vehicle.vehicleType] || 1000;
}

/**
 * Get accident type multiplier for speed estimation
 */
function getAccidentTypeMultiplier(accidentType: AccidentType): number {
  const multipliers: Record<AccidentType, number> = {
    frontal: 1.0,           // Baseline - most energy absorption
    rear: 0.9,              // Less crumple zone in rear
    side_driver: 1.1,       // Less protection, more damage per speed
    side_passenger: 1.1,
    rollover: 1.3,          // Complex energy dissipation
    multi_impact: 1.2,      // Multiple energy transfers
    unknown: 1.0,
  };
  
  return multipliers[accidentType] || 1.0;
}

// ============================================================================
// ENERGY CALCULATIONS
// ============================================================================

/**
 * Calculate kinetic energy: KE = 0.5 * m * v²
 * 
 * @param mass - Vehicle mass in kg
 * @param speed - Speed in km/h
 * @returns Kinetic energy in Joules
 */
function calculateKineticEnergy(mass: number, speed: number): number {
  const speedMS = speed / 3.6; // Convert km/h to m/s
  return 0.5 * mass * Math.pow(speedMS, 2);
}

/**
 * Calculate energy dissipated during collision
 * 
 * Energy is dissipated through:
 * - Plastic deformation of vehicle structure (70-80%)
 * - Heat generation (10-15%)
 * - Sound (5-10%)
 * - Friction (5%)
 */
function calculateEnergyDissipation(
  damage: DamageAssessment,
  vehicle: VehicleData
): number {
  const stiffness = getVehicleStiffness(vehicle);
  const crushDepth = damage.maxCrushDepth;
  
  // Energy absorbed by deformation: E = 0.5 * k * C²
  const deformationEnergy = 0.5 * stiffness * 1000 * Math.pow(crushDepth, 2); // Convert kN to N
  
  // Total energy includes other dissipation mechanisms
  const totalEnergy = deformationEnergy / 0.75; // Deformation is ~75% of total
  
  return totalEnergy;
}

// ============================================================================
// IMPACT FORCE CALCULATIONS
// ============================================================================

/**
 * Calculate impact force using impulse-momentum theorem
 * 
 * F = Δp / Δt = m * Δv / Δt
 * 
 * Impact duration estimated from crush depth and speed
 */
function calculateImpactForce(
  mass: number,
  speed: number,
  crushDepth: number
): { magnitude: number; duration: number } {
  
  const speedMS = speed / 3.6; // Convert to m/s
  
  // Estimate impact duration from crush depth and speed
  // Δt ≈ 2 * C / v (assuming constant deceleration)
  const duration = crushDepth > 0 ? (2 * crushDepth) / speedMS : 0.05; // minimum 50ms
  
  // Calculate force: F = m * Δv / Δt
  // Assuming vehicle comes to rest (Δv = v)
  const forceMagnitude = (mass * speedMS) / duration;
  
  return {
    magnitude: Math.round(forceMagnitude), // Newtons
    duration: Math.round(duration * 1000) / 1000, // seconds (3 decimal places)
  };
}

/**
 * Calculate delta-V (velocity change)
 * 
 * ΔV = √(2 * E / m)
 * where E = energy dissipated, m = mass
 */
function calculateDeltaV(energyDissipated: number, mass: number): number {
  const deltaVMS = Math.sqrt((2 * energyDissipated) / mass);
  return Math.round(deltaVMS * 3.6); // Convert to km/h
}

// ============================================================================
// IMPACT ANALYSIS
// ============================================================================

/**
 * Determine impact angle from damage pattern
 * 
 * Analyzes damage distribution to calculate angle of impact
 * relative to vehicle centerline
 */
function determineImpactAngle(
  damage: DamageAssessment,
  reportedImpactPoint?: ImpactPoint
): number {
  
  // Analyze damage component locations
  const leftDamage = damage.damagedComponents.filter(c => c.location.includes("left")).length;
  const rightDamage = damage.damagedComponents.filter(c => c.location.includes("right")).length;
  const centerDamage = damage.damagedComponents.filter(c => c.location.includes("center")).length;
  
  // Calculate angle based on damage distribution
  // 0° = head-on, ±90° = pure side impact
  
  if (centerDamage > leftDamage + rightDamage) {
    return 0; // Head-on or direct rear
  }
  
  const lateralRatio = (rightDamage - leftDamage) / (leftDamage + rightDamage + centerDamage);
  const angle = Math.asin(lateralRatio) * (180 / Math.PI); // Convert radians to degrees
  
  return Math.round(angle);
}

/**
 * Identify primary impact zone from damage assessment
 */
function identifyPrimaryImpactZone(
  damage: DamageAssessment,
  accident: AccidentData
): ImpactPoint {
  
  // If impact point is reported, use it
  if (accident.impactPoint) {
    return accident.impactPoint;
  }
  
  // Otherwise, infer from damage pattern
  // Find component with highest severity closest to vehicle exterior
  
  const sortedComponents = [...damage.damagedComponents].sort((a, b) => {
    // Sort by severity (severe > moderate > minor) and distance from impact
    const severityScore = { total_loss: 4, severe: 3, moderate: 2, minor: 1 };
    const aScore = severityScore[a.severity] * (1 / (a.distanceFromImpact + 0.1));
    const bScore = severityScore[b.severity] * (1 / (b.distanceFromImpact + 0.1));
    return bScore - aScore;
  });
  
  const primaryComponent = sortedComponents[0];
  
  // Map component location to impact point
  if (primaryComponent.location.includes("front")) {
    if (primaryComponent.location.includes("left")) return "front_left";
    if (primaryComponent.location.includes("right")) return "front_right";
    return "front_center";
  }
  
  if (primaryComponent.location.includes("rear")) {
    if (primaryComponent.location.includes("left")) return "rear_left";
    if (primaryComponent.location.includes("right")) return "rear_right";
    return "rear_center";
  }
  
  if (primaryComponent.location.includes("left")) {
    return "side_left_center";
  }
  
  if (primaryComponent.location.includes("right")) {
    return "side_right_center";
  }
  
  return "front_center"; // Default
}

// ============================================================================
// DAMAGE CONSISTENCY ANALYSIS
// ============================================================================

/**
 * Assess whether damage pattern is consistent with reported accident
 * 
 * Checks:
 * - Geometric consistency (impact point vs damage locations)
 * - Severity consistency (speed vs damage extent)
 * - Damage propagation logic (primary → secondary damage)
 */
function assessDamageConsistency(
  damage: DamageAssessment,
  accidentType: AccidentType,
  primaryImpactZone: ImpactPoint,
  estimatedSpeed: number
): { score: number; inconsistencies: string[] } {
  
  const inconsistencies: string[] = [];
  let consistencyScore = 100;
  
  // Check 1: Damage location consistency with impact point
  for (const component of damage.damagedComponents) {
    const distance = component.distanceFromImpact;
    const severity = component.severity;
    
    // Severe damage should be near impact point
    if (severity === "severe" || severity === "total_loss") {
      if (distance > 1.5) { // More than 1.5m from impact
        inconsistencies.push(
          `Severe damage to ${component.name} is ${distance.toFixed(1)}m from impact point - suspicious`
        );
        consistencyScore -= 15;
      }
    }
    
    // Check geometric plausibility
    if (!isDamageGeometricallyPlausible(component, primaryImpactZone)) {
      inconsistencies.push(
        `Damage to ${component.name} (${component.location}) is inconsistent with impact at ${primaryImpactZone}`
      );
      consistencyScore -= 20;
    }
  }
  
  // Check 2: Damage severity consistency with speed
  const expectedSeverity = estimatedSpeed < 30 ? "minor" : 
                          estimatedSpeed < 60 ? "moderate" : "severe";
  
  const severeDamageCount = damage.damagedComponents.filter(
    c => c.severity === "severe" || c.severity === "total_loss"
  ).length;
  
  if (estimatedSpeed < 30 && severeDamageCount > 2) {
    inconsistencies.push(
      `Low speed (${estimatedSpeed} km/h) but extensive severe damage - inconsistent`
    );
    consistencyScore -= 25;
  }
  
  if (estimatedSpeed > 60 && severeDamageCount === 0) {
    inconsistencies.push(
      `High speed (${estimatedSpeed} km/h) but no severe damage - inconsistent`
    );
    consistencyScore -= 20;
  }
  
  // Check 3: Rollover-specific checks
  if (accidentType === "rollover") {
    const roofDamage = damage.damagedComponents.some(c => c.location.includes("roof"));
    const pillarDamage = damage.damagedComponents.some(c => c.name.toLowerCase().includes("pillar"));
    
    if (!roofDamage && !pillarDamage) {
      inconsistencies.push("Rollover accident reported but no roof/pillar damage detected");
      consistencyScore -= 30;
    }
  }
  
  return {
    score: Math.max(0, consistencyScore),
    inconsistencies,
  };
}

/**
 * Check if damage to a component is geometrically plausible given impact point
 */
function isDamageGeometricallyPlausible(
  component: DamagedComponent,
  impactPoint: ImpactPoint
): boolean {
  
  const impactZone = impactPoint.split("_")[0]; // front, rear, side
  const componentZone = component.location.split("_")[0];
  
  // Direct impact zone - always plausible
  if (impactZone === componentZone) return true;
  
  // Adjacent zones - plausible for moderate/severe impacts
  const adjacentZones: Record<string, string[]> = {
    front: ["side", "roof"],
    rear: ["side", "roof"],
    side: ["front", "rear", "roof"],
    roof: ["front", "rear", "side"],
  };
  
  if (adjacentZones[impactZone]?.includes(componentZone)) {
    return component.severity !== "minor"; // Adjacent damage should be at least moderate
  }
  
  // Opposite zones - only plausible for very severe impacts or multi-impact
  return component.severity === "minor"; // Only minor damage plausible on opposite side
}

// ============================================================================
// LATENT DAMAGE PREDICTION
// ============================================================================

/**
 * Predict probability of latent (hidden) damage
 * 
 * Based on:
 * - Accident type
 * - Impact speed
 * - Visible damage severity
 * - Vehicle construction
 */
function predictLatentDamage(
  accidentType: AccidentType,
  speed: number,
  damage: DamageAssessment,
  vehicle: VehicleData
): {
  engine: number;
  transmission: number;
  suspension: number;
  frame: number;
  electrical: number;
} {
  
  const baseProbability = Math.min(speed / 100, 0.8); // Higher speed = higher probability
  
  let engineProb = baseProbability * 0.3;
  let transmissionProb = baseProbability * 0.2;
  let suspensionProb = baseProbability * 0.5;
  let frameProb = baseProbability * 0.4;
  let electricalProb = baseProbability * 0.3;
  
  // Rollover-specific adjustments
  if (accidentType === "rollover") {
    engineProb += 0.4; // High risk of engine damage (oil starvation, hydrostatic lock)
    transmissionProb += 0.3;
    frameProb += 0.5; // Very high risk of frame damage
    electricalProb += 0.4; // Wiring damage common
    suspensionProb += 0.3;
  }
  
  // Frontal impact adjustments
  if (accidentType === "frontal") {
    engineProb += 0.3;
    transmissionProb += 0.2;
    suspensionProb += 0.4;
  }
  
  // Side impact adjustments
  if (accidentType.startsWith("side")) {
    frameProb += 0.4; // Side impacts often damage frame
    suspensionProb += 0.3;
    electricalProb += 0.2;
  }
  
  // Structural damage indicator
  if (damage.structuralDamage) {
    frameProb += 0.3;
    suspensionProb += 0.2;
  }
  
  // High-speed impact
  if (speed > 80) {
    engineProb += 0.2;
    transmissionProb += 0.2;
    frameProb += 0.3;
  }
  
  // Cap probabilities at 100%
  return {
    engine: Math.min(Math.round(engineProb * 100), 100),
    transmission: Math.min(Math.round(transmissionProb * 100), 100),
    suspension: Math.min(Math.round(suspensionProb * 100), 100),
    frame: Math.min(Math.round(frameProb * 100), 100),
    electrical: Math.min(Math.round(electricalProb * 100), 100),
  };
}

// ============================================================================
// FRAUD DETECTION
// ============================================================================

/**
 * Detect fraud indicators based on physics inconsistencies
 */
function detectPhysicsBasedFraud(
  damage: DamageAssessment,
  accident: AccidentData,
  estimatedSpeed: number,
  primaryImpactZone: ImpactPoint,
  damageConsistency: { score: number; inconsistencies: string[] }
): {
  impossibleDamagePatterns: string[];
  unrelatedDamage: string[];
  severityMismatch: boolean;
  preExistingDamageSuspected: boolean;
  stagedAccidentIndicators: string[];
} {
  
  const impossiblePatterns: string[] = [];
  const unrelatedDamage: string[] = [];
  const stagedIndicators: string[] = [];
  
  // Check for impossible damage patterns
  if (damageConsistency.score < 50) {
    impossiblePatterns.push(...damageConsistency.inconsistencies);
  }
  
  // Check for unrelated damage (far from impact point)
  for (const component of damage.damagedComponents) {
    if (component.distanceFromImpact > 3.0 && component.severity !== "minor") {
      unrelatedDamage.push(
        `${component.name} is ${component.distanceFromImpact.toFixed(1)}m from impact - likely unrelated to accident`
      );
    }
  }
  
  // Check for severity mismatch
  const severityMismatch = 
    (estimatedSpeed < 20 && damage.structuralDamage) ||
    (estimatedSpeed > 80 && !damage.structuralDamage);
  
  // Check for pre-existing damage indicators
  const preExistingDamageSuspected = unrelatedDamage.length > 2;
  
  // Staged accident indicators
  if (estimatedSpeed < 15 && damage.structuralDamage) {
    stagedIndicators.push("Very low speed but structural damage - possible staged accident");
  }
  
  if (damage.damagedComponents.length > 10 && estimatedSpeed < 40) {
    stagedIndicators.push("Extensive damage at moderate speed - suspicious");
  }
  
  return {
    impossibleDamagePatterns: impossiblePatterns,
    unrelatedDamage,
    severityMismatch,
    preExistingDamageSuspected,
    stagedAccidentIndicators: stagedIndicators,
  };
}

// ============================================================================
// SEVERITY CLASSIFICATION
// ============================================================================

/**
 * Classify accident severity
 */
function classifyAccidentSeverity(
  speed: number,
  damage: DamageAssessment,
  deltaV: number
): "minor" | "moderate" | "severe" | "catastrophic" {
  
  // Speed-based classification
  if (speed < 25) return "minor";
  if (speed < 50) return "moderate";
  if (speed < 80) return "severe";
  
  // Delta-V based classification (more accurate for injury risk)
  if (deltaV < 15) return "minor";
  if (deltaV < 30) return "moderate";
  if (deltaV < 50) return "severe";
  
  // Structural damage overrides
  if (damage.structuralDamage) {
    if (speed > 60) return "catastrophic";
    return "severe";
  }
  
  return "catastrophic";
}

/**
 * Assess occupant injury risk
 */
function assessOccupantInjuryRisk(
  deltaV: number,
  severity: "minor" | "moderate" | "severe" | "catastrophic",
  airbagDeployment: boolean
): "low" | "medium" | "high" | "critical" {
  
  // Delta-V is the best predictor of injury risk
  // Based on NHTSA injury probability curves
  
  if (deltaV < 15) return "low";
  if (deltaV < 30) return "medium";
  if (deltaV < 50) return "high";
  return "critical";
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate quote items against physics analysis
 * Flags items that are inconsistent with accident physics
 */
export function validateQuoteAgainstPhysics(
  quotedItems: Array<{ name: string; location: string; cost: number }>,
  physicsAnalysis: PhysicsAnalysisResult
): {
  validItems: string[];
  suspiciousItems: string[];
  unrelatedItems: string[];
} {
  
  const validItems: string[] = [];
  const suspiciousItems: string[] = [];
  const unrelatedItems: string[] = [];
  
  for (const item of quotedItems) {
    // Check if item location is consistent with primary impact zone
    const impactZone = physicsAnalysis.primaryImpactZone.split("_")[0];
    const itemZone = item.location.toLowerCase();
    
    if (itemZone.includes(impactZone)) {
      validItems.push(item.name);
    } else {
      // Check if it's in adjacent zone (could be secondary damage)
      const adjacentZones: Record<string, string[]> = {
        front: ["side", "roof"],
        rear: ["side", "roof"],
        side: ["front", "rear", "roof"],
      };
      
      const isAdjacent = adjacentZones[impactZone]?.some(zone => itemZone.includes(zone));
      
      if (isAdjacent && physicsAnalysis.estimatedSpeed.value > 40) {
        suspiciousItems.push(`${item.name} (${item.location}) - possible secondary damage`);
      } else {
        unrelatedItems.push(`${item.name} (${item.location}) - likely unrelated to accident`);
      }
    }
  }
  
  return {
    validItems,
    suspiciousItems,
    unrelatedItems,
  };
}


// ============================================================================
// EV/HYBRID VEHICLE ANALYSIS
// ============================================================================

/**
 * Comprehensive EV/Hybrid damage analysis
 * 
 * Assesses:
 * - Battery pack damage risk
 * - Thermal runaway potential
 * - High voltage safety hazards
 * - Fire/explosion risk
 * - Repair requirements and costs
 */
function analyzeEVHybridDamage(
  vehicle: VehicleData,
  damage: DamageAssessment,
  accidentType: AccidentType,
  impactZone: ImpactPoint,
  estimatedSpeed: number
): EVHybridAnalysis {
  
  const batteryLocation = vehicle.batteryLocation || "undercarriage";
  const batteryCapacity = vehicle.batteryCapacity || 60; // Default 60 kWh
  
  // Assess battery damage risk based on impact location and severity
  const batteryDamageRisk = assessBatteryDamageRisk(
    impactZone,
    batteryLocation,
    damage,
    estimatedSpeed
  );
  
  // Calculate thermal runaway risk
  const thermalRunawayRisk = calculateThermalRunawayRisk(
    batteryDamageRisk,
    batteryCapacity,
    estimatedSpeed,
    damage.structuralDamage
  );
  
  // Assess high voltage safety risk
  const highVoltageSafetyRisk = assessHighVoltageSafetyRisk(
    damage,
    batteryDamageRisk
  );
  
  // Determine if battery isolation is required
  const batteryIsolationRequired = 
    batteryDamageRisk !== "none" || 
    highVoltageSafetyRisk || 
    damage.structuralDamage;
  
  // EV-certified repair facility required for any battery-related damage
  const evCertifiedRepairRequired = 
    batteryDamageRisk !== "none" || 
    highVoltageSafetyRisk ||
    vehicle.powertrainType === "bev";
  
  // Estimate battery replacement cost
  const estimatedBatteryReplacementCost = estimateBatteryReplacementCost(
    vehicle,
    batteryDamageRisk
  );
  
  // Calculate fire/explosion risk
  const fireExplosionRisk = calculateFireExplosionRisk(
    batteryDamageRisk,
    thermalRunawayRisk,
    damage.structuralDamage
  );
  
  // Generate special safety protocols
  const specialSafetyProtocols = generateEVSafetyProtocols(
    batteryDamageRisk,
    highVoltageSafetyRisk,
    fireExplosionRisk,
    vehicle.powertrainType
  );
  
  // Assess battery degradation vs accident damage
  const batteryDegradationVsAccidentDamage = assessBatteryDegradation(
    vehicle,
    damage,
    batteryDamageRisk
  );
  
  return {
    batteryDamageRisk,
    thermalRunawayRisk,
    highVoltageSafetyRisk,
    batteryIsolationRequired,
    evCertifiedRepairRequired,
    estimatedBatteryReplacementCost,
    fireExplosionRisk,
    specialSafetyProtocols,
    batteryDegradationVsAccidentDamage,
  };
}

/**
 * Assess battery pack damage risk based on impact location and severity
 */
function assessBatteryDamageRisk(
  impactZone: ImpactPoint,
  batteryLocation: "undercarriage" | "rear" | "integrated",
  damage: DamageAssessment,
  speed: number
): "none" | "low" | "medium" | "high" | "critical" {
  
  let riskScore = 0;
  
  // Battery location vs impact zone correlation
  if (batteryLocation === "undercarriage") {
    // Undercarriage battery (most EVs) - vulnerable to all impacts
    if (impactZone.includes("front") || impactZone.includes("rear")) {
      riskScore += 30; // Frontal/rear impacts can compress undercarriage
    }
    if (impactZone.includes("side")) {
      riskScore += 40; // Side impacts very dangerous for undercarriage battery
    }
    if (impactZone === "undercarriage") {
      riskScore += 80; // Direct undercarriage impact - critical
    }
    
    // Rollover is extremely dangerous for undercarriage batteries
    if (impactZone === "roof") {
      riskScore += 70; // Rollover likely damaged battery
    }
  }
  
  if (batteryLocation === "rear") {
    // Rear-mounted battery (some hybrids)
    if (impactZone.includes("rear")) {
      riskScore += 60;
    }
  }
  
  // Speed factor
  if (speed > 60) {
    riskScore += 20;
  } else if (speed > 40) {
    riskScore += 10;
  }
  
  // Structural damage indicator
  if (damage.structuralDamage) {
    riskScore += 25;
  }
  
  // Max crush depth indicator
  if (damage.maxCrushDepth > 0.3) { // > 30cm
    riskScore += 20;
  }
  
  // Convert score to risk level
  if (riskScore >= 80) return "critical";
  if (riskScore >= 60) return "high";
  if (riskScore >= 40) return "medium";
  if (riskScore >= 20) return "low";
  return "none";
}

/**
 * Calculate thermal runaway risk (battery fire/explosion)
 * 
 * Thermal runaway occurs when battery cells are damaged and begin
 * self-heating, potentially leading to fire or explosion
 */
function calculateThermalRunawayRisk(
  batteryDamageRisk: "none" | "low" | "medium" | "high" | "critical",
  batteryCapacity: number,
  speed: number,
  structuralDamage: boolean
): number {
  
  const riskMap = {
    none: 0,
    low: 15,
    medium: 35,
    high: 60,
    critical: 85,
  };
  
  let risk = riskMap[batteryDamageRisk];
  
  // Larger batteries have more energy, higher risk
  if (batteryCapacity > 80) {
    risk += 10;
  } else if (batteryCapacity > 60) {
    risk += 5;
  }
  
  // High-speed impacts increase cell damage probability
  if (speed > 80) {
    risk += 15;
  } else if (speed > 60) {
    risk += 10;
  }
  
  // Structural damage indicates severe impact
  if (structuralDamage) {
    risk += 10;
  }
  
  return Math.min(risk, 100);
}

/**
 * Assess high voltage safety risk
 * 
 * Damaged high voltage systems pose electrocution risk to
 * first responders and repair technicians
 */
function assessHighVoltageSafetyRisk(
  damage: DamageAssessment,
  batteryDamageRisk: "none" | "low" | "medium" | "high" | "critical"
): boolean {
  
  // Any battery damage creates HV safety risk
  if (batteryDamageRisk !== "none") {
    return true;
  }
  
  // Structural damage may have compromised HV cables
  if (damage.structuralDamage) {
    return true;
  }
  
  // Check for electrical system damage
  const electricalDamage = damage.damagedComponents.some(
    c => c.damageType === "electrical" && c.severity !== "minor"
  );
  
  return electricalDamage;
}

/**
 * Estimate battery replacement cost
 */
function estimateBatteryReplacementCost(
  vehicle: VehicleData,
  batteryDamageRisk: "none" | "low" | "medium" | "high" | "critical"
): number {
  
  if (batteryDamageRisk === "none") {
    return 0;
  }
  
  const batteryCapacity = vehicle.batteryCapacity || 60;
  
  // Cost per kWh varies by vehicle type and manufacturer
  // Average: $150-250/kWh for replacement
  const costPerKWh = vehicle.powertrainType === "bev" ? 200 : 180; // BEVs typically more expensive
  
  const batteryCost = batteryCapacity * costPerKWh;
  
  // Labor and diagnostics
  const laborCost = 2000; // $2000 typical labor for battery replacement
  
  // Probability of replacement based on damage risk
  const replacementProbability = {
    none: 0,
    low: 0.1,
    medium: 0.4,
    high: 0.7,
    critical: 0.95,
  };
  
  const expectedCost = (batteryCost + laborCost) * replacementProbability[batteryDamageRisk];
  
  return Math.round(expectedCost);
}

/**
 * Calculate fire/explosion risk
 */
function calculateFireExplosionRisk(
  batteryDamageRisk: "none" | "low" | "medium" | "high" | "critical",
  thermalRunawayRisk: number,
  structuralDamage: boolean
): number {
  
  // Fire risk is primarily driven by thermal runaway
  let risk = thermalRunawayRisk * 0.8;
  
  // Structural damage may expose battery to oxygen, increasing fire risk
  if (structuralDamage) {
    risk += 15;
  }
  
  return Math.min(Math.round(risk), 100);
}

/**
 * Generate special safety protocols for EV damage
 */
function generateEVSafetyProtocols(
  batteryDamageRisk: "none" | "low" | "medium" | "high" | "critical",
  highVoltageSafetyRisk: boolean,
  fireExplosionRisk: number,
  powertrainType: "ice" | "hybrid" | "phev" | "bev"
): string[] {
  
  const protocols: string[] = [];
  
  // Always required for EVs/Hybrids
  if (powertrainType !== "ice") {
    protocols.push("High voltage disconnect required before any repair work");
    protocols.push("EV-certified technician required for inspection and repair");
  }
  
  // Battery damage protocols
  if (batteryDamageRisk !== "none") {
    protocols.push("Battery isolation testing required");
    protocols.push("Thermal imaging scan of battery pack required");
    protocols.push("Battery voltage and resistance testing required");
  }
  
  if (batteryDamageRisk === "high" || batteryDamageRisk === "critical") {
    protocols.push("Battery pack removal and replacement likely required");
    protocols.push("Vehicle must be stored in isolated area away from other vehicles");
    protocols.push("Fire suppression equipment must be readily available");
  }
  
  // High voltage safety
  if (highVoltageSafetyRisk) {
    protocols.push("High voltage cable inspection required (orange cables)");
    protocols.push("Insulation resistance testing required before re-energizing");
    protocols.push("Personal protective equipment (PPE) required - insulated gloves, face shield");
  }
  
  // Fire/explosion risk
  if (fireExplosionRisk > 50) {
    protocols.push("Continuous thermal monitoring for 24-48 hours post-accident");
    protocols.push("Vehicle must not be stored in enclosed spaces");
    protocols.push("Emergency response plan required for thermal runaway event");
  }
  
  if (fireExplosionRisk > 70) {
    protocols.push("Consider immediate battery discharge/neutralization");
    protocols.push("Notify local fire department of damaged EV location");
  }
  
  // Coolant system
  if (batteryDamageRisk !== "none") {
    protocols.push("Battery coolant system inspection required");
    protocols.push("Check for coolant leaks (may be flammable)");
  }
  
  return protocols;
}

/**
 * Assess whether damage is from accident or pre-existing battery degradation
 */
function assessBatteryDegradation(
  vehicle: VehicleData,
  damage: DamageAssessment,
  batteryDamageRisk: "none" | "low" | "medium" | "high" | "critical"
): "accident" | "degradation" | "both" | "unclear" {
  
  // If no battery damage detected, not applicable
  if (batteryDamageRisk === "none") {
    return "accident"; // Assume any other damage is accident-related
  }
  
  // Physical battery damage is clearly accident-related
  const physicalBatteryDamage = damage.damagedComponents.some(
    c => c.name.toLowerCase().includes("battery") && c.damageType === "structural"
  );
  
  if (physicalBatteryDamage) {
    return "accident";
  }
  
  // Vehicle age can indicate degradation
  const vehicleAge = new Date().getFullYear() - vehicle.year;
  
  // Older EVs (>5 years) may have degradation issues
  if (vehicleAge > 5 && batteryDamageRisk === "low") {
    return "both"; // Could be both degradation and minor accident damage
  }
  
  // High/critical damage from accident is clear
  if (batteryDamageRisk === "high" || batteryDamageRisk === "critical") {
    return "accident";
  }
  
  // Medium/low damage on newer vehicle - likely accident
  if (vehicleAge <= 3) {
    return "accident";
  }
  
  // Otherwise unclear - requires diagnostic testing
  return "unclear";
}
