// @ts-nocheck
/**
 * Physics Types Validation Tests
 * 
 * Tests for TypeScript types, Zod validation, and helper functions
 * for quantitative physics analysis data.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePhysicsAnalysis,
  validatePhysicsAnalysis,
  hasQuantitativePhysics,
  getQuantitativeActivationRate,
  type PhysicsAnalysis,
} from '../shared/physics-types';

describe('Physics Types - parsePhysicsAnalysis', () => {
  it('should parse valid quantitative physics JSON', () => {
    const json = JSON.stringify({
      impactAngleDegrees: 45,
      calculatedImpactForceKN: 125.5,
      impactLocationNormalized: {
        relativeX: 0.75,
        relativeY: 0.50,
      },
      quantitativeMode: true,
    });
    
    const result = parsePhysicsAnalysis(json);
    
    expect(result.impactAngleDegrees).toBe(45);
    expect(result.calculatedImpactForceKN).toBe(125.5);
    expect(result.impactLocationNormalized?.relativeX).toBe(0.75);
    expect(result.impactLocationNormalized?.relativeY).toBe(0.50);
    expect(result.quantitativeMode).toBe(true);
  });
  
  it('should handle null input gracefully', () => {
    const result = parsePhysicsAnalysis(null);
    expect(result).toEqual({});
  });
  
  it('should handle undefined input gracefully', () => {
    const result = parsePhysicsAnalysis(undefined);
    expect(result).toEqual({});
  });
  
  it('should handle invalid JSON gracefully', () => {
    const result = parsePhysicsAnalysis('{ invalid json }');
    expect(result).toEqual({});
  });
  
  it('should parse legacy qualitative physics structure', () => {
    const json = JSON.stringify({
      primaryImpactZone: 'front_center',
      impactSeverity: 'moderate',
      damageConsistency: 'consistent',
      physicsConsistency: 'plausible',
    });
    
    const result = parsePhysicsAnalysis(json);
    
    expect(result.primaryImpactZone).toBe('front_center');
    expect(result.impactSeverity).toBe('moderate');
    expect(result.damageConsistency).toBe('consistent');
  });
  
  it('should parse mixed legacy + quantitative structure', () => {
    const json = JSON.stringify({
      primaryImpactZone: 'front_center',
      impactAngleDegrees: 30,
      calculatedImpactForceKN: 100.0,
      quantitativeMode: true,
    });
    
    const result = parsePhysicsAnalysis(json);
    
    expect(result.primaryImpactZone).toBe('front_center');
    expect(result.impactAngleDegrees).toBe(30);
    expect(result.quantitativeMode).toBe(true);
  });
});

describe('Physics Types - validatePhysicsAnalysis', () => {
  it('should validate correct quantitative physics data', () => {
    const data: PhysicsAnalysis = {
      impactAngleDegrees: 90,
      calculatedImpactForceKN: 150.0,
      impactLocationNormalized: {
        relativeX: 0.5,
        relativeY: 0.5,
      },
      quantitativeMode: true,
    };
    
    const result = validatePhysicsAnalysis(data);
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.errors).toBeUndefined();
  });
  
  it('should reject impactAngleDegrees > 360', () => {
    const data = {
      impactAngleDegrees: 400,
      quantitativeMode: true,
    };
    
    const result = validatePhysicsAnalysis(data);
    
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some(err => err.includes('impactAngleDegrees'))).toBe(true);
  });
  
  it('should reject impactAngleDegrees < 0', () => {
    const data = {
      impactAngleDegrees: -10,
      quantitativeMode: true,
    };
    
    const result = validatePhysicsAnalysis(data);
    
    expect(result.success).toBe(false);
    expect(result.errors?.some(err => err.includes('impactAngleDegrees'))).toBe(true);
  });
  
  it('should reject calculatedImpactForceKN <= 0', () => {
    const data = {
      calculatedImpactForceKN: 0,
      quantitativeMode: true,
    };
    
    const result = validatePhysicsAnalysis(data);
    
    expect(result.success).toBe(false);
    expect(result.errors?.some(err => err.includes('calculatedImpactForceKN'))).toBe(true);
  });
  
  it('should reject impactLocationNormalized.relativeX > 1', () => {
    const data = {
      impactLocationNormalized: {
        relativeX: 1.5,
        relativeY: 0.5,
      },
      quantitativeMode: true,
    };
    
    const result = validatePhysicsAnalysis(data);
    
    expect(result.success).toBe(false);
    expect(result.errors?.some(err => err.includes('relativeX'))).toBe(true);
  });
  
  it('should reject impactLocationNormalized.relativeY < 0', () => {
    const data = {
      impactLocationNormalized: {
        relativeX: 0.5,
        relativeY: -0.1,
      },
      quantitativeMode: true,
    };
    
    const result = validatePhysicsAnalysis(data);
    
    expect(result.success).toBe(false);
    expect(result.errors?.some(err => err.includes('relativeY'))).toBe(true);
  });
  
  it('should accept empty object (all fields optional)', () => {
    const data = {};
    
    const result = validatePhysicsAnalysis(data);
    
    expect(result.success).toBe(true);
  });
});

describe('Physics Types - hasQuantitativePhysics', () => {
  it('should return true for physics with quantitativeMode=true and fields', () => {
    const physics: PhysicsAnalysis = {
      impactAngleDegrees: 45,
      calculatedImpactForceKN: 125.5,
      quantitativeMode: true,
    };
    
    expect(hasQuantitativePhysics(physics)).toBe(true);
  });
  
  it('should return false for physics with quantitativeMode=false', () => {
    const physics: PhysicsAnalysis = {
      impactAngleDegrees: 45,
      quantitativeMode: false,
    };
    
    expect(hasQuantitativePhysics(physics)).toBe(false);
  });
  
  it('should return false for physics without quantitativeMode flag', () => {
    const physics: PhysicsAnalysis = {
      impactAngleDegrees: 45,
    };
    
    expect(hasQuantitativePhysics(physics)).toBe(false);
  });
  
  it('should return false for physics with quantitativeMode=true but no fields', () => {
    const physics: PhysicsAnalysis = {
      quantitativeMode: true,
    };
    
    expect(hasQuantitativePhysics(physics)).toBe(false);
  });
  
  it('should return false for empty physics object', () => {
    const physics: PhysicsAnalysis = {};
    
    expect(hasQuantitativePhysics(physics)).toBe(false);
  });
});

describe('Physics Types - getQuantitativeActivationRate', () => {
  it('should calculate 100% activation rate', () => {
    const physicsArray: PhysicsAnalysis[] = [
      { impactAngleDegrees: 45, quantitativeMode: true },
      { calculatedImpactForceKN: 100, quantitativeMode: true },
      { impactLocationNormalized: { relativeX: 0.5, relativeY: 0.5 }, quantitativeMode: true },
    ];
    
    const rate = getQuantitativeActivationRate(physicsArray);
    
    expect(rate).toBe(100);
  });
  
  it('should calculate 50% activation rate', () => {
    const physicsArray: PhysicsAnalysis[] = [
      { impactAngleDegrees: 45, quantitativeMode: true },
      { primaryImpactZone: 'front_center' }, // legacy
    ];
    
    const rate = getQuantitativeActivationRate(physicsArray);
    
    expect(rate).toBe(50);
  });
  
  it('should calculate 0% activation rate for all legacy', () => {
    const physicsArray: PhysicsAnalysis[] = [
      { primaryImpactZone: 'front_center' },
      { impactSeverity: 'moderate' },
    ];
    
    const rate = getQuantitativeActivationRate(physicsArray);
    
    expect(rate).toBe(0);
  });
  
  it('should return 0 for empty array', () => {
    const physicsArray: PhysicsAnalysis[] = [];
    
    const rate = getQuantitativeActivationRate(physicsArray);
    
    expect(rate).toBe(0);
  });
  
  it('should calculate fractional activation rate', () => {
    const physicsArray: PhysicsAnalysis[] = [
      { impactAngleDegrees: 45, quantitativeMode: true },
      { primaryImpactZone: 'front_center' },
      { calculatedImpactForceKN: 100, quantitativeMode: true },
    ];
    
    const rate = getQuantitativeActivationRate(physicsArray);
    
    expect(rate).toBeCloseTo(66.67, 1);
  });
});
