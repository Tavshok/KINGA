// @ts-nocheck
/**
 * Physics Deviation Score Calculator
 * 
 * Calculates fraud risk score based on discrepancies between declared and calculated physics parameters.
 * Formula:
 *   physicsDeviationScore = 
 *     |declaredImpactAngle - calculatedImpactAngle| * 0.4
 *   + |declaredSeverity - calculatedForceSeverity| * 0.3
 *   + damageSpreadVariance * 0.3
 * 
 * Normalized to 0-100 range.
 */

interface PhysicsAnalysis {
  quantitativeMode?: boolean;
  impactAngleDegrees?: number;
  calculatedImpactForceKN?: number;
  impactLocationNormalized?: {
    x: number;
    y: number;
  };
  damageSpread?: {
    primaryImpactZone?: string;
    secondaryDamageZones?: string[];
  };
}

interface ClaimData {
  // Declared values from claim submission
  declaredImpactAngle?: number;
  declaredSeverity?: string; // 'minor' | 'moderate' | 'severe' | 'catastrophic'
  declaredDamageLocation?: string;
}

/**
 * Convert severity enum to numeric scale for comparison
 */
function severityToNumeric(severity: string | undefined): number {
  const mapping: Record<string, number> = {
    'none': 0,
    'minor': 1,
    'moderate': 2,
    'severe': 3,
    'catastrophic': 4,
  };
  return mapping[severity?.toLowerCase() || 'none'] || 0;
}

/**
 * Calculate force severity from impact force (kN)
 */
function calculateForceSeverity(forceKN: number | undefined): number {
  if (!forceKN) return 0;
  
  // Severity thresholds based on impact force
  if (forceKN < 20) return 1;  // minor
  if (forceKN < 50) return 2;  // moderate
  if (forceKN < 80) return 3;  // severe
  return 4;                     // catastrophic
}

/**
 * Calculate damage spread variance
 * Measures consistency between declared and calculated damage zones
 */
function calculateDamageSpreadVariance(
  physicsAnalysis: PhysicsAnalysis,
  claimData: ClaimData
): number {
  const damageSpread = physicsAnalysis.damageSpread;
  if (!damageSpread || !claimData.declaredDamageLocation) {
    return 0; // No variance if data missing
  }

  const primaryZone = damageSpread.primaryImpactZone?.toLowerCase() || '';
  const declaredLocation = claimData.declaredDamageLocation.toLowerCase();
  
  // Check if declared location matches primary impact zone
  const primaryMatch = primaryZone.includes(declaredLocation) || declaredLocation.includes(primaryZone);
  
  // Check if declared location matches any secondary zones
  const secondaryZones = damageSpread.secondaryDamageZones || [];
  const secondaryMatch = secondaryZones.some(zone => 
    zone.toLowerCase().includes(declaredLocation) || declaredLocation.includes(zone.toLowerCase())
  );

  // Calculate variance score (0-100)
  if (primaryMatch) return 0;      // Perfect match
  if (secondaryMatch) return 30;   // Close match
  return 100;                       // No match - high variance
}

/**
 * Calculate physics deviation score
 * Returns normalized score 0-100 where higher = more suspicious
 */
export function calculatePhysicsDeviationScore(
  physicsAnalysis: PhysicsAnalysis | null,
  claimData: ClaimData
): number | null {
  // Only calculate if quantitative mode is active
  if (!physicsAnalysis?.quantitativeMode) {
    return null;
  }

  // Extract declared values
  const declaredAngle = claimData.declaredImpactAngle;
  const declaredSeverity = claimData.declaredSeverity;

  // Extract calculated values
  const calculatedAngle = physicsAnalysis.impactAngleDegrees;
  const calculatedForce = physicsAnalysis.calculatedImpactForceKN;

  // Calculate angle deviation (0-180 degrees → 0-100 normalized)
  let angleDeviation = 0;
  if (declaredAngle !== undefined && calculatedAngle !== undefined) {
    const rawAngleDiff = Math.abs(declaredAngle - calculatedAngle);
    angleDeviation = Math.min(rawAngleDiff / 180 * 100, 100); // Normalize to 0-100
  }

  // Calculate severity deviation (0-4 scale → 0-100 normalized)
  let severityDeviation = 0;
  if (declaredSeverity && calculatedForce !== undefined) {
    const declaredSeverityNum = severityToNumeric(declaredSeverity);
    const calculatedSeverityNum = calculateForceSeverity(calculatedForce);
    const rawSeverityDiff = Math.abs(declaredSeverityNum - calculatedSeverityNum);
    severityDeviation = rawSeverityDiff / 4 * 100; // Normalize to 0-100
  }

  // Calculate damage spread variance (already 0-100)
  const damageVariance = calculateDamageSpreadVariance(physicsAnalysis, claimData);

  // Apply weighted formula
  const deviationScore = 
    angleDeviation * 0.4 +
    severityDeviation * 0.3 +
    damageVariance * 0.3;

  // Round to integer
  return Math.round(deviationScore);
}

/**
 * Parse physics analysis JSON from database
 */
export function parsePhysicsAnalysis(physicsAnalysisJson: string | null): PhysicsAnalysis | null {
  if (!physicsAnalysisJson) return null;
  
  try {
    return JSON.parse(physicsAnalysisJson);
  } catch (error) {
    console.error('[Physics Deviation] Failed to parse physics analysis:', error);
    return null;
  }
}

/**
 * Get fraud risk classification from deviation score
 */
export function getDeviationRiskLevel(score: number | null): 'low' | 'medium' | 'high' {
  if (score === null) return 'low';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
