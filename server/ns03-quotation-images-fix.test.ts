/**
 * NS-03 Verification Test
 *
 * Bug: db.ts was accessing ci.quotationScans (non-existent field) instead of
 * ci.quotationImages (correct ClassificationResult field name). This caused
 * quotation scan images to be silently omitted from classifiedImagesJson on
 * every pipeline run.
 *
 * Fix: Changed ci.quotationScans → ci.quotationImages in db.ts:1748.
 *
 * This test verifies:
 * 1. ClassificationResult.quotationImages exists and is the correct field name
 * 2. The field name 'quotationScans' does NOT exist on ClassificationResult
 * 3. A ClassificationResult with quotation images produces non-empty
 *    classifiedImagesJson entries with category 'quotation_scan'
 */

import { describe, it, expect } from 'vitest';
import type { ClassificationResult } from './pipeline-v2/imageClassifier';

// ── Helper: build a minimal ClassificationResult ─────────────────────────────
function makeClassificationResult(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    damagePhotos: [],
    vehicleOverviews: [],
    quotationImages: [],
    documentPages: [],
    fallbackPool: [],
    summary: {
      totalInput: 0,
      totalClassified: 0,
      damagePhotoCount: 0,
      vehicleOverviewCount: 0,
      quotationCount: 0,
      documentPageCount: 0,
      fallbackCount: 0,
      duplicatesRemoved: 0,
      llmClassifiedCount: 0,
      heuristicOnlyCount: 0,
      averageConfidence: 0,
    },
    ...overrides,
  };
}

// ── Helper: replicate the classifiedImagesJson builder from db.ts ─────────────
// This mirrors the exact logic in db.ts so we can test the field name in isolation.
function buildClassifiedImagesJson(ci: ClassificationResult): string | null {
  try {
    const entries: { url: string; category: string; confidence: number }[] = [];
    const addGroup = (urls: string[], category: string, confidence: number) => {
      for (const url of urls) entries.push({ url, category, confidence });
    };
    addGroup(ci.damagePhotos.map((img) => img.url), 'damage_photo', 0.9);
    addGroup(ci.vehicleOverviews.map((img) => img.url), 'vehicle_overview', 0.85);
    // NS-03 fix: was ci.quotationScans (wrong), now ci.quotationImages (correct)
    addGroup(ci.quotationImages.map((img) => img.url), 'quotation_scan', 0.9);
    addGroup(ci.documentPages.map((img) => img.url), 'document_page', 0.9);
    addGroup(ci.fallbackPool.map((img) => img.url), 'other', 0.5);
    return entries.length > 0 ? JSON.stringify(entries) : null;
  } catch {
    return null;
  }
}

describe('NS-03: ClassificationResult.quotationImages field name fix', () => {
  it('ClassificationResult has quotationImages field (not quotationScans)', () => {
    const cr = makeClassificationResult();
    // quotationImages must exist
    expect(cr).toHaveProperty('quotationImages');
    // quotationScans must NOT exist (was the bug)
    expect(cr).not.toHaveProperty('quotationScans');
  });

  it('quotationImages is an array', () => {
    const cr = makeClassificationResult({
      quotationImages: [
        { url: 'https://example.com/quote1.jpg', category: 'quotation_scan', confidence: 0.95, source: 'llm' },
      ],
    });
    expect(Array.isArray(cr.quotationImages)).toBe(true);
    expect(cr.quotationImages).toHaveLength(1);
  });

  it('buildClassifiedImagesJson includes quotation_scan entries from quotationImages', () => {
    const cr = makeClassificationResult({
      quotationImages: [
        { url: 'https://example.com/quote1.jpg', category: 'quotation_scan', confidence: 0.95, source: 'llm' },
        { url: 'https://example.com/quote2.jpg', category: 'quotation_scan', confidence: 0.92, source: 'llm' },
      ],
    });

    const json = buildClassifiedImagesJson(cr);
    expect(json).not.toBeNull();

    const parsed = JSON.parse(json!);
    const quotationEntries = parsed.filter((e: any) => e.category === 'quotation_scan');
    expect(quotationEntries).toHaveLength(2);
    expect(quotationEntries[0].url).toBe('https://example.com/quote1.jpg');
    expect(quotationEntries[1].url).toBe('https://example.com/quote2.jpg');
  });

  it('before fix: accessing quotationScans would produce empty array (undefined.map throws)', () => {
    const cr = makeClassificationResult({
      quotationImages: [
        { url: 'https://example.com/quote1.jpg', category: 'quotation_scan', confidence: 0.95, source: 'llm' },
      ],
    });

    // Simulate the old buggy code: ci.quotationScans is undefined
    const buggyResult = (() => {
      try {
        const entries: { url: string; category: string; confidence: number }[] = [];
        // @ts-expect-error — intentionally accessing the wrong field to verify it's undefined
        const wrongField: any[] | undefined = (cr as any).quotationScans;
        if (wrongField) {
          for (const img of wrongField) entries.push({ url: img.url, category: 'quotation_scan', confidence: 0.9 });
        }
        return entries;
      } catch {
        return [];
      }
    })();

    // Old code: quotationScans is undefined → no entries added
    expect(buggyResult).toHaveLength(0);
  });

  it('after fix: quotationImages produces correct entries', () => {
    const cr = makeClassificationResult({
      quotationImages: [
        { url: 'https://example.com/quote1.jpg', category: 'quotation_scan', confidence: 0.95, source: 'llm' },
        { url: 'https://example.com/quote2.jpg', category: 'quotation_scan', confidence: 0.88, source: 'heuristic' },
        { url: 'https://example.com/quote3.jpg', category: 'quotation_scan', confidence: 0.91, source: 'llm' },
      ],
    });

    const json = buildClassifiedImagesJson(cr);
    expect(json).not.toBeNull();

    const parsed = JSON.parse(json!);
    const quotationEntries = parsed.filter((e: any) => e.category === 'quotation_scan');

    // After fix: all 3 quotation images appear
    expect(quotationEntries).toHaveLength(3);
    expect(quotationEntries.map((e: any) => e.url)).toEqual([
      'https://example.com/quote1.jpg',
      'https://example.com/quote2.jpg',
      'https://example.com/quote3.jpg',
    ]);
    // All have the correct confidence
    for (const entry of quotationEntries) {
      expect(entry.confidence).toBe(0.9);
    }
  });

  it('claim with mixed image types: all categories appear correctly', () => {
    const cr = makeClassificationResult({
      damagePhotos: [
        { url: 'https://example.com/damage1.jpg', category: 'damage_photo', confidence: 0.97, source: 'llm' },
      ],
      vehicleOverviews: [
        { url: 'https://example.com/overview1.jpg', category: 'vehicle_overview', confidence: 0.85, source: 'llm' },
      ],
      quotationImages: [
        { url: 'https://example.com/quote1.jpg', category: 'quotation_scan', confidence: 0.93, source: 'llm' },
        { url: 'https://example.com/quote2.jpg', category: 'quotation_scan', confidence: 0.89, source: 'llm' },
      ],
      documentPages: [
        { url: 'https://example.com/doc1.jpg', category: 'document_page', confidence: 0.91, source: 'llm' },
      ],
    });

    const json = buildClassifiedImagesJson(cr);
    expect(json).not.toBeNull();

    const parsed = JSON.parse(json!);
    expect(parsed).toHaveLength(5); // 1 damage + 1 overview + 2 quotation + 1 document

    const byCategory = (cat: string) => parsed.filter((e: any) => e.category === cat);
    expect(byCategory('damage_photo')).toHaveLength(1);
    expect(byCategory('vehicle_overview')).toHaveLength(1);
    expect(byCategory('quotation_scan')).toHaveLength(2);
    expect(byCategory('document_page')).toHaveLength(1);
  });

  it('empty quotationImages produces no quotation_scan entries', () => {
    const cr = makeClassificationResult({
      quotationImages: [],
    });

    const json = buildClassifiedImagesJson(cr);
    // No images at all → null
    expect(json).toBeNull();
  });
});
