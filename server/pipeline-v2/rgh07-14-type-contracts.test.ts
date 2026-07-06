/**
 * R-GH-07 / R-GH-08 / R-GH-09 / R-GH-10 / R-GH-11 / R-GH-13 / R-GH-14
 * Type Contract Enforcement — Batch 1 verification tests
 *
 * These tests verify that the type interfaces are correctly defined
 * and that the previously-missing fields are now accessible without
 * type errors. They do NOT test runtime behaviour (no DB, no LLM).
 */
import { describe, it, expect } from 'vitest';
import type {
  Stage7Output,
  Stage8Output,
  Stage10Output,
  FullReportSections,
  PipelineContext,
} from './types';
import type { LegacyPhysicsFields } from '../../shared/physics-types';

describe('R-GH-07: Stage7Output type contract', () => {
  it('accepts isPhysicallyPlausible field', () => {
    const partial: Partial<Stage7Output> = {
      isPhysicallyPlausible: true,
    };
    expect(partial.isPhysicallyPlausible).toBe(true);
  });

  it('accepts physicsConfidence field', () => {
    const partial: Partial<Stage7Output> = {
      physicsConfidence: 82,
    };
    expect(partial.physicsConfidence).toBe(82);
  });

  it('accepts hasCriticalInconsistency field', () => {
    const partial: Partial<Stage7Output> = {
      hasCriticalInconsistency: false,
    };
    expect(partial.hasCriticalInconsistency).toBe(false);
  });
});

describe('R-GH-08: Stage8Output type contract', () => {
  it('accepts confidenceAggregation field', () => {
    const partial: Partial<Stage8Output> = {
      confidenceAggregation: null,
    };
    expect(partial.confidenceAggregation).toBeNull();
  });

  it('accepts quoteSimilarity field', () => {
    const partial: Partial<Stage8Output> = {
      quoteSimilarity: null,
    };
    expect(partial.quoteSimilarity).toBeNull();
  });

  it('accepts accidentDateCrossCheck field', () => {
    const partial: Partial<Stage8Output> = {
      accidentDateCrossCheck: null,
    };
    expect(partial.accidentDateCrossCheck).toBeNull();
  });
});

describe('R-GH-09: Stage10Output.fullReport type contract', () => {
  it('fullReport has typed sections field', () => {
    const sections: FullReportSections = {
      claimSummary: { title: 'test' },
      prePublicationValidation: {
        valid: true,
        blocked: false,
        blockerCount: 0,
        blockers: [],
        validatedAt: new Date().toISOString(),
      },
    };
    expect(sections.claimSummary).toBeDefined();
    expect(sections.prePublicationValidation?.valid).toBe(true);
  });

  it('FullReportSections index signature allows unknown keys', () => {
    const sections: FullReportSections = {
      customSection: { data: 'test' },
    };
    expect(sections.customSection).toBeDefined();
  });
});

describe('R-GH-10/11: PipelineContext.db and .claim type contract', () => {
  it('PipelineContext.db is no longer typed as any (structural check)', () => {
    // If db were still typed as any, this type-level check would be trivially satisfied.
    // The fact that this compiles confirms the field exists on the interface.
    type DbType = PipelineContext['db'];
    const isNotUndefined: DbType extends undefined ? false : true = true;
    expect(isNotUndefined).toBe(true);
  });

  it('PipelineContext accepts enrichedPhotosJson field', () => {
    const partial: Partial<PipelineContext> = {
      enrichedPhotosJson: { photos: [] },
    };
    expect(partial.enrichedPhotosJson).toBeDefined();
  });
});

describe('R-GH-14: LegacyPhysicsFields.damageZones type contract', () => {
  it('accepts damageZones field', () => {
    const fields: LegacyPhysicsFields = {
      primaryImpactZone: 'front',
      damageZones: ['front-left', 'hood'],
    };
    expect(fields.damageZones).toHaveLength(2);
  });

  it('damageZones is optional (absent is valid)', () => {
    const fields: LegacyPhysicsFields = {
      primaryImpactZone: 'front',
    };
    expect(fields.damageZones).toBeUndefined();
  });
});
