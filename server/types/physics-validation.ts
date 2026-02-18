/**
 * Forensic Physics Validation Interface
 * 
 * Structured physics analysis output for quantitative impact reconstruction.
 * All fields optional for backward compatibility with historical claims.
 * 
 * Used for:
 * - Executive dashboard forensic visualization
 * - QMS compliance documentation
 * - Court-defensible accident reconstruction
 * - Governance audit trail
 */
export interface PhysicsValidation {
  /**
   * Estimated impact speed in kilometers per hour
   * Calculated using Campbell's formula or AI estimation
   */
  impactSpeedKmh?: number;

  /**
   * Delta-V (change in velocity) in km/h
   * Represents severity of impact for occupant injury assessment
   */
  deltaV?: number;

  /**
   * Impact angle in degrees (0-360)
   * 0° = front center, 90° = right side, 180° = rear center, 270° = left side
   */
  impactAngleDegrees?: number;

  /**
   * Estimated impact force in kilonewtons (kN)
   * Calculated using impulse-momentum formula: F = (m × Δv) / Δt
   */
  estimatedImpactForceKN?: number;

  /**
   * Crush depth in centimeters
   * Maximum deformation depth measured from damage photos
   */
  crushDepthCm?: number;

  /**
   * Crush energy in joules
   * Calculated using Campbell Crush Energy formula: E = A + B × crushDepth
   */
  crushEnergyJoules?: number;

  /**
   * Principal direction of force (PDOF)
   * Qualitative description: "front", "front_left", "rear_center", etc.
   */
  principalDirectionOfForce?: string;

  /**
   * Confidence score (0-100)
   * AI model confidence in physics calculations
   */
  confidenceScore?: number;

  /**
   * Methodology metadata for governance and audit trail
   */
  methodology?: {
    /**
     * Formula(s) used for calculations
     * Example: "Impulse-Momentum + Campbell Crush Analysis"
     */
    formulaUsed?: string;

    /**
     * Assumptions made during calculation
     * Example: ["Vehicle mass estimated from segment class", "Impact duration assumed 0.15s"]
     */
    assumptions?: string[];

    /**
     * Additional notes or context
     * Example: "Forensic AI reconstruction based on damage photos"
     */
    notes?: string;

    /**
     * Physics model version for traceability
     * Example: "KINGA-Physics-v1.0"
     */
    modelVersion?: string;
  };
}

/**
 * Safe JSON parser for physicsAnalysis field from database
 * 
 * @param physicsAnalysis - Raw JSON string from ai_assessments.physics_analysis column
 * @returns Parsed PhysicsValidation object or null if invalid
 * 
 * Rules:
 * - Never throws exceptions
 * - Never crashes on invalid input
 * - Returns null for missing/invalid data
 * - Type-safe parsing with runtime validation
 */
export function parsePhysicsAnalysis(
  physicsAnalysis?: string | null
): PhysicsValidation | null {
  if (!physicsAnalysis) return null;

  try {
    const parsed = JSON.parse(physicsAnalysis);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PhysicsValidation;
  } catch {
    return null;
  }
}
