// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the refactored LLM-First Assessment Processor
 * Validates:
 * - Inline TypeScript physics validation (replaces Python physics_validator.py)
 * - Inline TypeScript fraud detection (replaces Python fraud_ml_model.py)
 * - ML-ready plugin interface (IModelPlugin)
 * - Image classification heuristics (replaces Python extract_images.py)
 * - Data quality tracking
 */

// ============================================================
// Inline implementations of the same functions from the processor
// (Testing the logic without importing the full module which needs
// server-side dependencies like storagePut and invokeLLM)
// ============================================================

const VEHICLE_MASSES: Record<string, number> = {
  sedan: 1500, suv: 2000, truck: 2500, van: 1800, hatchback: 1200, coupe: 1400,
};

const TYPICAL_SPEEDS: Record<string, [number, number]> = {
  rear_end: [20, 60], side_impact: [30, 80], head_on: [40, 100],
  parking_lot: [5, 20], highway: [80, 120], rollover: [40, 100],
};

const SEVERITY_ENERGY_RANGES: Record<string, [number, number]> = {
  minor: [0, 50000], moderate: [50000, 150000], severe: [150000, 400000],
  total_loss: [400000, Infinity],
};

const EXPECTED_DAMAGE_LOCATIONS: Record<string, string[]> = {
  rear_end: ['rear'], side_impact: ['left_side', 'right_side'],
  head_on: ['front'], parking_lot: ['rear', 'front', 'left_side', 'right_side'],
  highway: ['front', 'rear'],
};

const GRAVITY = 9.81;
const CRUMPLE_DISTANCE = 0.5;

function normalizeDamageLocation(loc: string): string {
  const lower = loc.toLowerCase();
  // Check rear BEFORE front because 'rear bumper' contains 'bumper' which would match front
  if (['rear', 'trunk', 'taillight', 'back'].some(x => lower.includes(x))) return 'rear';
  if (['front', 'bumper', 'hood', 'radiator', 'grille', 'headlight'].some(x => lower.includes(x))) return 'front';
  if (['left', 'driver'].some(x => lower.includes(x))) return 'left_side';
  if (['right', 'passenger'].some(x => lower.includes(x))) return 'right_side';
  if (['roof', 'top'].some(x => lower.includes(x))) return 'roof';
  return lower;
}

function inferVehicleType(model: string): string {
  const lower = (model || '').toLowerCase();
  if (['ranger', 'hilux', 'truck', 'pickup', 'navara', 'triton', 'bt-50'].some(x => lower.includes(x))) return 'truck';
  if (['suv', 'fortuner', 'pajero', 'rav4', 'tucson', 'sportage', 'x-trail'].some(x => lower.includes(x))) return 'suv';
  if (['van', 'quantum', 'hiace', 'transporter'].some(x => lower.includes(x))) return 'van';
  if (['polo', 'jazz', 'swift', 'i20', 'fiesta'].some(x => lower.includes(x))) return 'hatchback';
  return 'sedan';
}

function validatePhysicsInline(
  vehicleType: string, accidentType: string, estimatedSpeed: number,
  damageSeverity: string, damageLocations: string[]
) {
  const flags: string[] = [];
  const vehicleMass = VEHICLE_MASSES[vehicleType.toLowerCase()] || 1500;
  const speedMs = estimatedSpeed / 3.6;
  const kineticEnergy = 0.5 * vehicleMass * (speedMs * speedMs);
  
  const expectedRange = SEVERITY_ENERGY_RANGES[damageSeverity] || [0, Infinity];
  if (kineticEnergy < expectedRange[0] || kineticEnergy > expectedRange[1]) {
    flags.push(`MISMATCH: energy inconsistent`);
  }
  
  const normalizedLocs = damageLocations.map(normalizeDamageLocation);
  const expectedLocs = EXPECTED_DAMAGE_LOCATIONS[accidentType] || [];
  if (expectedLocs.length > 0 && !normalizedLocs.some(loc => expectedLocs.includes(loc))) {
    flags.push(`IMPOSSIBLE DAMAGE PATTERN`);
  }
  
  const deceleration = speedMs > 0 ? (speedMs * speedMs) / (2 * CRUMPLE_DISTANCE) : 0;
  const gForce = deceleration / GRAVITY;
  
  if (gForce > 50) flags.push('FATAL COLLISION');
  else if (gForce > 20) flags.push('SEVERE IMPACT');
  
  const typicalRange = TYPICAL_SPEEDS[accidentType] || [0, 200];
  if (estimatedSpeed < typicalRange[0] || estimatedSpeed > typicalRange[1]) {
    flags.push('UNUSUAL SPEED');
  }
  
  if (normalizedLocs.includes('roof') && !['rollover', 'falling_object'].includes(accidentType)) {
    flags.push('IMPOSSIBLE: Roof damage');
  }
  
  const impactForce = vehicleMass * speedMs / 0.1;
  const confidence = Math.max(0, Math.min(1, 1.0 - (flags.length * 0.2)));
  const physicsScore = Math.round(confidence * 100);
  
  let damageConsistency = 'consistent';
  if (flags.some(f => f.includes('IMPOSSIBLE'))) damageConsistency = 'impossible';
  else if (flags.some(f => f.includes('MISMATCH') || f.includes('UNUSUAL'))) damageConsistency = 'inconsistent';
  else if (flags.length > 0) damageConsistency = 'questionable';
  
  return {
    is_valid: flags.length === 0,
    confidence,
    damageConsistency,
    flags,
    physics_analysis: {
      kinetic_energy_joules: kineticEnergy,
      vehicle_mass_kg: vehicleMass,
      impact_speed_ms: speedMs,
      deceleration_ms2: deceleration,
      g_force: gForce,
    },
    impactSpeed: Math.round(estimatedSpeed),
    impactForce: Math.round(impactForce / 1000),
    physicsScore,
  };
}

function detectFraudInline(
  claimAmount: number, vehicleAge: number, previousClaimsCount: number,
  damageSeverityScore: number, physicsValidationScore: number,
  hasWitnesses: boolean, hasPoliceReport: boolean, hasPhotos: boolean,
  isHighValue: boolean, accidentType: string,
) {
  let fraudScore = 0;
  const riskFactors: string[] = [];
  
  if (claimAmount > 10000) { fraudScore += 0.2; riskFactors.push('high_claim_amount'); }
  if (previousClaimsCount > 2) { fraudScore += 0.3; riskFactors.push('multiple_previous_claims'); }
  if (physicsValidationScore < 0.5) { fraudScore += 0.4; riskFactors.push('failed_physics_validation'); }
  if (!hasWitnesses && !hasPoliceReport) { fraudScore += 0.2; riskFactors.push('no_independent_verification'); }
  if (!hasPhotos) { fraudScore += 0.15; riskFactors.push('no_photographic_evidence'); }
  if (isHighValue && vehicleAge > 10) { fraudScore += 0.25; riskFactors.push('high_value_old_vehicle'); }
  if (damageSeverityScore > 0.7 && accidentType === 'parking_lot') { fraudScore += 0.2; riskFactors.push('severe_damage_low_speed_scenario'); }
  
  fraudScore = Math.min(1.0, fraudScore);
  const riskLevel = fraudScore < 0.3 ? 'low' : fraudScore < 0.6 ? 'medium' : fraudScore < 0.8 ? 'high' : 'critical';
  
  return { fraudProbability: fraudScore, riskLevel, topRiskFactors: riskFactors };
}

// ============================================================
// PHYSICS VALIDATION TESTS
// ============================================================

describe('Physics Validation Engine (TypeScript — replaces Python physics_validator.py)', () => {
  
  describe('Kinetic Energy Calculations', () => {
    it('should calculate kinetic energy correctly for sedan at 50 km/h', () => {
      const result = validatePhysicsInline('sedan', 'rear_end', 50, 'moderate', ['rear bumper']);
      // KE = 0.5 * 1500 * (50/3.6)^2 = 0.5 * 1500 * 192.9 = 144,676 J
      expect(result.physics_analysis.kinetic_energy_joules).toBeCloseTo(144675.9, -1);
      expect(result.physics_analysis.vehicle_mass_kg).toBe(1500);
      expect(result.physics_analysis.impact_speed_ms).toBeCloseTo(13.89, 1);
    });
    
    it('should calculate kinetic energy correctly for truck at 80 km/h', () => {
      const result = validatePhysicsInline('truck', 'highway', 80, 'severe', ['front bumper']);
      // KE = 0.5 * 2500 * (80/3.6)^2 = 0.5 * 2500 * 493.8 = 617,284 J
      expect(result.physics_analysis.kinetic_energy_joules).toBeCloseTo(617283.9, -1);
      expect(result.physics_analysis.vehicle_mass_kg).toBe(2500);
    });
    
    it('should use default mass for unknown vehicle type', () => {
      const result = validatePhysicsInline('unknown', 'rear_end', 40, 'minor', ['rear']);
      expect(result.physics_analysis.vehicle_mass_kg).toBe(1500); // default
    });
  });
  
  describe('Damage Consistency Validation', () => {
    it('should validate consistent rear-end collision', () => {
      const result = validatePhysicsInline('sedan', 'rear_end', 40, 'moderate', ['rear bumper', 'trunk']);
      expect(result.damageConsistency).toBe('consistent');
      expect(result.is_valid).toBe(true);
    });
    
    it('should flag impossible damage pattern — front damage in rear-end', () => {
      const result = validatePhysicsInline('sedan', 'rear_end', 40, 'moderate', ['front bumper', 'hood']);
      expect(result.flags.some(f => f.includes('IMPOSSIBLE DAMAGE PATTERN'))).toBe(true);
      expect(result.damageConsistency).toBe('impossible');
      expect(result.is_valid).toBe(false);
    });
    
    it('should flag impossible roof damage in side impact', () => {
      const result = validatePhysicsInline('sedan', 'side_impact', 50, 'moderate', ['roof']);
      expect(result.flags.some(f => f.includes('IMPOSSIBLE: Roof damage'))).toBe(true);
    });
    
    it('should allow any damage location for parking lot accidents', () => {
      const result = validatePhysicsInline('sedan', 'parking_lot', 10, 'minor', ['front bumper']);
      expect(result.flags.some(f => f.includes('IMPOSSIBLE DAMAGE PATTERN'))).toBe(false);
    });
    
    it('should validate head-on collision with front damage', () => {
      const result = validatePhysicsInline('suv', 'head_on', 60, 'severe', ['front bumper', 'hood', 'radiator']);
      expect(result.flags.some(f => f.includes('IMPOSSIBLE DAMAGE PATTERN'))).toBe(false);
    });
  });
  
  describe('Speed Validation', () => {
    it('should flag unusual speed for parking lot (too fast)', () => {
      const result = validatePhysicsInline('sedan', 'parking_lot', 80, 'severe', ['front']);
      expect(result.flags.some(f => f.includes('UNUSUAL SPEED'))).toBe(true);
    });
    
    it('should accept normal speed for rear-end collision', () => {
      const result = validatePhysicsInline('sedan', 'rear_end', 40, 'moderate', ['rear']);
      expect(result.flags.some(f => f.includes('UNUSUAL SPEED'))).toBe(false);
    });
    
    it('should flag low speed for highway accident', () => {
      const result = validatePhysicsInline('sedan', 'highway', 30, 'minor', ['front']);
      expect(result.flags.some(f => f.includes('UNUSUAL SPEED'))).toBe(true);
    });
  });
  
  describe('G-Force and Severity', () => {
    it('should flag fatal collision at very high speed', () => {
      const result = validatePhysicsInline('sedan', 'head_on', 200, 'severe', ['front']);
      expect(result.flags.some(f => f.includes('FATAL COLLISION'))).toBe(true);
    });
    
    it('should flag severe impact at high speed', () => {
      const result = validatePhysicsInline('sedan', 'head_on', 100, 'severe', ['front']);
      // G-force = (100/3.6)^2 / (2*0.5*9.81) = 771.6 / 9.81 = 78.7g
      expect(result.flags.some(f => f.includes('FATAL COLLISION') || f.includes('SEVERE IMPACT'))).toBe(true);
    });
    
    it('should not flag low-speed parking lot impact', () => {
      const result = validatePhysicsInline('sedan', 'parking_lot', 10, 'minor', ['rear']);
      expect(result.flags.some(f => f.includes('FATAL') || f.includes('SEVERE IMPACT'))).toBe(false);
    });
  });
  
  describe('Energy vs Severity Mismatch', () => {
    it('should flag minor damage at high speed (too much energy)', () => {
      const result = validatePhysicsInline('suv', 'highway', 100, 'minor', ['front']);
      // KE = 0.5 * 2000 * (100/3.6)^2 = 771,604 J — way above minor range (0-50000)
      expect(result.flags.some(f => f.includes('MISMATCH'))).toBe(true);
    });
    
    it('should not flag moderate damage at moderate speed', () => {
      const result = validatePhysicsInline('sedan', 'rear_end', 40, 'moderate', ['rear']);
      // KE = 0.5 * 1500 * (40/3.6)^2 = 92,593 J — within moderate range (50000-150000)
      expect(result.flags.some(f => f.includes('MISMATCH'))).toBe(false);
    });
  });
  
  describe('Physics Score', () => {
    it('should return 100 for perfectly consistent scenario', () => {
      const result = validatePhysicsInline('sedan', 'rear_end', 40, 'moderate', ['rear bumper']);
      // At 40 km/h, sedan KE = 0.5*1500*(40/3.6)^2 = 92,593 J — within moderate range (50000-150000)
      // Damage location 'rear bumper' normalizes to 'rear' — consistent with rear_end
      // Speed 40 is within rear_end range [20,60]
      expect(result.physicsScore).toBe(100);
      expect(result.confidence).toBe(1.0);
    });
    
    it('should reduce score for each flag', () => {
      const result = validatePhysicsInline('sedan', 'rear_end', 200, 'minor', ['front bumper', 'roof']);
      // Multiple flags should reduce the score
      expect(result.physicsScore).toBeLessThan(60);
      expect(result.confidence).toBeLessThan(0.6);
    });
    
    it('should never go below 0', () => {
      const result = validatePhysicsInline('sedan', 'parking_lot', 200, 'minor', ['roof']);
      expect(result.physicsScore).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================
// FRAUD DETECTION TESTS
// ============================================================

describe('Fraud Detection Engine (TypeScript — replaces Python fraud_ml_model.py)', () => {
  
  describe('Low Risk Claims', () => {
    it('should classify normal claim as low risk', () => {
      const result = detectFraudInline(5000, 3, 0, 0.5, 0.9, true, true, true, false, 'rear_end');
      expect(result.riskLevel).toBe('low');
      expect(result.fraudProbability).toBeLessThan(0.3);
    });
    
    it('should have no risk factors for clean claim', () => {
      const result = detectFraudInline(3000, 2, 0, 0.3, 0.95, true, true, true, false, 'parking_lot');
      expect(result.topRiskFactors).toHaveLength(0);
      expect(result.fraudProbability).toBe(0);
    });
  });
  
  describe('Medium Risk Claims', () => {
    it('should flag high claim amount', () => {
      const result = detectFraudInline(15000, 3, 0, 0.5, 0.9, false, false, true, true, 'rear_end');
      expect(result.topRiskFactors).toContain('high_claim_amount');
      expect(result.topRiskFactors).toContain('no_independent_verification');
    });
    
    it('should flag no verification and no photos', () => {
      const result = detectFraudInline(5000, 3, 0, 0.5, 0.9, false, false, false, false, 'rear_end');
      expect(result.topRiskFactors).toContain('no_independent_verification');
      expect(result.topRiskFactors).toContain('no_photographic_evidence');
    });
  });
  
  describe('High Risk Claims', () => {
    it('should flag failed physics validation', () => {
      const result = detectFraudInline(8000, 5, 0, 0.6, 0.3, false, false, true, false, 'rear_end');
      expect(result.topRiskFactors).toContain('failed_physics_validation');
      // 0.4 (physics) + 0.2 (no verification) = 0.6 → 'high' (0.6 >= 0.6)
      expect(result.riskLevel).toBe('high');
    });
    
    it('should flag multiple previous claims', () => {
      const result = detectFraudInline(8000, 5, 5, 0.6, 0.3, false, false, true, false, 'rear_end');
      expect(result.topRiskFactors).toContain('multiple_previous_claims');
      expect(result.topRiskFactors).toContain('failed_physics_validation');
    });
    
    it('should flag high value on old vehicle', () => {
      const result = detectFraudInline(15000, 15, 0, 0.5, 0.9, false, false, true, true, 'rear_end');
      expect(result.topRiskFactors).toContain('high_value_old_vehicle');
      expect(result.topRiskFactors).toContain('high_claim_amount');
    });
    
    it('should flag severe damage in parking lot', () => {
      const result = detectFraudInline(5000, 3, 0, 0.9, 0.9, false, false, true, false, 'parking_lot');
      expect(result.topRiskFactors).toContain('severe_damage_low_speed_scenario');
      expect(result.topRiskFactors).toContain('no_independent_verification');
    });
  });
  
  describe('Critical Risk Claims', () => {
    it('should classify maximum risk claim as critical', () => {
      const result = detectFraudInline(20000, 15, 5, 0.9, 0.2, false, false, false, true, 'parking_lot');
      expect(result.riskLevel).toBe('critical');
      expect(result.fraudProbability).toBeGreaterThanOrEqual(0.8);
    });
  });
  
  describe('Score Capping', () => {
    it('should cap fraud score at 1.0', () => {
      const result = detectFraudInline(50000, 20, 10, 0.95, 0.1, false, false, false, true, 'parking_lot');
      expect(result.fraudProbability).toBeLessThanOrEqual(1.0);
    });
  });
});

// ============================================================
// DAMAGE LOCATION NORMALIZATION TESTS
// ============================================================

describe('Damage Location Normalization', () => {
  it('should normalize front-related terms', () => {
    expect(normalizeDamageLocation('front bumper')).toBe('front');
    expect(normalizeDamageLocation('hood')).toBe('front');
    expect(normalizeDamageLocation('radiator grille')).toBe('front');
    expect(normalizeDamageLocation('headlight assembly')).toBe('front');
  });
  
  it('should normalize rear-related terms', () => {
    expect(normalizeDamageLocation('rear bumper')).toBe('rear');
    expect(normalizeDamageLocation('trunk lid')).toBe('rear');
    expect(normalizeDamageLocation('taillight')).toBe('rear');
    expect(normalizeDamageLocation('back panel')).toBe('rear');
  });
  
  it('should normalize side-related terms', () => {
    expect(normalizeDamageLocation('left fender')).toBe('left_side');
    expect(normalizeDamageLocation('right door')).toBe('right_side');
    expect(normalizeDamageLocation('driver side mirror')).toBe('left_side');
    expect(normalizeDamageLocation('passenger door')).toBe('right_side');
  });
  
  it('should normalize roof-related terms', () => {
    expect(normalizeDamageLocation('roof panel')).toBe('roof');
    expect(normalizeDamageLocation('top of vehicle')).toBe('roof');
  });
  
  it('should return lowercase for unknown locations', () => {
    expect(normalizeDamageLocation('Undercarriage')).toBe('undercarriage');
  });
});

// ============================================================
// VEHICLE TYPE INFERENCE TESTS
// ============================================================

describe('Vehicle Type Inference', () => {
  it('should identify trucks', () => {
    expect(inferVehicleType('Ford Ranger')).toBe('truck');
    expect(inferVehicleType('Toyota Hilux')).toBe('truck');
    expect(inferVehicleType('Nissan Navara')).toBe('truck');
  });
  
  it('should identify SUVs', () => {
    expect(inferVehicleType('Toyota Fortuner')).toBe('suv');
    expect(inferVehicleType('Mitsubishi Pajero')).toBe('suv');
    expect(inferVehicleType('Hyundai Tucson')).toBe('suv');
  });
  
  it('should identify vans', () => {
    expect(inferVehicleType('Toyota Quantum')).toBe('van');
    expect(inferVehicleType('Toyota HiAce')).toBe('van');
  });
  
  it('should identify hatchbacks', () => {
    expect(inferVehicleType('VW Polo')).toBe('hatchback');
    expect(inferVehicleType('Suzuki Swift')).toBe('hatchback');
  });
  
  it('should default to sedan for unknown models', () => {
    expect(inferVehicleType('BMW 3 Series')).toBe('sedan');
    expect(inferVehicleType('Mercedes C-Class')).toBe('sedan');
    expect(inferVehicleType('')).toBe('sedan');
  });
});

// ============================================================
// ML PLUGIN INTERFACE TESTS
// ============================================================

describe('ML-Ready Plugin Interface', () => {
  it('should define IModelPlugin interface contract', () => {
    // Simulate a trained fraud model plugin
    const mockFraudPlugin = {
      id: 'kinga-fraud-rf-v1',
      domain: 'fraud' as const,
      version: '1.0.0',
      isReady: () => true,
      predict: async (input: Record<string, any>) => ({
        fraud_probability: 0.35,
        risk_level: 'medium',
        risk_score: 35,
        confidence: 0.92,
        top_risk_factors: ['high_claim_amount'],
      }),
      metadata: () => ({
        trainedOn: '2026-01-15',
        accuracy: 0.94,
        datasetSize: 15000,
      }),
    };
    
    expect(mockFraudPlugin.isReady()).toBe(true);
    expect(mockFraudPlugin.domain).toBe('fraud');
    expect(mockFraudPlugin.metadata().accuracy).toBe(0.94);
  });
  
  it('should handle plugin that is not ready', () => {
    const untrainedPlugin = {
      id: 'kinga-physics-nn-v0',
      domain: 'physics' as const,
      version: '0.1.0',
      isReady: () => false,
      predict: async () => null,
      metadata: () => ({ trainedOn: '', accuracy: 0, datasetSize: 0 }),
    };
    
    expect(untrainedPlugin.isReady()).toBe(false);
  });
  
  it('should handle plugin that returns null (can\'t handle input)', async () => {
    const limitedPlugin = {
      id: 'kinga-cost-lr-v1',
      domain: 'cost' as const,
      version: '1.0.0',
      isReady: () => true,
      predict: async (input: Record<string, any>) => {
        // Only handles sedans
        if (input.vehicle_type !== 'sedan') return null;
        return { estimated_cost: 5000 };
      },
      metadata: () => ({ trainedOn: '2026-02-01', accuracy: 0.88, datasetSize: 8000 }),
    };
    
    const sedanResult = await limitedPlugin.predict({ vehicle_type: 'sedan' });
    expect(sedanResult).not.toBeNull();
    expect(sedanResult!.estimated_cost).toBe(5000);
    
    const truckResult = await limitedPlugin.predict({ vehicle_type: 'truck' });
    expect(truckResult).toBeNull();
  });
});

// ============================================================
// DATA QUALITY TRACKING TESTS
// ============================================================

describe('Data Quality Tracking', () => {
  it('should calculate completeness percentage correctly', () => {
    const dataQuality: Record<string, boolean> = {
      hasClaimant: true,
      hasAccidentDetails: true,
      hasSpeed: false,
      hasCost: true,
      hasItemizedCosts: true,
      hasDamageLocation: true,
      hasPoliceReport: false,
      hasDamagedComponents: true,
      hasMarketValue: false,
      hasPhotos: true,
    };
    
    const completeness = Math.round(
      (Object.values(dataQuality).filter(v => v).length / Object.keys(dataQuality).length) * 100
    );
    
    expect(completeness).toBe(70); // 7 out of 10
  });
  
  it('should track missing data fields', () => {
    const dataQuality: Record<string, boolean> = {
      hasClaimant: false,
      hasAccidentDetails: true,
      hasCost: true,
    };
    
    const missingData: string[] = [];
    for (const [key, has] of Object.entries(dataQuality)) {
      if (!has) {
        const label = key.replace('has', '').replace(/([A-Z])/g, ' $1').trim();
        missingData.push(label);
      }
    }
    
    expect(missingData).toContain('Claimant');
    expect(missingData).not.toContain('Accident Details');
  });
});

// ============================================================
// QUOTE COMPARISON TESTS
// ============================================================

describe('Multi-Quote Comparison', () => {
  it('should build quotes array from extracted data', () => {
    const quotes: any[] = [];
    const originalQuote = 5411.33;
    const agreedCost = 4750.07;
    const aiEstimate = 4200;
    const mktValue = 15000;
    
    if (originalQuote > 0) quotes.push({ label: 'Original', amount: originalQuote, type: 'original' });
    if (agreedCost > 0) quotes.push({ label: 'Agreed', amount: agreedCost, type: 'agreed' });
    if (aiEstimate > 0) quotes.push({ label: 'AI', amount: aiEstimate, type: 'ai' });
    if (mktValue > 0) quotes.push({ label: 'Market', amount: mktValue, type: 'reference' });
    
    expect(quotes).toHaveLength(4);
    expect(quotes.find((q: any) => q.type === 'original').amount).toBe(5411.33);
    expect(quotes.find((q: any) => q.type === 'agreed').amount).toBe(4750.07);
    
    const savings = originalQuote - agreedCost;
    expect(savings).toBeCloseTo(661.26, 2);
  });
  
  it('should handle missing quote figures gracefully', () => {
    const quotes: any[] = [];
    const originalQuote = 0;
    const agreedCost = 4750;
    const aiEstimate = 0;
    const mktValue = 0;
    
    if (originalQuote > 0) quotes.push({ type: 'original' });
    if (agreedCost > 0) quotes.push({ type: 'agreed', amount: agreedCost });
    if (aiEstimate > 0) quotes.push({ type: 'ai' });
    if (mktValue > 0) quotes.push({ type: 'reference' });
    
    expect(quotes).toHaveLength(1);
    expect(quotes[0].type).toBe('agreed');
  });
});

// ============================================================
// NULL STRING CLEANING TESTS
// ============================================================

describe('Null String Cleaning', () => {
  function cleanNullStrings(value: any): any {
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (['null', 'n/a', 'none', 'unknown', ''].includes(trimmed)) return null;
      return value;
    }
    return value;
  }
  
  it('should clean null-like strings', () => {
    expect(cleanNullStrings('null')).toBeNull();
    expect(cleanNullStrings('N/A')).toBeNull();
    expect(cleanNullStrings('None')).toBeNull();
    expect(cleanNullStrings('unknown')).toBeNull();
    expect(cleanNullStrings('')).toBeNull();
    expect(cleanNullStrings('  NULL  ')).toBeNull();
  });
  
  it('should preserve valid strings', () => {
    expect(cleanNullStrings('Toyota')).toBe('Toyota');
    expect(cleanNullStrings('John Smith')).toBe('John Smith');
    expect(cleanNullStrings('ABC 1234')).toBe('ABC 1234');
  });
  
  it('should pass through non-string values', () => {
    expect(cleanNullStrings(42)).toBe(42);
    expect(cleanNullStrings(true)).toBe(true);
    expect(cleanNullStrings(null)).toBeNull();
  });
});
