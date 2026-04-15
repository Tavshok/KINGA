/**
 * imageClassifier.test.ts — Comprehensive tests for the Image Classification Layer
 *
 * Tests cover:
 *   - Tier 1: Heuristic scoring (text-heavy, colour variance, blur, size, source)
 *   - Quality scoring (composite score from multiple factors)
 *   - Duplicate removal (same-page, similar-size filtering)
 *   - Image selection (quality-ranked, fallback pool, diversity)
 *   - Full classification pipeline (end-to-end without LLM)
 *   - Edge cases (empty input, all document pages, all damage photos, single image)
 */

import { describe, it, expect, vi } from "vitest";
import {
  _testExports,
  classifyExtractedImages,
  selectBestImagesForVision,
  type ExtractedImageInput,
  type ClassifiedImage,
  type ClassificationResult,
} from "./imageClassifier";

const {
  computeHeuristicScore,
  computeQualityScore,
  removeDuplicates,
  HIGH_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  MIN_QUALITY_SCORE_FOR_VISION,
} = _testExports;

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeImage(overrides: Partial<ExtractedImageInput> = {}): ExtractedImageInput {
  return {
    url: `https://s3.example.com/img-${Math.random().toString(36).slice(2, 8)}.jpg`,
    width: 800,
    height: 600,
    pageNumber: 1,
    source: 'embedded_image',
    quality: {
      width: 800,
      height: 600,
      blurScore: 0.3,
      isBlurry: false,
      isTextHeavy: false,
      isUniform: false,
      colourVariance: 50,
      aspectRatio: 1.33,
      pixelArea: 480000,
      ...(overrides.quality ?? {}),
    },
    fromScannedPdf: false,
    ...overrides,
    // Re-apply quality overrides since spread above may have been overwritten
    ...(overrides.quality ? { quality: { ...makeImage().quality, ...overrides.quality } } : {}),
  };
}

function makeDamagePhoto(pageNumber = 5): ExtractedImageInput {
  return makeImage({
    pageNumber,
    source: 'embedded_image',
    quality: {
      width: 1200,
      height: 900,
      blurScore: 0.2,
      isBlurry: false,
      isTextHeavy: false,
      isUniform: false,
      colourVariance: 65,
      aspectRatio: 1.33,
      pixelArea: 1080000,
    },
  });
}

function makeDocumentPage(pageNumber = 1): ExtractedImageInput {
  return makeImage({
    pageNumber,
    source: 'page_render',
    quality: {
      width: 1654,
      height: 2339,
      blurScore: 0.1,
      isBlurry: false,
      isTextHeavy: true,
      isUniform: false,
      colourVariance: 15,
      aspectRatio: 0.71,
      pixelArea: 3868706,
    },
  });
}

function makeQuotationScan(pageNumber = 10): ExtractedImageInput {
  return makeImage({
    pageNumber,
    source: 'page_render',
    fromScannedPdf: true,
    quality: {
      width: 1654,
      height: 2339,
      blurScore: 0.15,
      isBlurry: false,
      isTextHeavy: true,
      isUniform: false,
      colourVariance: 20,
      aspectRatio: 0.71,
      pixelArea: 3868706,
    },
  });
}

function makeVehicleOverview(pageNumber = 6): ExtractedImageInput {
  return makeImage({
    pageNumber,
    source: 'embedded_image',
    quality: {
      width: 1600,
      height: 1200,
      blurScore: 0.15,
      isBlurry: false,
      isTextHeavy: false,
      isUniform: false,
      colourVariance: 45,
      aspectRatio: 1.33,
      pixelArea: 1920000,
    },
  });
}

function makeBlurryImage(pageNumber = 3): ExtractedImageInput {
  return makeImage({
    pageNumber,
    source: 'embedded_image',
    quality: {
      width: 400,
      height: 300,
      blurScore: 0.8,
      isBlurry: true,
      isTextHeavy: false,
      isUniform: false,
      colourVariance: 30,
      aspectRatio: 1.33,
      pixelArea: 120000,
    },
  });
}

function makeTinyLogo(pageNumber = 1): ExtractedImageInput {
  return makeImage({
    pageNumber,
    source: 'embedded_image',
    quality: {
      width: 80,
      height: 40,
      blurScore: 0.1,
      isBlurry: false,
      isTextHeavy: false,
      isUniform: true,
      colourVariance: 5,
      aspectRatio: 2.0,
      pixelArea: 3200,
    },
  });
}

const noopLog = (_msg: string) => {};

// ─── Tier 1: Heuristic Scoring ──────────────────────────────────────────────

describe("Tier 1: Heuristic Scoring", () => {
  it("scores text-heavy page renders as document_page with low score", () => {
    const result = computeHeuristicScore(makeDocumentPage());
    expect(result.score).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    expect(result.likelyCategory).toBe("document_page");
  });

  it("scores embedded images with high colour variance as damage_photo candidates", () => {
    const result = computeHeuristicScore(makeDamagePhoto());
    expect(result.score).toBeGreaterThan(HIGH_CONFIDENCE_THRESHOLD);
    expect(result.likelyCategory).toBe("damage_photo");
  });

  it("scores blurry images lower", () => {
    const sharp = computeHeuristicScore(makeDamagePhoto());
    const blurry = computeHeuristicScore(makeBlurryImage());
    expect(blurry.score).toBeLessThan(sharp.score);
  });

  it("scores tiny logos/icons with very low score (not damage photos)", () => {
    const result = computeHeuristicScore(makeTinyLogo());
    expect(result.score).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    // Tiny uniform images may classify as document_page or other — either is fine
    // The key is they are NOT classified as damage_photo
    expect(result.likelyCategory).not.toBe("damage_photo");
  });

  it("scores uniform images lower (likely backgrounds or blank areas)", () => {
    const uniform = makeImage({
      quality: {
        width: 800, height: 600, blurScore: 0.2, isBlurry: false,
        isTextHeavy: false, isUniform: true, colourVariance: 3,
        aspectRatio: 1.33, pixelArea: 480000,
      },
    });
    const result = computeHeuristicScore(uniform);
    expect(result.score).toBeLessThan(0.5);
  });

  it("gives page renders a lower base score than embedded images", () => {
    const embedded = computeHeuristicScore(makeImage({ source: 'embedded_image' }));
    const pageRender = computeHeuristicScore(makeImage({ source: 'page_render' }));
    expect(embedded.score).toBeGreaterThan(pageRender.score);
  });

  it("returns score between 0 and 1", () => {
    const images = [
      makeDocumentPage(), makeDamagePhoto(), makeBlurryImage(),
      makeTinyLogo(), makeVehicleOverview(), makeQuotationScan(),
    ];
    for (const img of images) {
      const result = computeHeuristicScore(img);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it("always provides a reasoning string", () => {
    const images = [makeDocumentPage(), makeDamagePhoto(), makeBlurryImage()];
    for (const img of images) {
      const result = computeHeuristicScore(img);
      expect(result.reasoning).toBeTruthy();
      expect(typeof result.reasoning).toBe("string");
    }
  });
});

// ─── Quality Scoring ────────────────────────────────────────────────────────

describe("Quality Scoring", () => {
  it("gives higher quality scores to sharp, large, high-variance images", () => {
    const good = computeQualityScore(makeDamagePhoto());
    const bad = computeQualityScore(makeBlurryImage());
    expect(good).toBeGreaterThan(bad);
  });

  it("gives low quality scores to tiny logos", () => {
    const score = computeQualityScore(makeTinyLogo());
    expect(score).toBeLessThan(MIN_QUALITY_SCORE_FOR_VISION);
  });

  it("returns score between 0 and 100", () => {
    const images = [
      makeDocumentPage(), makeDamagePhoto(), makeBlurryImage(),
      makeTinyLogo(), makeVehicleOverview(),
    ];
    for (const img of images) {
      const score = computeQualityScore(img);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("penalises text-heavy images", () => {
    const photo = computeQualityScore(makeDamagePhoto());
    const doc = computeQualityScore(makeDocumentPage());
    expect(photo).toBeGreaterThan(doc);
  });
});

// ─── Duplicate Removal ──────────────────────────────────────────────────────

describe("Duplicate Removal", () => {
  it("removes images from the same page with similar sizes", () => {
    const img1 = { ...makeImage({ pageNumber: 3, width: 800, height: 600, quality: { ...makeImage().quality, pixelArea: 480000 } }), qualityScore: 60 };
    const img2 = { ...makeImage({ pageNumber: 3, width: 810, height: 605, quality: { ...makeImage().quality, pixelArea: 490050 } }), qualityScore: 55 };
    const result = removeDuplicates([img1, img2], noopLog);
    expect(result.filtered.length).toBe(1);
  });

  it("keeps images from different pages even with similar sizes", () => {
    const img1 = { ...makeImage({ pageNumber: 3, width: 800, height: 600 }), qualityScore: 60 };
    const img2 = { ...makeImage({ pageNumber: 5, width: 800, height: 600 }), qualityScore: 60 };
    const result = removeDuplicates([img1, img2], noopLog);
    expect(result.filtered.length).toBe(2);
  });

  it("keeps images from the same page with very different sizes", () => {
    const img1 = { ...makeImage({ pageNumber: 3, width: 800, height: 600, quality: { ...makeImage().quality, pixelArea: 480000 } }), qualityScore: 60 };
    const img2 = { ...makeImage({ pageNumber: 3, width: 200, height: 150, quality: { ...makeImage().quality, pixelArea: 30000 } }), qualityScore: 30 };
    const result = removeDuplicates([img1, img2], noopLog);
    expect(result.filtered.length).toBe(2);
  });

  it("handles empty input", () => {
    const result = removeDuplicates([], noopLog);
    expect(result.filtered.length).toBe(0);
  });

  it("handles single image", () => {
    const result = removeDuplicates([{ ...makeImage(), qualityScore: 50 }], noopLog);
    expect(result.filtered.length).toBe(1);
  });

  it("keeps the higher-quality duplicate when removing", () => {
    const better = { ...makeImage({
      pageNumber: 3, width: 1200, height: 900,
      quality: { ...makeImage().quality, pixelArea: 1080000, colourVariance: 60 },
    }), qualityScore: 80 };
    const worse = { ...makeImage({
      pageNumber: 3, width: 1190, height: 895,
      quality: { ...makeImage().quality, pixelArea: 1065050, colourVariance: 20 },
    }), qualityScore: 40 };
    const result = removeDuplicates([worse, better], noopLog);
    expect(result.filtered.length).toBe(1);
    // Should keep the one with higher quality score
    expect(result.filtered[0].qualityScore).toBe(80);
  });
});

// ─── Image Selection ────────────────────────────────────────────────────────

describe("selectBestImagesForVision", () => {
  function makeClassifiedResult(
    damagePhotos: number,
    overviews: number,
    quotations: number,
    documents: number,
    fallback: number
  ): ClassificationResult {
    const makeClassified = (category: string, count: number, baseQuality: number): ClassifiedImage[] =>
      Array.from({ length: count }, (_, i) => ({
        url: `https://s3.example.com/${category}-${i}.jpg`,
        width: 800,
        height: 600,
        pageNumber: i + 1,
        source: 'embedded_image' as const,
        category: category as any,
        confidence: 0.8,
        qualityScore: baseQuality - i * 5,
        heuristicScore: 0.7,
        llmClassified: false,
        metadata: makeDamagePhoto(i + 1),
      }));

    return {
      damagePhotos: makeClassified('damage_photo', damagePhotos, 85),
      vehicleOverviews: makeClassified('vehicle_overview', overviews, 70),
      quotationImages: makeClassified('quotation_scan', quotations, 40),
      documentPages: makeClassified('document_page', documents, 30),
      fallbackPool: makeClassified('other', fallback, 50),
      summary: {
        totalInput: damagePhotos + overviews + quotations + documents + fallback,
        totalClassified: damagePhotos + overviews + quotations + documents + fallback,
        damagePhotoCount: damagePhotos,
        vehicleOverviewCount: overviews,
        quotationCount: quotations,
        documentPageCount: documents,
        fallbackCount: fallback,
        duplicatesRemoved: 0,
        llmClassifiedCount: 0,
        heuristicOnlyCount: damagePhotos + overviews + quotations + documents + fallback,
        averageConfidence: 0.8,
      },
    };
  }

  it("selects damage photos first, sorted by quality", () => {
    const classified = makeClassifiedResult(4, 2, 3, 5, 1);
    const { urls } = selectBestImagesForVision(classified);
    expect(urls.length).toBeLessThanOrEqual(6);
    // First URLs should be damage photos
    expect(urls[0]).toContain("damage_photo");
  });

  it("includes fallback images when not enough damage photos", () => {
    const classified = makeClassifiedResult(1, 0, 0, 5, 3);
    const { urls } = selectBestImagesForVision(classified);
    expect(urls.length).toBeGreaterThan(1);
  });

  it("returns empty when no suitable images exist", () => {
    const classified = makeClassifiedResult(0, 0, 0, 0, 0);
    const { urls } = selectBestImagesForVision(classified);
    expect(urls.length).toBe(0);
  });

  it("respects maxImages parameter", () => {
    const classified = makeClassifiedResult(10, 5, 3, 5, 2);
    const { urls } = selectBestImagesForVision(classified, 3);
    expect(urls.length).toBeLessThanOrEqual(3);
  });

  it("provides selection log", () => {
    const classified = makeClassifiedResult(3, 1, 2, 5, 1);
    const { selectionLog } = selectBestImagesForVision(classified);
    expect(selectionLog.length).toBeGreaterThan(0);
    expect(selectionLog.some(l => l.includes("Primary pool"))).toBe(true);
  });

  it("includes vehicle overviews as tertiary when needed", () => {
    const classified = makeClassifiedResult(0, 3, 0, 5, 0);
    const { urls } = selectBestImagesForVision(classified);
    // Should include vehicle overviews since no damage photos
    expect(urls.some(u => u.includes("vehicle_overview"))).toBe(true);
  });
});

// ─── Full Classification Pipeline (Heuristic Only) ─────────────────────────

describe("classifyExtractedImages (heuristic path)", () => {
  // Mock the LLM to avoid actual API calls
  vi.mock("../_core/llm", () => ({
    invokeLLM: vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ classifications: [] }),
        },
      }],
    }),
  }));

  it("classifies a mix of document pages and damage photos correctly", async () => {
    const images = [
      makeDocumentPage(1),
      makeDocumentPage(2),
      makeDamagePhoto(5),
      makeDamagePhoto(6),
      makeTinyLogo(1),
    ];

    const result = await classifyExtractedImages(images, noopLog);

    expect(result.summary.totalInput).toBe(5);
    expect(result.summary.totalClassified).toBe(result.summary.totalInput - result.summary.duplicatesRemoved);
    // Document pages should be classified as document_page
    expect(result.documentPages.length).toBeGreaterThanOrEqual(1);
    // Damage photos should be classified as damage_photo
    expect(result.damagePhotos.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty input gracefully", async () => {
    const result = await classifyExtractedImages([], noopLog);
    expect(result.summary.totalInput).toBe(0);
    expect(result.damagePhotos.length).toBe(0);
    expect(result.documentPages.length).toBe(0);
    expect(result.fallbackPool.length).toBe(0);
  });

  it("handles all document pages (PDF-only claim)", async () => {
    const images = [
      makeDocumentPage(1),
      makeDocumentPage(2),
      makeDocumentPage(3),
      makeQuotationScan(4),
    ];

    const result = await classifyExtractedImages(images, noopLog);

    expect(result.summary.damagePhotoCount).toBe(0);
    expect(result.summary.documentPageCount + result.summary.quotationCount).toBeGreaterThanOrEqual(2);
  });

  it("handles all damage photos", async () => {
    const images = [
      makeDamagePhoto(1),
      makeDamagePhoto(2),
      makeDamagePhoto(3),
    ];

    const result = await classifyExtractedImages(images, noopLog);

    expect(result.summary.damagePhotoCount).toBeGreaterThanOrEqual(2);
    expect(result.summary.documentPageCount).toBe(0);
  });

  it("handles single image", async () => {
    const result = await classifyExtractedImages([makeDamagePhoto(1)], noopLog);
    expect(result.summary.totalInput).toBe(1);
    expect(result.summary.totalClassified).toBe(1);
  });

  it("preserves metadata on classified images", async () => {
    const original = makeDamagePhoto(5);
    const result = await classifyExtractedImages([original], noopLog);

    const allClassified = [
      ...result.damagePhotos,
      ...result.vehicleOverviews,
      ...result.quotationImages,
      ...result.documentPages,
      ...result.fallbackPool,
    ];
    expect(allClassified.length).toBe(1);
    expect(allClassified[0].metadata).toBeDefined();
    expect(allClassified[0].url).toBe(original.url);
    expect(allClassified[0].pageNumber).toBe(5);
  });

  it("never discards images — all go to some category or fallback", async () => {
    const images = [
      makeDocumentPage(1),
      makeDamagePhoto(3),
      makeBlurryImage(5),
      makeTinyLogo(1),
      makeVehicleOverview(7),
    ];

    const result = await classifyExtractedImages(images, noopLog);

    const totalClassified =
      result.damagePhotos.length +
      result.vehicleOverviews.length +
      result.quotationImages.length +
      result.documentPages.length +
      result.fallbackPool.length;

    // Total classified should equal input minus duplicates
    expect(totalClassified).toBe(result.summary.totalInput - result.summary.duplicatesRemoved);
  });

  it("removes near-duplicate images from the same page", async () => {
    // Two images from the same page with very similar sizes
    const img1 = makeImage({
      url: 'https://s3.example.com/img-dup1.jpg',
      pageNumber: 3, width: 800, height: 600,
      quality: { ...makeImage().quality, pixelArea: 480000, colourVariance: 50 },
    });
    const img2 = makeImage({
      url: 'https://s3.example.com/img-dup2.jpg',
      pageNumber: 3, width: 810, height: 605,
      quality: { ...makeImage().quality, pixelArea: 490050, colourVariance: 50 },
    });

    const result = await classifyExtractedImages([img1, img2], noopLog);
    expect(result.summary.duplicatesRemoved).toBeGreaterThanOrEqual(1);
  });

  it("computes averageConfidence correctly", async () => {
    const images = [makeDamagePhoto(1), makeDocumentPage(2)];
    const result = await classifyExtractedImages(images, noopLog);
    expect(result.summary.averageConfidence).toBeGreaterThan(0);
    expect(result.summary.averageConfidence).toBeLessThanOrEqual(1);
  });
});

// ─── BMW 318i Scenario ──────────────────────────────────────────────────────

describe("BMW 318i Scenario: 14 page renders + 15 embedded images", () => {
  it("classifies page renders as document pages and embedded images as damage candidates", async () => {
    const images: ExtractedImageInput[] = [];

    // 14 page renders (text-heavy document pages)
    for (let i = 1; i <= 14; i++) {
      images.push(makeDocumentPage(i));
    }

    // 15 embedded images (mix of damage photos, logos, and vehicle overviews)
    for (let i = 1; i <= 10; i++) {
      images.push(makeDamagePhoto(i));
    }
    for (let i = 1; i <= 3; i++) {
      images.push(makeTinyLogo(i));
    }
    for (let i = 11; i <= 12; i++) {
      images.push(makeVehicleOverview(i));
    }

    const result = await classifyExtractedImages(images, noopLog);

    // Should have many document pages
    expect(result.summary.documentPageCount).toBeGreaterThanOrEqual(10);

    // Should have damage photos
    expect(result.summary.damagePhotoCount).toBeGreaterThanOrEqual(5);

    // Tiny logos should NOT be classified as damage photos
    const damagePhotoUrls = result.damagePhotos.map(p => p.url);
    // No tiny images should be in damage photos
    for (const dp of result.damagePhotos) {
      expect(dp.qualityScore).toBeGreaterThan(MIN_QUALITY_SCORE_FOR_VISION);
    }

    // Selection should prioritise actual damage photos
    const { urls } = selectBestImagesForVision(result);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.length).toBeLessThanOrEqual(6);
  });
});
