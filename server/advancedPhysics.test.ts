/**
 * Advanced Physics Formulas Tests
 * 
 * Tests for:
 * - Conservation of Momentum
 * - Friction Analysis (Skid Marks)
 * - Coefficient of Restitution
 * - Rollover Threshold Analysis
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeMomentumConservation,
  analyzeSkidMarkFriction,
  analyzeRestitution,
  analyzeRolloverThreshold
} from './accidentPhysics';

describe('Conservation of Momentum Analysis', () => {
  
  it('should detect staged rear-end collision with impossible momentum', () => {
    const result = analyzeMomentumConservation(
      { mass: 1500, reportedSpeed: 80, postCollisionSpeed: 70 }, // Moving vehicle barely slows
      { mass: 1500, reportedSpeed: 0, postCollisionSpeed: 5 }, // Stationary vehicle barely moves
      'rear-end'
    );
    
    expect(result.conservationViolation).toBe(true);
    expect(result.stagedAccidentProbability).toBeGreaterThan(40);
    expect(result.fraudIndicators.length).toBeGreaterThan(0);
  });
  
  it('should validate legitimate rear-end collision', () => {
    const result = analyzeMomentumConservation(
      { mass: 1500, reportedSpeed: 60, postCollisionSpeed: 20 },
      { mass: 1500, reportedSpeed: 0, postCollisionSpeed: 40 },
      'rear-end'
    );
    
    expect(result.conservationViolation).toBe(false);
    expect(result.stagedAccidentProbability).toBeLessThan(30);
  });
  
  it('should detect suspicious similar speeds in rear-end collision', () => {
    const result = analyzeMomentumConservation(
      { mass: 1500, reportedSpeed: 50 },
      { mass: 1500, reportedSpeed: 48 }, // Suspiciously similar
      'rear-end'
    );
    
    expect(result.fraudIndicators).toContain(
      expect.stringContaining('Suspiciously similar vehicle speeds')
    );
  });
  
  it('should handle head-on collision', () => {
    const result = analyzeMomentumConservation(
      { mass: 1500, reportedSpeed: 80 },
      { mass: 1500, reportedSpeed: 60 },
      'head-on'
    );
    
    expect(result.velocityInconsistency.vehicle1.calculated).toBeLessThan(
      result.velocityInconsistency.vehicle1.reported
    );
    expect(result.velocityInconsistency.vehicle2).toBeDefined();
  });
  
  it('should handle single vehicle collision', () => {
    const result = analyzeMomentumConservation(
      { mass: 1500, reportedSpeed: 60 }
    );
    
    expect(result.velocityInconsistency.vehicle1.calculated).toBeLessThan(
      result.velocityInconsistency.vehicle1.reported
    );
    expect(result.velocityInconsistency.vehicle2).toBeUndefined();
  });
});

describe('Friction Analysis (Skid Marks)', () => {
  
  it('should detect speed fraud from skid mark length (dry road)', () => {
    // 5-meter skid marks on dry road (μ=0.7) → ~29 km/h
    const result = analyzeSkidMarkFriction(5, 'dry', 80);
    
    expect(result.estimatedSpeedFromSkid).toBeCloseTo(29, 0);
    expect(result.speedDiscrepancy).toBeCloseTo(51, 0);
    expect(result.fraudIndicator).toBe(true);
  });
  
  it('should validate legitimate speed on dry road', () => {
    // 20-meter skid marks on dry road → ~58 km/h
    const result = analyzeSkidMarkFriction(20, 'dry', 60);
    
    expect(result.estimatedSpeedFromSkid).toBeCloseTo(58, 0);
    expect(result.fraudIndicator).toBe(false);
  });
  
  it('should adjust for wet road conditions', () => {
    // Same 20-meter skid marks on wet road (μ=0.4) → ~44 km/h
    const result = analyzeSkidMarkFriction(20, 'wet', 45);
    
    expect(result.estimatedSpeedFromSkid).toBeCloseTo(44, 0);
    expect(result.coefficientOfFriction).toBe(0.4);
    expect(result.fraudIndicator).toBe(false);
  });
  
  it('should handle icy conditions', () => {
    // 10-meter skid marks on ice (μ=0.15) → ~17 km/h
    const result = analyzeSkidMarkFriction(10, 'icy', 20);
    
    expect(result.estimatedSpeedFromSkid).toBeCloseTo(17, 0);
    expect(result.coefficientOfFriction).toBe(0.15);
  });
  
  it('should use conservative estimate for unknown conditions', () => {
    const result = analyzeSkidMarkFriction(15, 'unknown', 50);
    
    expect(result.coefficientOfFriction).toBe(0.6);
    expect(result.roadCondition).toBe('unknown');
  });
});

describe('Coefficient of Restitution Analysis', () => {
  
  it('should detect impossible rollout distance', () => {
    // 80 km/h collision → max ~10m rollout, claimed 50m
    const result = analyzeRestitution(80, 50, 1500, 'dry');
    
    expect(result.trajectoryImpossible).toBe(true);
    expect(result.fraudIndicators.length).toBeGreaterThan(0);
    expect(result.fraudIndicators[0]).toContain('exceeds physics limit');
  });
  
  it('should validate legitimate rollout distance', () => {
    // 60 km/h collision → ~6m rollout expected
    const result = analyzeRestitution(60, 8, 1500, 'dry');
    
    expect(result.trajectoryImpossible).toBe(false);
    expect(result.calculatedRolloutDistance).toBeCloseTo(6, 0);
  });
  
  it('should detect suspiciously short rollout (intentional braking)', () => {
    // 80 km/h collision but only 2m rollout (should be ~10m)
    const result = analyzeRestitution(80, 2, 1500, 'dry');
    
    expect(result.fraudIndicators).toContain(
      expect.stringContaining('Suspiciously short rollout')
    );
  });
  
  it('should adjust for wet road conditions', () => {
    // Wet road (μ=0.4) allows longer rollout
    const resultDry = analyzeRestitution(60, 15, 1500, 'dry');
    const resultWet = analyzeRestitution(60, 15, 1500, 'wet');
    
    expect(resultWet.calculatedRolloutDistance).toBeGreaterThan(
      resultDry.calculatedRolloutDistance
    );
  });
  
  it('should calculate post-collision velocity correctly', () => {
    // e=0.2 for typical collision
    const result = analyzeRestitution(100, 10, 1500, 'dry');
    
    expect(result.coefficientOfRestitution).toBe(0.2);
    expect(result.postCollisionVelocity).toBeCloseTo(20, 0); // 100 * 0.2
  });
});

describe('Rollover Threshold Analysis', () => {
  
  it('should detect impossible sedan rollover on flat road', () => {
    // Sedan requires ~80 km/h to rollover on flat road
    const result = analyzeRolloverThreshold('sedan', 40, 'flat');
    
    expect(result.rolloverImpossible).toBe(true);
    expect(result.fraudIndicators).toContain(
      expect.stringContaining('Rollover impossible at 40 km/h')
    );
  });
  
  it('should validate SUV rollover at high speed', () => {
    // SUV can rollover at lower speeds due to higher center of mass
    const result = analyzeRolloverThreshold('suv', 80, 'flat');
    
    expect(result.rolloverPossible).toBe(true);
    expect(result.rolloverImpossible).toBe(false);
  });
  
  it('should adjust threshold for embankment', () => {
    // Embankment reduces rollover threshold by 40%
    const resultFlat = analyzeRolloverThreshold('sedan', 50, 'flat');
    const resultEmbankment = analyzeRolloverThreshold('sedan', 50, 'embankment');
    
    expect(resultEmbankment.rolloverThresholdSpeed).toBeLessThan(
      resultFlat.rolloverThresholdSpeed
    );
    expect(resultEmbankment.rolloverPossible).toBe(true);
  });
  
  it('should recognize low-profile vehicles are harder to rollover', () => {
    // Sports car has low center of mass
    const result = analyzeRolloverThreshold('sports', 60, 'flat');
    
    expect(result.centerOfMassHeight).toBeLessThan(0.5);
    expect(result.rolloverThresholdSpeed).toBeGreaterThan(90);
  });
  
  it('should calculate correct threshold for truck', () => {
    // Truck has high center of mass, easier to rollover
    const result = analyzeRolloverThreshold('truck', 70, 'flat');
    
    expect(result.centerOfMassHeight).toBeGreaterThan(0.7);
    expect(result.rolloverThresholdSpeed).toBeLessThan(80);
  });
  
  it('should handle banked road (harder to rollover)', () => {
    const result = analyzeRolloverThreshold('suv', 60, 'banked');
    
    expect(result.rolloverThresholdSpeed).toBeGreaterThan(70); // Increased threshold
    expect(result.rolloverPossible).toBe(false);
  });
});

describe('Integration: Multi-Formula Fraud Detection', () => {
  
  it('should detect staged accident with multiple physics violations', () => {
    // Scenario: Claimed 80 km/h rear-end collision
    // - Momentum: Vehicles barely moved
    // - Skid marks: Only 5m (indicates 29 km/h)
    // - Rollout: Only 3m (indicates low speed)
    
    const momentum = analyzeMomentumConservation(
      { mass: 1500, reportedSpeed: 80, postCollisionSpeed: 75 },
      { mass: 1500, reportedSpeed: 0, postCollisionSpeed: 5 },
      'rear-end'
    );
    
    const friction = analyzeSkidMarkFriction(5, 'dry', 80);
    const restitution = analyzeRestitution(80, 3, 1500, 'dry');
    
    // All three physics analyses should flag fraud
    expect(momentum.conservationViolation).toBe(true);
    expect(friction.fraudIndicator).toBe(true);
    expect(restitution.fraudIndicators.length).toBeGreaterThan(0);
    
    // Combined fraud probability should be very high
    const combinedFraudScore = 
      (momentum.stagedAccidentProbability + 
       (friction.fraudIndicator ? 30 : 0) +
       (restitution.trajectoryImpossible ? 30 : 0)) / 3;
    
    expect(combinedFraudScore).toBeGreaterThan(50);
  });
  
  it('should validate legitimate high-speed collision', () => {
    // Scenario: Legitimate 100 km/h frontal collision
    // - Momentum: Significant deceleration
    // - Skid marks: 40m (consistent with 100 km/h)
    // - Rollout: 15m (consistent with high speed)
    
    const momentum = analyzeMomentumConservation(
      { mass: 1500, reportedSpeed: 100, postCollisionSpeed: 20 }
    );
    
    const friction = analyzeSkidMarkFriction(40, 'dry', 100);
    const restitution = analyzeRestitution(100, 15, 1500, 'dry');
    
    // None should flag fraud
    expect(momentum.conservationViolation).toBe(false);
    expect(friction.fraudIndicator).toBe(false);
    expect(restitution.trajectoryImpossible).toBe(false);
  });
});
