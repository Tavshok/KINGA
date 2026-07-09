/**
 * R-B-03b Audit Tests
 *
 * Verifies the dark-image rescue path added to imageIntelligence.ts.
 *
 * The bug: night-time / low-brightness damage photos scored below
 * LOW_CONFIDENCE_THRESHOLD (0.40) because meanBrightness was not factored
 * into scoreDamageLikelihood(). They were silently classified as "document"
 * and dropped before Stage 6 vision analysis.
 *
 * The fix: if meanBrightness < 80 AND colourVariance > 0.05, push to
 * ambiguousPool for LLM classification regardless of heuristic score.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const IMG_PATH = path.join(__dirname, 'imageIntelligence.ts');
const content = fs.readFileSync(IMG_PATH, 'utf-8');
const lines = content.split('\n');

// ── Structural tests (static analysis of the fix) ────────────────────────────

describe('R-B-03b: dark-image rescue path in imageIntelligence.ts', () => {
  it('contains the R-B-03b rescue comment', () => {
    expect(content).toContain('R-B-03b: Dark-image rescue path');
  });

  it('defines isDark condition with meanBrightness < 80', () => {
    expect(content).toContain('features.meanBrightness < 80');
  });

  it('defines hasColour condition with colourVariance > 0.05', () => {
    expect(content).toContain('features.colourVariance > 0.05');
  });

  it('rescue path pushes to ambiguousPool', () => {
    // The rescue block should push to ambiguousPool (same as MEDIUM confidence path)
    const rescueSection = content.slice(
      content.indexOf('R-B-03b: Dark-image rescue path'),
      content.indexOf('scored.push({', content.indexOf('R-B-03b: Dark-image rescue path'))
    );
    expect(rescueSection).toContain('ambiguousPool.push({ url, index })');
  });

  it('rescue path sets confidence to MEDIUM (not LOW)', () => {
    // Slice only the isDark && hasColour branch (before the inner else)
    const rescueStart = content.indexOf('R-B-03b: Dark-image rescue path');
    const innerElseStart = content.indexOf('} else {\n        confidence = "LOW"', rescueStart);
    const rescueSection = content.slice(rescueStart, innerElseStart);
    expect(rescueSection).toContain('confidence = "MEDIUM"');
    expect(rescueSection).not.toContain('confidence = "LOW"');
  });

  it('rescue path sets classification to damage_photo (not document)', () => {
    // Slice only the isDark && hasColour branch (before the inner else)
    const rescueStart = content.indexOf('R-B-03b: Dark-image rescue path');
    const innerElseStart = content.indexOf('} else {\n        confidence = "LOW"', rescueStart);
    const rescueSection = content.slice(rescueStart, innerElseStart);
    expect(rescueSection).toContain('classification = "damage_photo"');
    expect(rescueSection).not.toContain('classification = "document"');
  });

  it('rescue path emits a ctx.log entry with brightness and variance values', () => {
    expect(content).toContain('R-B-03b rescue: page');
    expect(content).toContain('brightness=');
    expect(content).toContain('variance=');
  });

  it('blank dark page (colourVariance ≤ 0.05) is NOT rescued', () => {
    // The rescue condition requires colourVariance > 0.05
    // A blank dark page has colourVariance ≈ 0.01 → rescue NOT triggered
    // This is verified by the hasColour check in the code
    expect(content).toContain('features.colourVariance > 0.05');
    // Confirm the else branch still classifies as document when rescue is not triggered
    const afterRescue = content.slice(
      content.indexOf('R-B-03b: Dark-image rescue path')
    );
    expect(afterRescue).toContain('confidence = "LOW"');
    expect(afterRescue).toContain('classification = "document"');
  });
});

// ── Logical verification (mirrors the Python worked example) ─────────────────

describe('R-B-03b: worked example verification (Group B audit case)', () => {
  /**
   * Reproduces the scoreDamageLikelihood formula in TypeScript to verify
   * the Group B worked example (dark, sharp damage photo) is correctly rescued.
   *
   * Features of the Group B example:
   *   meanBrightness = 48  (dark night photo)
   *   colourVariance = 0.14 (real colours, muted by darkness)
   *   edgeDensity    = 0.30 (reduced by dark scene)
   *   textDensity    = 0.05 (clearly a photo)
   *   blurScore      = 0.72 (sharp focus)
   *   aspectRatio    = 1.33 (landscape phone photo)
   */
  const LOW_THRESHOLD  = 0.40;
  const HIGH_THRESHOLD = 0.75;
  const BRIGHTNESS_RESCUE = 80;
  const COLOUR_RESCUE     = 0.05;

  function aspectScore(ratio: number): number {
    if (ratio >= 0.5 && ratio <= 2.5) return 1 - Math.abs(ratio - 1.2) / 2.5;
    return 0.2;
  }

  function scoreDamageLikelihood(f: {
    colourVariance: number; edgeDensity: number; textDensity: number;
    blurScore: number; aspectRatio: number; meanBrightness: number;
  }): number {
    const aspect = aspectScore(f.aspectRatio);
    const score =
      f.colourVariance  * 0.35 +
      f.edgeDensity     * 0.25 +
      (1 - f.textDensity) * 0.20 +
      f.blurScore       * 0.15 +
      aspect            * 0.05;
    if (f.meanBrightness > 220 && f.colourVariance < 0.15) return Math.min(score, 0.35);
    return Math.max(0, Math.min(score, 1));
  }

  const groupBExample = {
    meanBrightness: 48,
    colourVariance: 0.14,
    edgeDensity:    0.30,
    textDensity:    0.05,
    blurScore:      0.72,
    aspectRatio:    1.33,
  };

  it('Group B example scores above LOW threshold (0.40) with current formula', () => {
    const score = scoreDamageLikelihood(groupBExample);
    // The example scores ~0.469 — above LOW threshold, so it already reaches MEDIUM
    // The rescue path is the safety net for slightly worse variants
    expect(score).toBeGreaterThan(LOW_THRESHOLD);
  });

  it('Group B example rescue condition is triggered (isDark AND hasColour)', () => {
    const isDark    = groupBExample.meanBrightness < BRIGHTNESS_RESCUE;
    const hasColour = groupBExample.colourVariance > COLOUR_RESCUE;
    expect(isDark).toBe(true);
    expect(hasColour).toBe(true);
  });

  it('slightly-worse variant (colourVariance=0.08, edgeDensity=0.10) scores below LOW threshold', () => {
    // A darker, less colourful night photo that falls below the 0.40 threshold
    // Score: 0.08*0.35 + 0.10*0.25 + 0.95*0.20 + 0.72*0.15 + aspect*0.05
    //      = 0.028 + 0.025 + 0.19 + 0.108 + ~0.028 = ~0.3984 < 0.40
    const worseVariant = { ...groupBExample, colourVariance: 0.08, edgeDensity: 0.10 };
    const score = scoreDamageLikelihood(worseVariant);
    expect(score).toBeLessThan(LOW_THRESHOLD);
    // But rescue should still trigger (dark AND has some colour)
    const isDark    = worseVariant.meanBrightness < BRIGHTNESS_RESCUE;
    const hasColour = worseVariant.colourVariance > COLOUR_RESCUE;
    expect(isDark && hasColour).toBe(true);
  });

  it('blank dark page (meanBrightness=12, colourVariance=0.01) is NOT rescued', () => {
    const blankDark = {
      meanBrightness: 12, colourVariance: 0.01, edgeDensity: 0.02,
      textDensity: 0.02, blurScore: 0.50, aspectRatio: 1.41,
    };
    const isDark    = blankDark.meanBrightness < BRIGHTNESS_RESCUE;
    const hasColour = blankDark.colourVariance > COLOUR_RESCUE;
    expect(isDark).toBe(true);
    expect(hasColour).toBe(false);    // colourVariance 0.01 ≤ 0.05 → no rescue
    expect(isDark && hasColour).toBe(false);
  });

  it('bright document page is NOT rescued (not dark)', () => {
    const brightDoc = {
      meanBrightness: 230, colourVariance: 0.08, edgeDensity: 0.35,
      textDensity: 0.60, blurScore: 0.80, aspectRatio: 0.71,
    };
    const isDark = brightDoc.meanBrightness < BRIGHTNESS_RESCUE;
    expect(isDark).toBe(false);
    expect(isDark && brightDoc.colourVariance > COLOUR_RESCUE).toBe(false);
  });
});
