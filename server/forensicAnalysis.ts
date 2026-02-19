// @ts-nocheck
/**
 * Forensic Analysis Module
 * 
 * Provides sensor-free fraud detection through visual analysis of damage photos.
 * Detects pre-existing damage, paint inconsistencies, tire wear patterns, fluid leaks,
 * and other visual fraud indicators.
 */

export interface ForensicAnalysisInput {
  damagePhotos: string[]; // URLs to damage photos
  vehicleAge: number; // Years
  vehicleMileage: number; // Kilometers
  vehicleValue: number; // USD
  claimedDamageDescription: string;
  accidentDate: Date;
  accidentLocation: { lat: number; lon: number };
}

export interface PaintAnalysisResult {
  hasPreviousRepairs: boolean;
  previousRepairConfidence: number; // 0-1
  paintInconsistencies: string[];
  oversprayDetected: boolean;
  colorMismatch: boolean;
  clearCoatDamage: 'none' | 'minor' | 'moderate' | 'severe';
  fraudRiskScore: number; // 0-100
}

export interface BodyworkAnalysisResult {
  rustAssessment: {
    hasRust: boolean;
    rustAge: 'new' | 'old' | 'mixed';
    rustLocations: string[];
    preExistingRustProbability: number; // 0-1
  };
  dentRepairEvidence: boolean;
  fillerDetected: boolean;
  panelReplacementEvidence: boolean;
  fraudIndicators: string[];
}

export interface TireWearAnalysisResult {
  wearPattern: 'even' | 'center' | 'edge' | 'cupping' | 'feathering' | 'patchy';
  wearSeverity: 'minimal' | 'moderate' | 'severe' | 'critical';
  alignmentIssues: boolean;
  suspensionProblems: boolean;
  preExistingIssuesProbability: number; // 0-1
  estimatedTireAge: number; // Months
  fraudRiskScore: number; // 0-100
}

export interface FluidLeakAnalysisResult {
  leaksDetected: boolean;
  leakTypes: Array<{
    fluidType: 'oil' | 'coolant' | 'brake_fluid' | 'transmission' | 'power_steering' | 'fuel' | 'unknown';
    severity: 'minor' | 'moderate' | 'major';
    location: string;
    freshness: 'fresh' | 'old' | 'indeterminate';
    accidentRelated: boolean;
    confidence: number; // 0-1
  }>;
  fraudRiskScore: number; // 0-100
}

export interface GlassDamageAnalysisResult {
  damageType: 'impact' | 'stress_crack' | 'edge_crack' | 'bulls_eye' | 'star' | 'combination';
  damageAge: 'fresh' | 'old' | 'indeterminate';
  impactPoint: { x: number; y: number } | null;
  stressCrackIndicators: boolean;
  preExistingDamageProbability: number; // 0-1
  repairability: 'repairable' | 'replacement_required';
  fraudRiskScore: number; // 0-100
}

export interface PartsPricingAnalysisResult {
  quotedParts: Array<{
    partName: string;
    quotedPrice: number;
    marketPrice: number;
    priceDeviation: number; // Percentage
    inflated: boolean;
  }>;
  totalQuotedPrice: number;
  totalMarketPrice: number;
  overallInflation: number; // Percentage
  fraudRiskScore: number; // 0-100
}

export interface WeatherContextResult {
  weatherAtAccident: {
    condition: string; // 'clear', 'rain', 'snow', 'fog', etc.
    temperature: number; // Celsius
    visibility: number; // Kilometers
    roadCondition: 'dry' | 'wet' | 'icy' | 'snowy';
  };
  accidentPlausibility: number; // 0-1
  weatherContributionFactor: number; // 0-1
  inconsistencies: string[];
}

export interface TotalLossAssessmentResult {
  repairCost: number;
  vehicleValue: number;
  repairToValueRatio: number; // Percentage
  totalLossRecommendation: boolean;
  diminishedValue: number;
  salvageValue: number;
  economicTotalLoss: boolean;
}

export interface MileageVerificationResult {
  claimedMileage: number;
  estimatedMileageFromWear: { min: number; max: number };
  mileageConsistent: boolean;
  odometerFraudProbability: number; // 0-1
  wearIndicators: string[];
  fraudRiskScore: number; // 0-100
}

export interface ADASDamageAssessmentResult {
  adasComponentsDamaged: Array<{
    component: 'front_camera' | 'radar' | 'lidar' | 'side_camera' | 'rear_camera' | 'ultrasonic_sensor';
    damageLevel: 'none' | 'minor' | 'moderate' | 'severe';
    recalibrationRequired: boolean;
    replacementRequired: boolean;
    estimatedCost: number;
  }>;
  totalRecalibrationCost: number;
  totalReplacementCost: number;
  safetyImpact: 'none' | 'minor' | 'significant' | 'critical';
}

export interface ComprehensiveForensicResult {
  paint: PaintAnalysisResult;
  bodywork: BodyworkAnalysisResult;
  tires: TireWearAnalysisResult;
  fluidLeaks: FluidLeakAnalysisResult;
  glass: GlassDamageAnalysisResult;
  partsPricing: PartsPricingAnalysisResult;
  weather: WeatherContextResult;
  totalLoss: TotalLossAssessmentResult;
  mileage: MileageVerificationResult;
  adas: ADASDamageAssessmentResult;
  overallFraudScore: number; // 0-100
  fraudIndicators: string[];
  recommendations: string[];
}

/**
 * Analyze paint and bodywork for previous repairs and inconsistencies
 */
export function analyzePaintAndBodywork(
  damagePhotos: string[],
  vehicleAge: number
): { paint: PaintAnalysisResult; bodywork: BodyworkAnalysisResult } {
  // Simulated analysis - in production, this would use computer vision AI
  const paint: PaintAnalysisResult = {
    hasPreviousRepairs: Math.random() > 0.7,
    previousRepairConfidence: Math.random() * 0.5 + 0.5,
    paintInconsistencies: [],
    oversprayDetected: Math.random() > 0.85,
    colorMismatch: Math.random() > 0.9,
    clearCoatDamage: vehicleAge > 10 ? 'moderate' : 'minor',
    fraudRiskScore: 0,
  };

  // Calculate fraud risk based on indicators
  let paintFraudScore = 0;
  if (paint.hasPreviousRepairs && paint.previousRepairConfidence > 0.7) {
    paintFraudScore += 30;
    paint.paintInconsistencies.push('Evidence of previous repair work detected');
  }
  if (paint.oversprayDetected) {
    paintFraudScore += 25;
    paint.paintInconsistencies.push('Overspray detected - indicates amateur or rushed repair');
  }
  if (paint.colorMismatch) {
    paintFraudScore += 20;
    paint.paintInconsistencies.push('Color mismatch suggests panel replacement or poor repair');
  }
  paint.fraudRiskScore = Math.min(paintFraudScore, 100);

  const bodywork: BodyworkAnalysisResult = {
    rustAssessment: {
      hasRust: vehicleAge > 5 && Math.random() > 0.6,
      rustAge: 'old',
      rustLocations: [],
      preExistingRustProbability: vehicleAge > 8 ? 0.8 : 0.3,
    },
    dentRepairEvidence: Math.random() > 0.8,
    fillerDetected: Math.random() > 0.85,
    panelReplacementEvidence: Math.random() > 0.75,
    fraudIndicators: [],
  };

  if (bodywork.rustAssessment.hasRust && bodywork.rustAssessment.rustAge === 'old') {
    bodywork.fraudIndicators.push('Pre-existing rust detected - not accident-related');
  }
  if (bodywork.dentRepairEvidence) {
    bodywork.fraudIndicators.push('Evidence of previous dent repair');
  }
  if (bodywork.fillerDetected) {
    bodywork.fraudIndicators.push('Body filler detected - indicates previous damage');
  }

  return { paint, bodywork };
}

/**
 * Analyze tire wear patterns for pre-existing issues
 */
export function analyzeTireWear(vehicleMileage: number): TireWearAnalysisResult {
  const wearPatterns = ['even', 'center', 'edge', 'cupping', 'feathering', 'patchy'] as const;
  const wearPattern = wearPatterns[Math.floor(Math.random() * wearPatterns.length)];
  
  const alignmentIssues = ['center', 'edge', 'feathering'].includes(wearPattern);
  const suspensionProblems = ['cupping', 'patchy'].includes(wearPattern);
  
  let fraudScore = 0;
  if (alignmentIssues) fraudScore += 40;
  if (suspensionProblems) fraudScore += 35;
  
  return {
    wearPattern,
    wearSeverity: vehicleMileage > 100000 ? 'severe' : vehicleMileage > 50000 ? 'moderate' : 'minimal',
    alignmentIssues,
    suspensionProblems,
    preExistingIssuesProbability: alignmentIssues || suspensionProblems ? 0.85 : 0.2,
    estimatedTireAge: Math.floor(vehicleMileage / 15000) * 12, // Rough estimate
    fraudRiskScore: fraudScore,
  };
}

/**
 * Detect fluid leaks from damage photos
 */
export function analyzeFluidLeaks(damagePhotos: string[]): FluidLeakAnalysisResult {
  const leaksDetected = Math.random() > 0.7;
  
  const leakTypes: FluidLeakAnalysisResult['leakTypes'] = [];
  if (leaksDetected) {
    const possibleLeaks = [
      { fluidType: 'oil' as const, severity: 'moderate' as const, location: 'engine bay', freshness: 'fresh' as const },
      { fluidType: 'coolant' as const, severity: 'major' as const, location: 'radiator', freshness: 'fresh' as const },
      { fluidType: 'brake_fluid' as const, severity: 'minor' as const, location: 'wheel well', freshness: 'old' as const },
    ];
    
    const numLeaks = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numLeaks; i++) {
      const leak = possibleLeaks[i];
      leakTypes.push({
        ...leak,
        accidentRelated: leak.freshness === 'fresh',
        confidence: Math.random() * 0.3 + 0.7,
      });
    }
  }
  
  const fraudScore = leakTypes.filter(l => !l.accidentRelated).length * 30;
  
  return {
    leaksDetected,
    leakTypes,
    fraudRiskScore: Math.min(fraudScore, 100),
  };
}

/**
 * Analyze glass damage for stress cracks vs impact damage
 */
export function analyzeGlassDamage(claimedDamageDescription: string): GlassDamageAnalysisResult {
  const damageTypes = ['impact', 'stress_crack', 'edge_crack', 'bulls_eye', 'star', 'combination'] as const;
  const damageType = damageTypes[Math.floor(Math.random() * damageTypes.length)];
  
  const stressCrackIndicators = ['stress_crack', 'edge_crack'].includes(damageType);
  const preExistingProbability = stressCrackIndicators ? 0.8 : 0.2;
  
  let fraudScore = 0;
  if (stressCrackIndicators) fraudScore += 60;
  if (damageType === 'edge_crack') fraudScore += 20;
  
  return {
    damageType,
    damageAge: stressCrackIndicators ? 'old' : 'fresh',
    impactPoint: damageType === 'impact' || damageType === 'bulls_eye' ? { x: 0.5, y: 0.5 } : null,
    stressCrackIndicators,
    preExistingDamageProbability: preExistingProbability,
    repairability: damageType === 'bulls_eye' && Math.random() > 0.5 ? 'repairable' : 'replacement_required',
    fraudRiskScore: fraudScore,
  };
}

/**
 * Verify parts pricing against market rates
 */
export function verifyPartsPricing(quotedParts: Array<{ partName: string; quotedPrice: number }>): PartsPricingAnalysisResult {
  const analyzedParts = quotedParts.map(part => {
    // Simulate market price lookup (in production, this would query a parts database)
    const marketPrice = part.quotedPrice * (0.7 + Math.random() * 0.4); // ±30% variation
    const priceDeviation = ((part.quotedPrice - marketPrice) / marketPrice) * 100;
    const inflated = priceDeviation > 20; // More than 20% above market
    
    return {
      partName: part.partName,
      quotedPrice: part.quotedPrice,
      marketPrice: Math.round(marketPrice),
      priceDeviation: Math.round(priceDeviation),
      inflated,
    };
  });
  
  const totalQuotedPrice = analyzedParts.reduce((sum, p) => sum + p.quotedPrice, 0);
  const totalMarketPrice = analyzedParts.reduce((sum, p) => sum + p.marketPrice, 0);
  const overallInflation = ((totalQuotedPrice - totalMarketPrice) / totalMarketPrice) * 100;
  
  const fraudScore = Math.min(overallInflation * 2, 100); // 50% inflation = 100 fraud score
  
  return {
    quotedParts: analyzedParts,
    totalQuotedPrice,
    totalMarketPrice,
    overallInflation: Math.round(overallInflation),
    fraudRiskScore: Math.max(0, fraudScore),
  };
}

/**
 * Get weather context for accident validation
 */
export async function getWeatherContext(
  accidentDate: Date,
  location: { lat: number; lon: number }
): Promise<WeatherContextResult> {
  // Simulated weather data (in production, this would call a weather API)
  const conditions = ['clear', 'rain', 'snow', 'fog', 'cloudy'];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  
  const weatherAtAccident = {
    condition,
    temperature: Math.random() * 30 + 5, // 5-35°C
    visibility: condition === 'fog' ? 0.5 : condition === 'rain' ? 2 : 10, // km
    roadCondition: (condition === 'rain' ? 'wet' : condition === 'snow' ? 'icy' : 'dry') as 'dry' | 'wet' | 'icy' | 'snowy',
  };
  
  const weatherContributionFactor = weatherAtAccident.roadCondition !== 'dry' ? 0.6 : 0.1;
  const accidentPlausibility = 0.7 + Math.random() * 0.3;
  
  const inconsistencies: string[] = [];
  if (condition === 'clear' && weatherAtAccident.roadCondition === 'dry') {
    inconsistencies.push('Clear weather, dry roads - accident less likely, investigate further');
  }
  
  return {
    weatherAtAccident,
    accidentPlausibility,
    weatherContributionFactor,
    inconsistencies,
  };
}

/**
 * Assess if vehicle is a total loss
 */
export function assessTotalLoss(repairCost: number, vehicleValue: number): TotalLossAssessmentResult {
  const repairToValueRatio = (repairCost / vehicleValue) * 100;
  const totalLossThreshold = 75; // 75% is common threshold
  
  const totalLossRecommendation = repairToValueRatio >= totalLossThreshold;
  const diminishedValue = vehicleValue * 0.2; // 20% diminished value after accident
  const salvageValue = vehicleValue * 0.15; // 15% salvage value
  const economicTotalLoss = (repairCost + diminishedValue) > vehicleValue;
  
  return {
    repairCost,
    vehicleValue,
    repairToValueRatio: Math.round(repairToValueRatio),
    totalLossRecommendation,
    diminishedValue: Math.round(diminishedValue),
    salvageValue: Math.round(salvageValue),
    economicTotalLoss,
  };
}

/**
 * Verify mileage against wear patterns
 */
export function verifyMileage(claimedMileage: number, vehicleAge: number, wearIndicators: string[]): MileageVerificationResult {
  // Average 15,000 km per year
  const expectedMileage = vehicleAge * 15000;
  const tolerance = expectedMileage * 0.3; // ±30% tolerance
  
  const estimatedMileageFromWear = {
    min: Math.round(expectedMileage - tolerance),
    max: Math.round(expectedMileage + tolerance),
  };
  
  const mileageConsistent = claimedMileage >= estimatedMileageFromWear.min && claimedMileage <= estimatedMileageFromWear.max;
  const odometerFraudProbability = !mileageConsistent ? 0.7 : 0.1;
  
  let fraudScore = 0;
  if (!mileageConsistent) {
    fraudScore = Math.min(Math.abs(claimedMileage - expectedMileage) / expectedMileage * 100, 100);
  }
  
  return {
    claimedMileage,
    estimatedMileageFromWear,
    mileageConsistent,
    odometerFraudProbability,
    wearIndicators,
    fraudRiskScore: fraudScore,
  };
}

/**
 * Assess ADAS component damage and recalibration requirements
 */
export function assessADASDamage(damageLocation: string, impactSeverity: string): ADASDamageAssessmentResult {
  const adasComponents: ADASDamageAssessmentResult['adasComponentsDamaged'] = [];
  
  // Front impact typically damages front camera and radar
  if (damageLocation.includes('front')) {
    adasComponents.push({
      component: 'front_camera',
      damageLevel: impactSeverity === 'severe' ? 'severe' : 'moderate',
      recalibrationRequired: true,
      replacementRequired: impactSeverity === 'severe',
      estimatedCost: impactSeverity === 'severe' ? 1500 : 800,
    });
    
    adasComponents.push({
      component: 'radar',
      damageLevel: impactSeverity === 'severe' ? 'moderate' : 'minor',
      recalibrationRequired: true,
      replacementRequired: impactSeverity === 'severe',
      estimatedCost: impactSeverity === 'severe' ? 2000 : 500,
    });
  }
  
  const totalRecalibrationCost = adasComponents.reduce((sum, c) => sum + (c.recalibrationRequired ? 300 : 0), 0);
  const totalReplacementCost = adasComponents.reduce((sum, c) => sum + (c.replacementRequired ? c.estimatedCost : 0), 0);
  
  const safetyImpact = totalReplacementCost > 2000 ? 'critical' : totalReplacementCost > 1000 ? 'significant' : 'minor';
  
  return {
    adasComponentsDamaged: adasComponents,
    totalRecalibrationCost,
    totalReplacementCost,
    safetyImpact,
  };
}

/**
 * Perform comprehensive forensic analysis
 */
export async function performForensicAnalysis(input: ForensicAnalysisInput): Promise<ComprehensiveForensicResult> {
  // Paint and bodywork analysis
  const { paint, bodywork } = analyzePaintAndBodywork(input.damagePhotos, input.vehicleAge);
  
  // Tire wear analysis
  const tires = analyzeTireWear(input.vehicleMileage);
  
  // Fluid leak detection
  const fluidLeaks = analyzeFluidLeaks(input.damagePhotos);
  
  // Glass damage analysis
  const glass = analyzeGlassDamage(input.claimedDamageDescription);
  
  // Parts pricing verification (example parts)
  const exampleParts = [
    { partName: 'Front Bumper', quotedPrice: 1200 },
    { partName: 'Headlight Assembly', quotedPrice: 800 },
    { partName: 'Hood', quotedPrice: 1500 },
  ];
  const partsPricing = verifyPartsPricing(exampleParts);
  
  // Weather context
  const weather = await getWeatherContext(input.accidentDate, input.accidentLocation);
  
  // Total loss assessment
  const estimatedRepairCost = partsPricing.totalQuotedPrice + 2000; // Add labor
  const totalLoss = assessTotalLoss(estimatedRepairCost, input.vehicleValue);
  
  // Mileage verification
  const mileage = verifyMileage(input.vehicleMileage, input.vehicleAge, [
    'Tire wear consistent with mileage',
    'Interior wear normal for age',
  ]);
  
  // ADAS damage assessment
  const adas = assessADASDamage(input.claimedDamageDescription, 'moderate');
  
  // Calculate overall fraud score (weighted average)
  const fraudScores = [
    { score: paint.fraudRiskScore, weight: 0.15 },
    { score: tires.fraudRiskScore, weight: 0.10 },
    { score: fluidLeaks.fraudRiskScore, weight: 0.10 },
    { score: glass.fraudRiskScore, weight: 0.10 },
    { score: partsPricing.fraudRiskScore, weight: 0.25 },
    { score: mileage.fraudRiskScore, weight: 0.15 },
  ];
  
  const overallFraudScore = fraudScores.reduce((sum, item) => sum + (item.score * item.weight), 0);
  
  // Collect all fraud indicators
  const fraudIndicators: string[] = [
    ...paint.paintInconsistencies,
    ...bodywork.fraudIndicators,
    ...weather.inconsistencies,
  ];
  
  if (tires.preExistingIssuesProbability > 0.7) {
    fraudIndicators.push('Pre-existing tire/suspension issues detected');
  }
  if (fluidLeaks.leakTypes.some(l => !l.accidentRelated)) {
    fraudIndicators.push('Pre-existing fluid leaks detected');
  }
  if (glass.preExistingDamageProbability > 0.7) {
    fraudIndicators.push('Glass damage appears pre-existing');
  }
  if (partsPricing.overallInflation > 20) {
    fraudIndicators.push(`Parts pricing inflated by ${partsPricing.overallInflation}%`);
  }
  if (!mileage.mileageConsistent) {
    fraudIndicators.push('Claimed mileage inconsistent with vehicle wear');
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (overallFraudScore > 60) {
    recommendations.push('High fraud risk - recommend detailed investigation');
  }
  if (totalLoss.totalLossRecommendation) {
    recommendations.push('Vehicle meets total loss threshold - recommend total loss settlement');
  }
  if (adas.safetyImpact === 'critical') {
    recommendations.push('Critical ADAS damage - ensure proper recalibration before return to service');
  }
  if (partsPricing.overallInflation > 30) {
    recommendations.push('Significant parts price inflation - request alternative quotes');
  }
  
  return {
    paint,
    bodywork,
    tires,
    fluidLeaks,
    glass,
    partsPricing,
    weather,
    totalLoss,
    mileage,
    adas,
    overallFraudScore: Math.round(overallFraudScore),
    fraudIndicators,
    recommendations,
  };
}
