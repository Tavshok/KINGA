/**
 * speedInferenceEnsemble.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the multi-method speed inference ensemble.
 *
 * Key regression tests:
 * 1. M1 uses vision crush depth (MEDIUM confidence) when no document crush depth
 * 2. M1 uses document crush depth (HIGH confidence) when available (priority)
 * 3. M1 falls back to inferred (LOW, excluded) when neither vision nor doc available
 * 4. Vision crush depth feeds M1 into the consensus (weight > 0)
 * 5. M5 runs when visionCrushDepthM is available
 */

import { describe, it, expect } from 'vitest';
import { runSpeedInferenceEnsemble } from './pipeline-v2/speedInferenceEnsemble';

const BASE_INPUT = {
  massKg: 1400,
  bodyType: 'sedan',
  collisionDirection: 'frontal',
  inferredCrushDepthM: 0.15,
  structuralDamage: false,
  airbagDeployment: false,
  seatbeltPretensioner: false,
};

describe('M1 Campbell — crush depth source priority', () => {
  it('uses inferred depth (LOW confidence, excluded from consensus) when no doc or vision depth', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: null,
    });
    const m1 = result.methods.find(m => m.method === 'CAMPBELL')!;
    expect(m1).toBeDefined();
    expect(m1.confidence).toBe('LOW');
    expect(m1.confidenceWeight).toBe(0);
    expect(m1.ran).toBe(false); // inferred — not counted as ran
  });

  it('uses vision crush depth (MEDIUM confidence, weight 0.55) when no document crush depth', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: 0.18, // 18 cm — above 4 cm threshold
      visionConfidenceScore: 75,
    });
    const m1 = result.methods.find(m => m.method === 'CAMPBELL')!;
    expect(m1).toBeDefined();
    expect(m1.confidence).toBe('MEDIUM');
    expect(m1.confidenceWeight).toBe(0.55);
    expect(m1.ran).toBe(true);
    expect(m1.speedKmh).not.toBeNull();
    expect(m1.basis).toContain('computer-vision extracted');
  });

  it('uses document crush depth (HIGH confidence, weight 0.80) when available', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: 0.20, // 20 cm
      visionCrushDepthM: 0.18,   // vision also present — doc takes priority
    });
    const m1 = result.methods.find(m => m.method === 'CAMPBELL')!;
    expect(m1).toBeDefined();
    expect(m1.confidence).toBe('HIGH');
    expect(m1.confidenceWeight).toBe(0.80);
    expect(m1.ran).toBe(true);
    expect(m1.basis).toContain('document-stated');
  });

  it('vision depth below 4 cm threshold falls back to inferred (too small to be reliable)', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: 0.02, // 2 cm — below 4 cm threshold
    });
    const m1 = result.methods.find(m => m.method === 'CAMPBELL')!;
    expect(m1.confidence).toBe('LOW');
    expect(m1.ran).toBe(false);
  });

  it('vision crush depth contributes to consensus (produces a consensusSpeedKmh)', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: 0.18,
      visionConfidenceScore: 70,
    });
    // With vision depth, M1 should run and contribute to consensus
    expect(result.methodsRan).toBeGreaterThanOrEqual(1);
    expect(result.consensusSpeedKmh).not.toBeNull();
  });
});

describe('M5 Vision Deformation', () => {
  it('runs when totalDeformationEnergyJ is available', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: 0.18,
      visionConfidenceScore: 80,
      totalDeformationEnergyJ: 50000, // 50 kJ — required for M5 to run
    });
    const m5 = result.methods.find(m => m.method === 'VISION_DEFORMATION')!;
    expect(m5).toBeDefined();
    expect(m5.ran).toBe(true);
    expect(m5.speedKmh).not.toBeNull();
  });

  it('does not run when visionCrushDepthM is null', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: null,
    });
    const m5 = result.methods.find(m => m.method === 'VISION_DEFORMATION')!;
    expect(m5).toBeDefined();
    expect(m5.ran).toBe(false);
  });
});

describe('M4 Deployment Threshold', () => {
  it('runs and produces a point estimate when airbag deployed', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: null,
      airbagDeployment: true,
    });
    const m4 = result.methods.find(m => m.method === 'DEPLOYMENT_THRESHOLD')!;
    expect(m4).toBeDefined();
    expect(m4.ran).toBe(true);
    // M4 is now a weighted evidence contributor (not a lower bound)
    expect(m4.isLowerBoundOnly).toBe(false);
    expect(m4.speedKmh).not.toBeNull();
  });

  it('does not run when no safety system deployed', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: null,
      airbagDeployment: false,
      seatbeltPretensioner: false,
    });
    const m4 = result.methods.find(m => m.method === 'DEPLOYMENT_THRESHOLD')!;
    expect(m4.ran).toBe(false);
  });
});

describe('Consensus with vision-only inputs', () => {
  it('produces a consensus when only vision depth is available (no doc depth, no airbag)', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: 0.22,
      visionConfidenceScore: 78,
      airbagDeployment: false,
    });
    expect(result.consensusSpeedKmh).not.toBeNull();
    expect(result.methodsRan).toBeGreaterThanOrEqual(1);
    // Overall confidence should be at least MEDIUM (M1 vision + M5 both ran)
    expect(['MEDIUM', 'HIGH']).toContain(result.overallConfidence);
  });

  it('M1 and M5 both run when vision depth and deformation energy are available', () => {
    const result = runSpeedInferenceEnsemble({
      ...BASE_INPUT,
      documentCrushDepthM: null,
      visionCrushDepthM: 0.20,
      visionConfidenceScore: 72,
      totalDeformationEnergyJ: 60000, // 60 kJ — required for M5 to run
    });
    const ranMethods = result.methods.filter(m => m.ran && !m.isLowerBoundOnly);
    expect(ranMethods.length).toBeGreaterThanOrEqual(2); // M1 + M5
  });
});
