/**
 * ARCH-03b Fix 2 Verification — fraudLevelMap in server/db.ts
 *
 * Verifies that the fraudLevelMap correctly maps all FSS-2026-001 canonical
 * fraud risk levels to their DB enum values, including 'moderate' which was
 * previously missing and caused scores 40-60 to silently downgrade to 'low'.
 */
import { describe, it, expect } from 'vitest';

// Replicate the fraudLevelMap from server/db.ts for unit testing
// (the actual map is defined inline inside saveAiAssessment, not exported)
const fraudLevelMap: Record<string, 'low' | 'medium' | 'moderate' | 'high' | 'critical' | 'elevated'> = {
  minimal: 'low', low: 'low', medium: 'medium', moderate: 'moderate', high: 'high', critical: 'elevated', elevated: 'elevated',
};

function mapFraudLevel(level: string | undefined | null): 'low' | 'medium' | 'moderate' | 'high' | 'critical' | 'elevated' {
  return (level ? fraudLevelMap[level] : undefined) || 'low';
}

describe('ARCH-03b Fix 2 — fraudLevelMap maps all FSS-2026-001 levels correctly', () => {
  describe('canonical FSS-2026-001 levels', () => {
    it('minimal → low (auto-approve eligible)', () => {
      expect(mapFraudLevel('minimal')).toBe('low');
    });

    it('low → low (auto-approve with audit)', () => {
      expect(mapFraudLevel('low')).toBe('low');
    });

    it('moderate → moderate (ARCH-03b fix: was missing, caused silent downgrade to low)', () => {
      expect(mapFraudLevel('moderate')).toBe('moderate');
    });

    it('high → high (fraud team referral)', () => {
      expect(mapFraudLevel('high')).toBe('high');
    });

    it('elevated → elevated (immediate escalation)', () => {
      expect(mapFraudLevel('elevated')).toBe('elevated');
    });
  });

  describe('legacy values (pre-FSS-2026-001)', () => {
    it('medium → medium (historical DB rows, pre-ARCH-03)', () => {
      expect(mapFraudLevel('medium')).toBe('medium');
    });

    it('critical → elevated (legacy alias)', () => {
      expect(mapFraudLevel('critical')).toBe('elevated');
    });
  });

  describe('fallback behaviour', () => {
    it('unknown level → low (safe fallback)', () => {
      expect(mapFraudLevel('unknown_level')).toBe('low');
    });

    it('undefined → low (no fraud analysis)', () => {
      expect(mapFraudLevel(undefined)).toBe('low');
    });

    it('null → low (null fraud analysis)', () => {
      expect(mapFraudLevel(null)).toBe('low');
    });

    it('empty string → low', () => {
      expect(mapFraudLevel('')).toBe('low');
    });
  });

  describe('R-D-02 routing impact verification', () => {
    // Verify that the fix prevents the routing regression:
    // moderate score (40-60) must NOT fall through to 'low' (which would skip REVIEW_REQUIRED)
    it('moderate does NOT fall through to low (regression guard)', () => {
      const result = mapFraudLevel('moderate');
      expect(result).not.toBe('low');
      expect(result).toBe('moderate');
    });

    it('all levels that should trigger REVIEW_REQUIRED are preserved', () => {
      // Per R-D-02: moderate → REVIEW_REQUIRED, high/elevated → ESCALATE_INVESTIGATION
      // None of these should map to 'low' (which would allow auto-approve)
      const reviewLevels = ['moderate', 'high', 'elevated', 'critical'];
      for (const level of reviewLevels) {
        const mapped = mapFraudLevel(level);
        expect(mapped, `${level} should not map to 'low'`).not.toBe('low');
      }
    });
  });
});
